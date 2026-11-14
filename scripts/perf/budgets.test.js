// Tests for the page-weight budget checker itself: that it reads SvelteKit's
// markup correctly and that each rule fails when broken. The real build is
// checked by `npm run test:perf`; these use a tiny fake build in a temp dir.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parseHtml, isRenderBlockingStylesheet, isParserBlockingScript, measurePage, checkBudgets, routeOf } from './inspect.js';
import { budgets as realBudgets } from './budgets.js';

const KiB = 1024;

describe('parseHtml', () => {
  const html = `<!doctype html><html><head>
    <link rel="icon" href="./favicon.svg" />
    <script>window.x = 1</script>
    <script async src="https://ads.example/ad.js" crossorigin="anonymous"></script>
    <script src="./sync.js"></script>
    <link href="./_app/immutable/entry/start.js" rel="modulepreload">
    <link href="./a.css" rel="stylesheet">
    <link href="./print.css" rel="stylesheet" media="print">
  </head><body>
    <img src="./logo.png" alt="logo" class="logo svelte-1" width=96 height="96" fetchpriority="high">
    <img src='./b.png' alt=''>
    <link href="./late.css" rel="stylesheet">
    <script>Promise.all([import("./_app/immutable/entry/start.js"), import('./_app/immutable/entry/app.js')])</script>
  </body></html>`;
  const parsed = parseHtml(html);

  it('finds preloaded and dynamically imported modules', () => {
    expect(parsed.modulepreloads).toEqual(['./_app/immutable/entry/start.js']);
    expect(parsed.imports).toEqual(['./_app/immutable/entry/start.js', './_app/immutable/entry/app.js']);
  });

  it('counts only head stylesheets that apply on load as render-blocking', () => {
    expect(parsed.stylesheets.filter(isRenderBlockingStylesheet).map((s) => s.href)).toEqual(['./a.css']);
  });

  it('flags a classic script without async/defer, not an async one or inline scripts', () => {
    expect(parsed.scripts.map((s) => s.src)).toEqual(['https://ads.example/ad.js', './sync.js']);
    expect(parsed.scripts.filter(isParserBlockingScript).map((s) => s.src)).toEqual(['./sync.js']);
  });

  it('reads unquoted, single-quoted and valueless attributes on images', () => {
    expect(parsed.imgs[0]).toMatchObject({ src: './logo.png', width: '96', height: '96', fetchpriority: 'high' });
    expect(parsed.imgs[1]).toMatchObject({ src: './b.png', alt: '' });
    expect(parsed.imgs[1].width).toBeUndefined();
  });
});

describe('routeOf', () => {
  it('maps every page of a dynamic route to one budget group', () => {
    expect(routeOf('gpu/rtx-4090.html', realBudgets.routes)).toBe('gpu/[slug]');
    expect(routeOf('index.html', realBudgets.routes)).toBe('home');
    expect(routeOf('data/index.html', realBudgets.routes)).toBe('data');
    expect(routeOf('brand-new.html', realBudgets.routes)).toBeNull();
  });
});

