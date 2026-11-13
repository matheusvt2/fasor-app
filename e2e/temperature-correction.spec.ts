import { buildSnapshot, cellAddressesOf, entityKey, evaluateTest, getDefinition, visitContextOf, type Entity, type EntityRow, type OpDraft, type TestEvaluation } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 23.5 (seed v13, decision B; Base rev08 TR-OL-02, table CORRECAO_TEMPERATURA): a v13 oil
 * transformer's insulation judged corrected to 20 °C, as a person records it at 1280 px. The office set
 * the plate (ÓLEO ISOLANTE, 13,8 kV / 380 V, so the AT rows ask ≥ 5.000 MΩ) and the cabine's ambient
 * (25 °C). The person types TEMPERATURA DO ÓLEO 40 °C on the plate and 2 GΩ on the AT row: the line over
 * the table names the oil, the "Corrigido a 20 °C" column reads 8 GΩ and the row is within (raw it would
 * be out). Clearing the plate temperature, the cabine's 25 °C stands in: the line names the ambient and
 * the 2,83 GΩ at 20 °C is out, its helper naming the corrected value; at 390 px the column hides and the
 * value stands under its reading ("A 20 °C: 2,83 GΩ"). A v13 cable gets no line. The issued
 * DOCX prints TEMPERATURA "25 °C (AMBIENTE)" before ACEITÁVEL and the "20 °C" column inside VALORES.
 * Every expected word is the kernel's over the device's own rows. It issues a revision through the api's
 * one queue and LibreOffice, so it runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** Story 25.20: the seed the relatório is born on, v14, whose print this test reads. */
const RELATORIO_SEED = 'v14';
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const toast = (page: Page) => page.getByTestId('toast');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const outboxValues = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
const section = (page: Page) => page.locator('section[data-test-key="isolacao"]');
const line = (page: Page) => section(page).locator('.v13-line[data-temperature-line]');

/** The kernel's evaluation of a sheet's insulation, under its visit context, over the device's own rows. */
async function insulation(page: Page, relatorioId: string, blockId: string): Promise<TestEvaluation> {
  const records = await readStore<{ entity: string; id: string; row: unknown }>(page, database, 'entities');
  const snapshot = buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as EntityRow])), relatorioId);
  const block = snapshot.blocks.find((row) => row.id === blockId)!;
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === 'isolacao')!, visitContextOf(snapshot, block));
}

async function openEnsaios(page: Page, relatorioId: string, blockId: string): Promise<void> {
  if (!page.url().endsWith(`/ficha/${blockId}`)) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  }
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
}

/** The line's two parts as the kernel words them. */
async function expectLine(page: Page, evaluation: TestEvaluation): Promise<void> {
  const view = evaluation.temperature!;
  await expect(line(page).locator('> span').nth(0)).toHaveText(`${view.line.label} ${view.line.value}`);
  await expect(line(page).locator('> span').nth(1)).toHaveText(view.line.note);
}

