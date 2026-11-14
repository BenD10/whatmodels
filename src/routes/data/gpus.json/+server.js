import gpus from '$lib/data/gpus.json';
import { datasetEnvelope, datasetGpus, datasetJson } from '$lib/dataset.js';

export const prerender = true;

export function GET() {
  return new Response(datasetJson(datasetEnvelope('gpus', datasetGpus(gpus))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
