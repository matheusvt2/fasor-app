import {
  addDraftTest,
  companyBlockType,
  definitionContext,
  draftCriterionText,
  duplicateSeededType,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  SEED_VERSION,
  updateDraftCriterion,
  updateDraftMeasurementRow,
  validateTypeDraft,
  type CompanyTypeDraft,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type LocationRow,
  type OpDraft,
} from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { duplicateLibraryType, editorTab, openTypeList, publishButton, scrollsSideways, typeInto, typeRows } from './support/company-type.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 24.18 (batch e24c): a company type's criteria row "nominal ± %". Driven as a person does at
 * 1280 px: the library Inspeção de QGBT is duplicated, a measurement table with one row in V is added,
 * its criterion ruled "nominal ± %" with 220 and 5 and a source, and the kernel's text "220 V ± 5 %"
 * shows under the two inputs; the type is published. A relatório (Em campo) gets one sheet of it on
 * Geradores (the plate and the items filled from the office); 209 V is typed, within, then 231,1 V,
 * out with its helper naming "220 V ± 5 %"; the suggested conclusion is confirmed (Reprovado, as any
 * out reading floors it); the draft PDF ("Pré-visualizar") prints the reading and the mark as a range
 * row does. A measurement table prints no criterion (Story 22.2) and `print/section-9.ts` is not this
 * batch's, so the printed ACEITÁVEL is read on a contact-resistance test (a seeded grammar) ruled
 * "100 µΩ ±20 %" the same way. At 390 px the
 * editor's Critérios tab does not scroll sideways. The draft goes through the api's one queue and
 * LibreOffice, so this spec runs in the `queue` lane (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const JOB_TIMEOUT = 150_000;
const SOURCE = 'inspecao_qgbt' as const;
const SOURCE_DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', SOURCE);
const NAME = 'Quadro de alimentação 220 V';
const ROW = 'Tensão de alimentação';
const LOCAL = 'Geradores';
const TAG = 'QAL-01';
// Fix batch e24y (P10, Bruno 2026-11-11): a space after the sign (was '220 V ±5 %').
const TEXT = '220 V ± 5 %';
const INSULATION_TEXT = '100 µΩ ± 20 %';

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastValue = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;
const toast = (page: Page) => page.getByTestId('toast');
const compact = (text: string) => text.replace(/\s+/g, '');

/** "Duplicar" of the Inspeção de QGBT, renamed, a measurement table with one row in V ruled "nominal ± %"; the draft as the kernel makes it. */
async function buildType(page: Page): Promise<{ typeId: string; expected: CompanyTypeDraft; testKey: string }> {
  await openTypeList(page);
  const copy = duplicateSeededType(SEED_VERSION, SOURCE);
  const typeId = await duplicateLibraryType(page, SOURCE);
  const drafts = async () => (await outbox(page)).filter((op) => op.path === `equipment_type/${typeId}/draft`).map((op) => op.value as CompanyTypeDraft);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME);
  let expected: CompanyTypeDraft = { ...copy.draft, label: NAME };
  await typeInto(page.getByRole('textbox', { name: 'Prefixo da TAG' }), 'QAL');
  expected = { ...expected, tag_prefix: 'QAL' };

  await editorTab(page, 'Ensaios');
  await page.getByRole('button', { name: 'Adicionar ensaio' }).click();
  const picker = page.getByRole('dialog', { name: 'Adicionar ensaio' });
  await picker.getByRole('radio', { name: /^Tabela de medições/ }).click();
  await picker.getByRole('button', { name: 'Adicionar' }).click();
  await expect(picker).toHaveCount(0);
  expected = addDraftTest(expected, 'medicoes', SEED_VERSION)!.draft;
  const at = (expected.measurement_tests ?? []).length - 1;
  const testKey = expected.measurement_tests![at]!.key!;
  await typeInto(page.getByRole('textbox', { name: 'Linha 1', exact: true }), ROW);
  expected = updateDraftMeasurementRow(expected, at, 0, { label: ROW });
  await typeInto(page.getByRole('textbox', { name: `Unidade ${ROW}` }), 'V');
  expected = updateDraftMeasurementRow(expected, at, 0, { unit: 'V' });
  // A contact-resistance test too: a seeded grammar prints its criterion under ACEITÁVEL (a measurement table prints none since Story 22.2).
  await page.getByRole('button', { name: 'Adicionar ensaio' }).click();
  await picker.getByRole('radio', { name: /^Resistência de contato/ }).click();
  await picker.getByRole('button', { name: 'Adicionar' }).click();
  await expect(picker).toHaveCount(0);
  expected = addDraftTest(expected, 'resistencia_contato', SEED_VERSION)!.draft;
  await expect.poll(async () => (await drafts()).at(-1)).toEqual(expected);

  // --- Critérios: the rule after "entre", the two inputs, the kernel's text ---
  await editorTab(page, 'Critérios');
  const rowKey = (expected.measurement_tests![at]!.criteria![0] as { seeded?: string }).seeded;
  const index = expected.criteria!.findIndex((criterion) => criterion.key === rowKey);
  const row = page.locator(`tr[data-criterion-key="${expected.criteria![index]!.key}"]`);
  const rule = row.getByRole('combobox', { name: `Regra de ${ROW}` });
  await expect(rule.locator('option')).toContainText(['entre', 'nominal ± %']);
  await rule.selectOption({ label: 'nominal ± %' });
  expected = updateDraftCriterion(expected, index, { operator: 'nominal_pct' });
  await expect(row.locator('.tipo-nominal .field-label')).toHaveText(['Valor nominal', 'Tolerância (%)']);
  await typeInto(row.getByRole('textbox', { name: `Valor nominal de ${ROW}` }), '220');
  expected = updateDraftCriterion(expected, index, { value: 220 });
  // The tolerance not typed yet is the kernel's issue, said on the row; "Publicar" is held.
  await expect(row.locator('[data-type-issue]')).toContainText([validateTypeDraft(expected).find((issue) => issue.path[2] === 'tolerance_pct')!.message]);
  await typeInto(row.getByRole('textbox', { name: `Tolerância (%) de ${ROW}` }), '5');
  expected = updateDraftCriterion(expected, index, { tolerance_pct: 5 });
  await typeInto(row.getByRole('textbox', { name: `Fonte de ${ROW}`, exact: true }), 'Manual do fabricante');
  expected = updateDraftCriterion(expected, index, { source_name: 'Manual do fabricante' });
  expect(draftCriterionText(expected.criteria![index])).toBe(TEXT);
  await expect(row.locator('.nominal-text')).toHaveText(TEXT);
  // The contact row ruled the same way: 100 µΩ ± 20 %.
  const insulationAt = expected.criteria!.findIndex((criterion) => criterion.key === 'resistencia_contato');
  const insulation = expected.criteria![insulationAt]!.label!;
  const insulationRow = page.locator('tr[data-criterion-key="resistencia_contato"]');
  await insulationRow.getByRole('combobox', { name: `Regra de ${insulation}` }).selectOption({ label: 'nominal ± %' });
  expected = updateDraftCriterion(expected, insulationAt, { operator: 'nominal_pct' });
  await typeInto(insulationRow.getByRole('textbox', { name: `Valor nominal de ${insulation}` }), '100');
  expected = updateDraftCriterion(expected, insulationAt, { value: 100 });
  await typeInto(insulationRow.getByRole('textbox', { name: `Tolerância (%) de ${insulation}` }), '20');
  expected = updateDraftCriterion(expected, insulationAt, { tolerance_pct: 20 });
  expect(draftCriterionText(expected.criteria![insulationAt])).toBe(INSULATION_TEXT);
  await expect(insulationRow.locator('.nominal-text')).toHaveText(INSULATION_TEXT);
  await expect(page.locator('.rules-note')).toHaveText('Regras: maior que · menor que · maior ou igual a · menor ou igual a · entre · nominal ± % · ± · aprovado ou reprovado.');
  await expect.poll(async () => (await drafts()).at(-1)).toEqual(expected);
  expect(validateTypeDraft(expected)).toEqual([]);
  await expect(page.locator('[data-type-issue]')).toHaveCount(0);
  return { typeId, expected, testKey };
}

