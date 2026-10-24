/**
 * Helpers for the static GPU and model landing pages: slugs, display
 * names, URLs and structured data. Pure functions, shared by the routes
 * and the sitemap.
 */

import { groupVariants } from './calculations.js';

export const SITE_URL = 'https://whatmodelscanirun.com';
export const SITE_NAME = 'What Models?';

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
 * Query string that opens the main tool with this GPU (and memory option) selected.
 * @param {object} gpu
 * @param {number|null} memIdx  Index into gpu.vram_options, or null
 * @returns {string}
 */
export function toolQuery(gpu, memIdx = null) {
  const params = new URLSearchParams({ gpu: gpu.id });
  if (memIdx != null) params.set('mem', String(memIdx));
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
