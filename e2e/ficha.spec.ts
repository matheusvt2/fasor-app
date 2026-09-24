import { cellAddressesOf, getDefinition, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';

/*
 * 5.1-5.4-E2E: the equipment sheet, driven as a person would, by pointer and by keyboard:
 * opened from a tree row, its header, stepper and sticky bar, the cabine block edited on
 * the cabine's first sheet and read-only on the next, the nameplate typed field by field
 * and copied by chip, the checklist marked with taps, keys and the bulk action with its
 * undo, the draft offered after a tab died mid-typing, and "Concluir ficha" both ways.
 *
 * Every test resets Empresa B and pushes a relatório of the standard template from an
 * "office" device, then opens `/relatorio/:id` and reaches a sheet through the tree, by the
 * row's type (no literal TAG or id). Safe mid-run only because the suite runs with
 * `workers: 1`.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);

interface OutboxRow {
  path: string;
  value: unknown;
  batch_id: string | null;
}

const PARA_RAIO = getDefinition('v1', 'cabine_primaria', 'para_raio');
const toast = (page: Page) => page.getByTestId('toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const enel = (page: Page) => tree(page).locator(':scope > li.s9-cabine').filter({ has: page.locator(':scope > .s9-cab-row .s9-cab-name', { hasText: 'Cubículo Enel' }) });
const enelRows = (page: Page) => enel(page).locator(':scope > .s9-eqs > li.s9-eq');
const rowOfType = (page: Page, type: string, nth = 0) => enelRows(page).filter({ has: page.locator('.s9-eq-name', { hasText: new RegExp(`^${type}$`) }) }).nth(nth);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string) => page.locator(`[data-field-key="${key}"]`);
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');

/** "Sincronizar agora" from the Sync status, until nothing is waiting, then back. */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await button.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok');
  await page.goto(back);
}

