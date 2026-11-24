import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, GENERATE_ROUTES } from '@app/domain';
import { devices, type Locator, type Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { appOrigin } from './support/origin.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';

/*
 * Story 29.2 (Bruno, 2026-11-23: "ao clicar fora/voltar a página volta para o inicio de tudo"), on a
 * phone with touch, one test per fault the story's investigation found on main:
 *  a. the device's back with an overflow menu open left the screen (the Sumário went to Home, a
 *     ficha to its Sumário);
 *  b. the same with a form dialog (Conta went to the screen before it);
 *  c. the Export dialog closed by Escape left a second entry of the Sumário, so the next back
 *     landed on the same Sumário;
 *  d. a back to Home came back at the top.
 * Now the back closes the overlay and nothing else, the screen keeps its route and scroll, a second
 * back leaves the screen as before, and a back across three screens lands on each at its scroll. A
 * tap outside and Escape were already right and stay so.
 */

// Pixel 7 without its browser type: this spec runs in the desktop-chrome project's Chromium.
const PHONE = { ...devices['Pixel 7'] } as Partial<(typeof devices)['Pixel 7']>;
delete PHONE.defaultBrowserType;
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
/** A person's next press comes long after an overlay drew (its history entry is pushed one task later). */
const settle = (page: Page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));

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

/** Home, scrolled to `homeY` when given, then the relatório from its card; the Sumário's first equipment row. */
async function fromHome(page: Page, relatorioId: string, homeY = 0): Promise<{ row: Locator; homeY: number }> {
  await page.goto('/');
  await expect(page.locator('.relatorio-card .card-title').first()).toBeVisible();
  const atHome = homeY > 0 ? await scrollTo(page, homeY) : 0;
  await page.locator('.relatorio-card .card-title').first().click();
  return { row: await openSumario(page, relatorioId), homeY: atHome };
}

/** Scrolls the window to `y` (again while the screen is still drawing) and waits until it moved. */
async function scrollTo(page: Page, y: number): Promise<number> {
  const scrolled = (top: number) => {
    window.scrollTo(0, top);
    return Math.round(window.scrollY);
  };
  await expect.poll(() => page.evaluate(scrolled, y), { timeout: 10_000 }).toBeGreaterThan(0);
  return scrollY(page);
}

/** The device's back with `overlay` open: the overlay closes, the route and the scroll (as the overlay opened over it) stay. */
async function backClosesOnly(page: Page, overlay: Locator, where: string): Promise<void> {
  await expect(overlay).toBeVisible();
  await settle(page);
  const y = await scrollY(page);
  await page.goBack();
  await expect(overlay).toBeHidden();
  expect(await path(page)).toBe(where);
  await expect.poll(() => scrollY(page)).toBe(y);
}

