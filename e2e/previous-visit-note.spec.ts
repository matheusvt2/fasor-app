import {
  buildSnapshot,
  cellAddressesOf,
  EMPTY_DEFINITION_CONTEXT,
  entityKey,
  evaluateTest,
  getDefinition,
  historyNoteText,
  instantiateTemplate,
  SEED_VERSION,
  standardTemplate,
  testHistoryItems,
  visitContextOf,
  type Entity,
  type EntityRow,
  type EquipmentRow,
  type LastResults,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 24.16 (batch e24p, seed v14): the drops and rises against the previous visit, as one note line
 * under the printed table. Relatório A of an obra (service ended 08/09/2026) is issued through the real
 * generate job with the breaker's poles at 40, 44 and 44 µΩ and the oil transformer's AT row at 10 GΩ
 * (20 °C of oil). Relatório B of the same obra, typed as a person at 1280 px: the breaker's pole A at
 * 61 µΩ (+52,5 %, out by its rise) and the transformer's AT row at 4 GΩ (a 60 % drop, restricted). B's
 * DOCX prints one line under the breaker's contact table and one under the transformer's insulation
 * table, each naming the row, the reason and the values, the date in the reasons and the headers being
 * A's visit. Every expected word is the kernel's over the device's own rows. It issues two revisions
 * through the api's one queue and LibreOffice, so it runs in the queue lane. Every value is invented.
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

const CONTACT = 'resistencia_contato';
const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const outbox = (page: Page) => readStore<{ path: string; value: unknown }>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const DISJUNTOR = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const POLES = cellAddressesOf(DISJUNTOR, CONTACT);
const AT = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;
const cellOf = (page: Page, testKey: string, address: { row: number; col: number }): Locator =>
  page.locator(`section[data-test-key="${testKey}"] .ficha-cell[data-cell="${testKey}:${address.row}:${address.col}"]`).filter({ visible: true });

async function deviceSnapshot(page: Page, relatorioId: string): Promise<RelatorioSnapshot> {
  const records = await entities(page);
  return buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as unknown as EntityRow])), relatorioId);
}

/** Issues revision 1 of `relatorioId` from its Sumário and returns the DOCX's structure. */
async function issue(page: Page, relatorioId: string): Promise<DocxStructure> {
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
  return extractStructure(Buffer.from(await response.body()));
}

/** The transformer's plate at 20 °C of oil, from the office. */
const oilAt20 = (relatorioId: string, blockId: string): OpDraft[] => [
  officeDraft(account, { relatorioId }, `sheet/${blockId}/nameplate/tipo_de_isolacao`, 'ÓLEO ISOLANTE'),
  officeDraft(account, { relatorioId }, `sheet/${blockId}/nameplate/temperatura_oleo_c`, { raw: '20', unit: '°C', state: 'measured' }),
];

/** Types `values` into a sheet's cells from `first` down, in one Enter run, and waits for each in the outbox. */
async function typeRun(page: Page, sheetPath: string, testKey: string, addresses: readonly { row: number; col: number }[], values: readonly string[], unit: string): Promise<void> {
  await cellOf(page, testKey, addresses[0]!).locator('input.mf-value').click();
  for (const value of values) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  for (const [i, value] of values.entries()) {
    const path = `${sheetPath}/test/${testKey}/cell/${addresses[i]!.row}/${addresses[i]!.col}`;
    const raw = value.replace(/[^\d.]/g, '');
    await expect.poll(async () => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value)).toEqual([{ raw, unit, state: 'measured' }]);
  }
}