/** Resets Empresa B, signs in and opens the Sumário of a relatório pushed from the office. */
async function openRelatorio(page: Page, width: number): Promise<{ relatorioId: string; projectId: string }> {
  await resetCompany({ standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const ids = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${ids.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return ids;
}

/** Section 9 open and Cubículo Enel expanded. */
async function openEnel(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(enelRows(page).first()).toBeVisible();
}

/** A row's block id and TAG, read off the rendered tree. */
async function rowIds(row: Locator): Promise<{ blockId: string; tag: string }> {
  const blockId = (await row.getAttribute('data-block-id'))!;
  const tag = (await row.locator('.block-tag').textContent())!.trim();
  expect(blockId).not.toBe('');
  return { blockId, tag };
}

/** Taps a tree row and waits for its sheet. */
async function openSheet(page: Page, row: Locator): Promise<{ blockId: string; tag: string }> {
  const ids = await rowIds(row);
  await row.locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${ids.blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  return ids;
}

/** The cells the para-raio's tests ask for, at the fixture's addresses (the capture `1 MINUTO` is col 1). */
function paraRaioCells(): { testKey: string; row: number; col: number }[] {
  return PARA_RAIO.tests.flatMap((t) => cellAddressesOf(PARA_RAIO, t.key));
}

test('@p0 5.1-E2E-001 a tree row opens the sheet: App bar TAG, header, stepper with counts, rail, stepper jump; the nameplate typed field by field survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));

  // The App bar title is the TAG; the header shows type + TAG (the rename button), the location.
  await expect(page.locator('.app-bar-title')).toHaveText(tag);
  await expect(page.locator('.sheet-title')).toContainText('Para-raio');
  await expect(page.getByRole('button', { name: `TAG ${tag} — renomear` })).toBeVisible();
  await expect(page.locator('.sheet-header .sheet-meta').first()).toHaveText('Cubículo Enel');
  const box = (await page.getByRole('button', { name: `TAG ${tag} — renomear` }).boundingBox())!;
  expect(Math.round(box.height)).toBeGreaterThanOrEqual(48);

  // The stepper counts what is missing; the Progress counter sums it.
  const checklistCount = PARA_RAIO.checklist!.length;
  const cells = paraRaioCells().length;
  await expect(stepper(page).getByRole('button')).toHaveText([/Placa/, /Verificações/, /Ensaios/, /Conclusão/]);
  await expect(stepper(page).getByRole('button', { name: `Placa, ${PARA_RAIO.nameplate.length} faltando` })).toHaveAttribute('aria-current', 'step');
  await expect(stepper(page).getByRole('button', { name: `Verificações, ${checklistCount} faltando` })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: `Ensaios, ${cells} faltando` })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Conclusão, 2 faltando' })).toBeVisible();
  const total = PARA_RAIO.nameplate.length + checklistCount + cells + 2;
  await expect(page.getByTestId('ficha-progress')).toHaveText(`${total} obrigatórios faltando`);
  // The primary moves on while the sheet is incomplete; no camera is drawn before Epic 6.
  await expect(page.locator('.sticky-action-bar .bar-buttons .btn-primary')).toHaveText(/Próxima ficha/);
  await expect(page.locator('.camera-capture-btn')).toHaveCount(0);

  // The rail sits at the left at 1280 with this sheet current.
  await expect(page.getByRole('complementary', { name: 'Árvore do relatório', exact: true })).toBeVisible();
  await expect(page.locator(`.relatorio-tree li[data-block-id="${blockId}"] .tree-row`)).toHaveAttribute('aria-current', 'true');

  // Tapping a step scrolls to it and marks it current.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await expect(stepper(page).getByRole('button', { name: /^Verificações,/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Verificações gerais' })).toBeInViewport();

  // The empty plate offers "Digitar" (no photo tile before Epic 8).
  await expect(page.getByText('Fotografar placa')).toHaveCount(0);
  await page.getByRole('button', { name: 'Digitar' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null)).toBe(PARA_RAIO.nameplate[0]!.key);

  // Every field by typing: at 1280 the manufacturer and voltage class Combobox shows at
  // once (the chip row with "Outro…" is the tablet and phone presentation), with "Criar".
  await field(page, 'fabricacao').getByRole('combobox').fill('Fabricante Ficha');
  await page.getByRole('option', { name: 'Criar “Fabricante Ficha”' }).click();
  await expect(page.getByTestId('ficha-saved')).toHaveText('Salvo');
  await page.getByLabel('Nº SÉRIE', { exact: true }).fill('PR-0001');
  await page.getByLabel('TIPO', { exact: true }).fill('Polimérico');
  await field(page, 'tensao_nominal').getByRole('combobox').fill('36,2');
  await page.getByRole('option', { name: 'Criar “36,2”' }).click();
  const corrente = page.getByLabel('CORRENTE NOMINAL', { exact: true });
  await expect(corrente).toHaveAttribute('inputmode', 'decimal');
  await expect(field(page, 'corrente_nominal').locator('.mf-unit')).toHaveText('kA');
  await corrente.fill('10');
  await corrente.press('Tab');
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();

  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/nameplate/`)).map((row) => row.path.split('/').at(-1)).sort())
    .toEqual(PARA_RAIO.nameplate.map((f) => f.key).sort());
  const ops = await outbox(page);
  expect(ops.find((row) => row.path === `sheet/${blockId}/nameplate/corrente_nominal`)?.value).toEqual({ raw: '10', unit: 'kA', state: 'measured' });

  await page.reload();
  await expect(page.getByLabel('Nº SÉRIE', { exact: true })).toHaveValue('PR-0001');
  await expect(page.getByLabel('TIPO', { exact: true })).toHaveValue('Polimérico');
  await expect(page.getByLabel('CORRENTE NOMINAL', { exact: true })).toHaveValue('10');
  await expect(field(page, 'fabricacao').getByRole('combobox')).toHaveValue('Fabricante Ficha');
  await expect(field(page, 'tensao_nominal').getByRole('combobox')).toHaveValue('36,2');
  await expect(page.locator('.sheet-header .sheet-meta').nth(1)).toHaveText(/^Preenchido por .+ · \d{2}\/\d{2} \d{2}:\d{2}$/);
  expect(relatorioId).not.toBe('');
});

test('@p0 5.4-E2E-001 the checklist by mouse and keyboard: C/NC/NA, Delete clears, re-tap keeps, NC requires an observation with chips, bulk Conforme with undo, both bulk reasons', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  const items = PARA_RAIO.checklist!;

  // The legend heads the session's first checklist.
  await expect(page.locator('details.ficha-legend')).toHaveAttribute('open', '');
  // Nothing is pre-marked: every row unset.
  await expect(page.locator('#ficha-step-verificacoes .tri-state .seg[aria-checked="true"]')).toHaveCount(0);

  // Row 1 by mouse: C, and a re-tap does nothing.
  const row1 = checklistRow(page, 1).getByRole('radiogroup', { name: `1. ${items[0]!.label}` });
  await row1.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(row1.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await row1.getByRole('radio', { name: 'Conforme', exact: true }).click();
  await expect(row1.getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/checklist/${items[0]!.key}/result`)?.value).toBe('C');

  // Row 2 by keyboard: Tab lands on its first segment, arrows move and select, Delete clears.
  const row2 = checklistRow(page, 2).getByRole('radiogroup', { name: `2. ${items[1]!.label}` });
  await row2.getByRole('radio', { name: 'Conforme', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(row2.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect(row2.getByRole('radio', { name: 'Não conforme' })).toBeFocused();
  // NC expands the row: the seed's chips and the required Observation field.
  const observation2 = page.getByLabel('Observação do item 2', { exact: true });
  await expect(observation2).toHaveAttribute('data-required', '');
  await expect(observation2).toHaveAccessibleDescription('Obrigatória em item não conforme');
  await expect(stepper(page).getByRole('button', { name: `Verificações, ${items.length - 1} faltando` })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(row2.getByRole('radio', { name: 'Não se aplica' })).toHaveAttribute('aria-checked', 'true');
  await expect(observation2).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(row2.locator('.seg[aria-checked="true"]')).toHaveCount(0);

  // Row 3 NC by mouse, a chip inserts its phrase and the reason goes once text exists.
  const row3 = checklistRow(page, 3).getByRole('radiogroup', { name: `3. ${items[2]!.label}` });
  await row3.getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = items[2]!.nc_phrases[0]!;
  await checklistRow(page, 3).getByRole('group', { name: 'Observações sugeridas do item 3' }).getByRole('button', { name: phrase }).click();
  const observation3 = page.getByLabel('Observação do item 3', { exact: true });
  await expect(observation3).toHaveValue(phrase);
  await expect(observation3).not.toHaveAttribute('data-required');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/checklist/${items[2]!.key}/observation`)?.value).toBe(phrase);

  // Row 4 NC and left without observation: it stays counted, visibly required, and blocks nothing.
  await checklistRow(page, 4).getByRole('radio', { name: 'Não conforme' }).click();
  await expect(page.getByLabel('Observação do item 4', { exact: true })).toHaveAttribute('data-required', '');

  // Bulk: the unset rows (2 and 5) become C in one batch; NC rows untouched; undo reverses both.
  const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar');
  await bulk.getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('2 itens marcados Conforme');
  await expect(checklistRow(page, 2).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 5).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 4).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  const batches = new Set((await outbox(page)).filter((row) => row.path === `sheet/${blockId}/checklist/${items[1]!.key}/result` || row.path === `sheet/${blockId}/checklist/${items[4]!.key}/result`).map((row) => row.batch_id));
  expect(batches.size).toBeGreaterThanOrEqual(1);
  await expect(bulk.getByRole('button', { name: 'Marcar os restantes como Conforme' })).toHaveAttribute('aria-disabled', 'true');
  await expect(bulk.getByText('Todos os itens já estão marcados')).toBeVisible();
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(checklistRow(page, 2).locator('.seg[aria-checked="true"]')).toHaveCount(0);
  await expect(checklistRow(page, 5).locator('.seg[aria-checked="true"]')).toHaveCount(0);
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');

  // "Repetir" has no concluded sheet of this type yet: disabled with its reason.
  await expect(bulk.getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' })).toHaveAttribute('aria-disabled', 'true');
  await expect(bulk.getByText('Nenhuma ficha deste tipo concluída')).toBeVisible();

  // Overflow "Limpar" clears row 1.
  await checklistRow(page, 1).getByRole('button', { name: `Mais opções de ${items[0]!.label}` }).click();
  await page.getByRole('menuitem', { name: 'Limpar' }).click();
  await expect(checklistRow(page, 1).locator('.seg[aria-checked="true"]')).toHaveCount(0);

  // Row 4's observation typed across the idle commit: "abc", a pause past it, "def", blur.
  const observation4 = page.getByLabel('Observação do item 4', { exact: true });
  await observation4.click();
  await page.keyboard.type('abc');
  await page.waitForTimeout(1000);
  await page.keyboard.type('def');
  await expect(observation4).toHaveValue('abcdef');
  await observation4.blur();
  await expect(observation4).toHaveValue('abcdef');
  const observationPath = `sheet/${blockId}/checklist/${items[3]!.key}/observation`;
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === observationPath).at(-1)?.value).toBe('abcdef');
  await page.reload();
  await expect(page.getByLabel('Observação do item 4', { exact: true })).toHaveValue('abcdef');
});

test('@p0 5.2-E2E-001 the cabine block: edited on the cabine first sheet as location ops, read-only on the next sheet, the humidity note, "Copiar da cabine anterior" with undo', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const first = await rowIds(enelRows(page).first());
  await page.getByRole('button', { name: 'Mais opções de Cubículo Enel' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${first.blockId}$`));

  await expect(page.getByRole('heading', { name: 'Características da SE' })).toBeVisible();
  await expect(page.locator('.ficha-da-cabine').first()).toHaveText('Da cabine · Cubículo Enel');
  await page.getByLabel('TIPO DE SE', { exact: true }).selectOption('BLINDADA');
  const primaria = page.getByLabel('TENSÃO PRIMÁRIA', { exact: true });
  await primaria.fill('13,8');
  await primaria.press('Tab');
  await page.getByLabel('TEMPERATURA', { exact: true }).fill('19');
  const umidade = page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true });
  await umidade.fill('85');
  await umidade.press('Enter');
  await expect(page.getByRole('textbox', { name: 'ALTITUDE', exact: true })).toHaveAttribute('aria-readonly', 'true');

  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('location/')).map((row) => row.path.split('/').slice(2).join('/')).sort()).toEqual([
    'env/humidity_pct',
    'env/temperature_c',
    'se/primary_kv',
    'se/type',
  ]);
  const ops = await outbox(page);
  expect(ops.find((row) => row.path.endsWith('/se/primary_kv'))?.value).toEqual({ raw: '13.8', unit: 'kV', state: 'measured' });
  expect(ops.some((row) => row.path.startsWith(`sheet/${first.blockId}/`))).toBe(false);

  // Humidity above the threshold surfaces the rain/humidity note; a tap writes the sheet observation.
  const notes = page.getByRole('group', { name: 'Observações rápidas' });
  await notes.getByRole('button', { name: 'Chuva e umidade elevada' }).click();
  await expect(notes.getByRole('button', { name: 'Chuva e umidade elevada' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => String((await outbox(page)).find((row) => row.path === `sheet/${first.blockId}/observations`)?.value ?? '')).toContain('umidade');

  // The next sheet of the cabine shows the same values read-only under the same labels.
  await page.locator('.sticky-action-bar .btn-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  const readOnly = page.getByRole('textbox', { name: 'TENSÃO PRIMÁRIA' });
  await expect(readOnly).toHaveAttribute('aria-readonly', 'true');
  await expect(readOnly).toContainText('13,8');
  await expect(page.getByRole('textbox', { name: 'TIPO DE SE' })).toHaveText('BLINDADA');
  await expect(page.locator('.se-block.is-readonly')).toHaveCount(2);

  // 1° Subsolo's first sheet copies Cubículo Enel's environment, with an undo.
  await page.goto(`/relatorio/${relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await page.getByRole('button', { name: 'Mais opções de 1° Subsolo' }).click();
  await page.getByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }).click();
  await expect(page).toHaveURL(/\/ficha\//);
  await page.getByRole('button', { name: 'Copiar da cabine anterior' }).click();
  await expect(toast(page)).toContainText('Copiado de Cubículo Enel');
  await expect(page.getByLabel('TEMPERATURA', { exact: true })).toHaveValue('19');
  await expect(page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true })).toHaveValue('85');
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByLabel('TEMPERATURA', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('UMIDADE RELATIVA DO AR', { exact: true })).toHaveValue('');
});

test('@p0 5.3-E2E-001 "Igual à ⟨TAG⟩?" copies a same-type plate as plain ops, with an undo', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const source = await rowIds(rowOfType(page, 'Para-raio', 0));
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId }, `sheet/${source.blockId}/nameplate/fabricacao`, 'Celtta'),
    officeDraft(account, { relatorioId }, `sheet/${source.blockId}/nameplate/n_serie`, 'PR-0009'),
  ]);
  await syncNow(page);
  await openEnel(page);
  const target = await openSheet(page, rowOfType(page, 'Para-raio', 1));

  await page.getByRole('button', { name: `Igual à ${source.tag}?` }).click();
  await expect(toast(page)).toContainText(`Copiado de ${source.tag}`);
  await expect(page.getByLabel('Nº SÉRIE', { exact: true })).toHaveValue('PR-0009');
  const copied = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${target.blockId}/nameplate/`));
  expect(copied.map((row) => row.path.split('/').at(-1)).sort()).toEqual(['fabricacao', 'n_serie']);
  expect(new Set(copied.map((row) => row.batch_id)).size).toBe(1);
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('button', { name: 'Digitar' })).toBeVisible();
  await expect(page.getByRole('button', { name: `Igual à ${source.tag}?` })).toBeVisible();
});

