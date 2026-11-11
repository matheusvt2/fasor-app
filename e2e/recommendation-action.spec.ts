import {
  buildSnapshot,
  cellAddressesOf,
  companyBlockType,
  definitionContext,
  entityKey,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  sheetPointFindings,
  type Entity,
  type EntityRow,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type PointRow,
  type RelatorioSnapshot,
  type SheetPointFinding,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { duplicateLibraryType, editorTab, openTypeList, publishButton, typeInto, typeRows } from './support/company-type.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { confirmIssue, setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * Story 24.17 (batch e24p): "Criar ponto de atenção" on a test, as a person does it at 1280 px on a new
 * relatório (seed v14).
 * - 24.17-E2E-001: the library CTA duplicated, "Recomendação se reprovado" typed on its main insulation
 *   table in the type editor and published; a sheet of the copy with a reading below the criterion. The
 *   Pontos screen and the store hold nothing; the test offers the action; the editor opens with the
 *   finding as "Texto" and the recommendation as "Ação recomendada" with its helper; "Concluir" stores one
 *   point of origin `reading` with the test's key and the sheet's equipment; the place then names it; the
 *   DOCX's section 8 prints the finding then the recommendation in the bullet, and the finding under
 *   "Ponto de atenção" and the recommendation under "Ação recomendada" in the action plan. It issues a
 *   revision through the api's one queue and LibreOffice, so the spec runs in the `queue` lane.
 * - 24.17-E2E-002: a restricted cable (5, 5 and 1,5 GΩ): the action under its insulation test starts a
 *   `restricao` point with the restricted rows and an empty action; removing the point brings the action
 *   back. A TP the technician concluded Reprovado with nothing out: the action under the Conclusão pair
 *   starts a `reprovado` point with the sheet's observation.
 * Every expected text is the kernel's over the device's own rows. Synthetic text (M-1). Empresa B is this
 * worker's own (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const CTA = 'chave_transferencia_automatica' as const;
const DEFINITION = getDefinition('v14', 'cabine_primaria', CTA);
const E2 = 'cta_isolamento_principal';
const E2_INDEX = DEFINITION.measurement_tests!.findIndex((one) => one.key === E2);
const E2_ROW = DEFINITION.measurement_tests![E2_INDEX]!.rows.findIndex((row) => row.key === 'a_t');
const E2_COL = DEFINITION.measurement_tests![E2_INDEX]!.columns.findIndex((column) => column.key === 'normal_fechada');
const NAME = 'CTA com recomendação na ação';
const LOCAL = 'Geradores';
const RECOMMENDATION = 'Limpar e secar o circuito principal antes de uma nova medição';
const READING = '1';
const OBSERVATION = 'Ruído anormal no núcleo com o equipamento em carga.';
const JOB_TIMEOUT = 150_000;

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}
interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const pointCreates = async (page: Page) => (await outbox(page)).filter((row) => row.kind === 'create' && row.path.startsWith('point/'));
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const placeOf = (scope: Locator) => scope.locator('.e24-point-place');
const testSection = (page: Page, testKey: string) => page.locator(`section[data-test-key="${testKey}"]`);
const editorOf = (page: Page) => page.getByRole('dialog', { name: 'Criar ponto de atenção' });

/** The relatório as this device holds it, and the kernel's findings of one of its sheets. */
async function findingsOf(page: Page, relatorioId: string, blockId: string): Promise<SheetPointFinding[]> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const snapshot: RelatorioSnapshot = buildSnapshot(new Map(records.map((record) => [entityKey(record.entity as Entity, record.id), record.row as unknown as EntityRow])), relatorioId);
  return sheetPointFindings(snapshot, blockId);
}

async function openStep(page: Page, relatorioId: string, blockId: string, step: 'Ensaios' | 'Conclusão'): Promise<void> {
  if (!page.url().endsWith(`/ficha/${blockId}`)) {
    await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
    await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  }
  await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).click();
}

/** The editor's two fields as it opened, then "Concluir"; the one point create it stored. */
async function concludeEditor(page: Page, expected: SheetPointFinding): Promise<OutboxRow> {
  const editor = editorOf(page);
  await expect(editor).toBeVisible();
  await expect(editor.locator('.poa-text-area')).toHaveText(expected.text);
  const action = editor.getByRole('textbox', { name: 'Ação recomendada' });
  await expect(action).toHaveValue(expected.action);
  if (expected.actionHelper === null) await expect(action).not.toHaveAttribute('aria-describedby');
  else await expect(action).toHaveAccessibleDescription(expected.actionHelper);
  // Nothing is stored before "Concluir".
  const before = (await pointCreates(page)).length;
  await editor.getByRole('button', { name: 'Concluir' }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => (await pointCreates(page)).length).toBe(before + 1);
  return (await pointCreates(page)).at(-1)!;
}

