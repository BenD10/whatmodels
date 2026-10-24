import { test, expect } from './fixtures.js';

test('signup posts tags and metadata to Buttondown and shows the confirm step', async ({ page }) => {
  await page.goto('/gpu/rtx-4060');
  const form = page.locator('.notify form');
  await expect(form).toHaveAttribute('action', 'https://buttondown.com/api/emails/embed-subscribe/whatmodels');

  await form.getByPlaceholder('you@example.com').fill('test@example.com');
  const [request] = await Promise.all([
    page.context().waitForEvent('request', (r) => r.url().includes('/embed-subscribe/')),
    form.getByRole('button', { name: /Notify me/ }).click(),
  ]);

  const body = new URLSearchParams(request.postData());
  expect(body.get('email')).toBe('test@example.com');
  expect(body.getAll('tag')).toEqual(['vram-8', 'gpu-rtx-4060']);
  expect(body.get('metadata__vram_tier')).toBe('vram-8');
  expect(body.get('metadata__gpu')).toBe('rtx-4060');

  const notify = page.locator('.notify');
  await expect(notify.getByRole('heading')).toHaveText('Check your inbox to confirm');
  await expect(notify).toContainText('test@example.com');

  await notify.getByRole('button', { name: 'Use a different email' }).click();
  await expect(notify.getByPlaceholder('you@example.com')).toHaveValue('');
});
