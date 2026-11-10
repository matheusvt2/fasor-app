import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cellAddressesOf,
  companyBlockType,
  definitionContext,
  EMPTY_DEFINITION_CONTEXT,
  initialOrderKey,
  newEquipmentBlock,
  parseTestBaseText,
  planTestBaseImport,
  SEED_VERSION,
  testBaseHelpOf,
  testBaseImportedText,
  testHelpMetaText,
  type BlockDefinition,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type TestBaseFile,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { openTypeList, scrollsSideways } from './support/company-type.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 23.12 (batch e23x, M-1 (b)): the base's help and recommendation texts through a private
 * import, driven as a person does at 1280 px. On Modelos > Tipos de equipamento, "Importar base de
 * ensaios" reads the synthetic base (rev08's shape and row IDs, invented text only); the preview
 * names the copies, "Importar" writes them, and their versions in the store carry the file's texts.
 * A second import says every type is already imported and writes no op; at 390 px the section and
 * the preview do not scroll sideways. A relatório gets a sheet of the imported disjuntor copy
 * (office ops, born at v1): its insulation "Como ensaiar" lists DJ-02's headings, a reading below
 * the criterion is typed, and the Pontos entry starts with DJ-02's recommendation. Nothing is
 * generated, so the file stays in the parallel group. Empresa B is this worker's own (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const FIXTURE_PATH = fileURLToPath(new URL('../packages/domain/fixtures/test-base/base-ensaios-sintetica.json', import.meta.url));
const FILE: TestBaseFile = (() => {
  const parsed = parseTestBaseText(readFileSync(FIXTURE_PATH, 'utf8'));
  if (!parsed.ok) throw new Error('the synthetic base does not parse');
  return parsed.file;
})();
const PLAN = planTestBaseImport(FILE, EMPTY_DEFINITION_CONTEXT);
const DJ_COPY = PLAN.copies.find((copy) => copy.equipmentId === 'DJ')!;
const DJ_02 = FILE.ensaios.find((row) => row.id === 'DJ-02')!;
const DJ_HELP = testBaseHelpOf(DJ_02);
const STARTS = `${DJ_02.recomendacao_reprovado}. `;
/** The dialog's headings, in the fixed order, of the seven DJ-02 fills (no NR-10 column). */
const HEADINGS = ['Objetivo', 'Instrumento', 'Tensão de ensaio', 'Ligações', 'Procedimento', 'Critério', 'Norma'];
const HELP_TEXTS = [DJ_HELP.objective, DJ_HELP.instrument, DJ_HELP.voltage, DJ_HELP.connections, DJ_HELP.procedure, DJ_HELP.criterion, DJ_HELP.standard].map((text) => text!.replaceAll('\n', ' '));
const LOCAL = 'Geradores';
/** Far below any insulation criterion. */
const READING = '1';

interface EntityRecord {
  entity: string;
  id: string;
  row: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const autoCards = (page: Page) => page.locator('.poa-list > .point-of-attention-card.is-auto');
const importDialog = (page: Page) => page.getByRole('dialog', { name: 'Importar base de ensaios' });
const outboxCount = async (page: Page) => (await readStore(page, database, 'outbox')).length;

/** "Importar base de ensaios": the action opens the file chooser, which takes the synthetic base. */
async function chooseBase(page: Page): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tpl-tipos .section-head').getByRole('button', { name: 'Importar base de ensaios' }).click();
  await (await chooser).setFiles(FIXTURE_PATH);
}

/** The imported copies' type and version rows on the device. */
async function importedRows(page: Page): Promise<{ types: EquipmentTypeRow[]; versions: EquipmentTypeVersionRow[] }> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const labels = new Set(PLAN.copies.map((copy) => copy.label));
  const versions = records.filter((record) => record.entity === 'equipment_type_version').map((record) => record.row as EquipmentTypeVersionRow).filter((row) => labels.has(row.definition.label));
  const ids = new Set(versions.map((row) => row.type_id));
  const types = records.filter((record) => record.entity === 'equipment_type' && ids.has(record.id)).map((record) => record.row as EquipmentTypeRow);
  return { types, versions };
}

