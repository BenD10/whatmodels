import { test, expect } from './fixtures.js';

const PATH = '/gpu/rtx-4060';

/** Load PATH until the service worker controls the page and has cached it. */
async function loadControlled(page) {
  await page.goto(PATH);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.reload();
}

test('a new deploy shows up on the next visit, not a cached page', async ({ page, context }) => {
  await loadControlled(page);

  // Simulate a deploy: the server now returns a changed page
  await context.route((url) => url.pathname === PATH, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('<body', '<body data-deploy="new"');
    await route.fulfill({ response, body });
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-deploy', 'new');
});

test('the dataset JSON is fetched fresh, not served from the cache', async ({ page, context }) => {
  await loadControlled(page);
  const fetchUpdated = () => page.evaluate(async () => (await (await fetch('/data/models.json')).json()).updated);
  await fetchUpdated(); // now in the service worker's cache

  // Simulate a data release: the server now returns a newer file
  await context.route((url) => url.pathname === '/data/models.json', async (route) => {
    const response = await route.fetch();
    const body = { ...(await response.json()), updated: '2099-01-01' };
    await route.fulfill({ response, json: body });
  });
  expect(await fetchUpdated()).toBe('2099-01-01');
});

test('visited pages still work offline', async ({ page, context }) => {
  await loadControlled(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toContainText('RTX 4060');
});
