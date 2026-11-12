import { getDefinition, notApplicableReadingValue, section9Layout, sheetProgress, stepMissingLabel, type BlockRow, type OpDraft, type RelatorioSnapshot } from '@app/domain';
import type { Page } from '@playwright/test';
import { cellOf, deviceSnapshot, issueAndReadTables, openStep, outboxValues, stepper, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 25.9 (M05; Story 25.1 Part B's frame `60-ficha.html` #/ficha/TP-02, #ficha-dlg-cell-menu and
 * #ficha-dlg-row-menu), on a new relatório (seed v15) at 1280 px: a TP whose phases R and S the office typed
 * (insulation, ratio and polarity) and whose phase T was left. The technician marks the third insulation
 * reading "Não se aplica" from its cell's menu, then the whole third ratio row from the row's action: each is
 * one put in the outbox and in the store, the toast with "Desfazer", the cells read N/A on the NA fill, the
 * row's Calculado and Condição read N/A, and the Ensaios step's count drops to what the kernel counts on the
 * stored sheet. Issued, the DOCX prints N/A in those cells as the kernel lays them out. Every expected word is
 * the kernel's or the frame's. It issues a revision through the api's one queue and LibreOffice, so it runs in
 * the serial group's queue lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const toast = (page: Page) => page.getByTestId('toast');

/** The TP as this device stores it, and the kernel's count of the Ensaios step over it. */
async function stored(page: Page, relatorioId: string, blockId: string): Promise<{ snapshot: RelatorioSnapshot; block: BlockRow; missing: number }> {
  const snapshot = await deviceSnapshot(page, database, relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  return { snapshot, block, missing: sheetProgress(snapshot, blockId).steps.ensaios.missing };
}

test('@p0 25.9-E2E-001 a v15 TP: phase T\'s insulation N/A from the cell\'s menu, the third ratio row N/A from the row\'s action, the count drops, and the DOCX prints N/A', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const tp = built.sheets.find((sheet) => sheet.blockType === 'tp')!;
  const definition = getDefinition('v15', 'cabine_primaria', 'tp');
  expect(definition.tests.map((one) => one.key)).toEqual(['isolacao', 'relacao_transformacao']);
  const scope = { relatorioId: built.relatorioId };
  const cellPath = (testKey: string, row: number, col: number) => `sheet/${tp.blockId}/test/${testKey}/cell/${row}/${col}`;
  // Phases R and S typed by the office; phase T left for the technician.
  const office: OpDraft[] = [];
  for (const row of [0, 1]) {
    office.push(officeDraft(account, scope, cellPath('isolacao', row, 1), { raw: String(98 + row * 4), unit: 'GΩ', state: 'measured' }));
    office.push(officeDraft(account, scope, cellPath('relacao_transformacao', row, 0), { raw: '13800', unit: 'V', state: 'measured' }));
    office.push(officeDraft(account, scope, cellPath('relacao_transformacao', row, 1), { raw: '115', unit: 'V', state: 'measured' }));
    office.push(officeDraft(account, scope, cellPath('relacao_transformacao', row, 3), { raw: row === 0 ? '120.1' : '119.94', unit: null, state: 'measured' }));
    office.push(officeDraft(account, scope, cellPath('relacao_transformacao', row, 5), { raw: 'OK', unit: null, state: 'measured' }));
  }
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...office]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await openStep(page, built.relatorioId, tp.blockId, 'Ensaios');

  const first = await stored(page, built.relatorioId, tp.blockId);
  expect(first.block.seed_version).toBe('v15');
  await expect(stepper(page).getByRole('button', { name: stepMissingLabel('Ensaios', first.missing), exact: true })).toBeVisible();

  // The cell: phase T of the insulation, "Não se aplica" from its menu (under "Não medido" and "> limite").
  const phaseT = cellOf(page, 'isolacao', 2, 1);
  await phaseT.getByRole('button', { name: /^Mais opções de / }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Não medido', '> limite', 'Não se aplica']);
  await page.getByRole('menuitem', { name: 'Não se aplica' }).click();
  await expect.poll(async () => (await outboxValues(database, page, cellPath('isolacao', 2, 1))).at(-1)).toEqual(notApplicableReadingValue('GΩ'));
  await expect(toast(page)).toContainText('Leitura marcada Não se aplica — não é julgada e imprime N/A');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(phaseT.locator('.measurement-field')).toHaveAttribute('data-state', 'na');
  await expect(phaseT.locator('input.mf-value')).toHaveAttribute('placeholder', 'N/A');
  await expect(phaseT.locator('input.mf-value')).toHaveValue('');
  // Phases R and S keep their judgement (neither is out); the count no longer includes phase T.
  await expect(testSection(page, 'isolacao').locator('.measurement-field[data-state="out-of-limit"]')).toHaveCount(0);
  await expect.poll(async () => (await stored(page, built.relatorioId, tp.blockId)).block.sheet.test.isolacao?.cells['2']?.['1']?.value).toEqual(notApplicableReadingValue('GΩ'));
  const second = await stored(page, built.relatorioId, tp.blockId);
  expect(second.missing).toBe(first.missing - 1);
  await expect(stepper(page).getByRole('button', { name: stepMissingLabel('Ensaios', second.missing), exact: true })).toBeVisible();

  // The row: the third ratio row, "Linha toda: não se aplica" from the action beside its name.
  const ratio = testSection(page, 'relacao_transformacao');
  await ratio.getByRole('button', { name: 'Mais opções da linha Fase T' }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'Linha toda: não se aplica' }).click();
  for (const [col, unit] of [[0, 'V'], [1, 'V'], [3, null]] as const) {
    await expect.poll(async () => (await outboxValues(database, page, cellPath('relacao_transformacao', 2, col))).at(-1), `col ${col}`).toEqual(notApplicableReadingValue(unit));
  }
  await expect(toast(page)).toContainText('Linha marcada Não se aplica — todas as leituras imprimem N/A');
  for (const col of [0, 1, 3]) await expect(cellOf(page, 'relacao_transformacao', 2, col).locator('input.mf-value')).toHaveAttribute('placeholder', 'N/A');
  // Its Calculado and Condição read N/A in the table; the other rows keep theirs.
  const rowT = ratio.locator('table.measurement-table tbody tr').filter({ has: page.locator('.ficha-cell[data-cell="relacao_transformacao:2:3"]') });
  await expect(rowT.locator('td.cell-calc')).toContainText('N/A');
  await expect(rowT.locator('td.cell-dim')).toHaveText('N/A');
  await expect.poll(async () => (await stored(page, built.relatorioId, tp.blockId)).block.sheet.test.relacao_transformacao?.cells['2']?.['3']?.value).toEqual(notApplicableReadingValue(null));
  const third = await stored(page, built.relatorioId, tp.blockId);
  expect(third.missing).toBeLessThan(second.missing);
  await expect(stepper(page).getByRole('button', { name: stepMissingLabel('Ensaios', third.missing), exact: true })).toBeVisible();
  // The row offers its action no more.
  await expect(ratio.getByRole('button', { name: 'Mais opções da linha Fase T' })).toHaveCount(0);

  // The print: the kernel's layout of the stored relatório, then the issued DOCX.
  const layout = section9Layout(third.snapshot, 9, 'RESULTADOS')!.subsections.flatMap((subsection) => subsection.sheets).find((sheet) => sheet.blockId === tp.blockId)!;
  const kernelRows = layout.parts.flatMap((part) => (part.kind === 'table' ? part.table.rows.map((row) => row.cells.map((one) => one.text)) : [])).filter((row) => row[0] === 'FASE T');
  expect(kernelRows).toHaveLength(2);
  for (const row of kernelRows) expect(row).toContain('N/A');
  const tables = await issueAndReadTables(page, database, built.relatorioId);
  const printed = tables.flatMap((table) => table).filter((row) => row[0] === 'FASE T' && row.includes('N/A'));
  expect(printed).toEqual(kernelRows);
});
