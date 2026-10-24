import { test, expect } from './fixtures.js';

test.describe('GPU search on the home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.empty')).toBeVisible(); // nothing selected yet
  });

  test('typing filters the list and clicking a GPU shows results', async ({ page, consoleErrors }) => {
    const input = page.locator('#gpu-select');
    await input.click();
    await input.fill('4060');
    const options = page.locator('#gpu-select-listbox [role="option"]');
    await expect(options.first()).toBeVisible();
    for (const label of await options.allTextContents()) expect(label).toContain('4060');

    await options.filter({ hasText: /^\s*GeForce RTX 4060 \(8 GB\)\s*$/ }).click();
    await expect(page).toHaveURL(/[?&]gpu=rtx-4060\b/);
    await expect(page.locator('.selected-display')).toHaveText(/GeForce RTX 4060/);
    await expect(page.locator('.overview')).toBeVisible();
    await expect(page.locator('#group-fits')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test('keyboard: Enter picks the highlighted match', async ({ page }) => {
    const input = page.locator('#gpu-select');
    await input.click();
    await input.fill('RTX 4090');
    await input.press('Enter');
    await expect(page).toHaveURL(/[?&]gpu=rtx-4090\b/);
    await expect(page.locator('.overview')).toBeVisible();
  });

  test('chips with several memory sizes ask for the memory size first', async ({ page }) => {
    const input = page.locator('#gpu-select');
    await input.click();
    await input.fill('M3 Ultra');
    await page.locator('#gpu-select-listbox [role="option"]', { hasText: 'M3 Ultra' }).first().click();
    const memory = page.locator('#memory-select');
    await expect(memory).toBeVisible();
    await expect(page.locator('.empty')).toBeVisible(); // no results until a size is picked

    await memory.selectOption('0'); // 96 GB
    await expect(page).toHaveURL(/[?&]gpu=m3-ultra&mem=0\b/);
    await expect(page.locator('.overview')).toBeVisible();
  });
});
