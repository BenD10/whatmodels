/**
 * Open Graph preview images: where each page's image lives, and the text and
 * numbers drawn on it. Pure functions; the numbers come from the same *Facts
 * helpers the pages use, so a preview never disagrees with its page. The
 * drawing itself (satori + resvg, build time only) is in $lib/server/og.
 */

import { contextLabel } from './calculations.js';
import { SITE_URL, gpuShortName, gpuVramLabel, tierSlug } from './pages.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * The deploy's base path as an absolute path: '' on the custom domain,
 * "/whatmodels" on a project Pages URL. Injected by vite.config.js from
 * svelte.config.js; `base` from $app/paths can't be used for absolute URLs
 * because it is relative ("..") while prerendering.
 */
export const DEPLOY_BASE = typeof __BASE_PATH__ === 'string' ? __BASE_PATH__ : '';

/** Path of the image for the pages that share one (home, indexes, primer, privacy). */
export const SITE_OG_PATH = '/og/site.png';

/** og:image:alt for the shared image. Fixed text, so pages using it needn't load the data. */
export const SITE_OG_ALT = 'What Models? Check which local AI models your GPU can run, with VRAM, context and speed.';

/** Path of a GPU page's image: "/og/gpu/rtx-4090.png". */
export function gpuOgPath(gpu) {
  return `/og/gpu/${gpu.id}.png`;
}

/** Path of a model page's image: "/og/model/qwen3-5-27b.png". */
export function modelOgPath(model) {
  return `/og/model/${model.slug}.png`;
}

/** Path of a VRAM tier page's image: 16 → "/og/vram/16gb.png". */
export function tierOgPath(size) {
  return `/og/vram/${tierSlug(size)}.png`;
}

/**
 * Absolute URL of an image, as crawlers need it: the site origin, then the
 * deploy's base path (empty on the custom domain), then the image path.
 * @param {string} path  e.g. "/og/site.png"
 * @param {string} [basePath]  DEPLOY_BASE (not `base` from $app/paths, which is relative while prerendering)
 * @returns {string}
 */
export function ogImageUrl(path, basePath = '') {
  return `${SITE_URL}${basePath}${path}`;
}

/**
 * Headline font size (px) so a name fits in at most two lines of a 1200 px
 * card: short GPU names get big type, long model names step down.
 * @param {string} text
 * @returns {number}
 */
export function headlineSize(text) {
  const n = text.length;
  if (n <= 14) return 96;
  if (n <= 20) return 80;
  if (n <= 28) return 68;
  return 56;
}

const plural = (n, one, many) => (n === 1 ? one : many);

/**
 * @typedef {object} OgCard
 * @property {string} eyebrow  Small label above the headline
 * @property {string} title  Headline
 * @property {string|null} subtitle
 * @property {Array<{ value: string, label: string, tone: 'fits'|'tight'|'no-fit'|'accent' }>} stats
 * @property {string|null} picksLabel
 * @property {string[]} picks  Model names, shown after picksLabel
 * @property {string} alt  og:image:alt text
 */

/**
 * Card for a GPU page.
 * @param {object} gpu
 * @param {ReturnType<import('./pages.js').gpuPageFacts>} facts
 * @returns {OgCard}
 */
export function gpuCard(gpu, { config, multiConfig, runsWell, tight, topNames }) {
  const name = gpuShortName(gpu);
  const memory = multiConfig ? `${gpuVramLabel(gpu)} unified memory` : `${config.vram} GB VRAM`;
  const subtitle = config.peakBandwidth != null ? `${memory} · ${config.peakBandwidth} GB/s` : memory;
  const at = multiConfig ? ` with ${config.vram} GB` : '';
  const stats = [{ value: String(runsWell), label: `${plural(runsWell, 'model runs', 'models run')} well${at}`, tone: 'fits' }];
  if (tight > 0) stats.push({ value: String(tight), label: 'more are a tight fit', tone: 'tight' });
  const picks = topNames.length > 0 ? ` Top picks: ${topNames.join(' and ')}.` : '';
  return {
    eyebrow: `${gpu.manufacturer} ${multiConfig ? 'chip' : 'GPU'}`,
    title: name,
    subtitle,
    stats,
    picksLabel: topNames.length > 0 ? 'Top picks' : null,
    picks: topNames,
    alt: `${name} (${gpuVramLabel(gpu)}): ${runsWell} local AI ${plural(runsWell, 'model runs', 'models run')} well${at}${tight > 0 ? `, ${tight} more are a tight fit` : ''}.${picks}`,
  };
}

