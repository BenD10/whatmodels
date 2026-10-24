import { test, expect } from './fixtures.js';

test('memory switcher updates results and the tool link', async ({ page }) => {
  await page.goto('/gpu/m3-ultra');
  const intro = page.locator('.intro');
  await expect(intro).toContainText('512 GB'); // prerenders the largest option
  await expect(page.locator('.configs button.active')).toHaveText('512 GB');

  await page.locator('.configs button', { hasText: '96 GB' }).click();
  await expect(intro).toContainText('96 GB');
  await expect(page.locator('.configs button.active')).toHaveText('96 GB');
  await expect(page.locator('.cta')).toHaveAttribute('href', /\?gpu=m3-ultra&mem=0$/);
});

test('model page lists quantizations and GPUs that run it', async ({ page }) => {
  await page.goto('/model/qwen3-5-27b');
  await expect(page.locator('h2')).toHaveText('What GPU do you need to run Qwen3.5 27B?');
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  const gpuLink = page.locator('.gpu-list a.gpu-name').first();
  await expect(gpuLink).toHaveAttribute('href', /\/gpu\//);
});