/** "Pré-visualizar" in the Export dialog; the draft PDF's text, compacted. */
async function previewText(page: Page, context: BrowserContext, relatorioId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  const preview = dialog.locator('.generate-row').getByRole('button', { name: 'Pré-visualizar' });
  await expect(preview).toBeEnabled({ timeout: 30_000 });
  const tabPromise = context.waitForEvent('page');
  await preview.click();
  const tab = await tabPromise;
  const requested = await tab.waitForRequest(/\/api\/relatorios\/[0-9a-f-]{36}\/preview\.pdf\?v=[0-9a-f-]{36}$/, { timeout: JOB_TIMEOUT });
  const pdf = await page.request.get(requested.url());
  expect(pdf.status()).toBe(200);
  await tab.close();
  await page.keyboard.press('Escape');
  return compact((await pdfTextItems(new Uint8Array(await pdf.body()))).join(' '));
}

test('@p0 24.18-E2E-001 a company row ruled "nominal ± %" with 220 and 5 publishes; on its sheet 209 V is within and 231,1 V out with the helper naming "220 V ±5 %"; concluded, the draft PDF prints "220 V ±5 %"', async ({ page, context }) => {
  test.setTimeout(360_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  const { typeId, expected, testKey } = await buildType(page);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  expect(rows.versions.map((row) => [row.version, row.definition])).toEqual([[1, expected]]);
  const version = rows.versions[0]!;
  const definitions = definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]);

  // --- a relatório (Em campo) with one sheet of the type on Geradores, its plate and items filled from the office ---
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const local = built.drafts.map((draft) => draft.value as unknown as LocationRow).find((row) => row !== null && typeof row === 'object' && row.kind === 'cabine' && row.name === LOCAL)!;
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(typeId),
    tag: TAG,
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(997),
    typeVersion: { version: 1, id: version.id },
    definitions,
  });
  const plate: OpDraft[] = SOURCE_DEFINITION.nameplate.map((f) =>
    officeDraft(account, scope, `sheet/${block.id}/nameplate/${f.key}`, f.kind === 'number' ? { raw: '220', unit: f.unit ?? null, state: 'measured' } : f.kind === 'date' ? '2020-01-01' : f.kind === 'select' ? f.options![0] : 'QUADRO 220 V'),
  );
  const conforme = SOURCE_DEFINITION.checklist!.map((item) => officeDraft(account, scope, `sheet/${block.id}/checklist/${item.key}/result`, 'C'));
  await pushDrafts(page, database, [
    ...built.drafts,
    officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
    officeDraft(account, scope, `block/${block.id}`, block, 'create'),
    ...plate,
    ...conforme,
    emCampoDraft(account, built.relatorioId),
  ]);

  // --- the sheet: 209 V within, then 231,1 V out with the helper naming the criterion ---
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${block.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(NAME, { timeout: 30_000 });
  const input = page.locator(`input[data-cell-input="${testKey}:0:0"]`).filter({ visible: true });
  const cell = page.locator(`.ficha-cell[data-cell="${testKey}:0:0"]`).filter({ visible: true });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await input.fill('209');
  await input.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${block.id}/test/${testKey}/cell/0/0`)).toEqual({ raw: '209', unit: 'V', state: 'measured' });
  await expect(cell.locator('.measurement-field')).not.toHaveAttribute('data-state', 'out-of-limit');
  await input.click();
  await input.fill('231,1');
  await input.press('Tab');
  await expect.poll(() => lastValue(page, `sheet/${block.id}/test/${testKey}/cell/0/0`)).toEqual({ raw: '231.1', unit: 'V', state: 'measured' });
  await expect(cell.locator('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
  await expect(cell.locator('.mf-helper')).toContainText(TEXT);

  // --- the suggested conclusion, confirmed: an out reading floors the ficha as on any range row ---
  await page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Conclusão,/ }).click();
  const suggestion = page.getByRole('group', { name: 'Prévia da conclusão' });
  await expect(suggestion).toContainText('Reprovado');
  await suggestion.getByRole('button', { name: 'Confirmar' }).click();
  await expect.poll(() => lastValue(page, `sheet/${block.id}/conclusion/result`)).toBe('reprovado');
  await syncNow(page);

  // --- the draft PDF: the out reading and the Reprovado mark as a range row prints them; ACEITÁVEL prints the nominal criterion as the kernel words it ---
  const text = await previewText(page, context, built.relatorioId);
  expect(text, 'the measurement row prints its reading').toContain(compact(`${ROW} 231,1`).toUpperCase());
  expect(text, 'the ficha is marked REPROVADO').toContain('APROVADOREPROVADOX');
  // The PDF's font writes the micro sign as the Greek mu, so both sides are compared NFKC-normalized.
  expect(text.normalize('NFKC'), 'ACEITÁVEL prints the nominal criterion').toMatch(new RegExp(`ACEITÁVEL[^A-Z]*${compact(INSULATION_TEXT).normalize('NFKC')}`));
  expect(text).not.toContain('nominal_pct');

  // --- at 390 px the editor's Critérios tab does not scroll sideways ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/templates/tipos/${typeId}`);
  await expect(page.locator('.tipo-head h2')).toHaveText(NAME, { timeout: 30_000 });
  await editorTab(page, 'Critérios');
  await expect(page.locator('.rules-note')).toBeVisible();
  expect(await scrollsSideways(page), 'the Critérios tab at 390 px').toBe(false);
});
