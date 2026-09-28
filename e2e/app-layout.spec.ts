import type { Page } from '@playwright/test';
import { expect, signIn, test } from './support/merged-fixtures.ts';

/*
 * Home layout defect (deferred-work, found 2026-09-26): on Home the Sync badge and the avatar
 * sat in the middle of the App bar, and on wide screens the capped content column hugged the
 * left edge. At 390, 768, 1280 and 1906 px, on Home and on /cadastros: the avatar's right
 * edge sits within 16 px of the App bar's right edge, and from 1280 px the capped column is
 * centered (left and right gaps within 2 px). The light and dark screenshots of each width,
 * and one dialog, are attached for the real-browser pass.
 */

const WIDTHS = [390, 768, 1280, 1906] as const;

/** The App bar's and the avatar's right edges. */
function rightEdges(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('.app-bar')!.getBoundingClientRect();
    const avatar = document.querySelector('.app-bar .avatar-btn')!.getBoundingClientRect();
    return { bar: bar.right, avatar: avatar.right };
  });
}

/** The gaps left and right of the first visible element matching `selector`, against the page's width. */
function gaps(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const column = [...document.querySelectorAll<HTMLElement>(sel)].find((el) => el.getClientRects().length > 0)!;
    const box = column.getBoundingClientRect();
    return { left: box.left, right: document.documentElement.clientWidth - box.right, width: box.width };
  }, selector);
}

test('@p0 HOME-LAYOUT-E2E-001 Home and /cadastros at 390, 768, 1280 and 1906 px: the avatar at the App bar\'s right edge, the capped column centered from 1280 px', async ({ page, seed }, info) => {
  test.setTimeout(120_000);
  await signIn(page, seed.companies[1].email);

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });

    await page.goto('/');
    await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    const home = await rightEdges(page);
    expect(home.bar - home.avatar, `Home at ${width} px: avatar ${home.avatar}, bar ${home.bar}`).toBeLessThanOrEqual(16);
    expect(home.bar - home.avatar).toBeGreaterThanOrEqual(0);
    if (width >= 1280) {
      const column = await gaps(page, '.home-screen > .content');
      expect(Math.abs(column.left - column.right), `Home at ${width} px: ${JSON.stringify(column)}`).toBeLessThanOrEqual(2);
      // Still the capped column, not the full width.
      expect(column.width).toBeLessThan(width - 100);
    }
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await info.attach(`home-${width}-${scheme}.png`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    await page.emulateMedia({ colorScheme: 'light' });

    await page.goto('/cadastros');
    // Below 768 px the tabs are a picker (`.tabs-phone`); the surface itself is the marker at every width.
    await expect(page.locator('main[data-route="/cadastros"] [role="tabpanel"]')).toBeVisible();
    const cadastros = await rightEdges(page);
    expect(cadastros.bar - cadastros.avatar, `/cadastros at ${width} px: avatar ${cadastros.avatar}, bar ${cadastros.bar}`).toBeLessThanOrEqual(16);
    expect(cadastros.bar - cadastros.avatar).toBeGreaterThanOrEqual(0);
    if (width >= 1280) {
      // The tab whose column is capped (the Instrumentos tab spans the width beside its panel).
      await page.getByRole('tab', { name: 'Critérios de aceitação' }).click();
      const column = await gaps(page, '.registry-main.is-narrow');
      expect(Math.abs(column.left - column.right), `/cadastros at ${width} px: ${JSON.stringify(column)}`).toBeLessThanOrEqual(2);
      expect(column.width).toBeLessThan(width - 100);
    }
    await info.attach(`cadastros-${width}.png`, { body: await page.screenshot(), contentType: 'image/png' });
  }

  // One dialog over the centered column, in dark.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Novo relatório', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await info.attach('home-1906-dark-dialog.png', { body: await page.screenshot(), contentType: 'image/png' });
});
