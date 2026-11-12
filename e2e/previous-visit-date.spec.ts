import { EMPTY_DEFINITION_CONTEXT, cellAddressesOf, getDefinition, instantiateTemplate, previousResultsFor, standardTemplate, type EquipmentRow, type LastResults, type OpDraft } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 24.15 (batch e24p, contract 46): the previous visit's date, as a person meets it at 1280 px on
 * seed v14 (pinned since seed v15 opened, Story 25.5). Relatório A of an obra, its service from 12 to 14/03/2026, is issued through
 * the real generate job with 4,9 GΩ on the transformer's first insulation row: the equipment's
 * `last_results` keeps 2026-03-14 beside the issue instant. Relatório B of the same obra opens the
 * transformer's sheet: "Anterior: 4,9 GΩ (rev. 1, 14/03/2026)"; its DOCX prints "14/03/2026" under
 * MANUT. ANTERIOR. Then the older visit issued late: B (September) issued first, A (March) after: B
 * stays the previous visit, A is kept as B's prior, and a later C reads B. Each test issues
 * revisions through the api's one queue and LibreOffice, so the spec runs in the queue lane
 * (`e2e/support/groups.ts`). Every value is invented.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const TRANSFORMER = getDefinition('v14', 'cabine_primaria', 'transformador_forca');
const FIRST = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;

/** Issues revision 1 of `relatorioId` from its Sumário and returns the DOCX's tables. */
async function issue(page: Page, relatorioId: string): Promise<string[][][]> {
  // Nothing is concluded, so the parecer is tapped before issuing (e22f S5).
  await setParecer(page, relatorioId);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await entities(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1)!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body())).tables;
}

const blockRows = (drafts: readonly OpDraft[]) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null });

/** Relatório A of a new obra on seed v14, its service dates set from the office, and its transformer's equipment. */
function relatorioA(start: string, end: string) {
  const a = newRelatorioDrafts(account, { seedVersion: 'v14' });
  const trA = a.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const equipmentId = blockRows(a.drafts).find((row) => row.id === trA.blockId)!.equipment_id!;
  const service: OpDraft[] = [
    officeDraft(account, { relatorioId: a.relatorioId }, 'relatorio/setup/service_start', start),
    officeDraft(account, { relatorioId: a.relatorioId }, 'relatorio/setup/service_end', end),
  ];
  return { ...a, trA, equipmentId, service };
}