/**
 * Card for a model page.
 * @param {object} model  A modelPages() entry
 * @param {ReturnType<import('./pages.js').modelPageFacts>} facts
 * @param {{ gpuCount: number, minVramGb: number }} more
 *   gpuCount: GPUs in the database; minVramGb: VRAM the model needs at its
 *   smallest quantization (shown when no single GPU can load it)
 * @returns {OgCard}
 */
export function modelCard(model, { runners, runnersWell, cheapest, smallestRunner }, { gpuCount, minVramGb }) {
  const stats = [];
  let alt;
  if (cheapest) {
    stats.push({ value: `${cheapest.config.vram} GB`, label: 'to run it well', tone: 'fits' });
    stats.push({ value: String(runnersWell.length), label: `of ${gpuCount} GPUs run it well`, tone: 'accent' });
    alt = `${model.name} runs well on GPUs with ${cheapest.config.vram} GB or more: ${runnersWell.length} of ${gpuCount} GPUs.`;
  } else if (smallestRunner) {
    stats.push({ value: `${smallestRunner.config.vram} GB`, label: 'to load it', tone: 'tight' });
    stats.push({ value: String(runners.length), label: `of ${gpuCount} GPUs can load it`, tone: 'accent' });
    alt = `${model.name} loads on GPUs with ${smallestRunner.config.vram} GB or more (${runners.length} of ${gpuCount} GPUs), as a tight fit.`;
  } else {
    stats.push({ value: `${minVramGb.toFixed(1)} GB`, label: 'more than any single GPU', tone: 'no-fit' });
    alt = `${model.name} needs ${minVramGb.toFixed(1)} GB, more than any single GPU in the database.`;
  }
  stats.push({ value: contextLabel(model.max_context_k), label: 'max context', tone: 'accent' });

  const scores = [];
  if (model.mmlu_score != null) scores.push(`MMLU ${model.mmlu_score}`);
  if (model.swe_bench_score != null) scores.push(`SWE-bench Verified ${model.swe_bench_score}`);
  const quants = model.variants.map((v) => v.quantization).join(', ');
  return {
    eyebrow: `AI model · ${model.params_b}B params`,
    title: model.name,
    subtitle: scores.length > 0 ? scores.join(' · ') : null,
    stats,
    picksLabel: 'Quantizations',
    picks: [quants],
    alt,
  };
}

/**
 * Card for a VRAM tier page.
 * @param {number} size  GB
 * @param {ReturnType<import('./vram-tiers.js').tierPageFacts>} facts
 * @returns {OgCard}
 */
export function tierCard(size, { configs, runsWell, tight, topNames }) {
  const stats = [{ value: String(runsWell), label: `${plural(runsWell, 'model runs', 'models run')} well`, tone: 'fits' }];
  if (tight > 0) stats.push({ value: String(tight), label: 'more are a tight fit', tone: 'tight' });
  stats.push({ value: String(configs.length), label: `${plural(configs.length, 'GPU', 'GPUs and chips')} with ${size} GB`, tone: 'accent' });
  const picks = topNames.length > 0 ? ` Top picks: ${topNames.join(' and ')}.` : '';
  return {
    eyebrow: 'Best local LLMs by VRAM',
    title: `${size} GB VRAM`,
    subtitle: 'What fits, context and speed',
    stats,
    picksLabel: topNames.length > 0 ? 'Top picks' : null,
    picks: topNames,
    alt: `Best local LLMs for ${size} GB of VRAM: ${runsWell} ${plural(runsWell, 'model runs', 'models run')} well${tight > 0 ? `, ${tight} more are a tight fit` : ''}.${picks}`,
  };
}

/**
 * Card shared by the home, index and content pages.
 * @param {{ modelCount: number, gpuCount: number }} counts
 *   modelCount: model pages (one per model, not per quantization)
 * @returns {OgCard}
 */
export function siteCard({ modelCount, gpuCount }) {
  return {
    eyebrow: 'Local LLMs on your hardware',
    title: 'What AI models can your GPU run?',
    subtitle: 'VRAM, context and speed for every local LLM',
    stats: [
      { value: String(modelCount), label: 'local models', tone: 'fits' },
      { value: String(gpuCount), label: 'GPUs and chips', tone: 'accent' },
    ],
    picksLabel: null,
    picks: [],
    alt: SITE_OG_ALT,
  };
}