describe('checkBudgets on a fake build', () => {
  let dir;
  // Random bytes don't compress, so gzip size is close to the raw size
  const writeJs = (name, kib) => writeFileSync(join(dir, '_app', name), randomBytes(kib * KiB));
  const page = ({ js = ['small.js'], head = '', body = '' } = {}) => `<!doctype html><html><head>
    ${js.map((f) => `<link href="./_app/${f}" rel="modulepreload">`).join('\n')}
    <link href="./_app/site.css" rel="stylesheet">
    ${head}
  </head><body>
    <img src="./logo.png" alt="" class="logo" width="96" height="96" fetchpriority="high">
    ${body}
  </body></html>`;
  const budgets = {
    routes: { home: 'index.html' },
    defaults: { jsGzip: 20 * KiB, cssGzip: 4 * KiB, htmlGzip: 10 * KiB, jsFiles: 3, blockingStylesheets: 1 },
    imageBytes: 8 * KiB,
    ogImageBytes: 100 * KiB,
    staticFileBytes: 100 * KiB,
    lcpImage: 'logo',
  };
  const check = (html, overrides = {}) => {
    writeFileSync(join(dir, 'index.html'), html);
    return checkBudgets({ pages: [measurePage(dir, join(dir, 'index.html'))] }, { ...budgets, ...overrides });
  };
  const rules = (failures) => failures.map((f) => f.rule);

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'perf-budget-'));
    mkdirSync(join(dir, '_app'));
    writeJs('small.js', 5);
    writeJs('big.js', 30);
    writeFileSync(join(dir, '_app', 'site.css'), 'body{color:red}');
    writeFileSync(join(dir, 'logo.png'), randomBytes(4 * KiB));
    writeFileSync(join(dir, 'big.png'), randomBytes(50 * KiB));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('passes a page within every budget', () => {
    expect(check(page())).toEqual([]);
  });

  it('fails when critical JS goes over budget', () => {
    // 5 KiB + 30 KiB of incompressible JS > 20 KiB
    const failures = check(page({ js: ['small.js', 'big.js'] }));
    expect(rules(failures)).toEqual(['jsGzip']);
    expect(failures[0].actual).toBeGreaterThan(34 * KiB);
    expect(failures[0].message).toContain('over the home budget of 20.0 KiB');
  });

  it('applies a per-route override over the default', () => {
    expect(check(page({ js: ['small.js', 'big.js'] }), { perRoute: { home: { jsGzip: 40 * KiB } } })).toEqual([]);
  });

  it('fails on too many JS files and too many render-blocking stylesheets', () => {
    const failures = check(
      page({ js: ['small.js', 'small.js?1', 'small.js?2', 'small.js?3'], head: '<link href="./_app/site.css?2" rel="stylesheet">' }),
      { defaults: { ...budgets.defaults, jsGzip: 100 * KiB } }
    );
    expect(rules(failures).sort()).toEqual(['blockingStylesheets', 'jsFiles']);
  });

  it('fails on a synchronous third-party script and a parser-blocking local one', () => {
    const failures = check(page({ head: '<script src="https://ads.example/ad.js"></script><script src="./_app/small.js"></script>' }));
    expect(rules(failures).sort()).toEqual(['parser-blocking-script', 'parser-blocking-script', 'third-party-sync']);
  });

  it('accepts async and deferred third-party scripts', () => {
    expect(check(page({ head: '<script async src="https://ads.example/ad.js"></script><script defer src="https://ph.example/a.js"></script>' }))).toEqual([]);
  });

  it('fails on an image without dimensions, an oversized image and a missing file', () => {
    const failures = check(page({ body: '<img src="./big.png" alt=""><img src="./gone.png" width="1" height="1" alt="">' }));
    expect(rules(failures).sort()).toEqual(['image-bytes', 'img-dimensions', 'missing-asset']);
  });

  it('fails when the LCP image loses fetchpriority or becomes lazy', () => {
    const html = page().replace('fetchpriority="high"', 'loading="lazy"');
    expect(rules(check(html)).sort()).toEqual(['lcp-fetchpriority', 'lcp-lazy']);
  });

  it('turns a pending failure into a warning, but only for the named offender', () => {
    const html = page({ body: '<img src="./big.png" width="1" height="1" alt="">' }).replace('./logo.png', './big.png');
    const failures = check(html, { pending: { 'image-bytes': { reason: 'fix on a branch', only: /logo\.png/ } } });
    expect(failures.filter((f) => !f.pending).map((f) => f.rule)).toEqual(['image-bytes', 'image-bytes']);

    const exempt = check(html, { pending: { 'image-bytes': { reason: 'fix on a branch', only: /big\.png/ } } });
    expect(exempt).toHaveLength(1); // two warnings collapse into one entry
    expect(exempt[0]).toMatchObject({ rule: 'image-bytes', pending: 'fix on a branch', count: 2 });
  });

  it('fails a page that belongs to no route', () => {
    writeFileSync(join(dir, 'new.html'), page());
    const failures = checkBudgets({ pages: [measurePage(dir, join(dir, 'new.html'))] }, budgets);
    expect(rules(failures)).toEqual(['unknown-route']);
  });

  it('checks Open Graph and static file sizes', () => {
    const failures = checkBudgets(
      { pages: [], ogImages: [{ file: 'og/gpu/x.png', raw: 150 * KiB }], staticFiles: [{ file: 'hero.jpg', raw: 400 * KiB }] },
      budgets
    );
    expect(rules(failures)).toEqual(['og-image-bytes', 'static-file-bytes']);
  });
});
