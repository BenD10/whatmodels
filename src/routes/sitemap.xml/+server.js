import gpus from '$lib/data/gpus.json';
import allModels from '$lib/data/models.json';
import { SITE_URL as SITE, modelPages } from '$lib/pages.js';

export const prerender = true;

const pages = [
  { path: '/',        priority: '1.0', changefreq: 'weekly'  },
  { path: '/gpus',    priority: '0.8', changefreq: 'weekly'  },
  { path: '/models',  priority: '0.8', changefreq: 'weekly'  },
  { path: '/primer',  priority: '0.8', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly'  },
  ...gpus.map((g) => ({ path: `/gpu/${g.id}`, priority: '0.7', changefreq: 'monthly' })),
  ...modelPages(allModels).map((m) => ({ path: `/model/${m.slug}`, priority: '0.7', changefreq: 'monthly' })),
];

export function GET() {
  const urls = pages
    .map(({ path, priority, changefreq }) => `
  <url>
    <loc>${SITE}${path}</loc>
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
