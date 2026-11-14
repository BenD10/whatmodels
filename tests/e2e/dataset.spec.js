import { test, expect } from './fixtures.js';

for (const [path, key, firstField] of [
  ['/data/models.json', 'models', 'kv_per_1k_gb'],
  ['/data/gpus.json', 'gpus', 'manufacturer'],
]) {
  test(`${path} serves the dataset envelope`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const body = await res.json();
    expect(body).toMatchObject({
      schema_version: 1,
      license: 'MIT',
      source: 'https://whatmodelscanirun.com',
      docs: 'https://whatmodelscanirun.com/data/',
    });
    expect(body.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(body[key])).toBe(true);
    expect(body[key].length).toBeGreaterThan(0);
    expect(body.count).toBe(body[key].length);
    expect(body[key][0]).toHaveProperty(firstField);
    expect(body[key][0].url).toMatch(/^https:\/\/whatmodelscanirun\.com\/(model|gpu)\//);
  });
}

test('/data documents the dataset and links both files', async ({ page }) => {
  await page.goto('/data/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('a.download')).toHaveCount(2);

  const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
    els.flatMap((el) => JSON.parse(el.textContent)['@graph']?.map((n) => n['@type']) ?? [])
  );
  expect(types).toEqual(expect.arrayContaining(['Dataset', 'BreadcrumbList']));

  // The field tables document exactly the published fields, in order
  const documented = (i) => page.locator('table').nth(i).locator('tbody td:first-child').allTextContents();
  const { models } = await (await page.request.get('/data/models.json')).json();
  const { gpus } = await (await page.request.get('/data/gpus.json')).json();
  expect(await documented(0)).toEqual(Object.keys(models[0]));
  expect(await documented(1)).toEqual(Object.keys(gpus[0]));
});

test('the footer links the dataset', async ({ page }) => {
  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: 'Open dataset' }).click();
  await expect(page).toHaveURL(/\/data\/$/);
});
