import {
  buildSnapshot,
  cellAddressesOf,
  conclusionFloorReasonText,
  EMPTY_DEFINITION_CONTEXT,
  entityKey,
  evaluateTest,
  getDefinition,
  instantiateTemplate,
  standardTemplate,
  visitContextOf,
  type Entity,
  type EntityRow,
  type EquipmentRow,
  type LastResults,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 23.6 (seed v13, decision C; Base rev08 TR-OL-02; contract 36): the previous visit's corrected
 * value judges, over two relatórios of one obra at 1280 px. Relatório A's oil transformer, at 20 °C of
 * oil, reads 10 GΩ on its AT row and is issued through the real generate job: the equipment's
 * `last_results` carries the reading corrected to 20 °C. Relatório B of the same obra, its plate at
 * 20 °C too, reads 4 GΩ on that row (a 60 % drop, within its > 400 MΩ): the row is restricted, the
 * helper naming the previous revision and its value at 20 °C, beside Story 22.12's "Anterior" line; the
 * floor is Aprovado · Com restrições. B's DOCX prints the 20 °C column, MANUT. ANTERIOR with A's value,
 * and the restricted test in section 8. Every expected word is the kernel's over the device's own rows.
 * It issues two revisions through the api's one queue and LibreOffice, so it runs in the serial group.
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
const row8 = (page: Page) => page.locator('li.sum-row[data-row="section_8"]');
const TRANSFORMER = getDefinition('v13', 'cabine_primaria', 'transformador_forca');
const AT = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;

async function deviceSnapshot(page: Page, relatorioId: string): Promise<RelatorioSnapshot> {
  const records = await entities(page);
  return buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as unknown as EntityRow])), relatorioId);
}

/** Issues the next revision of `relatorioId` from its Sumário and returns the DOCX's structure. */
async function issue(page: Page, relatorioId: string, number: number): Promise<DocxStructure> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText(`Revisão ${number} pronta — DOCX e PDF`, { timeout: 150_000 });
  await escapeDialog(page, dialog);
  const revision = (await entities(page)).find((record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === number)!;
  const response = await page.request.get(`/api/revisions/${revision.id}/docx`);
  expect(response.status()).toBe(200);
  return extractStructure(Buffer.from(await response.body()));
}

/** The transformer's plate at 20 °C of oil, from the office: no plate voltage, so every row asks the seeded > 400 MΩ. */
const oilAt20 = (relatorioId: string, blockId: string): OpDraft[] => [
  officeDraft(account, { relatorioId }, `sheet/${blockId}/nameplate/tipo_de_isolacao`, 'ÓLEO ISOLANTE'),
  officeDraft(account, { relatorioId }, `sheet/${blockId}/nameplate/temperatura_oleo_c`, { raw: '20', unit: '°C', state: 'measured' }),
];

