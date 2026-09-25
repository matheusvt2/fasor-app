import { fileURLToPath } from 'node:url';
import { deviceDatabaseName, expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';

/*
 * Story 12.5 DoD: the "after" captures of the v0.9 skin, beside the journey review's `A-*`
 * (app, before) and `M-*` (mocks) frames: Home, the Sumário and the SEC-ENEL sheet at 390,
 * 768 and 1280 px, light and dark, 18 files named `P-{surface}-{width}x{height}-{theme}.png`.
 * Not a test: skipped unless `CAPTURE_P=1`, run by hand and the PNGs committed.
 *
 *   docker compose --profile tools run --rm -e CAPTURE_P=1 tools pnpm exec playwright test e2e/p-screens.capture.spec.ts --project desktop-chrome
 */

const OUT = fileURLToPath(new URL('../_bmad-output/implementation-artifacts/reviews/journey-review-2026-09-24', import.meta.url));
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;
const THEMES = ['light', 'dark'] as const;

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);

test('P- captures of the v0.9 skin (CAPTURE_P=1 only)', async ({ page }) => {
  test.skip(process.env.CAPTURE_P !== '1', 'captures run only with CAPTURE_P=1');
  test.setTimeout(300_000);
  await resetEmpresaB({ standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const secEnel = built.sheets.find((sheet) => sheet.blockType === 'chave_seccionadora' && sheet.locationName === 'Cubículo Enel')!;
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    for (const viewport of VIEWPORTS) {
      const size = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);

      await page.goto('/');
      await expect(page.locator('.relatorio-card').first()).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `${OUT}/P-home-${size}-${theme}.png` });

      await page.goto(`/relatorio/${built.relatorioId}`);
      await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
      const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
      if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
      await expect(page.getByRole('list', { name: 'Locais do relatório' })).toBeVisible();
      await page.screenshot({ path: `${OUT}/P-sumario-${size}-${theme}.png` });

      await page.goto(`/relatorio/${built.relatorioId}/ficha/${secEnel.blockId}`);
      await expect(page.locator('.sheet-header .sheet-summary')).toBeVisible({ timeout: 30_000 });
      await page.screenshot({ path: `${OUT}/P-ficha-SEC-ENEL-${size}-${theme}.png` });
    }
  }
});
