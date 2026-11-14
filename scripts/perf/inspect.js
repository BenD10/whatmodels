// Reads the static build and measures what each page makes a first-time
// visitor download before it can render and hydrate: the JavaScript it
// preloads and imports, its stylesheets, the HTML itself and the images it
// shows. Everything here is deterministic (file sizes and markup), so the
// budgets in budgets.js can block a PR without the noise of a lab run.
//
// The HTML is SvelteKit's own prerendered output, so a few regular
// expressions are enough to find the tags we care about.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, posix, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const TAG_RE = /<(link|script|img)\b([^>]*)>/gi;
const ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
// SvelteKit's inline bootstrap: import("./_app/immutable/entry/start.X.js")
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

/** Attributes of one tag as a plain object; valueless attributes are ''. */
export function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(ATTR_RE)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * The tags in one HTML document that affect loading.
 * @returns {{ modulepreloads: string[], stylesheets: {href:string, media?:string, inHead:boolean}[],
 *   scripts: {src:string, attrs:object, inHead:boolean}[], imports: string[], imgs: object[] }}
 */
export function parseHtml(html) {
  const headEnd = html.search(/<\/head>/i);
  const out = { modulepreloads: [], stylesheets: [], scripts: [], imports: [], imgs: [] };
  for (const m of html.matchAll(TAG_RE)) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    const inHead = headEnd === -1 || m.index < headEnd;
    if (tag === 'link') {
      const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
      if (rel.includes('modulepreload')) out.modulepreloads.push(attrs.href);
      else if (rel.includes('stylesheet')) out.stylesheets.push({ href: attrs.href, media: attrs.media, inHead });
    } else if (tag === 'script' && attrs.src !== undefined) {
      out.scripts.push({ src: attrs.src, attrs, inHead });
    } else if (tag === 'img') {
      out.imgs.push(attrs);
    }
  }
  for (const m of html.matchAll(DYNAMIC_IMPORT_RE)) out.imports.push(m[1]);
  return out;
}

/** True for an absolute URL to another origin (or protocol-relative). */
export function isExternal(url) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
}

/**
 * A stylesheet blocks rendering unless its media query can't match on load
 * (the media="print" + onload trick). Body stylesheets don't block first paint.
 */
export function isRenderBlockingStylesheet(sheet) {
  if (!sheet.inHead) return false;
  const media = (sheet.media ?? '').trim().toLowerCase();
  return media === '' || media === 'all' || media === 'screen';
}

/** A classic <script src> without async/defer stops the parser. Modules are deferred. */
export function isParserBlockingScript(script) {
  const { attrs } = script;
  return !('async' in attrs) && !('defer' in attrs) && (attrs.type ?? '').toLowerCase() !== 'module';
}

