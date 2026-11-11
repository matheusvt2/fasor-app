import { EMPTY_DEFINITION_CONTEXT, getDefinition, oilCrossingToastText, oilFieldExcusedReason, screenLabel, SEED_VERSION, type BlockRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { openStep, outbox, setUpRelatorio, testSection } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { typeRows } from './support/palette.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 24.11-E2E (Story 24.11, seed v14; Bruno's question 19 and Matheus's decision on the read-only oil
 * fields). Every list and every reason is the kernel's over the device's own rows.
 *
 * 24.11-E2E-001 (1024 px): two transformers added from the field palette of the local Geradores. The oil
 * unit (ÓLEO ISOLANTE) asks 17 items, VENTILAÇÃO FORÇADA, LIMPEZA DAS BOBINAS and TRINCAS NA RESINA NA
 * with no tap; VENTILAÇÃO FORÇADA answered NC wins over its NA and offers its point. The dry unit
 * (EPÓXI) shows the eight oil items NA, asks the three dry items, its oil sampling not applicable and
 * VOL. ÓLEO read-only with its reason. The DOCX prints both 17-row lists with those marks.
 * 24.11-E2E-002: on a v14 transformer the crossing to oil clears the answered dry items in the same batch
 * with the kernel's toast, and a crossing back to dry keeps an answer on a dry item; on a v12 dry TP and
 * transformer VOL. ÓLEO is read-only and empty with its reason, ÓLEO MINERAL makes it editable again.
 * The first issues a revision through the api's one queue and LibreOffice, so the file runs in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TF = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const RULE = TF.oil_rule!;
const OIL_VALUE = RULE.oil_values[0]!;
const DRY = RULE.dry_items!;
const LOCAL = 'Geradores';

const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const select = (page: Page, key: string): Locator => field(page, key).locator('select');
const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const listedItems = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-item-key')));
const blockOf = async (page: Page, blockId: string) => (await readStore<{ entity: string; id: string; row: BlockRow }>(page, database, 'entities')).find((record) => record.entity === 'block' && record.id === blockId)!.row;
/** A nameplate field drawn read-only, found by its screen label, and the helper under it. */
const readOnly = (page: Page, label: string) => page.locator('#ficha-nameplate').getByRole('textbox', { name: label, exact: true });
const readOnlyHelper = (page: Page, label: string) => page.locator('#ficha-nameplate .field', { has: page.getByRole('textbox', { name: label, exact: true }) }).locator('.helper');

async function pick(page: Page, key: string, option: string): Promise<void> {
  await select(page, key).selectOption(option);
  await expect(select(page, key)).toHaveValue(option);
}