test('@p0 5.1-E2E-002 "Concluir ficha" with missing fields jumps to the first incomplete step and concludes nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));
  // Move away from the plate first, so the jump is visible.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
  await expect(page.getByTestId('ficha-announcer')).toHaveText('Faltam obrigatórios — indo para o primeiro campo faltando');
  await expect(stepper(page).getByRole('button', { name: /^Placa,/ })).toHaveAttribute('aria-current', 'step');
  // The plate was empty: its fields are revealed and the first missing one holds the focus.
  await expect(field(page, PARA_RAIO.nameplate[0]!.key)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest('[data-field-key]')?.getAttribute('data-field-key') ?? null)).toBe(PARA_RAIO.nameplate[0]!.key);
  expect((await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(false);
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
});

test('@p0 5.1-E2E-003 "Concluir ficha" on a complete sheet emits concluded_by and moves to the next sheet in tree order', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const target = await rowIds(rowOfType(page, 'Para-raio'));
  const order = await enelRows(page).evaluateAll((rows) => rows.map((row) => row.getAttribute('data-block-id')));
  const next = order[order.indexOf(target.blockId) + 1]!;

  // Seeded complete from the office, at the fixture's cell addresses, the pair set.
  const scope = { relatorioId };
  const drafts: OpDraft[] = [
    ...PARA_RAIO.nameplate.map((f) =>
      officeDraft(account, scope, `sheet/${target.blockId}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '10', unit: f.unit ?? null, state: 'measured' } : 'X'),
    ),
    ...PARA_RAIO.checklist!.map((item) => officeDraft(account, scope, `sheet/${target.blockId}/checklist/${item.key}/result`, 'C')),
    ...paraRaioCells().map((c) => officeDraft(account, scope, `sheet/${target.blockId}/test/${c.testKey}/cell/${c.row}/${c.col}`, { raw: '1000', unit: 'MΩ', state: 'measured' })),
    officeDraft(account, scope, `sheet/${target.blockId}/conclusion/result`, 'aprovado'),
    officeDraft(account, scope, `sheet/${target.blockId}/conclusion/restriction`, 'sem_restricoes'),
  ];
  await pushDrafts(page, database, drafts);
  await syncNow(page);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Para-raio'));

  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  await expect(stepper(page).getByRole('button', { name: 'Conclusão, 0 faltando' })).toBeVisible();
  const primary = page.locator('.sticky-action-bar .btn-primary');
  await expect(primary).toHaveText(/Concluir ficha/);
  await primary.click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${next}$`));
  await expect(toast(page)).toContainText('Ficha concluída');
  const concluded = (await outbox(page)).find((row) => row.path === `block/${target.blockId}/concluded_by`);
  expect(concluded?.value).toMatchObject({ actor_id: account.userId });

  // Back on it: the concluded-by line, and the primary moves on.
  await page.goBack();
  await expect(page.locator('.sheet-header .sheet-meta').filter({ hasText: /^Concluída por / })).toBeVisible();
  await expect(page.locator('.sticky-action-bar .btn-primary')).toHaveText(/Próxima ficha/);
});

test('@p0 5.1-E2E-004 uncommitted observation text survives a dead tab as "Rascunho encontrado — Recuperar"; 390 px has no side scroll and no rail', async ({ page, context }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 390);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  expect(await horizontalOverflow(page)).toBe(0);
  await expect(page.locator('aside.rail')).toBeHidden();
  await expect(page.locator('aside.rail-collapsed')).toBeHidden();

  await checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' }).click();
  const observation = page.getByLabel('Observação do item 1', { exact: true });
  await observation.fill('texto ainda não salvo');
  // The tab goes away mid-typing.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await readStore<{ value: unknown }>(page, database, 'drafts')).map((row) => row.value)).toContain('texto ainda não salvo');
  const url = page.url();
  await page.close();

  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 390, height: 900 });
  await reopened.goto(url);
  await expect(reopened.getByLabel('Observação do item 1', { exact: true })).toBeVisible({ timeout: 30_000 });
  const offer = reopened.getByTestId('toast');
  await expect(offer).toContainText('Rascunho encontrado');
  await offer.getByRole('button', { name: 'Recuperar' }).click();
  await expect(reopened.getByLabel('Observação do item 1', { exact: true })).toHaveValue('texto ainda não salvo');
  await expect
    .poll(async () => (await readStore<OutboxRow>(reopened, database, 'outbox')).filter((row) => row.path === `sheet/${blockId}/checklist/${PARA_RAIO.checklist![0]!.key}/observation`).map((row) => row.value))
    .toContain('texto ainda não salvo');
});

// --- Stories 5.5-5.8: the readings, the run, the instrument, the conclusion -------------------

const SECCIONADORA = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');
const cellInput = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const cellBox = (page: Page, key: string) => page.locator(`.ficha-cell[data-cell="${key}"]`).filter({ visible: true });
const resultGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Resultado' });
const restrictionGroup = (page: Page) => page.getByRole('radiogroup', { name: 'Restrições' });

