import { describe, it, expect } from 'vitest';
import {
  tierConfigs,
  representativeBandwidth,
  tierForVram,
  nextTier,
  gpuPagePath,
  tierToolQuery,
  tierTitle,
  tierDescription,
  tierUnlocks,
  tierPageFacts,
} from './vram-tiers.js';
import { bucketModels, summarizeResults } from './calculations.js';
import { VRAM_TIERS } from './pages.js';
import gpusData from './data/gpus.json';
import modelsData from './data/models.json';

const card = (id, vram_gb, bandwidth_gbps) => ({ id, name: id, manufacturer: 'NVIDIA', vram_gb, bandwidth_gbps });
const chip = (id, options) => ({
  id,
  name: id,
  manufacturer: 'Apple',
  vram_options: options.map(([vram_gb, bandwidth_gbps]) => ({ vram_gb, bandwidth_gbps })),
});

const GPUS = [
  card('a', 16, 300),
  card('b', 16, 900),
  card('c', 24, 1000),
  card('d', 16, null),
  chip('m', [[8, 100], [16, 200], [24, 250]]),
];

describe('tierConfigs', () => {
  it('collects discrete cards and unified-memory options of exactly that size, fastest first', () => {
    const list = tierConfigs(GPUS, 16);
    expect(list.map((c) => c.gpu.id)).toEqual(['b', 'a', 'm', 'd']);
    expect(list.find((c) => c.gpu.id === 'm')).toMatchObject({ unified: true, memIdx: 1, bandwidth: 200 });
    expect(list.find((c) => c.gpu.id === 'a')).toMatchObject({ unified: false, memIdx: null });
  });

  it('is empty when nothing has that size', () => {
    expect(tierConfigs(GPUS, 12)).toEqual([]);
  });
});

describe('representativeBandwidth', () => {
  it('takes the median of known bandwidths, ignoring nulls', () => {
    // 16 GB: 200, 300, 900 (d has none) → 300
    expect(representativeBandwidth(GPUS, 16)).toBe(300);
  });

  it('averages the middle two for an even count, rounded', () => {
    // 24 GB: 250, 1000 → 625
    expect(representativeBandwidth(GPUS, 24)).toBe(625);
    expect(representativeBandwidth([card('x', 8, 101), card('y', 8, 102)], 8)).toBe(102); // 101.5 → 102
  });

  it('is null when no configuration of that size has a bandwidth', () => {
    expect(representativeBandwidth(GPUS, 12)).toBeNull();
    expect(representativeBandwidth([card('d', 16, null)], 16)).toBeNull();
    expect(representativeBandwidth([], 16)).toBeNull();
  });

  it('has a bandwidth for every listed tier in the real data', () => {
    for (const t of VRAM_TIERS) expect(representativeBandwidth(gpusData, t), `${t} GB`).toBeGreaterThan(0);
  });
});

describe('tierForVram', () => {
  it('picks the largest tier at or below the memory', () => {
    expect(tierForVram(16)).toBe(16);
    expect(tierForVram(20)).toBe(16);
    expect(tierForVram(10)).toBe(8);
    expect(tierForVram(512)).toBe(128);
  });

  it('is null below the smallest tier or with no memory', () => {
    expect(tierForVram(6)).toBeNull();
    expect(tierForVram(0)).toBeNull();
    expect(tierForVram(null)).toBeNull();
  });
});

describe('nextTier', () => {
  it('steps to the next listed size', () => {
    expect(nextTier(8)).toBe(12);
    expect(nextTier(16)).toBe(24);
    expect(nextTier(20)).toBe(24);
    expect(nextTier(128)).toBeNull();
  });
});

describe('gpuPagePath / tierToolQuery', () => {
  it('adds ?mem=<GB> only for a unified-memory option', () => {
    expect(gpuPagePath(GPUS[0])).toBe('/gpu/a');
    expect(gpuPagePath(GPUS[4], 1)).toBe('/gpu/m?mem=16');
    expect(gpuPagePath(GPUS[4], null)).toBe('/gpu/m');
  });

  it('prefills the tool with the tier size', () => {
    expect(tierToolQuery(16)).toBe('?vram=16');
  });
});

describe('tierTitle / tierDescription', () => {
  it('dates the title by the data release month', () => {
    expect(tierTitle(16, '2026-11-13')).toBe('Best local LLMs for 16 GB VRAM (November 2026): what fits, context and speed');
  });

  it('names the counts and the top models', () => {
    expect(tierDescription(16, { runsWell: 40, tight: 5, topNames: ['A', 'B'], gpuCount: 32 })).toBe(
      '40 local LLMs run well in 16 GB of VRAM, led by A and B; 5 more are a tight fit. Max context and tokens/sec for each, plus the 32 GPUs and chips with 16 GB.'
    );
    expect(tierDescription(8, { runsWell: 3, tight: 0, topNames: [], gpuCount: 1 })).toBe(
      '3 local LLMs run well in 8 GB of VRAM. Max context and tokens/sec for each, plus the GPU with 8 GB.'
    );
  });
});

describe('tierUnlocks', () => {
  // 16K-context floor: weights + 16 × kv must fit, with room to spare to "run well"
  const small = { id: 's', name: 'Small', weight_gb: 4, kv_per_1k_gb: 0.1, max_context_k: 128, mmlu_score: 50, features: [], layers: 32 };
  const mid = { id: 'm', name: 'Mid', weight_gb: 14, kv_per_1k_gb: 0.1, max_context_k: 128, mmlu_score: 70, features: [], layers: 40 };
  const big = { id: 'b', name: 'Big', weight_gb: 60, kv_per_1k_gb: 0.1, max_context_k: 128, mmlu_score: 80, features: [], layers: 80 };

  it('lists models that run well at the bigger size but not the smaller', () => {
    // 8 GB fits Small only; 24 GB adds Mid (14 + 1.6 = 15.6 GB at 16K); Big needs 61.6 GB
    const { count, top } = tierUnlocks([small, mid, big], { vram: 8, bandwidth: 300 }, { vram: 24, bandwidth: 900 });
    expect(count).toBe(1);
    expect(top.map((m) => m.name)).toEqual(['Mid']);
  });

  it('is empty when the bigger size adds nothing', () => {
    expect(tierUnlocks([small], { vram: 8, bandwidth: null }, { vram: 12, bandwidth: null })).toEqual({ count: 0, top: [] });
  });

  it('unlocks something at every step up in the real data', () => {
    for (let i = 0; i + 1 < VRAM_TIERS.length; i++) {
      const from = { vram: VRAM_TIERS[i], bandwidth: null };
      const to = { vram: VRAM_TIERS[i + 1], bandwidth: null };
      expect(tierUnlocks(modelsData, from, to).count, `${from.vram} → ${to.vram} GB`).toBeGreaterThan(0);
    }
  });
});

describe('tierPageFacts', () => {
  it('buckets models at the tier size and its representative bandwidth', () => {
    const facts = tierPageFacts(16, gpusData, modelsData);
    expect(facts.configs).toEqual(tierConfigs(gpusData, 16));
    expect(facts.bandwidth).toBe(representativeBandwidth(gpusData, 16));
    const counts = summarizeResults(bucketModels(modelsData, 16, facts.bandwidth, null, null)).counts;
    expect([facts.runsWell, facts.tight]).toEqual([counts.fits, counts.tight]);
    expect(facts.topNames.length).toBeLessThanOrEqual(2);
  });
});
