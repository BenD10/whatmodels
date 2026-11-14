import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import { siteCard } from '$lib/og.js';
import { modelPages } from '$lib/pages.js';
import { pngResponse } from '$lib/server/og/render.js';

export const prerender = true;

export function GET() {
  return pngResponse(siteCard({ modelCount: modelPages(allModels).length, gpuCount: gpus.length }));
}
