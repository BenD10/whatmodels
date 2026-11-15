import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

// Guards for what PageSpeed Insights reports that a browser test can measure
// deterministically: layout shift (CLS), horizontal overflow and the
// accessibility audits. Speed scores (TBT, LCP timing) are too noisy to block
// on and are mostly third-party cost; see biz/research/perf-regression-guard-2026-11.md.
//
// Third parties are stubbed (fixtures.js), so these measure our own page only.

// One of each page type, plus the shared-link case that had CLS 0.54 for real users
const PAGES = [
  { path: '/', ready: 'section.empty' },
  // Results render after hydration and push the footer down: 0.06 on desktop
  // even with perf/quick-wins (the scrollbar part, 0.6-0.8, is fixed there).
  // Google's "good" line is the limit here; the footer follow-up in the
  // pagespeed report would bring it to 0 and this back to the default.
  { path: '/?gpu=rtx-4090&ctx=32', ready: '.overview', cls: 0.1 },
  { path: '/gpu/rtx-4090', ready: '.overview' },
  { path: '/model/qwen3-5-27b', ready: 'h1' },
  { path: '/vram/16gb', ready: '.overview' },
  { path: '/data/', ready: 'h1' },
  { path: '/gpus', ready: 'h1' },
  { path: '/new/', ready: 'h1' },
];

// Lab CLS of our own pages is 0.000 everywhere except the shared link above;
// 0.01 allows sub-pixel noise but no real shift ("good" for real users is 0.1)
const CLS_LIMIT = 0.01;

// Known failures are marked fixme below; RUN_KNOWN_FAILURES=1 runs them anyway
const runKnown = !!process.env.RUN_KNOWN_FAILURES;

