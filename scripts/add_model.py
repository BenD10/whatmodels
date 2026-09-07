#!/usr/bin/env python3
"""
Add a model to src/lib/data/models.json, deriving specs from Hugging Face.

One run adds every requested quantization as a separate entry, so a model and
its variants stay consistent (the data tests require variants to agree on
params_b, max_context_k, mmlu_score, kv_per_1k_gb and features).

Usage:
    # Both quants in one run, sizes read from the GGUF repo
    python scripts/add_model.py --name "Qwen3.8 27B" \
        --config-repo Qwen/Qwen3.8-27B \
        --gguf-repo unsloth/Qwen3.8-27B-GGUF \
        --quant Q4_K_M --quant Q8_0 \
        --features vision,tool_use,reasoning --yes

    # Pull one quantization from a different repo
    python scripts/add_model.py --name "Muse Glimmer 30B" \
        --config-repo meta-models/Muse-Glimmer-30B \
        --gguf-repo unsloth/Muse-Glimmer-30B-GGUF \
        --quant Q8_0 --quant Q4_K_M \
        --quant-source Q4_K_M=lmstudio-community/Muse-Glimmer-30B-GGUF --yes

    # Inspect without writing
    python scripts/add_model.py --name "..." --gguf-repo ... --quant Q4_K_M --dry-run

What is derived automatically:
  weight_gb      summed across GGUF shards, excluding mmproj/MTP/draft files
  kv_per_1k_gb   counts only full-attention layers; uses the MLA formula for
                 DeepSeek-style latent-attention models
  max_context_k  from config.json or the GGUF header
  layers, params_b

mmlu_score and swe_bench_score are never auto-populated — pass --mmlu / --swe-bench
with values from benchmark leaderboards, or leave them null.
"""

import argparse
import json
import sys

from model_script_utils import (
    calc_kv_per_1k_gb,
    calc_kv_per_1k_gb_mla,
    count_attention_layers,
    fetch_config,
    fetch_repo_info,
    head_dim_of,
    is_mla,
    load_models,
    plausibility_warnings,
    read_gguf_metadata,
    resolve_gguf_sizes,
    save_models,
    slugify_model_id,
    validate_model_entry,
    VALID_FEATURES,
    VALID_QUANTIZATIONS,
)


