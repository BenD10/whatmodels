import { describe, it, expect } from 'vitest';
import modelsData from './data/models.json';
import gpusData from './data/gpus.json';
import {
  GPU_FIELDS,
  MODEL_FIELDS,
  SCHEMA_VERSION,
  datasetEnvelope,
  datasetGpus,
  datasetJson,
  datasetLd,
  datasetModels,
} from './dataset.js';
import { DATA_UPDATED, modelPages } from './pages.js';

const dense = {
  id: 'b-model-q4', name: 'B Model 8B', params_b: 8, quantization: 'Q4_K_M', weight_gb: 4.9,
  kv_per_1k_gb: 0.122, max_context_k: 128, layers: 32, mmlu_score: 69.4, swe_bench_score: null,
  features: ['tool_use', 'reasoning'], notes: 'Dense.',
};
const moe = {
  id: 'a-moe-q8', name: 'A MoE 30B', params_b: 30, quantization: 'Q8_0', weight_gb: 31.8, active_weight_gb: 3.2,
  kv_per_1k_gb: 0.094, max_context_k: 256, layers: 48, mmlu_score: null, swe_bench_score: 50.1,
  features: ['vision'], notes: 'MoE.',
};
const discrete = { id: 'rtx-z', name: 'GeForce RTX Z', manufacturer: 'NVIDIA', vram_gb: 24, bandwidth_gbps: 1008, msrp_usd: 1599, amazon_search: 'NVIDIA RTX Z' };
const unified = {
  id: 'm-a', name: 'M A', manufacturer: 'Apple',
  vram_options: [{ vram_gb: 36, bandwidth_gbps: 410 }, { vram_gb: 128, bandwidth_gbps: 546 }],
  msrp_usd: null, amazon_search: null,
};

describe('datasetModels', () => {
  const rows = datasetModels([dense, moe]);

  it('sorts by id and fixes the field order', () => {
    expect(rows.map((r) => r.id)).toEqual(['a-moe-q8', 'b-model-q4']);
    for (const r of rows) expect(Object.keys(r)).toEqual(MODEL_FIELDS);
  });

  it('fills absent fields with null instead of leaving them out', () => {
    expect(rows[1].active_weight_gb).toBeNull(); // dense model
    expect(rows[0].active_weight_gb).toBe(3.2);
  });

  it('links each row to its model page', () => {
    expect(rows[1].url).toBe('https://whatmodelscanirun.com/model/b-model-8b');
  });

  it('sorts features without touching the input', () => {
    expect(rows[1].features).toEqual(['reasoning', 'tool_use']);
    expect(dense.features).toEqual(['tool_use', 'reasoning']);
  });

  it('is independent of input order', () => {
    expect(datasetModels([moe, dense])).toEqual(rows);
  });

  it('handles an empty list', () => {
    expect(datasetModels([])).toEqual([]);
  });

  it('covers every row of models.json, and every url is a real model page', () => {
    const all = datasetModels(modelsData);
    expect(all).toHaveLength(modelsData.length);
    const pages = new Set(modelPages(modelsData).map((m) => `https://whatmodelscanirun.com/model/${m.slug}`));
    for (const r of all) expect(pages.has(r.url), r.id).toBe(true);
  });

  it('publishes every source field (a new field in models.json must be added or excluded on purpose)', () => {
    const sourceFields = new Set(modelsData.flatMap((m) => Object.keys(m)));
    for (const f of sourceFields) expect(MODEL_FIELDS, f).toContain(f);
  });
});

describe('datasetGpus', () => {
  const rows = datasetGpus([discrete, unified]);

  it('sorts by id and fixes the field order', () => {
    expect(rows.map((r) => r.id)).toEqual(['m-a', 'rtx-z']);
    for (const r of rows) expect(Object.keys(r)).toEqual(GPU_FIELDS);
  });

  it('keeps one memory shape per GPU and nulls the other', () => {
    const [m, rtx] = rows;
    expect(rtx).toMatchObject({ vram_gb: 24, bandwidth_gbps: 1008, vram_options: null });
    expect(m).toMatchObject({ vram_gb: null, bandwidth_gbps: null });
    expect(m.vram_options).toEqual(unified.vram_options);
  });

  it('leaves out the internal affiliate search query', () => {
    for (const r of rows) expect(r).not.toHaveProperty('amazon_search');
  });

  it('links each row to its GPU page', () => {
    expect(rows[1].url).toBe('https://whatmodelscanirun.com/gpu/rtx-z');
  });

  it('publishes every source field except amazon_search', () => {
    const sourceFields = new Set(gpusData.flatMap((g) => Object.keys(g)));
    sourceFields.delete('amazon_search');
    for (const f of sourceFields) expect(GPU_FIELDS, f).toContain(f);
    expect(datasetGpus(gpusData)).toHaveLength(gpusData.length);
  });
});

describe('datasetEnvelope', () => {
  it('wraps rows under their kind with the metadata', () => {
    const env = datasetEnvelope('models', [{ id: 'x' }], '2026-11-13');
    expect(env).toEqual({
      schema_version: SCHEMA_VERSION,
      updated: '2026-11-13',
      license: 'MIT',
      source: 'https://whatmodelscanirun.com',
      docs: 'https://whatmodelscanirun.com/data/',
      count: 1,
      models: [{ id: 'x' }],
    });
  });

  it('defaults to the current data release', () => {
    expect(datasetEnvelope('gpus', []).updated).toBe(DATA_UPDATED);
    expect(datasetEnvelope('gpus', []).count).toBe(0);
  });
});

describe('datasetJson', () => {
  it('is indented, newline-terminated and round-trips', () => {
    const env = datasetEnvelope('gpus', datasetGpus([discrete]));
    const text = datasetJson(env);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "schema_version": 1,');
    expect(JSON.parse(text)).toEqual(env);
  });
});

describe('datasetLd', () => {
  it('describes a free MIT dataset with both JSON downloads', () => {
    const ld = datasetLd({ name: 'N', description: 'D', updated: '2026-11-13', modelCount: 214, gpuCount: 132 });
    expect(ld['@type']).toBe('Dataset');
    expect(ld.license).toBe('https://opensource.org/licenses/MIT');
    expect(ld.dateModified).toBe('2026-11-13');
    expect(ld.distribution.map((d) => d.contentUrl)).toEqual([
      'https://whatmodelscanirun.com/data/models.json',
      'https://whatmodelscanirun.com/data/gpus.json',
    ]);
    expect(ld.distribution.every((d) => d.encodingFormat === 'application/json')).toBe(true);
  });
});
