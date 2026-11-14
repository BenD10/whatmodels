import { describe, it, expect } from 'vitest';
import {
  FEED_PATH,
  NEW_PATH,
  buildFeed,
  escapeXml,
  feedItemHtml,
  findRelease,
  modelNeed,
  namesList,
  paramsLabel,
  releaseCountsLabel,
  releaseDateLabel,
  releasePath,
  releaseView,
  rfc822Date,
  sortReleases,
} from './releases.js';
import { calcVramForContext } from './calculations.js';
import { modelPages } from './pages.js';
import gpusData from './data/gpus.json';
import modelsData from './data/models.json';
import releasesData from './data/releases.json';

// Two quantizations of one model, and a GPU
const models = [
  { id: 'demo-8b-q8', name: 'Demo <8B>', params_b: 8, quantization: 'Q8_0', weight_gb: 8.5, kv_per_1k_gb: 0.125, max_context_k: 128, features: ['tool_use'], layers: 32, mmlu_score: 60, swe_bench_score: null },
  { id: 'demo-8b-q4', name: 'Demo <8B>', params_b: 8, quantization: 'Q4_K_M', weight_gb: 4.9, kv_per_1k_gb: 0.125, max_context_k: 128, features: ['tool_use'], layers: 32, mmlu_score: 60, swe_bench_score: null },
  { id: 'short-2b-q4', name: 'Short 2B', params_b: 2, quantization: 'Q4_K_M', weight_gb: 1.5, kv_per_1k_gb: 0.1, max_context_k: 8, features: [], layers: 24, mmlu_score: null, swe_bench_score: null },
];
const gpus = [{ id: 'rtx-demo', name: 'GeForce RTX Demo', manufacturer: 'NVIDIA', vram_gb: 16, bandwidth_gbps: 500 }];

const release = {
  date: '2026-11-13',
  title: 'Demo & friends',
  summary: 'One model, one GPU.',
  models_added: ['Demo <8B>'],
  gpus_added: ['rtx-demo'],
  corrections: ['Fixed "quotes" & <tags>.'],
};

describe('paths', () => {
  it('puts the index in a directory and each release beside it', () => {
    expect(NEW_PATH).toBe('/new/');
    expect(FEED_PATH).toBe('/new.xml');
    expect(releasePath('2026-11-13')).toBe('/new/2026-11-13');
  });
});

describe('sortReleases / findRelease', () => {
  const list = [{ date: '2026-03-06' }, { date: '2026-11-13' }, { date: '2026-09-07' }];

  it('sorts newest first without touching the input', () => {
    expect(sortReleases(list).map((r) => r.date)).toEqual(['2026-11-13', '2026-09-07', '2026-03-06']);
    expect(list[0].date).toBe('2026-03-06');
  });

  it('handles an empty list', () => {
    expect(sortReleases([])).toEqual([]);
  });

  it('finds a release by date, or null', () => {
    expect(findRelease(list, '2026-09-07')).toBe(list[2]);
    expect(findRelease(list, '2026-01-01')).toBeNull();
  });
});

describe('dates', () => {
  it('labels a release date in words, in UTC', () => {
    expect(releaseDateLabel('2026-11-13')).toBe('November 13, 2026');
    expect(releaseDateLabel('2027-01-01')).toBe('January 1, 2027');
  });

  it('formats RSS pubDate as RFC 822', () => {
    expect(rfc822Date('2026-11-13')).toBe('Fri, 13 Nov 2026 00:00:00 GMT');
    expect(rfc822Date('2026-03-06')).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
  });
});

describe('releaseCountsLabel', () => {
  it('counts each kind of change, skipping empty ones', () => {
    expect(releaseCountsLabel(release)).toBe('1 new model · 1 new GPU · 1 correction');
    expect(releaseCountsLabel({ models_added: ['a', 'b'], gpus_added: [], corrections: ['x', 'y', 'z'] })).toBe('2 new models · 3 corrections');
    expect(releaseCountsLabel({ models_added: [], gpus_added: [], corrections: [] })).toBe('No changes');
  });
});