/** Another relatório of the same obra, its TAGs bound to the obra's equipment. */
function nextRelatorio(a: { drafts: readonly OpDraft[]; projectId: string }, start: string, end: string) {
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  return instantiateTemplate(
    standardTemplate({ id: newId(), seedVersion: 'v14' }),
    { id: a.projectId },
    { service_start: start, service_end: end, existingEquipment: equipment, responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
}

const reading = (relatorioId: string, blockId: string, raw: string): OpDraft =>
  officeDraft(account, { relatorioId }, `sheet/${blockId}/test/isolacao/cell/${FIRST.row}/${FIRST.col}`, { raw, unit: 'GΩ', state: 'measured' });

const lastResultsOf = async (page: Page, equipmentId: string) => (await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)?.row.last_results as LastResults | null | undefined;

/** The "Anterior" line under the transformer's first insulation cell of a sheet. */
async function helperOf(page: Page, relatorioId: string, blockId: string) {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  return page.locator(`.ficha-cell[data-cell="isolacao:${FIRST.row}:${FIRST.col}"]`).filter({ visible: true }).locator('.mf-helper[data-previous]');
}

test('@p0 24.15-E2E-001 relatório A, its service ended on 14/03/2026, issued: the entry keeps 2026-03-14; relatório B of the obra shows "Anterior: 4,9 GΩ (rev. 1, 14/03/2026)" and its DOCX prints 14/03/2026 under MANUT. ANTERIOR', async ({ page }) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  const a = relatorioA('2026-03-12', '2026-03-14');
  // Pinned to v14 since seed v15 opened (Story 25.5): this walk asserts v14 sheets; v15 changes them story by story.
  await pushDrafts(page, database, [...a.drafts, ...a.service, reading(a.relatorioId, a.trA.blockId, '4.9')]);
  await issue(page, a.relatorioId);

  // The issue kept the visit's date (its service end) beside the issue instant.
  await expect.poll(async () => (await lastResultsOf(page, a.equipmentId))?.relatorio_id ?? null, { timeout: 30_000 }).toBe(a.relatorioId);
  const last = (await lastResultsOf(page, a.equipmentId))!;
  expect(last.service_date).toBe('2026-03-14');
  expect(last.issued_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

  // Relatório B of the obra: the helper names the visit's date, the cell stays empty.
  const b = nextRelatorio(a, '2026-11-02', '2026-11-03');
  const trB = blockRows(b.drafts).find((row) => row.equipment_id === a.equipmentId)!;
  await pushDrafts(page, database, b.drafts);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const helper = await helperOf(page, b.relatorioId, trB.id);
  await expect(helper).toHaveText('Anterior: 4,9 GΩ (rev. 1, 14/03/2026)');

  // B's DOCX: the transformer's insulation table prints the date under MANUT. ANTERIOR; no header is left undated.
  const tables = await issue(page, b.relatorioId);
  const insulation = tables.filter((table) => table[0]?.[0] === 'PONTO DE ENSAIO/CONEXÃO' && table[1]?.at(-1) === 'MANUT. ANTERIOR\n14/03/2026');
  expect(insulation).toHaveLength(1);
  expect(insulation[0]![2]!.at(-1)).toBe('4,9 GΩ');
  expect(tables.some((table) => table.some((row) => row.includes('MANUT. ANTERIOR')))).toBe(false);
});

test('24.15-E2E-002 the older visit issued late: B (service in September) issued first, A (service in March) after; B stays the previous visit with A as its prior, and a later C reads B', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Two relatórios of one obra, A in March (4,9 GΩ) and B in September (6,2 GΩ).
  const a = relatorioA('2026-03-12', '2026-03-14');
  const b = nextRelatorio(a, '2026-09-28', '2026-09-30');
  const trB = blockRows(b.drafts).find((row) => row.equipment_id === a.equipmentId)!;
  await pushDrafts(page, database, [...a.drafts, ...a.service, reading(a.relatorioId, a.trA.blockId, '4.9'), ...b.drafts, reading(b.relatorioId, trB.id, '6.2')]);

  // B issued first, then A, the older visit, issued late.
  await issue(page, b.relatorioId);
  await expect.poll(async () => (await lastResultsOf(page, a.equipmentId))?.relatorio_id ?? null, { timeout: 30_000 }).toBe(b.relatorioId);
  // Fix batch e24x (D3): A, still open, never reads the later B as its previous visit.
  const helperA = await helperOf(page, a.relatorioId, a.trA.blockId);
  // A positive anchor first (A's own reading in that very cell), so the count is read on the rendered row.
  await expect(page.locator(`.ficha-cell[data-cell="isolacao:${FIRST.row}:${FIRST.col}"]`).filter({ visible: true }).locator('input.mf-value')).toHaveValue(/4,9/);
  await expect(helperA).toHaveCount(0);
  const tablesA = await issue(page, a.relatorioId);
  // A's document prints its own 4,9 GΩ and never B's 6,2 GΩ under MANUT. ANTERIOR.
  expect(JSON.stringify(tablesA)).toMatch(/(^|[^\d,])4,9(?![\d])/);
  expect(JSON.stringify(tablesA)).not.toMatch(/(^|[^\d,])6,2(?![\d])/);
  await expect.poll(async () => (await lastResultsOf(page, a.equipmentId))?.prior?.relatorio_id ?? null, { timeout: 30_000 }).toBe(a.relatorioId);
  const last = (await lastResultsOf(page, a.equipmentId))!;
  expect(last).toMatchObject({ relatorio_id: b.relatorioId, service_date: '2026-09-30', prior: { relatorio_id: a.relatorioId, service_date: '2026-03-14' } });
  // B's sheets read A as their previous visit; C reads B.
  const block = { block_type: 'transformador_forca' };
  expect(previousResultsFor({ last_results: last }, block, b.relatorioId)?.relatorio_id).toBe(a.relatorioId);
  expect(previousResultsFor({ last_results: last }, block, a.relatorioId, '2026-03-14')).toBeNull();

  const c = nextRelatorio(a, '2026-11-09', '2026-11-10');
  const trC = blockRows(c.drafts).find((row) => row.equipment_id === a.equipmentId)!;
  await pushDrafts(page, database, c.drafts);
  await page.goto(`/relatorio/${c.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await expect(await helperOf(page, c.relatorioId, trC.id)).toHaveText('Anterior: 6,2 GΩ (rev. 1, 30/09/2026)');
});
