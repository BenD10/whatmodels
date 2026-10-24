/**
 * Shared calculation functions for model-GPU compatibility.
 *
 * These are pure functions with no side effects, extracted here so they
 * can be unit-tested independently of the Svelte component layer.
 */

/**
 * Additional memory overhead for inference engine internals (activations,
 * scratch buffers, etc.). Empirically derived from real-world benchmarks
 * on consumer GPUs using llama.cpp-based engines.
 */
export const INFERENCE_OVERHEAD_GB = 1.0;

/**
 * Models with less than this context (in K tokens) are considered a
 * "tight fit" regardless of other criteria.
 */
export const TIGHT_FIT_CONTEXT_K = 4;

/**
 * Calculate effective VRAM and bandwidth for multi-GPU setups.
 * VRAM pools additively, but bandwidth has communication overhead.
 *
 * @param {number} vram - Single GPU VRAM in GB
 * @param {number|null} bandwidth - Single GPU bandwidth in GB/s (null if unknown)
 * @param {number} quantity - Number of identical GPUs (1-8)
 * @returns {{ vram: number, bandwidth: number|null }}
 */
export function calcMultiGpuResources(vram, bandwidth, quantity) {
  if (quantity === 1 || quantity == null) {
    return { vram, bandwidth };
  }

  // VRAM pools linearly
  const totalVram = vram * quantity;

  // Bandwidth has communication overhead
  if (bandwidth == null) {
    return { vram: totalVram, bandwidth: null };
  }

  // Communication efficiency decreases with more GPUs
  const efficiency = quantity === 2 ? 0.85 : (quantity === 3 ? 0.75 : 0.70);
  const effectiveBandwidth = Math.round(bandwidth * quantity * efficiency);

  return { vram: totalVram, bandwidth: effectiveBandwidth };
}

/**
 * For a given model and user VRAM, calculate the max context (in K tokens)
 * that fits. Capped at the model's trained max_context_k.
 *
 * @param {{ weight_gb: number, kv_per_1k_gb: number, max_context_k: number }} model
 * @param {number} userVram  Available VRAM in GB
 * @returns {number} Max context in K tokens (0 if model doesn't fit)
 */
export function calcMaxContext(model, userVram) {
  const availableForKv = userVram - model.weight_gb;
  if (availableForKv <= 0) return 0;
  if (model.kv_per_1k_gb <= 0) return model.max_context_k;
  const maxTokensK = availableForKv / model.kv_per_1k_gb;
  return Math.min(Math.floor(maxTokensK), model.max_context_k);
}

/**
 * Estimate decode tokens/sec from memory bandwidth.
 * During autoregressive generation, every token requires reading all weights
 * plus additional memory for KV cache reads, activations, and engine overhead.
 *
 * tok/s ≈ bandwidth / (weight_gb + overhead)
 *
 * For sparse MoE models, only the active expert weights are read per token.
 * active_weight_gb captures this: VRAM still holds all weights, but bandwidth
 * is bound by the active subset.
 *
 * @param {{ weight_gb: number, active_weight_gb?: number }} model
 * @param {number|null} bandwidth  Memory bandwidth in GB/s, or null if unknown
 * @returns {number|null} Estimated tokens per second, or null if bandwidth unknown
 */
export function calcTokPerSec(model, bandwidth) {
  if (bandwidth == null) return null;
  const effectiveWeight = model.active_weight_gb ?? model.weight_gb;
  return Math.round(bandwidth / (effectiveWeight + INFERENCE_OVERHEAD_GB));
}

/**
 * Maximum weight-offload ratio we consider practical. Beyond this the
 * model is too slow to be useful and goes into "doesn't fit".
 */
export const MAX_OFFLOAD_RATIO = 0.5;

/**
 * Calculate the max context (in K tokens) when system RAM can be used
 * to extend the KV cache beyond what VRAM alone supports.
 *
 * When systemRamGB is null/undefined, behaves identically to calcMaxContext().
 *
 * @param {{ weight_gb: number, kv_per_1k_gb: number, max_context_k: number }} model
 * @param {number} vram  Available VRAM in GB
 * @param {number|null} systemRamGB  System RAM available for KV overflow (null = VRAM-only)
 * @returns {{ maxCtxK: number, vramCtxK: number, ramCtxK: number, usingSystemRam: boolean }}
 */