describe('namesList', () => {
  it('joins names as prose and caps long lists', () => {
    expect(namesList([])).toBe('');
    expect(namesList(['A'])).toBe('A');
    expect(namesList(['A', 'B'])).toBe('A and B');
    expect(namesList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(namesList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
});

describe('paramsLabel', () => {
  it('rounds only large models', () => {
    expect(paramsLabel(8)).toBe('8B');
    expect(paramsLabel(27.36)).toBe('27.36B');
    expect(paramsLabel(572.12)).toBe('572B');
    expect(paramsLabel(1049.43)).toBe('1,049B');
  });
});

describe('modelNeed', () => {
  const [demo, short] = modelPages(models);

  it('quotes the lightest quantization at 16K context, rounded up', () => {
    // Q4_K_M: 4.9 GB weights + 16 × 0.125 GB KV = 6.9 GB → 7 GB
    expect(modelNeed(demo)).toEqual({ gb: 7, quantization: 'Q4_K_M', contextK: 16 });
  });

  it('uses the whole context when the model has less than 16K', () => {
    // 1.5 GB + 8 × 0.1 GB = 2.3 GB → 3 GB
    expect(modelNeed(short)).toEqual({ gb: 3, quantization: 'Q4_K_M', contextK: 8 });
  });

  it('agrees with calcVramForContext on real data', () => {
    for (const m of modelPages(modelsData)) {
      const { gb, contextK } = modelNeed(m);
      expect(gb).toBe(Math.ceil(calcVramForContext(m.variants[0], contextK)));
    }
  });
});

describe('releaseView', () => {
  const view = releaseView(release, models, gpus);

  it('resolves model names and GPU ids into linkable entries', () => {
    expect(view.path).toBe('/new/2026-11-13');
    expect(view.dateLabel).toBe('November 13, 2026');
    expect(view.models).toEqual([
      { name: 'Demo <8B>', slug: 'demo-8b', params_b: 8, paramsLabel: '8B', features: ['tool_use'], need: 7, quantization: 'Q4_K_M', contextLabel: '16K' },
    ]);
    expect(view.gpus).toEqual([{ id: 'rtx-demo', name: 'RTX Demo', vramLabel: '16 GB' }]);
    expect(view.corrections).toEqual(release.corrections);
  });

  it('drops names and ids that are not in the data', () => {
    const v = releaseView({ ...release, models_added: ['Nope'], gpus_added: ['nope'] }, models, gpus);
    expect(v.models).toEqual([]);
    expect(v.gpus).toEqual([]);
  });

  it('resolves every committed release in full', () => {
    for (const r of releasesData) {
      const v = releaseView(r, modelsData, gpusData);
      expect(v.models.length, r.date).toBe(r.models_added.length);
      expect(v.gpus.length, r.date).toBe(r.gpus_added.length);
    }
  });
});

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;');
  });
});

describe('feedItemHtml', () => {
  it('links models and GPUs absolutely and escapes text', () => {
    const html = feedItemHtml(releaseView(release, models, gpus), 'https://example.com');
    expect(html).toContain('<a href="https://example.com/model/demo-8b">Demo &lt;8B&gt;</a>: needs 7 GB to run well');
    expect(html).toContain('<a href="https://example.com/gpu/rtx-demo">RTX Demo</a> (16 GB)');
    expect(html).toContain('<li>Fixed &quot;quotes&quot; &amp; &lt;tags&gt;.</li>');
  });

  it('leaves out empty sections', () => {
    const html = feedItemHtml(releaseView({ ...release, models_added: [], gpus_added: [], corrections: [] }, models, gpus));
    expect(html).toBe('<p>One model, one GPU.</p>');
  });
});

/**
 * Minimal XML well-formedness check: every tag closes in order, attribute
 * values are quoted, and no bare `&` or `<` appears in text. Enough for the
 * feed we generate; the e2e test parses it with a real XML parser too.
 */
function assertWellFormed(xml) {
  const body = xml.replace(/^<\?xml [^?]*\?>\s*/, '');
  const stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(body))) {
    const text = body.slice(last, m.index);
    expect(text, `stray < before ${m[0]}`).not.toMatch(/</);
    expect(text, 'bare &').not.toMatch(/&(?!(amp|lt|gt|quot|apos|#\d+);)/);
    last = tagRe.lastIndex;
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) expect(stack.pop(), `</${name}>`).toBe(name);
    else stack.push(name);
  }
  expect(body.slice(last).trim()).toBe('');
  expect(stack).toEqual([]);
}

/** Text of each top-level <tag> inside an XML fragment. */
function elements(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]);
}

describe('buildFeed', () => {
  const views = releasesData.map((r) => releaseView(r, modelsData, gpusData));
  const xml = buildFeed(views, 'https://example.com');

  it('is well-formed RSS 2.0', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    assertWellFormed(xml);
  });

  it('has the required channel elements and a self link', () => {
    const [channel] = elements(xml, 'channel');
    const head = channel.split('<item>')[0];
    expect(elements(head, 'title')).toEqual(["What Models? What&apos;s new"]);
    expect(elements(head, 'link')).toEqual(['https://example.com/new/']);
    expect(elements(head, 'description')[0].length).toBeGreaterThan(0);
    expect(head).toContain('<atom:link href="https://example.com/new.xml" rel="self" type="application/rss+xml" />');
    expect(elements(head, 'lastBuildDate')).toEqual([rfc822Date(releasesData[0].date)]);
  });

  it('has one item per release, newest first, with absolute links and RFC 822 dates', () => {
    const items = elements(xml, 'item');
    expect(items.length).toBe(releasesData.length);
    items.forEach((item, i) => {
      const url = `https://example.com/new/${releasesData[i].date}`;
      expect(elements(item, 'link')).toEqual([url]);
      expect(elements(item, 'guid')).toEqual([url]);
      expect(elements(item, 'pubDate')).toEqual([rfc822Date(releasesData[i].date)]);
      expect(elements(item, 'title')[0]).toContain(escapeXml(releasesData[i].title));
      // The HTML body is escaped, so it can't break the XML
      expect(elements(item, 'description')[0]).toMatch(/^&lt;p&gt;/);
    });
  });

  it('sorts items by date whatever the input order, and builds with no releases', () => {
    const shuffled = buildFeed([...views].reverse(), 'https://example.com');
    expect(shuffled).toBe(xml);
    const empty = buildFeed([]);
    assertWellFormed(empty);
    expect(elements(empty, 'item')).toEqual([]);
    expect(empty).not.toContain('lastBuildDate');
  });
});
