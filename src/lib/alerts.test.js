import { describe, it, expect } from 'vitest';
import {
  ALERT_TIERS,
  LT4_FLOOR_GB,
  newModelGroups,
  picksForTier,
  subjectLine,
  renderModel,
  renderTierEmail,
  draftAlerts,
  renderReadme,
} from './alerts.js';
import { vramTier } from './notify.js';

// Small fixtures in models.json shape
const tinyQ4 = { id: 'tiny-q4', name: 'Tiny 1B', params_b: 1.2, quantization: 'Q4_K_M', weight_gb: 0.8, kv_per_1k_gb: 0.02, max_context_k: 32, mmlu_score: null, swe_bench_score: null, features: ['tool_use'], layers: 16 };
const tinyQ8 = { ...tinyQ4, id: 'tiny-q8', quantization: 'Q8_0', weight_gb: 1.4 };
const midQ4 = { id: 'mid-q4', name: 'Mid 14B', params_b: 14, quantization: 'Q4_K_M', weight_gb: 9, kv_per_1k_gb: 0.1, max_context_k: 128, mmlu_score: 70.5, swe_bench_score: 40.2, features: ['vision', 'reasoning'], layers: 40 };
const midQ8 = { ...midQ4, id: 'mid-q8', quantization: 'Q8_0', weight_gb: 15.5 };
const hugeQ4 = { id: 'huge-q4', name: 'Huge 400B', params_b: 400, quantization: 'Q4_K_M', weight_gb: 240, kv_per_1k_gb: 0.5, max_context_k: 128, mmlu_score: 85, swe_bench_score: null, features: [], layers: 90 };
const oldQ4 = { id: 'old-q4', name: 'Old 8B', params_b: 8, quantization: 'Q4_K_M', weight_gb: 4.9, kv_per_1k_gb: 0.12, max_context_k: 128, mmlu_score: 60, swe_bench_score: null, features: [], layers: 32 };
const oldQ8 = { ...oldQ4, id: 'old-q8', quantization: 'Q8_0', weight_gb: 8.5 };

describe('ALERT_TIERS', () => {
  it('covers every signup tier, smallest first', () => {
    expect(ALERT_TIERS.map((t) => t.tier)).toEqual([
      'vram-lt4', 'vram-4', 'vram-6', 'vram-8', 'vram-12', 'vram-16', 'vram-24', 'vram-32plus',
    ]);
  });

  it('evaluates vram-lt4 at 2 GB instead of 0', () => {
    expect(ALERT_TIERS[0]).toEqual({ tier: 'vram-lt4', floorGB: LT4_FLOOR_GB });
    expect(LT4_FLOOR_GB).toBe(2);
  });

  it('uses floors that map back to their own tier', () => {
    for (const t of ALERT_TIERS) expect(vramTier(t.floorGB)).toBe(t.tier);
  });
});

describe('newModelGroups', () => {
  it('returns base models missing from the older list', () => {
    const groups = newModelGroups([oldQ4, oldQ8], [oldQ4, oldQ8, midQ4, midQ8]);
    expect(groups.map((g) => g.name)).toEqual(['Mid 14B']);
    expect(groups[0].variants.map((v) => v.id)).toEqual(['mid-q4', 'mid-q8']);
  });

  it('ignores new quantizations of an existing model', () => {
    expect(newModelGroups([oldQ4], [oldQ4, oldQ8])).toEqual([]);
  });

  it('handles empty lists', () => {
    expect(newModelGroups([], [])).toEqual([]);
    expect(newModelGroups([], [tinyQ4]).map((g) => g.name)).toEqual(['Tiny 1B']);
  });
});

describe('picksForTier', () => {
  const groups = newModelGroups([], [tinyQ4, tinyQ8, midQ4, midQ8, hugeQ4]);

  it('keeps only models that run well and picks the highest-precision variant', () => {
    // 2 GB: Tiny Q8 → (2 - 1.4) / 0.02 = 30K ≥ 16K, runs well. Mid doesn't fit.
    const picks = picksForTier(groups, 2);
    expect(picks.map((p) => p.variant.id)).toEqual(['tiny-q8']);
    expect(picks[0].variant.maxCtxK).toBe(30);
  });

  it('drops a model whose best variant is only a tight fit', () => {
    // 10 GB: Mid Q4 → (10 - 9) / 0.1 = 10K < 16K, tight; Q8 doesn't fit
    const picks = picksForTier(groups, 10);
    expect(picks.map((p) => p.group.name)).toEqual(['Tiny 1B']);
  });

  it('falls back to a smaller quantization when the larger one is tight', () => {
    // 16 GB: Mid Q8 → (16 - 15.5) / 0.1 = 5K, tight; Mid Q4 → 70K, runs well
    const mid = picksForTier(groups, 16).find((p) => p.group.name === 'Mid 14B');
    expect(mid.variant.id).toBe('mid-q4');
    expect(mid.variant.maxCtxK).toBe(70);
  });

  it('sorts by MMLU-Pro with unknown scores last', () => {
    expect(picksForTier(groups, 32).map((p) => p.group.name)).toEqual(['Mid 14B', 'Tiny 1B']);
  });

  it('returns nothing at 0 GB', () => {
    expect(picksForTier(groups, 0)).toEqual([]);
  });
});

