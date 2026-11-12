import { BASE_EQUIPMENT_BLOCK_TYPES, equipmentTypesOf, getDefinition, SEED_VERSION, type BlockRow, type FieldDef, type JsonValue, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { outbox } from './support/e23t-flow.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { paletteTypes, typeRows } from './support/palette.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * 25.5-E2E-001 (Story 25.5, seed v15 opens). A relatório created as a person creates it (Home ›
 * "Novo relatório" from the standard template) is born on v15: its row and every sheet in the
 * device's store say so. The standard template places the eight FO.SERV-03 types; the five library
 * types v15 offers beside them are added from the field palette of a local, as a technician adds
 * them, each born on v15. One sheet of every type is filled (plate and checklist, by rule from the
 * v15 definition, pushed from the office device), each opens on the device with its answers, and the
 * relatório generates its DOCX through the api, which prints every filled sheet. A v14 relatório
 * beside it, filled the same way, still generates. At its opening v15 equals v14, so nothing here
 * judges a rule: the rules come with Stories 25.6 to 25.10. It generates through the one queue and
 * LibreOffice of the api, so the file is in the serial group.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}
interface EquipmentLike {
  id: string;
  tag: string;
}

const JOB_TIMEOUT = 150_000;
/** A local of the standard template the library types are added at. */
const LOCAL = 'Geradores';
/** The types v15 offers beyond the eight the standard template places, in palette order. */
const LIBRARY = equipmentTypesOf('v15').filter((type) => !(BASE_EQUIPMENT_BLOCK_TYPES as readonly string[]).includes(type));
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');

/** A plate value by kind, as a technician might type it; a select takes its first option. */
function plateValue(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `E2E-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante E2E';
    case 'number':
      return { raw: String(100 + n * 10), unit: field.unit ?? null, state: 'measured' };
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options![0]!;
  }
}

/** The plate and the checklist (every item C) of one sheet, by rule from its seed's definition. */
function fillDrafts(relatorioId: string, block: Pick<BlockRow, 'id' | 'block_type' | 'seed_version'>): OpDraft[] {
  const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  const scope = { relatorioId };
  return [
    ...definition.nameplate.map((field, n) => officeDraft(account, scope, `sheet/${block.id}/nameplate/${field.key}`, plateValue(field, n))),
    ...(definition.checklist ?? []).map((item) => officeDraft(account, scope, `sheet/${block.id}/checklist/${item.key}/result`, 'C')),
  ];
}

/** The live sheets of the relatório in the device's store. */
async function liveSheets(page: Page, relatorioId: string): Promise<BlockRow[]> {
  return (await entities<BlockRow>(page)).filter((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.removed_at === null).map((record) => record.row);
}

/** The first sheet of each of `types` in the device's store, in their order. */
async function oneOfEach(page: Page, relatorioId: string, types: readonly string[]): Promise<BlockRow[]> {
  const blocks = await liveSheets(page, relatorioId);
  return types.map((type) => blocks.find((block) => block.block_type === type)!);
}

/** Adds one sheet of `type` from the field palette of the local, as a technician does, and returns its create. */
async function addFromPalette(page: Page, type: string): Promise<BlockRow> {
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  const creates = async () => (await outbox(database, page)).filter((op) => op.kind === 'create' && op.path.startsWith('block/') && (op.value as { block_type?: string }).block_type === type);
  const before = (await creates()).length;
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.locator('.palette-where')).toHaveText(`Em: ${LOCAL}`);
  await typeRows(palette, [type]).click();
  await expect(palette).toBeHidden();
  await expect.poll(async () => (await creates()).length).toBe(before + 1);
  return (await creates()).at(-1)!.value as BlockRow;
}

/** Opens each sheet on the device: its title shows, and its first checklist item (when it has a list) reads C. */
async function openEach(page: Page, relatorioId: string, sheets: readonly BlockRow[]): Promise<void> {
  for (const block of sheets) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${block.id}`);
    await expect(page.locator('.sheet-header .sheet-title'), block.block_type).toBeVisible({ timeout: 30_000 });
    const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
    // An oil item reads NA on a dry unit whatever was stored, so the first item outside the oil rule is read.
    const first = (definition.checklist ?? []).find((item) => !(definition.oil_rule?.items ?? []).includes(item.key))?.key;
    if (first === undefined) continue;
    await expect(page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${first}"] [role="radio"][aria-checked="true"]`), block.block_type).toHaveAttribute('data-value', 'c');
  }
}

