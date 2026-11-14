import { error } from '@sveltejs/kit';
import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import { tierCard } from '$lib/og.js';
import { VRAM_TIERS, parseTierSlug, tierSlug } from '$lib/pages.js';
import { tierPageFacts } from '$lib/vram-tiers.js';
import { pngResponse } from '$lib/server/og/render.js';

export const prerender = true;

// Image URLs only appear in <meta> tags, which the prerender crawler doesn't follow
export function entries() {
  return VRAM_TIERS.map((size) => ({ size: tierSlug(size) }));
}

export function GET({ params }) {
  const size = parseTierSlug(params.size);
  if (size == null) error(404, 'VRAM tier not found');
  return pngResponse(tierCard(size, tierPageFacts(size, gpus, allModels)));
}