test('@p0 29.2-E2E-001a an overflow menu: the device back closes it and the Sumário or the ficha stays, at its scroll', async ({ page }) => {
  test.setTimeout(150_000);
  const relatorioId = await relatorio(page);
  const sumario = `/relatorio/${relatorioId}`;
  const { row } = await fromHome(page, relatorioId);

  await page.getByRole('button', { name: 'Mais opções do relatório' }).first().click();
  await backClosesOnly(page, page.getByRole('menu'), sumario);
  await row.scrollIntoViewIfNeeded();
  await row.locator('.overflow-trigger').first().click();
  await backClosesOnly(page, page.getByRole('menu'), sumario);
  // Escape closes it too, nothing else moves.
  await row.locator('.overflow-trigger').first().click();
  await expect(page.getByRole('menu')).toBeVisible();
  const menuY = await scrollY(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  expect(await path(page)).toBe(sumario);
  expect(await scrollY(page)).toBe(menuY);

  // A ficha's header menu.
  await row.scrollIntoViewIfNeeded();
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(/\/ficha\//);
  const ficha = await path(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  await scrollTo(page, 400);
  await page.getByRole('button', { name: /Mais opções da ficha/ }).first().click();
  await backClosesOnly(page, page.getByRole('menu'), ficha);
  // A second back leaves the ficha for the Sumário, as before the menu: no entry is left behind.
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
});

test('@p0 29.2-E2E-001b a form dialog: the device back closes it and Conta stays; after a tap outside, one back still leaves Conta', async ({ page }) => {
  test.setTimeout(120_000);
  await resetCompany(account, { standard: true });
  await signIn(page, account.email);
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await backClosesOnly(page, page.getByRole('dialog'), '/account');
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await settle(page);
  const viewport = page.viewportSize()!;
  await page.touchscreen.tap(viewport.width - 8, viewport.height - 8);
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(await path(page)).toBe('/account');
  // A back now leaves Conta for Home, as it did before the dialogs.
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('@p0 29.2-E2E-001c the Export dialog closed by Escape leaves no second Sumário behind: one back reaches Home', async ({ page }) => {
  test.setTimeout(150_000);
  const relatorioId = await relatorio(page);
  const sumario = `/relatorio/${relatorioId}`;
  const { row } = await fromHome(page, relatorioId);
  await row.scrollIntoViewIfNeeded();
  const sumarioY = await scrollY(page);

  const exportDialog = page.getByRole('dialog');
  // A finger on the sticky foot's button: a Playwright click would first scroll the button to its
  // place in the page's flow, which no tap does.
  const generate = (await page.getByRole('button', { name: 'Gerar relatório' }).first().boundingBox())!;
  await page.touchscreen.tap(generate.x + generate.width / 2, generate.y + generate.height / 2);
  await expect(exportDialog).toBeVisible();
  await expect(page).toHaveURL(/\?exportar=1$/);
  await settle(page);
  await exportDialog.press('Escape');
  await expect(exportDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
  await expect.poll(() => scrollY(page)).toBe(sumarioY);
  // The device back with the dialog open closes it too.
  await page.getByRole('button', { name: 'Gerar relatório' }).first().click();
  await expect(exportDialog).toBeVisible();
  await settle(page);
  await page.goBack();
  await expect(exportDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));

  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

// Batch e28r (wave review S3): the dialog's close pops its entry once. Two closes before the pop
// renders (Escape twice here; a double tap on "Cancelar" or the scrim is the same close) used to
// pop twice and leave the Sumário. "Ver no sumário" closes the same way: no second Sumário stays.
test('@p0 29.2-E2E-002a the Export dialog closed twice at once leaves for nowhere, and "Ver no sumário" leaves no second Sumário behind', async ({ page }) => {
  test.setTimeout(150_000);
  const relatorioId = await relatorio(page);
  const sumario = `/relatorio/${relatorioId}`;
  await fromHome(page, relatorioId);
  const exportDialog = page.getByRole('dialog', { name: 'Gerar relatório' });

  await page.getByRole('button', { name: 'Gerar relatório' }).first().click();
  await expect(exportDialog).toBeVisible();
  await settle(page);
  // Both keydowns in one task: the second comes before the first close's pop has rendered.
  await exportDialog.evaluate((dialog) => {
    for (let i = 0; i < 2; i++) dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  await expect(exportDialog).toBeHidden();
  await settle(page);
  expect(await path(page)).toBe(sumario);
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));

  await page.getByRole('button', { name: 'Gerar relatório' }).first().click();
  await expect(exportDialog).toBeVisible();
  await settle(page);
  await exportDialog.getByRole('button', { name: 'Ver no sumário' }).first().click();
  await expect(exportDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
  // The marking runs once the pop has drawn the Sumário without the dialog.
  await expect(page.locator('li.sum-row.is-highlighted').first()).toBeAttached();

  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

// Batch e28r (wave review S1): the photo viewer and its "Remover" confirm, both closed by their
// buttons, leave two released entries in a row; one back still leaves the gallery.
test('@p0 29.2-E2E-002b the photo viewer and its confirm both closed by their buttons: one back leaves the gallery', async ({ page }) => {
  test.setTimeout(150_000);
  const database = deviceDatabaseName(account.userId);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'a.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await which.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);

  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await page.getByRole('button', { name: 'Foto 1, abrir', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Foto 1 de 1' });
  await expect(viewer).toBeVisible();
  await settle(page);
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Remover a foto 1 do relatório?' });
  await expect(confirm).toBeVisible();
  await settle(page);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toBeHidden();
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Fechar' }).click();
  await expect(viewer).toBeHidden();
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
});

// The Sumário keeps its own landing from a sheet (Story 12.2, Story 15.4): the sheet's row, opened and
// centred, which is where the user was; Home has no landing of its own and returns at its scroll.
test('@p0 29.2-E2E-001d back across Home, a relatório and a ficha lands on the ficha\'s row, then on Home at its scroll', async ({ page }) => {
  test.setTimeout(150_000);
  const relatorioId = await relatorio(page);
  const sumario = `/relatorio/${relatorioId}`;
  const { row, homeY } = await fromHome(page, relatorioId, 200);
  await row.scrollIntoViewIfNeeded();
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(/\/ficha\//);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  await scrollTo(page, 400);

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${sumario}$`));
  await expect(row).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => scrollY(page), { timeout: 10_000 }).toBe(homeY);
});

/*
 * Fix batch e28w (S2 and N2 of the hands-on pass of 2026-11-23; Story 29.2, third criterion, Bruno's complaint): on a
 * relatório in Em revisão the device back from a ficha brought section 8 back collapsed and the scroll elsewhere; on
 * Em campo the locals the person had opened came back collapsed but the one of the sheet. Now the Sumário draws what
 * it showed, in every status. And the ficha's in-app "Voltar" steps back in history when the Sumário is the entry
 * before it, so a later device back goes on to Home instead of reopening the ficha.
 */

/** An office relatório in `status` with its Sumário open from Home: section 8 and its first two locals opened; the last equipment row drawn. */
async function sumarioWithTwoLocals(page: Page, status: 'em_campo' | 'em_revisao'): Promise<{ relatorioId: string; target: Locator }> {
  await resetCompany(account, { standard: true });
  await signIn(page, account.email);
  const database = deviceDatabaseName(account.userId);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  if (status === 'em_revisao') {
    // Em revisão needs a generate queued since the last status op (AD-22, Story 20.7), as `deep-link-gate.spec.ts` does it.
    await pushDrafts(page, database, [officeDraft(account, { relatorioId }, 'relatorio/setup/parecer', { verdict: 'apto', text: 'Apto para operação.', text_status: 'edited', text_basis: null })]);
    const queued = await page.request.post(GENERATE_ROUTES.generate(relatorioId).path, {
      headers: { ...appOrigin(page), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
      data: { last_op_id: null, file_ids_expected: [] },
    });
    expect(queued.status(), await queued.text()).toBe(202);
  }
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, 'relatorio/status', status)]);
  await page.goto('/');
  await page.locator('.relatorio-card .card-title').first().click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText(status === 'em_campo' ? 'Em campo' : 'Em revisão', { timeout: 30_000 });
  if ((await section9(page).getAttribute('aria-expanded')) !== 'true') await section9(page).click();
  const locals = page.getByRole('list', { name: 'Locais do relatório' }).locator(':scope > li.s9-local');
  const opened = Math.min(await locals.count(), 2);
  expect(opened).toBe(2);
  for (let i = 0; i < opened; i++) {
    const chevron = locals.nth(i).locator(':scope > .s9-loc-row [data-tree-chevron]');
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  }
  const last = locals.nth(opened - 1).locator('li.s9-eq:visible').last();
  await expect(last).toBeVisible();
  const blockId = (await last.getAttribute('data-block-id'))!;
  expect(blockId).not.toBeNull();
  return { relatorioId, target: page.locator(`li.s9-eq[data-block-id="${blockId}"]`) };
}

/** Every chevron of the tree, open or not, in order. */
const treeOpenState = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' }).locator('[data-tree-chevron]').evaluateAll((all) => all.map((el) => el.getAttribute('aria-expanded')));

/** Scrolls `target` into view, taps its open button, and returns what the Sumário showed then. */
async function openFrom(page: Page, target: Locator): Promise<{ y: number; state: (string | null)[] }> {
  await target.scrollIntoViewIfNeeded();
  await settle(page);
  const before = { y: await scrollY(page), state: await treeOpenState(page) };
  const open = (await target.locator('.s9-eq-open').first().boundingBox())!;
  await page.touchscreen.tap(open.x + open.width / 2, open.y + open.height / 2);
  await expect(page).toHaveURL(/\/ficha\//);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return before;
}

/** The Sumário shows what it showed: section 8 and the same locals open, the sheet's row in view, at about the same scroll. */
async function showsWhatItShowed(page: Page, relatorioId: string, target: Locator, before: { y: number; state: (string | null)[] }, exactScroll: boolean): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(section9(page)).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => treeOpenState(page)).toEqual(before.state);
  await expect(target).toBeInViewport();
  if (exactScroll) await expect.poll(async () => Math.abs((await scrollY(page)) - before.y), { timeout: 10_000 }).toBeLessThanOrEqual(2);
}

for (const [status, word] of [
  ['em_revisao', 'Em revisão'],
  ['em_campo', 'Em campo'],
] as const) {
  test(`@p0 e28w-E2E-001 ${word}: the device back from a ficha draws the Sumário as it was, section 8 and both locals open, the sheet's row in view`, async ({ page }) => {
    test.setTimeout(150_000);
    const { relatorioId, target } = await sumarioWithTwoLocals(page, status);
    const before = await openFrom(page, target);
    await scrollTo(page, 300);
    await page.goBack();
    // Em campo keeps its landing on the sheet (Stories 12.2 and 15.4), which may centre the row; Em revisão is drawn as it was.
    await showsWhatItShowed(page, relatorioId, target, before, status === 'em_revisao');
    await settle(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
}

test('@p0 e28w-E2E-002 at 768: Em revisão, the device back from a ficha draws the Sumário as it was', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 768, height: 1024 });
  const { relatorioId, target } = await sumarioWithTwoLocals(page, 'em_revisao');
  const before = await openFrom(page, target);
  await page.goBack();
  await showsWhatItShowed(page, relatorioId, target, before, true);
});

test('@p0 e28w-E2E-003 the ficha\'s "Voltar" steps back to the Sumário it came from, its row focused; the next device back reaches Home', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, target } = await sumarioWithTwoLocals(page, 'em_revisao');
  const before = await openFrom(page, target);
  await page.locator('.app-bar').getByRole('button', { name: 'Voltar' }).click();
  await showsWhatItShowed(page, relatorioId, target, before, false);
  // Story 12.2: the sheet just left has its open button focused.
  await expect(target.locator('.s9-eq-open').first()).toBeFocused();
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

test('@p0 e28w-E2E-004 a ficha opened by its address: "Voltar" still goes to its Sumário, section 8 open', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, target } = await sumarioWithTwoLocals(page, 'em_revisao');
  const blockId = (await target.getAttribute('data-block-id'))!;
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await page.locator('.app-bar').getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(section9(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(target.locator('.s9-eq-open').first()).toBeFocused();
  // A pushed entry: the device back goes to the ficha it came from.
  await settle(page);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
});
