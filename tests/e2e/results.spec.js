import { test, expect } from './fixtures.js';

// The home page renders results client-side; GPU pages prerender them.
const RESULT_PAGES = ['/?gpu=rtx-4060', '/gpu/rtx-5060-ti-16gb'];
const GROUPS = ['fits', 'tight', 'noFit'];
const PREVIEW_COUNT = 3;

for (const path of RESULT_PAGES) {
  test.describe(path, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.overview')).toBeVisible();
    });

    test('summary legend matches the group counts', async ({ page }) => {
      for (const key of GROUPS) {
        const group = page.locator(`#group-${key}`);
        const groupCount = (await group.count()) ? Number(await group.locator('.group-count').first().textContent()) : 0;
        const legendCount = Number(await page.locator('.legend li').nth(GROUPS.indexOf(key)).locator('.legend-count').textContent());
        expect(legendCount, `${key} legend vs group heading`).toBe(groupCount);
      }
    });

    test('each model is listed once, and the legend adds up to the total', async ({ page }) => {
      const names = await page.evaluate((groups) => {
        const out = [];
        for (const key of groups) {
          // Full list lives in the dialog when the group is collapsed
          const list = document.querySelector(`dialog[aria-labelledby="dialog-title-${key}"] .dialog-list`)
            ?? document.querySelector(`#group-${key} > ul`);
          if (list) out.push(...[...list.querySelectorAll(':scope > li .model-name')].map((a) => a.textContent.trim()));
        }
        return out;
      }, GROUPS);
      expect(new Set(names).size, 'a model appears in more than one group').toBe(names.length);

      const legendTotal = (await page.locator('.legend .legend-count').allTextContents()).reduce((sum, n) => sum + Number(n), 0);
      const caption = await page.locator('.overview .caption').textContent();
      expect(caption).toContain(`${legendTotal} models`);
      expect(names.length).toBe(legendTotal);
    });

    test('groups preview the top models and offer the rest', async ({ page }) => {
      for (const key of GROUPS) {
        const group = page.locator(`#group-${key}`);
        if (!(await group.count())) continue;
        const total = Number(await group.locator('.group-count').first().textContent());
        await expect(group.locator(':scope > ul > li')).toHaveCount(Math.min(total, PREVIEW_COUNT));
        const viewAll = group.locator('.view-all');
        if (total > PREVIEW_COUNT) await expect(viewAll).toHaveText(`View all ${total} →`);
        else await expect(viewAll).toHaveCount(0);
      }
    });

    test('legend links jump to their group', async ({ page }) => {
      await page.locator('.legend a', { hasText: 'run well' }).click();
      await expect(page).toHaveURL(/#group-fits$/);
      await expect(page.locator('#group-fits')).toBeInViewport();
    });

    test('"View all" dialog is centred, scrolls once, and closes three ways', async ({ page }) => {
      const open = async () => {
        await page.locator('#group-fits .view-all').click();
        const dialog = page.locator('.group-dialog[open]');
        await expect(dialog).toBeVisible();
        return dialog;
      };

      const dialog = await open();
      const total = Number(await page.locator('#group-fits .group-count').first().textContent());
      await expect(dialog.locator('.dialog-list > li')).toHaveCount(total);

      // Centred horizontally and fully inside the viewport
      const box = await dialog.boundingBox();
      const viewport = page.viewportSize();
      expect(Math.abs(box.x - (viewport.width - box.x - box.width))).toBeLessThanOrEqual(2);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

      // Only the list scrolls: not the dialog, and not the page behind it
      const scroll = await page.evaluate(() => {
        const d = document.querySelector('.group-dialog[open]');
        return {
          dialogScrolls: d.scrollHeight > d.clientHeight + 1,
          pageOverflow: getComputedStyle(document.documentElement).overflowY,
        };
      });
      expect(scroll.dialogScrolls).toBe(false);
      expect(scroll.pageOverflow).toBe('hidden');

      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toBeHidden();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).not.toBe('hidden');

      await open();
      await page.keyboard.press('Escape');
      await expect(page.locator('.group-dialog[open]')).toHaveCount(0);

      await open();
      await page.mouse.click(5, 5); // backdrop
      await expect(page.locator('.group-dialog[open]')).toHaveCount(0);
    });

    test('email signup sits between tight fit and doesn\'t fit', async ({ page }) => {
      const order = await page.evaluate(() => {
        const signup = document.querySelector('.results .notify');
        const before = document.querySelector('#group-tight') ?? document.querySelector('#group-fits');
        const after = document.querySelector('#group-noFit');
        const follows = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
        return { afterTight: follows(before, signup), beforeNoFit: !after || follows(signup, after) };
      });
      expect(order).toEqual({ afterTight: true, beforeNoFit: true });
    });
  });
}
