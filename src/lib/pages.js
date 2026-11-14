/**
 * Helpers for the static GPU and model landing pages: slugs, display
 * names, URLs and structured data. Pure functions, shared by the routes
 * and the sitemap.
 */

import { TIGHT_FIT_CONTEXT_K, calcVramForContext, contextLabel, gpuConfigs, groupVariants } from './calculations.js';

export const SITE_URL = 'https://whatmodelscanirun.com';
export const SITE_NAME = 'What Models?';

/**
 * Date of the last data release (gpus.json / models.json), as YYYY-MM-DD.
 * Bump it in the same PR as every data update: it drives the footer's
 * "Data last updated" month and the sitemap's <lastmod> for every page
 * whose content comes from the data.
 */
export const DATA_UPDATED = '2026-11-13';

/**
 * "November 2026" for a YYYY-MM-DD date.
 * @param {string} isoDate
 * @returns {string}
 */
export function monthYearLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Every URL in the sitemap. Pages built from the data carry DATA_UPDATED as
 * their lastmod; hand-written pages (primer, privacy) have no reliable date,
 * so they carry none rather than a made-up one.
 * @param {Array} gpus  gpus.json
 * @param {Array} models  models.json
 * @param {string} [dataUpdated]
 * @returns {Array<{ path: string, priority: string, changefreq: string, lastmod: string|null }>}
 */
export function sitemapEntries(gpus, models, dataUpdated = DATA_UPDATED) {
  const data = (path, priority, changefreq) => ({ path, priority, changefreq, lastmod: dataUpdated });
  const fixed = (path, priority, changefreq) => ({ path, priority, changefreq, lastmod: null });
  return [
    data('/', '1.0', 'weekly'),
    data('/gpus', '0.8', 'weekly'),
    data('/models', '0.8', 'weekly'),
    ...VRAM_TIERS.map((size) => data(tierPath(size), '0.8', 'monthly')),
    fixed('/primer', '0.8', 'monthly'),
    fixed('/privacy', '0.3', 'yearly'),
    ...gpus.map((g) => data(`/gpu/${g.id}`, '0.7', 'monthly')),
    ...modelPages(models).map((m) => data(`/model/${m.slug}`, '0.7', 'monthly')),
  ];
}

/**
 * VRAM sizes (GB) that get a landing page at /vram/<size>gb: the sizes people
 * search for ("best llm for 16gb vram"), each with GPUs in the database.
 */
export const VRAM_TIERS = [8, 12, 16, 24, 32, 48, 64, 96, 128];

/** URL slug for a VRAM tier: 16 → "16gb", matching how the size is searched. */
export function tierSlug(size) {
  return `${size}gb`;
}

/** Path of a VRAM tier page: 16 → "/vram/16gb". */
export function tierPath(size) {
  return `/vram/${tierSlug(size)}`;
}

/**
 * Parse a tier slug back to its size. Only listed tiers parse, and only in
 * their canonical spelling ("16gb", not "16", "16GB" or "016gb").
 * @param {string} slug
 * @returns {number|null}
 */
export function parseTierSlug(slug) {
  const size = VRAM_TIERS.find((t) => tierSlug(t) === slug);
  return size ?? null;
}

/**
 * The single GPU configuration with the most memory.
 * @param {Array} gpus
 * @returns {{ gpu: object, vram: number }|null}
 */
export function largestGpuMemory(gpus) {
  let best = null;
  for (const gpu of gpus) {
    for (const c of gpuConfigs(gpu)) {
      if (best == null || c.vram > best.vram) best = { gpu, vram: c.vram };
    }
  }
  return best;
}

/**
 * The context a model page quotes VRAM at: TIGHT_FIT_CONTEXT_K, or the model's
 * whole trained context if that is shorter (Gemma 2 stops at 8K).
 * @param {{ max_context_k: number }} model
 * @returns {number}
 */
export function quotedContextK(model) {
  return Math.min(TIGHT_FIT_CONTEXT_K, model.max_context_k);
}

/**
 * Meta description for a model page.
 * @param {object} model  A modelPages() entry (variants smallest first)
 * @param {{ gpuCount: number, runnerCount: number }} counts
 *   GPUs in the database, and how many of them can load the model at all
 * @returns {string}
 */
