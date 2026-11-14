# Decode speed calibration

The site estimates decode (token generation) speed from memory bandwidth alone. This page explains the formula, the published benchmarks it is checked against, and where it is known to be off. The code is `calcTokPerSec` in [`src/lib/calculations.js`](../src/lib/calculations.js), and the benchmark checks are in `calculations.test.js`.

## Formula

**Dense models** (unchanged):

```
tok/s = bandwidth / (weight_gb + INFERENCE_OVERHEAD_GB)        INFERENCE_OVERHEAD_GB = 1.0
```

**Sparse MoE models** (rows with `active_weight_gb`):

```
seconds/token = (active_weight_gb + INFERENCE_OVERHEAD_GB) / bandwidth + MOE_TOKEN_OVERHEAD_MS / 1000
                                                                          MOE_TOKEN_OVERHEAD_MS = 2.5
```

`active_weight_gb` is the GGUF size scaled by active/total parameters, for example 20.5 GB × 3/35 = 1.76 GB for Qwen3.5 35B A3B Q4_K_M.

### Why a fixed time per token

The old MoE estimate divided bandwidth by the active weights and nothing else. That predicted ~650 tok/s for Qwen3.5 35B A3B on an RTX 5090, while comparable 3B-active models benchmark at 200–280 tok/s there. The gap does not come from bytes. Each MoE token also has to:

- run the router and the top-k selection;
- launch a small matmul for each selected expert, plus the gather and scatter around them;
- read the shared attention, embedding and output layers. These are often stored at higher precision than the experts, so the proportional `active_weight_gb` undercounts them.

These costs barely shrink as bandwidth grows. In the data they behave like a near-constant time per token, about 2.5 ms, rather than like extra gigabytes. The effect is largest on fast GPUs: the old formula was within ~6% on a 273 GB/s DGX Spark but more than 2× too high on a 1792 GB/s RTX 5090. A constant in GB (option d below) can't fit both ends, but a constant in time can.

On slow memory the estimate is still close to the bandwidth bound. On fast memory it caps below 1000 / 2.5 = 400 tok/s, which matches the best published MoE results (the RTX 5090 reaches ~376 tok/s on gpt-oss 20B).

## Fit

For each candidate model, one constant was fitted by minimising the sum of squared log errors (log(predicted / measured)) over the 26 primary MoE points below. Errors are `predicted / measured − 1`.

| Model of MoE cost | Fitted constant | Median abs. error | Worst error | Median bias |
|---|---|---|---|---|
| Current: bandwidth / (active + 1 GB) | – | 54% | +166% | +54% |
| (b) efficiency factor × bandwidth | 0.60 | 22% | +60% | −7% |
| (c) active + k × (weight − active) | k = 0.096 | 25% | +76% | +14% |
| (d) larger fixed overhead in GB | 3.13 GB | 22% | +70% | −9% |
| (f) multiplier on active weights | 1.96× | 22% | +56% | −7% |
| **(e) fixed time per token (chosen)** | **2.5 ms** | **20%** | **+74%** | **+6%** |

Option (a), active plus shared non-expert weights, needs a per-model split of expert and non-expert parameters that `models.json` doesn't carry. Option (e) adds the time cost those weights cause without needing that split.

(e) was chosen because:

- it is best on the non-Apple points (median 16%, worst −37%, versus 17–25% for the others);
- it is best on the secondary set, which it was not fitted on (median 17%, worst +36%, versus 22–49%);
- it is stable. Leaving out any one GPU moves the fitted value only between 2.3 and 2.8 ms, and leaving out any one model family moves it between 2.3 and 2.9 ms.

A two-parameter version (1.45 × active plus 1.4 ms) lowers the fit error a little, but not enough to justify a second constant.

### Error before and after

| Set | Points | Before: median / worst | After: median / worst |
|---|---|---|---|
| MoE, all primary | 26 | 54% / +166% | 20% / +74% |
| MoE, NVIDIA + AMD | 18 | 44% / +142% | 16% / −37% |
| MoE, Apple Silicon | 8 | 113% / +166% | 37% / +74% |
| MoE, secondary (not fitted) | 11 | 106% / +243% | 17% / +36% |
| Dense, primary | 13 | 23% / +84% | unchanged |
| Dense, NVIDIA | 8 | 8% / +28% | unchanged |
| Dense, Apple Silicon | 5 | 47% / +84% | unchanged |

