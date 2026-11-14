import { test, expect } from './fixtures.js';

/** Properties of `event` captures queued on the PostHog stub (the real library is blocked in tests). */
const captures = (page, event) =>
  page.evaluate(
    (name) => [...(window.posthog ?? [])].filter((c) => c[0] === 'capture' && c[1] === name).map((c) => c[2]),
    event
  );

const filterEvents = async (page, filterName) =>
  (await captures(page, 'filter_changed')).filter((p) => p.filter_name === filterName);

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('typing a multi-digit VRAM sends one manual_vram_entered with the final value', async ({ page }) => {
  await page.locator('#vram-manual').pressSequentially('24.5', { delay: 50 });
  // Results update live, before the event is sent
  await expect(page.locator('.overview')).toBeVisible();
  await expect.poll(() => captures(page, 'manual_vram_entered')).toEqual([{ vram_gb: 24.5 }]);
  // Nothing more arrives once the burst has settled
  await page.waitForTimeout(1000);
  expect(await captures(page, 'manual_vram_entered')).toEqual([{ vram_gb: 24.5 }]);
});

test('blurring the VRAM field sends the pending event at once, without a duplicate later', async ({ page }) => {
  const input = page.locator('#vram-manual');
  await input.pressSequentially('16');
  await input.blur();
  expect(await captures(page, 'manual_vram_entered')).toEqual([{ vram_gb: 16 }]);
  await page.waitForTimeout(1000);
  expect(await captures(page, 'manual_vram_entered')).toEqual([{ vram_gb: 16 }]);
});

test('spinner steps on system RAM coalesce into one filter_changed', async ({ page }) => {
  const input = page.locator('#system-ram');
  await input.focus();
  for (let i = 0; i < 4; i++) await input.press('ArrowUp');
  await expect(input).toHaveValue('4');
  await expect.poll(() => filterEvents(page, 'system_ram')).toEqual([{ filter_name: 'system_ram', value: 4 }]);
});

test('GPU quantity changes coalesce, and returning to the start value sends nothing', async ({ page }) => {
  await page.locator('#vram-manual').fill('24');
  const qty = page.locator('#gpu-quantity');
  await qty.focus();
  await qty.press('ArrowUp');
  await qty.press('ArrowUp');
  await expect(qty).toHaveValue('3');
  await expect(page.locator('.quantity-hint')).toBeVisible();
  await expect.poll(() => filterEvents(page, 'gpu_quantity')).toEqual([{ filter_name: 'gpu_quantity', value: 3 }]);

  // 3 → 2 → 3 within one burst: final value equals the last one sent
  await qty.press('ArrowDown');
  await qty.press('ArrowUp');
  await page.waitForTimeout(1200);
  expect(await filterEvents(page, 'gpu_quantity')).toEqual([{ filter_name: 'gpu_quantity', value: 3 }]);
});
