import {
  companyBlockType,
  definitionContext,
  duplicateSeededType,
  getDefinition,
  initialOrderKey,
  newEquipmentBlock,
  publishedText,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type PointRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
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
 * Fix batch e24h (Matheus, 2026-11-10): a point exists only when the technician creates it, so the
 * recommendation starts no automatic point any more (no create path for a reading: an open question,
 * spec e24h D4). The cases below keep the type editor's field and assert the out reading and the
 * Reprovado chosen by hand list and print nothing. Struck below: the Story 23.11 flow.
 * ~~Story 23.11 (batch e23h): the recommendation as the derived point's initial text, driven as a
 * person does at 1280 px. The library CTA is duplicated and its main insulation table (a
 * measurement test) gets "Recomendação se reprovado" in the type editor; the copy is published. A
 * relatório gets a sheet of it (office ops, born at v1), where a reading below the insulation
 * criterion is typed. The Pontos entry starts with the recommendation; "Editar" writes a stored
 * point of origin `reading` whose text keeps it; the DOCX's section 8 (found by its own heading,
 * E7-A6) prints it. It issues a revision through the api's one queue and LibreOffice, so this spec
 * runs in the serial group (`e2e/support/groups.ts`). Synthetic text (M-1). Empresa B is this
 * worker's own (E6-Q7).~~
 *
 * Batch e24p (Story 24.17): pinned to seed v13 (`SEED`), whose create action starts a point as Story
 * 23.11 stored it: on 23.11-E2E-001 the test's "Criar ponto de atenção" opens the editor with the
 * recommendation then the finding in its text and an empty action; Esc on the untouched editor stores
 * nothing. The v14 half is `recommendation-action.spec.ts`.
 */

/** Batch e24p (Story 24.17): the seed these cases assert (the v13 rule). */
const SEED = 'v13';

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const CTA = 'chave_transferencia_automatica' as const;
const DEFINITION = getDefinition(SEED, 'cabine_primaria', CTA);
const E2 = 'cta_isolamento_principal';
const E2_INDEX = DEFINITION.measurement_tests!.findIndex((test) => test.key === E2);
const E2_ROW = DEFINITION.measurement_tests![E2_INDEX]!.rows.findIndex((row) => row.key === 'a_t');
const E2_COL = DEFINITION.measurement_tests![E2_INDEX]!.columns.findIndex((column) => column.key === 'normal_fechada');
const ISOLATION = duplicateSeededType(SEED, CTA).draft.criteria.find((criterion) => criterion.key === 'isolacao')!;
/** Half the insulation minimum: out of criterion. */
const READING = String(Math.floor(ISOLATION.value / 2));
const NAME = 'CTA com recomendação';
const LOCAL = 'Geradores';
const RECOMMENDATION = 'Limpar e secar o circuito principal antes de uma nova medição';
const STARTS = `${RECOMMENDATION}. `;
const JOB_TIMEOUT = 150_000;

