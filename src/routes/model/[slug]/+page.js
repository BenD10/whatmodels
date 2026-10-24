import { error } from '@sveltejs/kit';
import allModels from '$lib/data/models.json';
import { modelPages } from '$lib/pages.js';

const pages = modelPages(allModels);

export function entries() {
  return pages.map((p) => ({ slug: p.slug }));
}

export function load({ params }) {
  const model = pages.find((p) => p.slug === params.slug);
  if (!model) error(404, 'Model not found');
  return { model };
}
