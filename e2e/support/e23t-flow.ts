import {
  buildSnapshot,
  conclusionFloorReasonText,
  entityKey,
  evaluateSheetMeasurements,
  evaluateTest,
  getDefinition,
  section9Layout,
  visitContextOf,
  type BlockRow,
  type Entity,
  type EntityRow,
  type MeasurementTestEvaluation,
  type OpDraft,
  type RelatorioSnapshot,
  type TestEvaluation,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './dialogs.ts';
import { expect, signIn, type SeedAccount } from './merged-fixtures.ts';
import { readStore } from './outbox.ts';
import { confirmIssue, setParecer } from './relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './relatorio-seed.ts';
import { resetEmpresaB } from './reset-empresa-b.ts';

/*
 * Batch e23t (Stories 23.15 to 23.17 and 23.19, seed v13): the steps the four e23t specs share, every
 * expected word read from the kernel over the device's own rows (E12-A6): a new v13 relatório with
 * the office's plate values, the sheet's steps, a typed reading, the outbox, the kernel's evaluation
 * under the sheet's visit context, and the issued DOCX's tables.
 */

export interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}

export const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
export const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
export const outbox = (database: string, page: Page) => readStore<OutboxRow>(page, database, 'outbox');
export const outboxValues = async (database: string, page: Page, path: string) => (await outbox(database, page)).filter((row) => row.path === path).map((row) => row.value);
export const testSection = (page: Page, testKey: string) => page.locator(`section[data-test-key="${testKey}"]`);
export const cellOf = (page: Page, testKey: string, row: number, col: number): Locator =>
  testSection(page, testKey).locator(`.ficha-cell[data-cell="${testKey}:${row}:${col}"]`).filter({ visible: true });
export const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

/** A new v13 relatório of the standard template, em campo, with the office's plate writes on its sheets. */
export async function setUpRelatorio(
  page: Page,
  account: SeedAccount,
  database: string,
  plates: (sheets: readonly SeededSheet[]) => { blockType: string; key: string; value: unknown }[] = () => [],
): Promise<{ relatorioId: string; sheets: SeededSheet[] }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const writes: OpDraft[] = plates(built.sheets).map(({ blockType, key, value }) => {
    const sheet = built.sheets.find((one) => one.blockType === blockType)!;
    return officeDraft(account, scope, `sheet/${sheet.blockId}/nameplate/${key}`, value);
  });
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...writes]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  return { relatorioId: built.relatorioId, sheets: built.sheets };
}

export async function openStep(page: Page, relatorioId: string, blockId: string, step: 'Ensaios' | 'Conclusão' | 'Placa'): Promise<void> {
  if (!page.url().endsWith(`/ficha/${blockId}`)) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  }
  await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).click();
}

/** Types one reading into a cell as a person does (click, type, Enter) and waits for its put in the outbox. */
export async function typeCell(page: Page, database: string, blockId: string, testKey: string, row: number, col: number, text: string): Promise<void> {
  const before = (await outboxValues(database, page, `sheet/${blockId}/test/${testKey}/cell/${row}/${col}`)).length;
  const input = cellOf(page, testKey, row, col).locator('input.mf-value');
  await input.click();
  await input.fill(text);
  await input.press('Enter');
  await expect.poll(async () => (await outboxValues(database, page, `sheet/${blockId}/test/${testKey}/cell/${row}/${col}`)).length).toBeGreaterThan(before);
}

/** The relatório as this device holds it. */
export async function deviceSnapshot(page: Page, database: string, relatorioId: string): Promise<RelatorioSnapshot> {
  const records = await readStore<{ entity: string; id: string; row: unknown }>(page, database, 'entities');
  return buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as EntityRow])), relatorioId);
}

/** The kernel over the device's rows: the block, its measurement tests and one seeded test, under its visit context; the floor's reason line. */
export async function kernelOf(
  page: Page,
  database: string,
  relatorioId: string,
  blockId: string,
): Promise<{ block: BlockRow; snapshot: RelatorioSnapshot; measurement: (key: string) => MeasurementTestEvaluation; test: (key: string) => TestEvaluation; floorReason: string | null }> {
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  const visit = visitContextOf(snapshot, block);
  const measurements = evaluateSheetMeasurements(block, definition, visit);
  return {
    block,
    snapshot,
    measurement: (key) => measurements.find((one) => one.testKey === key)!,
    test: (key) => evaluateTest(block, definition, definition.tests.find((one) => one.key === key)!, visit),
    floorReason: conclusionFloorReasonText(block, definition, visit),
  };
}

/** Issues revision 1 from the Sumário and returns the tables of its DOCX, each a list of rows of cell texts. */
export async function issueAndReadTables(page: Page, database: string, relatorioId: string): Promise<string[][][]> {
  // e22f S5: a relatório whose fichas judge nothing has no parecer until one is tapped (the derived one stands otherwise).
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body())).tables;
}

/** The DOCX tables whose first row reads `title` alone. */
export const tablesTitled = (tables: readonly string[][][], title: string) => tables.filter((table) => table[0]?.length === 1 && table[0][0] === title);

/** The section 9 tables the kernel lays out titled `title` (a band row alone): over every sheet, and over `blockId`'s alone. */
export function kernelTablesTitled(snapshot: RelatorioSnapshot, title: string, blockId?: string): number {
  const sheets = section9Layout(snapshot, 9, 'RESULTADOS')?.subsections.flatMap((subsection) => subsection.sheets) ?? [];
  return sheets
    .filter((sheet) => blockId === undefined || sheet.blockId === blockId)
    .flatMap((sheet) => sheet.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : [])))
    .filter((table) => table.rows[0]?.cells.length === 1 && table.rows[0].cells[0]!.text === title).length;
}