def parse_quant_source(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise argparse.ArgumentTypeError(
            f"Invalid --quant-source '{value}'. Use QUANT=repo (example: Q4_K_M=bartowski/Foo-GGUF)."
        )
    quant, repo = value.split("=", 1)
    if quant not in VALID_QUANTIZATIONS:
        raise argparse.ArgumentTypeError(
            f"Unknown quantization '{quant}'. Valid: {', '.join(VALID_QUANTIZATIONS)}."
        )
    return quant, repo


def parse_features(value: str) -> list[str]:
    features = [f.strip() for f in value.split(",") if f.strip()]
    for feature in features:
        if feature not in VALID_FEATURES:
            raise argparse.ArgumentTypeError(
                f"Unknown feature '{feature}'. Valid: {', '.join(VALID_FEATURES)}."
            )
    return features


def derive_architecture(config: dict) -> dict:
    """Work out layer counts and KV-cache cost from a model config."""
    total_layers, attention_layers = count_attention_layers(config)

    if is_mla(config):
        kv = calc_kv_per_1k_gb_mla(
            attention_layers,
            config.get("kv_lora_rank", 0),
            config.get("qk_rope_head_dim", 0) or 0,
        )
        style = f"MLA (kv_lora_rank {config.get('kv_lora_rank')})"
    else:
        kv_heads = config.get("num_key_value_heads") or config.get("num_attention_heads")
        head_dim = head_dim_of(config)
        if not (kv_heads and head_dim):
            return {"layers": total_layers or None, "kv_per_1k_gb": None, "style": "unknown"}
        kv = calc_kv_per_1k_gb(attention_layers, kv_heads, head_dim)
        style = f"{kv_heads} KV heads, head_dim {head_dim}"

    return {
        "layers": total_layers or None,
        "attention_layers": attention_layers,
        "kv_per_1k_gb": round(kv, 3),
        "style": style,
    }


def context_k_from(config: dict, gguf_meta: dict | None) -> int | None:
    context = config.get("max_position_embeddings")
    if not context and gguf_meta:
        context = next(
            (v for k, v in gguf_meta.items() if k.endswith(".context_length")), None
        )
    if isinstance(context, (int, float)) and context > 1000:
        return int(round(context / 1024))
    return int(context) if context else None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Add a model (and its quantization variants) to models.json.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--name", required=True, help="Display name, e.g. 'Qwen3.8 27B'")
    parser.add_argument("--gguf-repo", required=True, help="Default HF repo holding the GGUF files")
    parser.add_argument(
        "--config-repo",
        default=None,
        help="HF repo holding config.json (defaults to --gguf-repo)",
    )
    parser.add_argument(
        "--quant",
        action="append",
        choices=list(VALID_QUANTIZATIONS),
        required=True,
        help="Quantization to add (repeatable)",
    )
    parser.add_argument(
        "--quant-source",
        action="append",
        type=parse_quant_source,
        default=[],
        help="Override the GGUF repo for one quantization: QUANT=repo (repeatable)",
    )
    parser.add_argument("--params-b", type=float, default=None, help="Total params in billions")
    parser.add_argument("--context-k", type=int, default=None, help="Override max context in K")
    parser.add_argument("--kv", type=float, default=None, help="Override kv_per_1k_gb")
    parser.add_argument("--layers", type=int, default=None, help="Override layer count")
    parser.add_argument("--mmlu", type=float, default=None, help="MMLU score (manual)")
    parser.add_argument("--swe-bench", type=float, default=None, help="SWE-bench score (manual)")
    parser.add_argument("--features", type=parse_features, default=[], help="Comma-separated features")
    parser.add_argument("--notes", default=None, help="Notes string (architecture + benchmarks)")
    parser.add_argument(
        "--active-params-b",
        type=float,
        default=None,
        help="For MoE models: active (per-token) params in billions. active_weight_gb "
             "is derived per quantization from the model's own weight/param ratio.",
    )
    parser.add_argument("--yes", action="store_true", help="Write without confirmation")
    parser.add_argument("--dry-run", action="store_true", help="Print entries without writing")
    args = parser.parse_args()

    config_repo = args.config_repo or args.gguf_repo
    overrides = dict(args.quant_source)

    print(f"Resolving '{args.name}'")
    print("-" * 60)

    # --- architecture -------------------------------------------------------
    config: dict = {}
    try:
        config = fetch_config(config_repo)
    except Exception as exc:  # gated or GGUF-only repos are common
        print(f"  config.json unavailable from {config_repo} ({exc}); relying on GGUF header.")

    arch = derive_architecture(config) if config else {"layers": None, "kv_per_1k_gb": None, "style": "unknown"}

    # --- GGUF sizes ---------------------------------------------------------
    sizes: dict[str, dict] = {}
    repo_cache: dict[str, dict] = {}
    for quant in args.quant:
        repo = overrides.get(quant, args.gguf_repo)
        if repo not in repo_cache:
            repo_cache[repo] = resolve_gguf_sizes(repo)
        found = repo_cache[repo].get(quant)
        if not found:
            print(f"  ERROR: no {quant} GGUF found in {repo}.")
            available = ", ".join(sorted(repo_cache[repo])) or "none"
            print(f"         Available there: {available}")
            sys.exit(1)
        if not found["complete"]:
            print(f"  WARNING: {quant} shard set in {repo} looks incomplete.")
        sizes[quant] = {**found, "repo": repo}
        print(f"  {quant:7s} {found['size_gb']:>8.2f} GB  ({found['files']} file(s), {repo})")

    # --- context / params ---------------------------------------------------
    gguf_meta = None
    if args.context_k is None and not config.get("max_position_embeddings"):
        first_repo = sizes[args.quant[0]]["repo"]
        info = fetch_repo_info(first_repo)
        first_file = sorted(
            s["rfilename"] for s in info.get("siblings", [])
            if args.quant[0] in s.get("rfilename", "") and s["rfilename"].endswith(".gguf")
        )
        if first_file:
            try:
                gguf_meta = read_gguf_metadata(
                    f"https://huggingface.co/{first_repo}/resolve/main/{first_file[0]}"
                )
            except Exception as exc:
                print(f"  Could not read GGUF header: {exc}")

    context_k = args.context_k or context_k_from(config, gguf_meta)
    params_b = args.params_b
    if params_b is None:
        try:
            info = fetch_repo_info(config_repo)
            total = (info.get("safetensors") or {}).get("total") or (info.get("gguf") or {}).get("total")
            if total:
                params_b = round(total / 1e9, 2)
        except Exception:
            pass

    layers = args.layers or arch.get("layers")
    kv = args.kv if args.kv is not None else arch.get("kv_per_1k_gb")

    missing = [
        label for label, value in
        [("params_b", params_b), ("kv_per_1k_gb", kv), ("max_context_k", context_k)]
        if value is None
    ]
    if missing:
        print(f"  ERROR: could not derive {', '.join(missing)}. Pass them explicitly.")
        sys.exit(1)

    print(f"  params {params_b}B | {layers} layers "
          f"({arch.get('attention_layers', '?')} attention) | KV {kv} GB/1K | {context_k}K ctx")
    print(f"  attention: {arch.get('style')}")

    # --- build entries ------------------------------------------------------
    notes = args.notes or (
        f"{layers} layers ({arch.get('attention_layers', '?')} full-attention), {arch.get('style')}. "
        f"KV per 1K counts attention layers only."
    )
    existing = load_models()
    entries = []
    for quant in args.quant:
        entry = {
            "id": slugify_model_id(args.name, quant),
            "name": args.name,
            "params_b": params_b,
            "quantization": quant,
            "weight_gb": sizes[quant]["size_gb"],
            "kv_per_1k_gb": kv,
            "max_context_k": context_k,
            "layers": layers,
            "mmlu_score": args.mmlu,
            "swe_bench_score": args.swe_bench,
            "features": args.features,
            "notes": f"{notes} GGUF {quant} file size.",
        }
        if args.active_params_b is not None:
            # Scale by this quant's own bytes-per-param so Q4/Q8 each get a
            # correct active-weight figure; drives the tok/s estimate for MoE.
            ratio = entry["weight_gb"] / params_b
            entry["active_weight_gb"] = round(args.active_params_b * ratio, 2)
        entries.append(entry)

    # Validate each entry against the file plus the siblings added in this run.
    failed = False
    for entry in entries:
        errors = validate_model_entry(entry, existing + [e for e in entries if e is not entry])
        for warning in plausibility_warnings(entry):
            print(f"  WARNING [{entry['id']}]: {warning}")
        if errors:
            failed = True
            print(f"  INVALID [{entry['id']}]:")
            for error in errors:
                print(f"    - {error}")

    print("-" * 60)
    print(json.dumps(entries, indent=2))

    if failed:
        print("\nValidation failed; nothing written.")
        sys.exit(1)
    if args.dry_run:
        print("\nDry run; nothing written.")
        return
    if not args.yes and input("\nAdd to models.json? (y/n): ").strip().lower() != "y":
        print("Operation cancelled.")
        return

    save_models(existing + entries)
    print(f"\nAdded {len(entries)} entr{'y' if len(entries) == 1 else 'ies'} to models.json")


if __name__ == "__main__":
    main()
