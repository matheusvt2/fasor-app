import { artOrTrtLabel } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';

/*
 * 12.2-E2E: the forward path, driven as a person would. J0 resumes the last sheet from Home
 * in one tap; J5 goes from Home to the first sheet of a new relatório without a single
 * "Voltar", registering the instrument setup asks for on the way; a sheet's "Voltar" lands
 * on the Sumário with its row focused from 768 px and on the tree surface on a phone; with
 * no pointer "Continuar" opens the first sheet still missing something; "Próxima seção"
 * walks the section texts. Each journey records its tap count as a test annotation.
 *
 * Every test resets Empresa B first. Safe mid-run because Empresa B is this worker's own
 * (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const firstCabine = (page: Page) => tree(page).locator(':scope > li.s9-cabine').first();
const section9Chevron = (page: Page) => page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
const currentCard = (page: Page) => page.locator('.relatorio-card.is-current');

/** Records a journey's tap count on the test and in the run's output (the list reporter prints stdout). */
function recordTaps(journey: 'J0' | 'J5', taps: number): void {
  test.info().annotations.push({ type: `${journey} taps`, description: String(taps) });
  process.stdout.write(`${journey} taps: ${taps}\n`);
}

/** Counts the taps of a journey; "Voltar" is never one of them. */
function tapCounter() {
  let taps = 0;
  return {
    async tap(target: Locator): Promise<void> {
      await expect(target).not.toHaveAccessibleName('Voltar');
      await target.click();
      taps += 1;
    },
    get count() {
      return taps;
    },
  };
}

/** "Sincronizar agora" from the Sync status, until nothing is waiting, then back where it was. */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await button.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await page.goto(back);
}

/** An Em campo relatório of the standard template pushed from the office, its Sumário open. */
async function emCampoRelatorio(page: Page, width: number): Promise<string> {
  await resetCompany(account, { standard: true });
  await page.setViewportSize({ width, height: 1024 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await pushDrafts(page, database, [officeDraft(account, { relatorioId }, 'relatorio/status', 'em_campo')]);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo', { timeout: 30_000 });
  return relatorioId;
}

/** Section 9 open (Em campo opens it) and the first cabine expanded; its equipment rows. */
async function firstCabineRows(page: Page): Promise<Locator> {
  if ((await section9Chevron(page).getAttribute('aria-expanded')) !== 'true') await section9Chevron(page).click();
  const chevron = firstCabine(page).locator(':scope > .s9-cab-row [data-tree-chevron]');
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const rows = firstCabine(page).locator(':scope > .s9-eqs > li.s9-eq');
  await expect(rows.first()).toBeVisible();
  return rows;
}

/** Opens a tree row's sheet and returns its block id and TAG, once the App bar shows that TAG. */
async function openRow(page: Page, row: Locator): Promise<{ blockId: string; tag: string }> {
  const blockId = (await row.getAttribute('data-block-id'))!;
  // E12-Q3: the TAG is read from the row, and the sheet is waited for by it, never by a
  // non-empty title (the Sumário's own title, the relatório name, is not empty either).
  const tag = (await row.locator('.s9-eq-open .block-tag').textContent())!.trim();
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  await expect(page.locator('.app-bar-title')).toHaveText(tag);
  return { blockId, tag };
}

/**
 * E12-Q2: a forward navigation lands at the new page's top with the focus on the App bar
 * heading, or, when the surface has a target, on that target, in view. Never on `<body>`.
 */
async function expectLanded(page: Page, target: Locator | null = null): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName ?? 'BODY')).not.toBe('BODY');
  if (target === null) {
    await expect(page.locator('.app-bar-title')).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    return;
  }
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
}

/** Scrolls the page to its end, so a forward navigation that kept the scroll would show it. */
async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
}

