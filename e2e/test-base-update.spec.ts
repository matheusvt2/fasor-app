import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  companyBlockType,
  definitionContext,
  EMPTY_DEFINITION_CONTEXT,
  initialOrderKey,
  newEquipmentBlock,
  parseTestBaseText,
  planTestBaseImport,
  publishedText,
  SEED_VERSION,
  testBaseHelpOf,
  testBaseImportedText,
  testBaseUpdatedText,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type OpDraft,
  type TestBaseFile,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { REVISION_B_DJ_OBJECTIVE, REVISION_B_TR_SE_INDEX_PROCEDURE, syntheticRevisionB } from '../packages/domain/fixtures/test-base/revision-b.ts';
import { editorTab, openTypeList, publishButton, scrollsSideways, typeInto, typeRows } from './support/company-type.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 25.23 (contract 51): "Atualizar base de ensaios", driven as a person does at 1280 px. The office
 * imports synthetic revision A, places a sheet of the TR-SE transformer copy (version 1) in a relatório,
 * and edits the disjuntor copy's insulation "Recomendação se reprovado" in the type editor (published as
 * version 2). It then applies synthetic revision B (`fixtures/test-base/revision-b.ts`, written to a file
 * for the chooser): the preview names the two types it updates, the two texts nobody edited that it
 * replaces, and the edited recommendation with "Manter o da empresa" chosen (at 390 px nothing scrolls
 * sideways); "Atualizar" writes two drafts and no version. The kept recommendation and B's objective sit
 * in the disjuntor's draft; the TR-SE draft is published from the editor as version 2. A sheet of version 2
 * shows B's "Como ensaiar" of the polarization index under its insulation tables; the sheet placed before
 * the update keeps version 1 and A's text. Nothing is generated, so the file runs in the parallel group.
 * Empresa B is this worker's own (E6-Q7). Synthetic text only.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const FIXTURE_A = fileURLToPath(new URL('../packages/domain/fixtures/test-base/base-ensaios-sintetica.json', import.meta.url));
const A: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(FIXTURE_A, 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();
const B = syntheticRevisionB(A);
const PLAN = planTestBaseImport(A, EMPTY_DEFINITION_CONTEXT);
const DJ = PLAN.copies.find((copy) => copy.equipmentId === 'DJ')!.label;
const TR_SE = PLAN.copies.find((copy) => copy.equipmentId === 'TR-SE')!.label;
const A_INDEX_PROCEDURE = testBaseHelpOf(A.ensaios.find((row) => row.id === 'TR-SE-03')!).procedure!;
const OFFICE_RECOMMENDATION = 'Texto da empresa: limpar e repetir o ensaio sintético';
const LOCAL = 'Geradores';

interface EntityRecord {
  entity: string;
  id: string;
  row: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const updateDialog = (page: Page) => page.getByRole('dialog', { name: 'Atualizar base de ensaios' });

async function chooseFile(page: Page, button: string, path: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tpl-tipos .section-head').getByRole('button', { name: button }).click();
  await (await chooser).setFiles(path);
}

/** The company's type and version rows on the device. */
async function companyRows(page: Page): Promise<{ types: EquipmentTypeRow[]; versions: EquipmentTypeVersionRow[] }> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  return {
    types: records.filter((record) => record.entity === 'equipment_type').map((record) => record.row as EquipmentTypeRow),
    versions: records.filter((record) => record.entity === 'equipment_type_version').map((record) => record.row as EquipmentTypeVersionRow),
  };
}

type Entry = Record<string, unknown>;
const insulationOf = (definition: object): Entry => ((definition as { tests: Entry[] }).tests ?? []).find((test) => test.key === 'isolacao')!;

/** A sheet of the TR-SE copy at `version` on Geradores, as office ops. */
function trSeSheet(relatorioId: string, projectId: string, localId: string, version: EquipmentTypeVersionRow, types: EquipmentTypeRow[], tag: string, order: number): { blockId: string; drafts: OpDraft[] } {
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId,
    projectId,
    locationId: localId,
    type: companyBlockType(version.type_id),
    tag,
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(order),
    typeVersion: { version: version.version, id: version.id },
    definitions: definitionContext([version], types),
  });
  return {
    blockId: pair.block.id,
    drafts: [
      officeDraft(account, { projectId }, `equipment/${pair.equipment.id}`, pair.equipment, 'create'),
      officeDraft(account, { relatorioId }, `block/${pair.block.id}`, pair.block, 'create'),
    ],
  };
}

/** The sheet's insulation "Como ensaiar o índice de polarização": the dialog's procedure. */
async function indexProcedure(page: Page, relatorioId: string, blockId: string): Promise<string> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(TR_SE, { timeout: 30_000 });
  const section = page.locator('#ficha-step-ensaios section[data-test-key="isolacao"]');
  const action = section.locator('[data-index-help]').getByRole('button', { name: 'Como ensaiar o índice de polarização' });
  await action.scrollIntoViewIfNeeded();
  await action.click();
  const dialog = page.getByRole('dialog', { name: 'Índice de polarização' });
  await expect(dialog).toBeVisible();
  const procedure = dialog.locator('.como-list > div[data-help-key="procedure"] dd');
  const text = (await procedure.textContent()) ?? '';
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return text;
}

