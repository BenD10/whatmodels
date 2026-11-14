import { test, expect } from './fixtures.js';

/** Properties of `event` captures queued on the PostHog stub (the real library is blocked in tests). */
const captures = (page, event) =>
  page.evaluate(
    (name) => [...(window.posthog ?? [])].filter((c) => c[0] === 'capture' && c[1] === name).map((c) => c[2]),
    event
  );

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('model page shows both run commands and copies them', async ({ page }) => {
  await page.goto('/model/qwen3-5-27b');
  const section = page.locator('section.run');
  await expect(section.locator('h3')).toHaveText('Run it locally');

  const q4 = section.locator('.run-variant').filter({ hasText: 'Q4_K_M' });
  await expect(q4.locator('code')).toHaveText([
    'ollama run hf.co/unsloth/Qwen3.5-27B-GGUF:Q4_K_M',
    'llama-server -hf unsloth/Qwen3.5-27B-GGUF:Q4_K_M',
  ]);

  const copy = q4.getByRole('button', { name: 'Copy Ollama command for Q4_K_M' });
  await copy.click();
  await expect(copy).toHaveText('Copied');
  await expect(q4.getByRole('status').first()).toHaveText('Copied Ollama command');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('ollama run hf.co/unsloth/Qwen3.5-27B-GGUF:Q4_K_M');
  await expect.poll(() => captures(page, 'run_command_copied')).toEqual([{ model_id: 'qwen3.5-27b-q4', tool: 'ollama' }]);

  await q4.getByRole('button', { name: 'Copy llama.cpp command for Q4_K_M' }).click();
  await expect.poll(() => captures(page, 'run_command_copied')).toEqual([
    { model_id: 'qwen3.5-27b-q4', tool: 'ollama' },
    { model_id: 'qwen3.5-27b-q4', tool: 'llama.cpp' },
  ]);
  // Feedback resets
  await expect(copy).toHaveText('Copy', { timeout: 4000 });
});

test('sharded quantizations get only the llama.cpp command', async ({ page }) => {
  await page.goto('/model/mistral-large-4-1t-a52b');
  const q8 = page.locator('section.run .run-variant').filter({ hasText: 'Q8_0' });
  await expect(q8.locator('code')).toHaveText(['llama-server -hf ggml-org/Mistral-Large-4-1T-A52B-GGUF:Q8_0']);
  await expect(q8).toContainText("Ollama can't pull");
});

test('run commands wrap instead of scrolling the page sideways', async ({ page }) => {
  await page.goto('/model/nemotron-3-5-super-vl-120b-a12b');
  await expect(page.locator('section.run code').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('a model with no verified GGUF repo shows no run section', async ({ page }) => {
  await page.goto('/model/deepseek-v4-pro');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('section.run')).toHaveCount(0);
});
