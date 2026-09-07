# Model Scripts

Scripts in this folder manage `src/lib/data/models.json`.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `add_model.py` | Add a model (all its quantizations) from Hugging Face metadata |
| `extract_model_ids.py` | Print all model IDs from `models.json` |
| `list_recent_models.py` | List newly uploaded Hugging Face models |
| `update_model_stats.py` | Set benchmark scores on existing entries, or report gaps |

## Usage

```bash
# Add a model — one run adds every quantization you list
python3 scripts/models/add_model.py --name "Qwen3.8 27B" \
    --config-repo Qwen/Qwen3.8-27B \
    --gguf-repo unsloth/Qwen3.8-27B-GGUF \
    --quant Q4_K_M --quant Q8_0 \
    --features vision,tool_use,reasoning --yes

# Pull one quantization from a different repo when the main one lacks it
python3 scripts/models/add_model.py --name "Muse Glimmer 30B" \
    --config-repo meta-models/Muse-Glimmer-30B \
    --gguf-repo unsloth/Muse-Glimmer-30B-GGUF \
    --quant Q8_0 --quant Q4_K_M \
    --quant-source Q4_K_M=lmstudio-community/Muse-Glimmer-30B-GGUF --yes

# Preview without writing
python3 scripts/models/add_model.py --name "..." --gguf-repo ... --quant Q4_K_M --dry-run

# Benchmark scores (applied to every variant of a model by name)
python3 scripts/models/update_model_stats.py --set "GLM 5:swe=77.8"
python3 scripts/models/update_model_stats.py --report   # what is still missing
```

## What `add_model.py` derives for you

| Field | Source |
|-------|--------|
| `weight_gb` | Summed across GGUF shards, **excluding** `mmproj`, MTP and draft files |
| `kv_per_1k_gb` | Counts only KV-caching layers; uses the MLA formula for latent-attention models |
| `max_context_k` | `config.json`, falling back to the GGUF header |
| `layers`, `params_b` | `config.json` / repo metadata |
| `active_weight_gb` | From `--active-params-b`, scaled per quantization |

`mmlu_score` and `swe_bench_score` are **never** auto-populated — pass `--mmlu` /
`--swe-bench` with values from benchmark leaderboards, or leave them null.

## Gotchas that produce bad data

- **Multi-part GGUFs.** Large models ship as `-00001-of-00009.gguf` shard sets. The
  weight is the sum of the set, not one file. `add_model.py` handles this; a naive
  read of the file list does not.
- **Auxiliary GGUFs.** Repos also contain `mmproj-*` (vision projector), `mtp/*`
  (multi-token-prediction head) and draft-model files. Summing those in is how a
  180B model ends up recorded as 4.37 GB.
- **`UD-Q4_K_XL` is not `Q4_K_M`.** Unsloth dynamic quants are a separate
  quantization at a different size, and are deliberately not matched.
- **Hybrid attention.** Most 2026 models interleave linear/conv/sliding layers that
  hold no growing KV cache. Only full-attention (and DeepSeek sparse-attention)
  layers count toward `kv_per_1k_gb`; counting all layers overstates it several-fold.
- **MLA models** (DeepSeek, GLM-5.x, Mistral Large 3) cache one compressed latent
  per token per layer, so there is no ×2 for K+V.

A plausibility check warns when `weight_gb` is far from what the parameter count and
quantization imply — that almost always means a missing shard or an auxiliary file.

## Notes

- These commands delegate to the top-level scripts in `scripts/`; shared logic lives
  in `scripts/model_script_utils.py`.
- Validation mirrors `src/lib/data/data.test.js`, including the cross-variant rules
  (variants of one model must agree on `params_b`, `max_context_k`, `mmlu_score`,
  `kv_per_1k_gb` and `features`, and a lighter quant must weigh less).
- Only the stdlib is required; `list_recent_models.py` still uses `requests`.
