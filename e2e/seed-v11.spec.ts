import { EMPTY_DEFINITION_CONTEXT, getDefinition, initialOrderKey, newEquipmentBlock, vectorGroupByCode, vectorGroupCaptureLabel, type BlockRow, type LocationRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 21.1 (seed v11, contract 30) on a relatório born on seed v10 before it: the open
 * relatórios on v9 and v10 get the fix too (Matheus, 2026-11-05, "Sim"). Their LIGAÇÃO
 * SECUNDÁRIA stays free text, and a text the kernel reads as a group applies it.
 *
 * 21.1-E2E-002: a v10 transformer typed "DYN1" computes U1 · √3 / U2 (62,90) and its revision 1
 * is generated and marked as sent; the engineer then types "YYN0" over it, as a person would, and
 * the sheet computes U1 / U2 (36,32) with the star-star pairs, the 62,8 captures now out; the
 * Export dialog says revision 1 predates the edits (Story 16.2's banner, which is edit-driven).
 * It generates through the one queue and LibreOffice of the api, so the file is in the serial
 * group. It resets this worker's own Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}

const ENEL = 'Cubículo Enel';
/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const MARK_SENT = 'Marcar como enviado ao cliente';

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

/**
 * The standard relatório on seed v10 cut down to Cubículo Enel with no equipment (its section
 * blocks kept) plus one transformador de força there, its plate and ratio typed by the office:
 * LIGAÇÃO SECUNDÁRIA "DYN1", 13,8 kV / 380 V, three captures of 62,8. Em campo.
 */
function smallV10RelatorioWithTransformer(): { relatorioId: string; blockId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account, { seedVersion: 'v10' });
  const locations = built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('location/')).map((draft) => draft.value as unknown as LocationRow);
  const enel = locations.find((location) => location.kind === 'cabine' && location.name === ENEL)!;
  const drafts = built.drafts.filter((draft) => {
    if (draft.kind !== 'create') return true;
    if (draft.path.startsWith('location/')) return (draft.value as unknown as LocationRow).id === enel.id;
    if (draft.path.startsWith('block/')) return (draft.value as unknown as BlockRow).location_id === null;
    return !draft.path.startsWith('equipment/');
  });
  const scope = { relatorioId: built.relatorioId };
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    definitions: EMPTY_DEFINITION_CONTEXT,
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: enel.id,
    type: 'transformador_forca',
    tag: 'TR-01',
    seedVersion: 'v10',
    orderKey: initialOrderKey(0),
  });
  const cell = (col: number) => `sheet/${block.id}/test/relacao_transformacao/cell/0/${col}`;
  return {
    relatorioId: built.relatorioId,
    blockId: block.id,
    drafts: [
      ...drafts,
      officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
      officeDraft(account, scope, `block/${block.id}`, block, 'create'),
      officeDraft(account, scope, `sheet/${block.id}/nameplate/ligacao_secundaria`, 'DYN1'),
      officeDraft(account, scope, cell(0), measured('13.8', 'kV')),
      officeDraft(account, scope, cell(1), measured('380', 'V')),
      officeDraft(account, scope, cell(3), measured('62.8', null)),
      officeDraft(account, scope, cell(4), measured('62.8', null)),
      officeDraft(account, scope, cell(5), measured('62.8', null)),
      emCampoDraft(account, built.relatorioId),
    ],
  };
}

test('@p0 21.1-E2E-002 a v10 transformer typed "DYN1" then "YYN0" after its revision 1: the ratio follows the group (62,90, then 36,32 and its star-star pairs) and the Export dialog says revision 1 predates the edits', async ({ page }) => {
  test.setTimeout(420_000);
  // The v10 field is free text, the v11 one a select of the groups.
  expect(getDefinition('v10', 'cabine_primaria', 'transformador_forca').nameplate.find((f) => f.key === 'ligacao_secundaria')!.kind).toBe('text');
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = smallV10RelatorioWithTransformer();
  await pushDrafts(page, database, built.drafts);

  const openSheet = async () => {
    await page.goto(`/relatorio/${built.relatorioId}/ficha/${built.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  };
  const ttr = page.locator('table.ficha-ttr');
  const row = ttr.locator('tbody tr').first();
  const dyn1 = vectorGroupByCode('Dyn1')!;
  const yyn0 = vectorGroupByCode('Yyn0')!;
  const pairs = (group: typeof dyn1) => [0, 1, 2].map((phase) => vectorGroupCaptureLabel(group, phase)!);

  // "DYN1" reads Dyn1: √3 and the seed's pairs, as on v10 before Story 21.1.
  await openSheet();
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(ttr.locator('thead th')).toHaveText(['TAP nº', 'V primário (kV)', 'V secundário (V)', 'Calculado', ...pairs(dyn1), 'Condição']);
  await expect(row.locator('td.cell-calc').first()).toContainText('62,90');
  await expect(row.locator('td').last()).toContainText('Satisfatório');

  // Revision 1, marked as sent.
  await setParecer(page, built.relatorioId);
  await footButton(page).click();
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  const question = modal.getByRole('group', { name: /^Gerar com / });
  const ready = modal.getByRole('heading', { level: 2, name: 'Revisão 1 pronta' });
  await expect(question.or(ready).or(modal.locator('.gen-progress')).first()).toBeVisible({ timeout: 30_000 });
  if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  await modal.getByRole('button', { name: MARK_SENT }).click();
  await expect(modal.locator('.row-wrap .status-pill')).toHaveText('Emitido');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // The engineer types "YYN0" over "DYN1" on the plate.
  await openSheet();
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  const ligacao = plateField(page, 'ligacao_secundaria').locator('input').first();
  await expect(ligacao).toHaveValue('DYN1');
  await ligacao.fill('YYN0');
  await ligacao.press('Tab');
  await expect.poll(async () => (await outbox(page)).filter((r) => r.path === `sheet/${built.blockId}/nameplate/ligacao_secundaria`).at(-1)?.value).toBe('YYN0');

  // The ratio follows Yyn0: U1 / U2 = 36,32 and the star-star pairs; 62,8 is now out.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(ttr.locator('thead th')).toHaveText(['TAP nº', 'V primário (kV)', 'V secundário (V)', 'Calculado', ...pairs(yyn0), 'Condição']);
  await expect(row.locator('td.cell-calc').first()).toContainText('36,32');
  await expect(row.locator('td').last()).toContainText('Insatisfatório');

  // Story 16.2: the Export dialog says revision 1 predates the edits.
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await footButton(page).click();
  await expect(modal).toBeVisible();
  const banner = modal.locator('.banner');
  await expect(banner).toHaveText(/^Relatório emitido em \d{2}\/\d{2} \(revisão 1\)\. Alterações desde então geram a revisão 2 — as anteriores continuam disponíveis abaixo\.$/);
  await expect(modal.locator('.revision-row .rev-text')).toHaveText([/^Rev\. 1 — .* — anterior às alterações$/]);
});