export function modelDescription(model, { gpuCount, runnerCount }) {
  const smallest = model.variants[0];
  const ctxK = quotedContextK(model);
  const need = `${model.name} needs ${calcVramForContext(smallest, ctxK).toFixed(1)} GB of VRAM at ${smallest.quantization} with ${contextLabel(ctxK)} context.`;
  if (runnerCount === 0) {
    return `${need} No single GPU in our database has that much memory. See VRAM per quantization and how to run it across multiple GPUs.`;
  }
  return `${need} See VRAM per quantization and which of ${gpuCount} GPUs can run it, with context and tokens/sec estimates.`;
}

/**
 * Turn a display name into a URL slug: "Qwen3.5 27B" → "qwen3-5-27b".
 * @param {string} name
 * @returns {string}
 */
export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Slug for a model page, derived from the shared variant name. */
export function modelSlug(name) {
  return slugify(name);
}

/**
 * Group models.json variants into one entry per model page, sorted by name.
 * @param {Array} models  Raw model objects
 * @returns {Array} groupVariants() groups with an added `slug`
 */
export function modelPages(models) {
  return groupVariants(models)
    .map((g) => ({ ...g, slug: modelSlug(g.name), max_context_k: Math.max(...g.variants.map((v) => v.max_context_k)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
}

/** Shorter GPU name as people search for it: "GeForce RTX 4060" → "RTX 4060". */
export function gpuShortName(gpu) {
  return gpu.name.replace(/^GeForce /, '');
}

/**
 * "a" or "an" for a GPU name. Acronyms and model codes (RTX, AMD, M3, L40S)
 * are read letter by letter; ordinary words (Radeon, Arc) by their first letter.
 * @param {string} name
 * @returns {'a'|'an'}
 */
export function indefiniteArticle(name) {
  const word = name.split(/\s+/)[0];
  const first = word[0]?.toUpperCase() ?? '';
  const isAcronym = word === word.toUpperCase();
  const vowelSound = isAcronym ? 'AEFHILMNORSX' : 'AEIOU';
  return vowelSound.includes(first) ? 'an' : 'a';
}

/**
 * VRAM label for a GPU: "8 GB", or "36–128 GB" for multi-config chips.
 * @param {object} gpu
 * @returns {string}
 */
export function gpuVramLabel(gpu) {
  if (!gpu.vram_options) return `${gpu.vram_gb} GB`;
  const sizes = gpu.vram_options.map((o) => o.vram_gb);
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  return min === max ? `${min} GB` : `${min}–${max} GB`;
}

/**
 * Resolve a `mem` URL param to an index into gpu.vram_options. The param
 * is the memory size in GB (`mem=128`); older links used the option index
 * (`mem=1`), which is still accepted when no size matches. The two can't
 * collide: every option is larger than any GPU's option count (pinned in
 * data.test.js).
 * @param {object} gpu
 * @param {string|null} raw  The raw `mem` param
 * @returns {number|null} Option index, or null if the param is invalid
 */
export function memOptionIndex(gpu, raw) {
  const options = gpu?.vram_options;
  if (!options || raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const byGb = options.findIndex((o) => o.vram_gb === n);
  if (byGb !== -1) return byGb;
  return Number.isInteger(n) && n >= 0 && n < options.length ? n : null;
}

/**
 * The `mem` URL param for a memory option: its size in GB.
 * @param {object} gpu
 * @param {number|string|null} memIdx  Index into gpu.vram_options, or null/''
 * @returns {number|null}
 */
export function memParam(gpu, memIdx) {
  if (memIdx == null || memIdx === '') return null;
  return gpu?.vram_options?.[Number(memIdx)]?.vram_gb ?? null;
}

/**
 * Query string that opens the main tool with this GPU (and memory option) selected.
 * @param {object} gpu
 * @param {number|null} memIdx  Index into gpu.vram_options, or null
 * @returns {string}
 */
export function toolQuery(gpu, memIdx = null) {
  const params = new URLSearchParams({ gpu: gpu.id });
  const mem = memParam(gpu, memIdx);
  if (mem != null) params.set('mem', String(mem));
  return `?${params}`;
}

/**
 * Serialise JSON-LD into a <script> tag for {@html}, escaping `<` so data
 * can never close the tag early.
 * @param {object} data
 * @returns {string}
 */
export function jsonLdScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

/**
 * BreadcrumbList structured data for a page under an index page.
 * @param {Array<{ name: string, path: string }>} crumbs  From the root down
 * @returns {object}
 */
export function breadcrumbLd(crumbs) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.path}`,
    })),
  };
}