describe('rendering', () => {
  const [mid] = picksForTier(newModelGroups([], [midQ4, midQ8]), 32);

  it('pluralises the subject line', () => {
    expect(subjectLine(1, 8)).toBe('1 new model that runs well on 8 GB');
    expect(subjectLine(3, 16)).toBe('3 new models that run well on 16 GB');
  });

  it('renders a model with link, quantization, context, features and scores', () => {
    // 32 GB: Mid Q8 → (32 - 15.5) / 0.1 = 165K, capped at 128K
    expect(renderModel(mid, 32)).toBe([
      '### [Mid 14B](https://whatmodelscanirun.com/model/mid-14b)',
      '',
      '- Best quantization: Q8_0, 15.5 GB of weights (14B parameters)',
      '- Max context at 32 GB: 128K tokens',
      '- Features: Vision, Reasoning',
      '- MMLU-Pro: 70.5 · SWE-bench Verified: 40.2',
    ].join('\n'));
  });

  it('says when scores and features are missing', () => {
    const [huge] = picksForTier(newModelGroups([], [hugeQ4]), 256);
    const md = renderModel(huge, 256);
    expect(md).toContain('- Features: None listed');
    expect(md).toContain('SWE-bench Verified: not published');
  });

  it('renders a whole email with subject, footer and unsubscribe placeholder', () => {
    const email = renderTierEmail({ tier: 'vram-32plus', floorGB: 32 }, [mid]);
    const lines = email.split('\n');
    expect(lines[0]).toBe('Subject: 1 new model that runs well on 32 GB');
    expect(email).toContain('runs well with 32 GB or more of VRAM');
    expect(email).toContain('https://whatmodelscanirun.com\n');
    expect(email).toContain('{{ unsubscribe_url }}');
    expect(email).toContain('(vram-32plus)');
  });

  it('describes vram-lt4 subscribers as having less than 4 GB', () => {
    const [tiny] = picksForTier(newModelGroups([], [tinyQ8]), 2);
    expect(renderTierEmail({ tier: 'vram-lt4', floorGB: 2 }, [tiny])).toContain('alerts for less than 4 GB of VRAM');
  });
});

describe('draftAlerts / renderReadme', () => {
  const result = draftAlerts([oldQ4, oldQ8], [oldQ4, oldQ8, tinyQ4, tinyQ8, midQ4, midQ8, hugeQ4]);
  const byTier = Object.fromEntries(result.tiers.map((t) => [t.tier, t]));

  it('drafts an email only for tiers with news', () => {
    expect(byTier['vram-lt4'].picks.map((p) => p.group.name)).toEqual(['Tiny 1B']);
    // 8 GB: Mid Q4 doesn't fit (9 GB of weights)
    expect(byTier['vram-8'].picks.map((p) => p.group.name)).toEqual(['Tiny 1B']);
    // 12 GB: Mid Q4 → (12 - 9) / 0.1 = 30K, runs well
    expect(byTier['vram-12'].picks.map((p) => p.group.name)).toEqual(['Mid 14B', 'Tiny 1B']);
    expect(result.tiers.every((t) => t.email != null)).toBe(true);
  });

  it('lists new models too big for every tier', () => {
    expect(result.unplaced.map((g) => g.name)).toEqual(['Huge 400B']);
  });

  it('writes a README with filters, skipped tiers and the lt4 floor', () => {
    const r = draftAlerts([], [midQ4, midQ8]);
    const md = renderReadme(r, { from: 'abc1234', to: 'HEAD (def5678)', date: '2026-11-13' });
    expect(md).toContain('# New-model alert drafts, 2026-11-13');
    expect(md).toContain('`abc1234..HEAD (def5678)`. New models: 1.');
    expect(md).toContain('| vram-12 | 12 GB | 1 | [vram-12.md](vram-12.md) | `metadata vram_tier = vram-12` |');
    expect(md).toContain('## Skipped (nothing new runs well)');
    expect(md).toContain('- vram-lt4 (2 GB)');
    expect(md).toContain('- vram-8 (8 GB)');
    expect(md).not.toContain('- vram-12 (12 GB)');
    expect(md).toContain('evaluated at 2 GB');
  });

  it('says there is nothing to send when nothing is new', () => {
    const r = draftAlerts([oldQ4], [oldQ4, oldQ8]);
    expect(r.tiers.every((t) => t.email == null)).toBe(true);
    const md = renderReadme(r, { from: 'a', to: 'b', date: '2026-11-13' });
    expect(md).toContain('New models: 0.');
    expect(md).toContain('nothing to send');
  });
});