test('@p0 23.12-E2E-001 the base imported on Tipos makes the company copies with its texts: the preview, "Importar", the copies and their versions; a second import writes nothing; at 390 nothing scrolls sideways; the imported disjuntor sheet shows DJ-02 in "Como ensaiar" and its recommendation starts the derived point', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);

  // --- the first import: the preview, "Importar", the toast ---
  await openTypeList(page);
  await chooseBase(page);
  const dialog = importDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Cria ${PLAN.copies.length} tipos da empresa`);
  await expect(dialog).toContainText(DJ_COPY.label);
  await expect(dialog).toContainText('Sem ensaio no app: ');
  await dialog.getByRole('button', { name: 'Importar' }).click();
  await expect(toast(page)).toHaveText(testBaseImportedText(PLAN.copies.length));
  await expect(dialog).toBeHidden();

  // --- the copies under "Da empresa", their versions in the store with the file's texts ---
  const company = page.locator('ul[data-group="company-types"] > li');
  await expect(company).toHaveCount(PLAN.copies.length);
  for (const copy of PLAN.copies) await expect(company.filter({ hasText: copy.label })).toHaveCount(1);
  await expect.poll(async () => (await importedRows(page)).versions.length).toBe(PLAN.copies.length);
  const rows = await importedRows(page);
  expect(rows.types.map((type) => type.latest_version)).toEqual(rows.types.map(() => 1));
  const djVersion = rows.versions.find((row) => row.definition.label === DJ_COPY.label)!;
  const djTest = djVersion.definition.tests.find((t) => t.key === 'isolacao') as unknown as { help: Record<string, string>; recommendation: string };
  expect(djTest.help).toEqual(DJ_HELP);
  expect(djTest.recommendation).toBe(DJ_02.recomendacao_reprovado);
  await syncNow(page);

  // --- the second import, at 390: already imported, no confirm, no op; nothing scrolls sideways ---
  await page.setViewportSize({ width: 390, height: 844 });
  await openTypeList(page);
  expect(await scrollsSideways(page)).toBe(false);
  const before = await outboxCount(page);
  await chooseBase(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Todos os tipos desta base já foram importados. Nada será gravado.');
  await expect(dialog.getByRole('button', { name: 'Importar' })).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect(await outboxCount(page)).toBe(before);
  await page.setViewportSize({ width: 1280, height: 900 });

  // --- a relatório with one sheet of the imported disjuntor copy on Geradores, born at v1 ---
  const djType = rows.types.find((type) => type.id === djVersion.type_id)!;
  const definitions = definitionContext([djVersion], [djType]);
  const built = newRelatorioDrafts(account);
  const local = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string }).name === LOCAL)!.value as { id: string };
  const pair = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: local.id,
    type: companyBlockType(djType.id),
    tag: 'DJ-BASE',
    seedVersion: SEED_VERSION,
    orderKey: initialOrderKey(999),
    typeVersion: { version: 1, id: djVersion.id },
    definitions,
  });
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${pair.equipment.id}`, pair.equipment, 'create'),
    officeDraft(account, { relatorioId: built.relatorioId }, `block/${pair.block.id}`, pair.block, 'create'),
    // Seed v13 (Story 23.2): the disjuntor's insulation criterion is picked by TENSÃO NOMINAL.
    officeDraft(account, { relatorioId: built.relatorioId }, `sheet/${pair.block.id}/nameplate/tensao_nominal`, '15'),
  ]);
  const blockId = pair.block.id;

  // --- the sheet: "Como ensaiar" on its insulation test lists DJ-02's seven headings ---
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toContainText(DJ_COPY.label, { timeout: 30_000 });
  const section = page.locator('#ficha-step-ensaios section[data-test-key="isolacao"]');
  const title = (await section.locator('.section-head h2').textContent())!;
  await section.locator('.section-head').getByRole('button', { name: 'Como ensaiar' }).click();
  const como = page.getByRole('dialog', { name: title });
  await expect(como).toBeVisible();
  await expect(como.locator('.como-meta')).toHaveText(testHelpMetaText(DJ_COPY.label, 7));
  await expect(como.locator('.como-meta')).toContainText('7 de 8 tópicos preenchidos');
  await expect(como.locator('.como-list dt')).toHaveText(HEADINGS);
  await expect(como.locator('.como-list dd')).toHaveText(HELP_TEXTS);
  await expect(como.locator('.como-list dd').nth(5)).toContainText(`Aprovado: ${DJ_02.criterio_aprovado}`);
  await expect(como.locator('.como-list dd').nth(5)).toContainText(`Com restrições: ${DJ_02.criterio_restricao}`);
  await expect(como.locator('.como-list dd').nth(5)).toContainText(`Reprovado: ${DJ_02.criterio_reprovado}`);
  await page.keyboard.press('Escape');
  await expect(como).toBeHidden();

  // --- a reading below the criterion, typed ---
  const [first] = cellAddressesOf(djVersion.definition as unknown as BlockDefinition, 'isolacao');
  const input = page.locator(`input[data-cell-input="isolacao:${first!.row}:${first!.col}"]`).filter({ visible: true });
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await page.keyboard.type(READING);
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((row) => row.path === `sheet/${blockId}/test/isolacao/cell/${first!.row}/${first!.col}`).map((row) => (row.value as { raw?: string }).raw))
    .toEqual([READING]);

  // --- Pontos: the entry starts with DJ-02's recommendation and a period ---
  await page.goto(`/relatorio/${built.relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  const entry = autoCards(page).filter({ has: page.locator('.not-tested-chip', { hasText: 'Fora do critério' }) });
  await expect(entry).toHaveCount(1);
  const text = entry.locator('.not-tested-band > .not-tested-chip + span');
  await expect(text).toContainText(STARTS);
  expect((await text.textContent())!.startsWith(STARTS), (await text.textContent())!).toBe(true);
});
