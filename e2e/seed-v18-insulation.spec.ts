import { getDefinition, SEED_VERSION, type FieldDef } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushLastNameplate } from './support/push-server-ops.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 28.3-E2E-001 (batch e28a, Story 28.3; B-4 with Bruno's Q-1 and Matheus's Q-2 and his decision on the frames of
 * 2026-11-23). On a v18 relatório from the standard template, at 1024 px, as a person fills it:
 * - an oil transformer whose last visit was a v17 relatório that stored ÓLEO ISOLANTE and an ÉSTER NATURAL (VEGETAL)
 *   liquid: "Copiar da última visita" writes "A ÓLEO" and keeps the liquid; NATUREZA DO LÍQUIDO is drawn, CONSTRUÇÃO
 *   is not, and the oil items are asked;
 * - a dry transformer whose last visit stored EPÓXI: the copy writes "A SECO" and CONSTRUÇÃO "ENCAPSULADO EM RESINA
 *   EPÓXI", drawn right after TIPO DE ISOLAÇÃO; NATUREZA DO LÍQUIDO and TIPO (ANP) are not drawn; the oil items read NA;
 * - TIPO DE ISOLAÇÃO offers "A SECO" and "A ÓLEO" only; the TP and the TC offer ÓLEO VEGETAL, which asks their oil item;
 * - the DOCX prints "A ÓLEO" and "A SECO", NATUREZA DO LÍQUIDO "-" on the dry unit, CONSTRUÇÃO in the plate's last pair
 *   ("-" on the oil unit), and the TP's ÓLEO VEGETAL.
 * Every list and word is the kernel's. It issues a revision through the api's one queue and LibreOffice, so it runs
 * in the queue lane.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TRANSFORMER = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const TP = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp');
const OPTIONS = TRANSFORMER.nameplate.find((field) => field.key === 'tipo_de_isolacao')!.options!;
const [DRY, OIL] = OPTIONS as [string, string];
const CONSTRUCTION = TRANSFORMER.nameplate.find((field) => field.key === 'construcao')!;
const VEGETAL = 'ÓLEO VEGETAL';

const checklistRow = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => checklistRow(page, key).locator('[role="radio"][aria-checked="true"]');
const plateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const outboxValue = async (page: Page, path: string) => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === path).at(-1)?.value;

/** A v17 visit's plate value of a field, by kind; a select takes its first option, `overrides` win. */
function visitValue(type: string, field: FieldDef, overrides: Record<string, string>): unknown {
  if (Object.hasOwn(overrides, field.key)) return overrides[field.key];
  if (field.kind === 'number') return { raw: '100', unit: field.unit ?? null, state: 'measured' };
  if (field.kind === 'date') return '2020-01-01';
  if (field.kind === 'select') return field.options![0];
  if (field.kind === 'voltage_class') return '15';
  if (field.kind === 'manufacturer') return 'Fabricante V17';
  return `V17-${type}-${field.key}`;
}

