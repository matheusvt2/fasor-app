import { cellAddressesOf, formatDateOfInstant, getDefinition, SEED_VERSION, type EquipmentRow, type LastResults } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 24.8 (batch e24b, Bruno's question 29): a new sheet is suggested `PREFIX-NN`, the type's
 * prefix and the smallest two-digit number free in the obra (the seccionadora's prefix is SC); the
 * TAG field asks for the plate's TAG; a TAG typed over the suggestion stands. An obra whose
 * equipment carries the TAGs of the rule before (SEC-C05, DJ-C05, CE-ENEL, TR-1) still finds it
 * when a second relatório is created through the screen (Story 24.21's step 3), so the previous
 * visit shows on the sheet and prints in MANUT. ANTERIOR. Both issue revisions through the queue
 * and LibreOffice (queue lane, `e2e/support/groups.ts`).
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
interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const FIRST = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;
/** `60-ficha.html` TAG field helper (Story 24.8). */
const TAG_HELPER = 'Sugestão do app. Troque pela TAG da placa, do diagrama unifilar ou a usada no local.';

/** Opens section 9 of the Sumário and the 1° Subsolo local. */
async function openSubsolo(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const local = page.getByRole('button', { name: /^(Expandir|Recolher) 1° Subsolo$/ });
  if ((await local.getAttribute('aria-label'))?.startsWith('Expandir') === true) await local.click();
  await expect(coluna(page, 'Coluna 5')).toBeVisible();
}

/** Issues revision `number` of `relatorioId` from its Sumário and returns the DOCX's structure. */
async function issue(page: Page, relatorioId: string, number = 1): Promise<DocxStructure> {
  // Nothing is judged, so the parecer is tapped before issuing (e22f S5).
  await setParecer(page, relatorioId);
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

test('@p0 24.8-E2E-001 at 1280: "Novo relatório" names every sheet PREFIX-NN with its reuse key stored, the palette suggests the next free DJ-NN and keeps "QM8" typed over it, the TAG field asks for the plate\'s TAG, and the DOCX prints the TAGs', async ({ page }) => {
  test.setTimeout(480_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  // The creation batch as committed: 94 equipment, every TAG PREFIX-NN once, none named after a local, each with its placement key.
  const created = (await outbox(page)).filter((op) => op.kind === 'create' && op.path.startsWith('equipment/')).map((op) => op.value as EquipmentRow);
  expect(created).toHaveLength(94);
  expect(created.filter((row) => !/^(CE|PR|SC|DJ|TP|TC|CS|TR)-\d{2}$/.test(row.tag))).toEqual([]);
  expect(new Set(created.map((row) => row.tag)).size).toBe(94);
  expect(new Set(created.map((row) => row.reuse_key)).size).toBe(94);
  const byKey = (key: string) => created.find((row) => row.reuse_key === key)!.tag;
  expect([byKey('CE-ENEL'), byKey('SEC-ENEL'), byKey('SEC-C05'), byKey('DJ-C05'), byKey('TR-1')]).toEqual(['CE-01', 'SC-01', 'SC-07', 'DJ-06', 'TR-01']);

  // The tree names Coluna 5's sheets by their TAGs.
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 5'))).toHaveText(['SC-07', 'DJ-06']);

  // The office palette on Coluna 1: Disjuntor MT asks its TAG prefilled with the next free number; "QM8" typed over it stands.
  await menuOf(page, 'Coluna 1 de 1° Subsolo').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.getByText('Ou escolha o tipo · TAG sugerida por tipo e número')).toBeVisible();
  const type = palette.locator('.pf-office').filter({ hasText: 'Disjuntor MT' });
  await type.locator('.palette-item').click();
  const tagField = type.getByRole('textbox', { name: 'TAG' });
  await expect(tagField).toHaveValue('DJ-22');
  await tagField.fill('QM8');
  await type.getByRole('button', { name: 'Confirmar' }).click();
  await expect(palette).toBeHidden();
  await expect(toast(page)).toContainText('QM8 criada na Coluna 1');
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText([/^SC-\d{2}$/, 'QM8']);
  const qm8 = (await outbox(page)).find((op) => op.kind === 'create' && op.path.startsWith('equipment/') && (op.value as EquipmentRow).tag === 'QM8')!.value as EquipmentRow;
  // Story 24.21: the palette's equipment keeps the frozen rule's name of its placement apart from its TAG.
  expect(qm8.reuse_key).toBe('DJ-C01');

  // The sheet's TAG field shows QM8 and asks for the plate's TAG.
  await eqRow(page, 'QM8').locator('.s9-eq-open').click();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const tag = page.getByLabel('TAG', { exact: true });
  await expect(tag).toHaveValue('QM8');
  await expect(tag).toHaveAccessibleDescription(TAG_HELPER);

  // The issued DOCX names the sheets by the TAGs they were given: nothing changed QM8 back.
  const structure = await issue(page, relatorioId);
  expect(structure.paragraphs).toContain('CHAVE SECCIONADORA SC-07');
  expect(structure.paragraphs.filter((text) => / QM8$/.test(text))).toHaveLength(1);
  expect(structure.paragraphs.some((text) => /\bSEC-C\d{2}\b|\bDJ-C\d{2}\b/.test(text))).toBe(false);
});

test('@p0 24.8-E2E-002 an obra with the old TAGs issued once; a second relatório created through the screen binds every sheet, the old TAGs stand, and the transformer shows and prints its previous visit', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // Relatório A, built with the TAG rule before Story 24.8 (no key on any row): the transformer's plate and first insulation row filled, issued.
  const a = newRelatorioDrafts(account);
  const trA = a.sheets.find((sheet) => sheet.blockType === 'transformador_forca' && sheet.tag === 'TR-1')!;
  const oldEquipment = a.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith('equipment/')).map((draft) => draft.value as unknown as EquipmentRow);
  expect(oldEquipment.some((row) => 'reuse_key' in row)).toBe(false);
  expect(oldEquipment.map((row) => row.tag)).toEqual(expect.arrayContaining(['SEC-C05', 'DJ-C05', 'CE-ENEL', 'TR-1']));
  const trEquipmentId = (a.drafts.find((draft) => draft.path === `block/${trA.blockId}`)!.value as { equipment_id: string }).equipment_id;
  await pushDrafts(page, database, [
    ...a.drafts,
    officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${trA.blockId}/nameplate/tipo_de_isolacao`, 'ÓLEO ISOLANTE'),
    officeDraft(account, { relatorioId: a.relatorioId }, `sheet/${trA.blockId}/test/isolacao/cell/${FIRST.row}/${FIRST.col}`, { raw: '4.9', unit: 'GΩ', state: 'measured' }),
  ]);
  await issue(page, a.relatorioId);
  await expect
    .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === trEquipmentId)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
    .toBe(a.relatorioId);
  const last = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === trEquipmentId)!.row.last_results as LastResults;

  // Relatório B through the screen: the obra's "Novo relatório a partir de template".
  await page.goto(`/project/${a.projectId}`);
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const b = await createRelatorio(page);
  const outboxRows = await outbox(page);
  const batchOfB = outboxRows.find((op) => op.path === `relatorio/${b}`)!.batch_id;
  const batchB = outboxRows.filter((op) => op.batch_id === batchOfB);
  // Every placement binds its old equipment by its TAG: no equipment create, no op on those rows.
  expect(batchB.filter((op) => op.path.startsWith('equipment/'))).toEqual([]);
  expect(outboxRows.filter((op) => oldEquipment.some((row) => op.path.startsWith(`equipment/${row.id}`)))).toEqual([]);
  const sheetsB = batchB.filter((op) => op.kind === 'create' && op.path.startsWith('block/')).map((op) => op.value as { id: string; equipment_id: string | null }).filter((row) => row.equipment_id !== null);
  expect(sheetsB).toHaveLength(94);
  expect(new Set(sheetsB.map((row) => row.equipment_id))).toEqual(new Set(oldEquipment.map((row) => row.id)));

  // The old TAGs stand in the tree.
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 5'))).toHaveText(['SEC-C05', 'DJ-C05']);

  // The transformer's sheet: the previous visit beside the empty cell, and its plate to copy.
  const trB = sheetsB.find((row) => row.equipment_id === trEquipmentId)!;
  await page.goto(`/relatorio/${b}/ficha/${trB.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Copiar da última visita (TR-1)' })).toBeVisible();
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const cell = page.locator(`.ficha-cell[data-cell="isolacao:${FIRST.row}:${FIRST.col}"]`).filter({ visible: true });
  await expect(cell.locator('.mf-helper[data-previous]')).toHaveText(`Anterior: 4,9 GΩ (rev. 1, ${formatDateOfInstant(last.issued_at)})`);

  // B's DOCX prints MANUT. ANTERIOR on the transformer's insulation table, under its old TAG.
  const structure = await issue(page, b);
  expect(structure.paragraphs).toContain('TRANSFORMADOR DE FORÇA TR-1');
  const withPrevious = structure.tables.filter((table) => table[0]?.[0] === 'PONTO DE ENSAIO/CONEXÃO' && table[1]?.at(-1) === 'MANUT. ANTERIOR');
  expect(withPrevious).toHaveLength(1);
  expect(withPrevious[0]![2]!.at(-1)).toBe('4,9 GΩ');
});
