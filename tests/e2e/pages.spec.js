import { test, expect } from './fixtures.js';

const PAGES = [
  '/',
  '/?gpu=rtx-4060',
  '/gpu/rtx-4060',
  '/gpu/m3-ultra',
  '/vram/16gb',
  '/model/qwen3-5-27b',
  '/gpus',
  '/models',
  '/primer',
  '/data/',
  '/new/',
  '/new/2026-10-24',
  '/privacy',
];

for (const path of PAGES) {
  test(`${path} renders cleanly`, async ({ page, consoleErrors }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('title')).toHaveCount(1);
    expect(await page.title()).not.toBe('');

    const overflowsX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflowsX, 'page scrolls horizontally').toBe(false);
    expect(consoleErrors).toEqual([]);

    // One <h1> per page, and a canonical URL without the query string
    await expect(page.locator('h1')).toHaveCount(1);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    expect(await canonical.getAttribute('href')).toBe(`https://whatmodelscanirun.com${path.split('?')[0]}`);
  });
}

test('nav highlights the current section', async ({ page }) => {
  const active = page.locator('.content-card > nav a.active');
  for (const [path, label] of [
    ['/', 'Tool'],
    ['/gpus', 'GPUs'],
    ['/gpu/rtx-4060', 'GPUs'],
    ['/models', 'Models'],
    ['/model/qwen3-5-27b', 'Models'],
    ['/primer', 'LLM Primer'],
  ]) {
    await page.goto(path);
    await expect(active, path).toHaveText(label);
  }
});

test('landing pages use their own title as the <h1>', async ({ page }) => {
  await page.goto('/gpu/rtx-4060');
  await expect(page.locator('h1')).toHaveText('What AI models can an RTX 4060 (8 GB) run?');
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('What');
});

test('sitemap dates data pages and lists every landing page', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  const lastmod = (u) => u.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null;
  const gpuUrl = urls.find((u) => u.includes('/gpu/rtx-4060<'));
  expect(lastmod(gpuUrl)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(lastmod(urls.find((u) => u.includes('/privacy<')))).toBeNull();
  expect(urls.some((u) => u.includes('/model/arete-27b<'))).toBe(true);
});

test('short-context models explain why every GPU is a tight fit', async ({ page }) => {
  await page.goto('/model/gemma-2-9b');
  await expect(page.locator('.intro')).toContainText('trained context is only 8K');
  await expect(page.locator('table thead')).not.toContainText('16K context');
});

test('models too big for any GPU say how big the largest one is', async ({ page }) => {
  await page.goto('/model/mistral-large-4-1t-a52b');
  await expect(page.locator('.intro')).toContainText('more than any single GPU in our database');
});
