import { test, expect } from './fixtures.js';

/** Properties of `event` captures queued on the PostHog stub (the real library is blocked in tests). */
const captures = (page, event) =>
  page.evaluate(
    (name) => [...(window.posthog ?? [])].filter((c) => c[0] === 'capture' && c[1] === name).map((c) => c[2]),
    event
  );

async function pickGpu(page, query, label) {
  const input = page.locator('#gpu-select');
  await input.click();
  await input.fill(query);
  await page.locator('#gpu-select-listbox [role="option"]', { hasText: label }).first().click();
}

test.describe('home tool hands off to the GPU page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.empty')).toBeVisible();
  });

  test('selecting RTX 5090 links to /gpu/rtx-5090 and the click lands there', async ({ page, consoleErrors }) => {
    await pickGpu(page, 'RTX 5090', /^\s*GeForce RTX 5090 \(32 GB\)\s*$/);
    const link = page.locator('.gpu-page-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveText(/Full RTX 5090 page: every model, context and speed/);
    await expect(link).toHaveAttribute('href', '/gpu/rtx-5090');

    // Stop the navigation long enough to read the queued event
    await link.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault(), { once: true }));
    await link.click();
    expect(await captures(page, 'gpu_page_link_clicked')).toEqual([{ gpu_id: 'rtx-5090', placement: 'results_summary' }]);

    await link.click();
    await expect(page).toHaveURL(/\/gpu\/rtx-5090$/);
    await expect(page.locator('h1')).toContainText('RTX 5090');
    expect(consoleErrors).toEqual([]);
  });

  test('unified-memory chips carry the chosen memory size', async ({ page }) => {
    await pickGpu(page, 'M3 Ultra', 'M3 Ultra');
    // No memory size yet: no results, so no link
    await expect(page.locator('.gpu-page-link')).toHaveCount(0);

    await page.locator('#memory-select').selectOption('0'); // 96 GB
    const link = page.locator('.gpu-page-link');
    await expect(link).toHaveAttribute('href', '/gpu/m3-ultra?mem=96');

    await page.locator('#memory-select').selectOption('1'); // 256 GB
    await expect(link).toHaveAttribute('href', '/gpu/m3-ultra?mem=256');

    await link.click();
    await expect(page).toHaveURL(/\/gpu\/m3-ultra\?mem=256$/);
    await expect(page.locator('h1')).toContainText('M3 Ultra');
  });

  test('shared ?gpu= links show the hand-off on load', async ({ page }) => {
    await page.goto('/?gpu=m3-ultra&mem=96');
    await expect(page.locator('.gpu-page-link')).toHaveAttribute('href', '/gpu/m3-ultra?mem=96');
  });

  test('manual VRAM shows no GPU page link', async ({ page }) => {
    await page.locator('#vram-manual').fill('24');
    await expect(page.locator('.overview')).toBeVisible();
    await expect(page.locator('.gpu-page-link')).toHaveCount(0);
  });
});

test.describe('model page titles use searchers\' wording', () => {
  test('short names get the full wording', async ({ page }) => {
    await page.goto('/model/qwen3-8-27b');
    await expect(page).toHaveTitle('Qwen3.8 27B VRAM requirements: which GPUs can run it locally? | What Models?');
    await expect(page.locator('h1')).toHaveText('Qwen3.8 27B VRAM requirements: which GPUs can run it locally?');
  });

  test('long names fall back to a shorter pattern', async ({ page }) => {
    await page.goto('/model/nemotron-3-5-super-vl-120b-a12b');
    await expect(page).toHaveTitle('Nemotron 3.5 Super VL 120B A12B VRAM requirements | What Models?');
    await expect(page.locator('h1')).toHaveText('Nemotron 3.5 Super VL 120B A12B VRAM requirements');
  });
});
