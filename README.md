# What Models?

[![Deploy](https://github.com/BenD10/whatmodels/actions/workflows/deploy.yml/badge.svg)](https://github.com/BenD10/whatmodels/actions/workflows/deploy.yml)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fwhatmodelscanirun.com&label=whatmodelscanirun.com)](https://whatmodelscanirun.com/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

A static website that helps users find out which AI models their GPU can run — and how well. Pick your GPU (or enter VRAM manually), optionally set a minimum context window, and instantly see which models fit, how much context you can afford, and estimated generation speed.

### **[Try it out at whatmodelscanirun.com →](https://whatmodelscanirun.com/)**

---

## Dataset

The data behind the site is published as an open, MIT-licensed JSON dataset, rebuilt with every data release (about every two weeks):

- **[`/data/models.json`](https://whatmodelscanirun.com/data/models.json)**: one row per model per quantization, with GGUF weight size, KV cache per 1K tokens (only layers whose cache grows with context), MoE active weights, trained context, features and MMLU-Pro / SWE-bench Verified scores
- **[`/data/gpus.json`](https://whatmodelscanirun.com/data/gpus.json)**: VRAM, memory bandwidth (per configuration for unified-memory chips) and launch price

```bash
curl -s https://whatmodelscanirun.com/data/models.json | jq '.models[0]'
```

Every field, its units, how it's measured and the schema-version policy are documented at **[whatmodelscanirun.com/data](https://whatmodelscanirun.com/data/)**. Attribution with a link is appreciated.

---

## Architecture

### Tech stack

- **SvelteKit** (Svelte 5) with `adapter-static` — builds to pure HTML/JS/CSS, no server required
- **Vite 8** — dev server and bundler
- **Static JSON** — GPU and model data imported at build time (no runtime fetches)

### Project structure

```
src/
├── app.html                        # HTML shell
├── app.css                         # Global styles / design tokens
├── service-worker.js               # Offline cache (network-first for pages)
├── routes/
│   ├── +layout.js                  # prerender = true (static output)
│   ├── +layout.svelte              # Shell: header, nav, footer, global CSS import
│   ├── +page.svelte                # Main page: wires GpuInput ↔ ModelResults
│   ├── gpus/ , gpu/[slug]/         # GPU index and one landing page per GPU
│   ├── models/ , model/[slug]/     # Model index and one landing page per model
│   ├── primer/ , privacy/          # Static content pages
│   └── sitemap.xml/                # Prerendered sitemap
└── lib/
    ├── calculations.js             # All fit / context / speed logic (pure functions)
    ├── pages.js                    # Slugs, URLs and structured data for landing pages
    ├── affiliate.js , notify.js    # Amazon links; email-alert signup helpers
    ├── analytics.js                # PostHog event helpers
    ├── data/
    │   ├── gpus.json               # GPU database (VRAM, bandwidth, manufacturer)
    │   └── models.json             # Model database (weights, KV cache, quantizations)
    └── components/
        ├── GpuInput.svelte         # GPU picker + manual VRAM + context filter
        ├── SearchSelect.svelte     # Reusable searchable dropdown with grouping
        ├── ModelResults.svelte     # Results display
        └── …                       # Summary, signup and affiliate components
scripts/                            # Python tools that maintain the JSON data
tests/e2e/                          # Playwright tests against the production build
```

### Data flow

```
User input (GPU or VRAM)
        │
        ▼
   GpuInput.svelte
   ├── vram (number | null)         ← from GPU lookup or manual entry
   ├── bandwidth (number | null)    ← from GPU lookup (null if manual)
   └── minContextK (number | null)  ← from context dropdown
        │
        ▼  (bound props)
   +page.svelte
        │
        ▼  (passed as props)
   ModelResults.svelte
   ├── calcMaxContext()              → max context tokens per model
   ├── calcTokPerSec()              → estimated generation speed
   └── bucket into: fits / tight / doesn't fit
        │
        ▼
   Rendered results (cards with stats)
```

All state is reactive via Svelte 5 runes (`$state`, `$derived`, `$bindable`). There is no store, no backend, and no API calls — everything runs client-side with data baked in at build time.

---

## Algorithm details

### 1. VRAM budget: weights + KV cache

Total GPU memory usage for an LLM is:

```
total_vram = weight_gb + (kv_per_1k_gb × context_length_k)
```

Where:
- **`weight_gb`** — size of the model weights in memory (depends on parameter count and quantization)
- **`kv_per_1k_gb`** — KV cache cost per 1,000 tokens of context
- **`context_length_k`** — number of tokens in the context window, in thousands

### 2. KV cache calculation

The KV cache stores key and value tensors for every layer and every token in the context. Per token:

```
kv_bytes_per_token = 2 × num_layers × num_kv_heads × head_dim × bytes_per_value
```

- **Factor of 2** — one for keys, one for values
- **`num_layers`** — transformer layers (e.g. 28 for Llama 3.2 3B, 32 for Llama 3.1 8B)
- **`num_kv_heads`** — KV heads after GQA (typically 8 for Llama models)
- **`head_dim`** — dimension per head (typically 128)
- **`bytes_per_value`** — 2 for fp16 (the default KV cache precision)

We precompute `kv_per_1k_gb = kv_bytes_per_token × 1000 / 1024³` and store it in `models.json`.

### 3. Maximum context window

Given the user's VRAM, the max context for a model is:

```
available_for_kv = user_vram - weight_gb
max_context_k = floor(available_for_kv / kv_per_1k_gb)
```

This is capped at the model's trained context limit (`max_context_k` in the data).

### 4. Estimated generation speed

Generating a token (the decode phase) is limited by memory bandwidth, not compute: each token reads the model's weights from memory once. The estimate is that read time plus a small, empirically fitted overhead. The code is `calcTokPerSec` in [`src/lib/calculations.js`](src/lib/calculations.js).

**Dense models:**

```
tok/s ≈ bandwidth_gbps / (weight_gb × 1.0737 + 1.0)
```

**Sparse MoE models** (rows with `active_weight_gb`): only the active experts are read per token, but routing, top-k selection and one small kernel per expert add a near-constant time per token:

```
seconds/token ≈ (active_weight_gb × 1.0737 + 1.0) / bandwidth_gbps + 0.0025
```

`active_weight_gb` is the GGUF size scaled by active / total parameters (Qwen3.5 35B A3B Q4_K_M: 20.5 GiB × 3/35 = 1.76 GiB). The 2.5 ms caps any MoE model below 400 tok/s, which matches the fastest published results. All the weights still have to fit in memory; only the speed uses the active subset.

**Apple Ultra chips** (M1, M2, M3 and M5 Ultra) use 70% of their quoted bandwidth. An Ultra is two dies joined together, and its quoted figure is the sum of both, which a single decode stream doesn't reach. Single-die Apple chips (M5 Max, M5 Pro and so on) and every NVIDIA, AMD and Intel GPU use the quoted figure.

**Units.** `weight_gb` is in GiB (2^30 bytes), because it is compared with VRAM, and a "24 GB" card holds 24 GiB. Bandwidth is quoted in decimal GB/s (10^9 bytes/s). So the weights are multiplied by 2^30 / 10^9 = 1.0737 to get the bytes read per token in the same unit as the bandwidth. Leaving that out would make every estimate about 7% optimistic. The 1.0 GB overhead (KV cache reads at short context, activations, engine overhead) and the 2.5 ms are both in decimal units, as fitted.

**How well it matches.** The constants are checked against published `llama-bench` `tg128` results across NVIDIA, AMD and Apple hardware. The data, sources and fits are in [`docs/speed-calibration.md`](docs/speed-calibration.md). In summary (median absolute error / worst case):

| Set | Points | Error |
|---|---|---|
| Dense, NVIDIA and DGX Spark | 8 | 8% / +28% |
| Dense, Apple single-die chips, 2026 builds | 14 | 2% / +14% |
| Dense, Apple Ultra chips, 2026 builds | 11 | 13% / −23% |
| MoE, NVIDIA and AMD | 18 | 16% / −37% |
| MoE, not used in the fit | 11 | 17% / +32% |

The first calibration of the dense formula was a set of LM Studio runs on a Radeon RX 9070 XT (640 GB/s). It still holds with the current formula:

| Model | GiB | GB | Predicted tok/s | Actual tok/s | Error |
|---|---|---|---|---|---|
| Llama 3.1 8B Q8_0 | 7.95 | 8.54 | 67 | 67.89 | −1.3% |
| Qwen 2.5 7B Q8_0 | 7.54 | 8.10 | 70 | 72.44 | −3.4% |
| Qwen 2.5 7B Q6_K | 5.82 | 6.25 | 88 | 89.50 | −1.7% |
| Llama 3.1 8B Q4_K_M | 4.58 | 4.92 | 108 | 109.07 | −1.0% |
| Qwen 2.5 7B Q4_K_M | 4.36 | 4.68 | 113 | 107.51 | +5.1% |
| Llama 3.2 3B Q8_0 | 3.19 | 3.42 | 145 | 143.85 | +0.8% |
| Llama 3.2 3B Q4_K_M | 1.88 | 2.02 | 212 | 205.60 | +3.1% |
| Llama 3.2 1B Q4_K_M | 0.72 | 0.77 | 361 | 391.48 | −7.8% |

For comparison, the raw `bandwidth / weight` ceiling overestimated these by 10–35%.

**What it doesn't cover:**

- **Decode only.** There is no estimate of prompt processing or time to first token, which depend on compute rather than bandwidth. A long prompt on a slow GPU can take far longer than the tok/s figure suggests.
- **Short context.** The figures are for an almost empty context. Decode slows as the KV cache grows, most on models with full attention in every layer.
- **fp16 KV cache only.** The memory maths and the overhead both assume an fp16 KV cache. A quantized cache (`-ctk q8_0`) fits more context than the site shows.
- **Fast NVIDIA cards are 10–30% optimistic** on dense models (RTX 3090, 4090 and 5090). Something per token that doesn't scale with bytes is slowing them down, and the formula doesn't model it.
- **Software matters.** The estimates assume a recent llama.cpp build. Apps that bundle an older one, and some Ollama and LM Studio runtimes, can be noticeably slower, especially on Apple Silicon. MoE speeds also move between llama.cpp releases, and MLA (GLM, DeepSeek) and hybrid linear-attention models run 15–40% below their active-weight estimate.
- **Multi-GPU** pools VRAM and scales bandwidth by an efficiency factor (85% for two cards, 75% for three, 70% for four or more). That's a rough guide, not a calibrated figure. Weight offload to system RAM applies an uncalibrated 12–50% penalty on top.

Speed estimates are only shown when a GPU is selected from the list (which provides bandwidth). Manual VRAM entry does not produce speed estimates.

### 5. Result bucketing

Each model is placed into one of three buckets:

| Bucket | Condition |
|---|---|
| **Runs well** | Fits in VRAM with ≥ 4K context, meets any user-set minimums |
| **Tight fit** | Fits but with < 4K context, or below user's minimum context/speed |
| **Doesn't fit** | Weights alone exceed available VRAM |

---

## Data schemas

### GPU entry (`gpus.json`)

Discrete GPUs use top-level `vram_gb` and `bandwidth_gbps`:

```json
{
  "id": "rtx-4090",
  "name": "GeForce RTX 4090",
  "manufacturer": "NVIDIA",
  "vram_gb": 24,
  "bandwidth_gbps": 1008
}
```

Apple Silicon chips use `vram_options` instead — an array of memory configurations, each with its own bandwidth (since bandwidth can vary by memory config on chips like M3 Max / M4 Max):

```json
{
  "id": "m4-max",
  "name": "M4 Max",
  "manufacturer": "Apple",
  "vram_options": [
    { "vram_gb": 36,  "bandwidth_gbps": 410 },
    { "vram_gb": 64,  "bandwidth_gbps": 546 },
    { "vram_gb": 128, "bandwidth_gbps": 546 }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Display name (without manufacturer prefix) |
| `manufacturer` | string | `"NVIDIA"`, `"AMD"`, `"Intel"`, or `"Apple"` — used for dropdown grouping |
| `vram_gb` | number | Video memory in GB (discrete GPUs only) |
| `bandwidth_gbps` | number | Memory bandwidth in GB/s (discrete GPUs only) |
| `vram_options` | array | Memory configurations (Apple Silicon only). Each entry has `vram_gb` and `bandwidth_gbps` |

### Model entry (`models.json`)

```json
{
  "id": "llama-3.1-8b-q4",
  "name": "Llama 3.1 8B",
  "params_b": 8.03,
  "quantization": "Q4_K_M",
  "weight_gb": 4.58,
  "kv_per_1k_gb": 0.122,
  "max_context_k": 128,
  "notes": "32 layers, 8 KV heads, head_dim 128. GGUF Q4_K_M file size."
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier |
| `name` | string | Model family and size |
| `params_b` | number | Parameter count in billions |
| `quantization` | string | Quantization format (fp16, Q8_0, Q4_K_M, etc.) |
| `weight_gb` | number | Weight file size in GiB (bytes / 2^30, ≈ VRAM for weights) |
| `kv_per_1k_gb` | number | KV cache cost per 1K tokens in GB (fp16 KV cache) |
| `max_context_k` | number | Model's trained max context length in thousands |
| `notes` | string | Architecture details and data sources |

---

## Data sources

- **Weight sizes**: Actual GGUF file sizes from HuggingFace (deterministic per model architecture and quantization format)
- **KV cache**: Calculated from model `config.json` architecture parameters (layers, KV heads, head_dim)
- **GPU VRAM**: Official manufacturer specifications
- **GPU bandwidth**: Official specs, Wikipedia GeForce/Radeon series articles, NVIDIA datasheets, AMD reference docs

---

## Helper scripts

Helper scripts for maintaining JSON data are organized by domain:

- `scripts/models/` - model helper scripts (`add_model.py`, `update_model_stats.py`, `list_recent_models.py`, `extract_model_ids.py`)
- `scripts/gpus/` - GPU helper scripts (`add_gpu.py`, `update_gpu_specs.py`, `list_recent_gpus.py`, `extract_gpu_ids.py`)

For full usage examples and flags, see:

- `scripts/README.md`
- `scripts/models/README.md`
- `scripts/gpus/README.md`

---

## Adding data

### Adding a GPU

Add an entry to `src/lib/data/gpus.json`. Keep entries grouped by manufacturer, sorted newest-first within each group.

### Adding a model

Add entries to `src/lib/data/models.json`. For each model, you need:

1. **Weight size** — use the actual GGUF file size for each quantization level (any HuggingFace GGUF repo will give the same size for a given model + quant)
2. **KV cache per 1K tokens** — calculate from the model architecture:
   ```
   kv_per_1k_gb = 2 × layers × kv_heads × head_dim × 2 × 1000 / (1024³)
   ```
   (The inner `× 2` is for fp16 = 2 bytes per value)
3. **Max context** — from the model card (e.g. 128K for Llama 3.1/3.2)

---

## Credits

- **[bartowski](https://huggingface.co/bartowski)** — GGUF quantizations on HuggingFace used as the reference source for model weight sizes

---

## Development

```bash
npm install
npm run dev       # Start dev server at http://localhost:5173
npm run build     # Build static site to ./build
npm run preview   # Preview the built site
```
