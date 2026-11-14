import { describe, it, expect } from 'vitest';
import {
  slugify,
  modelPages,
  gpuShortName,
  indefiniteArticle,
  gpuVramLabel,
  toolQuery,
  memOptionIndex,
  memParam,
  jsonLdScript,
  DATA_UPDATED,
  monthYearLabel,
  sitemapEntries,
  largestGpuMemory,
  quotedContextK,
  modelDescription,
  VRAM_TIERS,
  tierSlug,
  tierPath,
  parseTierSlug,
  gpuPageFacts,
  gpuDescription,
  modelPageFacts,
  modelItemListLd,
  ITEM_LIST_LIMIT,
  SITE_URL,
} from './pages.js';
import { bucketModels, gpuConfigs, gpusForModel, groupByBestStatus, groupVariants, topModelsByScore } from './calculations.js';
import gpusData from './data/gpus.json';
import modelsData from './data/models.json';

describe('slugify', () => {
  it('lowercases and collapses punctuation', () => {
    expect(slugify('Qwen3.5 27B')).toBe('qwen3-5-27b');
    expect(slugify('DGX Spark (GB 10)')).toBe('dgx-spark-gb-10');
  });
});

describe('modelPages', () => {
  it('groups variants by name with a slug', () => {
    const pages = modelPages([
      { name: 'B Model', weight_gb: 8, max_context_k: 128 },
      { name: 'A Model', weight_gb: 2, max_context_k: 32 },
      { name: 'B Model', weight_gb: 4, max_context_k: 128 },
    ]);
    expect(pages.map((p) => p.slug)).toEqual(['a-model', 'b-model']);
    expect(pages[1].variants.map((v) => v.weight_gb)).toEqual([4, 8]);
  });
});

describe('gpu naming', () => {
  it('drops the GeForce prefix', () => {
    expect(gpuShortName({ name: 'GeForce RTX 4060' })).toBe('RTX 4060');
    expect(gpuShortName({ name: 'Radeon RX 7900 XTX' })).toBe('Radeon RX 7900 XTX');
  });

  it('picks a/an by how the name is read', () => {
    expect(indefiniteArticle('RTX 4060')).toBe('an');
    expect(indefiniteArticle('GTX 1080')).toBe('a');
    expect(indefiniteArticle('M3 Ultra')).toBe('an');
    expect(indefiniteArticle('Radeon RX 7600')).toBe('a');
    expect(indefiniteArticle('Arc B580')).toBe('an');
    expect(indefiniteArticle('Tesla P40')).toBe('a');
  });

  it('labels VRAM for fixed and multi-config GPUs', () => {
    expect(gpuVramLabel({ vram_gb: 8 })).toBe('8 GB');
    expect(gpuVramLabel({ vram_options: [{ vram_gb: 96 }, { vram_gb: 512 }] })).toBe('96–512 GB');
  });
});

const m3Ultra = { id: 'm3-ultra', vram_options: [{ vram_gb: 96 }, { vram_gb: 256 }, { vram_gb: 512 }] };

describe('toolQuery', () => {
  it('builds the main-tool URL params with memory in GB', () => {
    expect(toolQuery({ id: 'rtx-4060' })).toBe('?gpu=rtx-4060');
    expect(toolQuery(m3Ultra, 2)).toBe('?gpu=m3-ultra&mem=512');
    expect(toolQuery(m3Ultra, 0)).toBe('?gpu=m3-ultra&mem=96');
  });
});

describe('memOptionIndex', () => {
  it('matches a size in GB to its option', () => {
    expect(memOptionIndex(m3Ultra, '96')).toBe(0);
    expect(memOptionIndex(m3Ultra, '512')).toBe(2);
  });

  it('falls back to a legacy option index', () => {
    expect(memOptionIndex(m3Ultra, '0')).toBe(0);
    expect(memOptionIndex(m3Ultra, '1')).toBe(1);
    expect(memOptionIndex(m3Ultra, '2')).toBe(2);
  });

  it('returns null for anything else', () => {
    for (const raw of [null, '', '3', '-1', '1.5', '128', 'abc', 'Infinity', '1e9']) {
      expect(memOptionIndex(m3Ultra, raw)).toBeNull();
    }
    expect(memOptionIndex({ id: 'rtx-4060', vram_gb: 8 }, '0')).toBeNull();
    expect(memOptionIndex(undefined, '96')).toBeNull();
  });
});

describe('memParam', () => {
  it('turns an option index into its size in GB', () => {
    expect(memParam(m3Ultra, 1)).toBe(256);
    expect(memParam(m3Ultra, '2')).toBe(512);
  });

  it('returns null when there is no option', () => {
    expect(memParam(m3Ultra, '')).toBeNull();
    expect(memParam(m3Ultra, null)).toBeNull();
    expect(memParam(m3Ultra, 3)).toBeNull();
    expect(memParam({ id: 'rtx-4060', vram_gb: 8 }, 0)).toBeNull();
  });
});