export function calcMaxContextWithOffload(model, vram, systemRamGB) {
  const availableForKv = vram - model.weight_gb;
  if (availableForKv <= 0) return { maxCtxK: 0, vramCtxK: 0, ramCtxK: 0, usingSystemRam: false };
  if (model.kv_per_1k_gb <= 0) {
    return { maxCtxK: model.max_context_k, vramCtxK: model.max_context_k, ramCtxK: 0, usingSystemRam: false };
  }

  const vramCtxK = Math.floor(availableForKv / model.kv_per_1k_gb);

  if (systemRamGB == null) {
    // VRAM-only: same as calcMaxContext
    const capped = Math.min(vramCtxK, model.max_context_k);
    return { maxCtxK: capped, vramCtxK: capped, ramCtxK: 0, usingSystemRam: false };
  }

  const ramCtxK = Math.floor(systemRamGB / model.kv_per_1k_gb);
  const totalCtxK = Math.min(vramCtxK + ramCtxK, model.max_context_k);
  const actualRamCtxK = totalCtxK - Math.min(vramCtxK, totalCtxK);

  return {
    maxCtxK: totalCtxK,
    vramCtxK: Math.min(vramCtxK, totalCtxK),
    ramCtxK: actualRamCtxK,
    usingSystemRam: actualRamCtxK > 0,
  };
}

/**
 * Calculate how much of a model's weights must be offloaded to system RAM
 * when the model doesn't fully fit in VRAM.
 *
 * Returns feasible: false when offloading is not possible (no system RAM,
 * >50% offload ratio, or insufficient system RAM).
 *
 * @param {{ weight_gb: number, layers: number }} model
 * @param {number} vram  Available VRAM in GB
 * @param {number|null} systemRamGB  System RAM available (null = no offloading)
 * @returns {{ feasible: boolean, gpuWeightGB?: number, ramWeightGB?: number, offloadRatio?: number, estimatedLayers?: number }}
 */
export function calcOffloadConfig(model, vram, systemRamGB) {
  // Reserve minimal space for KV cache + overhead
  const reserveForKV = INFERENCE_OVERHEAD_GB;
  const availableForWeights = vram - reserveForKV;

  // Model fits entirely on GPU — no offloading needed
  if (model.weight_gb <= availableForWeights) {
    return { feasible: true, gpuWeightGB: model.weight_gb, ramWeightGB: 0, offloadRatio: 0, estimatedLayers: 0 };
  }

  // Can't offload without system RAM
  if (systemRamGB == null) return { feasible: false };

  const ramWeightGB = model.weight_gb - Math.max(availableForWeights, 0);
  const offloadRatio = ramWeightGB / model.weight_gb;

  // Too much offload is impractical, or not enough system RAM
  if (offloadRatio > MAX_OFFLOAD_RATIO || ramWeightGB > systemRamGB) {
    return { feasible: false };
  }

  return {
    feasible: true,
    gpuWeightGB: Math.max(availableForWeights, 0),
    ramWeightGB,
    offloadRatio,
    estimatedLayers: Math.round(offloadRatio * (model.layers ?? 0)),
  };
}

/**
 * Estimate the performance penalty from weight offloading.
 *
 * Based on empirical data from NEO, OFFMATE, and llama.cpp benchmarks:
 * - Base penalty scales linearly from ~15% at low offload to ~50% at max offload
 * - Lower-bandwidth GPUs see relatively less penalty (smaller gap between
 *   GPU memory and system RAM speeds)
 *
 * @param {number} offloadRatio  Fraction of weights offloaded (0–0.5)
 * @param {number|null} bandwidth  GPU memory bandwidth in GB/s (null if unknown)
 * @returns {{ penaltyPercent: number, speedMultiplier: number }}
 */
export function calcOffloadPenalty(offloadRatio, bandwidth) {
  if (offloadRatio <= 0) return { penaltyPercent: 0, speedMultiplier: 1.0 };

  // Base penalty: 15% at minimal offload, scaling to 50% at max
  let penalty = 0.15 + offloadRatio * 0.70;

  // Bandwidth adjustment: weaker GPUs (<400 GB/s) see ~20% less penalty
  if (bandwidth != null) {
    if (bandwidth < 400) {
      penalty *= 0.80;
    } else if (bandwidth < 700) {
      penalty *= 0.90;
    }
    // High-end GPUs (700+) use full penalty
  }

  penalty = Math.min(penalty, 0.50);

  return {
    penaltyPercent: Math.round(penalty * 100),
    speedMultiplier: 1 - penalty,
  };
}