/** Issues revision 1 through the Export dialog and returns the DOCX's structure. */
async function generateDocx(page: Page, relatorioId: string): Promise<ReturnType<typeof extractStructure>> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId, 'Apto');
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(modal);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => modal.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  return extractStructure(await downloadBytes(download));
}

/** The TAGs of the given sheets, as the device's equipment rows hold them. */
async function tagsOf(page: Page, sheets: readonly BlockRow[]): Promise<string[]> {
  const equipment = (await entities<EquipmentLike>(page)).filter((record) => record.entity === 'equipment').map((record) => record.row);
  return sheets.map((block) => equipment.find((row) => row.id === block.equipment_id)!.tag);
}

/** The relatório row's seed version in the device's store. */
async function storedSeed(page: Page, relatorioId: string): Promise<string | undefined> {
  return (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version;
}

test('@p0 25.5-E2E-001 a new relatório is born on v15: one sheet of every type v15 offers filled opens and prints in its DOCX; a v14 relatório beside it still generates', async ({ page }) => {
  test.setTimeout(720_000);
  expect(SEED_VERSION).toBe('v15');
  // At its opening v15 offers v14's types; the library ones are the five beyond the standard template's eight.
  expect(equipmentTypesOf('v15')).toEqual(equipmentTypesOf('v14'));
  expect(LIBRARY).toHaveLength(5);
  for (const type of LIBRARY) expect(paletteTypes('v15').library, type).toContain(type);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the new relatório, created as a person creates it, is on v15 ---
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect.poll(() => storedSeed(page, relatorioId)).toBe('v15');
  const blocks = await liveSheets(page, relatorioId);
  expect(blocks.length).toBeGreaterThan(BASE_EQUIPMENT_BLOCK_TYPES.length);
  expect(new Set(blocks.map((block) => block.seed_version))).toEqual(new Set(['v15']));
  // The creation reaches the server before the office device fills it.
  await syncNowAndReturn(page);

  // --- the library types, added from the field palette, each born on v15 ---
  for (const type of LIBRARY) {
    const created = await addFromPalette(page, type);
    expect(created.seed_version, type).toBe('v15');
  }
  await syncNowAndReturn(page);
  const v15Sheets = await oneOfEach(page, relatorioId, equipmentTypesOf('v15'));
  expect(v15Sheets.map((block) => block?.block_type)).toEqual([...equipmentTypesOf('v15')]);
  expect(new Set(v15Sheets.map((block) => block.seed_version))).toEqual(new Set(['v15']));
  await pushDrafts(page, database, v15Sheets.flatMap((block) => fillDrafts(relatorioId, block)));
  await syncNowAndReturn(page);
  await openEach(page, relatorioId, v15Sheets);
  const v15Tags = await tagsOf(page, v15Sheets);

  const v15Text = JSON.stringify(await generateDocx(page, relatorioId));
  for (const tag of v15Tags) expect(v15Text, tag).toContain(tag);
  expect(v15Text).toContain('Fabricante E2E');
  expect(await storedSeed(page, relatorioId)).toBe('v15');

  // --- a v14 relatório beside it, filled the same way, still generates ---
  const v14 = await pushNewRelatorio(page, account, database, { emCampo: true, seedVersion: 'v14' });
  await page.goto(`/relatorio/${v14.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  expect(await storedSeed(page, v14.relatorioId)).toBe('v14');
  const v14Sheets = await oneOfEach(page, v14.relatorioId, BASE_EQUIPMENT_BLOCK_TYPES);
  expect(new Set(v14Sheets.map((block) => block.seed_version))).toEqual(new Set(['v14']));
  await pushDrafts(page, database, v14Sheets.flatMap((block) => fillDrafts(v14.relatorioId, block)));
  await syncNowAndReturn(page);
  await openEach(page, v14.relatorioId, v14Sheets);
  const v14Tags = await tagsOf(page, v14Sheets);
  const v14Text = JSON.stringify(await generateDocx(page, v14.relatorioId));
  for (const tag of v14Tags) expect(v14Text, tag).toContain(tag);
  expect(v14Text).toContain('Fabricante E2E');
  expect(await storedSeed(page, v14.relatorioId)).toBe('v14');
});
