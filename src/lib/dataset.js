/**
 * The public dataset served at /data/models.json and /data/gpus.json: the
 * site's own data, wrapped in a small envelope with a fixed field order so
 * diffs between releases stay clean. Pure functions; the routes and the
 * /data docs page share them.
 *
 * Schema policy: adding a field or a row keeps SCHEMA_VERSION; renaming or
 * removing a field, or changing a field's unit or meaning, bumps it.
 */

import { DATA_UPDATED, SITE_NAME, SITE_URL, modelSlug } from './pages.js';

export const SCHEMA_VERSION = 1;
export const DATASET_LICENSE = 'MIT';
export const DATASET_DOCS_PATH = '/data/';
export const DATASET_PATHS = { models: '/data/models.json', gpus: '/data/gpus.json' };

/**
 * Published model fields, in output order. Every row has every field;
 * absent values are null rather than missing.
 */
export const MODEL_FIELDS = [
  'id',
  'name',
  'url',
  'quantization',
  'params_b',
  'weight_gb',
  'active_weight_gb',
  'kv_per_1k_gb',
  'max_context_k',
  'layers',
  'features',
  'mmlu_score',
  'swe_bench_score',
  'notes',
];

/**
 * Published GPU fields, in output order. Discrete cards carry vram_gb and
 * bandwidth_gbps; unified-memory parts carry vram_options instead, and the
 * other shape is null. `amazon_search` (an affiliate search query) is
 * internal to the site and left out.
 */
export const GPU_FIELDS = ['id', 'name', 'url', 'manufacturer', 'vram_gb', 'bandwidth_gbps', 'vram_options', 'msrp_usd'];

/** Plain code-unit comparison: the same order in every locale and runtime. */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Pick `fields` from `row` in order, with missing values as null. */
function pick(row, fields) {
  const out = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

/**
 * Model rows for the public dataset: one per model per quantization,
 * sorted by id, each linking to its model page.
 * @param {Array} models  models.json
 * @returns {Array<object>}
 */
export function datasetModels(models) {
  return [...models].sort(byId).map((m) =>
    pick(
      {
        ...m,
        url: `${SITE_URL}/model/${modelSlug(m.name)}`,
        features: [...(m.features ?? [])].sort(),
      },
      MODEL_FIELDS
    )
  );
}

/**
 * GPU rows for the public dataset, sorted by id, each linking to its GPU page.
 * @param {Array} gpus  gpus.json
 * @returns {Array<object>}
 */
export function datasetGpus(gpus) {
  return [...gpus].sort(byId).map((g) =>
    pick(
      {
        ...g,
        url: `${SITE_URL}/gpu/${g.id}`,
        vram_options: g.vram_options?.map((o) => ({ vram_gb: o.vram_gb, bandwidth_gbps: o.bandwidth_gbps })),
      },
      GPU_FIELDS
    )
  );
}

/**
 * The envelope around a dataset file.
 * @param {'models'|'gpus'} kind  Also the key that holds the rows
 * @param {Array<object>} rows  From datasetModels() or datasetGpus()
 * @param {string} [updated]  YYYY-MM-DD of the data release
 * @returns {object}
 */
export function datasetEnvelope(kind, rows, updated = DATA_UPDATED) {
  return {
    schema_version: SCHEMA_VERSION,
    updated,
    license: DATASET_LICENSE,
    source: SITE_URL,
    docs: `${SITE_URL}${DATASET_DOCS_PATH}`,
    count: rows.length,
    [kind]: rows,
  };
}

/**
 * A dataset file as an HTTP response body: two-space indented JSON with a
 * trailing newline, so a release diff shows one line per changed value.
 * @param {object} envelope
 * @returns {string}
 */
export function datasetJson(envelope) {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

/**
 * schema.org Dataset structured data for the /data page (what Google Dataset
 * Search reads).
 * @param {{ name: string, description: string, updated?: string, modelCount: number, gpuCount: number }} info
 * @returns {object}
 */
export function datasetLd({ name, description, updated = DATA_UPDATED, modelCount, gpuCount }) {
  return {
    '@type': 'Dataset',
    name,
    description,
    url: `${SITE_URL}${DATASET_DOCS_PATH}`,
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    dateModified: updated,
    creator: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    keywords: ['LLM', 'GGUF', 'VRAM', 'KV cache', 'quantization', 'GPU', 'local inference', 'memory bandwidth'],
    variableMeasured: ['weight_gb', 'kv_per_1k_gb', 'max_context_k', 'active_weight_gb', 'vram_gb', 'bandwidth_gbps'],
    distribution: [
      {
        '@type': 'DataDownload',
        name: `Models (${modelCount} rows, one per quantization)`,
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}${DATASET_PATHS.models}`,
      },
      {
        '@type': 'DataDownload',
        name: `GPUs (${gpuCount} rows)`,
        encodingFormat: 'application/json',
        contentUrl: `${SITE_URL}${DATASET_PATHS.gpus}`,
      },
    ],
  };
}