test('@p0 28.3-E2E-001 at 1024: v18 transformers copied from v17 visits take "A ÓLEO" (liquid kept) and "A SECO" with CONSTRUÇÃO; the TP takes ÓLEO VEGETAL; the DOCX prints them and CONSTRUÇÃO in the last pair', async ({ page }) => {
  test.setTimeout(480_000);
  expect(OPTIONS).toEqual(['A SECO', 'A ÓLEO']);
  expect(TP.nameplate.find((field) => field.key === 'tipo_de_isolacao')!.options).toContain(VEGETAL);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  const { relatorioId } = built;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, relatorioId)]);
  const [oilSheet, drySheet] = built.sheets.filter((sheet) => sheet.blockType === 'transformador_forca');
  const tp = built.sheets.find((sheet) => sheet.blockType === 'tp')!;
  const tc = built.sheets.find((sheet) => sheet.blockType === 'tc')!;
  const v17 = getDefinition('v17', 'cabine_primaria', 'transformador_forca');
  const visits: { sheet: { blockId: string; tag: string }; label: string; overrides: Record<string, string>; skipped: Set<string> }[] = [
    { sheet: oilSheet!, label: 'oil', overrides: { tipo_de_isolacao: 'ÓLEO ISOLANTE', natureza_liquido: 'ÉSTER NATURAL (VEGETAL)' }, skipped: new Set(['tag', ...v17.oil_rule!.dry_fields!]) },
    { sheet: drySheet!, label: 'dry', overrides: { tipo_de_isolacao: 'EPÓXI', classe_termica: 'F (155)' }, skipped: new Set(['tag', ...v17.oil_rule!.fields]) },
  ];
  for (const visit of visits) {
    const fields = Object.fromEntries(v17.nameplate.filter((field) => !visit.skipped.has(field.key)).map((field) => [field.key, visitValue(`transformador_forca-${visit.label}`, field, visit.overrides)]));
    const equipmentId = (built.drafts.find((draft) => draft.path === `block/${visit.sheet.blockId}`)!.value as { equipment_id: string }).equipment_id;
    await pushLastNameplate(
      account.companyId,
      built.projectId,
      equipmentId,
      { relatorio_id: newId(), revision_number: 1, issued_at: '2026-11-20T12:00:00.000Z', seed_version: 'v17', block_type: 'transformador_forca', fields: fields as never },
      account.userId,
    );
  }
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNowAndReturn(page);

  const copyLastVisit = async (sheet: { blockId: string; tag: string }) => {
    await page.goto(`/relatorio/${relatorioId}/ficha/${sheet.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    const lastVisit = page.getByRole('group', { name: 'Copiar dados de placa' }).getByRole('button', { name: `Copiar da última visita (${sheet.tag})` });
    await expect(lastVisit).toBeVisible({ timeout: 30_000 });
    await lastVisit.click();
    await expect(page.getByTestId('toast')).toContainText('copiados');
  };
  const insulation = plateField(page, 'tipo_de_isolacao').locator('select');

  // --- the oil transformer: "A ÓLEO", the liquid kept, no CONSTRUÇÃO, the oil items asked ---
  await copyLastVisit(oilSheet!);
  const offered = await insulation.locator('option').allTextContents();
  for (const option of OPTIONS) expect(offered).toContain(option);
  for (const gone of ['EPÓXI', 'ÓLEO ISOLANTE']) expect(offered).not.toContain(gone);
  await expect(insulation).toHaveValue(OIL);
  await expect.poll(() => outboxValue(page, `sheet/${oilSheet!.blockId}/nameplate/tipo_de_isolacao`)).toBe(OIL);
  await expect(plateField(page, 'natureza_liquido').locator('select')).toHaveValue('ÉSTER NATURAL (VEGETAL)');
  await expect(plateField(page, 'construcao')).toHaveCount(0);
  await expect(plateField(page, 'tipo_anp')).toHaveCount(0);
  for (const key of TRANSFORMER.oil_rule!.items) await expect(checked(page, key), key).toHaveCount(0);

  // --- the dry transformer: "A SECO" and CONSTRUÇÃO, drawn right after TIPO DE ISOLAÇÃO; no liquid; the oil items NA ---
  await copyLastVisit(drySheet!);
  await expect(insulation).toHaveValue(DRY);
  await expect(plateField(page, 'construcao').locator('select')).toHaveValue('ENCAPSULADO EM RESINA EPÓXI');
  await expect.poll(() => outboxValue(page, `sheet/${drySheet!.blockId}/nameplate/construcao`)).toBe('ENCAPSULADO EM RESINA EPÓXI');
  const order = await page.locator('#ficha-nameplate .nameplate-grid [data-field-key]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-field-key')));
  expect(order[order.indexOf('tipo_de_isolacao') + 1]).toBe(CONSTRUCTION.key);
  await expect(plateField(page, 'construcao')).toContainText(CONSTRUCTION.help!);
  const constructionOptions = await plateField(page, 'construcao').locator('select option').allTextContents();
  for (const option of CONSTRUCTION.options!) expect(constructionOptions).toContain(option);
  await expect(plateField(page, 'natureza_liquido')).toHaveCount(0);
  await expect(plateField(page, 'tipo_anp')).toHaveCount(0);
  for (const key of TRANSFORMER.oil_rule!.items) await expect(checked(page, key), key).toHaveAttribute('data-value', 'na');

  // --- the TP and the TC: ÓLEO VEGETAL asks the oil item, as ÓLEO MINERAL does ---
  for (const sheet of [tp, tc]) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${sheet.blockId}`);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
    expect(await insulation.locator('option').allTextContents(), sheet.blockType).toEqual(expect.arrayContaining(['EPÓXI', 'A SECO', 'ÓLEO MINERAL', VEGETAL]));
    const oilItems = getDefinition(SEED_VERSION, 'cabine_primaria', sheet.blockType).oil_rule!.items;
    await insulation.selectOption(DRY);
    for (const key of oilItems) await expect(checked(page, key), `${sheet.blockType} ${key}`).toHaveAttribute('data-value', 'na');
    await insulation.selectOption(VEGETAL);
    await expect.poll(() => outboxValue(page, `sheet/${sheet.blockId}/nameplate/tipo_de_isolacao`)).toBe(VEGETAL);
    for (const key of oilItems) await expect(checked(page, key), `${sheet.blockType} ${key}`).toHaveCount(0);
  }

  // --- the DOCX ---
  await setParecer(page, relatorioId, 'Apto');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const modal = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' }).click();
  await confirmIssue(modal);
  await expect(page.getByTestId('toast')).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: 150_000 });
  const revision = (await readStore<{ entity: string; row: { id: string; number: number; relatorio_id: string } }>(page, database, 'entities')).find(
    (record) => record.entity === 'revision' && record.row.relatorio_id === relatorioId && record.row.number === 1,
  )!;
  const structure = extractStructure(Buffer.from(await (await page.request.get(`/api/revisions/${revision.row.id}/docx`)).body()));
  const plateOf = (marker: string) => structure.tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && JSON.stringify(table).includes(marker));
  const valueAfter = (cells: string[], label: string) => cells[cells.indexOf(label) + 1];

  const oilCells = plateOf('V17-transformador_forca-oil-')!.flat();
  expect(valueAfter(oilCells, 'TIPO DE ISOLAÇÃO')).toBe(OIL);
  expect(valueAfter(oilCells, 'NATUREZA DO LÍQUIDO')).toBe('ÉSTER NATURAL (VEGETAL)');
  expect(oilCells.slice(-2)).toEqual(['CONSTRUÇÃO', '-']);

  const dryCells = plateOf('V17-transformador_forca-dry-')!.flat();
  expect(valueAfter(dryCells, 'TIPO DE ISOLAÇÃO')).toBe(DRY);
  expect(valueAfter(dryCells, 'NATUREZA DO LÍQUIDO')).toBe('-');
  expect(valueAfter(dryCells, 'TIPO (ANP)')).toBe('-');
  // CONSTRUÇÃO takes the empty last pair, after CLASSE TÉRMICA: no v17 row moves.
  expect(dryCells.slice(-4)).toEqual(['CLASSE TÉRMICA', 'F (155)', 'CONSTRUÇÃO', 'ENCAPSULADO EM RESINA EPÓXI']);

  const tpPlate = structure.tables.filter((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO').map((table) => table.flat()).find((cells) => cells.includes(VEGETAL));
  expect(tpPlate).toBeDefined();
  // No plate prints v17's spellings of the insulation.
  const plates = structure.tables.filter((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO').map((table) => table.flat());
  for (const cells of plates) for (const gone of ['ÓLEO ISOLANTE', 'EPÓXI']) expect(valueAfter(cells, 'TIPO DE ISOLAÇÃO') === gone && cells.includes('CONSTRUÇÃO')).toBe(false);
});
