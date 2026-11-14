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

**Apple Ultra chips** (M1, M2, M3 and M5 Ultra) feed both formulas a reduced bandwidth:

```
bandwidth = bandwidth_gbps × APPLE_ULTRA_BANDWIDTH_EFFICIENCY      APPLE_ULTRA_BANDWIDTH_EFFICIENCY = 0.70
```

Every other GPU, single-die Apple chips included, uses its quoted bandwidth. The adjustment is `effectiveBandwidth(gpu, option)` in `calculations.js`; see [Apple Silicon](#apple-silicon).

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
| Dense, Apple Silicon | 5 | 47% / +84% | unchanged (but see [Apple Silicon](#apple-silicon)) |

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

## Apple Silicon

The MoE calibration above found Apple estimates ~47% high (median) for dense models and ~37% high for MoE, against ~8–16% on NVIDIA. That suggested one Metal efficiency factor for all Apple chips. Newer data doesn't support it. The old Apple points come from old llama.cpp builds (Nov 2023 for dense, Aug 2025 for MoE), and Metal has improved a lot since. On 2026 builds:

- **Single-die chips are already accurate.** M5, M5 Pro, M5 Max, M6 and a 400 GB/s M2/M3 Max land within ~2% (median) of the dense formula. An M5 Max is within 12% on gpt-oss 20B and 120B. An Apple-wide factor would make them 15–20% too slow.
- **Ultra chips are still slow.** M1, M2, M3 and M5 Ultra run 13–70% below the formula. An Ultra is two Max dies joined by UltraFusion, and its quoted bandwidth is the sum of both dies' memory. One decode stream doesn't reach it. On the same 2023 build, the M2 and M3 Ultra were already ~35% further from the formula than single-die chips.

So the correction applies to Ultra chips only: `APPLE_ULTRA_BANDWIDTH_EFFICIENCY = 0.70`. Single-die Apple chips, NVIDIA, AMD and Intel are unchanged.

### Fit

Each candidate model was fitted by least squares on log error over the 33 recent-build Apple points below (25 dense, 8 MoE). The MoE formula and its 2.5 ms are kept as they are.

| Model of the Apple gap | Fitted | Dense: median / worst | MoE: median / worst | Single-die dense bias |
|---|---|---|---|---|
| Current: quoted bandwidth | – | 6% / +69% | 38% / +121% | 0% |
| (a) one factor for all Apple chips | 0.84 | 16% / +42% | 29% / +95% | −16% |
| **(b) factor for Ultra chips only (chosen)** | **0.70** | **4% / −23%** | **16% / +72%** | **0%** |
| (c) extra time per token, Ultra only | 2.7 ms | 3% / +34% | 16% / +63% | 0% |
| (d) extra time per token, all Apple | 2.2 ms | 7% / +37% | 22% / +72% | −8% |
| (e) Ultra factor and extra time | 0.91 + 2.15 ms | 4% / +26% | 16% / +64% | 0% |

(b) and (c) fit about equally well. (c) is slightly better on big-weight Ultra rows: with (b), F16 and Q8_0 on an Ultra come out 13–23% low while small Q4 models stay a little high, which is the signature of a fixed cost per token. (b) was chosen anyway because:

- it adjusts bandwidth. It is applied where a GPU is turned into a bandwidth (`effectiveBandwidth`), so `calcTokPerSec`, `bucketModels` and the components don't need to know the vendor;
- it is one documented constant. (e) needs two and gains little;
- it is stable. Leaving out any one Ultra chip moves it between 0.67 and 0.74, and leaving out any one model family moves it between 0.62 and 0.72.

A Metal-specific MoE overhead was also checked. The two single-die MoE points sit within 12% of the CUDA-fitted 2.5 ms, and the Ultra MoE errors move with the dense ones, so the Ultra factor covers both.

### Error before and after

Errors are `predicted / measured − 1`.

| Set | Points | Before: median / worst | After: median / worst |
|---|---|---|---|
| Apple dense, 2026 builds | 25 | 6% / +69% | 4% / −23% |
| … single-die | 14 | 2% / +14% | unchanged |
| … Ultra | 11 | 33% / +69% | 14% / −23% |
| Apple MoE, 2026 builds | 8 | 38% / +121% | 16% / +72% |
| … single-die (M5 Max) | 2 | 11% / −12% | unchanged |
| … Ultra | 6 | 58% / +121% | 23% / +72% |
| Apple dense, the 5 older rows in the dense table above | 5 | 47% / +84% | 29% / +36% |
| Apple MoE, the 8 rows in the MoE table above | 8 | 37% / +74% | 24% / +52% |
| NVIDIA, AMD and Intel | all | – | unchanged (bandwidth passed through) |

The worst remaining MoE error is GLM-4.7-Flash on an M2 Ultra (+72%). It uses MLA attention, which runs slow everywhere: it is +18% on a DGX Spark too. Without it, the worst Ultra MoE error is +27%.

### Benchmarks: 2026 builds (fitted)

`llama-bench` `tg128` unless marked `tg32`, fully offloaded, depth 0. GB/s is the `gpus.json` value. Weight GB is the GGUF size (GiB × 1.074).

| Model | Chip | GB/s | Weight GB | Active GB | Measured | Before | After | Build, source |
|---|---|---|---|---|---|---|---|---|
| Llama 2 7B Q4_0 | M5 Max (40c) | 614 | 3.82 | – | 119.92 | 127 (+6%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M5 Max (40c) | 614 | 7.16 | – | 72.42 | 75 (+4%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M5 Max (40c) | 614 | 13.48 | – | 37.11 | 42 (+14%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M5 Pro (20c) | 307 | 3.82 | – | 66.33 | 64 (−4%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M5 Pro (20c) | 307 | 7.16 | – | 38.92 | 38 (−3%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M5 Pro (20c) | 307 | 13.48 | – | 21.55 | 21 (−2%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M5 (10c) | 153 | 3.82 | – | 31.88 | 32 (0%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M5 (10c) | 153 | 7.16 | – | 18.42 | 19 (+2%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M6 (8c) | 170 | 3.82 | – | 35.74 | 35 (−1%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M6 (8c) | 170 | 7.16 | – | 21.01 | 21 (−1%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M6 (8c) | 170 | 13.48 | – | 11.59 | 12 (+1%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M2 or M3 Max ¶ | 400 | 3.79 | – | 81.57 | 83 (+2%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M2 or M3 Max ¶ | 400 | 7.16 | – | 48.94 | 49 (0%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M2 or M3 Max ¶ | 400 | 13.48 | – | 27.82 | 28 (−1%) | unchanged | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M5 Ultra (80c) # | 1200 | 3.82 | – | 179.10 | 249 (+39%) | 174 (−3%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M5 Ultra (80c) # | 1200 | 7.16 | – | 119.01 | 147 (+24%) | 103 (−14%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M5 Ultra (80c) # | 1200 | 13.48 | – | 73.60 | 83 (+13%) | 58 (−21%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M1 Ultra (64c) | 800 | 3.82 | – | 113.79 | 166 (+46%) | 116 (+2%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q8_0 | M1 Ultra (64c) | 800 | 7.16 | – | 79.13 | 98 (+24%) | 69 (−13%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B F16 | M1 Ultra (64c) | 800 | 13.48 | – | 47.82 | 55 (+16%) | 39 (−19%) | c1d0e7a, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Llama 2 7B Q4_0 | M2 Ultra (76c) | 800 | 3.82 | – | 125.21 | 166 (+33%) | 116 (−7%) | c1d0e7a + FA, Aug 2026, [#4167](https://github.com/ggml-org/llama.cpp/discussions/4167) |
| Qwen2.5-Coder 7B Q8_0 | M2 Ultra | 800 | 8.10 | – | 79.68 (tg32) | 88 (+10%) | 62 (−23%) | b828e18 (7948), early 2026, [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| Gemma 3 4B Q4_0 | M2 Ultra | 800 | 2.52 | – | 134.28 (tg32) | 227 (+69%) | 159 (+18%) | b828e18 (7948), early 2026, [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| Qwen3 4B Q4_0 (`--pure`) | M3 Ultra | 819 | 2.26 ‖ | – | 158.8 | 251 (+58%) | 176 (+11%) | Oct 2026, [PR #31075](https://github.com/ggml-org/llama.cpp/pull/31075) |
| Qwen3.8 27B Q4_0 (`--pure`) | M3 Ultra | 819 | 14.32 ‖ | – | 34.97 | 54 (+53%) | 37 (+7%) | Oct 2026, [PR #31075](https://github.com/ggml-org/llama.cpp/pull/31075) |
| gpt-oss 20B MXFP4 | M5 Max (128 GB) | 614 | 12.10 | 2.08 | 150.75 | 133 (−12%) | unchanged | Oct 2026, [PR #31075](https://github.com/ggml-org/llama.cpp/pull/31075) |
| gpt-oss 120B MXFP4 | M5 Max (40c) | 614 | 63.37 | 2.77 | 104.9 | 116 (+10%) | unchanged | b9592, Jun 2026, [LM Studio #2040](https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/2040) |
| gpt-oss 20B MXFP4 | M2 Ultra (192 GB) | 800 | 12.10 | 2.08 | 137.71 | 158 (+14%) | 125 (−9%) | Oct 2026, [PR #31075](https://github.com/ggml-org/llama.cpp/pull/31075) |
| gpt-oss 20B MXFP4 | M2 Ultra | 800 | 12.10 | 2.08 | 129.97 (tg32) | 158 (+21%) | 125 (−4%) | b828e18 (7948), [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| gpt-oss 120B MXFP4 | M2 Ultra | 800 | 63.37 | 2.77 | 85.60 (tg32) | 139 (+62%) | 108 (+27%) | b828e18 (7948), [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| Qwen3-Coder 30B-A3B Q8_0 | M2 Ultra | 800 | 32.48 | 3.19 | 78.97 (tg32) | 129 (+64%) | 100 (+27%) | b828e18 (7948), [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| GLM-4.7-Flash Q8_0 | M2 Ultra | 800 | 31.84 | 3.08 | 59.58 (tg32) | 132 (+121%) | 102 (+72%) | b828e18 (7948), [Mac M2 Ultra bench](https://github.com/ggml-org/llama.cpp/blob/master/benches/mac-m2-ultra/mac-m2-ultra.md) |
| Qwen3.5 35B-A3B Q8_0 | M3 Ultra | 819 | 36.89 | 3.16 | 85.5 | 132 (+54%) | 103 (+20%) | Mar 2026 build, [Issue #21494](https://github.com/ggml-org/llama.cpp/issues/21494) |

¶ The poster names no chip. The comment re-runs their Nov 2023 post with 12 threads, and its numbers track the M2 Max (38c) row of the 2023 table. Every M1–M3 Max at that tier has 400 GB/s, which is all the check needs. This Q4_0 file is 3.53 GiB.
\# The #4167 table lists the M5 Ultra at 1228 GB/s; `gpus.json` has 1200. At 1228 the Ultra errors move by about 2 points.
‖ Sized as parameters × 4.5 bits (Q4_0 on every tensor). For Qwen3.8 27B this is scaled from the `models.json` Q8_0 size, because its listed parameter count includes tensors the GGUF doesn't carry.

### Benchmarks: older builds (not fitted)

These are the Apple rows from the tables above, measured on older builds, and are kept as a check only. After the change they are 3–36% high, which build drift alone explains. The same M2 Ultra ran Llama 2 7B Q4_0 at 94.3 tok/s on the Nov 2023 build and 125.2 on Aug 2026's c1d0e7a. It ran gpt-oss 20B at 116.1 in Aug 2025 and 137.7 in Oct 2026. An M5 Max went from 103–104 tok/s on the old 8e672ef build (Mar 2026) to 119.9 on c1d0e7a.

| Model | Chip | Measured | Before | After | Build |
|---|---|---|---|---|---|
| Llama 2 7B Q4_0 | M2 Ultra (76c) | 94.3 | 166 (+76%) | 116 (+23%) | 8e672ef, Nov 2023 |
| Llama 2 7B Q8_0 | M2 Ultra (76c) | 66.6 | 98 (+47%) | 69 (+3%) | 8e672ef, Nov 2023 |
| Llama 2 7B Q4_0 | M3 Ultra (80c) | 92.1 | 170 (+84%) | 119 (+29%) | 8e672ef |
| Llama 2 7B Q4_0 | M4 Max (40c) | 83.1 | 113 (+36%) | unchanged | 8e672ef |
| Llama 2 7B Q4_0 | M1 Max (32c) | 61.2 | 83 (+36%) | unchanged | 8e672ef |
| gpt-oss 20B MXFP4 | M3 Ultra (80c) | 115.5 | 160 (+38%) | 127 (+10%) | c8d0d14 (6310), Aug 2025 |
| gpt-oss 20B MXFP4 | M2 Ultra (76c) | 116.1 | 158 (+36%) | 125 (+8%) | 79c1160 (6123), Aug 2025 |
| gpt-oss 120B MXFP4 | M2 Ultra (76c) | 79.7 | 139 (+74%) | 108 (+36%) | 79c1160 (6123), Aug 2025 |
| gpt-oss 20B MXFP4 | M4 Max (40c) | 95.9 | 123 (+28%) | unchanged | 8b69686 (6293), Aug 2025 |
| gpt-oss 20B MXFP4 | M1 Max | 75.2 | 98 (+30%) | unchanged | 2e2b22b (6180), Aug 2025 |
| gpt-oss 20B MXFP4 | M3 Max | 64.3 | 98 (+52%) | unchanged | e92734d (6250), Aug 2025 † |
| gpt-oss 20B MXFP4 | M4 Pro | 63.3 | 73 (+15%) | unchanged | 0fd90db (6280), Aug 2025 |

† ggerganov suspected this run was heat-throttled.

Not used: two BF16 MoE runs on an M1 Ultra ([Issue #19480](https://github.com/ggml-org/llama.cpp/issues/19480), Mar 2026: Qwen3-VL 30B-A3B at 56.6 tok/s, Qwen3.5 35B-A3B at 35.5). M1 has no native BF16, so they measure emulation rather than bandwidth. Ollama, MLX and LM Studio chat figures from review sites aren't used either, since they don't follow the `llama-bench` method.

### Limits

- **Single-die M1–M4 chips have only one 2026-build point**, a 400 GB/s Max that matches the formula within 2%. The older M4 Max, M1 Max and M4 Pro rows are 15–36% high, about what build drift explains. If current builds still leave these chips behind, the site is optimistic for them. New `c1d0e7a` runs on these chips would settle it.
- **Ultra errors depend on model size.** One factor leaves big-weight models (7B at F16 or Q8_0) 13–23% low on Ultra chips, and small ones up to 18% high. A fixed time per token (option c) would fit better, but it needs the vendor inside `calcTokPerSec`.
- **gpt-oss 120B and other deep MoE models stay 10–27% high on every platform**, Apple included. That comes from the shared MoE formula, not from Metal.
- **The M5 generation is fast on recent builds.** An M5 Max beats the gpt-oss 20B estimate by 12%. Single-die chips are left at 1.0 rather than raised to fit two MoE points.
- **Ultra detection is by name**: `manufacturer` is Apple and the name contains "Ultra". `gpus.json` has no die-count field. A test pins the matched set to M1, M2, M3 and M5 Ultra.

## Known limits

- **Apple estimates assume a recent llama.cpp build.** Metal decode speed rose 15–35% between 2023 and 2026 builds on the same machines. Apps that bundle an older llama.cpp, or Ollama and LM Studio runtimes that lag upstream, will be slower than the site says. See [Apple Silicon](#apple-silicon) for the remaining Ultra and MoE errors.
- **Dense estimates are ~10–30% high on the fastest NVIDIA cards** (RTX 3090, 4090 and 5090). A small fixed per-token time for dense models would help, but the dense formula was kept as it is for this change.
- **MoE results move with llama.cpp releases.** gpt-oss 20B on an RTX 5090 went from 282 tok/s (Aug 2025) to 376 (Nov 2025), and reaches 419 with an opt-in CUDA graph flag. The estimate aims at a recent default build.
- **Long contexts are slower.** All figures are at short context. Decode speed drops as the KV cache grows, especially on models with full attention in every layer.
- Model-specific costs are not modelled. MLA attention (GLM-4.7-Flash, DeepSeek) and hybrid linear-attention layers (Qwen3.5) run 15–40% slower than their active weights suggest.

## Reproducing

Run `llama-bench -m model.gguf -ngl 99 -fa 1 -p 0 -n 128` and compare the `tg128` row with the site's figure for the same GPU. New points with a source link are welcome, and the fit is easy to redo.
