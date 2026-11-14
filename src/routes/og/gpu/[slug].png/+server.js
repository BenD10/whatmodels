import { error } from '@sveltejs/kit';
import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import { gpuCard } from '$lib/og.js';
import { gpuPageFacts } from '$lib/pages.js';
import { pngResponse } from '$lib/server/og/render.js';

export const prerender = true;

// Image URLs only appear in <meta> tags, which the prerender crawler doesn't follow
export function entries() {
  return gpus.map((g) => ({ slug: g.id }));
}

export function GET({ params }) {
  const gpu = gpus.find((g) => g.id === params.slug);
  if (!gpu) error(404, 'GPU not found');
  return pngResponse(gpuCard(gpu, gpuPageFacts(gpu, allModels)));
}