test('@p0 25.23-E2E-001 the base updated without importing it again: revision A imported, an office edit, revision B applied over it with its preview, the drafts written and one published; a sheet of the new version shows the index help, the sheet placed before keeps its version', async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- revision A imported ---
  await openTypeList(page);
  await chooseFile(page, 'Importar base de ensaios', FIXTURE_A);
  await page.getByRole('dialog', { name: 'Importar base de ensaios' }).getByRole('button', { name: 'Importar' }).click();
  await expect(toast(page)).toHaveText(testBaseImportedText(PLAN.copies.length));
  await expect.poll(async () => (await companyRows(page)).versions.length).toBe(PLAN.copies.length);
  await syncNow(page);
  const imported = await companyRows(page);
  const versionOf = (label: string) => imported.versions.find((row) => row.definition.label === label)!;
  const djV1 = versionOf(DJ);
  const trSeV1 = versionOf(TR_SE);

  // --- a relatório with a sheet of the TR-SE copy at version 1, placed before the update ---
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const before = trSeSheet(built.relatorioId, built.projectId, local.id, trSeV1, imported.types, 'TR-ANTES', 998);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId), ...before.drafts]);

  // --- the office edits the disjuntor copy's insulation recommendation and publishes version 2 ---
  await page.goto(`/templates/tipos/${djV1.type_id}`);
  await expect(page.locator('.tipo-head h2')).toBeVisible({ timeout: 30_000 });
  await editorTab(page, 'Ensaios');
  const djIndex = djV1.definition.tests.findIndex((one) => one.key === 'isolacao');
  await page.locator(`li.registry-row[data-entry-key="tests:${djIndex}"]`).locator('button.rr-text').click();
  await typeInto(page.locator('li.def-edit').getByRole('textbox', { name: 'Recomendação se reprovado' }), OFFICE_RECOMMENDATION);
  await expect(publishButton(page)).toHaveText('Publicar versão 2');
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(2));
  await syncNow(page);

  // --- revision B: the preview, at 390 nothing scrolls sideways ---
  const fileB = testInfo.outputPath('base-ensaios-sintetica-revisao-b.json');
  writeFileSync(fileB, JSON.stringify(B));
  await page.setViewportSize({ width: 390, height: 844 });
  await openTypeList(page);
  const outboxBefore = (await readStore(page, database, 'outbox')).length;
  await chooseFile(page, 'Atualizar base de ensaios', fileB);
  const dialog = updateDialog(page);
  await expect(dialog).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dialog).toContainText('Atualiza 2 tipos da empresa com esta base. Nada é publicado: cada tipo ganha um rascunho para você conferir e publicar.');
  await expect(dialog).toContainText('Substitui 2 textos que ninguém editou desde a última atualização.');
  await expect(dialog).toContainText('Editados pela empresa e diferentes nesta base (1)');
  const differing = dialog.locator('.e25-diff-list > li');
  await expect(differing).toHaveCount(1);
  await expect(differing.locator('.e25-diff-where')).toHaveText(`${DJ} · ${insulationOf(djV1.definition).label as string} · Recomendação se reprovado`);
  await expect(differing.getByRole('radio', { name: 'Manter o da empresa' })).toHaveAttribute('aria-checked', 'true');
  await expect(differing.getByRole('radio', { name: 'Usar o da base' })).toHaveAttribute('aria-checked', 'false');
  // Nothing is written before "Atualizar".
  expect((await readStore(page, database, 'outbox')).length).toBe(outboxBefore);
  await dialog.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(toast(page)).toHaveText(testBaseUpdatedText(2, 0));
  await expect(dialog).toBeHidden();

  // --- the drafts: the disjuntor keeps the office's recommendation and takes B's objective; no version is written ---
  await expect.poll(async () => (await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, trSeV1.type_id)).type?.draft !== null).toBe(true);
  const dj = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, djV1.type_id);
  expect(dj.versions.map((row) => row.version)).toEqual([1, 2]);
  const djDraft = insulationOf(dj.type!.draft!);
  expect(djDraft.recommendation).toBe(OFFICE_RECOMMENDATION);
  expect((djDraft.help as Entry).objective).toBe(REVISION_B_DJ_OBJECTIVE);
  const trSe = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, trSeV1.type_id);
  expect(trSe.versions.map((row) => row.version)).toEqual([1]);
  expect((insulationOf(trSe.type!.draft!).index_help as Entry).procedure).toBe(REVISION_B_TR_SE_INDEX_PROCEDURE);

  // --- the office publishes the TR-SE draft from the editor ---
  await page.goto(`/templates/tipos/${trSeV1.type_id}`);
  await expect(publishButton(page)).toHaveText('Publicar versão 2', { timeout: 30_000 });
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(2));
  await syncNow(page);
  const published = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, trSeV1.type_id);
  const trSeV2 = published.versions.find((row) => row.version === 2)!;
  expect(published.versions.find((row) => row.version === 1)).toEqual(trSeV1);

  // --- a sheet of version 2 shows B's index help; the sheet placed before keeps version 1 and A's text ---
  const after = trSeSheet(built.relatorioId, built.projectId, local.id, trSeV2, [published.type!], 'TR-DEPOIS', 999);
  await pushDrafts(page, database, after.drafts);
  expect(await indexProcedure(page, built.relatorioId, after.blockId)).toBe(REVISION_B_TR_SE_INDEX_PROCEDURE);
  expect(await indexProcedure(page, built.relatorioId, before.blockId)).toBe(A_INDEX_PROCEDURE);
  const blocks = (await readStore<EntityRecord>(page, database, 'entities')).filter((record) => record.entity === 'block' && record.id === before.blockId);
  expect((blocks[0]!.row as { config: { type_version?: number } }).config.type_version).toBe(1);
});
