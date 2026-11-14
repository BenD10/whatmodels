import { test, expect } from './fixtures.js';
import releases from '../../src/lib/data/releases.json' with { type: 'json' };

const latest = releases[0];
// A release that adds models and GPUs, so both lists can be checked
const withBoth = releases.find((r) => r.models_added.length > 0 && r.gpus_added.length > 0);

test('/new/ has one h1, the latest release in full, and every past release', async ({ page }) => {
  await page.goto('/new/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText("What's new");

  const latestLink = page.getByRole('heading', { level: 2, name: latest.title }).getByRole('link');
  await expect(latestLink).toHaveAttribute('href', new RegExp(`/new/${latest.date}$`));
  // The latest release's models are listed on the index itself
  await expect(page.locator('.latest a[href*="/model/"]')).toHaveCount(latest.models_added.length);

  await expect(page.locator('ol.past > li')).toHaveCount(releases.length - 1);

  // Headings never skip a level
  const levels = await page.locator('main h1, main h2, main h3, main h4').evaluateAll((els) => els.map((el) => Number(el.tagName[1])));
  levels.forEach((level, i) => {
    if (i > 0) expect(level - levels[i - 1], `heading ${i}`).toBeLessThanOrEqual(1);
  });

  await latestLink.click();
  await expect(page).toHaveURL(new RegExp(`/new/${latest.date}$`));
  await expect(page.locator('h1')).toHaveText(latest.title);
});

test('/new/ advertises the feed and has a canonical URL and breadcrumbs', async ({ page }) => {
  await page.goto('/new/');
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', 'https://whatmodelscanirun.com/new.xml');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://whatmodelscanirun.com/new/');
  const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
    els.flatMap((el) => JSON.parse(el.textContent)['@graph']?.map((n) => n['@type']) ?? [])
  );
  expect(types).toEqual(expect.arrayContaining(['CollectionPage', 'BreadcrumbList']));
});

test('a release page lists its models and GPUs with working links', async ({ page }) => {
  await page.goto(`/new/${withBoth.date}`);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText(withBoth.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://whatmodelscanirun.com/new/${withBoth.date}`);

  const name = withBoth.models_added[0];
  const item = page.locator('li').filter({ has: page.getByRole('link', { name, exact: true }) });
  await expect(item).toContainText(/Needs \d+ GB to run well/);
  await expect(page.locator('a[href*="/gpu/"]')).toHaveCount(withBoth.gpus_added.length);

  await item.getByRole('link', { name, exact: true }).click();
  await expect(page).toHaveURL(/\/model\/[a-z0-9-]+$/);
  await expect(page.locator('h1')).toContainText(name);
});

test('/new.xml is valid RSS 2.0 with an item per release', async ({ page, request }) => {
  const res = await request.get('/new.xml');
  expect(res.status()).toBe(200);
  // Static hosts type the file by its extension (vite preview: text/xml,
  // GitHub Pages: application/xml), not by the endpoint's rss+xml header
  expect(res.headers()['content-type']).toMatch(/xml/);
  const xml = await res.text();

  await page.goto('/new/');
  const feed = await page.evaluate((text) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const error = doc.querySelector('parsererror')?.textContent ?? null;
    const channel = doc.querySelector('rss > channel');
    const items = [...doc.querySelectorAll('channel > item')].map((item) => ({
      title: item.querySelector('title')?.textContent,
      link: item.querySelector('link')?.textContent,
      pubDate: item.querySelector('pubDate')?.textContent,
      description: item.querySelector('description')?.textContent,
    }));
    return {
      error,
      version: doc.documentElement.getAttribute('version'),
      title: channel?.querySelector(':scope > title')?.textContent,
      link: channel?.querySelector(':scope > link')?.textContent,
      description: channel?.querySelector(':scope > description')?.textContent,
      items,
    };
  }, xml);

  expect(feed.error).toBeNull();
  expect(feed.version).toBe('2.0');
  expect(feed.title).toBe("What Models? What's new");
  expect(feed.link).toBe('https://whatmodelscanirun.com/new/');
  expect(feed.description).toBeTruthy();
  expect(feed.items.length).toBeGreaterThanOrEqual(3);
  expect(feed.items.length).toBe(releases.length);
  for (const item of feed.items) {
    expect(item.title).toBeTruthy();
    expect(item.link).toMatch(/^https:\/\/whatmodelscanirun\.com\/new\/\d{4}-\d{2}-\d{2}$/);
    expect(item.pubDate).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} 00:00:00 GMT$/);
    expect(item.description).toMatch(/^<p>/);
  }
});

test('the footer and the models index link to what is new', async ({ page }) => {
  await page.goto('/models');
  await page.locator('.whats-new a').click();
  await expect(page).toHaveURL(new RegExp(`/new/${latest.date}$`));

  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: "What's new" }).click();
  await expect(page).toHaveURL(/\/new\/$/);
});