The dense formula is not changed.

## Benchmarks

Primary points are `llama-bench` `tg128` at depth 0 (`tg32` for the DGX Spark rows), fully offloaded to the GPU. Weight is the GGUF size in GB (GiB × 1.074). Active weight uses the same convention as `models.json`. Bandwidth is the value in `gpus.json`.

### MoE: primary

| Model | GPU | GB/s | Weight GB | Active GB | Measured | Old | New | Source |
|---|---|---|---|---|---|---|---|---|
| gpt-oss 20B MXFP4 | RTX 5090 | 1792 | 12.10 | 2.08 | 375.9 | 582 (+55%) | 237 (−37%) | [PR #16991](https://github.com/ggml-org/llama.cpp/pull/16991), Nov 2025 |
| Qwen3 30B-A3B Q4_K_M | RTX 5090 | 1792 | 18.55 | 1.82 | 276.8 | 635 (+130%) | 245 (−11%) | [PR #16991](https://github.com/ggml-org/llama.cpp/pull/16991), Nov 2025 |
| gpt-oss 20B MXFP4 | RTX Pro 6000 | 1792 | 12.10 | 2.08 | 286.9 | 582 (+103%) | 237 (−17%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 120B MXFP4 | RTX Pro 6000 | 1792 | 63.37 | 2.77 | 196.3 | 475 (+142%) | 217 (+11%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | RTX 4090 | 1008 | 12.10 | 2.08 | 225.2 | 327 (+45%) | 180 (−20%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| Qwen3 30B-A3B Q4_K_M | RTX 4090 | 1008 | 18.55 | 1.82 | 268.1 | 357 (+33%) | 189 (−30%) | [PR #16991](https://github.com/ggml-org/llama.cpp/pull/16991), Nov 2025 † |
| gpt-oss 20B MXFP4 | RTX 3090 | 936 | 12.10 | 2.08 | 161.8 | 304 (+88%) | 173 (+7%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| Qwen3.5 35B-A3B Q4_0 | RTX 3090 Ti | 1008 | 21.24 | 1.82 | 152.6 | 357 (+134%) | 189 (+24%) | [Discussion #19890](https://github.com/ggml-org/llama.cpp/discussions/19890), Mar 2026 ‡ |
| gpt-oss 20B MXFP4 | RTX 5080 | 960 | 12.10 | 2.08 | 204.9 | 312 (+52%) | 175 (−15%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | RTX 5070 Ti | 896 | 12.10 | 2.08 | 189.5 | 291 (+54%) | 168 (−11%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | RTX 4080 SUPER | 736 | 12.10 | 2.08 | 186.5 | 239 (+28%) | 150 (−20%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | RTX 5060 Ti 16GB | 448 | 12.10 | 2.08 | 111.5 | 145 (+30%) | 107 (−4%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | DGX Spark | 273 | 12.10 | 2.08 | 83.4 | 89 (+6%) | 73 (−13%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| gpt-oss 120B MXFP4 | DGX Spark | 273 | 63.37 | 2.77 | 58.7 | 72 (+23%) | 61 (+4%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| Qwen3-Coder 30B-A3B Q8_0 | DGX Spark | 273 | 32.48 | 3.19 | 61.1 | 65 (+7%) | 56 (−8%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| GLM-4.7-Flash Q8_0 | DGX Spark | 273 | 31.84 | 3.08 | 48.7 | 67 (+37%) | 57 (+18%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| Qwen3 30B-A3B Q4_K_M | Radeon AI PRO R9700 (Vulkan) | 640 | 18.55 | 1.82 | 183.5 | 227 (+24%) | 145 (−21%) | [Discussion #19890](https://github.com/ggml-org/llama.cpp/discussions/19890), Mar 2026 |
| gpt-oss 120B MXFP4 | Ryzen AI Max+ 395 (ROCm) | 256 | 63.37 | 2.77 | 47.5 | 68 (+43%) | 58 (+22%) | [Discussion #16578](https://github.com/ggml-org/llama.cpp/discussions/16578), Oct 2025 (tg32) |
| gpt-oss 20B MXFP4 | M3 Ultra (80c) | 819 | 12.10 | 2.08 | 115.5 | 266 (+130%) | 160 (+38%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| Qwen3.5 35B-A3B Q8_0 | M3 Ultra | 819 | 36.89 | 3.16 | 85.5 | 197 (+130%) | 132 (+54%) | [Issue #21494](https://github.com/ggml-org/llama.cpp/issues/21494), Mar 2026 build § |
| gpt-oss 20B MXFP4 | M2 Ultra (76c) | 800 | 12.10 | 2.08 | 116.1 | 260 (+124%) | 157 (+36%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 120B MXFP4 | M2 Ultra (76c) | 800 | 63.37 | 2.77 | 79.7 | 212 (+166%) | 139 (+74%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | M4 Max (40c) | 546 | 12.10 | 2.08 | 95.9 | 177 (+85%) | 123 (+28%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | M1 Max | 400 | 12.10 | 2.08 | 75.2 | 130 (+73%) | 98 (+30%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | M3 Max | 400 | 12.10 | 2.08 | 64.3 | 130 (+102%) | 98 (+52%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |
| gpt-oss 20B MXFP4 | M4 Pro | 273 | 12.10 | 2.08 | 63.3 | 89 (+40%) | 73 (+15%) | [Discussion #15396](https://github.com/ggml-org/llama.cpp/discussions/15396), Aug 2025 |

† From a 4090 table in the PR that the page fetch didn't parse cleanly; 268.1 comes from the search snippet (248.8 before the PR). The same author's [optimisation write-up](https://github.com/ggml-org/llama.cpp/discussions/17621) gives 198 (baseline) to 271 (with `GGML_CUDA_GRAPH_OPT=1`).
‡ `llama-sweep-bench` at depth 0 on mainline llama.cpp, not `llama-bench`.
§ A later build on the same machine gave 73.4, a Metal regression reported in that issue.

### MoE: secondary (checked, not fitted)

These are averaged runs, runs at 4K depth, or partly sized from `models.json`, so they are weaker evidence.

| Model | GPU | Measured | Old | New | Source |
|---|---|---|---|---|---|
| Qwen3.5 35B-A3B UD-Q4_K_XL (TG average, q8 KV) | RTX 5090 | 194.0 | 666 (+243%) | 250 (+29%) | [Discussion #19890](https://github.com/ggml-org/llama.cpp/discussions/19890), Feb 2026 |
| Qwen3.5 35B-A3B UD-Q4_K_XL (TG average) | R9700 (Vulkan) | 127.4 | 238 (+87%) | 149 (+17%) | [Discussion #19890](https://github.com/ggml-org/llama.cpp/discussions/19890), Feb 2026 |
| Qwen3 30B-A3B Q4_K @ 4K | RTX 3090 | 153.6 | 332 (+116%) | 181 (+18%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-3090/), Mar 2026 |
| Qwen3 30B-A3B Q4_K @ 4K | RTX 4090 | 207.3 | 357 (+72%) | 189 (−9%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-4090/), Mar 2026 |
| Qwen3 30B-A3B Q4_K @ 4K | RTX 5090 | 226.1 | 635 (+181%) | 245 (+9%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-5090/), Mar 2026 |
| gpt-oss 20B MXFP4 @ 4K | RTX 3090 | 147.5 | 304 (+106%) | 173 (+17%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-3090/), Mar 2026 |
| gpt-oss 20B MXFP4 @ 4K | RTX 4090 | 190.6 | 327 (+72%) | 180 (−6%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-4090/), Mar 2026 |
| gpt-oss 20B @ 4K | RTX 5090 | 298.2 | 582 (+95%) | 237 (−21%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-5090/), Mar 2026 |
| Gemma 4 26B-A4B Q4_K @ 4K | RTX 3090 | 119.4 | 272 (+128%) | 162 (+36%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-3090/), Mar 2026 |
| Gemma 4 26B-A4B Q4_K @ 4K | RTX 5090 | 180.3 | 521 (+189%) | 226 (+25%) | [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-5090/), Mar 2026 |
| Nemotron 3 Nano 30B-A3B Q4_K_M | DGX Spark (GB10) | 61.8 | 82 (+33%) | 68 (+10%) | [Discussion #17621](https://github.com/ggml-org/llama.cpp/discussions/17621), Jan 2026 |

### Dense (check only; formula unchanged)

| Model | GPU | GB/s | Weight GB | Measured | Predicted | Source |
|---|---|---|---|---|---|---|
| Llama 2 7B Q4_0 | RTX 5090 | 1792 | 3.82 | 290.0 | 372 (+28%) | [Discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013), Aug 2025 |
| Llama 2 7B Q4_0 | RTX 4090 | 1008 | 3.82 | 186.2 | 209 (+12%) | [Discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013), Aug 2025 |
| Llama 2 7B Q4_0 | RTX 3090 | 936 | 3.82 | 158.2 | 194 (+23%) | [Discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013), Aug 2025 |
| Llama 2 7B Q4_0 | RTX 4080 | 717 | 3.82 | 142.5 | 149 (+4%) | [Discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013), Aug 2025 |
| Llama 2 7B Q4_0 | RTX 3060 | 360 | 3.82 | 75.6 | 75 (−1%) | [Discussion #15013](https://github.com/ggml-org/llama.cpp/discussions/15013), Aug 2025 |
| Qwen3 8B F16 | RTX 5090 | 1792 | 16.39 | 84.4 | 103 (+22%) | [PR #16991](https://github.com/ggml-org/llama.cpp/pull/16991), Nov 2025 |
| Qwen2.5-Coder 7B Q8_0 | DGX Spark | 273 | 8.10 | 29.4 | 30 (+2%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| Gemma 3 4B Q4_0 | DGX Spark | 273 | 2.52 | 81.1 | 78 (−4%) | [DGX Spark bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/dgx-spark/dgx-spark.md), Feb 2026 |
| Llama 2 7B Q4_0 | M2 Ultra (76c) | 800 | 3.82 | 94.3 | 166 (+76%) | [Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167), Nov 2023 |
| Llama 2 7B Q8_0 | M2 Ultra (76c) | 800 | 7.16 | 66.6 | 98 (+47%) | [Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167), Nov 2023 |
| Llama 2 7B Q4_0 | M4 Max (40c) | 546 | 3.82 | 83.1 | 113 (+36%) | [Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M1 Max (32c) | 400 | 3.82 | 61.2 | 83 (+36%) | [Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M3 Ultra (80c) | 819 | 3.82 | 92.1 | 170 (+84%) | [Discussion #4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |

The secondary dense checks ([XiongjieDai `tg1024`](https://github.com/XiongjieDai/GPU-Benchmarks-on-LLM-Inference), May 2024, and [Hardware Corner](https://www.hardware-corner.net/gpu-llm-benchmarks/rtx-4090/) at 4K depth) point the same way. Llama 3 8B Q4_K_M is predicted +42% on a 3090 and +33% on a 4090. Qwen3 32B Q4_K is predicted +23% to +41% on a 3090, 4090 and 5090.

## Known limits

- **Apple Silicon is optimistic for every model, not only MoE.** The formula uses bandwidth alone, and Metal reaches a smaller share of peak bandwidth than CUDA. Dense models are predicted ~35–85% high on M-series chips, and MoE models ~15–75% high after this change. A per-backend efficiency factor would fix both, but it needs the GPU's vendor passed into the speed calculation, so it is left for a separate change.
- **Dense estimates are ~10–30% high on the fastest NVIDIA cards** (RTX 3090, 4090 and 5090). A small fixed per-token time for dense models would help, but the dense formula was kept as it is for this change.
- **MoE results move with llama.cpp releases.** gpt-oss 20B on an RTX 5090 went from 282 tok/s (Aug 2025) to 376 (Nov 2025), and reaches 419 with an opt-in CUDA graph flag. The estimate aims at a recent default build.
- **Long contexts are slower.** All figures are at short context. Decode speed drops as the KV cache grows, especially on models with full attention in every layer.
- Model-specific costs are not modelled. MLA attention (GLM-4.7-Flash, DeepSeek) and hybrid linear-attention layers (Qwen3.5) run 15–40% slower than their active weights suggest.

## Reproducing

Run `llama-bench -m model.gguf -ngl 99 -fa 1 -p 0 -n 128` and compare the `tg128` row with the site's figure for the same GPU. New points with a source link are welcome, and the fit is easy to redo.