test('@p0 23.5-E2E-001 a v13 oil transformer: 2 GΩ at 40 °C of oil is 8 GΩ at 20 °C and within; the plate temperature cleared, the cabine\'s 25 °C stands in (2,83 GΩ at 20 °C, out); a cable has no line; the DOCX prints TEMPERATURA and the 20 °C column', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // Story 25.20 (batch e25p): pinned to seed v14, whose printed "20 °C" column this test reads (v15 prints "20 °C
  // (corrigido)" and keeps each value with its unit, read by `print-criterion-per-row.spec.ts`).
  const built = newRelatorioDrafts(account, { seedVersion: RELATORIO_SEED });
  const tf = built.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const cable = built.sheets.find((sheet) => sheet.blockType === 'cabos_entrada')!;
  // The transformer's cabine, the root of its location (`cabineOf`).
  const created = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const locations = new Map(created('location/').map((row) => [row.id as string, row]));
  let cabine = locations.get(created('block/').find((row) => row.id === tf.blockId)!.location_id as string)!;
  while (cabine.parent_id !== null) cabine = locations.get(cabine.parent_id as string)!;
  const scope = { relatorioId: built.relatorioId };
  const plate = (key: string, value: unknown): OpDraft => officeDraft(account, scope, `sheet/${tf.blockId}/nameplate/${key}`, value);
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    plate('tipo_de_isolacao', 'ÓLEO ISOLANTE'),
    plate('tensao_nominal_at', { raw: '13.8', unit: 'kV', state: 'measured' }),
    plate('tensao_nominal_bt', { raw: '380', unit: 'V', state: 'measured' }),
    officeDraft(account, scope, `location/${cabine.id as string}/env/temperature_c`, { raw: '25', unit: '°C', state: 'measured' }),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // The plate's TEMPERATURA DO ÓLEO, typed as a person does.
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${tf.blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  const oil = plateField(page, 'temperatura_oleo_c').locator('input').first();
  await oil.click();
  await oil.fill('40');
  await oil.press('Tab');
  const oilPath = `sheet/${tf.blockId}/nameplate/temperatura_oleo_c`;
  await expect.poll(async () => ((await outboxValues(page, oilPath)).at(-1) as { raw?: string } | undefined)?.raw).toBe('40');

  // The AT row at 2 GΩ: 8 GΩ at 20 °C, within ≥ 5.000 MΩ.
  const [at] = cellAddressesOf(getDefinition(RELATORIO_SEED, 'cabine_primaria', 'transformador_forca'), 'isolacao');
  const cellPath = `sheet/${tf.blockId}/test/isolacao/cell/${at!.row}/${at!.col}`;
  const atCell = section(page).locator(`.ficha-cell[data-cell="isolacao:${at!.row}:${at!.col}"]`).filter({ visible: true });
  await openEnsaios(page, built.relatorioId, tf.blockId);
  await atCell.locator('input.mf-value').click();
  await page.keyboard.type('2G');
  await page.keyboard.press('Enter');
  await expect.poll(() => outboxValues(page, cellPath)).toEqual([{ raw: '2', unit: 'GΩ', state: 'measured' }]);
  const warm = await insulation(page, built.relatorioId, tf.blockId);
  const warmAt = warm.tables[0]!.rows[0]!.cells.find((cell) => cell.role === 'capture')!;
  expect(warm.temperature!.state).toBe('corrected');
  expect(warm.temperature!.print).toBe('40 °C (ÓLEO)');
  expect(warmAt.corrected).toEqual({ raw: '8', unit: 'GΩ', text: '8 GΩ' });
  expect(warmAt.verdict).toBe('within');
  await expectLine(page, warm);
  await expect(section(page).locator('th[data-corrected-column]')).toHaveText(warm.temperature!.header);
  await expect(section(page).locator(`td[data-corrected-cell="${at!.row}"]`)).toContainText(warmAt.corrected!.text);
  await expect(atCell.locator('.measurement-field')).not.toHaveAttribute('data-state');

  // The plate's temperature cleared: the cabine's 25 °C stands in, and 2 GΩ is 2,83 GΩ at 20 °C, out.
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  await oil.click();
  await oil.fill('');
  await oil.press('Tab');
  await expect.poll(async () => (await outboxValues(page, oilPath)).at(-1)).toBeNull();
  const ambient = await insulation(page, built.relatorioId, tf.blockId);
  const ambientAt = ambient.tables[0]!.rows[0]!.cells.find((cell) => cell.role === 'capture')!;
  expect(ambient.temperature!.print).toBe('25 °C (AMBIENTE)');
  expect(ambientAt.corrected!.text).toBe('2,83 GΩ');
  expect(ambientAt.verdict).toBe('out');
  await openEnsaios(page, built.relatorioId, tf.blockId);
  await expectLine(page, ambient);
  await expect(section(page).locator(`td[data-corrected-cell="${at!.row}"]`)).toContainText(ambientAt.corrected!.text);
  await expect(atCell.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(atCell.locator('.mf-helper[role="status"]')).toContainText(ambientAt.helperText!);
  expect(ambientAt.helperText).toBe('Abaixo do aceitável a 20 °C: 2,83 GΩ (≥ 5.000 MΩ)');

  // The phone (390 px): the "Corrigido a 20 °C" column hidden, the value stacked under its reading as the card's line
  // ("A 20 °C: 2,83 GΩ calc."), the kernel's lead and value.
  await page.setViewportSize({ width: 390, height: 844 });
  const stackedLine = section(page).locator(`.corrected-stacked[data-corrected-line="${at!.row}"]`);
  await expect(stackedLine).toBeVisible();
  await expect(stackedLine).toContainText(`${ambient.temperature!.cellLead} ${ambientAt.corrected!.text}`);
  await expect(stackedLine.locator('b.t-value')).toHaveText(ambientAt.corrected!.text);
  await expect(section(page).locator(`td[data-corrected-cell="${at!.row}"]`)).toBeHidden();
  await expect(section(page).locator('th[data-corrected-column]')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(stackedLine).toBeHidden();

  // A v13 cable is never corrected: no line, no column.
  await openEnsaios(page, built.relatorioId, cable.blockId);
  await expect(section(page).locator('.measurement-table')).toBeVisible();
  await expect(line(page)).toHaveCount(0);
  await expect(section(page).locator('th[data-corrected-column]')).toHaveCount(0);

  // The issued DOCX: TEMPERATURA before ACEITÁVEL in the transformer's instrument header, the 20 °C column inside VALORES.
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
  const tables = extractStructure(Buffer.from(await response.body())).tables;
  // The transformer's insulation table: its labels row carries 1 MINUTO and, right after it, 20 °C (the disjuntor's and the
  // seccionadora's tables carry the column too, beside VALORES); the table holding the AT reading is this sheet's.
  const at20 = (table: string[][]) => table.find((row) => row.includes('1 MINUTO') && row.includes('20 °C'));
  const corrected = tables.find((table) => {
    const labels = at20(table);
    return labels !== undefined && table[table.indexOf(labels) + 1]?.[labels.indexOf('20 °C')] === '2,83';
  })!;
  expect(corrected).toBeDefined();
  const labels = at20(corrected)!;
  const col = labels.indexOf('20 °C');
  expect(labels[col - 1]).toBe('1 MINUTO');
  const group = corrected.find((row) => row.some((cell) => cell.startsWith('VALORES')))!;
  expect(group.find((cell) => cell.startsWith('VALORES'))).toBe('VALORES (GΩ)');
  const data = corrected.slice(corrected.indexOf(labels) + 1);
  expect(data[0]![col]).toBe('2,83');
  expect(data.slice(1).map((row) => row[col])).toEqual(['-', '-']);
  // Its instrument header, the table before it: TEMPERATURA, the ambient's, right before ACEITÁVEL.
  const header = tables[tables.indexOf(corrected) - 1]!;
  const temperature = header[1]!.indexOf('TEMPERATURA');
  expect(temperature).toBe(header[1]!.indexOf('ACEITÁVEL') - 1);
  expect(header[2]![temperature]).toBe(ambient.temperature!.print);
});
