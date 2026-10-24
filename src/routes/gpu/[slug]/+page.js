import { error } from '@sveltejs/kit';
import gpus from '$lib/data/gpus.json';

export function entries() {
  return gpus.map((g) => ({ slug: g.id }));
}

export function load({ params }) {
  const gpu = gpus.find((g) => g.id === params.slug);
  if (!gpu) error(404, 'GPU not found');
  return { gpu };
}