// Chrome's CLS: the largest burst of shifts (gaps under 1 s, at most 5 s long),
// ignoring shifts right after user input. Installed before any page script.
function observeCls() {
  window.__cls = { value: 0, entries: [] };
  let session = 0;
  let first = 0;
  let last = 0;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      if (session && (e.startTime - last > 1000 || e.startTime - first > 5000)) session = 0;
      if (!session) first = e.startTime;
      session += e.value;
      last = e.startTime;
      window.__cls.value = Math.max(window.__cls.value, session);
      window.__cls.entries.push({
        value: e.value,
        time: Math.round(e.startTime),
        sources: (e.sources ?? []).map((s) => s.node?.className || s.node?.nodeName || '?').slice(0, 3),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

async function settle(page, ready) {
  await expect(page.locator(ready).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Two frames, so a shift from the last render is recorded
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// The headless shell hides scrollbars by default, which hides exactly the
// shift we care about (a classic scrollbar appearing on Windows/Linux desktops)
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

test.describe('layout shift (CLS)', () => {
  for (const { path, ready, cls: limit = CLS_LIMIT } of PAGES) {
    test(`${path} stays under ${limit}`, async ({ page }, testInfo) => {
      // On main the shared-link home page jumps when the scrollbar appears
      // (0.81 in this test on desktop). The fix,
      // `html { scrollbar-gutter: stable }`, is on perf/quick-wins; drop this
      // fixme when that merges.
      test.fixme(!runKnown && path.startsWith('/?') && testInfo.project.name === 'desktop', 'scrollbar shift: fixed on perf/quick-wins');
      await page.addInitScript(observeCls);
      await page.goto(path);
      await settle(page, ready);
      const cls = await page.evaluate(() => window.__cls);
      expect(cls.value, `layout shifts: ${JSON.stringify(cls.entries)}`).toBeLessThan(limit);
    });
  }
});

test.describe('no horizontal overflow', () => {
  for (const { path, ready } of PAGES) {
    test(`${path} fits the viewport width`, async ({ page }) => {
      await page.goto(path);
      await settle(page, ready);
      const { scrollWidth, clientWidth, culprits } = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const culprits = [...document.querySelectorAll('body *')]
          .filter((el) => el.getBoundingClientRect().right > vw + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
        return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, culprits };
      });
      expect(scrollWidth, `wider than the viewport: ${culprits.join(', ')}`).toBeLessThanOrEqual(clientWidth);
    });
  }
});

// The axe-core rules behind Lighthouse 12's accessibility score (what PSI
// shows), so this test fails on what PSI would flag and nothing else. axe has
// more rules; two of them fail today and aren't in PSI: nested-interactive (the
// results bar is role="img" with links inside) and scrollable-region-focusable
// (scrolling <pre> and table wrappers aren't keyboard-focusable). Worth fixing,
// but out of scope for a PSI guard.
const LIGHTHOUSE_RULES = [
  'accesskeys', 'aria-allowed-attr', 'aria-allowed-role', 'aria-command-name', 'aria-conditional-attr',
  'aria-deprecated-role', 'aria-dialog-name', 'aria-hidden-body', 'aria-hidden-focus', 'aria-input-field-name',
  'aria-meter-name', 'aria-progressbar-name', 'aria-prohibited-attr', 'aria-required-attr', 'aria-required-children',
  'aria-required-parent', 'aria-roles', 'aria-toggle-field-name', 'aria-tooltip-name',
  'aria-treeitem-name', 'aria-valid-attr', 'aria-valid-attr-value', 'button-name', 'bypass', 'color-contrast',
  'definition-list', 'dlitem', 'document-title', 'duplicate-id-aria', 'empty-heading', 'form-field-multiple-labels',
  'frame-title', 'heading-order', 'html-has-lang', 'html-lang-valid', 'html-xml-lang-mismatch',
  'identical-links-same-purpose', 'image-alt', 'image-redundant-alt', 'input-button-name', 'input-image-alt',
  'label', 'label-content-name-mismatch', 'landmark-one-main', 'link-in-text-block', 'link-name', 'list',
  'listitem', 'meta-refresh', 'meta-viewport', 'object-alt', 'select-name', 'skip-link', 'tabindex',
  'table-duplicate-name', 'table-fake-caption', 'target-size', 'td-has-header', 'td-headers-attr',
  'th-has-data-cells', 'valid-lang', 'video-caption',
];

// Known failures on main, which the blocking test skips. The fixme test checks
// them on every page so the remaining work stays visible; delete an entry once
// no page fails it, and the fixme once the list is empty.
// perf/quick-wins (fe6608d) fixes all three on / and the --text-muted text
// everywhere, but these still fail with it merged:
//   color-contrast: .params.badge, .quant.badge, .group-count, .gpu-mem
//     (result lists on /, /gpu, /vram, /model) and .meta on /data/
//   heading-order, link-in-text-block: /gpus (an <h3> after the intro, and the intro link)
const KNOWN_A11Y = {
  'color-contrast': '--text-muted is 4.3:1 on --surface (needs 4.5:1); badges are lower',
  'heading-order': 'an <h3> with no <h2> before it on the landing pages',
  'link-in-text-block': 'intro links told apart by colour only',
  // The GPU picker's clear button (shown once a GPU is picked) is about 13 px
  // wide, under the 24 px minimum. Not fixed on any branch yet.
  'target-size': 'MultiSelect .clear-btn is under 24x24 px',
};

async function axe(page, { only } = {}) {
  const { violations } = await new AxeBuilder({ page }).withRules(LIGHTHOUSE_RULES).analyze();
  return violations
    .filter((v) => (only ? only.includes(v.id) : !(v.id in KNOWN_A11Y)))
    .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.describe('accessibility (axe)', () => {
  for (const { path, ready } of PAGES) {
    test(`${path} has no violations`, async ({ page }) => {
      await page.goto(path);
      await settle(page, ready);
      expect(await axe(page)).toEqual([]);
    });

    test(`${path} passes the known-failing rules too`, async ({ page }) => {
      test.fixme(!runKnown, `known failures on main: ${Object.keys(KNOWN_A11Y).join(', ')}`);
      await page.goto(path);
      await settle(page, ready);
      expect(await axe(page, { only: Object.keys(KNOWN_A11Y) })).toEqual([]);
    });
  }
});