/** Types a value into the focused cell and presses Enter (the continuous run). */
async function typeAndEnter(page: Page, text: string): Promise<void> {
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** One instrument create, company scope, pushed from the office device. */
function instrumentDraft(id: string, fields: Record<string, unknown>): OpDraft {
  return {
    kind: 'create',
    scope: 'company',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: null,
    path: `registry/instrument/${id}`,
    value: {
      id,
      kind: 'instrument',
      code: 'X1',
      name: 'Instrumento',
      manufacturer: null,
      model: null,
      serial: null,
      cert_number: null,
      laboratory: null,
      calibrated_at: null,
      calibration_interval_months: null,
      rbc_accredited: null,
      test_isolacao: null,
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
      ...fields,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  } as OpDraft;
}

test('@p0 5.5-E2E-001 a reading typed the Brazilian way: echo while typing, a suffix and the tap-cycle set the unit, amber out of criterion with "Marcar Com restrições", the outlier hint; reload keeps it', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(page.getByRole('heading', { name: 'Ensaio de isolação' })).toBeVisible();
  // The criterion value in the title row, its source behind the chevron; the single value column.
  await expect(page.locator('.ficha-mt').first().locator('.mt-criterion')).toHaveText('Aceitável >400 MΩ');
  await page.locator('.ficha-mt').first().locator('details.mt-source summary').click();
  await expect(page.locator('.ficha-mt').first().locator('details.mt-source p')).toHaveText('aceitável na ficha');
  await expect(page.locator('.ficha-mt').first().locator('thead th')).toHaveText(['Linha', 'Terra', 'Guard', 'Valor']);

  // "3.300" is three thousand three hundred, echoed before any comparison.
  const t1 = cellInput(page, 'T1, Valor');
  await expect(t1).toHaveAttribute('inputmode', 'decimal');
  await t1.click();
  await page.keyboard.type('3.300');
  await expect(cellBox(page, 'isolacao:0:0').locator('.mf-echo')).toHaveText('= 3.300 GΩ');
  await page.keyboard.press('Enter');
  await expect(cellInput(page, 'T3, Valor')).toBeFocused();
  // "147G" sets the unit slot by its suffix.
  await page.keyboard.type('147G');
  await expect(cellBox(page, 'isolacao:1:0').locator('.mf-echo')).toHaveText('= 147 GΩ');
  await page.keyboard.press('Enter');
  // "330" with the unit slot tapped GΩ -> TΩ -> MΩ.
  await page.keyboard.type('330');
  const unit = cellBox(page, 'isolacao:2:0').locator('.unit-cycle');
  await expect(unit).toHaveAccessibleName('gigaohms, toque para alternar');
  const box = (await unit.boundingBox())!;
  expect(Math.round(box.width)).toBeGreaterThanOrEqual(48);
  await unit.click();
  await unit.click();
  await expect(unit).toHaveAccessibleName('megaohms, toque para alternar');
  await expect(cellBox(page, 'isolacao:2:0').locator('.mf-echo')).toHaveText('= 330 MΩ');
  await page.keyboard.press('Enter');

  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/test/isolacao/cell/0/0`)?.value).toEqual({ raw: '3300', unit: 'GΩ', state: 'measured' });
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/test/isolacao/cell/1/0`)?.value).toEqual({ raw: '147', unit: 'GΩ', state: 'measured' });

  // 330 MΩ against >400 MΩ: amber, the helper, and a one-tap "Marcar Com restrições" that only sets the restriction.
  const t5 = cellBox(page, 'isolacao:2:0');
  await expect(t5.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(t5.locator('.mf-helper[role="status"]')).toContainText('Abaixo do aceitável (>400 MΩ)');
  await expect(cellBox(page, 'isolacao:0:0').locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await t5.getByRole('button', { name: 'Marcar Com restrições' }).click();
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Com restrições' })).toHaveAttribute('aria-checked', 'true');
  await expect(resultGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
  const conclusionOps = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/conclusion/`));
  expect(conclusionOps.map((row) => [row.path.split('/').at(-1), row.value])).toEqual([['restriction', 'com_restricoes']]);

  // Contato fechado: Fase C a thousand times below A and B -- a neutral hint once blurred, never a block.
  await cellInput(page, 'Fase A, Valor').click();
  await typeAndEnter(page, '330M');
  await typeAndEnter(page, '350M');
  await typeAndEnter(page, '0,33M');
  const faseC = cellBox(page, 'isolacao:5:0');
  await expect(faseC.locator('.outlier-helper[role="status"]')).toHaveText('Fase C 1000× abaixo de A e B. Conferir?');

  // A stored reading's unit slot rewrites it at once: T3 147 GΩ -> TΩ untouched, then -> MΩ
  // with the input focused and blurred without typing; the verdict follows the unit.
  const t3Unit = cellBox(page, 'isolacao:1:0').locator('.unit-cycle');
  await t3Unit.click();
  await expect(t3Unit).toHaveAccessibleName('teraohms, toque para alternar');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/1/0`).at(-1)?.value).toEqual({ raw: '147', unit: 'TΩ', state: 'measured' });
  await cellInput(page, 'T3, Valor').click();
  await t3Unit.click();
  await expect(t3Unit).toHaveAccessibleName('megaohms, toque para alternar');
  await cellInput(page, 'T3, Valor').blur();
  await expect(t3Unit).toHaveAccessibleName('megaohms, toque para alternar');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/1/0`).at(-1)?.value).toEqual({ raw: '147', unit: 'MΩ', state: 'measured' });
  await expect(cellBox(page, 'isolacao:1:0').locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');

  await page.reload();
  await expect(cellInput(page, 'T1, Valor')).toHaveValue('3.300');
  await expect(cellInput(page, 'T3, Valor')).toHaveValue('147');
  await expect(cellBox(page, 'isolacao:1:0').locator('.unit-cycle')).toHaveAccessibleName('megaohms, toque para alternar');
  await expect(cellBox(page, 'isolacao:1:0').locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellInput(page, 'T5, Valor')).toHaveValue('330');
  await expect(cellBox(page, 'isolacao:2:0').locator('.unit-cycle')).toHaveAccessibleName('megaohms, toque para alternar');
  await expect(cellBox(page, 'isolacao:2:0').locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
});

test('@p0 5.6-E2E-001 nine seccionadora readings with Enter only, the run ends on the primary; "Não medido" prints "-"; a TP ratio row computes VAL CALCULADO and SATISFATÓRIO live', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await cellInput(page, 'T1, Valor').click();
  for (const value of ['150', '160', '170', '180', '190', '200', '100', '110', '120']) await typeAndEnter(page, value);
  await expect(page.locator('#ficha-primary')).toBeFocused();
  await expect(page.locator('#ficha-primary')).toHaveText(/Próxima ficha/);
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/test/`)).length).toBe(9);
  const cells = (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/test/`)).map((row) => row.path.split('/').slice(3).join('/'));
  expect(cells.sort()).toEqual(
    [...cellAddressesOf(SECCIONADORA, 'isolacao'), ...cellAddressesOf(SECCIONADORA, 'resistencia_contato')].map((a) => `${a.testKey}/cell/${a.row}/${a.col}`).sort(),
  );
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();

  // "Não medido" from the cell's Overflow: stored not_measured, shown "-".
  await page.getByRole('button', { name: 'Mais opções de T1, Valor' }).click();
  await page.getByRole('menuitem', { name: 'Não medido' }).click();
  await expect(cellInput(page, 'T1, Valor')).toHaveValue('');
  await expect(cellInput(page, 'T1, Valor')).toHaveAttribute('placeholder', '-');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/0/0`).at(-1)?.value).toEqual({ raw: '', unit: 'GΩ', state: 'not_measured' });

  // The TP: the ratio row computes from the typed voltages, live, never typed itself.
  await page.goto(page.url().replace(/\/ficha\/.*$/, ''));
  await openEnel(page);
  const tp = await openSheet(page, rowOfType(page, 'TP'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const ttr = page.locator('table.ficha-ttr');
  await expect(ttr.locator('thead th')).toHaveText(["TP's", 'V primário', 'V secundário', 'Calculado', 'H1-H2 / X1-X2', 'Condição']);
  await cellInput(page, 'Fase R, V primário').click();
  await page.keyboard.type('13800');
  await page.keyboard.press('Tab');
  await expect(cellInput(page, 'Fase R, V secundário')).toBeFocused();
  await page.keyboard.type('115');
  await page.keyboard.press('Tab');
  await expect(cellInput(page, 'Fase R, H1-H2 / X1-X2')).toBeFocused();
  const rowR = ttr.locator('tbody tr').first();
  await expect(rowR.locator('td.cell-calc').first()).toContainText('120,00');
  await expect(rowR.locator('td.cell-calc').first()).toContainText('calculado');
  await page.keyboard.type('120,135');
  await page.keyboard.press('Enter');
  await expect(rowR.locator('td.cell-calc').nth(1)).toContainText('SATISFATÓRIO');
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${tp.blockId}/test/relacao_transformacao/cell/0/3`)?.value).toEqual({ raw: '120.135', unit: null, state: 'measured' });
  expect((await outbox(page)).some((row) => /relacao_transformacao\/cell\/\d+\/(2|4)$/.test(row.path))).toBe(false);
});

test('@p0 5.7-E2E-001 the Instrument picker: empty state opens Cadastros; a pick by code copies the header, the expired line never blocks, the last one per test type comes first on the next sheet', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Chave seccionadora', 0));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const isoSection = page.locator('section[data-test-key="isolacao"]');
  await isoSection.getByRole('button', { name: /^Instrumento/ }).click();
  await expect(isoSection.getByText('Nenhum instrumento cadastrado')).toBeVisible();
  await isoSection.getByRole('button', { name: 'Cadastrar instrumento' }).click();
  await expect(page).toHaveURL(/\/cadastros/);

  const megId = newId();
  const oldId = newId();
  await pushDrafts(page, database, [
    instrumentDraft(megId, { code: '2E', name: 'Megôhmetro', manufacturer: 'Instrum', model: 'DMG10Ki', serial: 'IN919021', cert_number: '37428/26', calibrated_at: '2026-08-28', calibration_interval_months: 12, test_isolacao: { raw: '5', unit: 'kV' } }),
    instrumentDraft(oldId, { code: '5A', name: 'Megôhmetro MIT525', manufacturer: 'Megger', model: 'MIT525', serial: '1002211', cert_number: '35110/24', calibrated_at: '2025-02-02', calibration_interval_months: 12 }),
  ]);
  await syncNow(page);
  await page.goto(`/relatorio/${relatorioId}`);
  await openEnel(page);
  const first = await openSheet(page, rowOfType(page, 'Chave seccionadora', 0));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();

  // Pick "2E" on the insulation: one op with the header copied by value.
  await isoSection.getByRole('button', { name: /^Instrumento/ }).click();
  const list = isoSection.getByRole('radiogroup', { name: 'Instrumentos cadastrados' });
  await expect(list.getByRole('radio')).toHaveCount(2);
  await list.getByRole('radio', { name: /^2E/ }).click();
  await expect(isoSection.getByRole('button', { name: 'Instrumento 2E — Megôhmetro' })).toBeVisible();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${first.blockId}/test/isolacao/instrument`).map((row) => row.value))
    .toEqual([{ instrument_id: megId, code: '2E', manufacturer: 'Instrum', model: 'DMG10Ki', serial: 'IN919021', cert_number: '37428/26', calibrated_at: '2026-08-28', valid_until: '2027-08-28', test_parameter: '5 kV' }]);
  await isoSection.getByText('Série, RBC e validade').click();
  await expect(isoSection.locator('details.ficha-details p').first()).toContainText('série IN919021 · RBC 37428/26 · válida até 28/08/2027');

  // "5A" on the contact resistance: expired, the amber line always visible, still picked.
  const rcSection = page.locator('section[data-test-key="resistencia_contato"]');
  await rcSection.getByRole('button', { name: /^Instrumento/ }).click();
  await expect(rcSection.getByRole('radio', { name: /^5A/ })).toContainText('Calibração vencida em 02/02/2026');
  await rcSection.getByRole('radio', { name: /^5A/ }).click();
  await expect(rcSection.getByRole('button', { name: 'Instrumento 5A — Megôhmetro MIT525' })).toBeVisible();
  await expect(rcSection.locator('p.ip-expired')).toHaveText('Calibração vencida em 02/02/2026');

  // The next seccionadora: the last code per test type comes first (5A before 2E on the contact resistance).
  await page.locator('#ficha-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await page.locator('section[data-test-key="resistencia_contato"]').getByRole('button', { name: /^Instrumento/ }).click();
  await expect(page.locator('section[data-test-key="resistencia_contato"]').getByRole('radio').first()).toContainText('5A');
  await page.keyboard.press('Escape');
  await page.locator('section[data-test-key="isolacao"]').getByRole('button', { name: /^Instrumento/ }).click();
  await expect(page.locator('section[data-test-key="isolacao"]').getByRole('radio').first()).toContainText('2E');
});