/** Turn a URL in a page into a path inside the build directory, or null if it's external. */
export function resolveAsset(buildDir, htmlFile, url, basePath = '') {
  if (!url || isExternal(url) || url.startsWith('data:')) return null;
  const clean = url.split(/[?#]/)[0];
  if (clean.startsWith('/')) {
    const withoutBase = basePath && clean.startsWith(basePath) ? clean.slice(basePath.length) : clean;
    return join(buildDir, withoutBase);
  }
  return join(dirname(htmlFile), clean);
}

const gzipCache = new Map();
/** Gzipped size in bytes (level 9, close to what GitHub Pages serves). */
export function gzipSize(file) {
  if (!gzipCache.has(file)) gzipCache.set(file, gzipSync(readFileSync(file), { level: 9 }).length);
  return gzipCache.get(file);
}

/** All files under dir with one of the extensions, recursively. */
export function listFiles(dir, extensions) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, extensions));
    else if (extensions.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Which budget group a page belongs to: its route, e.g. "gpu/[slug]" for
 * build/gpu/rtx-4090.html, so one budget covers every page of that route.
 * `routes` maps a group name to a test on the path relative to build/.
 */
export function routeOf(relPath, routes) {
  for (const [name, test] of Object.entries(routes)) {
    if (test instanceof RegExp ? test.test(relPath) : test === relPath) return name;
  }
  return null;
}

/** Measure one prerendered page. Missing local files are reported, not thrown. */
export function measurePage(buildDir, htmlFile, { basePath = '' } = {}) {
  const html = readFileSync(htmlFile);
  const parsed = parseHtml(html.toString('utf8'));
  const missing = [];
  const sizeOf = (url) => {
    const file = resolveAsset(buildDir, htmlFile, url, basePath);
    if (file === null) return null;
    if (!existsSync(file)) {
      missing.push(url);
      return null;
    }
    return { file, gzip: gzipSize(file), raw: statSync(file).size };
  };

  // Critical JS: everything preloaded plus the entry points the inline script imports
  const jsUrls = [...new Set([...parsed.modulepreloads, ...parsed.imports])];
  const js = jsUrls.map(sizeOf).filter(Boolean);
  const blockingCss = parsed.stylesheets.filter(isRenderBlockingStylesheet);
  const css = blockingCss.map((s) => sizeOf(s.href)).filter(Boolean);
  const images = parsed.imgs.map((img) => ({ attrs: img, size: sizeOf(img.src) }));

  return {
    page: relative(buildDir, htmlFile).split(sep).join(posix.sep),
    htmlGzip: gzipSync(html, { level: 9 }).length,
    jsGzip: js.reduce((sum, f) => sum + f.gzip, 0),
    jsFiles: js.length,
    cssGzip: css.reduce((sum, f) => sum + f.gzip, 0),
    blockingStylesheets: blockingCss.length,
    parserBlockingScripts: parsed.scripts.filter(isParserBlockingScript).map((s) => s.src),
    externalScripts: parsed.scripts.filter((s) => isExternal(s.src)).map((s) => ({ src: s.src, async: 'async' in s.attrs, defer: 'defer' in s.attrs, inHead: s.inHead })),
    images: images.map(({ attrs, size }) => ({
      src: attrs.src,
      raw: size?.raw ?? null,
      hasDimensions: attrs.width !== undefined && attrs.height !== undefined,
      fetchpriority: attrs.fetchpriority ?? null,
      loading: attrs.loading ?? null,
      className: attrs.class ?? '',
    })),
    missing,
  };
}

/**
 * Compare measurements with the budgets. Returns one entry per broken rule:
 * `{ rule, subject, actual, limit, message, pending }`. `pending` holds the
 * reason when the failure is listed in budgets.pending (a known failure with
 * a fix on the way); the CLI reports those as warnings instead of failing.
 */
export function checkBudgets({ pages, ogImages = [], staticFiles = [] }, budgets) {
  const failures = [];
  const fail = (rule, subject, actual, limit, message) =>
    failures.push({ rule, subject, actual, limit, message, pending: pendingReason(budgets.pending?.[rule], message) });

  const byRoute = new Map();
  for (const page of pages) {
    const route = routeOf(page.page, budgets.routes);
    if (route === null) {
      fail('unknown-route', page.page, null, null, `${page.page} matches no route in budgets.routes; add it so it has a budget`);
      continue;
    }
    if (!byRoute.has(route)) byRoute.set(route, []);
    byRoute.get(route).push(page);
  }

  for (const [route, routePages] of byRoute) {
    const limits = { ...budgets.defaults, ...budgets.perRoute?.[route] };
    for (const page of routePages) {
      for (const [metric, limit] of Object.entries(limits)) {
        if (limit === undefined || limit === null || !(metric in page)) continue;
        if (page[metric] > limit) {
          fail(metric, page.page, page[metric], limit, `${page.page}: ${metric} ${fmt(metric, page[metric])} is over the ${route} budget of ${fmt(metric, limit)}`);
        }
      }
      for (const url of page.missing) fail('missing-asset', page.page, null, null, `${page.page} references ${url}, which isn't in the build`);
      for (const src of page.parserBlockingScripts) {
        fail('parser-blocking-script', page.page, null, null, `${page.page}: <script src="${src}"> has no async/defer, so it blocks parsing`);
      }
      for (const s of page.externalScripts) {
        if (!s.async && !s.defer) fail('third-party-sync', page.page, null, null, `${page.page}: third-party script ${s.src} is neither async nor deferred`);
      }
      for (const img of page.images) {
        if (!img.hasDimensions) fail('img-dimensions', page.page, null, null, `${page.page}: <img src="${img.src}"> has no width/height, so it shifts the layout when it loads`);
        if (img.raw !== null && img.raw > budgets.imageBytes) {
          fail('image-bytes', page.page, img.raw, budgets.imageBytes, `${page.page}: ${img.src} is ${fmt('bytes', img.raw)}, over the ${fmt('bytes', budgets.imageBytes)} per-image budget`);
        }
      }
      const lcp = page.images.find((img) => budgets.lcpImage && img.className.split(/\s+/).includes(budgets.lcpImage));
      if (budgets.lcpImage && lcp && lcp.fetchpriority !== 'high') {
        fail('lcp-fetchpriority', page.page, null, null, `${page.page}: the LCP image (.${budgets.lcpImage}) should have fetchpriority="high"`);
      }
      if (lcp?.loading === 'lazy') fail('lcp-lazy', page.page, null, null, `${page.page}: the LCP image is loading="lazy", which delays it`);
    }
  }

  for (const og of ogImages) {
    if (og.raw > budgets.ogImageBytes) fail('og-image-bytes', og.file, og.raw, budgets.ogImageBytes, `${og.file} is ${fmt('bytes', og.raw)}, over the ${fmt('bytes', budgets.ogImageBytes)} Open Graph image budget`);
  }
  for (const f of staticFiles) {
    if (f.raw > budgets.staticFileBytes) fail('static-file-bytes', f.file, f.raw, budgets.staticFileBytes, `static/${f.file} is ${fmt('bytes', f.raw)}, over the ${fmt('bytes', budgets.staticFileBytes)} budget for files copied to the site root`);
  }
  return dedupePending(failures);
}

// budgets.pending[rule] is { reason, only? }: `only` (a RegExp tested on the
// message) narrows the exemption to the known offender, so a new one still fails.
function pendingReason(entry, message) {
  if (!entry) return null;
  if (entry.only && !entry.only.test(message)) return null;
  return entry.reason;
}

// One warning per pending rule is plenty; a blocking failure is listed in full.
function dedupePending(failures) {
  const seen = new Map();
  const out = [];
  for (const f of failures) {
    if (!f.pending) {
      out.push(f);
      continue;
    }
    if (seen.has(f.rule)) seen.get(f.rule).count++;
    else {
      const entry = { ...f, count: 1 };
      seen.set(f.rule, entry);
      out.push(entry);
    }
  }
  return out;
}

export function fmt(metric, value) {
  if (value === null || value === undefined) return '-';
  if (/gzip|bytes|raw/i.test(metric)) return `${(value / 1024).toFixed(1)} KiB`;
  return String(value);
}
