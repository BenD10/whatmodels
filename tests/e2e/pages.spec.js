import { test, expect } from './fixtures.js';

const PAGES = [
  '/',
  '/?gpu=rtx-4060',
  '/gpu/rtx-4060',
  '/gpu/m3-ultra',
  '/model/qwen3-5-27b',
  '/gpus',
  '/models',
  '/primer',
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
