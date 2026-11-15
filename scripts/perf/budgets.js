// Page-weight budgets, checked by check-budgets.js against the static build.
//
// Sizes are gzipped bytes of what a first-time visitor downloads before the
// page can render and hydrate. They were set from the main build on
// 2026-11-14 (63044e8) with roughly 10-15% headroom: room for a data refresh
// or a small feature, but not for a new dependency or an accidental import of
// a whole data file into a page that didn't have it. If a budget fails for a
// change you mean to make, raise the number here in the same PR and say why
// in the PR description; that keeps every increase deliberate and reviewed.
//
// Measured on main (largest page per route), for reference:
//   route         critical JS   CSS      HTML      JS files  blocking CSS
//   home          71.3 KiB      6.0 KiB   4.2 KiB  15        4
//   gpu/[slug]    68.4 KiB      4.9 KiB  14.2 KiB  17        4
//   vram/[size]   68.7 KiB      5.1 KiB  15.2 KiB  17        4
//   model/[slug]  61.3 KiB      2.4 KiB   6.5 KiB  15        3
//   data          61.1 KiB      1.7 KiB   7.0 KiB  13        2
//   models        54.2 KiB      1.4 KiB   5.0 KiB  12        2
//   gpus          44.8 KiB      1.5 KiB   4.8 KiB  12        2
//   primer        43.6 KiB      1.2 KiB   5.1 KiB  11        2
//   privacy       43.3 KiB      1.3 KiB   4.8 KiB  11        2
// The model list (models.json) is about 13 KiB of the JS on every data page and
// grows by roughly 0.12 KiB gzipped per model row, so a 30-model data release
// costs about 3.5 KiB.

const KiB = 1024;

export const budgets = {
  // Every prerendered page must belong to a route, so a new route can't ship
  // without a budget. Keys are paths relative to build/.
  routes: {
    home: 'index.html',
    'gpu/[slug]': /^gpu\/[^/]+\.html$/,
    'vram/[size]': /^vram\/[^/]+\.html$/,
    'model/[slug]': /^model\/[^/]+\.html$/,
    data: 'data/index.html',
    models: 'models.html',
    gpus: 'gpus.html',
    primer: 'primer.html',
    privacy: 'privacy.html',
    new: 'new/index.html',
    'new/[date]': /^new\/[^/]+\.html$/,
  },

  defaults: {
    jsGzip: 52 * KiB, // the Svelte + SvelteKit runtime alone is about 43 KiB
    cssGzip: 8 * KiB,
    htmlGzip: 10 * KiB,
    jsFiles: 22, // preloaded + imported modules; catches a chunk explosion
    blockingStylesheets: 5, // render-blocking <link rel=stylesheet> in <head>
  },

  perRoute: {
    home: { jsGzip: 80 * KiB },
    'gpu/[slug]': { jsGzip: 78 * KiB, htmlGzip: 20 * KiB },
    'vram/[size]': { jsGzip: 78 * KiB, htmlGzip: 20 * KiB },
    'model/[slug]': { jsGzip: 70 * KiB },
    data: { jsGzip: 70 * KiB },
    models: { jsGzip: 62 * KiB },
  },

  // Any image shown with <img> on a page (raw bytes; images don't gzip). The
  // header logo is the LCP element on most pages, so this is an LCP budget.
  imageBytes: 24 * KiB,
  // Each prerendered Open Graph card (1200x630 PNG). Not loaded by visitors,
  // but social sites fetch them and large ones get dropped. Largest today 72.6 KiB.
  ogImageBytes: 100 * KiB,
  // Each file in static/, copied to the site root as-is. Largest: logo.png 74.6 KiB,
  // which stays as the OG renderer's source.
  staticFileBytes: 100 * KiB,
  // Class of the LCP <img> (the header logo): must be fetchpriority="high" and not lazy
  lcpImage: 'logo',

  // Known failures with a fix on the way. Each turns its failures into warnings;
  // `only` limits the exemption to the known offender so a new one still fails.
  // Delete an entry once its fix merges (the check prints a note when it's stale).
  pending: {
    'image-bytes': {
      reason: 'the 75 KiB logo.png becomes a 7 KiB logo.webp on perf/quick-wins',
      only: /logo\.png/,
    },
    'lcp-fetchpriority': {
      reason: 'perf/quick-wins adds fetchpriority="high" to the header logo',
    },
  },
};
