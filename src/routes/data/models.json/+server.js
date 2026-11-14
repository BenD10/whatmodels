import models from '$lib/data/models.json';
import { datasetEnvelope, datasetJson, datasetModels } from '$lib/dataset.js';

export const prerender = true;

export function GET() {
  return new Response(datasetJson(datasetEnvelope('models', datasetModels(models))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
