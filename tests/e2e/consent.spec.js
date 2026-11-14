import { test, expect } from './fixtures.js';

/**
 * PostHog waits for consent in the EEA, UK and Switzerland (src/lib/consent.js).
 * The real library is blocked in tests, so "loaded" means the page requested
 * PostHog's script and the stub exists to queue calls on.
 */

const ASSET_URL = 'https://us-assets.i.posthog.com/static/array.js';

/** gpu_selected calls queued on the PostHog stub. */
const gpuSelected = (page) =>
  page.evaluate(() =>
    [...(window.posthog ?? [])].filter((c) => c[0] === 'capture' && c[1] === 'gpu_selected').map((c) => c[2])
  );

async function selectGpu(page) {
  const input = page.locator('#gpu-select');
  await input.click();
  await input.fill('RTX 4060');
  await page.locator('#gpu-select-listbox [role="option"]', { hasText: /^\s*GeForce RTX 4060 \(8 GB\)\s*$/ }).click();
  await expect(page).toHaveURL(/[?&]gpu=rtx-4060\b/);
}

async function expectLoaded(page, posthogRequests) {
  await expect.poll(() => posthogRequests, { timeout: 8000 }).toContain(ASSET_URL);
  await selectGpu(page);
  await expect
    .poll(() => gpuSelected(page))
    .toEqual([expect.objectContaining({ gpu_name: 'GeForce RTX 4060', vram_gb: 8 })]);
}

/** Nothing reaches PostHog and nothing is queued, even after the CMP wait. */
async function expectNotLoaded(page, posthogRequests) {
  await selectGpu(page);
  await page.waitForTimeout(5000);
  expect(posthogRequests).toEqual([]);
  expect(await page.evaluate(() => typeof window.posthog)).toBe('undefined');
}

test.describe('outside the EEA, UK and Switzerland', () => {
  test.use({ cmp: { gdprApplies: false } });

  test('PostHog loads at once and captures gpu_selected', async ({ page, posthogRequests }) => {
    await page.goto('/');
    await expectLoaded(page, posthogRequests);
  });
});

test.describe('in the EEA, UK and Switzerland', () => {
  test.describe('with consent already given', () => {
    test.use({ cmp: { gdprApplies: true, eventStatus: 'tcloaded', consents: [1, 8, 9] } });

    test('PostHog loads once the CMP reports it', async ({ page, posthogRequests }) => {
      await page.goto('/');
      await expectLoaded(page, posthogRequests);
    });
  });

  test.describe('without consent', () => {
    // Device access only: measurement purposes refused
    test.use({ cmp: { gdprApplies: true, eventStatus: 'tcloaded', consents: [1] } });

    test('PostHog never loads', async ({ page, posthogRequests }) => {
      await page.goto('/');
      await expectNotLoaded(page, posthogRequests);
    });
  });

  test.describe('accepting later', () => {
    test.use({ cmp: { gdprApplies: true, eventStatus: 'cmpuishown' } });

    test('PostHog loads on accept without earlier events, and opts out on withdrawal', async ({ page, posthogRequests }) => {
      await page.goto('/');
      await selectGpu(page);
      await page.waitForTimeout(500);
      expect(posthogRequests).toEqual([]);
      expect(await page.evaluate(() => typeof window.posthog)).toBe('undefined');

      await page.evaluate(() => window.__cmpEmit({ eventStatus: 'useractioncomplete', consents: [1, 8, 9] }));
      await expect.poll(() => posthogRequests).toContain(ASSET_URL);
      // The pre-consent gpu_selected was dropped, not replayed
      expect(await gpuSelected(page)).toEqual([]);

      await page.evaluate(() => window.__cmpEmit({ eventStatus: 'useractioncomplete', consents: [] }));
      const optOuts = await page.evaluate(() => [...window.posthog].filter((c) => c[0] === 'opt_out_capturing').length);
      expect(optOuts).toBe(1);
    });
  });
});

test.describe('without a CMP (blocked)', () => {
  test.use({ cmp: null });

  test.describe('in a European time zone', () => {
    test.use({ timezoneId: 'Europe/Berlin' });

    test('PostHog never loads', async ({ page, posthogRequests }) => {
      await page.goto('/');
      await expectNotLoaded(page, posthogRequests);
    });
  });

  test.describe('in a US time zone', () => {
    test.use({ timezoneId: 'America/New_York' });

    test('PostHog loads after the wait', async ({ page, posthogRequests }) => {
      await page.goto('/');
      await expect(page.locator('.empty')).toBeVisible();
      expect(posthogRequests).toEqual([]);
      await expectLoaded(page, posthogRequests);
    });
  });
});