test('@p0 12.2-E2E-001 J0 at 768: Home "Continuar" opens the last sheet in one tap, with the card counter, after a reload too', async ({ page }) => {
  test.setTimeout(120_000);
  const relatorioId = await emCampoRelatorio(page, 768);
  const rows = await firstCabineRows(page);
  const sheet = await openRow(page, rows.nth(1));

  // The engineer leaves for Home (the wordmark path is the App bar's; a cold open lands there).
  await page.goto('/');
  const card = currentCard(page);
  await expect(card).toHaveAttribute('data-relatorio', relatorioId, { timeout: 30_000 });
  await expect(card.locator('.card-state .progress-counter')).toHaveText(/^0 de \d+ fichas$/);
  const counter = (await card.locator('.card-state .progress-counter').textContent())!.replace(' fichas', '');
  await expect(card.locator('.card-title')).toHaveAccessibleName(new RegExp(`, Em campo, ${counter} fichas$`));
  const resume = card.getByRole('button', { name: `Continuar: ${sheet.tag} · ${counter}` });
  await expect(resume.locator('.tabular')).toHaveText(`${sheet.tag} · ${counter}`);

  // After a reload the pointer and the counter are still there.
  await page.reload();
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('.card-state .progress-counter')).toHaveText(`${counter} fichas`);

  const journey = tapCounter();
  await journey.tap(resume);
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${sheet.blockId}$`));
  await expect(page.locator('.app-bar-title')).toHaveText(sheet.tag);
  expect(journey.count).toBe(1);
  recordTaps('J0', journey.count);
});

test('@p0 12.2-E2E-002 "Voltar" from a sheet: the Sumário with section 9 open and the row focused at 768 and 1280, the tree surface at 390', async ({ page }) => {
  test.setTimeout(120_000);
  const relatorioId = await emCampoRelatorio(page, 768);
  const rows = await firstCabineRows(page);
  const sheet = await openRow(page, rows.nth(2));
  const open = () => page.locator(`li.s9-eq[data-block-id="${sheet.blockId}"] .s9-eq-open`);

  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(section9Chevron(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(open()).toBeFocused();
  await expect(open()).toBeInViewport();

  // The focused row opens again from the keyboard; at 1280 the same way back.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/ficha/${sheet.blockId}$`));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(section9Chevron(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(open()).toBeFocused();

  // A phone keeps the tree surface.
  await open().click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${sheet.blockId}$`));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/arvore$`));
});

