import {
  blockConfigWithOption,
  defaultBlockConfig,
  evaluateSheetMeasurements,
  initialOrderKey,
  newEquipmentBlock,
  type JsonValue,
  getDefinition,
  measurementCounts,
  SEED_VERSION,
  sheetProgress,
  stepMissingLabel,
  type BlockRow,
  type EquipmentRow,
  type LocationRow,
  type MeasurementTest,
  type SheetStep,
  type TemplateRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { escapeDialog } from './support/dialogs.ts';
import { addLocal } from './support/local.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { newId } from '../apps/api/src/ids.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';
import { paletteTypes, typeLabels, typeRows } from './support/palette.ts';
import { expandLocation } from './support/tree.ts';

/*
 * 14.5-E2E. The Chave de transferência automática (CTA), the library type of seed v5 on the
 * measurement-table grammar, driven as a person would.
 *
 * 14.5-E2E-001 (1280 px): the Template composer adds one from "Outros equipamentos"; a
 * relatório is born from that template; its sheet is filled offline (configuration, the tests
 * switched off, the plate, the checklist with an NC chip and the bulk action, E1 with a pole
 * out of its relative limit, E4 with a setting left different and then equal, the E5 options
 * and times); the conclusion is suggested and confirmed; the relatório syncs and generates,
 * and the DOCX is read back from its own headings; a value typed once it is Emitido reopens it.
 * 14.5-E2E-002 (768 then 390 px): the field palette lists the type after the eight and creates
 * one offline; its first test value carries Em campo; at 390 px the E4 table is cards.
 *
 * 14.5-E2E-001 generates through the one queue and LibreOffice of the api, so the file is in
 * the serial group (`support/groups.ts`). Each test resets this worker's own Empresa B (E6-Q7).
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
  batch_id: string | null;
  relatorio_id: string | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

const CTA = 'chave_transferencia_automatica';
const CTA_NAME = 'Chave de transferência automática';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', CTA);
const E1 = 'cta_resistencia_contato';
const E2 = 'cta_isolamento_principal';
const E3 = 'cta_isolamento_controle';
const E4 = 'cta_ajustes_controlador';
const E5 = 'cta_transferencia';
const E6 = 'cta_termografia';
const NEW_TEMPLATE = 'Novo template';
const LOCAL = 'Geradores';
const OUTROS = 'Outros equipamentos';
const LIBRARY_SUMMARY = '17 itens · até 6 ensaios';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const MARK_SENT = 'Marcar como enviado ao cliente';

const testOf = (key: string): MeasurementTest => DEFINITION.measurement_tests!.find((test) => test.key === key)!;
const rowOf = (testKey: string, rowKey: string) => testOf(testKey).rows.findIndex((row) => row.key === rowKey);
const colOf = (testKey: string, columnKey: string) => testOf(testKey).columns.findIndex((column) => column.key === columnKey);
const cellPath = (blockId: string, testKey: string, rowKey: string, columnKey: string) => `sheet/${blockId}/test/${testKey}/cell/${rowOf(testKey, rowKey)}/${colOf(testKey, columnKey)}`;
const valuePath = (blockId: string, testKey: string, valueKey: string) => `sheet/${blockId}/test/${testKey}/value/${valueKey}`;
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });
const chosen = (optionKey: string) => ({ raw: optionKey, unit: null, state: 'measured' });

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const statusValues = async (page: Page, relatorioId: string) => (await outbox(page)).filter((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId).map((op) => op.value);
/** The value the outbox last holds for `path`; undefined when no op wrote it. */
const lastWritten = async (page: Page, path: string) => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value;
const toast = (page: Page) => page.getByTestId('toast');

// --- the Template composer ---------------------------------------------------------------

const palette = (page: Page) => page.getByRole('complementary', { name: 'Paleta de blocos' });
const localCard = (page: Page, name: string) =>
  page.getByRole('list', { name: 'Locais do template' }).locator(':scope > li.local-card').filter({ has: page.locator(':scope > .block-body .block-name', { hasText: new RegExp(`^${name}$`) }) });

async function openNewTemplate(page: Page): Promise<string> {
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome do template' })).toHaveValue(NEW_TEMPLATE);
  return new URL(page.url()).pathname.split('/')[2]!;
}

// --- the relatório tree ------------------------------------------------------------------

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');

async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
}

async function openSection9(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
}

// --- the sheet ---------------------------------------------------------------------------

const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
/**
 * Taps a step of the Section stepper and waits for the sheet to land on it: the surface scrolls to
 * the step and gives it the focus a few frames after the tap, and a list opened before that scroll
 * closes with it (React Aria closes a popover on any scroll of its trigger's ancestors).
 */
async function goToStep(page: Page, name: string, step: SheetStep): Promise<void> {
  await stepper(page).getByRole('button', { name: new RegExp(`^${name},`) }).click();
  await expect(page.locator(`#ficha-step-${step}`)).toBeFocused();
}
const field = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const checklistRow = (page: Page, n: number) => page.locator('#ficha-step-verificacoes li.checklist-row').nth(n - 1);
const configuracao = (page: Page) => page.locator('section[data-section="configuracao"]');
const testSection = (page: Page, testKey: string) => page.locator(`.lib-test[data-test-key="${testKey}"]`);
/** The one drawn input of a number cell (the table's, or its card's on phone). */
const cellInput = (page: Page, testKey: string, rowKey: string, columnKey: string) =>
  page.locator(`input[data-cell-input="${testKey}:${rowOf(testKey, rowKey)}:${colOf(testKey, columnKey)}"]`).filter({ visible: true });
const cellBox = (page: Page, testKey: string, rowKey: string, columnKey: string) =>
  page.locator(`.ficha-cell[data-cell="${testKey}:${rowOf(testKey, rowKey)}:${colOf(testKey, columnKey)}"]`).filter({ visible: true });
const tableRow = (page: Page, testKey: string, rowKey: string) => testSection(page, testKey).locator(`tr[data-row-key="${rowKey}"]`);
const testValue = (page: Page, testKey: string, valueKey: string) => testSection(page, testKey).locator(`[data-value-key="${valueKey}"], [data-field-key="${valueKey}"]`);

