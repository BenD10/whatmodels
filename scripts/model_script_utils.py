#!/usr/bin/env python3
"""Shared helpers for maintaining src/lib/data/models.json."""

import json
import re
import urllib.request
from collections import defaultdict
from pathlib import Path

MODEL_DATA_PATH = Path(__file__).parent.parent / "src" / "lib" / "data" / "models.json"
VALID_FEATURES = ("vision", "reasoning", "tool_use")
VALID_QUANTIZATIONS = ("Q4_K_M", "Q4_K_S", "Q8_0", "fp16")
MODEL_ID_PATTERN = re.compile(r"^[a-z0-9]+([-.][a-z0-9]+)*$")

HF_API = "https://huggingface.co/api/models"
HF_RESOLVE = "https://huggingface.co/{repo}/resolve/main/{path}"

# Quantization tokens we recognise in GGUF filenames, longest-first so that
# "Q4_K_M" wins over a bare "Q4_K" prefix match.
QUANT_TOKENS = ("Q4_K_M", "Q4_K_S", "Q8_0", "BF16", "F16", "FP16")
QUANT_CANONICAL = {"BF16": "fp16", "F16": "fp16", "FP16": "fp16"}

# GGUF files that ship alongside a model but are not the weights themselves.
# Summing these in with the real shards is the classic way to end up with a
# nonsense weight_gb (e.g. a 180B model recorded as 4.37 GB).
AUX_FILE_PATTERNS = (
    re.compile(r"(^|/)mmproj[-_.]", re.I),      # vision projector
    re.compile(r"(^|/)mtp[-_/]", re.I),         # multi-token-prediction head
    re.compile(r"(^|/)draft[-_.]", re.I),       # speculative-decoding draft model
)

SHARD_RE = re.compile(r"^(?P<base>.+)-(?P<idx>\d{5})-of-(?P<total>\d{5})\.gguf$", re.I)


# ---------------------------------------------------------------------------
# data file I/O
# ---------------------------------------------------------------------------

def load_models(models_file: Path = MODEL_DATA_PATH) -> list[dict]:
    with open(models_file, "r", encoding="utf-8") as f:
        return json.load(f)


def save_models(models: list[dict], models_file: Path = MODEL_DATA_PATH) -> None:
    with open(models_file, "w", encoding="utf-8") as f:
        json.dump(models, f, indent=2)
        f.write("\n")