test('@p0 5.8-E2E-001 one tap on the suggestion sets both pairs, the composed text is confirmed, a later reading makes it stale, Com restrições requires the observation, then "Concluir ficha" concludes', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const target = await rowIds(rowOfType(page, 'Chave seccionadora'));
  // The plate seeded from the office; the checklist and readings through the UI.
  await pushDrafts(
    page,
    database,
    SECCIONADORA.nameplate.map((f) =>
      officeDraft(account, { relatorioId }, `sheet/${target.blockId}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '630', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'X'),
    ),
  );
  await syncNow(page);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await cellInput(page, 'T1, Valor').click();
  for (const value of ['150', '160', '170', '180', '190', '200', '100', '110', '120']) await typeAndEnter(page, value);

  // The suggestion: all C/NA and all within.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Aprovado · Sem restrições?');
  await expect(suggestion.locator('.suggested-pill')).toHaveText('Sugerido');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');
  await expect(suggestion).toHaveCount(0);
  const pair = (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/conclusion/result` || row.path === `sheet/${blockId}/conclusion/restriction`);
  expect(pair.map((row) => row.value).sort()).toEqual(['aprovado', 'sem_restricoes']);
  expect(new Set(pair.map((row) => row.batch_id)).size).toBe(1);

  // The paragraph composed on the device, its Criteria line as its description.
  const text = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(text).toHaveText(`A seccionadora ${tag} (X, X kV, 630 A) apresentou valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes.`);
  await expect(text).toHaveAccessibleDescription(/Critérios usados.*R_iso T1–T2 150 GΩ · critério >400 MΩ/);
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outbox(page)).find((row) => row.path === `sheet/${blockId}/conclusion/text_status`)?.value).toBe('confirmed');
  const ops = await outbox(page);
  expect(ops.find((row) => row.path === `sheet/${blockId}/conclusion/text`)?.value).toContain(`A seccionadora ${tag}`);
  expect(String(ops.find((row) => row.path === `sheet/${blockId}/conclusion/text_basis`)?.value)).toMatch(/^[0-9a-f]{8}$/);

  // A later reading (the completed Ensaios step is collapsed: the stepper opens it again):
  // the confirmed text stays, "Sugerido: texto atualizado — Substituir" beneath.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await cellInput(page, 'T1, Valor').fill('0,2');
  await cellInput(page, 'T1, Valor').press('Tab');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.suggestion-field.is-generated .suggestion-alt')).toHaveText('Sugerido: texto atualizado — Substituir');
  await expect(text).toContainText('valores medidos dentro dos critérios de aceitação');
  const textOps = async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/conclusion/text`).map((row) => String(row.value));
  const confirmedText = (await textOps()).at(-1)!;

  // "Substituir": the recomposed text replaces the stored one and the stale line goes.
  await page.locator('.suggestion-field.is-generated .suggestion-alt').getByRole('button', { name: 'Substituir' }).click();
  await expect(page.locator('.suggestion-field.is-generated .suggestion-alt')).toHaveCount(0);
  await expect(text).not.toContainText('valores medidos dentro dos critérios de aceitação');
  const replacedText = (await text.textContent())!;
  await expect.poll(async () => (await textOps()).includes(replacedText)).toBe(true);
  expect(replacedText).not.toBe(confirmedText);

  // Sem restrições with a non-conforming item: the warning under the pair.
  // By keyboard on row 1 (Conforme -> ArrowRight -> Não conforme, and back), so the
  // stepper's scroll cannot move the target under the pointer.
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  // The stepper lands its focus on the step a few frames later; wait for it, or it steals the radio's.
  await expect(page.locator('#ficha-step-verificacoes')).toBeFocused();
  await checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-control .conclusion-hint[role="status"]')).toHaveText('Há itens não conformes');
  await stepper(page).getByRole('button', { name: /^Verificações,/ }).click();
  await expect(page.locator('#ficha-step-verificacoes')).toBeFocused();
  await checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-control .conclusion-hint')).toHaveCount(0);

  // "Editar": stored as edited at once, typed, blurred; the edited text survives a reload.
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Editar' }).click();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${blockId}/conclusion/text_status` && row.value === 'edited')).toBe(true);
  const editor = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(editor).toBeFocused();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Texto revisado.');
  await editor.blur();
  await expect.poll(async () => (await textOps()).at(-1)).toBe(`${replacedText} Texto revisado.`);
  await page.reload();
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveValue(`${replacedText} Texto revisado.`);

  // Com restrições: the observation is required, then written; "Concluir ficha" concludes.
  await restrictionGroup(page).getByRole('radio', { name: 'Com restrições' }).click();
  await expect(page.getByText('Obrigatória com restrições')).toBeVisible();
  await expect(page.getByLabel('Observações da ficha')).toHaveAttribute('data-required', '');
  await expect(page.getByTestId('ficha-progress')).toHaveText('1 obrigatório faltando');
  await page.getByLabel('Observações da ficha').fill('Isolação T1 abaixo do aceitável.');
  await page.getByLabel('Observações da ficha').press('Tab');
  await expect(page.getByText('Obrigatória com restrições')).toHaveCount(0);
  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  await page.locator('#ficha-primary').click();
  await expect(toast(page)).toContainText('Ficha concluída');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(true);
});