test('@p0 23.6-E2E-003 relatório A issued at 10 GΩ (20 °C); relatório B of the obra at 4 GΩ (20 °C): restricted by the drop, the helper naming rev. 1 and its value at 20 °C; B\'s DOCX prints the 20 °C column and MANUT. ANTERIOR, and no automatic point in section 8 (fix batch e24h)', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Relatório A: the AT row at 10 GΩ, issued (nothing judged out, so the parecer is tapped before issuing).
  // Batch e24p (Story 24.15): both relatórios are pinned to seed v13, whose MANUT. ANTERIOR header (undated) and history texts (the issue date) this spec reads.
  const a = newRelatorioDrafts(account, { seedVersion: 'v13' });
  const trA = a.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const blockRows = (drafts: readonly OpDraft[]) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null });
  const equipmentId = blockRows(a.drafts).find((row) => row.id === trA.blockId)!.equipment_id!;
  await pushDrafts(page, database, [
    ...a.drafts,
    ...oilAt20(a.relatorioId, trA.blockId),
    officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${trA.blockId}/test/isolacao/cell/${AT.row}/${AT.col}`, { raw: '10', unit: 'GΩ', state: 'measured' }),
  ]);
  await setParecer(page, a.relatorioId);
  await issue(page, a.relatorioId, 1);

  // Relatório B of the same obra, its TAGs bound to the obra's equipment, its transformer's plate at 20 °C.
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  const b = instantiateTemplate(
    standardTemplate({ id: newId(), seedVersion: 'v13' }),
    { id: a.projectId },
    { service_start: '2026-11-08', service_end: '2026-11-09', existingEquipment: equipment, responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const trB = blockRows(b.drafts).find((row) => row.equipment_id === equipmentId)!;
  await pushDrafts(page, database, [...b.drafts, ...oilAt20(b.relatorioId, trB.id)]);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // The equipment row reached the device with A's reading corrected to 20 °C (AD-25's second projection, contract 36).
  await expect
    .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
    .toBe(a.relatorioId);
  const last = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)!.row.last_results as LastResults;
  expect(Object.values(last.readings)).toEqual([{ raw: '10', unit: 'GΩ', state: 'measured', corrected: { raw: '10', unit: 'GΩ' } }]);

  // B's transformer: 4 GΩ typed on the AT row.
  await page.goto(`/relatorio/${b.relatorioId}/ficha/${trB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const cell = page.locator(`section[data-test-key="isolacao"] .ficha-cell[data-cell="isolacao:${AT.row}:${AT.col}"]`).filter({ visible: true });
  await cell.locator('input.mf-value').click();
  await page.keyboard.type('4G');
  await page.keyboard.press('Enter');
  const cellPath = `sheet/${trB.id}/test/isolacao/cell/${AT.row}/${AT.col}`;
  await expect.poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === cellPath).map((row) => row.value)).toEqual([
    { raw: '4', unit: 'GΩ', state: 'measured' },
  ]);

  // The kernel, under the sheet's visit context (A's revision on the equipment row): restricted by the drop.
  const snapshot = await deviceSnapshot(page, b.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === trB.id)!;
  const visit = visitContextOf(snapshot, block);
  expect(visit.previous?.relatorio_id).toBe(a.relatorioId);
  const evaluation = evaluateTest(block, TRANSFORMER, TRANSFORMER.tests.find((test) => test.key === 'isolacao')!, visit);
  const judged = evaluation.tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!;
  expect(judged).toMatchObject({ verdict: 'restricted', corrected: { raw: '4', unit: 'GΩ' } });
  expect(judged.restriction!.text).toContain(`rev. 1, `);
  expect(judged.restriction!.text).toContain('(10 GΩ a 20 °C');
  await expect(cell.locator('.measurement-field')).toHaveAttribute('data-state', 'restricted');
  await expect(cell.locator('.mf-helper[data-tone="restricted"]')).toHaveText(`Com restrição: ${judged.restriction!.text}`);
  // ~~Story 22.12's line stays beside it: the previous value as it was measured.~~
  // Fix batch e23p (P3): Story 22.12's line stays beside it, the previous value as it was measured and then the
  // corrected one the history rule judged by.
  await expect(cell.locator('.mf-helper[data-previous]')).toContainText('Anterior: 10 GΩ, 10 GΩ a 20 °C (rev. 1, ');
  const reason = conclusionFloorReasonText(block, TRANSFORMER, visit)!;
  expect(reason).toBe('A ficha exige no mínimo Aprovado · Com restrições: leitura com restrição.');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-hint:not(.e24-preview-line)')).toHaveText(reason);

  // ~~Fix batch e23p (P3): the derived restricao point names both corrected values, on the Pontos de atenção surface.~~
  // Fix batch e24h (2026-11-10): no automatic point; Pontos lists nothing until the technician creates one.
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await expect(row8(page).locator('.sum-status')).toHaveText('Nenhum ponto de atenção');
  await row8(page).getByRole('button', { name: /^Pontos de atenção/ }).click();
  await expect(page).toHaveURL(/\/pontos$/);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);

  // B's DOCX: the insulation table with the 20 °C column and MANUT. ANTERIOR; no automatic point in section 8.
  const structure = await issue(page, b.relatorioId, 1);
  const table = structure.tables.find((one) => one.some((row) => row.includes('20 °C')) && one.some((row) => row.includes('MANUT. ANTERIOR')))!;
  expect(table).toBeDefined();
  const labels = table.find((row) => row.includes('20 °C'))!;
  const data = table.slice(table.indexOf(labels) + 1);
  expect(data[0]![labels.indexOf('20 °C')]).toBe('4');
  expect(data[0]!.at(-1)).toBe('10 GΩ');
  // ~~Fix batch e23p (P3): while the point is not written, section 8's bullet is its text, both values named.~~ Fix batch e24h: no bullet.
  expect(structure.paragraphs.some((paragraph) => paragraph.startsWith('Ensaio com restrição: '))).toBe(false);
});
