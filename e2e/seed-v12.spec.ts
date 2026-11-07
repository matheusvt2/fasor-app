import {
  ACCURACY_CLASS_HELPER,
  accuracyClassDeviation,
  formatCriterionValue,
  getDefinition,
  getSeed,
  rowVoltageCell,
  screenLabel,
  SEED_VERSION,
  SEEDED_CRITERIA,
  TEST_VOLTAGE_OPTIONS_KV,
  type BlockRow,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 22.7/22.8/22.9-E2E. Seed v12 (contract 32) on a new relatório of the standard template, driven
 * as a person would. Every seed value is read from the kernel.
 *
 * 22.7-E2E-001 (1280 px): the relatório is born on v12; the transformer's TIPO DE ISOLAÇÃO offers
 * EPÓXI, Á SECO and ÓLEO MINERAL, TIPO DO ÓLEO A and B after it, and the group select reads
 * "Deslocamento angular"; EPÓXI shows the oil items NA with no tap and TIPO DO ÓLEO not missing,
 * ÓLEO MINERAL brings them back and TIPO DO ÓLEO is picked; the TP holds the TC's items, with no
 * VÁLVULA DE ALÍVIO, RELÉ DE GÁS or VENTILADORES.
 *
 * 22.8/22.9-E2E-002 (1280 px): the transformer's insulation rows start at the instrument's 10 kV
 * and the SECUNDÁRIO/MASSA row at 1 kV; set to 10 kV on a 220 V secondary the row shows the
 * notice, and the sheet still concludes; set to 0,5 kV the store holds {raw '0.5', unit 'kV'}.
 * The TC with EXATIDÃO 1,2 judges a 0,84 % ratio Satisfatório at ±1,2 %, and with no class the
 * helper asks for it. A para-raio is marked Não ensaiado for "Defeito no equipamento". The DOCX
 * prints the TENSÃO (kV) column (5, 5, 0,5 since e22g: the 13,8 kV plate sets the high-voltage rows), ACEITÁVEL ±1,2 %, DESLOCAMENTO ANGULAR and the
 * defect's justification. It generates through the one queue and LibreOffice of the api, so the
 * file is in the serial group. Each test resets this worker's own Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const JOB_TIMEOUT = 150_000;
const TF = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const TP = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp');
const TC = getDefinition(SEED_VERSION, 'cabine_primaria', 'tc');
const fieldOf = (definition: typeof TF, key: string) => definition.nameplate.find((field) => field.key === key)!;
const OIL_VALUE = TF.oil_rule!.oil_values[0]!;
const DRY_VALUE = fieldOf(TF, 'tipo_de_isolacao').options!.find((option) => option !== OIL_VALUE)!;
const DEFECT = getSeed(SEED_VERSION, 'cabine_primaria').not_tested_reasons.find((reason) => reason.defect === true)!;
const RATIO_CRITERION = SEEDED_CRITERIA.find((criterion) => criterion.key === 'relacao_transformacao')!;
const classCriterion = (cls: string) => formatCriterionValue({ ...RATIO_CRITERION, value: accuracyClassDeviation(cls)! });
/** The transformer's insulation table: its voltage column's index. */
const VOLTAGE_COL = TF.tests.find((test) => test.key === 'isolacao')!.tables[0]!.value_columns.findIndex((column) => column.role === 'voltage');

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const lastWritten = async (page: Page, path: string) => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value;
const toast = (page: Page) => page.getByTestId('toast');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const select = (page: Page, key: string): Locator => field(page, key).locator('select');
const missingMarker = (page: Page, key: string): Locator =>
  page.locator(`#ficha-nameplate [data-field-key="${key}"][data-missing-field], #ficha-nameplate [data-field-key="${key}"] [data-missing-field]`);
const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const voltageSelect = (page: Page, rowIndex: number): Locator => page.locator(`.ficha-cell[data-row-voltage="${rowIndex}"] select`);
const notice = (page: Page, rowIndex: number): Locator => page.locator(`[data-row-voltage-notice="${rowIndex}"]`);
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

async function goToStep(page: Page, name: string, step: string): Promise<void> {
  await stepper(page).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(page.locator(`#ficha-step-${step}`)).toBeFocused();
}

async function pick(page: Page, key: string, option: string): Promise<void> {
  await select(page, key).selectOption(option);
  await expect(select(page, key)).toHaveValue(option);
}

/** Resets Empresa B, signs in and pushes a standard relatório (Em campo) plus `extra`; its sheets by type. */
async function seedRelatorio(page: Page, extra: (relatorioId: string, sheetOf: (type: string) => SeededSheet) => ReturnType<typeof officeDraft>[] = () => []) {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const sheetOf = (type: string) => built.sheets.find((sheet) => sheet.blockType === type)!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...extra(built.relatorioId, sheetOf)]);
  return { relatorioId: built.relatorioId, sheetOf };
}