describe('jsonLdScript', () => {
  it('escapes < so data cannot close the script tag', () => {
    expect(jsonLdScript({ a: '</script>' })).not.toContain('</script><');
    expect(jsonLdScript({ a: '</script>' })).toContain('\\u003c/script>');
  });
});

describe('DATA_UPDATED', () => {
  it('is a real YYYY-MM-DD date, not in the future', () => {
    expect(DATA_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date(`${DATA_UPDATED}T00:00:00Z`);
    expect(d.toISOString().slice(0, 10)).toBe(DATA_UPDATED);
    expect(d.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('formats as month and year for the footer', () => {
    expect(monthYearLabel('2026-11-13')).toBe('November 2026');
    expect(monthYearLabel('2027-01-01')).toBe('January 2027');
  });
});

describe('sitemapEntries', () => {
  const entries = sitemapEntries(gpusData, modelsData, '2026-11-13');
  const paths = entries.map((e) => e.path);

  it('lists every GPU and model page once, plus the static pages', () => {
    const expected = [
      '/', '/gpus', '/models',
      '/vram/8gb', '/vram/12gb', '/vram/16gb', '/vram/24gb', '/vram/32gb', '/vram/48gb', '/vram/64gb', '/vram/96gb', '/vram/128gb',
      '/primer', '/data/', '/privacy',
      ...gpusData.map((g) => `/gpu/${g.id}`),
      ...modelPages(modelsData).map((m) => `/model/${m.slug}`),
    ];
    expect(paths).toEqual(expected);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('dates data-driven pages by the data release, and invents no date for the rest', () => {
    for (const e of entries) {
      const fromData = e.path === '/' || ['/gpu', '/model', '/vram/', '/data'].some((p) => e.path.startsWith(p));
      expect(e.lastmod, e.path).toBe(fromData ? '2026-11-13' : null);
    }
    expect(sitemapEntries([], [])[0].lastmod).toBe(DATA_UPDATED);
  });
});

describe('largestGpuMemory', () => {
  it('looks inside multi-config GPUs', () => {
    const big = largestGpuMemory([{ id: 'a', vram_gb: 32 }, m3Ultra, { id: 'b', vram_gb: 96 }]);
    expect(big.gpu.id).toBe('m3-ultra');
    expect(big.vram).toBe(512);
    expect(largestGpuMemory([])).toBeNull();
  });
});

describe('model page description', () => {
  const model = (max_context_k) => ({
    name: 'Test 9B',
    max_context_k,
    variants: [{ quantization: 'Q4_K_M', weight_gb: 5, kv_per_1k_gb: 0.1, max_context_k }],
  });

  it('quotes 16K context, or the whole context when it is shorter', () => {
    expect(quotedContextK({ max_context_k: 128 })).toBe(16);
    expect(quotedContextK({ max_context_k: 8 })).toBe(8);
  });

  it('states the VRAM at the quoted context', () => {
    // 5 GB weights + 16K × 0.1 GB = 6.6 GB
    expect(modelDescription(model(128), { gpuCount: 132, runnerCount: 40 })).toBe(
      'Test 9B needs 6.6 GB of VRAM at Q4_K_M with 16K context. See VRAM per quantization and which of 132 GPUs can run it, with context and tokens/sec estimates.'
    );
    // 8K trained context: 5 + 8 × 0.1 = 5.8 GB, and it must not claim 16K
    const short = modelDescription(model(8), { gpuCount: 132, runnerCount: 120 });
    expect(short).toContain('5.8 GB of VRAM at Q4_K_M with 8K context.');
    expect(short).not.toContain('16K');
  });

  it('does not promise GPUs when none can run it', () => {
    const none = modelDescription(model(128), { gpuCount: 132, runnerCount: 0 });
    expect(none).toContain('No single GPU in our database has that much memory');
    expect(none).not.toContain('which of 132 GPUs');
  });

  it('is unique for every real model page', () => {
    const descs = modelPages(modelsData).map((m) => modelDescription(m, { gpuCount: gpusData.length, runnerCount: 1 }));
    expect(new Set(descs).size).toBe(descs.length);
  });
});

describe('VRAM tier slugs', () => {
  it('lists the searched-for sizes, smallest first', () => {
    expect(VRAM_TIERS).toEqual([8, 12, 16, 24, 32, 48, 64, 96, 128]);
  });

  it('round-trips every tier through its slug', () => {
    expect(tierSlug(16)).toBe('16gb');
    expect(tierPath(16)).toBe('/vram/16gb');
    for (const t of VRAM_TIERS) expect(parseTierSlug(tierSlug(t))).toBe(t);
  });

  it('rejects unlisted sizes and other spellings', () => {
    for (const bad of ['10gb', '16', '16GB', '016gb', '', 'gb', '16gbx']) expect(parseTierSlug(bad), bad).toBeNull();
  });
});

describe('gpuPageFacts / gpuDescription', () => {
  it('counts models (not variants) at the largest memory option', () => {
    const m3Ultra = gpusData.find((g) => g.id === 'm3-ultra');
    const facts = gpuPageFacts(m3Ultra, modelsData);
    const top = gpuConfigs(m3Ultra).at(-1);
    expect(facts.config).toEqual(top);
    expect(facts.multiConfig).toBe(true);
    const r = bucketModels(modelsData, top.vram, top.bandwidth, null, null);
    expect(facts.runsWell).toBe(groupVariants(r.fits).length);
    expect(facts.topNames).toEqual(topModelsByScore(r.fits, 'mmlu_score', 2).map((m) => m.name));
  });

  it('writes the description the GPU page has always had', () => {
    const facts = { config: { vram: 16 }, multiConfig: false, runsWell: 44, tight: 8, topNames: ['A', 'B'] };
    expect(gpuDescription({ name: 'GeForce RTX 5070 Ti' }, facts)).toBe(
      '44 local LLMs run well on the GeForce RTX 5070 Ti with 16 GB of VRAM, including A and B. See max context and estimated tokens/sec for every model.'
    );
    expect(gpuDescription({ name: 'M3 Max' }, { ...facts, config: { vram: 128 }, multiConfig: true, topNames: [] })).toBe(
      '44 local LLMs run well on the M3 Max with 128 GB. See max context and estimated tokens/sec for every model.'
    );
  });
});

describe('modelPageFacts', () => {
  it('splits gpusForModel into runs-well and loads, with the smallest memory of each', () => {
    for (const model of modelPages(modelsData)) {
      const facts = modelPageFacts(model, gpusData);
      expect(facts.runners).toEqual(gpusForModel(model.variants, gpusData));
      expect(facts.runnersWell.every((r) => r.status === 'fits')).toBe(true);
      const minVram = (list) => (list.length ? Math.min(...list.map((r) => r.config.vram)) : null);
      expect(facts.cheapest?.config.vram ?? null).toBe(minVram(facts.runnersWell));
      expect(facts.smallestRunner?.config.vram ?? null).toBe(minVram(facts.runners));
    }
  });
});

describe('modelItemListLd', () => {
  const m = (name, quantization, mmlu_score) => ({ name, quantization, mmlu_score, weight_gb: quantization === 'Q8_0' ? 8 : 4 });

  it('collapses variants into one ListItem per model, keeping the given order', () => {
    const fits = [m('Beta 7B', 'Q8_0', 70), m('Alpha 3B', 'Q4_K_M', 60), m('Beta 7B', 'Q4_K_M', 70)];
    const ld = modelItemListLd('Best local AI models for the RTX 4090', fits);
    expect(ld).toEqual({
      '@type': 'ItemList',
      name: 'Best local AI models for the RTX 4090',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Beta 7B', url: `${SITE_URL}/model/beta-7b` },
        { '@type': 'ListItem', position: 2, name: 'Alpha 3B', url: `${SITE_URL}/model/alpha-3b` },
      ],
    });
  });

  it(`caps the list at ${ITEM_LIST_LIMIT} models by default`, () => {
    const fits = Array.from({ length: 25 }, (_, i) => m(`Model ${i}`, 'Q4_K_M', 90 - i));
    const items = modelItemListLd('x', fits).itemListElement;
    expect(items).toHaveLength(ITEM_LIST_LIMIT);
    expect(items.map((it) => it.position)).toEqual(Array.from({ length: ITEM_LIST_LIMIT }, (_, i) => i + 1));
    expect(items.at(-1).name).toBe(`Model ${ITEM_LIST_LIMIT - 1}`);
    expect(modelItemListLd('x', fits, 3).itemListElement).toHaveLength(3);
  });

  it('returns null when nothing runs well, so the page omits the list', () => {
    expect(modelItemListLd('x', [])).toBeNull();
  });

  it('lists, for every GPU page, the first models that run well, linked by absolute URL to pages that exist', () => {
    const slugs = new Set(modelPages(modelsData).map((p) => p.slug));
    for (const gpu of gpusData) {
      const config = gpuConfigs(gpu).at(-1);
      const results = bucketModels(modelsData, config.vram, config.bandwidth, null, null);
      const ld = modelItemListLd(gpu.name, results.fits);
      if (ld == null) {
        expect(results.fits).toHaveLength(0);
        continue;
      }
      // Same models, same order as the page's "runs well" group (ModelResults uses groupByBestStatus)
      const shown = groupByBestStatus(results).fits.map((g) => g.name);
      expect(ld.itemListElement.map((it) => it.name)).toEqual(shown.slice(0, ITEM_LIST_LIMIT));
      for (const it of ld.itemListElement) {
        expect(it.url).toMatch(/^https:\/\/whatmodelscanirun\.com\/model\/[a-z0-9-]+$/);
        expect(slugs.has(it.url.split('/').pop())).toBe(true);
      }
    }
  });
});