test('@p0 24.17-E2E-001 a v14 company type\'s reading out of its criterion: nothing on Pontos; the tap opens the editor with the finding and the recommendation; one reading point stored; the DOCX section 8 prints both', async ({ page }) => {
  test.setTimeout(300_000);
  const written = async (path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the type: "Duplicar" of the library CTA, the recommendation typed on its main insulation table ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, CTA);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME);
  await editorTab(page, 'Ensaios');
  await page.locator(`li.registry-row[data-entry-key="measurement_tests:${E2_INDEX}"]`).locator('button.rr-text').click();
  await typeInto(page.locator('li.def-edit').getByRole('textbox', { name: 'Recomendação se reprovado' }), RECOMMENDATION);
  await expect
    .poll(async () => ((await written(`equipment_type/${typeId}/draft`)).at(-1) as { measurement_tests?: { recommendation?: string }[] } | undefined)?.measurement_tests?.[E2_INDEX]?.recommendation)
    .toBe(RECOMMENDATION);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  const version = rows.versions[0]!;
  const definitions = definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]);

  // --- a new relatório (seed v14) with one sheet of it on Geradores ---
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(typeId),
    tag: 'CTA-ACAO',
    seedVersion: 'v14',
    orderKey: initialOrderKey(999),
    typeVersion: { version: 1, id: version.id },
    definitions,
  });
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${pair.equipment.id}`, pair.equipment, 'create'),
    officeDraft(account, { relatorioId: built.relatorioId }, `block/${pair.block.id}`, pair.block, 'create'),
  ]);
  const relatorioId = built.relatorioId;
  const blockId = pair.block.id;

  // --- the sheet: MT, a reading below the insulation criterion; no action before it ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });
  const tensao = page.locator('section[data-section="configuracao"]').getByRole('radiogroup', { name: 'Tensão' }).getByRole('radio', { name: 'MT', exact: true });
  await tensao.click();
  await expect(tensao).toHaveAttribute('aria-checked', 'true');
  await expect(placeOf(testSection(page, E2))).toHaveCount(0);
  const input = page.locator(`input[data-cell-input="${E2}:${E2_ROW}:${E2_COL}"]`).filter({ visible: true });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type(READING);
  await page.keyboard.press('Tab');
  await expect.poll(() => written(`sheet/${blockId}/test/${E2}/cell/${E2_ROW}/${E2_COL}`)).toEqual([{ raw: READING, unit: 'MΩ', state: 'measured' }]);

  // The kernel's finding over the device's rows: the finding alone as the text, the recommendation as the action.
  const [finding] = await findingsOf(page, relatorioId, blockId);
  expect(finding).toMatchObject({ origin: 'reading', testKey: E2, place: 'test', action: `${RECOMMENDATION}.`, actionHelper: 'Da recomendação do ensaio · editável', positions: [] });
  expect(finding!.text).not.toContain(RECOMMENDATION);

  // --- Pontos: nothing for the reading, no point stored ---
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  expect(await storedPoints(page)).toEqual([]);

  // --- the tap on the test: the editor's two fields, "Concluir", one stored point ---
  await openStep(page, relatorioId, blockId, 'Ensaios');
  const place = placeOf(testSection(page, E2));
  await expect(place).toHaveCount(1);
  await place.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const create = await concludeEditor(page, finding!);
  expect(create.value).toMatchObject({ relatorio_id: relatorioId, equipment_id: pair.equipment.id, origin: 'reading', test_key: E2, text: finding!.text, action: finding!.action });
  // The place names the point and offers no second one.
  await expect(place).toHaveClass(/has-point/);
  await expect(place.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
  await expect(place.getByRole('button', { name: 'Criar ponto de atenção' })).toHaveCount(0);
  await expect.poll(async () => (await storedPoints(page)).map((point) => [point.origin, point.test_key, point.action])).toEqual([['reading', E2, finding!.action]]);

  // --- the DOCX: section 8, found by its own heading (E7-A6) ---
  await syncNowAndReturn(page);
  await setParecer(page, relatorioId);
  const dialog = page.getByRole('dialog', { name: 'Gerar relatório' });
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(dialog).toBeVisible();
  const generate = dialog.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  await confirmIssue(dialog);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => dialog.getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));
  await escapeDialog(page, dialog);
  const level1 = structure.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const points = level1.find((heading) => / PONTOS DE ATENÇÃO/.test(heading));
  expect(points, JSON.stringify(level1)).toBeDefined();
  const next = level1[level1.indexOf(points!) + 1];
  const from = structure.paragraphs.lastIndexOf(points!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  const section = structure.paragraphs.slice(from, to);
  // The bullet: the finding, then the recommendation.
  expect(section, JSON.stringify(section)).toContain(`${finding!.text}. ${finding!.action}`);
  // The action plan: the finding under "Ponto de atenção", the recommendation under "Ação recomendada".
  const plan = structure.tables.find((table) => table[0]?.[1] === 'Ponto de atenção' && table[0]?.[5] === 'Ação recomendada');
  expect(plan, 'the action plan').toBeDefined();
  expect(plan!.slice(1).map((row) => [row[1], row[5]])).toEqual([[finding!.text, finding!.action]]);
});

test('24.17-E2E-002 v14: a restricted reading starts a restricao point with its rows and an empty action, removing it brings the action back; a Reprovado the technician chose starts a reprovado point on the Conclusão step', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const relatorioId = built.relatorioId;
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const cable = built.sheets.find((sheet) => sheet.blockType === 'cabos_entrada')!;
  const tp = built.sheets.find((sheet) => sheet.blockType === 'tp')!;

  // --- the cable at 5, 5 and 1,5 GΩ: phase C restricted ---
  await openStep(page, relatorioId, cable.blockId, 'Ensaios');
  const [a] = cellAddressesOf(getDefinition('v14', 'cabine_primaria', 'cabos_entrada'), 'isolacao');
  await page.locator(`section[data-test-key="isolacao"] .ficha-cell[data-cell="isolacao:${a!.row}:${a!.col}"]`).filter({ visible: true }).locator('input.mf-value').click();
  for (const value of ['5G', '5G', '1,5G']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
  }
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith(`sheet/${cable.blockId}/test/isolacao/cell/`)).length).toBe(3);
  const [restricted] = await findingsOf(page, relatorioId, cable.blockId);
  expect(restricted).toMatchObject({ origin: 'restricao', testKey: 'isolacao', place: 'test', action: '', actionHelper: null, positions: [] });
  expect(restricted!.text).toMatch(/^Ensaio de isolação: valor dentro do critério, com restrição \(.+\)$/);
  const place = placeOf(testSection(page, 'isolacao'));
  await place.getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const create = await concludeEditor(page, restricted!);
  expect(create.value).toMatchObject({ equipment_id: expect.any(String), origin: 'restricao', test_key: 'isolacao', text: restricted!.text, action: null });
  await expect(place.locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');

  // Removing the point on Pontos brings the action back.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(1, { timeout: 30_000 });
  await page.getByRole('button', { name: /^Mais opções de ponto 1/ }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await page.getByRole('dialog', { name: 'Remover este ponto de atenção?' }).getByRole('button', { name: 'Remover ponto' }).click();
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  await openStep(page, relatorioId, cable.blockId, 'Ensaios');
  await expect(placeOf(testSection(page, 'isolacao')).getByRole('button', { name: 'Criar ponto de atenção' })).toBeVisible();

  // --- the TP: nothing out, the observation, Reprovado chosen; the action under the pair ---
  await openStep(page, relatorioId, tp.blockId, 'Conclusão');
  const conclusao = page.locator('#ficha-conc');
  await expect(placeOf(conclusao)).toHaveCount(0);
  const observations = page.getByLabel('Observações da ficha', { exact: true });
  await observations.fill(OBSERVATION);
  await observations.blur();
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${tp.blockId}/observations`).map((row) => row.value).at(-1)).toBe(OBSERVATION);
  await page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' }).click();
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path === `sheet/${tp.blockId}/conclusion/result`).map((row) => row.value)).toContainEqual('reprovado');
  const [chosen] = await findingsOf(page, relatorioId, tp.blockId);
  expect(chosen).toMatchObject({ origin: 'reprovado', testKey: null, place: 'conclusao', text: OBSERVATION, action: '', actionHelper: null });
  await placeOf(conclusao).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const reproved = await concludeEditor(page, chosen!);
  expect(reproved.value).toMatchObject({ origin: 'reprovado', text: OBSERVATION, action: null });
  await expect(placeOf(conclusao).locator('.nc-point-ref')).toHaveText('Ponto de atenção 1');
});
