import { test, expect } from './fixtures.js';

test('memory switcher updates results and the tool link', async ({ page }) => {
  await page.goto('/gpu/m3-ultra');
  const intro = page.locator('.intro');
  await expect(intro).toContainText('512 GB'); // prerenders the largest option
  await expect(page.locator('.configs button.active')).toHaveText('512 GB');

  await page.locator('.configs button', { hasText: '96 GB' }).click();
  await expect(intro).toContainText('96 GB');
  await expect(page.locator('.configs button.active')).toHaveText('96 GB');
  await expect(page.locator('.cta')).toHaveAttribute('href', /\?gpu=m3-ultra&mem=96$/);
});

test('GPU page JSON-LD lists the models that run well, linking to model pages', async ({ page }) => {
  await page.goto('/gpu/rtx-4090');
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = blocks.flatMap((b) => JSON.parse(b)['@graph'] ?? []);
  const list = graph.find((n) => n['@type'] === 'ItemList');
  expect(list.name).toBe('Best local AI models for the RTX 4090');
  expect(list.itemListElement.length).toBeGreaterThan(0);
  expect(list.itemListElement.length).toBeLessThanOrEqual(10);
  expect(list.itemListElement.map((it) => it.position)).toEqual(list.itemListElement.map((_, i) => i + 1));

  // The first item is a real model page (the site serves at the root in e2e)
  const first = list.itemListElement[0];
  const url = new URL(first.url);
  expect(url.origin).toBe('https://whatmodelscanirun.com');
  expect(url.pathname).toMatch(/^\/model\/[a-z0-9-]+$/);
  await page.goto(url.pathname);
  await expect(page.locator('h1')).toContainText(first.name);
});

test('model page lists quantizations and GPUs that run it', async ({ page }) => {
  await page.goto('/model/qwen3-5-27b');
  await expect(page.locator('h1')).toHaveText('Qwen3.5 27B VRAM requirements: which GPUs can run it locally?');
  await expect(page).toHaveTitle('Qwen3.5 27B VRAM requirements: which GPUs can run it locally? | What Models?');
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  const gpuLink = page.locator('.gpu-list a.gpu-name').first();
  await expect(gpuLink).toHaveAttribute('href', /\/gpu\//);
});