/**
 * Format a context value (in K tokens) for display.
 * @param {number} k  Context in K tokens
 * @returns {string}
 */
export function contextLabel(k) {
  if (k >= 1000) return `${(k / 1000).toFixed(0)}M`;
  return `${k}K`;
}

/**
 * Format a tokens/sec value for display.
 * @param {number|null} tps  Tokens per second, or null
 * @returns {string|null}
 */
export function tokLabel(tps) {
  if (tps == null) return null;
  return `~${tps} tok/s`;
}

/** Minimum MMLU score for the "Good" quality tier. */
export const GOOD_QUALITY_MMLU = 67;

/**
 * Quality tier based on MMLU score.
 * @param {number} score  MMLU score
 * @returns {{ label: string, cls: string }}
 */
export function qualityTier(score) {
  if (score >= 83) return { label: 'Excellent', cls: 'tier-excellent' };
  if (score >= 75) return { label: 'Great', cls: 'tier-great' };
  if (score >= GOOD_QUALITY_MMLU) return { label: 'Good', cls: 'tier-good' };
  if (score >= 55) return { label: 'Fair', cls: 'tier-fair' };
  return { label: 'Basic', cls: 'tier-basic' };
}

/**
 * Quality tier based on SWE-bench Verified score (% resolved).
 * SWE-bench ranges ~0–50% for local models, so thresholds are different from MMLU.
 * @param {number|null} score  SWE-bench score (null if unavailable)
 * @returns {{ label: string, cls: string }}
 */
export function codingQualityTier(score) {
  if (score == null) return { label: 'N/A', cls: 'tier-na' };
  if (score >= 30) return { label: 'Excellent', cls: 'tier-excellent' };
  if (score >= 22) return { label: 'Great', cls: 'tier-great' };
  if (score >= 15) return { label: 'Good', cls: 'tier-good' };
  if (score >= 8) return { label: 'Fair', cls: 'tier-fair' };
  return { label: 'Basic', cls: 'tier-basic' };
}

/**
 * Compare function for sorting by a score field (descending).
 * Null scores always sort to the bottom.
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number}
 */
