export const prerender = true;

const SITE = 'https://whatmodelscanirun.com';

const pages = [
  { path: '/',        priority: '1.0', changefreq: 'weekly'  },
  { path: '/primer',  priority: '0.8', changefreq: 'monthly' },
  { path: '/about',   priority: '0.5', changefreq: 'monthly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly'  },
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
