import { test, expect } from './fixtures.js';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buf) {
  expect(buf.subarray(0, 8).toString('hex'), 'PNG signature').toBe('89504e470d0a1a0a');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const PAGES = [
  { path: '/gpu/rtx-4060', image: '/og/gpu/rtx-4060.png', alt: /^RTX 4060 \(8 GB\): \d+ local AI models run well/ },
  { path: '/model/qwen3-5-27b', image: '/og/model/qwen3-5-27b.png', alt: /^Qwen3\.5 27B / },
  { path: '/vram/16gb', image: '/og/vram/16gb.png', alt: /^Best local LLMs for 16 GB of VRAM: \d+ models run well/ },
  { path: '/', image: '/og/site.png', alt: /^What Models\?/ },
  { path: '/primer', image: '/og/site.png', alt: /^What Models\?/ },
];

for (const { path, image, alt } of PAGES) {
  test(`${path} has a large preview image of 1200×630`, async ({ page, request }) => {
    await page.goto(path);
    const meta = (sel) => page.locator(`head meta[${sel}]`);

    // Absolute URL on the site origin (BASE_PATH is empty in tests)
    await expect(meta('property="og:image"')).toHaveAttribute('content', `https://whatmodelscanirun.com${image}`);
    await expect(meta('name="twitter:image"')).toHaveAttribute('content', `https://whatmodelscanirun.com${image}`);
    await expect(meta('property="og:image:width"')).toHaveAttribute('content', '1200');
    await expect(meta('property="og:image:height"')).toHaveAttribute('content', '630');
    await expect(meta('property="og:image:alt"')).toHaveAttribute('content', alt);
    await expect(meta('name="twitter:card"')).toHaveCount(1);
    await expect(meta('name="twitter:card"')).toHaveAttribute('content', 'summary_large_image');

    const res = await request.get(image);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
    const body = await res.body();
    expect(pngSize(body)).toEqual({ width: 1200, height: 630 });
    expect(body.length, 'PNG stays small').toBeLessThan(100 * 1024);
  });
}

test('GPU preview alt text quotes the same count as the page', async ({ page }) => {
  await page.goto('/gpu/rtx-4060');
  const alt = await page.locator('head meta[property="og:image:alt"]').getAttribute('content');
  const intro = await page.locator('header .intro').textContent();
  const runsWell = alt.match(/(\d+) local AI models run well/)[1];
  expect(intro).toMatch(new RegExp(`\\b${runsWell} models run well on it`));
});
