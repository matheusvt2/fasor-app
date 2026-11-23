import { devices, type Locator, type Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';

/*
 * Story 29.2 (Bruno, 2026-11-23: "ao clicar fora/voltar a página volta para o inicio de tudo"), on a
 * phone with touch, as the investigation of the story found it on main: the device's back with an
 * overflow menu or a dialog open left the screen (the Sumário and Conta went to Home, a ficha to its
 * Sumário), and a back to Home came back at the top. Now the back closes the overlay and nothing
 * else, the screen keeps its route and scroll, a second back leaves the screen as before, and a back
 * across three screens lands on each at the scroll it had. A tap outside and Escape were already
 * right and stay so.
 */

const { defaultBrowserType: _browser, ...PHONE } = devices['Pixel 7'];
test.use(PHONE);

let account: SeedAccount;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7).
  account = seed.companies[1];
});

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
const path = (page: Page) => page.evaluate(() => window.location.pathname);
const section9 = (page: Page) => page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
const firstCabine = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' }).locator(':scope > li.s9-local').first();

/** An Em campo relatório pushed from the office; Home shows its card. */
async function relatorio(page: Page): Promise<string> {
  await resetCompany(account, { standard: true });
  await signIn(page, account.email);
  const database = deviceDatabaseName(account.userId);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, 'relatorio/status', 'em_campo')]);
  return relatorioId;
}

/** The Sumário of `relatorioId` with section 9 and its first cabine open; the cabine's first equipment row. */
async function openSumario(page: Page, relatorioId: string): Promise<Locator> {
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo', { timeout: 30_000 });
  if ((await section9(page).getAttribute('aria-expanded')) !== 'true') await section9(page).click();
  const chevron = firstCabine(page).locator(':scope > .s9-loc-row [data-tree-chevron]');
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const row = firstCabine(page).locator(':scope > .s9-eqs > li.s9-eq').first();
  await expect(row).toBeVisible();
  return row;
}

/** Scrolls the window to `y` and waits until it is there. */
async function scrollTo(page: Page, y: number): Promise<number> {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  return scrollY(page);
}

/** The device's back with `overlay` open: the overlay closes, the route and the scroll stay. */
async function backClosesOnly(page: Page, overlay: Locator, where: string, y: number): Promise<void> {
  await expect(overlay).toBeVisible();
  // A person's back comes long after the overlay drew (its history entry is pushed one task later).
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await page.goBack();
  await expect(overlay).toBeHidden();
  expect(await path(page)).toBe(where);
  await expect.poll(() => scrollY(page)).toBe(y);
}

test('@p0 29.2-E2E-001 the device back closes an open menu or dialog and keeps the screen; back across three screens keeps each scroll', async ({ page }) => {
  test.setTimeout(180_000);
  const relatorioId = await relatorio(page);
  const sumario = `/relatorio/${relatorioId}`;

  // Home, scrolled, then the relatório from its card.
  await page.goto('/');
  await expect(page.locator('.relatorio-card .card-title').first()).toBeVisible();
  const homeY = await scrollTo(page, 200);
  await page.locator('.relatorio-card .card-title').first().click();
  const row = await openSumario(page, relatorioId);

  // The Sumário scrolled to the equipment row; its header menu, then a row's menu.
  await row.scrollIntoViewIfNeeded();
  const sumarioY = await scrollTo(page, Math.max(await scrollY(page), 300));
  await page.getByRole('button', { name: 'Mais opções do relatório' }).first().click();
  await backClosesOnly(page, page.getByRole('menu'), sumario, sumarioY);
  await row.locator('.overflow-trigger').first().click();
  await backClosesOnly(page, page.getByRole('menu'), sumario, sumarioY);
  // A tap outside and Escape close it too, nothing else moves.
  await row.locator('.overflow-trigger').first().click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  expect(await path(page)).toBe(sumario);
  expect(await scrollY(page)).toBe(sumarioY);

  // The Export dialog closed by Escape: the Sumário stays where it was and keeps no extra entry
  // (on main a later back landed on a second copy of the Sumário).
  await page.getByRole('button', { name: 'Gerar relatório' }).first().click();
  const exportDialog = page.getByRole('dialog');
  await expect(exportDialog).toBeVisible();
  await expect(page).toHaveURL(/\?exportar=1$/);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  await exportDialog.press('Escape');
  await expect(exportDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
  await expect.poll(() => scrollY(page)).toBe(sumarioY);

  // A ficha from the row; its header menu.
  await row.scrollIntoViewIfNeeded();
  const sumarioLeaveY = await scrollY(page);
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(/\/ficha\//);
  const ficha = await path(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  const fichaY = await scrollTo(page, 400);
  await page.getByRole('button', { name: /Mais opções da ficha/ }).first().click();
  await backClosesOnly(page, page.getByRole('menu'), ficha, fichaY);

  // Back with no overlay: the Sumário at its scroll, then Home at its scroll.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
  await expect.poll(() => scrollY(page), { timeout: 10_000 }).toBe(sumarioLeaveY);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => scrollY(page), { timeout: 10_000 }).toBe(homeY);

  // Conta: the Registro profissional dialog closes on back and Conta stays.
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await backClosesOnly(page, page.getByRole('dialog'), '/account', await scrollY(page));
  // A tap outside the dialog closes it too and leaves Conta.
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
  const viewport = page.viewportSize()!;
  await page.touchscreen.tap(viewport.width - 8, viewport.height - 8);
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await path(page)).toBe('/account');
  // The dialog's entry is taken back off.
  await expect.poll(() => page.evaluate(() => typeof (window.history.state as Record<string, unknown> | null)?.__overlay)).toBe('undefined');
  // And a back now leaves Conta, as it did before the dialog: no entry is left behind.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});
