import { test, expect } from './fixtures.js';

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