test('@p0 5.8-E2E-002 "Concluir ficha" lands on the first empty reading, then on the first Resultado radio, then on the observation Com restrições requires', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const target = await rowIds(rowOfType(page, 'Chave seccionadora'));
  // Plate and checklist complete from the office; readings and pair empty.
  await pushDrafts(page, database, [
    ...SECCIONADORA.nameplate.map((f) =>
      officeDraft(account, { relatorioId }, `sheet/${target.blockId}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '630', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'X'),
    ),
    ...SECCIONADORA.checklist!.map((item) => officeDraft(account, { relatorioId }, `sheet/${target.blockId}/checklist/${item.key}/result`, 'C')),
  ]);
  await syncNow(page);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  const concluir = async () => {
    await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
    await page.getByRole('menuitem', { name: 'Concluir ficha' }).click();
    await expect(page.getByTestId('ficha-announcer')).toHaveText('Faltam obrigatórios — indo para o primeiro campo faltando');
  };
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();

  // A reading empty: the Ensaios step, the first empty cell focused.
  await concluir();
  await expect(stepper(page).getByRole('button', { name: /^Ensaios,/ })).toHaveAttribute('aria-current', 'step');
  await expect(cellInput(page, 'T1, Valor')).toBeFocused();
  for (const value of ['150', '160', '170', '180', '190', '200', '100', '110', '120']) await typeAndEnter(page, value);
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible();

  // Readings complete, the pair unset: the Conclusão step, its first Resultado radio.
  await concluir();
  await expect(stepper(page).getByRole('button', { name: /^Conclusão,/ })).toHaveAttribute('aria-current', 'step');
  await expect(resultGroup(page).getByRole('radio').first()).toBeFocused();

  // Com restrições with no observation: the observation field.
  await resultGroup(page).getByRole('radio', { name: 'Aprovado' }).click();
  await restrictionGroup(page).getByRole('radio', { name: 'Com restrições' }).click();
  await concluir();
  await expect(page.getByLabel('Observações da ficha')).toBeFocused();
  expect((await outbox(page)).some((row) => row.path === `block/${blockId}/concluded_by`)).toBe(false);
});

test('@p0 5.3-E2E-002 carry-over: "3.3", a pause, "00" in a nameplate number reads 3.300 while focused, after the blur and after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  await page.getByRole('button', { name: 'Digitar' }).click();
  const corrente = page.getByLabel('CORRENTE NOMINAL', { exact: true });
  await corrente.click();
  await corrente.pressSequentially('3.3');
  await page.waitForTimeout(1000);
  await corrente.pressSequentially('00');
  await expect(corrente).toHaveValue('3.300');
  await expect(field(page, 'corrente_nominal').locator('.mf-echo')).toHaveText('= 3.300 kA');
  await corrente.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/nameplate/corrente_nominal`).map((row) => row.value)).toEqual([
    { raw: '3300', unit: 'kA', state: 'measured' },
  ]);
  await expect(corrente).toHaveValue('3.300');
  await page.reload();
  await expect(page.getByLabel('CORRENTE NOMINAL', { exact: true })).toHaveValue('3.300');
});

test('@p1 5.5-E2E-002 phone 390: the TTR stacks into cards, the plain tables stay tables, the M · G · T chips set the unit; Shift+Enter goes back; Delete clears a conclusion pair', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 390);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'TP'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  expect(await horizontalOverflow(page)).toBe(0);
  await expect(page.locator('table.ficha-ttr')).toBeHidden();
  await expect(page.locator('.measurement-cards .measurement-card')).toHaveCount(3);
  await expect(page.locator('section[data-test-key="isolacao"] table.measurement-table')).toBeVisible();
  await expect(cellInput(page, 'Fase R, V primário')).toBeVisible();

  const faseS = cellInput(page, 'Fase S, 1 minuto');
  await faseS.click();
  const chips = page.getByRole('group', { name: 'Unidade' });
  await expect(chips).toBeVisible();
  await chips.getByRole('button', { name: 'teraohms' }).click();
  await expect(faseS).toBeFocused();
  await page.keyboard.type('2');
  await expect(cellBox(page, 'isolacao:1:1').locator('.mf-echo')).toHaveText('= 2 TΩ');
  await page.keyboard.press('Shift+Enter');
  await expect(cellInput(page, 'Fase R, 1 minuto')).toBeFocused();
  await expect(cellBox(page, 'isolacao:1:1').locator('.unit-cycle')).toHaveAccessibleName('teraohms, toque para alternar');

  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const aprovado = resultGroup(page).getByRole('radio', { name: 'Aprovado' });
  await aprovado.click();
  await expect(aprovado).toHaveAttribute('aria-checked', 'true');
  await aprovado.press('Delete');
  await expect(resultGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
});

