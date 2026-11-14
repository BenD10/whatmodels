/**
 * "What's new": the data releases in releases.json, as pages (/new/,
 * /new/<date>) and an RSS feed (/new.xml). Pure functions, shared by the
 * routes, the sitemap and the feed.
 *
 * releases.json holds one entry per data release, newest first:
 *   { date: "YYYY-MM-DD", title, summary,
 *     models_added: [model name, …],  // the groupVariants() key
 *     gpus_added: [gpu id, …],
 *     corrections: ["short sentence", …] }
 * scripts/releases/build_release.py drafts an entry from the data diff.
 */

import { calcVramForContext, contextLabel } from './calculations.js';
import { FEED_PATH, NEW_PATH, SITE_NAME, SITE_URL, gpuShortName, gpuVramLabel, modelPages, quotedContextK, releasePath } from './pages.js';

export { FEED_PATH, NEW_PATH, releasePath };

export const FEED_TITLE = `${SITE_NAME} What's new`;
export const FEED_DESCRIPTION = 'New local LLMs, GPUs and data corrections on What Models Can I Run?, one item per data release.';

/**
 * Releases newest first, without changing the input.
 * @param {Array<{ date: string }>} releases
 * @returns {Array}
 */
export function sortReleases(releases) {
  return [...releases].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/**
 * The release for a date, or null.
 * @param {Array} releases
 * @param {string} date
 */
export function findRelease(releases, date) {
  return releases.find((r) => r.date === date) ?? null;
}

/** "November 13, 2026" for a YYYY-MM-DD date. */
export function releaseDateLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** RFC 822 date for RSS: "2026-11-13" → "Fri, 13 Nov 2026 00:00:00 GMT". */
export function rfc822Date(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).toUTCString();
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One-line summary of what a release changed: "7 new models · 2 new GPUs · 3 corrections".
 * @param {{ models_added: string[], gpus_added: string[], corrections: string[] }} release
 * @returns {string}
 */
export function releaseCountsLabel(release) {
  const parts = [];
  if (release.models_added.length > 0) parts.push(plural(release.models_added.length, 'new model'));
  if (release.gpus_added.length > 0) parts.push(plural(release.gpus_added.length, 'new GPU'));
  if (release.corrections.length > 0) parts.push(plural(release.corrections.length, 'correction'));
  return parts.length > 0 ? parts.join(' · ') : 'No changes';
}

/**
 * Names as prose: "A", "A and B", "A, B and C", or "A, B, C and 4 more".
 * @param {string[]} names
 * @param {number} [max]  Names to show before "and N more"
 */
export function namesList(names, max = 3) {
  if (names.length === 0) return '';
  if (names.length <= max) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

/** "8B", "27.36B", or "1,049B": whole billions once a model passes 100B. */
export function paramsLabel(paramsB) {
  return paramsB >= 100 ? `${Math.round(paramsB).toLocaleString('en-US')}B` : `${paramsB}B`;
}

/**
 * What a model needs to run well, as the model pages and alert emails quote
 * it: its lightest quantization with TIGHT_FIT_CONTEXT_K of context (or its
 * whole context if shorter), rounded up to whole GB.
 * @param {object} model  A modelPages() entry
 * @returns {{ gb: number, quantization: string, contextK: number }}
 */
export function modelNeed(model) {
  const lightest = model.variants.reduce((a, b) => (b.weight_gb < a.weight_gb ? b : a));
  const contextK = quotedContextK(model);
  return { gb: Math.ceil(calcVramForContext(lightest, contextK)), quantization: lightest.quantization, contextK };
}

/**
 * Everything a release page shows, with names and ids resolved against the
 * data. Unknown names or ids are dropped (data.test.js forbids them).
 * @param {object} release  A releases.json entry
 * @param {Array} models  models.json
 * @param {Array} gpus  gpus.json
 */
export function releaseView(release, models, gpus) {
  const pages = new Map(modelPages(models).map((m) => [m.name, m]));
  const gpuById = new Map(gpus.map((g) => [g.id, g]));
  return {
    ...release,
    path: releasePath(release.date),
    dateLabel: releaseDateLabel(release.date),
    countsLabel: releaseCountsLabel(release),
    models: release.models_added
      .map((name) => pages.get(name))
      .filter(Boolean)
      .map((m) => {
        const need = modelNeed(m);
        return {
          name: m.name,
          slug: m.slug,
          params_b: m.params_b,
          paramsLabel: paramsLabel(m.params_b),
          features: m.features,
          need: need.gb,
          quantization: need.quantization,
          contextLabel: contextLabel(need.contextK),
        };
      }),
    gpus: release.gpus_added
      .map((id) => gpuById.get(id))
      .filter(Boolean)
      .map((g) => ({ id: g.id, name: gpuShortName(g), vramLabel: gpuVramLabel(g) })),
  };
}

/** Escape text for XML (and HTML) element content and attribute values. */
export function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(text) {
  return escapeXml(text).replace(/&apos;/g, '&#39;');
}

/**
 * The HTML body of one feed item: the summary, linked lists of new models
 * and GPUs, and the corrections. Escaped again when it goes into <description>.
 * @param {ReturnType<typeof releaseView>} view
 * @param {string} siteUrl
 * @returns {string}
 */
export function feedItemHtml(view, siteUrl = SITE_URL) {
  const html = [`<p>${escapeHtml(view.summary)}</p>`];
  if (view.models.length > 0) {
    const items = view.models.map((m) => `<li><a href="${siteUrl}/model/${m.slug}">${escapeHtml(m.name)}</a>: needs ${m.need} GB to run well</li>`);
    html.push(`<p>New models:</p><ul>${items.join('')}</ul>`);
  }
  if (view.gpus.length > 0) {
    const items = view.gpus.map((g) => `<li><a href="${siteUrl}/gpu/${g.id}">${escapeHtml(g.name)}</a> (${escapeHtml(g.vramLabel)})</li>`);
    html.push(`<p>New GPUs:</p><ul>${items.join('')}</ul>`);
  }
  if (view.corrections.length > 0) {
    html.push(`<p>Corrections:</p><ul>${view.corrections.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`);
  }
  return html.join('');
}

/**
 * RSS 2.0 feed, one item per release, newest first. Dates come from the
 * releases, not the clock, so the same data always builds the same feed.
 * @param {Array<ReturnType<typeof releaseView>>} views
 * @param {string} [siteUrl]
 * @returns {string}
 */
export function buildFeed(views, siteUrl = SITE_URL) {
  const sorted = sortReleases(views);
  const items = sorted.map((v) => {
    const url = `${siteUrl}${v.path}`;
    return `
    <item>
      <title>${escapeXml(`${v.title} (${v.dateLabel})`)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${rfc822Date(v.date)}</pubDate>
      <description>${escapeXml(feedItemHtml(v, siteUrl))}</description>
    </item>`;
  });
  const lastBuild = sorted.length > 0 ? `
    <lastBuildDate>${rfc822Date(sorted[0].date)}</lastBuildDate>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${siteUrl}${NEW_PATH}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>en</language>${lastBuild}
    <atom:link href="${siteUrl}${FEED_PATH}" rel="self" type="application/rss+xml" />${items.join('')}
  </channel>
</rss>
`;
}
