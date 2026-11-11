import { cellAddressesOf, getDefinition, previousHeaderText, SEED_VERSION, visitDateText, type EquipmentRow, type LastResults, type TemplateRow } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure, type DocxStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.21 (batch e24b, contract 43): an equipment keeps its history when its TAG is renamed.
 * Its create stores, once, the frozen TAG rule's name of the template placement (`reuse_key`), and
 * a new relatório of the obra binds each placement by that key, never by the visible TAG. So a
 * transformer born "TR-01" and renamed "TF-A" on its sheet is the same equipment in the next
 * relatório: "Anterior", "Copiar da última visita" and MANUT. ANTERIOR follow it. A breaker added
 * from the palette gets its key too, so "Salvar como template" finds it again. 24.21-E2E-001 issues
 * two revisions through the queue and LibreOffice (queue lane, `e2e/support/groups.ts`).
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
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const FIRST = cellAddressesOf(TRANSFORMER, 'isolacao')[0]!;

/** Opens section 9 of the Sumário and the 1° Subsolo local. */
async function openSubsolo(page: Page): Promise<void> {
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const local = page.getByRole('button', { name: /^(Expandir|Recolher) 1° Subsolo$/ });
  if ((await local.getAttribute('aria-label'))?.startsWith('Expandir') === true) await local.click();
  await expect(coluna(page, 'Coluna 1')).toBeVisible();
}