interface OutboxRow {
  path: string;
  value: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const storedPoints = async (page: Page) =>
  (await readStore<{ entity: string; row: PointRow }>(page, database, 'entities')).filter((record) => record.entity === 'point').map((record) => record.row);

test('@p0 23.11-E2E-001 e24h: a recommendation typed in the type editor is stored, and an out reading of its sheet lists no automatic point: Pontos and the DOCX section 8 are empty', async ({ page }) => {
  test.setTimeout(300_000);
  const written = async (path: string) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the type: "Duplicar" of the library CTA, the recommendation typed on its main insulation table ---
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, CTA);
  await typeInto(page.getByRole('textbox', { name: 'Nome do tipo' }), NAME);
  await editorTab(page, 'Ensaios');
  await page.locator(`li.registry-row[data-entry-key="measurement_tests:${E2_INDEX}"]`).locator('button.rr-text').click();
  const field = page.locator('li.def-edit').getByRole('textbox', { name: 'Recomendação se reprovado' });
  await expect(field).toHaveAccessibleDescription('Texto inicial do ponto de atenção quando um valor deste ensaio fica fora do critério. Vazio, vale o texto padrão.');
  await typeInto(field, RECOMMENDATION);
  await expect
    .poll(async () => ((await written(`equipment_type/${typeId}/draft`)).at(-1) as { measurement_tests?: { recommendation?: string }[] } | undefined)?.measurement_tests?.[E2_INDEX]?.recommendation)
    .toBe(RECOMMENDATION);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  const version = rows.versions[0]!;
  expect(version.definition.measurement_tests![E2_INDEX]!.recommendation).toBe(RECOMMENDATION);
  const definitions = definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]);

  // --- a relatório with one sheet of it on Geradores, born at v1 (office ops) ---
  const built = newRelatorioDrafts(account, { seedVersion: SEED });
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(typeId),
    tag: 'CTA-REC',
    seedVersion: SEED,
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

  // --- the sheet: MT, a reading below the insulation criterion typed ---
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });
  const tensao = page.locator('section[data-section="configuracao"]').getByRole('radiogroup', { name: 'Tensão' }).getByRole('radio', { name: 'MT', exact: true });
  await tensao.click();
  await expect(tensao).toHaveAttribute('aria-checked', 'true');
  const input = page.locator(`input[data-cell-input="${E2}:${E2_ROW}:${E2_COL}"]`).filter({ visible: true });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type(READING);
  await page.keyboard.press('Tab');
  await expect.poll(() => written(`sheet/${blockId}/test/${E2}/cell/${E2_ROW}/${E2_COL}`)).toEqual([{ raw: READING, unit: 'MΩ', state: 'measured' }]);

  // Batch e24p (Story 24.17, seed v13): the test's "Criar ponto de atenção" starts the point as Story 23.11
  // stored it, the recommendation then the finding in its text and an empty action; Esc on the untouched
  // editor stores nothing.
  await page.locator(`section[data-test-key="${E2}"] .e24-point-place`).getByRole('button', { name: 'Criar ponto de atenção' }).click();
  const editor = page.getByRole('dialog', { name: 'Criar ponto de atenção' });
  await expect(editor.locator('.poa-text-area')).toHaveText(new RegExp(`^${STARTS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.+`));
  const action = editor.getByRole('textbox', { name: 'Ação recomendada' });
  await expect(action).toHaveValue('');
  await expect(action).not.toHaveAttribute('aria-describedby');
  await escapeDialog(page, editor);
  expect(await storedPoints(page)).toEqual([]);

  // --- Pontos: ~~the entry starts with the recommendation; "Editar" stores it~~ (fix batch e24h: nothing lists) ---
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  await expect(page.locator('.poa-list')).not.toContainText(STARTS);
  expect(await storedPoints(page)).toEqual([]);

  // --- the DOCX: section 8, found by its own heading, prints its empty note, never the recommendation ---
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
  expect(section.some((paragraph) => paragraph.includes(STARTS)), JSON.stringify(section)).toBe(false);
  expect(section).toContain('(sem conteúdo nesta revisão)');
});

/*
 * ~~Fix batch e23z (item 2, Bruno's answer of 2026-11-09): a Reprovado chosen by hand, with no reading out of
 * criterion, starts its derived entry with the in-force tests' recommendations (here the copy's one, on its main
 * insulation table), then the existing text ("Concluído como Reprovado na ficha").~~ Fix batch e24h: the Reprovado
 * chosen by hand lists no automatic point; the store holds no point.
 */
test('@p0 e23z-E2E-003 e24h: Reprovado chosen by hand on a sheet whose in-force test recommends lists no automatic point', async ({ page }) => {
  test.setTimeout(240_000);
  const written = async (path: string) => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === path).map((row) => row.value);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // The type: "Duplicar" of the library CTA, the recommendation typed on its main insulation table, published.
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

  // A relatório with one sheet of it, born at v1 (office ops).
  const built = newRelatorioDrafts(account, { seedVersion: SEED });
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(typeId),
    tag: 'CTA-REP',
    seedVersion: SEED,
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

  // The sheet: MT, no reading typed, Reprovado chosen by hand.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(NAME, { timeout: 30_000 });
  const tensao = page.locator('section[data-section="configuracao"]').getByRole('radiogroup', { name: 'Tensão' }).getByRole('radio', { name: 'MT', exact: true });
  await tensao.click();
  await expect(tensao).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Reprovado' }).click();
  await expect.poll(() => written(`sheet/${blockId}/conclusion/result`)).toContainEqual('reprovado');

  // ~~The kernel's entry over the device's rows starts with the recommendation; the Pontos card draws it.~~ No point.
  await page.goto(`/relatorio/${relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('.poa-list > .point-of-attention-card')).toHaveCount(0);
  await expect(page.locator('.poa-list')).not.toContainText('Concluído como Reprovado na ficha');
  expect(await storedPoints(page)).toEqual([]);
});