test('@p0 5.9-E2E-001 "Marcar não ensaiado" from the sheet header: reason chips, "Outro" reveals text, toast, band, chip in the title, read-only nameplate/checklist, no bulk mirror; unsynced Desfazer clears it at once', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));

  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Descreva o motivo')).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Outro' }).click();
  const textField = dialog.getByLabel('Descreva o motivo');
  await expect(textField).toBeVisible();
  await textField.fill('Equipamento inacessível na visita');
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();

  await expect(toast(page)).toContainText('Marcada como não ensaiada — entra na seção 8');
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveText('Não ensaiado');
  await expect(page.locator('.not-tested-band .band-reason')).toHaveText('Equipamento inacessível na visita');
  await expect(page.getByTestId('ficha-progress')).toHaveText('Completa');
  expect((await outbox(page)).find((row) => row.path === `block/${blockId}/not_tested`)).toMatchObject({
    value: { reason: 'outro', text: 'Equipamento inacessível na visita' },
  });

  // "Concluir ficha" leaves the header Overflow once the sheet is not tested.
  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Concluir ficha' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Nameplate: read-only fields, no "Digitar" text link.
  await expect(page.getByRole('button', { name: 'Digitar' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: PARA_RAIO.nameplate[0]!.label })).toHaveAttribute('aria-readonly', 'true');

  // Checklist: no bulk bar, the tri-state radiogroups read-only (E5-Q10: `aria-readonly`,
  // never `aria-disabled`), the Overflow trigger hidden.
  await expect(page.locator('#ficha-step-verificacoes .bulk-action-bar')).toHaveCount(0);
  const groups = page.locator('#ficha-step-verificacoes li.checklist-row [role="radiogroup"]');
  await expect(groups).toHaveCount(PARA_RAIO.checklist!.length);
  for (const group of await groups.all()) {
    await expect(group).toHaveAttribute('aria-readonly', 'true');
    await expect(group).not.toHaveAttribute('aria-disabled');
  }
  await expect(checklistRow(page, 1).locator('.overflow-trigger')).toBeHidden();
  await expect(page.locator('.sticky-action-bar .bulk-action-bar')).toHaveCount(0);

  // "Desfazer" on a not-yet-synced mark clears it at once, no dialog (this device wrote
  // it this session and the relatório has never synced -- everything here is offline).
  await page.locator('.not-tested-band').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.not-tested-band')).toHaveCount(0);
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveCount(0);
  expect((await outbox(page)).filter((row) => row.path === `block/${blockId}/not_tested`).at(-1)?.value).toBeNull();
});

test('@p0 5.9-E2E-004 a Não ensaiada sheet: readings, instrument and conclusion read-only, no suggestion or Confirmar; the sheet Observation stays editable', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));

  // A reading and a result before the mark, so the read-only state has values to show.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await cellInput(page, 'T1, Valor').click();
  await typeAndEnter(page, '3.300');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await resultGroup(page).getByRole('radio', { name: 'Aprovado' }).click();
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: `Mais opções da ficha ${tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(page.locator('.not-tested-band')).toBeVisible();
  const readingAndConclusionOps = async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}/conclusion/`) || row.path.startsWith(`sheet/${blockId}/test/`)).length;
  const opsBefore = await readingAndConclusionOps();

  // Ensaios: the cell is a read-only textbox with its value, no input, unit cycle or Overflow.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const isoSection = page.locator('section[data-test-key="isolacao"]');
  await expect(isoSection).toHaveClass(/is-readonly/);
  await expect(isoSection.locator('.section-head .btn-reason')).toHaveText('Somente leitura — equipamento não ensaiado');
  const t1 = cellBox(page, 'isolacao:0:0');
  await expect(t1.getByRole('textbox', { name: 'T1, Valor' })).toHaveAttribute('aria-readonly', 'true');
  await expect(t1.getByRole('textbox', { name: 'T1, Valor' })).toContainText('3.300');
  await expect(t1.locator('input')).toHaveCount(0);
  await expect(t1.locator('.unit-cycle')).toHaveCount(0);
  await expect(t1.locator('.overflow-trigger')).toHaveCount(0);
  await expect(page.locator('#ficha-step-ensaios input[data-cell-input]')).toHaveCount(0);

  // The Instrument picker: a read-only textbox, no button, and a tap opens nothing.
  await expect(isoSection.getByRole('button', { name: /^Instrumento/ })).toHaveCount(0);
  const picker = isoSection.getByRole('textbox', { name: /^Instrumento/ });
  await expect(picker).toHaveAttribute('aria-readonly', 'true');
  await picker.click();
  await expect(isoSection.locator('.combobox-list')).toHaveCount(0);

  // Conclusão: both radiogroups read-only, a tap and Delete change nothing; no suggestion row, no Confirmar/Editar.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(resultGroup(page)).toHaveAttribute('aria-readonly', 'true');
  await expect(restrictionGroup(page)).toHaveAttribute('aria-readonly', 'true');
  await resultGroup(page).getByRole('radio', { name: 'Reprovado' }).click();
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
  await expect(resultGroup(page).getByRole('radio', { name: 'Reprovado' })).toHaveAttribute('aria-checked', 'false');
  await resultGroup(page).getByRole('radio', { name: 'Aprovado' }).press('Delete');
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
  await restrictionGroup(page).getByRole('radio', { name: 'Com restrições' }).click();
  await expect(restrictionGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Sugestão' })).toHaveCount(0);
  const generated = page.locator('.suggestion-field.is-generated');
  await expect(generated.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveAttribute('aria-readonly', 'true');
  await expect(generated.getByRole('button')).toHaveCount(0);
  expect(await readingAndConclusionOps()).toBe(opsBefore);

  // The sheet Observation stays editable: typed, blurred, the op lands in the outbox.
  const observation = page.getByRole('textbox', { name: 'Observações da ficha' });
  await expect(observation).not.toHaveAttribute('aria-readonly', 'true');
  await observation.fill('Acesso bloqueado pelo cliente');
  await observation.blur();
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/observations`).at(-1)?.value).toBe('Acesso bloqueado pelo cliente');
});

test('@p1 5.9-E2E-002 "Desfazer" once the mark has synced opens a Confirm dialog; only confirming clears it', async ({ page }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Disjuntor MT'));

  await checklistRow(page, 1).getByRole('radio', { name: 'Conforme', exact: true }).click();
  await page.getByRole('button', { name: /^Mais opções da ficha/ }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(page.locator('.not-tested-band')).toBeVisible();
  await syncNow(page);

  const band = page.locator('.not-tested-band');
  await band.getByRole('button', { name: 'Desfazer' }).click();
  const confirm = page.getByRole('dialog', { name: 'Desfazer "Marcar não ensaiado"?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirm).toBeHidden();
  await expect(band).toBeVisible();

  await band.getByRole('button', { name: 'Desfazer' }).click();
  await confirm.getByRole('button', { name: 'Desfazer' }).click();
  await expect(band).toHaveCount(0);
  expect((await outbox(page)).filter((row) => row.path === `block/${blockId}/not_tested`).at(-1)?.value).toBeNull();
});

test('@p0 5.4-E2E-002 "Repetir da ficha anterior do mesmo tipo" writes only the target unset rows, leaving an already-answered row untouched', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await openEnel(page);
  const items = PARA_RAIO.checklist!;
  const source = await rowIds(rowOfType(page, 'Para-raio', 0));
  const target = await rowIds(rowOfType(page, 'Para-raio', 1));
  const scope = { relatorioId };
  const drafts: OpDraft[] = [
    ...items.map((item) => officeDraft(account, scope, `sheet/${source.blockId}/checklist/${item.key}/result`, 'C')),
    officeDraft(account, scope, `block/${source.blockId}/concluded_by`, { actor_id: account.userId, at: new Date().toISOString() }),
    // The target already answered its first item, differently from the source: "Repetir" must leave it as is.
    officeDraft(account, scope, `sheet/${target.blockId}/checklist/${items[0]!.key}/result`, 'NC'),
  ];
  await pushDrafts(page, database, drafts);
  await syncNow(page);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Para-raio', 1));

  const bulk = page.locator('#ficha-step-verificacoes .bulk-action-bar');
  await bulk.getByRole('button', { name: 'Repetir da ficha anterior do mesmo tipo' }).click();
  await expect(toast(page)).toContainText(`Padrão de ${source.tag} repetido`);
  await expect(checklistRow(page, 1).getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
  await expect(checklistRow(page, 2).getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  const written = (await outbox(page)).filter((row) => row.path === `sheet/${target.blockId}/checklist/${items[0]!.key}/result`);
  expect(written.every((row) => row.value === 'NC')).toBe(true);
  expect((await outbox(page)).find((row) => row.path === `sheet/${target.blockId}/checklist/${items[1]!.key}/result`)?.value).toBe('C');
});

// --- Epic 5 integrated review fixes (E5-Q2, Q8, Q9, Q17, Q18) ---------------------------------

test('@p1 E5-Q2 phone 390 x 844: the insulation value input, its unit slot and its cell Overflow sit inside the viewport', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 390);
  await page.setViewportSize({ width: 390, height: 844 });
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'TP'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const input = cellInput(page, 'Fase R, 1 minuto');
  await input.scrollIntoViewIfNeeded();
  const cell = cellBox(page, 'isolacao:0:1');
  for (const part of [input, cell.locator('.unit-cycle'), cell.locator('.overflow-trigger')]) {
    await expect(part).toBeVisible();
    const box = (await part.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  expect(await horizontalOverflow(page)).toBe(0);
});

test('@p1 E5-Q8 Space, ArrowRight and Delete in quick succession always leave the checklist row unset', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Para-raio'));
  const row = checklistRow(page, 1);
  const path = `sheet/${blockId}/checklist/${PARA_RAIO.checklist![0]!.key}/result`;
  for (let round = 0; round < 3; round++) {
    await row.getByRole('radio', { name: 'Conforme', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await expect(row.locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);
    await expect.poll(async () => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value).toBeNull();
  }
  // Still unset once every op has landed.
  await page.reload();
  await expect(checklistRow(page, 1).getByRole('radiogroup')).toBeVisible({ timeout: 30_000 });
  await expect(checklistRow(page, 1).locator('[role="radio"][aria-checked="true"]')).toHaveCount(0);

  // The same fast sequence on the Conclusão result group.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const resultPath = `sheet/${blockId}/conclusion/result`;
  for (let round = 0; round < 3; round++) {
    await resultGroup(page).getByRole('radio', { name: 'Aprovado' }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await expect(resultGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
    await expect.poll(async () => (await outbox(page)).filter((op) => op.path === resultPath).at(-1)?.value).toBeNull();
  }
});

test('@p1 E5-Q17 the sheet Overflow "Limpar conclusão" clears both groups in one edit', async ({ page }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId, tag } = await openSheet(page, rowOfType(page, 'Para-raio'));
  const menu = page.getByRole('button', { name: `Mais opções da ficha ${tag}` });
  // Nothing set: no entry.
  await menu.click();
  await expect(page.getByRole('menuitem', { name: 'Limpar conclusão' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await resultGroup(page).getByRole('radio', { name: 'Aprovado' }).click();
  await restrictionGroup(page).getByRole('radio', { name: 'Sem restrições' }).click();
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');

  await menu.click();
  await page.getByRole('menuitem', { name: 'Limpar conclusão' }).click();
  await expect(resultGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
  await expect(restrictionGroup(page).locator('[aria-checked="true"]')).toHaveCount(0);
  const last = async (field: string) => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/conclusion/${field}`).at(-1);
  await expect.poll(async () => (await last('result'))?.value).toBeNull();
  await expect.poll(async () => (await last('restriction'))?.value).toBeNull();
  // One edit: the two clears share a batch.
  const [result, restriction] = [await last('result'), await last('restriction')];
  expect(result?.batch_id).not.toBeNull();
  expect(result?.batch_id).toBe(restriction?.batch_id);
  // Undoable like any other edit.
  await expect(toast(page)).toContainText('Conclusão limpa');
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(resultGroup(page).getByRole('radio', { name: 'Aprovado' })).toHaveAttribute('aria-checked', 'true');
  await expect(restrictionGroup(page).getByRole('radio', { name: 'Sem restrições' })).toHaveAttribute('aria-checked', 'true');
});

