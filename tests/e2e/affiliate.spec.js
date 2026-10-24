import { test, expect } from './fixtures.js';

/** affiliate_click calls queued on the PostHog stub (the real library is blocked in tests). */
const affiliateEvents = (page) =>
  page.evaluate(() =>
    [...(window.posthog ?? [])].filter((c) => c[0] === 'capture' && c[1] === 'affiliate_click').map((c) => c[2])
  );

async function expectAffiliateLink(link, { domain, tag }) {
  const url = new URL(await link.getAttribute('href'));
  expect(url.hostname).toBe(domain);
  expect(url.pathname).toBe('/s');
  expect(url.searchParams.get('k')).toBeTruthy();
  expect(url.searchParams.get('tag')).toBe(tag);
  await expect(link).toHaveAttribute('rel', 'sponsored noopener');
  await expect(link).toHaveAttribute('target', '_blank');
}

test.describe('US visitors', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('GPU page: header button, upgrade options and disclosures', async ({ page }) => {
    await page.goto('/gpu/rtx-4060');
    const header = page.locator('.cta-row .amazon-btn');
    await expect(header).toHaveText('Check price on Amazon');
    await expectAffiliateLink(header, { domain: 'www.amazon.com', tag: 'whatmodels08-20' });
    expect(new URL(await header.getAttribute('href')).searchParams.get('k')).toBe('RTX 4060');

    const upgrades = page.locator('.upgrades .upgrade-list li');
    await expect(upgrades).toHaveCount(2);
    for (const item of await upgrades.all()) {
      await expect(item).toContainText('Launch MSRP $');
      await expectAffiliateLink(item.locator('.amazon-btn'), { domain: 'www.amazon.com', tag: 'whatmodels08-20' });
    }
    await expect(page.locator('.upgrades .disclosure')).toHaveText('As an Amazon Associate, I earn from qualifying purchases.');
  });

  test('model page lists the three cheapest GPUs with a disclosure', async ({ page }) => {
    await page.goto('/model/qwen3-5-27b');
    const section = page.locator('section', { has: page.getByRole('heading', { name: /Cheapest GPUs that can run/ }) });
    await expect(section.locator('.gpu-picks li')).toHaveCount(3);
    await expect(section.locator('.disclosure')).toBeVisible();
    const msrps = (await section.locator('.pick-meta').allTextContents()).map((t) => Number(t.match(/MSRP \$([\d,]+)/)[1].replace(',', '')));
    expect(msrps).toEqual([...msrps].sort((a, b) => a - b));
  });

  test('models nobody can run alone show no affiliate block', async ({ page }) => {
    await page.goto('/model/deepseek-r1-0528');
    await expect(page.locator('.amazon-btn')).toHaveCount(0);
  });

  test('results suggest bigger GPUs for models that don\'t fit, and clicks are tracked', async ({ page }) => {
    await page.goto('/?gpu=rtx-4060');
    const upgrade = page.locator('#group-noFit details.upgrade').first();
    await upgrade.locator('summary').click();
    const picks = upgrade.locator('.gpu-picks li');
    await expect(picks.first()).toBeVisible();
    for (const meta of await upgrade.locator('.pick-meta').allTextContents()) {
      expect(Number(meta.match(/(\d+) GB/)[1])).toBeGreaterThan(8); // more VRAM than the RTX 4060
    }
    await expect(upgrade.locator('.disclosure')).toBeVisible();

    const button = picks.first().locator('.amazon-btn');
    const [popup] = await Promise.all([page.waitForEvent('popup'), button.click()]);
    expect(popup.url()).toContain('tag=whatmodels08-20');
    const events = await affiliateEvents(page);
    expect(events.at(-1)).toMatchObject({ page_type: 'home', placement: 'results_upgrade', marketplace: 'us' });
    expect(events.at(-1).gpu_id).toBeTruthy();
  });
});

test.describe('Canadian visitors', () => {
  test.use({ timezoneId: 'America/Toronto' });

  test('links switch to amazon.ca with the Canadian tag', async ({ page }) => {
    await page.goto('/gpu/rtx-5070-ti');
    const header = page.locator('.cta-row .amazon-btn');
    await expect(header).toHaveAttribute('data-marketplace', 'ca');
    await expectAffiliateLink(header, { domain: 'www.amazon.ca', tag: 'whatmodels-20' });

    await header.click();
    const events = await affiliateEvents(page);
    expect(events.at(-1)).toEqual({ gpu_id: 'rtx-5070-ti', page_type: 'gpu', placement: 'gpu_header', marketplace: 'ca' });
  });
});

test('Apple chips get a Mac search, but are never suggested as upgrades', async ({ page }) => {
  await page.goto('/gpu/m5-max');
  const header = page.locator('.cta-row .amazon-btn');
  expect(new URL(await header.getAttribute('href')).searchParams.get('k')).toBe('MacBook Pro M5 Max');
  await page.goto('/model/qwen3-5-27b');
  await expect(page.locator('.gpu-picks')).not.toContainText(/^M\d/);
});