/** Types a reading into a cell and leaves it with Tab, as a person does: the blur commits it. */
async function typeCell(page: Page, testKey: string, rowKey: string, columnKey: string, text: string): Promise<void> {
  const input = cellInput(page, testKey, rowKey, columnKey);
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

// --- 14.5-E2E-001 ------------------------------------------------------------------------

test('@p0 14.5-E2E-001 at 1280: the composer adds a Chave de transferência automática from "Outros equipamentos"; its sheet is filled offline (configuration, tests off, plate, checklist, E1 out of its relative limit, E4 equality, E5 options) with Em campo in the first reading\'s batch; the DOCX prints it under "Outros equipamentos" after Transformadores; a value typed once Emitido reopens it', async ({
  page,
  context,
}) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const templateId = await openNewTemplate(page);

  // --- the Template composer: one local holding a transformer and, from "Outros equipamentos", one CTA ---
  await addLocal(page, { funcao: 'Distribuição', name: LOCAL });
  await expect(localCard(page, LOCAL)).toHaveCount(1);
  await expect(palette(page).locator('.pal-target')).toHaveText(`Toque para adicionar em: ${LOCAL}, direto no local`);
  await palette(page).getByRole('group', { name: 'Transformadores, 0' }).getByRole('button', { name: 'Mais um' }).click();
  // The library type comes after the eight, under its own heading, saying what it holds.
  const groups = palette(page).locator('.palette-group');
  await expect(groups.filter({ hasText: new RegExp(`^${OUTROS}$`) })).toHaveCount(1);
  const steppers = palette(page).locator('.palette-item.is-stepper');
  // E14-A3: the closed lists are the kernel's (seed v6 adds the Quadro elétrico after the CTA).
  const types = paletteTypes(SEED_VERSION);
  await expect(steppers).toHaveCount(types.seeded.length + types.library.length);
  const ctaStepper = steppers.nth(types.seeded.length + types.library.indexOf(CTA));
  await expect(ctaStepper.locator('.pi-text > span').first()).toHaveText(CTA_NAME);
  await expect(ctaStepper.locator('.pi-meta')).toHaveText(LIBRARY_SUMMARY);
  await palette(page).getByRole('group', { name: 'Chaves de transferência automática, 0' }).getByRole('button', { name: 'Mais um' }).click();
  const direct = localCard(page, LOCAL).locator(':scope > .block-expand > .loc-direct');
  await expect(direct.getByRole('group', { name: 'Chaves de transferência automática, 1' })).toBeVisible();
  await expect(direct.locator(`.qty-row[data-type="${CTA}"] .qty-name`)).toHaveText(CTA_NAME);
  await expect(page.locator('.composer-meta')).toHaveText('1 trafo · 1 chave de transferência automática');
  const template = (await entities<TemplateRow>(page)).find((record) => record.entity === 'template' && record.id === templateId)!.row;
  expect(template.seed_version).toBe(SEED_VERSION);
  expect(template.blocks.filter((block) => block.block_type === CTA).map((block) => block.quantity)).toEqual([1]);
  // The template reaches the server by "Sincronizar agora" (decision of record C-4), never by waiting for the 60 s tick.
  await syncNow(page);

  // --- a relatório from it: the CTA is born on the local with the kernel's TAG ---
  await page.goto('/');
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page, { template: NEW_TEMPLATE });
  const scope = { relatorioId };
  const records = await entities<LocationRow | BlockRow | EquipmentRow>(page);
  const localRow = records.filter((record) => record.entity === 'location').map((record) => record.row as LocationRow).find((row) => row.relatorio_id === relatorioId && row.kind === 'cabine')!;
  const tagOf = new Map(records.filter((record) => record.entity === 'equipment').map((record) => [record.id, (record.row as EquipmentRow).tag]));
  const sheets = records
    .filter((record) => record.entity === 'block')
    .map((record) => record.row as BlockRow)
    .filter((row) => row.relatorio_id === relatorioId && row.location_id !== null)
    .map((row) => ({ blockId: row.id, blockType: row.block_type, seedVersion: row.seed_version, locationId: row.location_id, tag: tagOf.get(row.equipment_id ?? '') ?? '' }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
  expect(sheets.map((sheet) => [sheet.tag, sheet.blockType, sheet.seedVersion, sheet.locationId])).toEqual([
    ['CTA-GERADORES', CTA, SEED_VERSION, localRow.id],
    ['TR-1', 'transformador_forca', SEED_VERSION, localRow.id],
  ]);
  const blockId = sheets[0]!.blockId;
  const tag = sheets[0]!.tag;
  await openSection9(page);
  await expandLocation(page, LOCAL);
  await expect(eqRow(page, tag).locator('.s9-eq-name')).toHaveText(CTA_NAME);

  // The office turns "Agrupar por tipo" on for the local, so section 9 prints its group titles,
  // and fills the local's own fields (no criterion of this story is about them; whichever sheet
  // is the local's first carries them in its Placa step). No status op comes with an office
  // push: the relatório stays Rascunho.
  await syncNowAndReturn(page);
  await pushDrafts(page, database, [
    officeDraft(account, scope, `location/${localRow.id}/agrupar_por_tipo`, true),
    officeDraft(account, scope, `location/${localRow.id}/se/type`, 'BLINDADA'),
    officeDraft(account, scope, `location/${localRow.id}/se/primary_kv`, measured('13.8', 'kV')),
    officeDraft(account, scope, `location/${localRow.id}/se/secondary_kv`, measured('380', 'V')),
    officeDraft(account, scope, `location/${localRow.id}/se/installed_kva`, measured('1500', 'kVA')),
    officeDraft(account, scope, `location/${localRow.id}/env/temperature_c`, measured('25', '°C')),
    officeDraft(account, scope, `location/${localRow.id}/env/humidity_pct`, measured('65', '%')),
  ]);
  await syncNowAndReturn(page);
  await expect(headerPill(page)).toHaveText('Rascunho');

  // --- the sheet, offline from here on ---
  await openSheet(page, relatorioId, blockId);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(CTA_NAME);
  await expect(page.locator('.sheet-header .sheet-title .lib-pill')).toHaveText('Tipo da biblioteca');
  await expect(page.locator('.sheet-header .sheet-meta').first()).toHaveText(LOCAL);
  await context.setOffline(true);

  // Configuração: four poles bring the neutral rows; three tests are switched off on the sheet.
  // Both are structure: block config puts, no status op, nothing said about the status.
  await expect(configuracao(page).getByRole('radiogroup', { name: 'Polos' }).getByRole('radio', { name: '3', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(tableRow(page, E1, 'polo_n')).toHaveCount(0);
  await configuracao(page).getByRole('radiogroup', { name: 'Polos' }).getByRole('radio', { name: '4', exact: true }).click();
  await expect(tableRow(page, E1, 'polo_n')).toBeVisible();
  // 2026-10-14 (Bruno): with four poles E2 draws the rows the kernel shows for the stored configuration, and no N-T row.
  const e2Shown = async (): Promise<string[]> => {
    const block = (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row;
    return evaluateSheetMeasurements(block, DEFINITION).find((test) => test.testKey === E2)!.rows.map((row) => row.key);
  };
  await expect.poll(async () => (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row.config).toMatchObject({ options: { polos: '4' } });
  const e2Keys = await e2Shown();
  // Every pole row of the seed is shown at four poles: the drawn list is the seed's list.
  expect(e2Keys).toEqual(testOf(E2).rows.map((row) => row.key));
  expect(await testSection(page, E2).locator('tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')))).toEqual(e2Keys);
  expect(e2Keys).not.toContain('n_t');
  await expect(tableRow(page, E2, 'n_t')).toHaveCount(0);
  await expect(testSection(page, E2).locator('tr', { hasText: 'N-T' })).toHaveCount(0);
  for (const [testKey, name] of [
    [E2, 'E2 · Isolamento principal nesta ficha'],
    [E3, 'E3 · Isolamento do controle nesta ficha'],
    [E6, 'E6 · Termografia sob carga nesta ficha'],
  ] as const) {
    const toggle = testSection(page, testKey).getByRole('switch', { name });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(testSection(page, testKey).locator('.lib-test-body')).toHaveCount(0);
    await expect(testSection(page, testKey).locator('.lib-off-note')).toBeVisible();
  }
  await expect(testSection(page, E2).locator('.lib-off-note')).toHaveText('Desligado — marque NA quando a chave não pode ser desenergizada.');
  // E4 and E5 cannot be switched off.
  await expect(testSection(page, E4).getByRole('switch')).toHaveCount(0);
  await expect(testSection(page, E5).getByRole('switch')).toHaveCount(0);
  await expect
    .poll(async () => (await lastWritten(page, `block/${blockId}/config`)) as { options?: Record<string, string>; sub_blocks?: Record<string, { enabled: boolean }> } | undefined)
    .toMatchObject({ options: { polos: '4' }, sub_blocks: { [E1]: { enabled: true }, [E2]: { enabled: false }, [E3]: { enabled: false }, [E6]: { enabled: false } } });
  expect(await statusValues(page, relatorioId)).toEqual([]);
  await expect(toast(page).filter({ hasText: 'Relatório em campo' })).toHaveCount(0);
  // What is left to read (E1 at four poles, E4 and E5; the three tests switched off ask for nothing) is the
  // kernel's count over the block as the device store holds it, never a number written in this spec.
  const ensaiosLeft = async (): Promise<number> => {
    const block = (await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row;
    const left = measurementCounts(evaluateSheetMeasurements(block, DEFINITION)).missing;
    // The Ensaios step of a sheet with measurement tests only is that count.
    expect(sheetProgress({ blocks: [block] }, blockId).steps.ensaios.missing).toBe(left);
    return left;
  };
  const leftBefore = await ensaiosLeft();
  expect(leftBefore).toBeGreaterThan(1);
  await expect(stepper(page).getByRole('button', { name: stepMissingLabel('Ensaios', leftBefore) })).toBeVisible();

  // The first reading on a Rascunho relatório carries Em campo in its own batch, and says so.
  await typeCell(page, E1, 'polo_a', 'lado_normal', '38');
  await expect(toast(page)).toContainText('Relatório em campo', { timeout: 15_000 });
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E1, 'polo_a', 'lado_normal'))).toEqual(measured('38', 'µΩ'));
  {
    const ops = await outbox(page);
    const edit = ops.find((op) => op.path === cellPath(blockId, E1, 'polo_a', 'lado_normal'))!;
    const status = ops.find((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId);
    expect(status).toMatchObject({ value: 'em_campo' });
    expect(edit.batch_id).not.toBeNull();
    expect(status!.batch_id).toBe(edit.batch_id);
  }
  // One required cell fewer, in the store and on the stepper.
  expect(await ensaiosLeft()).toBe(leftBefore - 1);
  await expect(stepper(page).getByRole('button', { name: stepMissingLabel('Ensaios', leftBefore - 1) })).toBeVisible();

  // E1: Lado Normal all within; on Lado Emergência the 63 of Polo C is 62 % above the 39 of Polo B.
  const e1: Record<string, [string, string]> = { polo_a: ['38', '40'], polo_b: ['41', '39'], polo_c: ['36', '63'], polo_n: ['52', '42'] };
  for (const [rowKey, [normal, emergencia]] of Object.entries(e1)) {
    if (rowKey !== 'polo_a') await typeCell(page, E1, rowKey, 'lado_normal', normal);
    await typeCell(page, E1, rowKey, 'lado_emergencia', emergencia);
  }
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      return Object.keys(e1).flatMap((rowKey) => ['lado_normal', 'lado_emergencia'].map((columnKey) => (ops.filter((op) => op.path === cellPath(blockId, E1, rowKey, columnKey)).at(-1)?.value as { raw?: string } | undefined)?.raw));
    })
    .toEqual(['38', '40', '41', '39', '36', '63', '52', '42']);
  // 2026-10-14 (Bruno): E1's test current, a value of the test written on its own path.
  const corrente = testValue(page, E1, 'corrente_ensaio').locator('input');
  await corrente.fill('100');
  await corrente.press('Tab');
  await expect.poll(async () => lastWritten(page, valuePath(blockId, E1, 'corrente_ensaio'))).toEqual(measured('100', 'A'));
  const outCells = testSection(page, E1).locator('.measurement-field[data-state="out-of-limit"]');
  await expect(outCells).toHaveCount(1);
  await expect(cellBox(page, E1, 'polo_c', 'lado_emergencia').locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellBox(page, E1, 'polo_c', 'lado_emergencia').locator('.mf-helper')).toContainText('62 % acima do menor do lado (39 µΩ) — critério ≤ 50 %');
  // The lowest of each side is shown under the table.
  await expect(testSection(page, E1).locator('tr.row-derived td.cell-point')).toHaveText('Menor do lado');
  await expect(testSection(page, E1).locator('tr.row-derived td.cell-calc')).toHaveText(['36 µΩ', '39 µΩ']);
  await expect(testSection(page, E1).locator('.mt-criterion')).toHaveText('≤ 50 % acima do menor do mesmo lado');

  // The plate: every field typed (the TAG comes from the block).
  await goToStep(page, 'Placa', 'placa');
  await field(page, 'fabricante').getByRole('combobox').fill('Fabricante CTA');
  await page.getByRole('option', { name: 'Criar “Fabricante CTA”' }).click();
  const plate: Record<string, string> = {
    identificacao: 'CTA-01',
    serie: 'TRX-300',
    n_de_catalogo: 'TRX3-0400-N4',
    n_de_serie: 'CT-448120',
    ano: '2021',
    tensao_nominal: '440',
    corrente_nominal: '400',
    frequencia: '60',
    wcr: '42',
    protecao_a_montante: 'Disjuntor 400 A',
    controlador_e_firmware: 'CG-7 v2.14',
    involucro: 'IP54',
    torque_dos_terminais: '45',
  };
  expect(Object.keys(plate).sort()).toEqual(DEFINITION.nameplate.map((f) => f.key).filter((key) => key !== 'tag' && key !== 'fabricante').sort());
  for (const [key, text] of Object.entries(plate)) {
    const input = field(page, key).locator('input');
    await input.fill(text);
    await input.press('Tab');
  }
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible({ timeout: 15_000 });
  expect(await lastWritten(page, `sheet/${blockId}/nameplate/corrente_nominal`)).toEqual(measured('400', 'A'));

  // The checklist: item 3 NC with a chip of the seed, then "Marcar os restantes como Conforme".
  const items = DEFINITION.checklist!;
  expect(items).toHaveLength(17);
  await goToStep(page, 'Verificações', 'verificacoes');
  await checklistRow(page, 3).getByRole('radiogroup', { name: `3. ${items[2]!.label}` }).getByRole('radio', { name: 'Não conforme' }).click();
  const phrase = items[2]!.nc_phrases[0]!;
  await checklistRow(page, 3).getByRole('group', { name: 'Observações sugeridas do item 3' }).getByRole('button', { name: phrase }).click();
  await expect(page.getByLabel('Observação do item 3', { exact: true })).toHaveValue(phrase);
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(toast(page)).toContainText('marcados Conforme');
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible({ timeout: 15_000 });
  expect(await lastWritten(page, `sheet/${blockId}/checklist/${items[2]!.key}/result`)).toBe('NC');
  expect(await lastWritten(page, `sheet/${blockId}/checklist/${items[2]!.key}/observation`)).toBe(phrase);

  // E4: every setting by Projeto, Encontrado and Deixado; a number with its row's unit, a
  // two-option row by its Segmented control, a four-option row by its select. TD 3A is found
  // and first left at the factory's 30 min, against the project's 5.
  await goToStep(page, 'Ensaios', 'ensaios');
  for (const row of testOf(E4).rows) {
    for (const columnKey of ['projeto', 'encontrado', 'deixado']) {
      const name = `${row.label}, ${columnKey.charAt(0).toUpperCase()}${columnKey.slice(1)}`;
      if (row.kind !== 'choice') await typeCell(page, E4, row.key, columnKey, row.key === 'td_3a' && columnKey !== 'projeto' ? '30' : '5');
      else if (row.options!.length === 2) await tableRow(page, E4, row.key).getByRole('radiogroup', { name, exact: true }).getByRole('radio', { name: row.options![0]!.label, exact: true }).click();
      else await tableRow(page, E4, row.key).getByRole('combobox', { name, exact: true }).selectOption({ label: row.options![1]!.label });
    }
  }
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      return testOf(E4).rows.flatMap((row) => ['projeto', 'encontrado', 'deixado'].map((columnKey) => ops.some((op) => op.path === cellPath(blockId, E4, row.key, columnKey)))).filter((written) => !written).length;
    })
    .toBe(0);
  expect(await lastWritten(page, cellPath(blockId, E4, 'falta_de_fase', 'projeto'))).toEqual(chosen('ligado'));
  expect(await lastWritten(page, cellPath(blockId, E4, 'exercitador', 'deixado'))).toEqual(chosen('semanal'));
  expect(await lastWritten(page, cellPath(blockId, E4, 'td_2e', 'projeto'))).toEqual(measured('5', 'min'));
  // Deixado different from Projeto is out of the criterion, on the Deixado cell.
  const deixado = cellBox(page, E4, 'td_3a', 'deixado');
  await expect(deixado.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(deixado.locator('.mf-helper')).toContainText('Diferente de Projeto (5 min)');
  await expect(cellBox(page, E4, 'td_3a', 'encontrado').locator('.mf-helper')).toHaveCount(0);
  // Left as the project says: within.
  await typeCell(page, E4, 'td_3a', 'deixado', '5');
  await expect(deixado.locator('.mf-helper')).toHaveCount(0);
  await expect(deixado.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E4, 'td_3a', 'deixado'))).toEqual(measured('5', 'min'));

  // E5: how the test was run (sheet values), the % only with "com carga", then the times.
  const e5 = testSection(page, E5);
  await expect(testValue(page, E5, 'carga_percentual')).toHaveCount(0);
  await e5.getByRole('radiogroup', { name: 'Método' }).getByRole('radio', { name: 'Falta real por abertura do disjuntor' }).click();
  await e5.getByRole('radiogroup', { name: 'Carga', exact: true }).getByRole('radio', { name: 'Com carga', exact: true }).click();
  await expect(e5.locator('.np-group')).toHaveText('Na Emergência, com carga');
  const percent = testValue(page, E5, 'carga_percentual').locator('input');
  await percent.fill('62');
  await percent.press('Tab');
  await e5.getByRole('radiogroup', { name: 'Fonte dos tempos' }).getByRole('radio', { name: 'Instrumento', exact: true }).click();
  await expect(e5.getByTestId('measurement-values-line')).toHaveText('Método: Falta real por abertura do disjuntor · Carga: Com carga (62 %) · Fonte dos tempos: Instrumento');
  // The Ajuste of "Até carga" and of "Falha da Emergência" is fixed text, never a field.
  await expect(tableRow(page, E5, 'ate_carga_na_emergencia').locator('td.cell-dim')).toHaveText('limite 10 s');
  await expect(tableRow(page, E5, 'falha_da_emergencia').locator('td.cell-dim')).toHaveText('—');
  const medidos: Record<string, string> = { falha_da_normal_ate_partida: '3,2', ate_carga_na_emergencia: '8,4', retransferencia: '5', resfriamento: '5', falha_da_emergencia: '0,9' };
  for (const [rowKey, text] of Object.entries(medidos)) await typeCell(page, E5, rowKey, 'medido', text);
  await expect
    .poll(async () => {
      const ops = await outbox(page);
      const last = (path: string) => ops.filter((op) => op.path === path).at(-1)?.value;
      return {
        metodo: last(valuePath(blockId, E5, 'metodo')),
        carga: last(valuePath(blockId, E5, 'carga')),
        carga_percentual: last(valuePath(blockId, E5, 'carga_percentual')),
        fonte_tempos: last(valuePath(blockId, E5, 'fonte_tempos')),
        ate_carga: last(cellPath(blockId, E5, 'ate_carga_na_emergencia', 'medido')),
        falha_da_emergencia: last(cellPath(blockId, E5, 'falha_da_emergencia', 'medido')),
      };
    })
    .toEqual({
      metodo: chosen('falta_real'),
      carga: chosen('com_carga'),
      carga_percentual: measured('62', '%'),
      fonte_tempos: chosen('instrumento'),
      ate_carga: measured('8.4', 's'),
      falha_da_emergencia: measured('0.9', 's'),
    });

  // Nothing required is left in the plate, the checklist and the readings.
  await expect(stepper(page).getByRole('button', { name: 'Placa, 0 faltando' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Verificações, 0 faltando' })).toBeVisible();
  await expect(stepper(page).getByRole('button', { name: 'Ensaios, 0 faltando' })).toBeVisible({ timeout: 15_000 });

  // The conclusion: suggested from the NC item and the out reading; its text names both.
  await goToStep(page, 'Conclusão', 'conclusao');
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Aprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Restrições' }).getByRole('radio', { name: 'Com restrições' })).toHaveAttribute('aria-checked', 'true');
  const text = page.getByRole('textbox', { name: 'Texto da conclusão' });
  await expect(text).toContainText(`chave de transferência automática ${tag}`);
  await expect(text).toContainText('Polo C, Lado Emergência (63 µΩ');
  await expect(text).toContainText(phrase);
  await expect(text).toContainText('(item 3, NC)');
  await page.locator('.suggestion-field.is-generated').getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(async () => lastWritten(page, `sheet/${blockId}/conclusion/text_status`)).toBe('confirmed');
  expect(await lastWritten(page, `sheet/${blockId}/conclusion/restriction`)).toBe('com_restricoes');
  // The counter of required fields is at zero.
  await expect(page.getByTestId('ficha-progress')).toHaveText('Ficha completa', { timeout: 15_000 });

  // --- back online: the test current (in the outbox on its path, above) survives a reload; then sync, generate, and read the DOCX ---
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(testValue(page, E1, 'corrente_ensaio').locator('input')).toHaveValue('100');
  // The device store holds it after the reload (the outbox may have pushed it by now).
  expect((await entities<BlockRow>(page)).find((record) => record.entity === 'block' && record.id === blockId)!.row.sheet.test[E1]?.values?.['corrente_ensaio']?.value).toEqual(measured('100', 'A'));
  await openSumario(page, relatorioId);
  await syncNowAndReturn(page);
  await expect(headerPill(page)).toHaveText('Em campo');
  await setParecer(page, relatorioId);
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  // The transformer's sheet was left empty.
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  expect(download.suggestedFilename()).toBe('relatorio-rev-1.docx');
  const structure = extractStructure(await downloadBytes(download));

  // The tests section, from its own heading to the next section's or the document's end (E7-A6).
  const level1 = structure.headings.filter((h) => h.level === 1).map((h) => h.text);
  const tests = level1.find((heading) => /^\d+ RELATÓRIOS DOS ENSAIOS$/.test(heading));
  expect(tests, `the Heading 1 list: ${JSON.stringify(level1)}`).toBeDefined();
  const number = tests!.split(' ')[0]!;
  const next = level1[level1.indexOf(tests!) + 1];
  const from = structure.paragraphs.lastIndexOf(tests!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  const section = structure.paragraphs.slice(from, to);
  // Two group titles for the local, each a Heading 2: Transformadores, then "Outros equipamentos".
  const level2 = structure.headings.filter((h) => h.level === 2 && h.text.startsWith(`${number}.`)).map((h) => h.text);
  expect(level2, JSON.stringify(level2)).toHaveLength(2);
  expect(level2[0]).toMatch(new RegExp(`^${number}\\.1 Transformadores`));
  expect(level2[1]).toMatch(new RegExp(`^${number}\\.2 ${OUTROS}`));
  const sheetTitle = `CHAVE DE TRANSFERÊNCIA AUTOMÁTICA ${tag}`;
  const order = [level2[0]!, 'TRANSFORMADOR DE FORÇA TR-1', level2[1]!, sheetTitle].map((part) => section.indexOf(part));
  expect(order.every((index) => index > -1), `every part of section 9 is printed: ${JSON.stringify(order)}`).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  // The sheet's parts in order; the three tests switched off print nothing.
  const sheet = section.slice(section.indexOf(sheetTitle));
  const parts = ['DADOS DO EQUIPAMENTO', 'CONFIGURAÇÃO', 'VERIFICAÇÕES GERAIS', 'E1 · RESISTÊNCIA DE CONTATO', 'E4 · AJUSTES DO CONTROLADOR', 'E5 · TRANSFERÊNCIA', 'CONCLUSÃO'].map((part) => sheet.indexOf(part));
  expect(parts.every((index) => index > -1), `every part of the sheet is printed: ${JSON.stringify(parts)}`).toBe(true);
  expect([...parts].sort((a, b) => a - b)).toEqual(parts);
  for (const off of ['E2 · ISOLAMENTO PRINCIPAL', 'E3 · ISOLAMENTO DO CONTROLE', 'E6 · TERMOGRAFIA SOB CARGA']) expect(section, off).not.toContain(off);

  /** The tables whose title band reads `title`. */
  const titled = (title: string) => structure.tables.filter((table) => table[0]?.[0] === title);
  const nameplate = titled('DADOS DO EQUIPAMENTO').find((table) => table[1]?.[2] === 'FABRICANTE');
  expect(nameplate?.[1]).toEqual(['IDENTIFICAÇÃO', 'CTA-01', 'FABRICANTE', 'Fabricante CTA', 'SÉRIE', 'TRX-300']);
  expect(nameplate?.[2]?.slice(0, 5)).toEqual(['Nº DE CATÁLOGO', 'TRX3-0400-N4', 'Nº DE SÉRIE', 'CT-448120', 'TAG']);
  expect(nameplate?.[3]).toEqual(['ANO', '2021', 'TENSÃO NOMINAL', '440 V', 'CORRENTE NOMINAL', '400 A']);
  expect(titled('CONFIGURAÇÃO')).toEqual([[['CONFIGURAÇÃO'], ['TENSÃO', 'BT', 'POLOS', '4', 'NEUTRO', 'SÓLIDO'], ['TRANSIÇÃO', 'ABERTA', 'BYPASS-ISOLATION', 'NÃO', '', '']]]);
  const checklist = titled('VERIFICAÇÕES GERAIS').find((table) => table[2]?.[0] === '1. PLACA CONFERE COM O PROJETO');
  expect(checklist).toHaveLength(2 + 17);
  expect(checklist![4]).toEqual(['3. TAMPAS E BARREIRAS FIXADAS, AVISO DE TRANSFERÊNCIA MANUAL PRESENTE', '', 'X', '', phrase]);
  expect(checklist!.slice(2).filter((row) => row[1] === 'X')).toHaveLength(16);
  expect(titled('E1 · RESISTÊNCIA DE CONTATO')).toEqual([
    [
      ['E1 · RESISTÊNCIA DE CONTATO'],
      ['INSTRUMENTO: -'],
      ['CORRENTE DE ENSAIO: 100 A'],
      ['ACEITÁVEL: ≤ 50 % acima do menor do mesmo lado · NETA 7.22.3 (fonte secundária)'],
      ['POLO', 'LADO NORMAL (µΩ)', 'LADO EMERGÊNCIA (µΩ)'],
      ['POLO A', '38', '40'],
      ['POLO B', '41', '39'],
      ['POLO C', '36', '63'],
      ['POLO N', '52', '42'],
      ['MENOR DO LADO', '36', '39'],
    ],
  ]);
  const [e5Table, ...moreE5] = titled('E5 · TRANSFERÊNCIA');
  expect(moreE5).toEqual([]);
  // The method line beside the times.
  expect(e5Table![1]).toEqual(['MÉTODO: FALTA REAL POR ABERTURA DO DISJUNTOR · CARGA: COM CARGA (62 %) · FONTE DOS TEMPOS: INSTRUMENTO']);
  expect(e5Table!.find((row) => row[0] === 'ATÉ CARGA NA EMERGÊNCIA')).toEqual(['ATÉ CARGA NA EMERGÊNCIA', 'limite 10 s', '8,4 s']);
  expect(e5Table!.find((row) => row[0] === 'FALHA DA NORMAL ATÉ PARTIDA')?.[2]).toBe('3,2 s');
  const [e4Table] = titled('E4 · AJUSTES DO CONTROLADOR');
  expect(e4Table!.find((row) => row[0] === 'TD 3A · RETRANSFERÊNCIA')).toEqual(['TD 3A · RETRANSFERÊNCIA', '-', '5 min', '30 min', '5 min']);
  expect(e4Table!.find((row) => row[0] === 'FALTA DE FASE')).toEqual(['FALTA DE FASE', '-', 'LIGADO', 'LIGADO', 'LIGADO']);
  // The conclusion: the pair marked and the confirmed paragraph, which names the out reading and the NC item.
  const conclusion = titled('CONCLUSÃO').at(-1)!;
  expect(conclusion[1]).toEqual(['APROVADO', 'X', 'REPROVADO', '', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']);
  expect(conclusion[2]![0]).toContain(`A chave de transferência automática ${tag}`);
  expect(conclusion[2]![0]).toContain('Polo C, Lado Emergência (63 µΩ');
  expect(conclusion[2]![0]).toContain('(item 3, NC)');

  // --- Emitido: a value typed on the issued relatório reopens it as Em revisão, in its own batch ---
  await escapeDialog(page, modal);
  await expect(headerPill(page)).toHaveText('Em revisão');
  await page.locator('.sticky-action-bar').getByRole('button', { name: MARK_SENT }).click();
  await expect(headerPill(page)).toHaveText('Emitido');
  await expect(toast(page)).toHaveText('Revisão 1 marcada como enviada ao cliente. Relatório emitido.', { timeout: 20_000 });
  await openSheet(page, relatorioId, blockId);
  const sheetBanner = 'Relatório emitido (revisão 1). Editar esta ficha reabre o relatório como Em revisão e gera a revisão 2.';
  await expect(page.locator('.banner-slot .banner')).toContainText(sheetBanner);
  const tensao = testValue(page, E5, 'tensao').locator('input');
  await tensao.scrollIntoViewIfNeeded();
  await tensao.fill('381');
  await tensao.press('Tab');
  await expect(toast(page)).toHaveText('Relatório reaberto em revisão. A próxima emissão gera a revisão 2.', { timeout: 20_000 });
  await expect(page.getByText(sheetBanner)).toHaveCount(0);
  {
    const ops = await outbox(page);
    const edit = ops.find((op) => op.path === valuePath(blockId, E5, 'tensao'));
    const reopened = ops.filter((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId).at(-1);
    expect(edit).toMatchObject({ value: measured('381', 'V') });
    expect(reopened).toMatchObject({ value: 'em_revisao' });
    expect(reopened!.batch_id).toBe(edit!.batch_id);
  }
  await openSumario(page, relatorioId);
  await expect(headerPill(page)).toHaveText('Em revisão');
});

// --- 14.5-E2E-002 ------------------------------------------------------------------------

test('@p0 14.5-E2E-002 at 768 then 390: offline, the field palette lists the eight and then "Outros equipamentos" with the type and its TAG, and one tap creates it; its sheet opens; the first test value on a Rascunho relatório carries Em campo; at 390 the E4 table is cards and nothing scrolls sideways', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  // A relatório of the standard template, born on seed v5 at the office, still Rascunho.
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await openSumario(page, relatorioId);
  await expect(headerPill(page)).toHaveText('Rascunho');
  await openSection9(page);
  await expandLocation(page, LOCAL);

  // The field palette, offline: the eight, then the library type with what it holds and its TAG.
  await context.setOffline(true);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const fieldPalette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(fieldPalette.locator('.palette-where')).toHaveText(`Em: ${LOCAL}`);
  const rows = fieldPalette.locator('.pf-field');
  // E14-A3: the rows are the kernel's for the relatório's seed version.
  await expect(rows).toHaveCount(typeLabels(SEED_VERSION).length);
  await expect(rows.locator('.pi-text > span:first-child')).toHaveText(typeLabels(SEED_VERSION));
  const ctaRow = typeRows(fieldPalette, [CTA]);
  const heading = fieldPalette.locator('.palette-group', { hasText: new RegExp(`^${OUTROS}$`) });
  await expect(heading).toHaveCount(1);
  // The heading sits between the eighth type and the library type.
  expect(await heading.evaluate((element) => (element.previousElementSibling?.classList.contains('palette-type') ?? false) && element.nextElementSibling?.getAttribute('data-block-type'))).toBe(CTA);
  const meta = (await ctaRow.locator('.pi-meta').innerText()).trim();
  expect(meta).toMatch(new RegExp(`^${LIBRARY_SUMMARY} · CTA-GERADORES(-\\d+)?$`));
  const tag = meta.slice(`${LIBRARY_SUMMARY} · `.length);
  await ctaRow.click();
  await expect(fieldPalette).toBeHidden();
  await expect(toast(page)).toContainText(`${tag} criada em ${LOCAL}`);
  await expect(eqRow(page, tag).locator('.s9-eq-name')).toHaveText(CTA_NAME);
  await expect(syncBadge(page)).not.toHaveAttribute('data-pending', '0');
  // The equipment and the block creates are in the outbox, the block on the relatório's seed version.
  const created = (await outbox(page)).filter((op) => op.kind === 'create');
  const blockCreate = created.find((op) => op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === CTA)!;
  expect(blockCreate.value).toMatchObject({ block_type: CTA, seed_version: SEED_VERSION, relatorio_id: relatorioId });
  const blockId = (blockCreate.value as { id: string }).id;
  expect(created.some((op) => op.path.startsWith('equipment/') && (op.value as { tag?: string; type?: string }).tag === tag && (op.value as { type?: string }).type === CTA)).toBe(true);
  // A palette add is structure: the relatório is still Rascunho.
  expect(await statusValues(page, relatorioId)).toEqual([]);

  // The sheet opens from its tree row.
  await eqRow(page, tag).locator('.s9-eq-open').click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(CTA_NAME);
  await expect(page.locator('.sheet-header .sheet-title .lib-pill')).toHaveText('Tipo da biblioteca');
  await expect(configuracao(page).getByRole('heading', { level: 2, name: 'Configuração' })).toBeVisible();
  await expect(page.locator('.lib-test h2')).toHaveText([
    'E1 · Resistência de contato',
    'E2 · Isolamento principal',
    'E3 · Isolamento do controle',
    'E4 · Ajustes do controlador',
    'E5 · Transferência',
    'E6 · Termografia sob carga',
  ]);

  // The first test value on a Rascunho relatório carries Em campo in its own batch, and says so.
  const metodo = testSection(page, E5).getByRole('radiogroup', { name: 'Método' });
  await metodo.getByRole('radio', { name: 'Botão de teste do controlador' }).click();
  await expect(metodo.getByRole('radio', { name: 'Botão de teste do controlador' })).toHaveAttribute('aria-checked', 'true');
  await expect(toast(page)).toContainText('Relatório em campo', { timeout: 15_000 });
  await expect(testSection(page, E5).getByTestId('measurement-values-line')).toHaveText('Método: Botão de teste do controlador (sem TD 1C)');
  {
    const ops = await outbox(page);
    const edit = ops.find((op) => op.path === valuePath(blockId, E5, 'metodo'));
    const status = ops.find((op) => op.path === 'relatorio/status' && op.relatorio_id === relatorioId);
    expect(edit).toMatchObject({ value: chosen('botao_teste') });
    expect(status).toMatchObject({ value: 'em_campo' });
    expect(edit!.batch_id).not.toBeNull();
    expect(status!.batch_id).toBe(edit!.batch_id);
  }
  // "Não realizado": the test was not run, so nothing of its table is asked for.
  await metodo.getByRole('radio', { name: 'Não realizado' }).click();
  await expect(testSection(page, E5)).toHaveAttribute('data-skipped', '');
  await expect(testSection(page, E5).locator('[data-missing-field]')).toHaveCount(0);
  await metodo.getByRole('radio', { name: 'Falta real por abertura do disjuntor' }).click();
  await expect(testSection(page, E5)).not.toHaveAttribute('data-skipped', '');

  // The continuous Enter run at 768, on the E1 table: Enter commits the reading and moves down the
  // column over the three poles the configuration shows, then to the first empty cell of the next column.
  const poloA = cellInput(page, E1, 'polo_a', 'lado_normal');
  await poloA.scrollIntoViewIfNeeded();
  await poloA.click();
  await expect(poloA).toHaveAccessibleName('Polo A, Lado Normal');
  await poloA.fill('38');
  await poloA.press('Enter');
  await expect(cellInput(page, E1, 'polo_b', 'lado_normal')).toBeFocused();
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E1, 'polo_a', 'lado_normal'))).toEqual(measured('38', 'µΩ'));
  await page.keyboard.type('41');
  await page.keyboard.press('Enter');
  await expect(cellInput(page, E1, 'polo_c', 'lado_normal')).toBeFocused();
  await page.keyboard.type('36');
  await page.keyboard.press('Enter');
  await expect(cellInput(page, E1, 'polo_a', 'lado_emergencia')).toBeFocused();
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E1, 'polo_c', 'lado_normal'))).toEqual(measured('36', 'µΩ'));
  // Epic 14 QA Q-3: a zero is refused at input on E1 (the criterion compares with the lowest of
  // the side): the field is invalid with the kernel's message and nothing is written.
  const emergencia = cellInput(page, E1, 'polo_a', 'lado_emergencia');
  const written = (await outbox(page)).length;
  await page.keyboard.type('0');
  await page.keyboard.press('Tab');
  await expect(emergencia).toHaveAttribute('aria-invalid', 'true');
  await expect(cellBox(page, E1, 'polo_a', 'lado_emergencia').locator('.helper')).toHaveText('Informe um valor maior que zero: o critério compara com o menor do lado');
  expect((await outbox(page)).length).toBe(written);
  expect((await outbox(page)).some((op) => op.path === cellPath(blockId, E1, 'polo_a', 'lado_emergencia'))).toBe(false);
  await emergencia.fill('');
  await emergencia.press('Tab');
  await expect(emergencia).not.toHaveAttribute('aria-invalid', 'true');
  // No reading of that cell was ever written: the zero never reached the outbox.
  expect((await outbox(page)).filter((op) => op.path === cellPath(blockId, E1, 'polo_a', 'lado_emergencia')).every((op) => op.value === null)).toBe(true);

  // At 768 the E4 table is a table; at 390 it is one card per setting, and the page never scrolls sideways.
  const e4 = testSection(page, E4);
  await e4.scrollIntoViewIfNeeded();
  await expect(e4.locator('table.measurement-table')).toBeVisible();
  await expect(e4.locator('.lib-cards')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(e4.locator('table.measurement-table')).toBeHidden();
  await expect(e4.locator('.lib-cards')).toBeVisible();
  await expect(e4.locator('.lib-cards .measurement-card')).toHaveCount(testOf(E4).rows.length);
  await expect(e4.locator('.lib-cards .measurement-card .card-point').first()).toHaveText('Normal · pickup de tensão');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // A card field writes the same cell the table writes.
  await typeCell(page, E4, 'td_1c', 'projeto', '3');
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E4, 'td_1c', 'projeto'))).toEqual(measured('3', 's'));
  // The Enter run on the cards: from the Projeto of one setting to the Projeto of the next, the
  // drawn input being the card's; past the last typed setting (the Exercitador is a choice, never
  // a stop) it goes to the first empty cell of the next column.
  const td2b = cellInput(page, E4, 'td_2b', 'projeto');
  await td2b.click();
  await td2b.fill('1');
  await td2b.press('Enter');
  const td3a = cellInput(page, E4, 'td_3a', 'projeto');
  await expect(td3a).toBeFocused();
  expect(await td3a.evaluate((input) => input.closest('.lib-cards .measurement-card') !== null)).toBe(true);
  await expect.poll(async () => lastWritten(page, cellPath(blockId, E4, 'td_2b', 'projeto'))).toEqual(measured('1', 's'));
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(cellInput(page, E4, 'td_2e', 'projeto')).toBeFocused();
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await expect(cellInput(page, E4, 'normal_pickup_de_tensao', 'encontrado')).toBeFocused();
  // A table of two value columns stays a table on phone (EXPERIENCE.md › Measurement table).
  const e1 = testSection(page, E1);
  await e1.scrollIntoViewIfNeeded();
  await expect(e1.locator('table.measurement-table')).toBeVisible();
  await expect(e1.locator('.lib-cards')).toHaveCount(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  // The configuration's long choices stack on phone; nothing is cut.
  await configuracao(page).scrollIntoViewIfNeeded();
  const neutro = configuracao(page).getByRole('radiogroup', { name: 'Neutro' });
  const boxes = await neutro.getByRole('radio').evaluateAll((radios) => radios.map((radio) => Math.round(radio.getBoundingClientRect().top)));
  expect(new Set(boxes).size).toBe(3);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await context.setOffline(false);
});