/** Adds one transformer from the field palette of the local and returns its block id. */
async function addTransformer(page: Page, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === 'transformador_forca');
  const before = (await creates()).length;
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await typeRows(palette, ['transformador_forca']).click();
  await expect(palette).toBeHidden();
  await expect.poll(async () => (await creates()).length).toBe(before + 1);
  const block = (await creates()).at(-1)!.value as BlockRow;
  expect(block.seed_version).toBe('v14');
  await page.goto(`/relatorio/${relatorioId}/ficha/${block.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return block.id;
}

test('@p0 24.11-E2E-001 at 1024: a v14 oil transformer asks 17 items with the three dry ones NA (an NC answer wins), a dry one the eight oil items NA and the dry ones asked, its oil sampling NA and VOL. ÓLEO read-only; the DOCX prints both lists', async ({ page }) => {
  test.setTimeout(480_000);
  expect(SEED_VERSION).toBe('v14');
  const { relatorioId } = await setUpRelatorio(page, account, database);
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(TF.checklist).toHaveLength(17);

  // --- the oil unit ---
  const oilId = await addTransformer(page, relatorioId);
  expect(await listedItems(page)).toEqual(TF.checklist!.map((item) => item.key));
  await expect(row(page, 'ventiladores')).toContainText(screenLabel('VENTILAÇÃO FORÇADA'));
  await pick(page, 'tipo_de_isolacao', OIL_VALUE);
  for (const key of DRY) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  for (const key of RULE.items) await expect(checked(page, key), key).toHaveCount(0);
  expect((await outbox(database, page)).filter((op) => op.path.startsWith(`sheet/${oilId}/checklist/`))).toEqual([]);
  // VENTILAÇÃO FORÇADA answered NC with a chip: the stored answer wins, and the row offers its point.
  const ventilacao = TF.checklist!.findIndex((item) => item.key === 'ventiladores');
  const phrase = TF.checklist![ventilacao]!.nc_phrases[0]!;
  await row(page, 'ventiladores').getByRole('radio', { name: 'Não conforme' }).click();
  await row(page, 'ventiladores').getByRole('group', { name: `Observações sugeridas do item ${ventilacao + 1}` }).getByRole('button', { name: phrase }).click();
  await expect(checked(page, 'ventiladores')).toHaveAttribute('data-value', 'nc');
  await expect(row(page, 'ventiladores').getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  // The bulk action sets the unset rows only: the two other dry items keep their derived NA, never written.
  for (const key of ['limpeza_das_bobinas', 'trincas_na_resina']) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  const oil = await blockOf(page, oilId);
  expect(oil.sheet.checklist.limpeza_das_bobinas?.result?.value ?? null).toBeNull();
  expect(oil.sheet.checklist.tanque_e_aletas?.result?.value).toBe('C');

  // --- the dry unit ---
  const dryId = await addTransformer(page, relatorioId);
  await pick(page, 'tipo_de_isolacao', 'EPÓXI');
  for (const key of RULE.items) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');
  for (const key of DRY) await expect(checked(page, key), key).toHaveCount(0);
  await page.locator('#ficha-step-verificacoes .bulk-action-bar').getByRole('button', { name: 'Marcar os restantes como Conforme' }).click();
  await expect(page.getByTestId('toast')).toContainText('marcados Conforme');
  for (const key of DRY) await expect(checked(page, key), key).toHaveAttribute('data-value', 'c');
  // VOL. ÓLEO read-only and empty with the kernel's reason.
  const dry = await blockOf(page, dryId);
  const volLabel = screenLabel(TF.nameplate.find((one) => one.key === 'vol_oleo')!.label);
  const reason = oilFieldExcusedReason(dry, 'vol_oleo', EMPTY_DEFINITION_CONTEXT);
  expect(reason).toBe('Não se aplica: TIPO DE ISOLAÇÃO é EPÓXI.');
  await expect(readOnly(page, volLabel)).toHaveAttribute('aria-readonly', 'true');
  await expect(readOnlyHelper(page, volLabel)).toHaveText(reason!);
  // The oil sampling does not apply.
  await openStep(page, relatorioId, dryId, 'Ensaios');
  await expect(testSection(page, 'coleta_oleo')).toHaveAttribute('data-applicability', 'na');

  // --- the DOCX: both lists of 17 rows with their marks ---
  await setParecer(page, relatorioId, 'Apto com restrições');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number } }>(page, database, 'entities')).find((record) => record.entity === 'revision' && record.row.number === 1)!;
  const tables = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body())).tables;
  const lists = tables.filter((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS' && table.length === 2 + 17);
  const mark = (table: string[][], key: string) => {
    const at = TF.checklist!.findIndex((item) => item.key === key);
    const cells = table[2 + at]!;
    return cells[1] === 'X' ? 'C' : cells[2] === 'X' ? 'NC' : cells[3] === 'X' ? 'NA' : '';
  };
  const oilTable = lists.find((table) => table.some((cells) => cells[4] === phrase))!;
  expect(oilTable[2 + ventilacao]).toEqual([`${ventilacao + 1}. VENTILAÇÃO FORÇADA`, '', 'X', '', phrase]);
  expect(oilTable.slice(2).map((cells) => cells[0])).toEqual(TF.checklist!.map((item, n) => `${n + 1}. ${item.label}`));
  expect(mark(oilTable, 'tanque_e_aletas')).toBe('C');
  expect(['limpeza_das_bobinas', 'trincas_na_resina'].map((key) => mark(oilTable, key))).toEqual(['NA', 'NA']);
  const dryTable = lists.find((table) => table !== oilTable && RULE.items.every((key) => mark(table, key) === 'NA') && DRY.every((key) => mark(table, key) === 'C'))!;
  expect(dryTable, JSON.stringify(lists.map((table) => table.slice(2).map((cells) => cells.slice(1, 4).join(''))))).toBeDefined();
});

test('@p0 24.11-E2E-002 the crossing dry to oil clears the answered dry items in one batch with the kernel\'s toast, back to dry keeps a dry answer; on a v12 dry TP and transformer VOL. ÓLEO is read-only with its reason, ÓLEO MINERAL makes it editable', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId, sheets } = await setUpRelatorio(page, account, database);
  const tf = sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  await page.goto(`/relatorio/${relatorioId}/ficha/${tf.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });

  // EPÓXI: the three dry items answered (C, C, NC with a chip).
  await pick(page, 'tipo_de_isolacao', 'EPÓXI');
  await row(page, 'ventiladores').getByRole('radio', { name: 'Conforme', exact: true }).click();
  await row(page, 'limpeza_das_bobinas').getByRole('radio', { name: 'Conforme', exact: true }).click();
  const resin = TF.checklist!.findIndex((item) => item.key === 'trincas_na_resina');
  const phrase = TF.checklist![resin]!.nc_phrases[0]!;
  await row(page, 'trincas_na_resina').getByRole('radio', { name: 'Não conforme' }).click();
  await row(page, 'trincas_na_resina').getByRole('group', { name: `Observações sugeridas do item ${resin + 1}` }).getByRole('button', { name: phrase }).click();
  await expect.poll(async () => (await blockOf(page, tf.blockId)).sheet.checklist.trincas_na_resina?.observation?.value).toBe(phrase);
  for (const key of DRY) await expect(checked(page, key), key).not.toHaveAttribute('data-value', 'na');

  // To ÓLEO ISOLANTE: one batch clears their results and the observation, with the kernel's toast; they read NA.
  const before = await blockOf(page, tf.blockId);
  const expectedPaths = [
    ...DRY.map((key) => `sheet/${tf.blockId}/checklist/${key}/result`),
    `sheet/${tf.blockId}/checklist/trincas_na_resina/observation`,
  ];
  const toastText = oilCrossingToastText(
    expectedPaths.map((path) => ({ path, value: null })),
    { blocks: [before], files: [], equipment_types: undefined },
  );
  expect(toastText).toBe('3 itens de unidade a seco apagados');
  await pick(page, 'tipo_de_isolacao', OIL_VALUE);
  await expect(page.getByTestId('toast')).toContainText(toastText);
  {
    const ops = await outbox(database, page);
    const insulation = ops.filter((op) => op.path === `sheet/${tf.blockId}/nameplate/tipo_de_isolacao`).at(-1)! as { batch_id?: string | null };
    const batch = ops.filter((op) => (op as { batch_id?: string | null }).batch_id === insulation.batch_id).map((op) => op.path);
    expect(batch.sort()).toEqual([`sheet/${tf.blockId}/nameplate/tipo_de_isolacao`, ...expectedPaths].sort());
  }
  for (const key of DRY) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');

  // Back to dry with VENTILAÇÃO FORÇADA answered NC on the oil unit: the dry answer is kept.
  await row(page, 'ventiladores').getByRole('radio', { name: 'Não conforme' }).click();
  await expect(checked(page, 'ventiladores')).toHaveAttribute('data-value', 'nc');
  await pick(page, 'tipo_de_isolacao', 'Á SECO');
  await expect(checked(page, 'ventiladores')).toHaveAttribute('data-value', 'nc');
  await expect.poll(async () => (await blockOf(page, tf.blockId)).sheet.checklist.ventiladores?.result?.value).toBe('NC');

  // --- a v12 relatório: VOL. ÓLEO of a dry TP and transformer read-only with the reason ---
  const v12 = newRelatorioDrafts(account, { seedVersion: 'v12' });
  await pushDrafts(page, database, [...v12.drafts, emCampoDraft(account, v12.relatorioId)]);
  for (const type of ['tp', 'transformador_forca'] as const) {
    const definition = getDefinition('v12', 'cabine_primaria', type);
    const sheet = v12.sheets.find((one) => one.blockType === type)!;
    await page.goto(`/relatorio/${v12.relatorioId}/ficha/${sheet.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    const label = screenLabel(definition.nameplate.find((one) => one.key === 'vol_oleo')!.label);
    await expect(field(page, 'vol_oleo').locator('input')).toBeVisible();
    await pick(page, 'tipo_de_isolacao', 'EPÓXI');
    const block = await blockOf(page, sheet.blockId);
    expect(block.seed_version).toBe('v12');
    const reason = oilFieldExcusedReason(block, 'vol_oleo', EMPTY_DEFINITION_CONTEXT);
    expect(reason, type).toBe('Não se aplica: TIPO DE ISOLAÇÃO é EPÓXI.');
    await expect(readOnly(page, label), type).toHaveAttribute('aria-readonly', 'true');
    await expect(readOnlyHelper(page, label), type).toHaveText(reason!);
    await expect(page.locator('#ficha-nameplate [data-missing-field]').filter({ hasText: label })).toHaveCount(0);
    await pick(page, 'tipo_de_isolacao', definition.oil_rule!.oil_values[0]!);
    await expect(field(page, 'vol_oleo').locator('input'), type).toBeVisible();
  }
});
