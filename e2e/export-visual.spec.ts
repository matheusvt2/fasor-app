import type { Page } from '@playwright/test';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { expect, horizontalOverflow, signIn, test } from './support/merged-fixtures.ts';

/*
 * 4.8-E2E-003 (`@p2`, the real-browser pass of the story's last AC): the Export dialog at
 * 390, 768 and 1280 px, light and dark, in its idle, failed, working and result states,
 * opened from the Sumário's foot. Every frame is checked for sideways overflow and saved
 * under `test-results/export-visual/` for the human review. Not part of `verify` (`--grep @p0`); `test:e2e:full` runs it.
 */

const RELATORIO_ID = EXPORT_RELATORIO_ID;
const WIDTHS = [390, 768, 1280] as const;
const THEMES = ['light', 'dark'] as const;

const trigger = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/** One frame per width and theme of whatever the dialog shows now, with the overflow check. */
async function frames(page: Page, state: string): Promise<void> {
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await expect(dialog(page)).toBeVisible();
      expect(await horizontalOverflow(page), `${state} at ${width}px ${theme} overflows sideways`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/export-visual/${state}-${width}-${theme}.png`, fullPage: false });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('@p2 4.8-E2E-003 the Export dialog renders its states at 390, 768 and 1280 px, light and dark, without sideways overflow', async ({
  page,
  seed,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaBWithFixture(seed.companies[1]);
  await signIn(page, seed.companies[1].email);
  // The Sumário of the small fixture (Em campo); its foot's "Gerar relatório" opens the dialog.
  await page.goto(`/relatorio/${RELATORIO_ID}`);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo', { timeout: 30_000 });

  await trigger(page).click();
  await frames(page, 'idle');

  // The failed state, from a request the network drops.
  await page.route('**/api/relatorios/*/generate', (route) => route.abort('failed'));
  await dialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog(page).locator('.gen-error[role="alert"]')).toBeVisible({ timeout: 30_000 });
  await frames(page, 'failed');
  await page.unroute('**/api/relatorios/*/generate');

  await dialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog(page).locator('.gen-progress[role="status"]')).toContainText('Gerando revisão 1…', { timeout: 30_000 });
  await page.screenshot({ path: 'test-results/export-visual/working-1280-light.png' });

  await expect(dialog(page).getByRole('heading', { level: 2, name: 'Revisão 1 pronta' })).toBeVisible({ timeout: 150_000 });
  await frames(page, 'ready');

  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await trigger(page).click();
  await dialog(page).getByRole('button', { name: 'Gerar de novo' }).click();
  await expect(dialog(page).locator('.revision-row')).toHaveCount(1);
  await frames(page, 'idle-with-revision');
});