test('@p0 24.16-E2E-001 relatório B of the obra with a contact rise and an insulation drop since A: its DOCX prints one note line under each table, naming the row, the reason and the values', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  expect(SEED_VERSION).toBe('v14');

  // Relatório A: the breaker's poles at 40, 44 and 44 µΩ, the transformer's AT row at 10 GΩ (20 °C), issued.
  const a = newRelatorioDrafts(account);
  const djA = a.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const trA = a.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const blockRows = (drafts: readonly OpDraft[]) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null });
  const djEquipment = blockRows(a.drafts).find((row) => row.id === djA.blockId)!.equipment_id!;
  const trEquipment = blockRows(a.drafts).find((row) => row.id === trA.blockId)!.equipment_id!;
  await pushDrafts(page, database, [
    ...a.drafts,
    ...['40', '44', '44'].map((raw, i) => officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${djA.blockId}/test/${CONTACT}/cell/${POLES[i]!.row}/${POLES[i]!.col}`, { raw, unit: 'µΩ', state: 'measured' })),
    ...oilAt20(a.relatorioId, trA.blockId),
    officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${trA.blockId}/test/isolacao/cell/${AT.row}/${AT.col}`, { raw: '10', unit: 'GΩ', state: 'measured' }),
  ]);
  await issue(page, a.relatorioId);

  // Relatório B of the same obra, its TAGs bound to the obra's equipment, its transformer's plate at 20 °C.
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  const b = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: a.projectId },
    { service_start: '2026-11-09', service_end: '2026-11-10', existingEquipment: equipment, responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const djB = blockRows(b.drafts).find((row) => row.equipment_id === djEquipment)!;
  const trB = blockRows(b.drafts).find((row) => row.equipment_id === trEquipment)!;
  await pushDrafts(page, database, [...b.drafts, ...oilAt20(b.relatorioId, trB.id)]);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  for (const id of [djEquipment, trEquipment]) {
    await expect
      .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === id)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
      .toBe(a.relatorioId);
  }

  // B typed as a person: the breaker's poles at 61, 45 and 44 µΩ; the transformer's AT row at 4 GΩ.
  await page.goto(`/relatorio/${b.relatorioId}/ficha/${djB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await typeRun(page, `sheet/${djB.id}`, CONTACT, POLES, ['61', '45', '44'], 'µΩ');
  await page.goto(`/relatorio/${b.relatorioId}/ficha/${trB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await typeRun(page, `sheet/${trB.id}`, 'isolacao', [AT], ['4G'], 'GΩ');

  // The kernel's lines over the device's rows: the rise on pole A, the drop on the AT row, both naming A's visit (08/09/2026).
  const snapshot = await deviceSnapshot(page, b.relatorioId);
  const lineOf = (blockId: string, definition: typeof DISJUNTOR, testKey: string) => {
    const block = snapshot.blocks.find((row) => row.id === blockId)!;
    return historyNoteText(testHistoryItems(evaluateTest(block, definition, definition.tests.find((test) => test.key === testKey)!, visitContextOf(snapshot, block))));
  };
  const riseLine = lineOf(djB.id, DISJUNTOR, CONTACT)!;
  const dropLine = lineOf(trB.id, TRANSFORMER, 'isolacao')!;
  expect(riseLine).toMatch(/^Em relação à manutenção anterior: .+, alta de 52,5 % sobre 40 µΩ da manutenção anterior, rev\. 1 de 08\/09\/2026, acima do limite de 50 %\.$/u);
  expect(dropLine).toMatch(/^Em relação à manutenção anterior: .+, queda de mais de 50 % desde a manutenção anterior \(de 10 GΩ para 4 GΩ, a 20 °C\)\.$/u);

  // B's DOCX: each line right after its table; the tables carry A's visit date under MANUT. ANTERIOR.
  const structure = await issue(page, b.relatorioId);
  expect(structure.paragraphs).toContain(riseLine);
  expect(structure.paragraphs).toContain(dropLine);
  expect(structure.paragraphs.filter((text) => text.startsWith('Em relação à manutenção anterior:'))).toHaveLength(2);
  const contact = structure.tables.find((table) => table[0]?.includes('VALORES (µΩ)') && table[0]?.at(-1) === 'MANUT. ANTERIOR\n08/09/2026');
  expect(contact).toBeDefined();
  expect(contact!.slice(1).map((row) => row.at(-1))).toEqual(['40 µΩ', '44 µΩ', '44 µΩ']);
  expect(structure.tables.some((table) => table.some((row) => row.includes('MANUT. ANTERIOR')))).toBe(false);
});