function compareScores(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

/**
 * Bucket a list of models into "fits", "tight", and "noFit" categories
 * based on available VRAM and optional minimum-context / minimum-speed /
 * required-features filters.
 * Results are sorted by the selected benchmark (descending), with context/weight as tiebreakers.
 *
 * When systemRamGB is provided:
 * - Models that don't fit in VRAM may be moved to "tight" via weight offloading
 * - Models that fit but have limited context get extended context via KV-cache overflow
 * - Enriched entries gain offloadInfo for UI display
 *
 * When sortBy is 'swe-bench':
 * - Models are sorted by swe_bench_score instead of mmlu_score
 * - Quality tier uses codingQualityTier() thresholds
 * - Models without swe_bench_score sort to the bottom
 *
 * @param {Array} allModels       Full list of model objects
 * @param {number} vram           Available VRAM in GB
 * @param {number|null} bandwidth Memory bandwidth in GB/s (null if unknown)
 * @param {number|null} minContextK  Minimum required context in K tokens (null = any)
 * @param {number|null} minTokPerSec Minimum required tok/s (null = any)
 * @param {string[]} requiredFeatures  Features the model must support (empty = any)
 * @param {string} sortBy  Benchmark to sort by: 'mmlu' (default) or 'swe-bench'
 * @param {number|null} systemRamGB  System RAM for offloading (null = VRAM-only)
 * @returns {{ fits: Array, tight: Array, noFit: Array }}
 */
export function bucketModels(allModels, vram, bandwidth, minContextK, minTokPerSec, requiredFeatures = [], sortBy = 'mmlu', systemRamGB = null) {
  const effectiveMinCtx = minContextK;

  const entries = allModels.map((m) => {
    // Check if model weights fit in VRAM (basic check)
    const totalAtMinCtx = m.weight_gb + m.kv_per_1k_gb; // 1K min context
    const fitsInVram = vram >= totalAtMinCtx;

    // Try weight offloading if model doesn't fit in VRAM
    let offloadInfo = null;
    let weightsAvailable = fitsInVram; // Can we run this model at all?

    if (!fitsInVram && systemRamGB != null) {
      const offload = calcOffloadConfig(m, vram, systemRamGB);
      if (offload.feasible && offload.offloadRatio > 0) {
        const penalty = calcOffloadPenalty(offload.offloadRatio, bandwidth);
        offloadInfo = {
          type: 'weights',
          gpuWeightGB: offload.gpuWeightGB,
          ramWeightGB: offload.ramWeightGB,
          offloadRatio: offload.offloadRatio,
          estimatedLayers: offload.estimatedLayers,
          penaltyPercent: penalty.penaltyPercent,
          speedMultiplier: penalty.speedMultiplier,
        };
        weightsAvailable = true;
      }
    }

    // Calculate context — use system RAM for KV overflow when available
    let maxCtxK;
    let ctxInfo = null;

    if (weightsAvailable && !offloadInfo && systemRamGB != null) {
      // Model fits on GPU, potentially extend context with system RAM
      const extended = calcMaxContextWithOffload(m, vram, systemRamGB);
      maxCtxK = extended.maxCtxK;
      if (extended.usingSystemRam) {
        ctxInfo = {
          vramCtxK: extended.vramCtxK,
          ramCtxK: extended.ramCtxK,
        };
      }
    } else if (offloadInfo) {
      // Weight offloading: minimal context on remaining VRAM
      // Available VRAM for KV = vram - gpuWeightGB (already accounted for overhead)
      const vramForKv = Math.max(vram - offloadInfo.gpuWeightGB - INFERENCE_OVERHEAD_GB, 0);
      maxCtxK = m.kv_per_1k_gb > 0
        ? Math.min(Math.floor(vramForKv / m.kv_per_1k_gb), m.max_context_k)
        : m.max_context_k;
    } else {
      maxCtxK = calcMaxContext(m, vram);
    }

    // Model architecturally can't support the required context (regardless of VRAM)
    const modelSupportsCtx = effectiveMinCtx != null ? m.max_context_k >= effectiveMinCtx : true;
    const meetsMinCtx = effectiveMinCtx != null ? maxCtxK >= effectiveMinCtx : true;

    // Speed: apply offload penalty if applicable
    let tokPerSec = calcTokPerSec(m, bandwidth);
    if (tokPerSec != null && offloadInfo) {
      tokPerSec = Math.round(tokPerSec * offloadInfo.speedMultiplier);
    }
    const meetsMinSpeed = minTokPerSec != null && tokPerSec != null ? tokPerSec >= minTokPerSec : true;

    const modelFeatures = m.features ?? [];
    const meetsFeatures = requiredFeatures.length > 0
      ? requiredFeatures.every((f) => modelFeatures.includes(f))
      : true;
    const tier = sortBy === 'swe-bench'
      ? codingQualityTier(m.swe_bench_score ?? null)
      : qualityTier(m.mmlu_score);
    return {
      ...m,
      maxCtxK,
      fitsAtAll: weightsAvailable,
      meetsMinCtx,
      meetsMinSpeed,
      meetsFeatures,
      modelSupportsCtx,
      tokPerSec,
      tier,
      offloadInfo,
      ctxInfo,
    };
  });

  const fits = [];
  const tight = [];
  const noFit = [];

  for (const e of entries) {
    if (!e.fitsAtAll || !e.modelSupportsCtx) {
      noFit.push(e);
    } else if (e.offloadInfo) {
      // Weight offloading always goes to tight fit (never "runs well")
      tight.push(e);
    } else if (!e.meetsMinCtx || !e.meetsMinSpeed || !e.meetsFeatures) {
      tight.push(e);
    } else if (e.maxCtxK < TIGHT_FIT_CONTEXT_K) {
      // Less than 4K context is a tight fit regardless
      tight.push(e);
    } else {
      fits.push(e);
    }
  }

  if (sortBy === 'swe-bench') {
    // Sort by SWE-bench score (descending), null scores to bottom, context as tiebreaker
    const sortFn = (a, b) => compareScores(a.swe_bench_score, b.swe_bench_score) || b.maxCtxK - a.maxCtxK;
    fits.sort(sortFn);
    tight.sort(sortFn);
    noFit.sort((a, b) => compareScores(a.swe_bench_score, b.swe_bench_score) || b.weight_gb - a.weight_gb);
  } else {
    // Sort by quality (MMLU) descending, then by context/weight as tiebreaker
    fits.sort((a, b) => compareScores(a.mmlu_score, b.mmlu_score) || b.maxCtxK - a.maxCtxK);
    tight.sort((a, b) => compareScores(a.mmlu_score, b.mmlu_score) || b.maxCtxK - a.maxCtxK);
    noFit.sort((a, b) => compareScores(a.mmlu_score, b.mmlu_score) || b.weight_gb - a.weight_gb);
  }

  return { fits, tight, noFit };
}

/**
 * Group an array of enriched model entries by base model name.
 * Variants of the same model (different quantizations) are collapsed
 * into a single group with shared metadata shown once.
 *
 * Preserves the order of first appearance (i.e. the sorted order from
 * bucketModels). Variants within each group are sorted by weight_gb
 * ascending (smallest / most quantized first).
 *
 * @param {Array} models  Enriched model entries (output of bucketModels bucket)
 * @returns {Array<{ name: string, params_b: number, tier: object, mmlu_score: number, swe_bench_score: number|null, features: string[], variants: Array }>}
 */
export function groupVariants(models) {
  const groups = [];
  const seen = new Map();

  for (const m of models) {
    if (seen.has(m.name)) {
      seen.get(m.name).variants.push(m);
    } else {
      const group = {
        name: m.name,
        params_b: m.params_b,
        tier: m.tier,
        mmlu_score: m.mmlu_score,
        swe_bench_score: m.swe_bench_score ?? null,
        features: m.features ?? [],
        variants: [m],
      };
      groups.push(group);
      seen.set(m.name, group);
    }
  }

  // Sort variants within each group by weight ascending (smallest quant first)
  for (const g of groups) {
    g.variants.sort((a, b) => a.weight_gb - b.weight_gb);
  }

  return groups;
}

/**
 * VRAM needed to hold a model's weights plus KV cache for a given context.
 * The context is capped at the model's trained max_context_k.
 *
 * @param {{ weight_gb: number, kv_per_1k_gb: number, max_context_k: number }} model
 * @param {number} contextK  Context length in K tokens
 * @returns {number} VRAM in GB
 */
export function calcVramForContext(model, contextK) {
  return model.weight_gb + model.kv_per_1k_gb * Math.min(contextK, model.max_context_k);
}

/**
 * Expand a GPU into its memory configurations, smallest first.
 * Single-config GPUs return one entry with memIdx null; GPUs with
 * vram_options (Apple Silicon, Strix Halo) return one per option, keeping
 * the original index so it can be used as the `mem` URL param.
 *
 * @param {{ vram_gb?: number, bandwidth_gbps?: number, vram_options?: Array<{ vram_gb: number, bandwidth_gbps: number }> }} gpu
 * @returns {Array<{ vram: number, bandwidth: number|null, memIdx: number|null }>}
 */
export function gpuConfigs(gpu) {
  if (!gpu.vram_options) {
    return [{ vram: gpu.vram_gb, bandwidth: gpu.bandwidth_gbps ?? null, memIdx: null }];
  }
  return gpu.vram_options
    .map((o, memIdx) => ({ vram: o.vram_gb, bandwidth: o.bandwidth_gbps ?? null, memIdx }))
    .sort((a, b) => a.vram - b.vram);
}

/** Pick the variant with the largest weights (highest-precision quantization). */
function largestVariant(list) {
  return list.reduce((best, v) => (best == null || v.weight_gb > best.weight_gb ? v : best), null);
}

/**
 * Pick the top N distinct models from a bucket of enriched entries by a
 * benchmark score. Models without a score are skipped. For each model the
 * highest-precision variant in the bucket is returned.
 *
 * @param {Array} entries  Enriched entries (e.g. bucketModels().fits)
 * @param {'mmlu_score'|'swe_bench_score'} scoreKey
 * @param {number} n  Maximum number of models to return
 * @returns {Array} Enriched entries, one per model name, best score first
 */
export function topModelsByScore(entries, scoreKey, n = 3) {
  const byName = new Map();
  for (const e of entries) {
    if (e[scoreKey] == null) continue;
    byName.set(e.name, largestVariant([byName.get(e.name), e].filter(Boolean)));
  }
  return [...byName.values()]
    .sort((a, b) => b[scoreKey] - a[scoreKey] || a.name.localeCompare(b.name))
    .slice(0, n);
}

/**
 * Find the best way to run one model (all its quantization variants) on
 * given hardware: the highest-precision variant that runs well, otherwise
 * the highest-precision variant that is a tight fit.
 *
 * @param {Array} variants  Model objects sharing a name
 * @param {number} vram
 * @param {number|null} bandwidth
 * @returns {{ status: 'fits'|'tight', variant: object }|null} null if no variant fits
 */
export function bestVariantFor(variants, vram, bandwidth) {
  const { fits, tight } = bucketModels(variants, vram, bandwidth, null, null);
  if (fits.length > 0) return { status: 'fits', variant: largestVariant(fits) };
  if (tight.length > 0) return { status: 'tight', variant: largestVariant(tight) };
  return null;
}

/**
 * List the GPUs that can run a model. For GPUs with several memory
 * configurations, the smallest configuration that runs it well is used
 * (falling back to the smallest tight fit).
 *
 * @param {Array} variants  Model objects sharing a name
 * @param {Array} gpus  GPU objects from gpus.json
 * @returns {Array<{ gpu: object, config: object, status: 'fits'|'tight', variant: object }>}
 *   In gpus.json order; GPUs that can't run any variant are omitted.
 */
export function gpusForModel(variants, gpus) {
  const out = [];
  for (const gpu of gpus) {
    let tightMatch = null;
    let match = null;
    for (const config of gpuConfigs(gpu)) {
      const best = bestVariantFor(variants, config.vram, config.bandwidth);
      if (best?.status === 'fits') { match = { gpu, config, ...best }; break; }
      if (best && !tightMatch) tightMatch = { gpu, config, ...best };
    }
    match ??= tightMatch;
    if (match) out.push(match);
  }
  return out;
}

/**
 * Group bucketModels() output so each model appears exactly once, under the
 * best status any of its variants reaches (fits > tight > noFit).
 *
 * A model listed under "fits" keeps its fitting variants in `variants`; its
 * variants from worse buckets move to `otherVariants`, each tagged with its
 * own `status`, so the UI can still show them (dimmed) on the same card.
 * Group order follows the sorted order of each bucket.
 *
 * @param {{ fits: Array, tight: Array, noFit: Array }} results
 * @returns {{ fits: Array, tight: Array, noFit: Array }} groupVariants()-style
 *   groups, each with an extra `otherVariants` array (smallest weights first)
 */
export function groupByBestStatus({ fits, tight, noFit }) {
  const buckets = { fits, tight, noFit };
  const best = new Map();
  for (const [status, list] of Object.entries(buckets)) {
    for (const e of list) if (!best.has(e.name)) best.set(e.name, status);
  }

  const others = new Map();
  for (const [status, list] of Object.entries(buckets)) {
    for (const e of list) {
      if (best.get(e.name) === status) continue;
      if (!others.has(e.name)) others.set(e.name, []);
      others.get(e.name).push({ ...e, status });
    }
  }

  const grouped = {};
  for (const [status, list] of Object.entries(buckets)) {
    grouped[status] = groupVariants(list.filter((e) => best.get(e.name) === status)).map((g) => ({
      ...g,
      otherVariants: (others.get(g.name) ?? []).sort((a, b) => a.weight_gb - b.weight_gb),
    }));
  }
  return grouped;
}

/**
 * Summarise bucketModels() output for the results overview.
 *
 * Counts give each model one status, the best any of its variants reaches
 * (see groupByBestStatus), so they add up to `total`, the number of distinct
 * models, and match the grouped result lists. Highlights come from the
 * "runs well" bucket.
 *
 * @param {{ fits: Array, tight: Array, noFit: Array }} results
 * @returns {{
 *   counts: { fits: number, tight: number, noFit: number },
 *   total: number,
 *   bestGeneral: object|null,
 *   bestCoding: object|null,
 *   largest: object|null,
 *   fastest: object|null,
 * }} Highlights are enriched entries (highest-precision variant of the model)
 */
export function summarizeResults({ fits, tight, noFit }) {
  const grouped = groupByBestStatus({ fits, tight, noFit });
  const counts = { fits: grouped.fits.length, tight: grouped.tight.length, noFit: grouped.noFit.length };
  const total = counts.fits + counts.tight + counts.noFit;

  // One entry per model: its highest-precision variant that runs well
  const fitsByModel = groupVariants(fits).map((g) => largestVariant(g.variants));
  const pickMax = (list, key) =>
    list.reduce((top, e) => (top == null || e[key] > top[key] || (e[key] === top[key] && (e.mmlu_score ?? 0) > (top.mmlu_score ?? 0)) ? e : top), null);

  return {
    counts,
    total,
    bestGeneral: topModelsByScore(fits, 'mmlu_score', 1)[0] ?? null,
    bestCoding: topModelsByScore(fits, 'swe_bench_score', 1)[0] ?? null,
    largest: pickMax(fitsByModel, 'params_b'),
    // Fastest variant of any model of at least "Good" quality, so a tiny model doesn't win by default
    fastest: pickMax(fits.filter((e) => e.tokPerSec != null && e.mmlu_score >= GOOD_QUALITY_MMLU), 'tokPerSec'),
  };
}

/** GPUs we can suggest buying: discrete, with a known launch MSRP (Apple Silicon isn't sold as a GPU). */
function isBuyableGpu(gpu) {
  return gpu.manufacturer !== 'Apple' && gpu.msrp_usd != null && gpu.vram_gb != null;
}

/**
 * The cheapest GPUs (by launch MSRP) that run a model well at its smallest
 * quantization, i.e. in bucketModels' "fits" bucket, with at least 4K context.
 *
 * @param {Array} variants  All quantization variants of one model
 * @param {Array} gpus  GPU objects from gpus.json
 * @param {{ limit?: number, minVramExclusive?: number }} [options]
 *   minVramExclusive: only GPUs with more VRAM than this (to suggest upgrades)
 * @returns {Array<{ gpu: object, quantization: string, tokPerSec: number|null, maxCtxK: number }>}
 *   cheapest first; speed and context are for the smallest quantization
 */
export function cheapestGpusFor(variants, gpus, { limit = 3, minVramExclusive = 0 } = {}) {
  if (variants.length === 0) return [];
  const smallest = variants.reduce((a, b) => (b.weight_gb < a.weight_gb ? b : a));
  const out = [];
  for (const gpu of gpus) {
    if (!isBuyableGpu(gpu) || gpu.vram_gb <= minVramExclusive) continue;
    const { fits } = bucketModels([smallest], gpu.vram_gb, gpu.bandwidth_gbps, null, null);
    if (fits.length > 0) {
      out.push({ gpu, quantization: smallest.quantization, tokPerSec: fits[0].tokPerSec, maxCtxK: fits[0].maxCtxK });
    }
  }
  return out
    .sort((a, b) => a.gpu.msrp_usd - b.gpu.msrp_usd || b.gpu.vram_gb - a.gpu.vram_gb || b.gpu.bandwidth_gbps - a.gpu.bandwidth_gbps)
    .slice(0, limit);
}

/** An upgrade must add at least this much VRAM to be worth suggesting (8 GB → 10 GB isn't). */
export const MIN_UPGRADE_VRAM_GB = 4;

/**
 * Upgrade options for a GPU: the cheapest buyable GPU at each of the next VRAM
 * tiers, at least MIN_UPGRADE_VRAM_GB above its largest memory option (ties:
 * more bandwidth). A tier is skipped when a GPU with even more VRAM costs the
 * same or less, since that one is the better buy.
 *
 * @param {object} gpu  The current GPU
 * @param {Array} gpus  GPU objects from gpus.json
 * @param {number} limit
 * @returns {Array<object>} GPUs, smallest VRAM first
 */
export function upgradeOptionsFor(gpu, gpus, limit = 2) {
  const current = Math.max(...gpuConfigs(gpu).map((c) => c.vram));
  const candidates = gpus.filter((g) => isBuyableGpu(g) && g.vram_gb >= current + MIN_UPGRADE_VRAM_GB);

  const cheapestPerTier = new Map();
  for (const g of candidates) {
    const best = cheapestPerTier.get(g.vram_gb);
    if (!best || g.msrp_usd < best.msrp_usd || (g.msrp_usd === best.msrp_usd && g.bandwidth_gbps > best.bandwidth_gbps)) {
      cheapestPerTier.set(g.vram_gb, g);
    }
  }

  return [...cheapestPerTier.values()]
    .filter((pick) => !candidates.some((g) => g.vram_gb > pick.vram_gb && g.msrp_usd <= pick.msrp_usd))
    .sort((a, b) => a.vram_gb - b.vram_gb)
    .slice(0, limit);
}
