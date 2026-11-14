import { error } from '@sveltejs/kit';
import { VRAM_TIERS, parseTierSlug, tierSlug } from '$lib/pages.js';

export function entries() {
  return VRAM_TIERS.map((size) => ({ size: tierSlug(size) }));
}

export function load({ params }) {
  const size = parseTierSlug(params.size);
  if (size == null) error(404, 'VRAM tier not found');
  return { size };
}