test('@p0 12.2-E2E-006 forward at 768: "Próxima ficha", the sheet\'s "Voltar", Home "Continuar" and "Próxima seção" open the new page at its top or its target, the focus on its heading or the target (E12-Q2)', async ({ page }) => {
  test.setTimeout(120_000);
  const relatorioId = await emCampoRelatorio(page, 768);
  const rows = await firstCabineRows(page);
  const second = (await rows.nth(1).getAttribute('data-block-id'))!;
  const first = await openRow(page, rows.nth(0));

  // "Próxima ficha" from the end of a long sheet: the next sheet from its top, its heading focused.
  await scrollToEnd(page);
  await page.locator('#ficha-primary').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${second}$`));
  await expect(page.locator('.app-bar-title')).not.toHaveText(first.tag);
  await expectLanded(page);

  // E12-Q14: the collapsed rail strip beside the sheet paints the whole column in view, in both themes.
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const strip = (await page.locator('.rail-collapsed').boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(strip.y + strip.height, `${colorScheme}: the strip reaches the bottom of the viewport`).toBeGreaterThanOrEqual(viewport.height - 1);
    // ...and never makes the page taller than the viewport on its own account.
    expect(strip.y + strip.height, `${colorScheme}: the strip ends at the viewport`).toBeLessThanOrEqual(viewport.height + 1);
  }
  await page.emulateMedia({ colorScheme: null });

  // "Voltar" from the end of the sheet: the Sumário with the row of the sheet focused, in view.
  await scrollToEnd(page);
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expectLanded(page, page.locator(`li.s9-eq[data-block-id="${second}"] .s9-eq-open`));

  // Home "Continuar": the last sheet, its heading focused.
  await page.goto('/');
  const resume = currentCard(page).getByRole('button', { name: /^Continuar: / });
  await expect(resume).toBeVisible({ timeout: 30_000 });
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${second}$`));
  await expectLanded(page);

  // "Próxima seção" from the end of a section text: the next section, its own heading focused.
  await page.goto(`/relatorio/${relatorioId}`);
  await page.getByRole('list', { name: 'Sumário do relatório' }).getByRole('button', { name: /^Definições/ }).click();
  await expect(page.locator('.section-text-title')).toHaveText('Seção 2 — Definições');
  await scrollToEnd(page);
  await page.getByRole('button', { name: 'Próxima seção' }).click();
  await expectLanded(page, page.getByRole('heading', { level: 2, name: 'Seção 4 — Requisitos básicos' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('@p0 12.2-E2E-003 J5 at 768: Home to the first sheet of a new relatório with no "Voltar", the instrument registered on the way', async ({ page }) => {
  test.setTimeout(180_000);
  await resetCompany(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  const journey = tapCounter();

  // Home › Novo relatório: client and obra created inline.
  await journey.tap(page.getByRole('button', { name: 'Novo relatório' }));
  const start = page.getByRole('dialog', { name: 'Novo relatório' });
  await start.getByRole('combobox', { name: 'Cliente' }).fill('Cliente da jornada');
  await journey.tap(page.getByRole('option', { name: 'Criar “Cliente da jornada”' }));
  await expect(start.getByRole('combobox', { name: 'Cliente' })).toHaveValue('Cliente da jornada');
  // E12-Q11: the obra is next, and the focus is already there.
  await expect(start.getByRole('combobox', { name: 'Local (obra)' })).toBeFocused();
  await page.keyboard.type('Obra da jornada');
  await journey.tap(page.getByRole('option', { name: 'Criar “Obra da jornada”' }));
  await expect(start.getByRole('combobox', { name: 'Local (obra)' })).toHaveValue('Obra da jornada');
  await journey.tap(start.getByRole('button', { name: 'Continuar' }));

  // The Project's dialog: today in both dates, Criar ready at once.
  const create = page.getByRole('dialog', { name: 'Novo relatório' });
  await expect(create.getByRole('button', { name: 'Criar relatório' })).not.toHaveAttribute('aria-disabled', 'true');
  await journey.tap(create.getByRole('button', { name: 'Criar relatório' }));
  await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}\/setup\?etapa=1$/, { timeout: 30_000 });
  const relatorioId = new URL(page.url()).pathname.split('/')[2]!;

  // Etapa 3: the TRT number (the responsável came with the creation batch).
  await journey.tap(page.getByLabel(artOrTrtLabel('crt'), { exact: true }));
  await page.keyboard.type('2620262602583');

  // Etapa 4: nothing registered; "Cadastrar instrumento" opens the new instrument's panel.
  await expect(page.getByText('Nenhum instrumento cadastrado')).toBeVisible();
  const register = page.getByRole('button', { name: 'Cadastrar instrumento' });
  await expect(register).toHaveAccessibleDescription('Abre Cadastros › Instrumentos');
  await journey.tap(register);
  await expect(page).toHaveURL(/\/cadastros$/);
  // E12-Q3: the arrival is drawn (its panel, the return target set) before "Voltar".
  await expect(page.locator('.registry-panel')).toBeVisible();
  // A side check, outside the journey's count: the App bar "Voltar" from here also returns
  // to Etapa 4; then the same press again, as the forward path had it.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=4$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 4 — Instrumentos e certificados' })).toBeFocused();
  // Outside the count too: "Fechar" on the arrival panel with nothing typed creates no
  // instrument, so setup checks none (E12-Q11: only an instrument that exists is checked).
  await register.click();
  await expect(page.locator('.registry-panel')).toBeVisible();
  await page.locator('.registry-panel').getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=4$`));
  await expect(page.getByText('Nenhum instrumento cadastrado')).toBeVisible();
  const instrumentIdOps = async () => (await readStore<{ path: string }>(page, database, 'outbox')).filter((row) => row.path === 'relatorio/setup/instrument_ids');
  expect(await instrumentIdOps()).toEqual([]);

  await scrollToEnd(page);
  await register.click();
  await expect(page).toHaveURL(/\/cadastros$/);
  await expect(page.getByRole('tab', { name: 'Instrumentos' })).toHaveAttribute('aria-selected', 'true');
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  // E12-Q2: the new instrument's first field is the arrival's target, focused and in view.
  await expectLanded(page, panel.getByLabel('Código'));
  await page.keyboard.type('MG-01');
  await journey.tap(panel.getByRole('button', { name: 'Fechar', exact: true }));

  // Back on Etapa 4, its heading focused, the new instrument listed and checked (E12-Q11).
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=4$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 4 — Instrumentos e certificados' })).toBeFocused();
  const instrument = page.getByRole('checkbox', { name: /^MG-01/ });
  await expect(instrument).toBeChecked();
  await expect.poll(async () => (await instrumentIdOps()).length).toBe(1);

  // Concluir goes forward: the Sumário, "Dados salvos", section 9 open.
  const complete = page.getByRole('button', { name: 'Concluir dados do relatório' });
  await expect(complete).not.toHaveAttribute('aria-disabled', 'true');
  await journey.tap(complete);
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expectLanded(page);
  await expect(page.getByTestId('toast')).toContainText('Dados salvos');
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');
  await expect(section9Chevron(page)).toHaveAttribute('aria-expanded', 'true');

  // The first sheet: its cabine, then its row.
  await journey.tap(firstCabine(page).locator(':scope > .s9-cab-row [data-tree-chevron]'));
  const row = firstCabine(page).locator(':scope > .s9-eqs > li.s9-eq').first();
  const blockId = (await row.getAttribute('data-block-id'))!;
  await journey.tap(row.locator('.s9-eq-open'));
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  recordTaps('J5', journey.count);
});

test('@p1 12.2-E2E-004 with no last sheet, "Continuar" opens the first sheet still missing something', async ({ page }) => {
  test.setTimeout(120_000);
  const relatorioId = await emCampoRelatorio(page, 768);
  const rows = await firstCabineRows(page);
  const first = (await rows.nth(0).getAttribute('data-block-id'))!;
  const second = (await rows.nth(1).getAttribute('data-block-id'))!;
  // The first sheet concluded from the office: it is no longer missing anything.
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `block/${first}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
  ]);
  await syncNow(page);
  const again = await firstCabineRows(page);
  await expect(again.nth(0).locator('.s9-state')).toHaveAttribute('data-state', 'ok', { timeout: 30_000 });

  await page.goto('/');
  const resume = currentCard(page).getByRole('button', { name: /^Continuar: / });
  await expect(resume).toContainText('1 de ', { timeout: 30_000 });
  await resume.click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${second}$`));
});

test('@p1 12.2-E2E-005 "Próxima seção" walks the section texts 2, 4, 5, 6 and is gone on the last', async ({ page }) => {
  test.setTimeout(120_000);
  await emCampoRelatorio(page, 768);
  await page.getByRole('list', { name: 'Sumário do relatório' }).getByRole('button', { name: /^Definições/ }).click();
  const heading = page.locator('.section-text-title');
  await expect(heading).toHaveText('Seção 2 — Definições');
  const next = page.getByRole('button', { name: 'Próxima seção' });
  for (const title of ['Seção 4 — Requisitos básicos', 'Seção 5 — Recomendações gerais (NR-10)', 'Seção 6 — Verificações e ensaios aplicáveis']) {
    await next.click();
    await expect(heading).toHaveText(title);
    await expect(page.getByRole('heading', { level: 2, name: title })).toBeFocused();
  }
  await expect(next).toHaveCount(0);
  await page.getByRole('button', { name: 'Voltar ao sumário' }).click();
  // Story 12.5 (J-17): the App bar names the relatório; the Sumário list says where we are.
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible();
});
