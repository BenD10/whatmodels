import { error } from '@sveltejs/kit';
import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import { calcVramForContext } from '$lib/calculations.js';
import { modelCard } from '$lib/og.js';
import { modelPageFacts, modelPages, quotedContextK } from '$lib/pages.js';
import { pngResponse } from '$lib/server/og/render.js';

export const prerender = true;

const pages = modelPages(allModels);

// Image URLs only appear in <meta> tags, which the prerender crawler doesn't follow
export function entries() {
  return pages.map((p) => ({ slug: p.slug }));
}

export function GET({ params }) {
  const model = pages.find((p) => p.slug === params.slug);
  if (!model) error(404, 'Model not found');
  // The same figure the page quotes when no single GPU can load the model
  const minVramGb = calcVramForContext(model.variants[0], quotedContextK(model));
  return pngResponse(modelCard(model, modelPageFacts(model, gpus), { gpuCount: gpus.length, minVramGb }));
}
