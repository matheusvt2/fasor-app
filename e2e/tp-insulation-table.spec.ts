import { buildSnapshot, entityKey, evaluateTest, getDefinition, SEED_VERSION, visitContextOf, type Entity, type EntityRow, type TestEvaluation } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Fix batch e23w (Bruno's answer B-4, 2026-11-09; seed v13, TP-02): the TP's insulation judged by
 * ANSI/NETA MTS-2023 Table 100.5 by its medium, as a person fills its plate at 1280 px. With TIPO DE
 * ISOLAÇÃO empty the v12 > 400 MΩ holds and the source asks for it; ÓLEO MINERAL and a TENSÃO NOMINAL
 * AT typed "13,8/raiz3" (stored "13.8/√3") give the oil minimum read at the class voltage 13,8 kV;
 * EPÓXI the dry one, ≥ 25.000 MΩ, under which a 20 GΩ phase is out. The issued DOCX prints that
 * minimum in the test's ACEITÁVEL. Every expected text is the kernel's over the device's own rows. It
 * issues a revision through the api's one queue and LibreOffice, so it runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const toast = (page: Page) => page.getByTestId('toast');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const TP = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp');

/** The kernel's evaluation of the TP's insulation over the device's own rows, under its visit context. */
async function insulation(page: Page, relatorioId: string, blockId: string): Promise<TestEvaluation> {
  const records = await readStore<{ entity: string; id: string; row: unknown }>(page, database, 'entities');
  const snapshot = buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as EntityRow])), relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  return evaluateTest(block, TP, TP.tests.find((test) => test.key === 'isolacao')!, visitContextOf(snapshot, block));
}

test('@p0 e23w-B4-E2E-001 a v13 TP judged by Table 100.5 by its medium and its AT (13,8/√3 read at 13,8 kV): the criterion and its source on the sheet, a 20 GΩ phase out under EPÓXI, and the DOCX\'s ACEITÁVEL', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const tp = built.sheets.find((sheet) => sheet.blockType === 'tp')!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${tp.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const section = page.locator('section[data-test-key="isolacao"]');

  // The AT typed over √3: stored "13.8/√3".
  const at = field(page, 'tensao_nominal_at').locator('input');
  await at.fill('13,8/raiz3');
  await at.press('Enter');
  await expect.poll(() => outboxValues(page, `sheet/${tp.blockId}/nameplate/tensao_nominal_at`)).toEqual([{ raw: '13.8/√3', unit: 'kV', state: 'measured' }]);

  // No medium yet: the v12 criterion, and the source asks for TIPO DE ISOLAÇÃO.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const bare = await insulation(page, built.relatorioId, tp.blockId);
  expect(bare.criterionText).toBe('>400 MΩ');
  await expect(section.locator('.mt-criterion')).toHaveText(`Aceitável ${bare.criterionText}`);
  await section.locator('summary', { hasText: 'Fonte do critério' }).click();
  await expect(section.locator('.mt-source [data-source-line]')).toHaveText(bare.sourceLines!);
  expect(bare.sourceLines).toEqual(['Sem o tipo de isolação na placa, vale >400 MΩ. Informe-o para julgar pela Tabela 100.5.']);

  // ÓLEO MINERAL: the oil minimum at the class voltage.
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  await field(page, 'tipo_de_isolacao').locator('select').selectOption('ÓLEO MINERAL');
  await expect.poll(async () => (await outboxValues(page, `sheet/${tp.blockId}/nameplate/tipo_de_isolacao`)).at(-1)).toBe('ÓLEO MINERAL');
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const oil = await insulation(page, built.relatorioId, tp.blockId);
  expect(oil.criterionText).toBe('≥ 5.000 MΩ');
  expect(oil.sourceName).toBe('ANSI/NETA MTS-2023, Tabela 100.5');
  await expect(section.locator('.mt-criterion')).toHaveText(`Aceitável ${oil.criterionText}`);

  // EPÓXI: the dry minimum; the source names the table, the medium and 13,8 kV.
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  await field(page, 'tipo_de_isolacao').locator('select').selectOption('EPÓXI');
  await expect.poll(async () => (await outboxValues(page, `sheet/${tp.blockId}/nameplate/tipo_de_isolacao`)).at(-1)).toBe('EPÓXI');
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const dry = await insulation(page, built.relatorioId, tp.blockId);
  expect(dry.criterionText).toBe('≥ 25.000 MΩ');
  expect(dry.tables[0]!.rows.map((row) => row.criterionHelper)).toEqual(new Array(3).fill('Tabela 100.5 (ANSI/NETA MTS-2023), seco, 13,8 kV: ≥ 25.000 MΩ'));
  await expect(section.locator('.mt-criterion')).toHaveText(`Aceitável ${dry.criterionText}`);
  if (!(await section.locator('.mt-source [data-source-line]').first().isVisible())) await section.locator('summary', { hasText: 'Fonte do critério' }).click();
  await expect(section.locator('.mt-source [data-source-line]')).toHaveText(dry.sourceLines!);

  // The phases: 20 GΩ out of ≥ 25.000 MΩ (the v12 > 400 MΩ would pass it), 30 GΩ within.
  const cells = [0, 1, 2].map((row) => section.locator(`.ficha-cell[data-cell="isolacao:${row}:1"]`).filter({ visible: true }));
  await cells[0]!.locator('input.mf-value').click();
  for (const value of ['20G', '30G', '30G']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  await expect.poll(() => outboxValues(page, `sheet/${tp.blockId}/test/isolacao/cell/2/1`)).toEqual([{ raw: '30', unit: 'GΩ', state: 'measured' }]);
  const judged = await insulation(page, built.relatorioId, tp.blockId);
  expect(judged.tables[0]!.rows.map((row) => row.cells.find((one) => one.role === 'capture')!.verdict)).toEqual(['out', 'within', 'within']);
  await expect(cells[0]!.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cells[0]!.locator('.mf-helper[role="status"]')).toContainText(judged.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!.helperText!);
  for (const within of cells.slice(1)) await expect(within.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');

  // The issued DOCX: the TP's insulation header prints the minimum in ACEITÁVEL (a Reprovado sheet gives the parecer).
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.row.id}/docx`);
  expect(response.status()).toBe(200);
  const structure = extractStructure(Buffer.from(await response.body()));
  const headers = structure.tables.filter((table) => table[0]?.[0] === 'ENSAIO DE ISOLAÇÃO' && table[1]?.at(-1) === 'ACEITÁVEL');
  expect(headers.map((table) => table[2]!.at(-1))).toContain(dry.criterionText);
});
