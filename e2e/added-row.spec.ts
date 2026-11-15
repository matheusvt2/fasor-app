import { addedRowNameLabel, addedRowRemoveLabel, addedRowRemovedText, derivedParecer, getDefinition, parecerVerdictLabel, section9Layout, type BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceSnapshot, kernelOf, openStep, outbox, outboxValues, setUpRelatorio, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeRows } from './support/palette.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 25.14-E2E-001 and 25.16-E2E-001 (batch e25s, Stories 25.14 and 25.16, seed v16; M23, M30; Bruno's answer 6): a row
 * the technician adds in the field, walked as a person taps it on the first sheet that takes one, the v16 Malha de
 * aterramento's continuity test, at a tablet viewport (768 x 1024). The Malha is added from the local's field palette
 * (at 1024 px, as `ground-grid.spec.ts` adds it: the field rows `.pf-field` show below 1280 px), then the sheet is worked
 * at 768 px.
 * - 25.14-E2E-001: "Adicionar ponto" adds a row whose name field takes the focus; it is named and filled; a second
 *   row is added, named, filled and renamed; a name the other row has is refused with its helper; the first row is
 *   removed (one toast, "Desfazer") and "Desfazer" brings it back with its reading; the two rows reach a second
 *   session of the same account through the sync, with their names and readings.
 * - 25.16-E2E-001: the five rows stay as they are, with the action under them and none under the grid's resistance;
 *   a point at 0,3 Ω is within and one at 0,8 Ω is out (the floor Reprovado); the conclusion confirmed names the point
 *   out, and the issued DOCX prints the two points after the five, with the criterion and their results.
 * Every expected word is the kernel's over the device's own rows. It issues a revision through the api's one queue
 * and LibreOffice, so it runs in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TYPE = 'malha_aterramento';
const VERSION = 'v16';
const DEFINITION = getDefinition(VERSION, 'cabine_primaria', TYPE);
const TEST = 'continuidade_malha';
const KEY = DEFINITION.measurement_tests!.find((one) => one.key === TEST)!.added_rows!;
const FIVE = DEFINITION.measurement_tests!.find((one) => one.key === TEST)!.rows.map((row) => row.label);
const LOCAL = 'Geradores';
const TABLET = { width: 768, height: 1024 };
const measured = (raw: string) => ({ raw, unit: 'Ω', state: 'measured' });

const rowPath = (blockId: string, rowId: string, field: 'name' | 'removed_at') => `sheet/${blockId}/test/${TEST}/row/${rowId}/${field}`;
const rowCellPath = (blockId: string, rowId: string) => `sheet/${blockId}/test/${TEST}/row/${rowId}/cell/0`;
/** An added row's name field, as the page shows it (a table that stacks on phone draws it twice). */
const nameField = (page: Page, rowId: string): Locator => page.locator(`input[data-added-name="${rowId}"]`).filter({ visible: true });
/** An added row's reading. */
const addedCell = (page: Page, rowId: string): Locator => testSection(page, TEST).locator(`.ficha-cell[data-cell="${TEST}:+${rowId}:0"]`).filter({ visible: true });
const addAction = (page: Page) => testSection(page, TEST).getByRole('button', { name: KEY.label, exact: true });
const addedRows = (page: Page) => testSection(page, TEST).locator('tr[data-added-row]').filter({ visible: true });

