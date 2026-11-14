import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import releases from '$lib/data/releases.json';
import { DATA_UPDATED, SITE_URL as SITE, sitemapEntries } from '$lib/pages.js';

export const prerender = true;

const pages = sitemapEntries(gpus, allModels, DATA_UPDATED, releases);

export function GET() {
  const urls = pages
    .map(({ path, priority, changefreq, lastmod }) => `
  <url>
    <loc>${SITE}${path}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' }
  });
}
