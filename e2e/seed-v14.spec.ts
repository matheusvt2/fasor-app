import { BASE_EQUIPMENT_BLOCK_TYPES, getDefinition, type BlockRow, type FieldDef, type JsonValue, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 24.2-E2E-001 (Story 24.2, seed v14 opens). A relatório created as a person creates it (Home ›
 * "Novo relatório" from the standard template) is born on v14: its row and every sheet in the
 * device's store say so. One sheet of each of the eight FO.SERV-03 types is filled (plate and
 * checklist, by rule from the v14 definition, pushed from the office device), each opens on the
 * device with its answers, and the relatório generates its DOCX through the api, which prints
 * every filled sheet. A v13 relatório beside it, filled the same way, still generates. At its
 * opening v14 equals v13, so nothing here judges a rule: the rules come with Stories 24.3 and 24.4.
 * Since seed v15 opened (Story 25.5) a new relatório is born on v15 (`seed-v15.spec.ts`), so the v14
 * relatório here is pushed on v14 from the office device, as the v13 one beside it is.
 * It generates through the one queue and LibreOffice of the api, so the file is in the serial group.
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

/** The first sheet of each of the eight types in the device's store, in their order. */
async function eightSheets(page: Page, relatorioId: string): Promise<BlockRow[]> {
  const blocks = (await entities<BlockRow>(page)).filter((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId && record.row.removed_at === null).map((record) => record.row);
  return BASE_EQUIPMENT_BLOCK_TYPES.map((type) => blocks.find((block) => block.block_type === type)!);
}

/** Opens each sheet on the device: its title shows, and its first checklist item reads C. */
async function openEach(page: Page, relatorioId: string, sheets: readonly BlockRow[]): Promise<void> {
  for (const block of sheets) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${block.id}`);
    await expect(page.locator('.sheet-header .sheet-title'), block.block_type).toBeVisible({ timeout: 30_000 });
    const definition = getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
    // An oil item reads NA on a dry unit whatever was stored, so the first item outside the oil rule is read.
    const first = definition.checklist!.find((item) => !(definition.oil_rule?.items ?? []).includes(item.key))!.key;
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

test('@p0 24.2-E2E-001 a v14 relatório (pinned since seed v15): one sheet of each of the eight types filled opens and prints in its DOCX; a v13 relatório beside it still generates', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- a v14 relatório, pushed on v14 (a new one is born on v15 since Story 25.5) ---
  const { relatorioId } = await pushNewRelatorio(page, account, database, { emCampo: true, seedVersion: 'v14' });
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version)
    .toBe('v14');
  const blocks = (await entities<BlockRow>(page)).filter((record) => record.entity === 'block' && record.row.relatorio_id === relatorioId).map((record) => record.row);
  expect(blocks.length).toBeGreaterThan(BASE_EQUIPMENT_BLOCK_TYPES.length);
  expect(new Set(blocks.map((block) => block.seed_version))).toEqual(new Set(['v14']));
  // The creation reaches the server before the office device fills it.
  await syncNowAndReturn(page);
  const v14Sheets = await eightSheets(page, relatorioId);
  expect(v14Sheets.map((block) => block.block_type)).toEqual([...BASE_EQUIPMENT_BLOCK_TYPES]);
  await pushDrafts(page, database, v14Sheets.flatMap((block) => fillDrafts(relatorioId, block)));
  await syncNowAndReturn(page);
  await openEach(page, relatorioId, v14Sheets);
  const v14Tags = await tagsOf(page, v14Sheets);

  const v14Docx = await generateDocx(page, relatorioId);
  const v14Text = JSON.stringify(v14Docx);
  for (const tag of v14Tags) expect(v14Text, tag).toContain(tag);
  expect(v14Text).toContain('Fabricante E2E');
  expect((await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === relatorioId)?.row.seed_version).toBe('v14');

  // --- a v13 relatório beside it, filled the same way, still generates ---
  const v13 = await pushNewRelatorio(page, account, database, { emCampo: true, seedVersion: 'v13' });
  await page.goto(`/relatorio/${v13.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);
  expect((await entities<{ seed_version: string }>(page)).find((record) => record.entity === 'relatorio' && record.id === v13.relatorioId)?.row.seed_version).toBe('v13');
  const v13Sheets = await eightSheets(page, v13.relatorioId);
  expect(new Set(v13Sheets.map((block) => block.seed_version))).toEqual(new Set(['v13']));
  await pushDrafts(page, database, v13Sheets.flatMap((block) => fillDrafts(v13.relatorioId, block)));
  await syncNowAndReturn(page);
  await openEach(page, v13.relatorioId, v13Sheets);
  const v13Tags = await tagsOf(page, v13Sheets);
  const v13Text = JSON.stringify(await generateDocx(page, v13.relatorioId));
  for (const tag of v13Tags) expect(v13Text, tag).toContain(tag);
  expect(v13Text).toContain('Fabricante E2E');
});