test('@p0 P020-E2E-004 P-6 at 390: a CTA with 4 polos, an E1 reading out of its relative limit, E2 filled and E5 "Não realizado" never scrolls the page sideways (top, at E1, at E5)', async ({ page }) => {
  test.setTimeout(150_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account.email);
  // A standard relatório (seed v5), Em campo, plus one CTA on Geradores in the production check's state, from the office.
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const geradores = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  let config = defaultBlockConfig(SEED_VERSION, CTA) as unknown as JsonValue;
  config = blockConfigWithOption(config, 'polos', '4');
  config = blockConfigWithOption(config, 'tensao', 'mt');
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: geradores.id,
    type: CTA,
    tag: 'CTA-APAGAR',
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(999),
    config,
  });
  const micro = (raw: string) => measured(raw, 'µΩ');
  const e1: [string, string, string][] = [
    ['polo_a', 'lado_normal', '50'],
    ['polo_b', 'lado_normal', '55'],
    // 60 % above the lowest of its side (50 µΩ), against ≤ 50 %: out of criterion.
    ['polo_c', 'lado_normal', '80'],
    ['polo_n', 'lado_normal', '52'],
    ['polo_a', 'lado_emergencia', '50'],
    ['polo_b', 'lado_emergencia', '51'],
    ['polo_c', 'lado_emergencia', '52'],
    ['polo_n', 'lado_emergencia', '53'],
  ];
  const e2 = testOf(E2).rows.flatMap((row) => testOf(E2).columns.filter((column) => row.fixed?.[column.key] === undefined).map((column) => [row.key, column.key] as const));
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
    officeDraft(account, scope, `block/${block.id}`, block, 'create'),
    ...e1.map(([row, column, raw]) => officeDraft(account, scope, cellPath(block.id, E1, row, column), micro(raw))),
    ...e2.map(([row, column]) => officeDraft(account, scope, cellPath(block.id, E2, row, column), measured('12.4', 'GΩ'))),
    officeDraft(account, scope, valuePath(block.id, E5, 'metodo'), chosen('nao_realizado')),
    // The production check's local: a long name beside its SE data squeezed the "Do local" line's
    // values, and "CONVENCIONAL" ran past the screen (P-6).
    officeDraft(account, scope, `location/${geradores.id}/name`, 'Cabine de transformação — 2° subsolo, bloco B'),
    officeDraft(account, scope, `location/${geradores.id}/se/type`, 'ALVENARIA - CONVENCIONAL'),
    officeDraft(account, scope, `location/${geradores.id}/se/primary_kv`, measured('13.8', 'kV')),
    officeDraft(account, scope, `location/${geradores.id}/se/secondary_kv`, measured('220', 'V')),
    officeDraft(account, scope, `location/${geradores.id}/se/installed_kva`, measured('500', 'kVA')),
    officeDraft(account, scope, `location/${geradores.id}/env/temperature_c`, measured('25', '°C')),
    officeDraft(account, scope, `location/${geradores.id}/env/humidity_pct`, measured('60', '%')),
  ]);
  await openSumario(page, built.relatorioId);
  await openSheet(page, built.relatorioId, block.id);
  await expect(page.locator(`.lib-test[data-test-key="${E1}"] h2`)).toHaveText('E1 · Resistência de contato');
  await expect(page.locator('.cabine-line .cl-name').first()).toHaveText('Cabine de transformação — 2° subsolo, bloco B');
  // Layout probe (P-6): the line breaks differently with each name, so the SE data must stay
  // inside the screen whatever room the name leaves it, from a full row down to a sliver.
  const sideways = await page.evaluate(() => {
    const name = document.querySelector<HTMLElement>('.cabine-line .cl-name')!;
    const original = name.textContent;
    const worst: number[] = [];
    for (let length = 8; length <= 48; length += 2) {
      name.textContent = 'Cabine de transformação, subsolo, bloco B, ala norte'.slice(0, length);
      worst.push(document.documentElement.scrollWidth - window.innerWidth);
    }
    name.textContent = original;
    return Math.max(...worst);
  });
  expect(sideways).toBeLessThanOrEqual(0);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // E1: Polo N drawn, the out reading's helper with "Marcar Com restrições" under it.
  const e1Section = testSection(page, E1);
  await e1Section.scrollIntoViewIfNeeded();
  await expect(tableRow(page, E1, 'polo_n')).toBeVisible();
  await expect(cellBox(page, E1, 'polo_c', 'lado_normal').locator('.mf-helper')).toContainText('60 % acima do menor do lado (50 µΩ)');
  await expect(cellBox(page, E1, 'polo_c', 'lado_normal').getByRole('button', { name: 'Marcar Com restrições' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  // E5: not run, its table dimmed.
  const e5Section = testSection(page, E5);
  await e5Section.scrollIntoViewIfNeeded();
  await expect(e5Section).toHaveAttribute('data-skipped', '');
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
