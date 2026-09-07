#!/usr/bin/env python3
"""
Update benchmark scores on existing entries in src/lib/data/models.json.

Scores are applied by model *name*, so every quantization variant of a model is
updated together — the data tests require variants to agree on mmlu_score and
swe_bench_score.

Usage:
    # Set scores for one model
    python scripts/update_model_stats.py --set "GLM 5:mmlu=none,swe=77.8"

    # Several at once
    python scripts/update_model_stats.py \
        --set "Qwen3.5 27B:swe=72.4" \
        --set "Qwen3.5 397B A17B:swe=76.2"

    # Apply a batch from a JSON file: {"Model Name": {"mmlu": 84.3, "swe": 86.0}}
    python scripts/update_model_stats.py --from-file scores.json

    # See what is still missing
    python scripts/update_model_stats.py --report

mmlu_score follows the MMLU-Pro convention used by the recent entries in this
file. swe_bench_score is SWE-bench Verified — do not mix in SWE-bench Pro or
DeepSWE numbers, which are different benchmarks on different scales.
"""

import argparse
import json
import sys

from model_script_utils import load_models, save_models


def parse_set(value: str) -> tuple[str, dict]:
    """Parse 'Model Name:mmlu=84.3,swe=86.0' into (name, {field: score})."""
    if ":" not in value:
        raise argparse.ArgumentTypeError(
            f"Invalid --set '{value}'. Use \"Model Name:mmlu=84.3,swe=86.0\"."
        )
    name, assignments = value.rsplit(":", 1)
    scores: dict[str, float | None] = {}
    for assignment in assignments.split(","):
        assignment = assignment.strip()
        if not assignment:
            continue
        if "=" not in assignment:
            raise argparse.ArgumentTypeError(f"Invalid assignment '{assignment}' in '{value}'.")
        key, raw = (part.strip() for part in assignment.split("=", 1))
        field = {"mmlu": "mmlu_score", "swe": "swe_bench_score"}.get(key)
        if field is None:
            raise argparse.ArgumentTypeError(f"Unknown score '{key}'. Use 'mmlu' or 'swe'.")
        if raw.lower() in {"none", "null", ""}:
            scores[field] = None
            continue
        try:
            score = float(raw)
        except ValueError as exc:
            raise argparse.ArgumentTypeError(f"'{raw}' is not a number in '{value}'.") from exc
        if not 0 <= score <= 100:
            raise argparse.ArgumentTypeError(f"Score {score} out of range 0-100 in '{value}'.")
        scores[field] = score
    return name.strip(), scores


def report(models: list[dict]) -> None:
    families: dict[str, dict] = {}
    for model in models:
        families.setdefault(model["name"], model)

    missing_both, missing_mmlu, missing_swe = [], [], []
    for name, model in families.items():
        has_mmlu = model.get("mmlu_score") is not None
        has_swe = model.get("swe_bench_score") is not None
        if not has_mmlu and not has_swe:
            missing_both.append(name)
        elif not has_mmlu:
            missing_mmlu.append(name)
        elif not has_swe:
            missing_swe.append(name)

    print(f"{len(families)} model families\n")
    for label, group in (
        ("missing BOTH scores (sort to the bottom in every view)", missing_both),
        ("missing mmlu_score", missing_mmlu),
        ("missing swe_bench_score", missing_swe),
    ):
        print(f"== {label}: {len(group)}")
        for name in sorted(group):
            print(f"   {name}")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Update benchmark scores on existing models.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--set",
        action="append",
        type=parse_set,
        default=[],
        dest="assignments",
        help='"Model Name:mmlu=84.3,swe=86.0" (repeatable)',
    )
    parser.add_argument(
        "--from-file",
        default=None,
        help='JSON file of {"Model Name": {"mmlu": 84.3, "swe": 86.0}}',
    )
    parser.add_argument("--report", action="store_true", help="Show which scores are missing")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    parser.add_argument("--yes", action="store_true", help="Write without confirmation")
    args = parser.parse_args()

    models = load_models()

    if args.report:
        report(models)
        return

    updates: dict[str, dict] = {}
    for name, scores in args.assignments:
        updates.setdefault(name, {}).update(scores)

    if args.from_file:
        with open(args.from_file, "r", encoding="utf-8") as f:
            for name, scores in json.load(f).items():
                mapped = {
                    {"mmlu": "mmlu_score", "swe": "swe_bench_score"}.get(k, k): v
                    for k, v in scores.items()
                }
                updates.setdefault(name, {}).update(mapped)

    if not updates:
        parser.error("Nothing to do. Pass --set, --from-file, or --report.")

    known_names = {m["name"] for m in models}
    unknown = sorted(set(updates) - known_names)
    if unknown:
        print("Unknown model name(s):")
        for name in unknown:
            print(f"  - {name}")
        sys.exit(1)

    changed = 0
    for model in models:
        scores = updates.get(model["name"])
        if not scores:
            continue
        for field, value in scores.items():
            if model.get(field) != value:
                print(f"  {model['id']:32s} {field}: {model.get(field)} -> {value}")
                model[field] = value
                changed += 1

    if not changed:
        print("No changes needed; scores already match.")
        return

    print(f"\n{changed} field(s) across {len(updates)} model(s).")
    if args.dry_run:
        print("Dry run; nothing written.")
        return
    if not args.yes and input("Write to models.json? (y/n): ").strip().lower() != "y":
        print("Operation cancelled.")
        return

    save_models(models)
    print("Updated src/lib/data/models.json")


if __name__ == "__main__":
    main()
