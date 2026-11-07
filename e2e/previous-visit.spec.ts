import { cellAddressesOf, formatDateOfInstant, getDefinition, instantiateTemplate, SEED_VERSION, standardTemplate, type EquipmentRow, type LastResults } from '@app/domain';
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
 * Story 22.12 (contract 32): the previous visit's value beside each reading, as a person meets it
 * at 1280 px. Relatório A of an obra is issued through the real generate job with 4,9 GΩ on the
 * transformer's first insulation row; relatório B of the same obra (its TAGs bound to the same
 * equipment) opens the transformer's sheet: the row shows "Anterior: 4,9 GΩ (rev. 1, dd/mm/aaaa)"
 * and the cell stays empty in the store. B's DOCX prints MANUT. ANTERIOR on that table with the
 * value, and the insulation table of an equipment with no previous visit prints no such column.
 * It issues two revisions through the api's one queue and LibreOffice, so it runs in the serial
 * group (`e2e/support/groups.ts`).
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
const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const FIRST = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;

/** Issues revision 1 of `relatorioId` from its Sumário and returns the DOCX's tables. */
async function issue(page: Page, relatorioId: string): Promise<string[][][]> {
  // e22f S5: no sheet is concluded, so nothing is judged and the parecer is tapped before issuing.
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

test('@p0 22.12-E2E-001 relatório A issued with 4,9 GΩ; relatório B of the obra shows "Anterior: 4,9 GΩ (rev. 1, …)" under the empty cell, and its DOCX prints MANUT. ANTERIOR on that table only', async ({ page }) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Relatório A: the transformer's first insulation row measured, then issued through the real job.
  const a = newRelatorioDrafts(account);
  const trA = a.sheets.find((sheet) => sheet.blockType === 'transformador_forca')!;
  const blockRows = (drafts: typeof a.drafts) => drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/')).map((draft) => draft.value as { id: string; equipment_id: string | null });
  const equipmentId = blockRows(a.drafts).find((row) => row.id === trA.blockId)!.equipment_id!;
  await pushDrafts(page, database, [
    ...a.drafts,
    officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${trA.blockId}/test/isolacao/cell/${FIRST.row}/${FIRST.col}`, { raw: '4.9', unit: 'GΩ', state: 'measured' }),
  ]);
  await issue(page, a.relatorioId);

  // Relatório B of the same obra: the standard template again, its TAGs bound to the obra's equipment.
  const equipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  const b = instantiateTemplate(
    standardTemplate({ id: newId() }),
    { id: a.projectId },
    { service_start: '2026-11-02', service_end: '2026-11-03', existingEquipment: equipment, responsible_user_id: null },
    { newId, actorId: account.userId, companyId: account.companyId },
  );
  const trB = blockRows(b.drafts).find((row) => row.equipment_id === equipmentId)!;
  expect(trB).toBeDefined();
  await pushDrafts(page, database, b.drafts);
  await page.goto(`/relatorio/${b.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });

  // The equipment row reached the device with A's readings (AD-25's second projection).
  await expect
    .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
    .toBe(a.relatorioId);
  const last = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === equipmentId)!.row.last_results as LastResults;
  expect(last).toMatchObject({ revision_number: 1, block_type: 'transformador_forca', prior: null });
  expect(Object.values(last.readings)).toEqual([{ raw: '4.9', unit: 'GΩ', state: 'measured' }]);

  // B's transformer sheet: the helper under the cell, the cell itself empty.
  await page.goto(`/relatorio/${b.relatorioId}/ficha/${trB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const cell = page.locator(`.ficha-cell[data-cell="isolacao:${FIRST.row}:${FIRST.col}"]`).filter({ visible: true });
  const helper = cell.locator('.mf-helper[data-previous]');
  await expect(helper).toHaveText(`Anterior: 4,9 GΩ (rev. 1, ${formatDateOfInstant(last.issued_at)})`);
  await expect(helper).not.toHaveAttribute('role');
  // e22g (review S3): the line is drawn in the field helper's neutral colour, never the out-of-limit one.
  const tone = await helper.evaluate((el) => {
    const probe = (token: string) => {
      const span = document.createElement('span');
      span.style.color = `var(${token})`;
      el.parentElement!.appendChild(span);
      const colour = getComputedStyle(span).color;
      span.remove();
      return colour;
    };
    return { actual: getComputedStyle(el).color, neutral: probe('--ink-secondary'), outOfLimit: probe('--fora-do-limite') };
  });
  expect(tone.actual).toBe(tone.neutral);
  expect(tone.actual).not.toBe(tone.outOfLimit);
  await expect(cell.locator('input.mf-value')).toHaveValue('');
  // The other rows of the table have no previous value, so no line.
  await expect(page.locator('section[data-test-key="isolacao"] .mf-helper[data-previous]')).toHaveCount(1);
  const blockB = (await entities(page)).find((record) => record.entity === 'block' && record.id === trB.id)!.row as { sheet: { test: Record<string, { cells: Record<string, unknown> }> } };
  expect(blockB.sheet.test.isolacao?.cells ?? {}).toEqual({});

  // B's DOCX: MANUT. ANTERIOR on the transformer's insulation table with A's value; the other insulation tables have none.
  const tables = await issue(page, b.relatorioId);
  const insulation = tables.filter((table) => table[0]?.[0] === 'PONTO DE ENSAIO/CONEXÃO');
  expect(insulation.length).toBeGreaterThan(1);
  const withPrevious = insulation.filter((table) => table[1]?.at(-1) === 'MANUT. ANTERIOR');
  expect(withPrevious).toHaveLength(1);
  expect(withPrevious[0]![0]!.at(-1)).toBe('');
  expect(withPrevious[0]![2]!.at(-1)).toBe('4,9 GΩ');
  expect(withPrevious[0]!.slice(3).map((row) => row.at(-1))).toEqual(withPrevious[0]!.slice(3).map(() => '-'));
  for (const table of insulation.filter((one) => one !== withPrevious[0])) expect(table.flat()).not.toContain('MANUT. ANTERIOR');
});
