#!/usr/bin/env python3
"""Draft a "What's new" entry for src/lib/data/releases.json.

Diffs models.json and gpus.json between two git refs (or a ref and the working
tree) and prints a release entry: models added (by name, the variant-grouping
key), GPUs added (by id), and a draft list of corrections (changed sizes, KV
cache, context, scores, GPU specs) for a human to rewrite as short sentences.

    # At release time, on the data branch: diff main against the working tree
    python3 scripts/releases/build_release.py --from origin/main --date 2026-11-27

    # Backfill a past release between two commits, and add it to releases.json
    python3 scripts/releases/build_release.py --from 69811ba --to f24a7ec \\
        --date 2026-10-24 --append

Stdlib only. Run from the repo root.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

MODELS_PATH = "src/lib/data/models.json"
GPUS_PATH = "src/lib/data/gpus.json"
RELEASES_PATH = "src/lib/data/releases.json"
WORKTREE = "WORKTREE"

# Model fields worth a correction line, with the label a human reads
MODEL_FIELDS = {
    "weight_gb": "file size (weight_gb)",
    "active_weight_gb": "active weights (active_weight_gb)",
    "kv_per_1k_gb": "KV cache (kv_per_1k_gb)",
    "max_context_k": "max context (max_context_k)",
    "params_b": "parameters (params_b)",
    "layers": "layers",
    "features": "features",
    "mmlu_score": "MMLU-Pro (mmlu_score)",
    "swe_bench_score": "SWE-bench Verified (swe_bench_score)",
}
GPU_FIELDS = {
    "vram_gb": "VRAM (vram_gb)",
    "bandwidth_gbps": "bandwidth (bandwidth_gbps)",
    "vram_options": "memory options (vram_options)",
    "msrp_usd": "launch MSRP (msrp_usd)",
    "amazon_search": "Amazon search (amazon_search)",
}

# Up to this many models (or GPUs) get one line each with old → new values;
# more than that collapses into a single count line.
DETAIL_LIMIT = 3

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def read_json_at(ref: str, path: str):
    """Parse a JSON file at a git ref, or on disk when ref is WORKTREE."""
    if ref == WORKTREE:
        return json.loads(Path(path).read_text())
    out = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    if out.returncode != 0:
        # The file didn't exist yet at that ref (gpus.json before the first GPU)
        if "does not exist" in out.stderr or "exists on disk, but not in" in out.stderr:
            return []
        raise SystemExit(f"git show {ref}:{path} failed: {out.stderr.strip()}")
    return json.loads(out.stdout)


def unique_in_order(items):
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result


def fmt(value) -> str:
    if value is None:
        return "none"
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return "/".join(str(o.get("vram_gb")) for o in value) + " GB"
        return ", ".join(value) if value else "none"
    return str(value)


def names_list(names) -> str:
    """'A', 'A and B', 'A, B and C', or 'A, B, C and 9 more'."""
    names = list(names)
    if len(names) <= 3:
        return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]
    return ", ".join(names[:3]) + f" and {len(names) - 3} more"


def field_changes(old_rows: dict, new_rows: dict, fields: dict, group_key):
    """
    Per field, the groups (model names or GPU ids) whose rows changed it.
    Returns {field: {group: [(row_id, old, new), ...]}} in row order.
    """
    changes = {f: {} for f in fields}
    for row_id, new in new_rows.items():
        old = old_rows.get(row_id)
        if old is None:
            continue
        for field in fields:
            before, after = old.get(field), new.get(field)
            if before != after:
                changes[field].setdefault(group_key(new), []).append((row_id, before, after))
    return {f: groups for f, groups in changes.items() if groups}


def describe_field(label: str, groups: dict, noun: str) -> list[str]:
    """Correction lines for one field: one per group when few, else one summary."""
    all_changes = [c for rows in groups.values() for c in rows]
    filled = all(before is None for _, before, _ in all_changes)
    if len(groups) <= DETAIL_LIMIT:
        lines = []
        for group, rows in groups.items():
            # Every quantization changed the same way (scores, features): say it once
            if len({json.dumps([b, a]) for _, b, a in rows}) == 1:
                _, before, after = rows[0]
                lines.append(f"{group}: {label} {fmt(before)} → {fmt(after)}")
            else:
                parts = "; ".join(f"{rid} {fmt(b)} → {fmt(a)}" for rid, b, a in rows)
                lines.append(f"{group}: {label} {parts}")
        return lines
    verb = "added for" if filled else "changed on"
    plural = noun if len(groups) == 1 else f"{noun}s"
    return [f"{label} {verb} {len(groups)} {plural} ({len(all_changes)} rows): {names_list(groups)}"]


def diff_release(old_models, new_models, old_gpus, new_gpus) -> dict:
    """
    The parts of a release entry that come from the data: models_added,
    gpus_added and draft corrections.
    """
    old_names = {m["name"] for m in old_models}
    new_names = {m["name"] for m in new_models}
    models_added = unique_in_order(m["name"] for m in new_models if m["name"] not in old_names)
    models_removed = unique_in_order(m["name"] for m in old_models if m["name"] not in new_names)

    old_gpu_ids = {g["id"] for g in old_gpus}
    new_gpu_ids = {g["id"] for g in new_gpus}
    gpus_added = [g["id"] for g in new_gpus if g["id"] not in old_gpu_ids]
    gpus_removed = [g["id"] for g in old_gpus if g["id"] not in new_gpu_ids]

    corrections = []

    # New quantizations of models that were already listed
    old_ids = {m["id"] for m in old_models}
    new_quants = {}
    for m in new_models:
        if m["name"] in old_names and m["id"] not in old_ids:
            new_quants.setdefault(m["name"], []).append(m["quantization"])
    for name, quants in new_quants.items():
        corrections.append(f"{name}: added {', '.join(quants)}")

    old_model_rows = {m["id"]: m for m in old_models}
    new_model_rows = {m["id"]: m for m in new_models}
    for field, groups in field_changes(old_model_rows, new_model_rows, MODEL_FIELDS, lambda m: m["name"]).items():
        corrections.extend(describe_field(MODEL_FIELDS[field], groups, "model"))

    old_gpu_rows = {g["id"]: g for g in old_gpus}
    new_gpu_rows = {g["id"]: g for g in new_gpus}
    for field, groups in field_changes(old_gpu_rows, new_gpu_rows, GPU_FIELDS, lambda g: g["name"]).items():
        corrections.extend(describe_field(GPU_FIELDS[field], groups, "GPU"))

    if models_removed:
        corrections.append(f"Removed or renamed: {', '.join(models_removed)}")
    if gpus_removed:
        corrections.append(f"Removed or renamed GPUs: {', '.join(gpus_removed)}")

    return {"models_added": models_added, "gpus_added": gpus_added, "corrections": corrections}


def default_title(models_added, gpus_added) -> str:
    parts = []
    if models_added:
        parts.append(f"{len(models_added)} new model{'s' if len(models_added) != 1 else ''}")
    if gpus_added:
        parts.append(f"{len(gpus_added)} new GPU{'s' if len(gpus_added) != 1 else ''}")
    return " and ".join(parts) if parts else "Data corrections"


def build_entry(date: str, diff: dict, title: str | None = None, summary: str | None = None) -> dict:
    if not DATE_RE.match(date):
        raise ValueError(f"date must be YYYY-MM-DD, got {date!r}")
    return {
        "date": date,
        "title": title or default_title(diff["models_added"], diff["gpus_added"]),
        "summary": summary or "TODO: one or two sentences for the page intro and the feed.",
        "models_added": diff["models_added"],
        "gpus_added": diff["gpus_added"],
        "corrections": diff["corrections"],
    }


def insert_entry(releases: list, entry: dict, replace: bool = False) -> list:
    """Releases with entry added, newest first. Refuses a duplicate date unless replace."""
    existing = [r for r in releases if r["date"] == entry["date"]]
    if existing and not replace:
        raise ValueError(f"releases.json already has {entry['date']}; pass --replace to overwrite it")
    kept = [r for r in releases if r["date"] != entry["date"]]
    return sorted(kept + [entry], key=lambda r: r["date"], reverse=True)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="from_ref", required=True, help="Git ref of the previous release")
    parser.add_argument("--to", dest="to_ref", default=WORKTREE,
                        help=f"Git ref of this release (default: the files on disk, {WORKTREE})")
    parser.add_argument("--date", required=True, help="Release date, YYYY-MM-DD (the new DATA_UPDATED)")
    parser.add_argument("--title", help="Headline for the release page")
    parser.add_argument("--summary", help="One or two sentences for the intro and the feed")
    parser.add_argument("--append", action="store_true", help=f"Write the entry into {RELEASES_PATH}")
    parser.add_argument("--replace", action="store_true", help="With --append, overwrite an entry with the same date")
    parser.add_argument("--releases", default=RELEASES_PATH, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    diff = diff_release(
        read_json_at(args.from_ref, MODELS_PATH),
        read_json_at(args.to_ref, MODELS_PATH),
        read_json_at(args.from_ref, GPUS_PATH),
        read_json_at(args.to_ref, GPUS_PATH),
    )
    try:
        entry = build_entry(args.date, diff, args.title, args.summary)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    print(json.dumps(entry, indent=2, ensure_ascii=False))

    if args.append:
        path = Path(args.releases)
        releases = json.loads(path.read_text()) if path.exists() else []
        try:
            releases = insert_entry(releases, entry, args.replace)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        path.write_text(json.dumps(releases, indent=2, ensure_ascii=False) + "\n")
        print(f"\nWrote {entry['date']} to {path}. Now rewrite the title, summary and corrections by hand.",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
