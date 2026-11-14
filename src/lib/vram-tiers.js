/**
 * Helpers for the VRAM-tier landing pages (/vram/16gb): which GPUs sit in a
 * tier, the bandwidth its speed estimates assume, the next tier up, and the
 * page's title and description. Pure functions; the slugs and the tier list
 * itself live in pages.js, next to the other URL helpers and the sitemap.
 */

import { bucketModels, gpuConfigs, topModelsByScore } from './calculations.js';
import { DATA_UPDATED, VRAM_TIERS, memParam, monthYearLabel } from './pages.js';

/**
 * Every GPU configuration with exactly `size` GB: discrete cards whose
 * vram_gb matches, and unified-memory chips with a matching memory option.
 * Fastest first (unknown bandwidth last), then by name.
 * @param {Array} gpus  gpus.json
 * @param {number} size  GB
 * @returns {Array<{ gpu: object, vram: number, bandwidth: number|null, memIdx: number|null, unified: boolean }>}
 */
export function tierConfigs(gpus, size) {
  const out = [];
  for (const gpu of gpus) {
    for (const c of gpuConfigs(gpu)) {
      if (c.vram === size) out.push({ gpu, ...c, unified: gpu.vram_options != null });
    }
  }
  return out.sort((a, b) => (b.bandwidth ?? -1) - (a.bandwidth ?? -1) || a.gpu.name.localeCompare(b.gpu.name));
}

/**
 * The bandwidth a tier page quotes speeds at: the median bandwidth_gbps of
 * the configurations with exactly that much memory, rounded to a whole GB/s.
 * null when no configuration with a known bandwidth has that size, so the
 * page omits tok/s rather than guess.
 * @param {Array} gpus  gpus.json
 * @param {number} size  GB
 * @returns {number|null}
 */
export function representativeBandwidth(gpus, size) {
  const bws = tierConfigs(gpus, size)
    .map((c) => c.bandwidth)
    .filter((b) => b != null)
    .sort((a, b) => a - b);
  if (bws.length === 0) return null;
  const mid = Math.floor(bws.length / 2);
  return Math.round(bws.length % 2 ? bws[mid] : (bws[mid - 1] + bws[mid]) / 2);
}

/**
 * The tier page for a given amount of memory: the largest listed tier at or
 * below it (a 20 GB card → 16 GB). null below the smallest tier.
 * @param {number|null} vram  GB
 * @param {number[]} [tiers]
 * @returns {number|null}
 */
export function tierForVram(vram, tiers = VRAM_TIERS) {
  if (vram == null) return null;
  let best = null;
  for (const t of tiers) if (t <= vram && (best == null || t > best)) best = t;
  return best;
}

/**
 * The next listed tier above `size`, or null for the largest.
 * @param {number} size
 * @param {number[]} [tiers]
 * @returns {number|null}
 */
export function nextTier(size, tiers = VRAM_TIERS) {
  return [...tiers].sort((a, b) => a - b).find((t) => t > size) ?? null;
}

/**
 * Path to a GPU page, with `?mem=<GB>` for a unified-memory option (the same
 * value the tool's `mem` param takes), so the page opens on that option.
 * @param {object} gpu
 * @param {number|null} memIdx  Index into gpu.vram_options, or null
 * @returns {string}
 */
export function gpuPagePath(gpu, memIdx = null) {
  const mem = memParam(gpu, memIdx);
  return mem == null ? `/gpu/${gpu.id}` : `/gpu/${gpu.id}?mem=${mem}`;
}

/** Query string that opens the tool with this much VRAM entered. */
export function tierToolQuery(size) {
  return `?vram=${size}`;
}

/**
 * Page title: "Best local LLMs for 16 GB VRAM (November 2026): what fits, context and speed".
 * @param {number} size
 * @param {string} [dataUpdated]  YYYY-MM-DD
 * @returns {string}
 */
export function tierTitle(size, dataUpdated = DATA_UPDATED) {
  return `Best local LLMs for ${size} GB VRAM (${monthYearLabel(dataUpdated)}): what fits, context and speed`;
}

/**
 * Meta description for a tier page. Unique per tier through its counts and
 * top models.
 * @param {number} size
 * @param {{ runsWell: number, tight: number, topNames: string[], gpuCount: number }} facts
 * @returns {string}
 */
export function tierDescription(size, { runsWell, tight, topNames, gpuCount }) {
  const led = topNames.length > 0 ? `, led by ${topNames.join(' and ')}` : '';
  const tightNote = tight > 0 ? `; ${tight} more are a tight fit` : '';
  return `${runsWell} local LLMs run well in ${size} GB of VRAM${led}${tightNote}. Max context and tokens/sec for each, plus the ${gpuCount === 1 ? 'GPU' : `${gpuCount} GPUs and chips`} with ${size} GB.`;
}

/**
 * What moving from one tier to a bigger one unlocks: models that run well at
 * `to` GB but not at `from` GB, best MMLU-Pro first.
 * @param {Array} models  models.json
 * @param {{ vram: number, bandwidth: number|null }} from
 * @param {{ vram: number, bandwidth: number|null }} to
 * @param {number} [n]  How many example models to return
 * @returns {{ count: number, top: Array }} count of newly unlocked models, and up to n of them (enriched entries)
 */
export function tierUnlocks(models, from, to, n = 3) {
  const here = new Set(bucketModels(models, from.vram, from.bandwidth, null, null).fits.map((e) => e.name));
  const gained = bucketModels(models, to.vram, to.bandwidth, null, null).fits.filter((e) => !here.has(e.name));
  return {
    count: new Set(gained.map((e) => e.name)).size,
    top: topModelsByScore(gained, 'mmlu_score', n),
  };
}
