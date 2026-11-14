import { test, expect } from './fixtures.js';

const TIERS = [8, 12, 16, 24, 32, 48, 64, 96, 128];

test('a VRAM tier page renders with one h1, a canonical, JSON-LD and GPU links', async ({ page, consoleErrors }) => {
  await page.goto('/vram/16gb');
  await page.waitForLoadState('networkidle');

  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(/^Best local LLMs for 16 GB VRAM \([A-Z][a-z]+ \d{4}\): what fits, context and speed$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://whatmodelscanirun.com/vram/16gb');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /run well in 16 GB of VRAM/);

  // Structured data parses and lists the models that run well
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);
  const graph = blocks.flatMap((b) => JSON.parse(b)['@graph'] ?? []);
  const types = graph.map((n) => n['@type']);
  expect(types).toContain('BreadcrumbList');
  const list = graph.find((n) => n['@type'] === 'ItemList');
  expect(list.itemListElement.length).toBeGreaterThan(0);
  expect(list.itemListElement[0].url).toMatch(/^https:\/\/whatmodelscanirun\.com\/model\//);

  // Both pick lists are filled, up to five each
  const picks = page.locator('.pick-card');
  await expect(picks).toHaveCount(2);
  for (const card of await picks.all()) {
    const n = await card.locator('ol li').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(5);
  }

  // GPUs with 16 GB, including a unified-memory option opened at that size
  await expect(page.locator('.gpu-list a[href$="/gpu/rtx-5080"]')).toHaveCount(1);
  await expect(page.locator('.gpu-list a[href$="/gpu/m4?mem=16"]')).toHaveCount(1);

  // The tool link carries the size; the upgrade nudge points at the next tier
  await expect(page.locator('.cta')).toHaveAttribute('href', /\?vram=16$/);
  await expect(page.locator('.unlock a').first()).toHaveAttribute('href', /\/vram\/24gb$/);
  await expect(page.locator('.upgrades .amazon-btn').first()).toBeVisible();

  const overflowsX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowsX, 'page scrolls horizontally').toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('every tier page builds, and unknown sizes 404', async ({ request }) => {
  for (const t of TIERS) {
    expect((await request.get(`/vram/${t}gb`)).status(), `${t} GB`).toBe(200);
  }
  expect((await request.get('/vram/10gb')).status()).toBe(404);
});

test('GPU page links to its VRAM tier, and ?mem opens that memory option', async ({ page }) => {
  await page.goto('/gpu/rtx-4060');
  await expect(page.locator('.tier-link')).toHaveText('Other 8 GB options →');
  await page.locator('.tier-link').click();
  await expect(page).toHaveURL(/\/vram\/8gb$/);

  await page.goto('/gpu/m3-ultra?mem=96');
  await expect(page.locator('.configs button.active')).toHaveText('96 GB');
  await expect(page.locator('.tier-link')).toHaveAttribute('href', /\/vram\/96gb$/);
});

test('/gpus and the footer link to every tier', async ({ page }) => {
  await page.goto('/gpus');
  await expect(page.locator('nav.tiers a')).toHaveCount(TIERS.length);
  await expect(page.locator('footer .tiers a')).toHaveCount(TIERS.length);
});

test('sitemap lists every tier page, dated by the data release', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  for (const t of TIERS) {
    const url = xml.match(new RegExp(`<url>\\s*<loc>https://whatmodelscanirun\\.com/vram/${t}gb</loc>([\\s\\S]*?)</url>`));
    expect(url, `${t} GB`).not.toBeNull();
    expect(url[1]).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  }
});

test('robots.txt allows crawling and points at the sitemap', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /');
  expect(body).toContain('Sitemap: https://whatmodelscanirun.com/sitemap.xml');
});