/** Issues revision 1 of `relatorioId` from its Sumário and returns the DOCX's structure. */
async function issue(page: Page, relatorioId: string): Promise<DocxStructure> {
  // Nothing is judged, so the parecer is tapped before issuing (e22f S5).
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

/** The creation batch of `relatorioId` in the outbox: its equipment creates and its equipment sheets. */
async function creationBatch(page: Page, relatorioId: string): Promise<{ equipment: EquipmentRow[]; sheets: { id: string; equipment_id: string; location_id: string }[] }> {
  const rows = await outbox(page);
  const batchId = rows.find((op) => op.path === `relatorio/${relatorioId}`)!.batch_id;
  const batch = rows.filter((op) => op.batch_id === batchId && op.kind === 'create');
  return {
    equipment: batch.filter((op) => op.path.startsWith('equipment/')).map((op) => op.value as EquipmentRow),
    sheets: batch
      .filter((op) => op.path.startsWith('block/'))
      .map((op) => op.value as { id: string; equipment_id: string | null; location_id: string | null })
      .filter((row): row is { id: string; equipment_id: string; location_id: string } => row.equipment_id !== null && row.location_id !== null),
  };
}

test('@p0 24.21-E2E-001 a transformer born TR-01 through "Novo relatório" and renamed TF-A on its sheet keeps its history: the next relatório binds it, shows "Anterior" and "Copiar da última visita (TF-A)", and its DOCX prints MANUT. ANTERIOR', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const projectId = new URL(page.url()).pathname.split('/')[2]!;
  const a = await createRelatorio(page);

  // A's creation batch: the transformer of 1° Subsolo is TR-01 with its placement key.
  const first = await creationBatch(page, a);
  const tr = first.equipment.find((row) => row.reuse_key === 'TR-1')!;
  expect(tr.tag).toBe('TR-01');
  const trSheet = first.sheets.find((row) => row.equipment_id === tr.id)!;

  // The office fills the transformer's plate and its first insulation row, once A reached the server.
  await syncNowAndReturn(page);
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: a }, `sheet/${trSheet.id}/nameplate/tipo_de_isolacao`, 'ÓLEO ISOLANTE'),
    officeDraft(account, { relatorioId: a }, `sheet/${trSheet.id}/test/isolacao/cell/${FIRST.row}/${FIRST.col}`, { raw: '4.9', unit: 'GΩ', state: 'measured' }),
  ]);

  // "Renomear TAG" from the sheet's menu: TR-01 becomes TF-A; the rename writes the TAG only.
  await page.goto(`/relatorio/${a}/ficha/${trSheet.id}`);
  await page.getByRole('button', { name: 'Mais opções da ficha TR-01' }).click();
  await page.getByRole('menuitem', { name: 'Renomear TAG' }).click();
  const rename = page.getByRole('dialog', { name: 'Renomear TAG TR-01' });
  await rename.getByRole('textbox', { name: 'TAG' }).fill('TF-A');
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(rename).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mais opções da ficha TF-A' })).toBeVisible();
  const renamed = (await outbox(page)).filter((op) => op.path.startsWith(`equipment/${tr.id}/`));
  expect(renamed.map((op) => [op.path, op.value])).toEqual([[`equipment/${tr.id}/tag`, 'TF-A']]);
  await expect.poll(async () => (await entities(page)).find((record) => record.entity === 'equipment' && record.id === tr.id)?.row).toMatchObject({ tag: 'TF-A', reuse_key: 'TR-1' });
  await syncNowAndReturn(page);

  // A issued: the transformer's readings become its previous visit.
  const printedA = await issue(page, a);
  expect(printedA.paragraphs).toContain('TRANSFORMADOR DE FORÇA TF-A');
  await expect
    .poll(async () => ((await entities(page)).find((record) => record.entity === 'equipment' && record.id === tr.id)?.row.last_results as LastResults | null | undefined)?.relatorio_id ?? null, { timeout: 30_000 })
    .toBe(a);
  const last = (await entities(page)).find((record) => record.entity === 'equipment' && record.id === tr.id)!.row.last_results as LastResults;

  // B through the screen: no equipment is created, and the transformer's placement binds TF-A.
  await page.goto(`/project/${projectId}`);
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const b = await createRelatorio(page);
  const second = await creationBatch(page, b);
  expect(second.equipment).toEqual([]);
  expect(second.sheets).toHaveLength(94);
  expect(second.sheets.map((row) => row.equipment_id)).toEqual(first.sheets.map((row) => row.equipment_id));
  const trB = second.sheets.find((row) => row.equipment_id === tr.id)!;

  // B's TF-A sheet: its plate to copy and its previous reading beside the empty cell.
  await page.goto(`/relatorio/${b}/ficha/${trB.id}`);
  await expect(page.getByRole('button', { name: 'Mais opções da ficha TF-A' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Copiar da última visita (TF-A)' })).toBeVisible();
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const cell = page.locator(`.ficha-cell[data-cell="isolacao:${FIRST.row}:${FIRST.col}"]`).filter({ visible: true });
  // Batch e24p (Story 24.15): the helper names the visit's date (its service date), the v14 header carries it too.
  await expect(cell.locator('.mf-helper[data-previous]')).toHaveText(`Anterior: 4,9 GΩ (rev. 1, ${visitDateText(last)})`);
  await expect(cell.locator('input.mf-value')).toHaveValue('');

  // B's DOCX prints MANUT. ANTERIOR with A's value on TF-A's insulation table.
  const printedB = await issue(page, b);
  expect(printedB.paragraphs).toContain('TRANSFORMADOR DE FORÇA TF-A');
  const withPrevious = printedB.tables.filter((table) => table[0]?.[0] === 'PONTO DE ENSAIO/CONEXÃO' && table[1]?.at(-1) === previousHeaderText(last, SEED_VERSION));
  expect(withPrevious).toHaveLength(1);
  expect(withPrevious[0]![2]!.at(-1)).toBe('4,9 GΩ');
});

test('24.21-E2E-002 a breaker added from the palette as "QM8", the relatório saved with "Salvar como template", and a relatório created from that template binds both breakers of Coluna 1, none created', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // An obra created before Story 24.21 (the old TAGs, no key on any row), opened at the office width.
  const { relatorioId, projectId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01']);

  // The office palette on Coluna 1: a Disjuntor MT typed "QM8".
  await menuOf(page, 'Coluna 1 de 1° Subsolo').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const type = palette.locator('.pf-office').filter({ hasText: 'Disjuntor MT' });
  await type.locator('.palette-item').click();
  await type.getByRole('textbox', { name: 'TAG' }).fill('QM8');
  await type.getByRole('button', { name: 'Confirmar' }).click();
  await expect(palette).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01', 'QM8']);
  const qm8 = (await outbox(page)).find((op) => op.kind === 'create' && op.path.startsWith('equipment/') && (op.value as EquipmentRow).tag === 'QM8')!.value as EquipmentRow;
  // The key counts the rows from before the story by their TAG: Coluna 1 holds no DJ-C01, so it is DJ-C01.
  expect(qm8.reuse_key).toBe('DJ-C01');

  // "Salvar como template" from the Sumário header: Coluna 1 now places a seccionadora and a breaker.
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Salvar como template' }).click();
  const save = page.getByRole('dialog', { name: 'Salvar como template' });
  await save.getByRole('textbox', { name: 'Nome do template' }).fill('Modelo com QM8');
  await save.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(save).toBeHidden();
  await expect(toast(page)).toContainText('Template Modelo com QM8 salvo');
  const template = (await outbox(page)).find((op) => op.kind === 'create' && op.path.startsWith('template/') && (op.value as TemplateRow).name === 'Modelo com QM8')!.value as TemplateRow;
  const coluna1 = template.skeleton.find((node) => node.kind === 'coluna' && node.name === 'Coluna 1')!;
  expect(template.blocks.filter((block) => block.skeleton_location_ref === coluna1.ref).map((block) => [block.block_type, block.quantity])).toEqual([
    ['chave_seccionadora', 1],
    ['disjuntor_mt', 1],
  ]);
  await syncNowAndReturn(page);

  // A relatório from the saved template, through the screen: every placement binds, QM8's by its key.
  await page.goto(`/project/${projectId}`);
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório — tipo e datas', exact: true });
  const picker = dialog.getByRole('combobox', { name: 'Template' });
  await picker.fill('Modelo com QM8');
  await page.getByRole('option', { name: /^Modelo com QM8/ }).click();
  const next = await createRelatorio(page, { template: 'Modelo com QM8' });
  const created = await creationBatch(page, next);
  expect(created.equipment).toEqual([]);
  expect(created.sheets).toHaveLength(95);
  expect(created.sheets.map((row) => row.equipment_id)).toContain(qm8.id);
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01', 'QM8']);
});