test('@p0 22.7-E2E-001 a new relatório is on v12: the transformer offers ÓLEO MINERAL and TIPO DO ÓLEO and reads "Deslocamento angular"; EPÓXI marks the oil items NA, ÓLEO MINERAL brings them back; the TP holds the TC items', async ({ page }) => {
  test.setTimeout(240_000);
  expect(SEED_VERSION).toBe('v12');
  const { relatorioId, sheetOf } = await seedRelatorio(page);
  const tf = sheetOf('transformador_forca');
  await openSheet(page, relatorioId, tf.blockId);
  await syncNowAndReturn(page);
  const relatorio = (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)!;
  expect(relatorio.row.seed_version).toBe('v12');

  // The nameplate: TIPO DE ISOLAÇÃO, then TIPO DO ÓLEO; the group select's new label.
  const options = async (key: string) => (await select(page, key).locator('option').allTextContents()).slice(1);
  expect(await options('tipo_de_isolacao')).toEqual(fieldOf(TF, 'tipo_de_isolacao').options);
  expect(await options('tipo_do_oleo')).toEqual(fieldOf(TF, 'tipo_do_oleo').options);
  expect(fieldOf(TF, 'tipo_de_isolacao').options).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO MINERAL']);
  const order = await page.locator('#ficha-nameplate [data-field-key]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-field-key')));
  expect(order.indexOf('tipo_do_oleo')).toBe(order.indexOf('tipo_de_isolacao') + 1);
  await expect(field(page, 'ligacao_secundaria').locator('.field-label')).toHaveText(screenLabel(fieldOf(TF, 'ligacao_secundaria').label));
  await expect(field(page, 'ligacao_secundaria').locator('.field-label')).toHaveText('Deslocamento angular');

  // EPÓXI: the oil items NA with no tap, TIPO DO ÓLEO excused (not missing).
  await pick(page, 'tipo_de_isolacao', DRY_VALUE);
  for (const key of TF.oil_rule!.items) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  await expect(missingMarker(page, 'tipo_do_oleo')).toHaveCount(0);
  expect((await outbox(page)).filter((op) => op.path.includes('/checklist/'))).toEqual([]);

  // ÓLEO MINERAL: the oil items answerable, TIPO DO ÓLEO missing until picked.
  await pick(page, 'tipo_de_isolacao', OIL_VALUE);
  for (const key of TF.oil_rule!.items) await expect(checked(page, key), key).toHaveCount(0);
  await expect(missingMarker(page, 'tipo_do_oleo')).toHaveCount(1);
  await pick(page, 'tipo_do_oleo', 'B');
  await expect(missingMarker(page, 'tipo_do_oleo')).toHaveCount(0);
  await expect
    .poll(async () => ({ insulation: await lastWritten(page, `sheet/${tf.blockId}/nameplate/tipo_de_isolacao`), oil: await lastWritten(page, `sheet/${tf.blockId}/nameplate/tipo_do_oleo`) }))
    .toEqual({ insulation: OIL_VALUE, oil: 'B' });

  // The TP: the TC's items, none of the power transformer's oil hardware.
  await openSheet(page, relatorioId, sheetOf('tp').blockId);
  const keys = await page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));
  expect(keys).toEqual(TC.checklist!.map((item) => item.key));
  expect(TP.checklist!.map((item) => item.key)).toEqual(TC.checklist!.map((item) => item.key));
  for (const gone of ['valvula_de_alivio', 'rele_de_gas_funcionamento', 'ventiladores']) await expect(row(page, gone), gone).toHaveCount(0);
  // Its oil item: VASAMENTO, NA on a dry TP.
  await pick(page, 'tipo_de_isolacao', DRY_VALUE);
  await expect(checked(page, 'vasamento')).toHaveAttribute('data-value', 'na');
});

