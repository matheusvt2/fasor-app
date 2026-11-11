import {
  buildSnapshot,
  cellAddressesOf,
  conclusionFloorReasonText,
  EMPTY_DEFINITION_CONTEXT,
  entityKey,
  evaluateTest,
  getDefinition,
  instantiateTemplate,
  SEED_VERSION,
  standardTemplate,
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
 * Fix batch e23w (Bruno's answer B-6, 2026-11-09; seed v13, DJ-03): a contact pole more than 50 % above
 * the same pole of the previous v13 visit is out, over two relatórios of one obra at 1280 px. Relatório
 * A's disjuntor reads 40, 44 and 44 µΩ and is issued through the real generate job (its `last_results`
 * keeps the poles). Relatório B of the same obra reads 61 µΩ on pole A (+52,5 %), 45 and 44: every pole
 * is within 250 µΩ and none deviates 50 % over the lowest, but pole A is out by its rise: the field and
 * its helper say so, the floor reads Reprovado · Com restrições, and B's DOCX prints the disjuntor's
 * CONCLUSÃO Reprovado ~~and section 8's point naming the pole and the rise~~ (fix batch e24h, 2026-11-10: no automatic
 * point; section 8 prints none for the out pole until the technician creates one). Every expected word is the
 * kernel's over the device's own rows. It issues two revisions through the api's one queue and
 * LibreOffice, so it runs in the serial group.
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

const TEST_KEY = 'resistencia_contato';
const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const DISJUNTOR = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
const POLES = cellAddressesOf(DISJUNTOR, TEST_KEY);
const cellOf = (page: Page, address: { row: number; col: number }): Locator =>
  page.locator(`section[data-test-key="${TEST_KEY}"] .ficha-cell[data-cell="${TEST_KEY}:${address.row}:${address.col}"]`).filter({ visible: true });

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

test('@p0 e23w-B6-E2E-001 relatório A issued with pole A at 40 µΩ; relatório B of the obra at 61 µΩ (+52,5 %): pole A out by its rise, the floor Reprovado, and B\'s DOCX prints the CONCLUSÃO Reprovado and no automatic point (fix batch e24h)', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Relatório A: the poles at 40, 44 and 44 µΩ, issued (nothing judged out, so the parecer is tapped before issuing).
  // Batch e24a (Story 24.3): both relatórios are pinned to seed v13, whose floor this spec asserts (Reprovado · Com restrições).
  const a = newRelatorioDrafts(account, { seedVersion: 'v13' });
  const djA = a.sheets.find((sheet) => sheet.blockType === 'disjuntor_mt')!;
  const blockRows = (drafts: readonly OpDraft[]) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null });
  const equipmentId = blockRows(a.drafts).find((row) => row.id === djA.blockId)!.equipment_id!;
  await pushDrafts(page, database, [
    ...a.drafts,
    ...['40', '44', '44'].map((raw, i) => officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${djA.blockId}/test/${TEST_KEY}/cell/${POLES[i]!.row}/${POLES[i]!.col}`, { raw, unit: 'µΩ', state: 'measured' })),
  ]);
  await setParecer(page, a.relatorioId);
  await issue(page, a.relatorioId, 1);

  // Relatório B of the same obra, its TAGs bound to the obra's equipment.
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  const b = instantiateTemplate(
    standardTemplate({ id: newId(), seedVersion: 'v13' }),
    { id: a.projectId },
    { service_start: '2026-11-09', service_end: '2026-11-10', existingEquipment: equipment, responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const djB = blockRows(b.drafts).find((row) => row.equipment_id === equipmentId)!;
  await pushDrafts(page, database, b.drafts);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await expect
    .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
    .toBe(a.relatorioId);

  // B's disjuntor: 61, 45 and 44 µΩ typed in one run.
  await page.goto(`/relatorio/${b.relatorioId}/ficha/${djB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await cellOf(page, POLES[0]!).locator('input.mf-value').click();
  for (const value of ['61', '45', '44']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  const path = (address: { row: number; col: number }) => `sheet/${djB.id}/test/${TEST_KEY}/cell/${address.row}/${address.col}`;
  for (const [i, raw] of ['61', '45', '44'].entries()) {
    await expect.poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === path(POLES[i]!)).map((row) => row.value)).toEqual([{ raw, unit: 'µΩ', state: 'measured' }]);
  }

  // The kernel, under the sheet's visit context (A's revision on the equipment row): pole A out by its rise.
  const snapshot = await deviceSnapshot(page, b.relatorioId);
  const block = snapshot.blocks.find((row) => row.id === djB.id)!;
  const visit = visitContextOf(snapshot, block);
  expect(visit.previous?.relatorio_id).toBe(a.relatorioId);
  const evaluation = evaluateTest(block, DISJUNTOR, DISJUNTOR.tests.find((test) => test.key === TEST_KEY)!, visit);
  const cells = evaluation.tables[0]!.rows.map((row) => row.cells[0]!);
  expect(cells.map((one) => one.verdict)).toEqual(['out', 'within', 'within']);
  const rise = cells[0]!.rise!.reason;
  expect(rise).toMatch(/^alta de 52,5 % sobre 40 µΩ da manutenção anterior, rev\. 1 de \d\d\/\d\d\/\d{4}, acima do limite de 50 %$/);
  await expect(cellOf(page, POLES[0]!).locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cellOf(page, POLES[0]!).locator('.mf-helper[role="status"]')).toContainText(cells[0]!.helperText!);
  for (const within of POLES.slice(1)) await expect(cellOf(page, within).locator('.measurement-field')).not.toHaveAttribute('data-state');
  const reason = conclusionFloorReasonText(block, DISJUNTOR, visit)!;
  expect(reason).toBe('A ficha exige no mínimo Reprovado · Com restrições: leitura fora do critério.');
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await expect(page.locator('.conclusion-hint')).toHaveText(reason);
  // The engineer takes the suggestion: the pair section 9 prints (e22f N2: only a chosen pair prints its marks).
  const suggestion = page.getByRole('group', { name: 'Sugestão' });
  await expect(suggestion).toContainText('Reprovado · Com restrições?');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' })).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === `sheet/${djB.id}/conclusion/result`).map((row) => row.value))
    .toEqual(['reprovado']);

  // B's DOCX: the disjuntor's CONCLUSÃO Reprovado (the only sheet with a chosen pair); ~~section 8's point with the rise~~
  // fix batch e24h: no automatic point.
  const structure = await issue(page, b.relatorioId, 1);
  const concluded = structure.tables.filter((table) => table[0]?.[0] === 'CONCLUSÃO' && table[1]?.includes('X'));
  expect(concluded.map((table) => table[1])).toEqual([['APROVADO', '', 'REPROVADO', 'X', 'SEM RESTRIÇÕES', '', 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', 'X']]);
  expect(structure.paragraphs.some((paragraph) => paragraph.startsWith('Ensaio fora do critério: '))).toBe(false);
});
