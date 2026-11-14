#!/usr/bin/env python3
"""
Fill in gguf_repo / gguf_shards on models.json rows by finding and verifying
the Hugging Face repo that holds each row's GGUF.

A repo counts as verified for a row only when it holds a complete GGUF for the
row's quantization (shards summed, mmproj/MTP/draft/dspark files ignored) whose
size matches weight_gb within --tolerance (2% by default). Older rows were
recorded in decimal GB rather than GiB, so a decimal match also counts and is
reported as such. Rows with no verified repo get gguf_repo: null, so the site
shows no run command for them. Nothing is guessed.

On top of the size match the script checks the commands the site will print:
  - llama.cpp: simulates "llama-server -hf repo:TAG" file selection and
    requires it to land on the verified file set;
  - Ollama: asks the Hub's Ollama registry endpoint for repo:TAG and requires
    its model layer to be the verified file (single-file GGUFs only; the Hub
    refuses sharded GGUFs for Ollama).
A candidate that fails either check is skipped.

Usage (from the repo root):
    python3 scripts/models/backfill_gguf_repo.py --dry-run         # report only
    python3 scripts/models/backfill_gguf_repo.py                   # write models.json
    python3 scripts/models/backfill_gguf_repo.py --recheck         # re-verify rows that already have a repo
    python3 scripts/models/backfill_gguf_repo.py --only "Qwen3.5 27B" --dry-run

By default only rows without a gguf_repo (missing or null) are searched, so a
re-run picks up repos published since the last one. Output order follows
models.json, so the report is deterministic for a given state of the Hub.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from model_script_utils import (
    HF_API,
    RUN_TAGS,
    gguf_families,
    llamacpp_resolve,
    load_models,
    save_models,
    validate_model_entry,
)

# Source precedence from the data-update runbook: official org GGUFs, then the
# established quantizers. Repos from anyone else are only tried via HINTS.
QUANTIZERS = ["unsloth", "bartowski", "ggml-org", "lmstudio-community"]
OFFICIAL_ORGS = [
    "Qwen", "google", "meta-llama", "meta-models", "microsoft", "nvidia", "mistralai",
    "deepseek-ai", "zai-org", "moonshotai", "MiniMaxAI", "openai", "ibm-granite", "allenai",
    "XiaomiMiMo", "stepfun-ai", "tencent", "baidu", "LiquidAI", "CohereLabs", "ServiceNow-AI",
    "inclusionAI", "ByteDance-Seed", "HuggingFaceTB", "arcee-ai", "thinkingmachines",
    "NousResearch", "JetBrains", "Nanbeige", "internlm", "openbmb", "ai21labs", "tiiuae",
    "LGAI-EXAONE", "upstage", "meituan-longcat", "IFM", "ornith-ai", "reflection", "RecursiveSI",
]

# Extra candidate repos for names the Hub search can't find from the display
# name alone (the repo adds a size, date or version the name leaves out), or
# where the row's notes pin down which checkpoint it is. Every hint is still
# size-verified like any other candidate.
HINTS: dict[str, list[str]] = {
    "Llama 4 Scout": ["unsloth/Llama-4-Scout-17B-16E-Instruct-GGUF", "ggml-org/Llama-4-Scout-17B-16E-Instruct-GGUF"],
    "Llama 4 Maverick": ["unsloth/Llama-4-Maverick-17B-128E-Instruct-GGUF"],
    "Phi-4 Mini 3.8B": [
        "unsloth/Phi-4-mini-instruct-GGUF", "bartowski/microsoft_Phi-4-mini-instruct-GGUF",
        "lmstudio-community/Phi-4-mini-instruct-GGUF",
    ],
    "Phi-4 14B": [
        "microsoft/phi-4-gguf", "unsloth/phi-4-GGUF", "bartowski/phi-4-GGUF", "lmstudio-community/phi-4-GGUF",
    ],
    # 128K context in the row: the 128k checkpoint, as Microsoft updated it in place (bartowski calls it 3.1)
    "Phi-3 Mini 3.8B": ["bartowski/Phi-3.1-mini-128k-instruct-GGUF", "lmstudio-community/Phi-3.1-mini-128k-instruct-GGUF"],
    "Mistral Nemo 12B": [
        "unsloth/Mistral-Nemo-Instruct-2407-GGUF", "bartowski/Mistral-Nemo-Instruct-2407-GGUF",
        "lmstudio-community/Mistral-Nemo-Instruct-2407-GGUF",
    ],
    "Nemotron Nano 12B": ["bartowski/nvidia_NVIDIA-Nemotron-Nano-12B-v2-GGUF"],
    "Codestral 22B": ["bartowski/Codestral-22B-v0.1-GGUF", "lmstudio-community/Codestral-22B-v0.1-GGUF"],
    # TheBloke quantized the 2023 DeepSeek Coder release; the newer quantizers only carry fine-tunes of it
    "DeepSeek Coder 6.7B": ["TheBloke/deepseek-coder-6.7B-instruct-GGUF"],
    "SmallThinker 3B": ["PowerInfer/SmallThinker-3B-Preview-GGUF", "bartowski/SmallThinker-3B-Preview-GGUF"],
    # SWE-bench Verified 46.8 in the row is Devstral Small 1.0 (2505)
    "Devstral Small 24B": [
        "unsloth/Devstral-Small-2505-GGUF", "bartowski/mistralai_Devstral-Small-2505-GGUF",
        "lmstudio-community/Devstral-Small-2505-GGUF",
    ],
    # The row's notes say Magistral 1.2, which is the 2509 release
    "Magistral Small 24B": [
        "mistralai/Magistral-Small-2509-GGUF", "unsloth/Magistral-Small-2509-GGUF",
        "bartowski/mistralai_Magistral-Small-2509-GGUF", "lmstudio-community/Magistral-Small-2509-GGUF",
    ],
    "Mistral Small 4": [
        "unsloth/Mistral-Small-4-119B-2603-GGUF", "bartowski/mistralai_Mistral-Small-4-119B-2603-GGUF",
        "lmstudio-community/Mistral-Small-4-119B-2603-GGUF",
    ],
    # Only DevQuasar publishes a standard Q4_K_M; the runbook accepts that as a last resort (Muse Spark precedent)
    "GLM 5.3 Flash": ["DevQuasar/zai-org.GLM-5.3-Flash-GGUF"],
    "Muse Spark Open 816B A42B": ["DevQuasar/meta-models.Muse-Spark-Open-816B-A42B-GGUF"],
    "Flint 40B A2.5B": ["bartowski/RecursiveSI_flint-GGUF", "ggml-org/Flint-GGUF", "unsloth/flint-GGUF"],
    # NVIDIA's repos prefix "NVIDIA-" to the model name
    "Nemotron 3.5 Bolt E4B": [
        "nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB", "bartowski/NVIDIA-Nemotron-3.5-Bolt-E4B-GGUF",
        "ggml-org/NVIDIA-Nemotron-3.5-Bolt-E4B-GGUF", "lmstudio-community/NVIDIA-Nemotron-3.5-Bolt-E4B-GGUF",
    ],
    "Nemotron 3.5 Lightning 30B A3B": [
        "unsloth/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF", "bartowski/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF",
    ],
    "Nemotron 3.5 Super VL 120B A12B": [
        "ggml-org/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-GGUF",
        "lmstudio-community/NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-GGUF",
    ],
    "Nemotron 3.5 Bolt 74B A9B": ["unsloth/NVIDIA-Nemotron-3.5-Bolt-74B-A9B-GGUF"],
}

# Words a repo name may add to the model's own name and still be the same
# model: packaging, instruct/chat tuning labels and date-stamped releases.
# Anything else (Coder, VL, Distill, a fine-tune's name) marks a different model.
FILLER_WORDS = ("instruct", "gguf", "chat", "meta", "it", "hf")
_DATE_STAMP = re.compile(r"^\d{4}")  # 2503, 0528, 2507
TUNED_LABEL = re.compile(r"[-_](instruct|it|chat)([-_]|$)", re.I)

USER_AGENT = "whatmodel-scripts/1.0"


class Hub:
    """Hugging Face lookups with an in-memory (and optional on-disk) cache."""

    def __init__(self, cache_dir: Path | None):
        self.cache_dir = cache_dir
        self.memory: dict[str, object] = {}
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    def get(self, url: str, headers: dict | None = None):
        key = url + json.dumps(headers or {}, sort_keys=True)
        if key in self.memory:
            return self.memory[key]
        path = None
        if self.cache_dir:
            path = self.cache_dir / (hashlib.sha256(key.encode()).hexdigest() + ".json")
            if path.exists():
                value = json.loads(path.read_text())
                self.memory[key] = value
                return value
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
        for attempt in range(6):
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    value = json.load(response)
                break
            except urllib.error.HTTPError as exc:
                try:
                    body = json.loads(exc.read() or b"{}")
                except ValueError:
                    body = {}
                body = body if isinstance(body, dict) else {}
                if exc.code == 429 or exc.code >= 500:
                    # Anonymous Hub calls are rate limited; wait as told and retry.
                    wait = int(body.get("retryAfter") or 30) + 2
                    print(f"    (Hub says wait {wait}s: HTTP {exc.code})", file=sys.stderr)
                    time.sleep(wait)
                    continue
                # 401/404 and friends are answers, not failures (gated, missing, sharded)
                value = {"__status": exc.code, **body}
                break
        else:
            raise RuntimeError(f"Hugging Face kept refusing {url}; try again later.")
        self.memory[key] = value
        if path:
            path.write_text(json.dumps(value))
        return value

    def search(self, term: str) -> list[str]:
        query = urllib.parse.urlencode(
            {"search": term, "filter": "gguf", "sort": "downloads", "direction": "-1", "limit": "200"}
        )
        result = self.get(f"{HF_API}?{query}")
        return [r["id"] for r in result] if isinstance(result, list) else []

    def repo_info(self, repo: str) -> dict | None:
        info = self.get(f"{HF_API}/{repo}?blobs=true")
        return None if not isinstance(info, dict) or "__status" in info else info

    def ollama_model_size(self, repo: str, tag: str) -> tuple[int | None, str | None]:
        """Size of the model layer the Hub serves to "ollama run hf.co/repo:tag"."""
        manifest = self.get(
            f"https://huggingface.co/v2/{repo}/manifests/{tag}",
            {"User-Agent": "ollama/0.12.0", "Accept": "application/vnd.docker.distribution.manifest.v2+json"},
        )
        if not isinstance(manifest, dict) or "__status" in manifest or "error" in manifest:
            error = manifest.get("error") if isinstance(manifest, dict) else None
            return None, error or f"HTTP {manifest.get('__status') if isinstance(manifest, dict) else '?'}"
        for layer in manifest.get("layers", []):
            if layer.get("mediaType") == "application/vnd.ollama.image.model":
                return layer.get("size"), None
        return None, "no model layer"


def compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def search_terms(name: str) -> list[str]:
    """Hub search strings for a display name, most specific first."""
    hyphen = name.replace(" ", "-")
    # "Qwen 2.5 7B" -> "Qwen2.5-7B": the Hub writes most family versions joined.
    joined = re.sub(r"(?<=[A-Za-z]) (?=\d+(\.\d+)?( |$))", "", name).replace(" ", "-")
    terms = []
    for term in (hyphen, joined):
        if term not in terms:
            terms.append(term)
    return terms


def name_matches(name: str, repo: str) -> bool:
    """The repo name is the model's name plus filler words only.

    "bartowski/mistralai_Mistral-Small-3.1-24B-Instruct-2503-GGUF" matches
    "Mistral Small 3.1 24B"; "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF" does not
    match "Qwen 2.5 7B". The original-org prefix bartowski adds is ignored.
    """
    repo_name = re.sub(r"^[A-Za-z0-9-]+_(?=[A-Za-z])", "", repo.split("/", 1)[1])
    words = [w.lower() for w in re.split(r"[-_\s]+", repo_name) if w]
    rest = "|" + "|".join(words) + "|"
    # Remove the name's tokens in order; spaces in the name may be joined or
    # hyphenated in the repo ("Qwen 2.5" -> "Qwen2.5").
    for token in name.lower().split():
        token = token.replace("-", "|")
        pos = rest.find(token)
        if pos < 0:
            return False
        rest = rest[:pos] + "|" + rest[pos + len(token):]
    return all(_is_filler(chunk) for chunk in rest.split("|"))


def _is_filler(chunk: str) -> bool:
    """A leftover chunk made only of filler words and date stamps."""
    if not chunk:
        return True
    if _DATE_STAMP.match(chunk) and _is_filler(chunk[4:]):
        return True
    return any(chunk.startswith(w) and _is_filler(chunk[len(w):]) for w in FILLER_WORDS)


def trust_rank(repo: str) -> int:
    owner = repo.split("/", 1)[0]
    if owner in OFFICIAL_ORGS:
        return 0
    if owner in QUANTIZERS:
        return 1 + QUANTIZERS.index(owner)
    return 1 + len(QUANTIZERS)


def candidates_for(hub: Hub, name: str) -> list[str]:
    found = set(HINTS.get(name, []))
    for term in search_terms(name):
        for repo in hub.search(term):
            owner = repo.split("/", 1)[0]
            if (owner in QUANTIZERS or owner in OFFICIAL_ORGS) and name_matches(name, repo):
                found.add(repo)
    return sorted(found, key=lambda r: (trust_rank(r), r.lower()))


def size_match(weight_gb: float, size_bytes: int, tolerance: float) -> tuple[str, float] | None:
    """('GiB' | 'GB', relative difference) when the file size matches weight_gb."""
    best = None
    for unit, divisor in (("GiB", 1024 ** 3), ("GB", 1e9)):
        diff = abs(size_bytes / divisor - weight_gb) / weight_gb
        if diff <= tolerance and (best is None or diff < best[1]):
            best = (unit, diff)
    return best


def verify(hub: Hub, row: dict, repo: str, tolerance: float, check_ollama: bool) -> dict | None:
    """The verified file family of `repo` for this row, or None."""
    info = hub.repo_info(repo)
    if not info:
        return None
    tag = RUN_TAGS.get(row["quantization"])
    paths = [s.get("rfilename", "") for s in info.get("siblings", [])]
    for family in gguf_families(info):
        if family["quant"] != row["quantization"] or not family["complete"]:
            continue
        match = size_match(row["weight_gb"], family["size"], tolerance)
        if not match:
            continue
        result = {
            "repo": repo, "files": family["files"], "shards": len(family["files"]),
            "unit": match[0], "diff": match[1], "problems": [],
        }
        if llamacpp_resolve(paths, tag) != family["files"]:
            result["problems"].append(f"llama.cpp :{tag} resolves to {llamacpp_resolve(paths, tag)[:1]}")
        if check_ollama and result["shards"] == 1:
            size, error = hub.ollama_model_size(repo, tag)
            if size != family["size"]:
                result["problems"].append(f"Ollama :{tag} serves {error or f'{size} bytes'}")
        return result
    return None


def best_for_family(hub: Hub, rows: list[dict], candidates: list[str], tolerance: float,
                    check_ollama: bool) -> dict[str, dict]:
    """Pick a verified repo per row id, preferring one repo for the whole family."""
    found: dict[str, list[dict]] = {row["id"]: [] for row in rows}
    for repo in candidates:
        for row in rows:
            result = verify(hub, row, repo, tolerance, check_ollama)
            if result and not result["problems"]:
                found[row["id"]].append(result)
            elif result:
                print(f"    skip {repo} for {row['id']}: {'; '.join(result['problems'])}")

    # Repos that verify the most rows of this family win, so siblings share a
    # source where one exists. Then a single file over a needlessly sharded one
    # (Ollama can't pull shards; Qwen's own repos split even 8 GB files), then
    # a near-exact size (within 0.5%), then an instruct/chat-labelled repo over
    # a bare one that may be the base model, then source precedence.
    coverage: dict[str, int] = {}
    for results in found.values():
        for result in results:
            coverage[result["repo"]] = coverage.get(result["repo"], 0) + 1

    chosen = {}
    for row_id, results in found.items():
        if results:
            chosen[row_id] = min(
                results,
                key=lambda r: (-coverage[r["repo"]], r["shards"] > 1, r["diff"] > 0.005,
                               not TUNED_LABEL.search(r["repo"]), trust_rank(r["repo"]),
                               round(r["diff"], 4), r["repo"].lower()),
            )
    return chosen


def with_repo(row: dict, repo: str | None, shards: int | None) -> dict:
    """Copy of row with gguf_repo / gguf_shards placed right after weight_gb."""
    out = {}
    for key, value in row.items():
        if key in ("gguf_repo", "gguf_shards"):
            continue
        out[key] = value
        if key == "weight_gb":
            out["gguf_repo"] = repo
            out["gguf_shards"] = shards
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Report without writing models.json")
    parser.add_argument("--recheck", action="store_true", help="Also re-verify rows that already have a repo")
    parser.add_argument("--only", action="append", default=[], help="Limit to these model names (repeatable)")
    parser.add_argument("--tolerance", type=float, default=0.02, help="Max relative size difference (0.02)")
    parser.add_argument("--no-ollama-check", action="store_true", help="Skip the Hub's Ollama manifest check")
    parser.add_argument("--cache-dir", type=Path, default=None, help="Cache Hub responses here between runs")
    args = parser.parse_args()

    hub = Hub(args.cache_dir)
    models = load_models()

    families: dict[str, list[dict]] = {}
    for row in models:
        families.setdefault(row["name"], []).append(row)

    updates: dict[str, tuple[str | None, int | None, str]] = {}
    for name, rows in families.items():
        if args.only and name not in args.only:
            continue
        todo = [r for r in rows if args.recheck or not r.get("gguf_repo")]
        if not todo:
            continue
        print(f"{name}")
        candidates = candidates_for(hub, name)
        chosen = best_for_family(hub, todo, candidates, args.tolerance, not args.no_ollama_check)
        for row in todo:
            result = chosen.get(row["id"])
            if result:
                unit = "" if result["unit"] == "GiB" else "  (weight_gb is decimal GB)"
                note = f"{result['repo']}  {result['shards']} file(s), {result['diff'] * 100:.1f}% off{unit}"
                updates[row["id"]] = (result["repo"], result["shards"], note)
            else:
                tried = ", ".join(candidates) if candidates else "no candidate repos"
                updates[row["id"]] = (None, None, f"null: no verified repo (tried {tried})")
            print(f"  {row['id']:40s} {row['quantization']:7s} {row['weight_gb']:>9}  {updates[row['id']][2]}")

    new_models = [
        with_repo(row, *updates[row["id"]][:2]) if row["id"] in updates else with_repo(
            row, row.get("gguf_repo"), row.get("gguf_shards"))
        for row in models
    ]

    errors = []
    for row in new_models:
        others = [m for m in new_models if m is not row]
        errors += [f"{row['id']}: {e}" for e in validate_model_entry(row, others)]
    if errors:
        print("\nValidation failed; nothing written:")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)

    verified = sum(1 for repo, _shards, _note in updates.values() if repo)
    print(f"\n{verified} of {len(updates)} checked rows verified; {len(updates) - verified} null.")
    if args.dry_run:
        print("Dry run; nothing written.")
        return
    save_models(new_models)
    print(f"Wrote gguf_repo to {len(new_models)} rows in models.json.")


if __name__ == "__main__":
    main()