test('@p0 22.8/22.9-E2E-002 the per-row voltage (5, 5, 1 from the 13,8 kV plate; the notice at 10 kV on 220 V; 0,5 stored), the TC judged by its class 1,2, a Não ensaiado for a defect; the DOCX prints TENSÃO (kV), ±1,2 %, DESLOCAMENTO ANGULAR and the justification', async ({ page }) => {
  test.setTimeout(480_000);
  const { relatorioId, sheetOf } = await seedRelatorio(page, (id, sheetOf) => {
    const scope = { relatorioId: id };
    const tf = sheetOf('transformador_forca').blockId;
    const tc = sheetOf('tc').blockId;
    const header = { instrument_id: '019966b0-0225-7000-8000-000000000800', code: 'MG-01', manufacturer: 'Instrum', model: 'DMG10Ki', serial: 'IN919021', cert_number: '37428/26', calibrated_at: null, valid_until: null, test_parameter: '10 kV' };
    return [
      officeDraft(account, scope, `sheet/${tf}/nameplate/tensao_nominal_at`, measured('13.8', 'kV')),
      officeDraft(account, scope, `sheet/${tf}/nameplate/tensao_nominal_bt`, measured('220', 'V')),
      officeDraft(account, scope, `sheet/${tf}/test/isolacao/instrument`, header),
      officeDraft(account, scope, `sheet/${tf}/test/isolacao/cell/0/1`, measured('1.2', 'GΩ')),
      officeDraft(account, scope, `sheet/${tf}/test/isolacao/cell/1/1`, measured('1.4', 'GΩ')),
      officeDraft(account, scope, `sheet/${tf}/test/isolacao/cell/2/1`, measured('0.9', 'GΩ')),
      // The TC: 100/5 A and a capture 0,84 % above 20.
      officeDraft(account, scope, `sheet/${tc}/test/relacao_transformacao/cell/0/0`, measured('100', 'A')),
      officeDraft(account, scope, `sheet/${tc}/test/relacao_transformacao/cell/0/1`, measured('5', 'A')),
      officeDraft(account, scope, `sheet/${tc}/test/relacao_transformacao/cell/0/3`, measured('20.168', null)),
    ];
  });
  const tf = sheetOf('transformador_forca');
  const tc = sheetOf('tc');
  const para = sheetOf('para_raio');

  // --- the transformer: 5, 5 and 1 kV; each row changeable ---
  // e22g (Bruno's test base rev03, 2026-11-07): the high-voltage rows start from the 13,8 kV TENSÃO NOMINAL AT (above
  // 5000 V: 5 kV), whatever the 10 kV megger; SECUNDÁRIO/MASSA keeps 1 kV.
  await openSheet(page, relatorioId, tf.blockId);
  await syncNowAndReturn(page);
  await goToStep(page, 'Ensaios', 'ensaios');
  await expect(page.locator('.ficha-mt').first().locator('thead th[data-voltage-column]')).toHaveText('Tensão (kV)');
  for (const [index, expected] of ['5', '5', '1'].entries()) await expect(voltageSelect(page, index), String(index)).toHaveValue(expected);
  // e22g (review N7): the two PRIMÁRIO rows are named apart.
  await expect(voltageSelect(page, 0)).toHaveAccessibleName('Primário/Massa, Tensão (kV)');
  await expect(voltageSelect(page, 1)).toHaveAccessibleName('Primário/Secundário, Tensão (kV)');
  await expect(voltageSelect(page, 2)).toHaveAccessibleName('Secundário, Tensão (kV)');
  expect((await voltageSelect(page, 2).locator('option').allTextContents()).slice(1)).toEqual([...TEST_VOLTAGE_OPTIONS_KV]);
  for (const index of [0, 1, 2]) await expect(notice(page, index)).toHaveCount(0);
  const cellPath = `sheet/${tf.blockId}/test/isolacao/cell/2/${VOLTAGE_COL}`;

  // At 390 px the column is hidden and each row's select stands over its reading: SECUNDÁRIO/MASSA reads its default 1; 0,5 is stored.
  await page.setViewportSize({ width: 390, height: 844 });
  const stacked = page.locator('.ficha-cell[data-row-voltage-stacked="2"] select');
  await expect(page.locator('.ficha-mt').first().locator('thead th[data-voltage-column]')).toBeHidden();
  await expect(voltageSelect(page, 2)).toBeHidden();
  await expect(stacked).toBeVisible();
  await expect(stacked).toHaveValue('1');
  await stacked.selectOption('0,5');
  await expect.poll(async () => lastWritten(page, cellPath)).toEqual({ raw: '0.5', unit: 'kV', state: 'measured' });
  await expect
    .poll(async () => (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === tf.blockId)!.row.sheet.test.isolacao?.cells['2']?.[String(VOLTAGE_COL)]?.value)
    .toEqual({ raw: '0.5', unit: 'kV', state: 'measured' });
  await expect(stacked).toHaveValue('0,5');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(voltageSelect(page, 2)).toHaveValue('0,5');

  // SECUNDÁRIO/MASSA at 10 kV on a 220 V secondary: the notice names the winding and 0,5 ou 1 kV; it never blocks.
  await voltageSelect(page, 2).selectOption('10');
  await expect.poll(async () => lastWritten(page, cellPath)).toEqual(rowVoltageCell('10'));
  await expect(notice(page, 2)).toHaveText('Tensão de ensaio acima do suportado pelo enrolamento Secundário (220 V): use 0,5 ou 1 kV.');
  await goToStep(page, 'Conclusão', 'conclusao');
  await page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Aprovado', exact: true }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${tf.blockId}/conclusion/result`)).toBe('aprovado');

  // Then 0,5 kV: the store holds the cell at the voltage column's index, and the notice goes.
  await goToStep(page, 'Ensaios', 'ensaios');
  await voltageSelect(page, 2).selectOption('0,5');
  await expect.poll(async () => lastWritten(page, cellPath)).toEqual({ raw: '0.5', unit: 'kV', state: 'measured' });
  await expect(notice(page, 2)).toHaveCount(0);
  await expect
    .poll(async () => {
      const block = (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === tf.blockId)!.row;
      return block.sheet.test.isolacao?.cells['2']?.[String(VOLTAGE_COL)]?.value;
    })
    .toEqual({ raw: '0.5', unit: 'kV', state: 'measured' });

  // --- the TC: no class, ±0,5 % and the helper; EXATIDÃO 1,2 judges 0,84 % Satisfatório ---
  await openSheet(page, relatorioId, tc.blockId);
  await goToStep(page, 'Ensaios', 'ensaios');
  const ttr = page.locator('table.ficha-ttr');
  await expect(page.locator('[data-class-helper]')).toHaveText(ACCURACY_CLASS_HELPER);
  await expect(ttr.locator('tbody tr').first().locator('td').last()).toContainText('Insatisfatório');
  expect(fieldOf(TC, 'exatidao').options).toEqual(['0,3', '0,6', '1,2', '3', '5P', '10P']);
  await pick(page, 'exatidao', '1,2');
  await expect(page.locator('.ficha-mt').filter({ has: ttr }).locator('.mt-criterion')).toHaveText(`Aceitável ${classCriterion('1,2')}`);
  await expect(ttr.locator('tbody tr').first().locator('td').last()).toContainText('Satisfatório');
  await expect(page.locator('[data-class-helper]')).toHaveCount(0);

  // --- a para-raio not tested for a defect ---
  await openSheet(page, relatorioId, para.blockId);
  await page.getByRole('button', { name: `Mais opções da ficha ${para.tag}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar não ensaiado' }).click();
  const dialog = page.getByRole('dialog', { name: 'Marcar não ensaiado' });
  await dialog.getByRole('radio', { name: DEFECT.label }).click();
  await dialog.getByRole('button', { name: 'Marcar não ensaiado' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.sheet-title .not-tested-chip')).toHaveText('Não ensaiado');
  await expect.poll(async () => (await lastWritten(page, `block/${para.blockId}/not_tested`)) as { reason?: string } | undefined).toMatchObject({ reason: DEFECT.key });

  // --- the DOCX ---
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId, 'Não apto');
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));

  const voltageTable = structure.tables.find((table) => table.some((cells) => cells.includes('TENSÃO (kV)')) && table.some((cells) => cells[0] === 'SECUNDÁRIO' && cells.includes('0,9')))!;
  expect(voltageTable, 'the transformer insulation table').toBeDefined();
  const header = voltageTable.find((cells) => cells.includes('TENSÃO (kV)'))!;
  expect(header.slice(0, 4)).toEqual(['LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)']);
  const rows = voltageTable.filter((cells) => ['PRIMÁRIO', 'SECUNDÁRIO'].includes(cells[0] ?? ''));
  expect(rows.map((cells) => cells[3])).toEqual(['5', '5', '0,5']);
  // e22g (review B1): the v12 transformer insulation table, too wide at 9 pt, prints one step smaller (8,5 to 7 pt), so
  // TENSÃO (kV) and every other word stay whole; its runs carry the size, the sheet text style keeps 9 pt.
  const documentXml = readZipEntries(await downloadBytes(download)).get('word/document.xml')!.toString('utf8');
  const sized = /<w:r>(?:(?!<\/w:r>).)*?<w:sz w:val="(\d+)"\/>(?:(?!<\/w:r>).)*?<w:t[^>]*>TENSÃO \(kV\)<\/w:t>/s.exec(documentXml);
  expect(sized, 'a sized TENSÃO (kV) run').not.toBeNull();
  expect(Number(sized![1])).toBeGreaterThanOrEqual(14);
  expect(Number(sized![1])).toBeLessThan(18);
  const text = JSON.stringify(structure);
  expect(text).toContain(classCriterion('1,2'));
  // The transformer's group select prints its new label; the TP and TC keep LIGAÇÃO SECUNDÁRIA as text.
  expect(text).toContain('DESLOCAMENTO ANGULAR');
  expect(text).toContain(DEFECT.justification!);
});