/** A v16 relatório with a Malha de aterramento added at the local Geradores, its sheet open on Ensaios at 768 px. */
async function malhaSheet(page: Page): Promise<{ relatorioId: string; blockId: string; tag: string }> {
  const { relatorioId } = await setUpRelatorio(page, account, database, () => [], VERSION);
  // The field palette's rows (`.pf-field`) are drawn below 1280 px; at 1280 the office rows stand in their place.
  await page.setViewportSize({ width: 1024, height: 900 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const row = typeRows(palette, [TYPE]);
  const tag = (await row.locator('.pi-meta').innerText()).trim().split(' · ').at(-1)!;
  await row.click();
  await expect(palette).toBeHidden();
  const isCreate = (op: { kind: string; path: string; value: unknown }) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === TYPE;
  await expect.poll(async () => (await outbox(database, page)).filter(isCreate).length).toBe(1);
  const create = (await outbox(database, page)).find(isCreate)!;
  expect(create.value).toMatchObject({ block_type: TYPE, seed_version: VERSION, relatorio_id: relatorioId });
  const blockId = (create.value as BlockRow).id;
  await page.setViewportSize(TABLET);
  await openStep(page, relatorioId, blockId, 'Ensaios');
  await expect(testSection(page, TEST)).toBeVisible();
  return { relatorioId, blockId, tag };
}

/** Taps "Adicionar ponto" and returns the new row's id, read from the put of its (still empty) name. */
async function addPoint(page: Page, blockId: string): Promise<string> {
  const isName = (op: { path: string }) => op.path.startsWith(`sheet/${blockId}/test/${TEST}/row/`) && op.path.endsWith('/name');
  const before = new Set((await outbox(database, page)).filter(isName).map((op) => op.path));
  await addAction(page).click();
  await expect.poll(async () => (await outbox(database, page)).filter((op) => isName(op) && !before.has(op.path)).length).toBe(1);
  const created = (await outbox(database, page)).find((op) => isName(op) && !before.has(op.path))!;
  expect(created.value).toBeNull();
  return created.path.split('/').at(-2)!;
}

/** Types an added row's name and leaves it with Enter, as a person does, and waits for its put. */
async function nameRow(page: Page, blockId: string, rowId: string, name: string): Promise<void> {
  const input = nameField(page, rowId);
  await input.fill(name);
  await input.press('Enter');
  await expect.poll(async () => (await outboxValues(database, page, rowPath(blockId, rowId, 'name'))).at(-1)).toBe(name);
}

/** Types an added row's reading (click, type, Enter) and waits for its put. */
async function fillRow(page: Page, blockId: string, rowId: string, text: string, raw: string): Promise<void> {
  const input = addedCell(page, rowId).locator('input.mf-value');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  await expect.poll(async () => (await outboxValues(database, page, rowCellPath(blockId, rowId))).at(-1)).toEqual(measured(raw));
}

/** The added rows of the continuity test as the kernel reads the device's rows: `[id, name, raw, verdict]`. */
async function addedOf(page: Page, db: string, relatorioId: string, blockId: string) {
  const kernel = await kernelOf(page, db, relatorioId, blockId);
  return kernel.measurement(TEST).rows.filter((row) => row.added !== undefined).map((row) => [row.added!.id, row.label, row.cells[0]!.raw, row.cells[0]!.verdict]);
}

test('@p0 25.14-E2E-001 at 768: "Adicionar ponto" adds a row that is named, filled and renamed; a second row; a taken name refused; removed with "Desfazer" and back with its reading; both rows reach a second session', async ({ page, browser }) => {
  test.setTimeout(420_000);
  const { relatorioId, blockId } = await malhaSheet(page);

  // --- the first row: added, its name field focused, named and filled ---
  await expect(addedRows(page)).toHaveCount(0);
  const first = await addPoint(page, blockId);
  await expect(nameField(page, first)).toBeFocused();
  await expect(testSection(page, TEST).getByLabel(addedRowNameLabel(KEY), { exact: true }).filter({ visible: true })).toHaveCount(1);
  await nameRow(page, blockId, first, 'Cerca metálica');
  await fillRow(page, blockId, first, '0,3', '0.3');
  expect(await addedOf(page, database, relatorioId, blockId)).toEqual([[first, 'Cerca metálica', '0.3', 'within']]);

  // --- the second row: added after the first, named, filled, renamed ---
  const second = await addPoint(page, blockId);
  await expect(nameField(page, second)).toBeFocused();
  await nameRow(page, blockId, second, 'Estrutura metálica');
  await fillRow(page, blockId, second, '0,2', '0.2');
  await nameRow(page, blockId, second, 'Estrutura do portão');
  await expect(testSection(page, TEST).getByRole('button', { name: addedRowRemoveLabel(KEY, 'Estrutura do portão'), exact: true }).filter({ visible: true })).toBeVisible();
  expect(await addedOf(page, database, relatorioId, blockId)).toEqual([
    [first, 'Cerca metálica', '0.3', 'within'],
    [second, 'Estrutura do portão', '0.2', 'within'],
  ]);
  await expect(addedRows(page)).toHaveCount(2);
  // The rows show after the five, in the order they were added.
  const shown = await testSection(page, TEST).locator('tbody tr').filter({ visible: true }).evaluateAll((rows) => rows.map((row) => (row.querySelector('input[data-added-name]') as HTMLInputElement | null)?.value ?? row.querySelector('td')?.textContent?.trim()));
  expect(shown).toEqual([...FIVE, 'Cerca metálica', 'Estrutura do portão']);

  // --- a name the other row has is refused on this device, with its helper; nothing is written ---
  const puts = (await outboxValues(database, page, rowPath(blockId, second, 'name'))).length;
  const secondName = nameField(page, second);
  await secondName.fill('Cerca metálica');
  await secondName.press('Enter');
  await expect(secondName).toHaveAttribute('aria-invalid', 'true');
  await expect(testSection(page, TEST).locator('.e25-added .helper').filter({ visible: true })).toHaveText('Outra linha desta tabela já tem este nome.');
  expect((await outboxValues(database, page, rowPath(blockId, second, 'name'))).length).toBe(puts);
  await secondName.fill('Estrutura do portão');
  await secondName.press('Enter');
  await expect(testSection(page, TEST).locator('.e25-added .helper').filter({ visible: true })).toHaveCount(0);

  // --- the first row removed: one toast and "Desfazer"; "Desfazer" brings it back with its reading ---
  await testSection(page, TEST).getByRole('button', { name: addedRowRemoveLabel(KEY, 'Cerca metálica'), exact: true }).filter({ visible: true }).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText(addedRowRemovedText(KEY, 'Cerca metálica'));
  await expect(addedRows(page)).toHaveCount(1);
  await expect.poll(async () => (await outbox(database, page)).some((op) => op.path === rowPath(blockId, first, 'removed_at'))).toBe(true);
  expect(await addedOf(page, database, relatorioId, blockId)).toEqual([[second, 'Estrutura do portão', '0.2', 'within']]);
  await toast.getByRole('button', { name: 'Desfazer' }).click();
  await expect(addedRows(page)).toHaveCount(2);
  await expect(nameField(page, first)).toHaveValue('Cerca metálica');
  await expect(addedCell(page, first).locator('input.mf-value')).toHaveValue('0,3');
  expect(await addedOf(page, database, relatorioId, blockId)).toEqual([
    [first, 'Cerca metálica', '0.3', 'within'],
    [second, 'Estrutura do portão', '0.2', 'within'],
  ]);

  // --- the sync: a second session of the same account holds both rows, with their names and readings ---
  await syncNowAndReturn(page);
  const otherContext = await browser.newContext({ viewport: TABLET });
  try {
    const other = await otherContext.newPage();
    await signIn(other, account.email);
    await other.goto(`/relatorio/${relatorioId}`);
    await expect(other.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
    await syncNowAndReturn(other);
    await openStep(other, relatorioId, blockId, 'Ensaios');
    await expect(addedRows(other)).toHaveCount(2);
    await expect(nameField(other, first)).toHaveValue('Cerca metálica');
    await expect(nameField(other, second)).toHaveValue('Estrutura do portão');
    await expect(addedCell(other, first).locator('input.mf-value')).toHaveValue('0,3');
    await expect(addedCell(other, second).locator('input.mf-value')).toHaveValue('0,2');
    expect(await addedOf(other, database, relatorioId, blockId)).toEqual([
      [first, 'Cerca metálica', '0.3', 'within'],
      [second, 'Estrutura do portão', '0.2', 'within'],
    ]);
  } finally {
    await otherContext.close();
  }
});

test('@p0 25.16-E2E-001 at 768: the v16 Malha keeps its five rows with "Adicionar ponto" under them; a point at 0,8 Ω fails the sheet, the conclusion names it and the DOCX prints both points after the five', async ({ page }) => {
  test.setTimeout(420_000);
  const { relatorioId, blockId, tag } = await malhaSheet(page);

  // --- the five rows, as on v15, with the action under them; the grid's resistance takes none ---
  const shownFive = await testSection(page, TEST).locator('tbody tr').filter({ visible: true }).evaluateAll((rows) => rows.map((row) => row.querySelector('td')?.textContent?.trim()));
  expect(shownFive).toEqual(FIVE);
  expect(FIVE).toEqual(getDefinition('v15', 'cabine_primaria', TYPE).measurement_tests!.find((one) => one.key === TEST)!.rows.map((row) => row.label));
  await expect(addAction(page)).toBeVisible();
  await expect(testSection(page, 'resistencia_malha').getByRole('button', { name: KEY.label })).toHaveCount(0);

  // --- two points: within, then out of "≤ 0,5 Ω entre pontos" ---
  const fence = await addPoint(page, blockId);
  await nameRow(page, blockId, fence, 'Cerca metálica');
  await fillRow(page, blockId, fence, '0,3', '0.3');
  const gate = await addPoint(page, blockId);
  await nameRow(page, blockId, gate, 'Estrutura do portão');
  await fillRow(page, blockId, gate, '0,8', '0.8');
  const kernel = await kernelOf(page, database, relatorioId, blockId);
  const out = kernel.measurement(TEST).rows.find((row) => row.added?.id === gate)!.cells[0]!;
  expect(out.verdict).toBe('out');
  await expect(addedCell(page, gate).locator('.mf-helper[role="status"]')).toContainText(out.helperText!);
  expect(kernel.floorReason).not.toBeNull();

  // --- the conclusion: its floor Reprovado, confirmed; its text names the point out ---
  await openStep(page, relatorioId, blockId, 'Conclusão');
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Reprovado');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/conclusion/result`)).at(-1)).toBe('reprovado');
  await expect(page.locator('.ficha-conc-text')).toContainText('Estrutura do portão');

  // --- the DOCX: the five rows, then the two points with the criterion and their results ---
  const verdict = derivedParecer(await deviceSnapshot(page, database, relatorioId));
  await setParecer(page, relatorioId, (verdict === null ? 'Apto' : parecerVerdictLabel(verdict)) as Parameters<typeof setParecer>[2]);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  expect(structure.paragraphs).toContain(`${DEFINITION.label.toLocaleUpperCase('pt-BR')} ${tag}`);
  const clean = (text: string) => text.replaceAll(' ', ' ');
  const tables = structure.tables.filter((table) => clean(table[0]?.[0] ?? '').includes('CONTINUIDADE E EQUIPOTENCIALIZAÇÃO'));
  expect(tables, JSON.stringify(structure.tables.map((table) => table[0]?.[0]))).toHaveLength(1);
  const rows = tables[0]!.map((cells) => cells.map(clean));
  // The rows as the kernel lays them out over the device's rows (the five optional rows were left empty).
  const printed = section9Layout(await deviceSnapshot(page, database, relatorioId), 9, 'RESULTADOS')!
    .subsections.flatMap((sub) => sub.sheets)
    .find((sheet) => sheet.blockId === blockId)!
    .parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []))
    .find((table) => clean(table.rows[0]!.cells[0]!.text).includes('CONTINUIDADE E EQUIPOTENCIALIZAÇÃO'))!;
  expect(rows.map((cells) => cells[0])).toEqual(printed.rows.map((row) => clean(row.cells[0]!.text)));
  expect(rows.map((cells) => cells[0]).slice(-2)).toEqual(['CERCA METÁLICA', 'ESTRUTURA DO PORTÃO']);
  expect(rows.find((cells) => cells[0] === 'CERCA METÁLICA')!.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'SATISFATÓRIO']);
  expect(rows.find((cells) => cells[0] === 'ESTRUTURA DO PORTÃO')!.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'INSATISFATÓRIO']);
  // The sheet's conclusion paragraph names the point out.
  const title = structure.paragraphs.indexOf(`${DEFINITION.label.toLocaleUpperCase('pt-BR')} ${tag}`);
  expect(structure.paragraphs.slice(title).some((paragraph) => paragraph.includes('Estrutura do portão'))).toBe(true);
});