def slugify_model_id(name: str, quantization: str) -> str:
    """Build a project-style id, e.g. ("Qwen3.8 27B", "Q4_K_M") -> qwen3.8-27b-q4."""
    suffix = {"Q8_0": "q8", "Q4_K_M": "q4", "Q4_K_S": "q4ks", "fp16": "fp16"}.get(quantization, "")
    slug = name.lower().replace("+", " plus ")
    slug = re.sub(r"[^a-z0-9.]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    slug = re.sub(r"\.(?![0-9])", "", slug)  # keep dots only inside version numbers
    return f"{slug}-{suffix}" if suffix else slug


# ---------------------------------------------------------------------------
# Hugging Face lookups
# ---------------------------------------------------------------------------

def _get_json(url: str, timeout: int = 60) -> dict | list:
    request = urllib.request.Request(url, headers={"User-Agent": "whatmodel-scripts/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def fetch_repo_info(repo: str) -> dict:
    """Fetch repo metadata including per-file blob sizes."""
    return _get_json(f"{HF_API}/{repo}?blobs=true")


def fetch_config(repo: str) -> dict:
    """Fetch a model repo's config.json, unwrapping nested text/LLM configs."""
    config = _get_json(HF_RESOLVE.format(repo=repo, path="config.json"))
    return config.get("text_config") or config.get("llm_config") or config


def _quant_of(filename: str) -> str | None:
    """Identify the quantization of a GGUF path, ignoring near-miss variants.

    Unsloth-style "UD-Q4_K_XL" dynamic quants are deliberately NOT matched as
    Q4_K_M: they are a different quantization with a different file size.
    """
    upper = filename.upper()
    for token in QUANT_TOKENS:
        # Require a non-alphanumeric boundary so UD-Q4_K_XL does not match Q4_K.
        if re.search(rf"(?<![A-Z0-9]){re.escape(token)}(?![A-Z0-9])", upper):
            return QUANT_CANONICAL.get(token, token)
    return None


def _is_auxiliary(path: str) -> bool:
    return any(pattern.search(path) for pattern in AUX_FILE_PATTERNS)


def resolve_gguf_sizes(repo: str, repo_info: dict | None = None) -> dict[str, dict]:
    """Return {quantization: {"size_gb", "files", "complete"}} for a GGUF repo.

    Multi-part GGUFs are summed across their shard set, auxiliary files
    (mmproj / MTP / draft heads) are excluded, and when a repo holds several
    distinct GGUFs for one quantization the largest shard family wins.
    """
    info = repo_info if repo_info is not None else fetch_repo_info(repo)

    # family key -> {"size": bytes, "count": n, "total": expected shards, "files": [...]}
    families: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"size": 0, "count": 0, "total": 1, "files": []}
    )

    for sibling in info.get("siblings", []) or []:
        path = str(sibling.get("rfilename", ""))
        if not path.lower().endswith(".gguf") or _is_auxiliary(path):
            continue

        quant = _quant_of(path)
        if quant is None:
            continue

        size = sibling.get("size") or (sibling.get("lfs") or {}).get("size") or 0
        if not size:
            continue

        filename = path.rsplit("/", 1)[-1]
        shard = SHARD_RE.match(filename)
        base = shard.group("base") if shard else filename
        family = families[(quant, f"{path.rsplit('/', 1)[0] if '/' in path else ''}/{base}")]
        family["size"] += size
        family["count"] += 1
        family["files"].append(path)
        if shard:
            family["total"] = int(shard.group("total"))

    results: dict[str, dict] = {}
    for (quant, _key), family in families.items():
        candidate = {
            "size_gb": round(family["size"] / (1024 ** 3), 2),
            "files": len(family["files"]),
            "complete": family["count"] == family["total"],
        }
        # Largest complete family wins; a repo can hold several GGUFs per quant.
        if quant not in results or candidate["size_gb"] > results[quant]["size_gb"]:
            results[quant] = candidate
    return results


# ---------------------------------------------------------------------------
# architecture math
# ---------------------------------------------------------------------------

# Layer types whose KV cache grows with context length. Sliding-window layers
# are excluded because their cache is capped by the window, and linear/conv/
# recurrent layers keep only a fixed-size state.
KV_CACHING_LAYER_TYPES = frozenset({
    "full_attention",
    "deepseek_sparse_attention",
    "attention",
})
NON_KV_LAYER_TYPES = frozenset({
    "linear_attention",
    "sliding_attention",
    "conv",
    "recurrent",
    "mamba",
})


def count_attention_layers(config: dict) -> tuple[int, int]:
    """Return (total_layers, kv_caching_layers).

    Hybrid models interleave linear/conv/sliding sublayers that do not hold a
    growing KV cache. Only layers whose cache scales with context should be
    counted, so treating every layer as full attention overstates KV several-fold.
    """
    total = config.get("num_hidden_layers") or 0
    layer_types = config.get("layer_types")
    if isinstance(layer_types, list) and layer_types:
        caching = sum(1 for t in layer_types if t in KV_CACHING_LAYER_TYPES)
        if caching:
            return total, caching
        # Unrecognised naming: fall back to "anything not known to be cache-free"
        # rather than silently returning zero KV cost.
        unknown = [t for t in layer_types if t not in NON_KV_LAYER_TYPES]
        if unknown:
            raise ValueError(
                f"Unrecognised attention layer types {sorted(set(unknown))}; "
                f"add them to KV_CACHING_LAYER_TYPES or pass --kv explicitly."
            )
    return total, total


def calc_kv_per_1k_gb(layers: int, kv_heads: int, head_dim: int) -> float:
    """KV cache GB per 1K tokens at fp16: 2 (K+V) * layers * kv_heads * head_dim * 2 bytes."""
    return 2 * layers * kv_heads * head_dim * 2 * 1000 / (1024 ** 3)


def calc_kv_per_1k_gb_mla(layers: int, kv_lora_rank: int, qk_rope_head_dim: int = 0) -> float:
    """KV per 1K tokens for Multi-head Latent Attention (DeepSeek-style).

    MLA caches a single compressed latent per token per layer instead of
    separate K and V tensors, so there is no factor of 2 for K+V here.
    """
    per_token_per_layer = kv_lora_rank + qk_rope_head_dim
    return layers * per_token_per_layer * 2 * 1000 / (1024 ** 3)


def is_mla(config: dict) -> bool:
    return bool(config.get("kv_lora_rank"))


def head_dim_of(config: dict) -> int | None:
    head_dim = config.get("head_dim")
    if head_dim:
        return head_dim
    hidden = config.get("hidden_size")
    heads = config.get("num_attention_heads")
    if hidden and heads:
        return hidden // heads
    return None


# ---------------------------------------------------------------------------
# GGUF header parsing
# ---------------------------------------------------------------------------

_GGUF_STRUCT = {0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 6: "f", 7: "?", 10: "Q", 11: "q", 12: "d"}
_GGUF_WIDTH = {0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8}


class _GgufReader:
    def __init__(self, buf: bytes):
        self.buf = buf
        self.pos = 0

    def take(self, n: int) -> bytes:
        if self.pos + n > len(self.buf):
            raise EOFError("GGUF header truncated")
        chunk = self.buf[self.pos:self.pos + n]
        self.pos += n
        return chunk

    def u32(self) -> int:
        import struct
        return struct.unpack("<I", self.take(4))[0]

    def u64(self) -> int:
        import struct
        return struct.unpack("<Q", self.take(8))[0]

    def string(self) -> str:
        return self.take(self.u64()).decode("utf-8", "replace")

    def value(self, type_id: int):
        import struct
        if type_id == 8:
            return self.string()
        if type_id == 9:
            elem_type = self.u32()
            count = self.u64()
            if elem_type == 8:
                return [self.string() for _ in range(count)]
            return [
                struct.unpack("<" + _GGUF_STRUCT[elem_type], self.take(_GGUF_WIDTH[elem_type]))[0]
                for _ in range(count)
            ]
        return struct.unpack("<" + _GGUF_STRUCT[type_id], self.take(_GGUF_WIDTH[type_id]))[0]


def read_gguf_metadata(url: str, nbytes: int = 4_000_000) -> dict:
    """Read a GGUF file's key/value metadata via an HTTP range request.

    This is the ground truth for what llama.cpp will actually allocate, and is
    the most reliable source for models whose config.json is gated, unusual, or
    (like MLA models with head_dim = 0) not directly interpretable.
    """
    request = urllib.request.Request(
        url, headers={"User-Agent": "whatmodel-scripts/1.0", "Range": f"bytes=0-{nbytes - 1}"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        reader = _GgufReader(response.read())

    if reader.take(4) != b"GGUF":
        raise ValueError(f"Not a GGUF file: {url}")

    metadata = {"__version": reader.u32(), "__tensor_count": reader.u64()}
    kv_count = reader.u64()
    for _ in range(kv_count):
        try:
            key = reader.string()
            metadata[key] = reader.value(reader.u32())
        except (EOFError, KeyError, UnicodeDecodeError):
            break  # partial header is still useful
    return metadata


# ---------------------------------------------------------------------------
# validation
# ---------------------------------------------------------------------------

def validate_model_entry(
    entry: dict,
    existing: list[dict] | None = None,
    allow_existing_id: bool = False,
) -> list[str]:
    """Validate an entry against the same rules data.test.js enforces."""
    errors: list[str] = []
    existing = existing or []
    existing_ids = {m["id"] for m in existing}

    model_id = entry.get("id")
    if not isinstance(model_id, str) or not model_id:
        errors.append("'id' is required and must be a non-empty string.")
    elif not MODEL_ID_PATTERN.match(model_id):
        errors.append("'id' must be kebab-case (dots allowed for versions).")
    elif model_id in existing_ids and not allow_existing_id:
        errors.append(f"Model id '{model_id}' already exists.")

    name = entry.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("'name' is required and must be a non-empty string.")

    if entry.get("quantization") not in VALID_QUANTIZATIONS:
        errors.append(f"'quantization' must be one of: {', '.join(VALID_QUANTIZATIONS)}.")

    params_b = entry.get("params_b")
    if not isinstance(params_b, (int, float)) or params_b <= 0:
        errors.append("'params_b' must be greater than 0.")

    weight_gb = entry.get("weight_gb")
    if not isinstance(weight_gb, (int, float)) or not (0.1 <= weight_gb <= 2000):
        errors.append("'weight_gb' must be between 0.1 and 2000.")

    kv = entry.get("kv_per_1k_gb")
    if not isinstance(kv, (int, float)) or not (0 <= kv <= 2):
        errors.append("'kv_per_1k_gb' must be between 0 and 2.")

    context = entry.get("max_context_k")
    if not isinstance(context, (int, float)) or context <= 0:
        errors.append("'max_context_k' must be greater than 0.")

    for field in ("mmlu_score", "swe_bench_score"):
        score = entry.get(field)
        if score is not None and (not isinstance(score, (int, float)) or not (0 <= score <= 100)):
            errors.append(f"'{field}' must be null or a number between 0 and 100.")

    features = entry.get("features")
    if not isinstance(features, list):
        errors.append("'features' must be an array.")
    else:
        for feature in features:
            if feature not in VALID_FEATURES:
                errors.append(f"Unknown feature '{feature}'. Valid: {', '.join(VALID_FEATURES)}.")
        if len(set(features)) != len(features):
            errors.append("'features' must not contain duplicates.")

    notes = entry.get("notes")
    if not isinstance(notes, str) or not notes.strip():
        errors.append("'notes' is required and must be a non-empty string.")

    errors.extend(_validate_against_variants(entry, existing, allow_existing_id))
    return errors


def _validate_against_variants(entry: dict, existing: list[dict], allow_existing_id: bool) -> list[str]:
    """Cross-variant rules: shared fields must match, lighter quant must be smaller."""
    errors = []
    variants = [
        m for m in existing
        if m.get("name") == entry.get("name") and not (allow_existing_id and m.get("id") == entry.get("id"))
    ]
    if not variants:
        return errors

    for field in ("params_b", "max_context_k", "mmlu_score", "kv_per_1k_gb"):
        others = {m.get(field) for m in variants}
        if entry.get(field) not in others:
            errors.append(
                f"'{field}' must match sibling variants of '{entry['name']}' "
                f"(existing: {', '.join(str(o) for o in sorted(others, key=str))})."
            )

    entry_features = sorted(entry.get("features") or [])
    for variant in variants:
        if sorted(variant.get("features") or []) != entry_features:
            errors.append(f"'features' must match sibling variants of '{entry['name']}'.")
            break

    order = {"Q4_K_S": 0, "Q4_K_M": 1, "Q8_0": 2, "fp16": 3}
    rank = order.get(entry.get("quantization"))
    for variant in variants:
        other_rank = order.get(variant.get("quantization"))
        if rank is None or other_rank is None or rank == other_rank:
            continue
        if rank < other_rank and entry["weight_gb"] >= variant["weight_gb"]:
            errors.append(
                f"{entry['quantization']} weight ({entry['weight_gb']} GB) must be smaller than "
                f"{variant['quantization']} ({variant['weight_gb']} GB)."
            )
        if rank > other_rank and entry["weight_gb"] <= variant["weight_gb"]:
            errors.append(
                f"{entry['quantization']} weight ({entry['weight_gb']} GB) must be larger than "
                f"{variant['quantization']} ({variant['weight_gb']} GB)."
            )
    return errors


def plausibility_warnings(entry: dict) -> list[str]:
    """Non-fatal sanity checks that catch bad GGUF size resolution.

    These are the checks that would have caught the existing bad rows where a
    397B model was recorded at 22.95 GB.
    """
    warnings = []
    bytes_per_param = {"Q4_K_S": 0.50, "Q4_K_M": 0.60, "Q8_0": 1.06, "fp16": 2.0}
    expected_ratio = bytes_per_param.get(entry.get("quantization"))
    params_b = entry.get("params_b")
    weight_gb = entry.get("weight_gb")

    if expected_ratio and params_b and weight_gb:
        expected = params_b * expected_ratio
        if weight_gb < expected * 0.55:
            warnings.append(
                f"weight_gb {weight_gb} is far below the ~{expected:.1f} GB expected for "
                f"{params_b}B at {entry['quantization']} — check for missing shards or a "
                f"partial/auxiliary GGUF."
            )
        elif weight_gb > expected * 1.8:
            warnings.append(
                f"weight_gb {weight_gb} is far above the ~{expected:.1f} GB expected for "
                f"{params_b}B at {entry['quantization']} — check for double-counted files."
            )
    return warnings
