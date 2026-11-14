# Model Scripts

Scripts in this folder manage `src/lib/data/models.json`.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `add_model.py` | Add a model (all its quantizations) from Hugging Face metadata |
| `backfill_gguf_repo.py` | Find and verify `gguf_repo` / `gguf_shards` for rows that lack them |
| `extract_model_ids.py` | Print all model IDs from `models.json` |
| `list_recent_models.py` | List recently modified Hugging Face models (noisy, see note below) |
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
| `gguf_repo`, `gguf_shards` | The repo each quantization was measured from (`--gguf-repo`, or its `--quant-source`) and how many files its GGUF has |

## Run commands: `gguf_repo` and `gguf_shards`

Model pages print `ollama run hf.co/<gguf_repo>:<TAG>` and `llama-server -hf <gguf_repo>:<TAG>`
for every row whose `gguf_repo` is set (`TAG` is the quantization, `F16` for fp16 rows; see
`RUN_TAGS`). `gguf_repo` is per row because one quantization can come from another repo.
`gguf_shards` is the GGUF's file count: the Hub refuses split GGUFs to Ollama, so rows with
more than one file get only the llama.cpp command. `null` means no verified source, and the
page shows no command for that row.

`add_model.py` fills both and warns when llama.cpp's `-hf repo:TAG` would pick a different
file than the one it measured (e.g. a `Q4_K_M-fp16` variant that sorts first).

For rows without a repo, `backfill_gguf_repo.py` searches the official org and the usual
quantizers (unsloth, bartowski, ggml-org, lmstudio-community, plus per-model `HINTS`) and
accepts a repo only when a complete GGUF of the row's quantization matches `weight_gb`
within 2% (GiB, or decimal GB for older rows), llama.cpp's tag resolution lands on that file
set, and (for single files) the Hub's Ollama manifest serves that exact file.

```bash
python3 scripts/models/backfill_gguf_repo.py --dry-run          # report, write nothing
python3 scripts/models/backfill_gguf_repo.py                    # fill rows whose gguf_repo is missing or null
python3 scripts/models/backfill_gguf_repo.py --recheck --only "Qwen3.5 27B" --dry-run
python3 scripts/models/backfill_gguf_repo.py --cache-dir /tmp/hf-cache   # reuse Hub responses between runs
```

Anonymous Hub calls are rate limited; the script waits and retries when told to.

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
- **Hybrid attention.** Most 2026 models interleave linear/conv/sliding/Mamba layers
  that hold no growing KV cache. Only full-attention (and DeepSeek sparse-attention)
  layers count toward `kv_per_1k_gb`; counting all layers overstates it several-fold.
  The layer list comes from whichever field the config uses: `layer_types`,
  Nemotron-H's `layers_block_type` or `hybrid_override_pattern`, or Gemma 2/3's
  implicit "one full layer every N" (`sliding_window_pattern`).
- **Only short sliding windows are left out.** Sliding layers count as cache-free
  when the window is under 4K tokens (Gemma 3/4, GPT-OSS). Wider windows (Gemma 2's
  4K, Ministral's 32K, Llama 4's 8K chunks) grow like full attention at everyday
  context lengths, so they stay in.
- **Nested configs.** Multimodal models keep the language model's settings under
  `text_config` (Gemma) or `llm_config` (Nemotron VL); the top level has none.
- **Gemma 4 global layers differ from local ones.** Full-attention layers use
  `num_global_key_value_heads` and `global_head_dim`, not the sliding layers' values.
- **Shared KV (Gemma 3n/4 "E" models).** The last `num_kv_shared_layers` layers reuse
  earlier layers' cache and allocate none of their own.
- **MLA models** (DeepSeek, GLM-5.x, Mistral Large 3) cache one compressed latent
  per token per layer, so there is no ×2 for K+V.

`scripts/tests/` pins these rules with trimmed real configs; run
`python3 -m unittest discover -s scripts/tests` after touching the KV logic.

A plausibility check warns when `weight_gb` is far from what the parameter count and
quantization imply — that almost always means a missing shard or an auxiliary file.

## Notes

- Shared logic (HF fetching, KV derivation, validation) lives in `model_script_utils.py`
  in this folder.
- Validation mirrors `src/lib/data/data.test.js`, including the cross-variant rules
  (variants of one model must agree on `params_b`, `max_context_k`, `mmlu_score`, `swe_bench_score`,
  `kv_per_1k_gb` and `features`, and a lighter quant must weigh less).
- Only the stdlib is required; `list_recent_models.py` still uses `requests`.
- `list_recent_models.py` sorts all of Hugging Face by `lastModified`, so its output
  is mostly noise and it isn't useful for finding candidate models. Use the Hugging
  Face author queries in the data-update runbook instead (the runbook is kept privately).
