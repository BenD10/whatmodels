import { test as base, expect } from '@playwright/test';

/**
 * Shared fixtures:
 * - every request that isn't to the local preview server (PostHog, AdSense,
 *   Buttondown) is answered with an empty 200, so tests run offline and never
 *   create real subscribers or analytics events;
 * - `consoleErrors` collects console errors and uncaught exceptions so a test
 *   can assert the page ran cleanly.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.context().route(
      (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
    );
    await use(page);
  },
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await use(errors);
  },
});

export { expect };