test('@p0 E5-Q18a a typed, uncommitted reading survives a dead tab as "Rascunho encontrado — Recuperar"', async ({ page, context }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const t1 = cellInput(page, 'T1, Valor');
  await t1.click();
  await page.keyboard.type('3.300');
  // The tab goes away mid-typing, before Enter or a blur commits the reading.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await readStore<{ value: unknown }>(page, database, 'drafts')).map((row) => row.value)).toContain('3.300');
  expect((await outbox(page)).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/0/0`)).toEqual([]);
  const url = page.url();
  await page.close();

  const reopened = await context.newPage();
  await reopened.setViewportSize({ width: 1280, height: 900 });
  await reopened.goto(url);
  await expect(reopened.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(reopened).getByRole('button', { name: /^Ensaios,/ }).click();
  const offer = reopened.getByTestId('toast');
  await expect(offer).toContainText('Rascunho encontrado');
  await offer.getByRole('button', { name: 'Recuperar' }).click();
  const recovered = cellInput(reopened, 'T1, Valor');
  await expect(recovered).toHaveValue('3.300');
  await recovered.click();
  await reopened.keyboard.press('Enter');
  await expect
    .poll(async () => (await readStore<OutboxRow>(reopened, database, 'outbox')).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/0/0`).at(-1)?.value)
    .toEqual({ raw: '3300', unit: 'GΩ', state: 'measured' });
});

test('@p1 E5-Q18d offline, "Cadastrar instrumento" opens Cadastros; the instrument created there is picked back on the sheet', async ({ page, context }) => {
  test.setTimeout(150_000);
  await openRelatorio(page, 1280);
  await openEnel(page);
  const { blockId } = await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await context.setOffline(true);
  try {
    const isoSection = page.locator('section[data-test-key="isolacao"]');
    await isoSection.getByRole('button', { name: /^Instrumento/ }).click();
    await isoSection.getByRole('button', { name: 'Cadastrar instrumento' }).click();
    await expect(page).toHaveURL(/\/cadastros/);
    await page.getByRole('tab', { name: 'Instrumentos' }).click();
    await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
    const panel = page.locator('.registry-panel');
    await expect(panel).toBeVisible();
    await panel.getByLabel('Código').fill('N1');
    await panel.getByLabel('Nome').fill('Megôhmetro offline');
    await panel.getByRole('button', { name: 'Fechar edição' }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole('button', { name: /N1/ })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
    await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
    await isoSection.getByRole('button', { name: /^Instrumento/ }).click();
    await isoSection.getByRole('radiogroup', { name: 'Instrumentos cadastrados' }).getByRole('radio', { name: /^N1/ }).click();
    await expect(isoSection.getByRole('button', { name: 'Instrumento N1 — Megôhmetro offline' })).toBeVisible();
    await expect
      .poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${blockId}/test/isolacao/instrument`).map((row) => (row.value as { code?: string }).code))
      .toEqual(['N1']);
    expect((await outbox(page)).some((row) => row.path.startsWith('registry/instrument/'))).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});

test('@p1 E5-Q9 the expired calibration line under a picked instrument is drawn in fora-do-limite', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 1280);
  await pushDrafts(page, database, [
    instrumentDraft(newId(), { code: '5A', name: 'Megôhmetro MIT525', manufacturer: 'Megger', model: 'MIT525', serial: '1002211', cert_number: '35110/24', calibrated_at: '2025-02-02', calibration_interval_months: 12 }),
  ]);
  await syncNow(page);
  await page.goto(`/relatorio/${relatorioId}`);
  await openEnel(page);
  await openSheet(page, rowOfType(page, 'Chave seccionadora'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const isoSection = page.locator('section[data-test-key="isolacao"]');
  await isoSection.getByRole('button', { name: /^Instrumento/ }).click();
  await isoSection.getByRole('radio', { name: /^5A/ }).click();
  const expired = isoSection.locator('.instrument-picker p.ip-expired');
  await expect(expired).toHaveText('Calibração vencida em 02/02/2026');
  const [color, expected] = await expired.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--fora-do-limite)';
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(element).color, want];
  });
  expect(color).toBe(expected);
});
