import { test as base, expect } from '@playwright/test';

/**
 * Stand-in for Google's consent message (an IAB TCF v2 CMP), installed before
 * any page script runs. `config` is `{ gdprApplies, eventStatus, consents }`,
 * where `consents` lists the TCF purposes with publisher consent. Tests can
 * then call `window.__cmpEmit(changes)` to fire another event, e.g. the
 * visitor accepting later.
 */
function installCmp(config) {
  const listeners = [];
  let state = { eventStatus: 'tcloaded', consents: [], ...config };
  const tcData = () => ({
    tcString: 'stub',
    gdprApplies: state.gdprApplies,
    eventStatus: state.eventStatus,
    listenerId: 1,
    publisher: { consents: Object.fromEntries(state.consents.map((p) => [p, true])), legitimateInterests: {} },
    purpose: { consents: {}, legitimateInterests: {} },
  });
  window.__tcfapi = (command, version, callback) => {
    if (command === 'addEventListener') {
      listeners.push(callback);
      callback(tcData(), true);
    }
  };
  window.__cmpEmit = (changes) => {
    state = { ...state, ...changes };
    for (const cb of listeners) cb(tcData(), true);
  };
}

/**
 * Shared fixtures:
 * - every request that isn't to the local preview server (PostHog, AdSense,
 *   Buttondown) is answered with an empty 200, so tests run offline and never
 *   create real subscribers or analytics events;
 * - `cmp`: the consent message the page sees. By default it says GDPR doesn't
 *   apply (a visitor outside the EEA, UK and Switzerland), so PostHog loads at
 *   once. `test.use({ cmp: null })` leaves it out, as an ad blocker would;
 * - `posthogRequests` lists the URLs of requests to PostHog's hosts;
 * - `consoleErrors` collects console errors and uncaught exceptions so a test
 *   can assert the page ran cleanly.
 */
export const test = base.extend({
  cmp: [{ gdprApplies: false }, { option: true }],
  page: async ({ page, cmp }, use) => {
    await page.context().route(
      (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
      (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
    );
    if (cmp) await page.addInitScript(installCmp, cmp);
    await use(page);
  },
  posthogRequests: async ({ page }, use) => {
    const urls = [];
    page.on('request', (r) => {
      if (new URL(r.url()).hostname.endsWith('posthog.com')) urls.push(r.url());
    });
    await use(urls);
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
