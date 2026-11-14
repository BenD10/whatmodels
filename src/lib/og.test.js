import { describe, it, expect } from 'vitest';
import {
  OG_WIDTH,
  OG_HEIGHT,
  SITE_OG_PATH,
  SITE_OG_ALT,
  gpuOgPath,
  modelOgPath,
  tierOgPath,
  ogImageUrl,
  headlineSize,
  gpuCard,
  modelCard,
  tierCard,
  siteCard,
} from './og.js';
import { VRAM_TIERS, gpuDescription, gpuPageFacts, modelDescription, modelPageFacts, modelPages, quotedContextK, sitemapEntries } from './pages.js';
import { tierDescription, tierPageFacts } from './vram-tiers.js';
import { calcVramForContext } from './calculations.js';
import gpusData from './data/gpus.json';
import modelsData from './data/models.json';

describe('image paths and URLs', () => {
  it('is the Open Graph large-image size', () => {
    expect([OG_WIDTH, OG_HEIGHT]).toEqual([1200, 630]);
  });

  it('puts one image per landing page under /og', () => {
    expect(gpuOgPath({ id: 'rtx-4090' })).toBe('/og/gpu/rtx-4090.png');
    expect(modelOgPath({ slug: 'qwen3-5-27b' })).toBe('/og/model/qwen3-5-27b.png');
    expect(tierOgPath(16)).toBe('/og/vram/16gb.png');
    expect(SITE_OG_PATH).toBe('/og/site.png');
  });

  it('builds absolute URLs, with the deploy base path when there is one', () => {
    expect(ogImageUrl('/og/site.png')).toBe('https://whatmodelscanirun.com/og/site.png');
    expect(ogImageUrl('/og/site.png', '')).toBe('https://whatmodelscanirun.com/og/site.png');
    expect(ogImageUrl('/og/gpu/rtx-4090.png', '/whatmodels')).toBe('https://whatmodelscanirun.com/whatmodels/og/gpu/rtx-4090.png');
  });

  it('has an image for every page in the sitemap that gets its own', () => {
    // GPU, model and tier pages each get a card; the rest share SITE_OG_PATH
    const own = sitemapEntries(gpusData, modelsData).filter((e) => /^\/(gpu|model|vram)\//.test(e.path));
    const paths = new Set([
      ...gpusData.map(gpuOgPath),
      ...modelPages(modelsData).map(modelOgPath),
      ...VRAM_TIERS.map(tierOgPath),
    ]);
    expect(paths.size).toBe(own.length);
  });
});

describe('headlineSize', () => {
  it('steps down as names get longer', () => {
    expect(headlineSize('RTX 4090')).toBe(96);
    expect(headlineSize('Radeon RX 7900 XTX')).toBe(80);
    expect(headlineSize('DeepSeek R1 Distill Qwen 14B')).toBe(68);
    expect(headlineSize('Nemotron 3.5 Super VL 120B A12B')).toBe(56);
  });

  it('never grows for a longer name', () => {
    let prev = Infinity;
    for (let n = 1; n <= 80; n++) {
      const size = headlineSize('x'.repeat(n));
      expect(size).toBeLessThanOrEqual(prev);
      prev = size;
    }
  });
});

describe('gpuCard', () => {
  const card16 = { id: 'rtx-5070-ti', name: 'GeForce RTX 5070 Ti', manufacturer: 'NVIDIA', vram_gb: 16, bandwidth_gbps: 896 };
  const facts16 = { config: { vram: 16, peakBandwidth: 896 }, multiConfig: false, runsWell: 44, tight: 8, topNames: ['Phi-4 14B', 'Qwen3.5 9B'] };

  it('leads with the short name, memory and counts', () => {
    const c = gpuCard(card16, facts16);
    expect(c.eyebrow).toBe('NVIDIA GPU');
    expect(c.title).toBe('RTX 5070 Ti');
    expect(c.subtitle).toBe('16 GB VRAM · 896 GB/s');
    expect(c.stats).toEqual([
      { value: '44', label: 'models run well', tone: 'fits' },
      { value: '8', label: 'more are a tight fit', tone: 'tight' },
    ]);
    expect(c.picks).toEqual(['Phi-4 14B', 'Qwen3.5 9B']);
    expect(c.alt).toBe('RTX 5070 Ti (16 GB): 44 local AI models run well, 8 more are a tight fit. Top picks: Phi-4 14B and Qwen3.5 9B.');
  });

  it('says which memory option a unified-memory chip is counted at', () => {
    const chip = { id: 'm3-max', name: 'M3 Max', manufacturer: 'Apple', vram_options: [{ vram_gb: 36, bandwidth_gbps: 300 }, { vram_gb: 128, bandwidth_gbps: 400 }] };
    const c = gpuCard(chip, { config: { vram: 128, peakBandwidth: 400 }, multiConfig: true, runsWell: 85, tight: 0, topNames: [] });
    expect(c.eyebrow).toBe('Apple chip');
    expect(c.subtitle).toBe('36–128 GB unified memory · 400 GB/s');
    expect(c.stats).toEqual([{ value: '85', label: 'models run well with 128 GB', tone: 'fits' }]);
    expect(c.picksLabel).toBeNull();
    expect(c.alt).toBe('M3 Max (36–128 GB): 85 local AI models run well with 128 GB.');
  });

  it('handles unknown bandwidth and a single model', () => {
    const c = gpuCard({ ...card16, bandwidth_gbps: null }, { ...facts16, config: { vram: 16, peakBandwidth: null }, runsWell: 1, tight: 0 });
    expect(c.subtitle).toBe('16 GB VRAM');
    expect(c.stats[0].label).toBe('model runs well');
  });
});

describe('modelCard', () => {
  const model = {
    name: 'Qwen3.5 27B', slug: 'qwen3-5-27b', params_b: 27, max_context_k: 256, mmlu_score: 82, swe_bench_score: null,
    variants: [{ quantization: 'Q4_K_M' }, { quantization: 'Q8_0' }],
  };
  const runner = (vram, status) => ({ gpu: { name: `GPU ${vram}` }, config: { vram }, status });

  it('leads with the smallest memory that runs it well', () => {
    const runners = [runner(16, 'tight'), runner(24, 'fits'), runner(32, 'fits')];
    const facts = { runners, runnersWell: runners.slice(1), cheapest: runners[1], smallestRunner: runners[0] };
    const c = modelCard(model, facts, { gpuCount: 132, minVramGb: 17.2 });
    expect(c.title).toBe('Qwen3.5 27B');
    expect(c.eyebrow).toBe('AI model · 27B params');
    expect(c.subtitle).toBe('MMLU 82');
    expect(c.stats).toEqual([
      { value: '24 GB', label: 'to run it well', tone: 'fits' },
      { value: '2', label: 'of 132 GPUs run it well', tone: 'accent' },
      { value: '256K', label: 'max context', tone: 'accent' },
    ]);
    expect(c.picks).toEqual(['Q4_K_M, Q8_0']);
    expect(c.alt).toBe('Qwen3.5 27B runs well on GPUs with 24 GB or more: 2 of 132 GPUs.');
  });

  it('falls back to the smallest memory that loads it when nothing runs it well', () => {
    const runners = [runner(80, 'tight')];
    const c = modelCard(model, { runners, runnersWell: [], cheapest: null, smallestRunner: runners[0] }, { gpuCount: 132, minVramGb: 79 });
    expect(c.stats[0]).toEqual({ value: '80 GB', label: 'to load it', tone: 'tight' });
    expect(c.stats[1]).toEqual({ value: '1', label: 'of 132 GPUs can load it', tone: 'accent' });
  });

  it('quotes the memory needed when no single GPU can load it', () => {
    const c = modelCard({ ...model, mmlu_score: null }, { runners: [], runnersWell: [], cheapest: null, smallestRunner: null }, { gpuCount: 132, minVramGb: 901 });
    expect(c.subtitle).toBeNull();
    expect(c.stats[0]).toEqual({ value: '901.0 GB', label: 'more than any single GPU', tone: 'no-fit' });
    expect(c.stats).toHaveLength(2);
  });
});

describe('tierCard / siteCard', () => {
  it('shows the tier counts and top picks', () => {
    const c = tierCard(16, { configs: new Array(32), runsWell: 44, tight: 8, topNames: ['A', 'B'] });
    expect(c.title).toBe('16 GB VRAM');
    expect(c.stats.map((s) => s.value)).toEqual(['44', '8', '32']);
    expect(c.stats[2].label).toBe('GPUs and chips with 16 GB');
    expect(c.alt).toBe('Best local LLMs for 16 GB of VRAM: 44 models run well, 8 more are a tight fit. Top picks: A and B.');
  });

  it('drops the tight-fit stat when there are none', () => {
    const c = tierCard(128, { configs: [{}], runsWell: 85, tight: 0, topNames: [] });
    expect(c.stats.map((s) => s.label)).toEqual(['models run well', 'GPU with 128 GB']);
    expect(c.picksLabel).toBeNull();
  });

  it('gives the shared card counts and a fixed alt', () => {
    const c = siteCard({ modelCount: 107, gpuCount: 132 });
    expect(c.stats.map((s) => s.value)).toEqual(['107', '132']);
    expect(c.alt).toBe(SITE_OG_ALT);
  });
});

// The image must never disagree with its page: check every card against the
// meta description built from the same facts.
describe('cards agree with their pages (real data)', () => {
  it('GPU cards', () => {
    for (const gpu of gpusData) {
      const facts = gpuPageFacts(gpu, modelsData);
      const card = gpuCard(gpu, facts);
      expect(gpuDescription(gpu, facts).startsWith(`${card.stats[0].value} local LLMs run well`)).toBe(true);
    }
  });

  it('model cards', () => {
    for (const model of modelPages(modelsData)) {
      const facts = modelPageFacts(model, gpusData);
      const minVramGb = calcVramForContext(model.variants[0], quotedContextK(model));
      const card = modelCard(model, facts, { gpuCount: gpusData.length, minVramGb });
      const desc = modelDescription(model, { gpuCount: gpusData.length, runnerCount: facts.runners.length });
      if (facts.runners.length === 0) expect(desc).toContain(`needs ${card.stats[0].value} of VRAM`);
      if (facts.cheapest) expect(card.stats[1].value).toBe(String(facts.runnersWell.length));
    }
  });

  it('tier cards', () => {
    for (const size of VRAM_TIERS) {
      const facts = tierPageFacts(size, gpusData, modelsData);
      const card = tierCard(size, facts);
      const desc = tierDescription(size, { ...facts, gpuCount: facts.configs.length });
      expect(desc.startsWith(`${card.stats[0].value} local LLMs run well in ${size} GB`)).toBe(true);
    }
  });
});
