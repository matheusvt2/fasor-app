import {
  blockTypeLabel,
  companyBlockType,
  definitionContext,
  duplicateSeededType,
  hiddenTypeText,
  paletteTypeGroups,
  publishedText,
  retireTypeTitle,
  SEED_VERSION,
  STANDARD_TEMPLATE_NAME,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { duplicateLibraryType, libraryRow, openTypeList, publishButton, typeRows } from './support/company-type.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';
import { expandLocation, section9Chevron } from './support/tree.ts';

/*
 * Story 24.19 (batch e24c): a published company copy of a seeded type hides the type in both
 * palettes and takes its place. 24.19-E2E-001 (768 px, the field palette): "Duplicar" of the
 * Transformador de força published untouched; the palette of a relatório's local lists the copy where
 * the transformer stood, marked "Tipo da empresa", and not the transformer (the order is the
 * kernel's, `paletteTypeGroups` over the device's types); a tap creates the copy at version 1 (outbox
 * and store); the type list says the library transformer is hidden; retired, the palette offers the
 * transformer again. 24.19-E2E-002: the template composer's palette lists the same way, and a
 * relatório that already held the transformer opens its sheet and duplicates it as before.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const TR = 'transformador_forca' as const;
const LOCAL = 'Oxigênio';
const COPY_LABEL = duplicateSeededType(SEED_VERSION, TR).draft.label;

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
}
interface EntityRecord {
  entity: string;
  id: string;
  row: { block_type?: string; config?: { type_version?: number; type_version_id?: string } };
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');

/** "Duplicar" of the library transformer, published untouched and synced; its id and the device's context of types. */
async function publishCopy(page: Page): Promise<{ typeId: string; versionId: string; ctx: ReturnType<typeof definitionContext> }> {
  await openTypeList(page);
  const typeId = await duplicateLibraryType(page, TR);
  await expect(page.locator('.tipo-head h2')).toHaveText(COPY_LABEL);
  await publishButton(page).click();
  await expect(toast(page)).toHaveText(publishedText(1));
  await syncNow(page);
  const rows = await typeRows<EquipmentTypeRow, EquipmentTypeVersionRow>(page, database, typeId);
  return { typeId, versionId: rows.versions[0]!.id, ctx: definitionContext(rows.versions, rows.type === undefined ? [] : [rows.type]) };
}

/** The field palette of the local, open. */
async function openFieldPalette(page: Page, relatorioId: string) {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette).toBeVisible();
  return palette;
}

const rowTypes = (palette: ReturnType<Page['getByRole']>) => palette.locator('.palette-type').evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.blockType));

test('@p0 24.19-E2E-001 at 768: a published copy of the transformer stands where it stood in the field palette, marked "Tipo da empresa"; the transformer is not offered; a tap creates the copy; retired, the transformer is back', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  const { typeId, versionId, ctx } = await publishCopy(page);
  const copyType = companyBlockType(typeId);

  // The type list keeps the library transformer, with the line saying it is hidden.
  await openTypeList(page);
  await expect(libraryRow(page, TR).locator('[data-hidden-type]')).toHaveText(hiddenTypeText([COPY_LABEL])!);

  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  let palette = await openFieldPalette(page, built.relatorioId);
  const groups = paletteTypeGroups(SEED_VERSION, ctx);
  expect(groups.flatMap((group) => group.types)).not.toContain(TR);
  await expect.poll(() => rowTypes(palette)).toEqual(groups.flatMap((group) => group.types));
  const copyRow = palette.locator(`.palette-type[data-block-type="${copyType}"] .pf-field`);
  await expect(copyRow.locator('.pi-text > span:first-child')).toHaveText(COPY_LABEL);
  await expect(copyRow.locator('.pi-meta')).toHaveText(/^Tipo da empresa · /);
  // Among the eight: before the "Outros equipamentos" heading.
  const heading = palette.locator('.palette-group', { hasText: /^Outros equipamentos$/ });
  expect(await copyRow.evaluate((row, other) => Boolean(row.compareDocumentPosition(other!) & Node.DOCUMENT_POSITION_FOLLOWING), await heading.elementHandle())).toBe(true);

  // A tap creates the copy at its version: outbox and store.
  const before = new Set((await outbox(page)).map((row) => row.path));
  await copyRow.click();
  await expect(palette).toBeHidden();
  let blockId = '';
  await expect
    .poll(async () => {
      const created = (await outbox(page)).find((row) => !before.has(row.path) && row.kind === 'create' && row.path.startsWith('block/') && (row.value as EntityRecord['row']).block_type === copyType);
      blockId = created === undefined ? '' : created.path.split('/')[1]!;
      return created === undefined ? null : (created.value as EntityRecord['row']).config;
    })
    .toMatchObject({ type_version: 1, type_version_id: versionId });
  await expect
    .poll(async () => (await readStore<EntityRecord>(page, database, 'entities')).find((record) => record.entity === 'block' && record.id === blockId)?.row.block_type)
    .toBe(copyType);

  // Retired, the copy leaves the palette and the transformer is back in its place.
  await page.goto(`/templates/tipos/${typeId}`);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Aposentar' }).click();
  const confirm = page.getByRole('alertdialog', { name: retireTypeTitle(COPY_LABEL) }).or(page.getByRole('dialog', { name: retireTypeTitle(COPY_LABEL) }));
  await confirm.getByRole('button', { name: 'Aposentar' }).click();
  await expect(page.locator('.tipo-head .status-pill')).toHaveText('Aposentado · versão 1');
  palette = await openFieldPalette(page, built.relatorioId);
  const original = paletteTypeGroups(SEED_VERSION, definitionContext([], []));
  await expect.poll(() => rowTypes(palette)).toEqual(original.flatMap((group) => group.types));
  await expect(palette.locator(`.palette-type[data-block-type="${TR}"] .pf-field .pi-text > span:first-child`)).toHaveText(blockTypeLabel(SEED_VERSION, TR));
});

test('24.19-E2E-002 the composer\'s palette lists the copy where the transformer stood; a relatório that already held the transformer opens its sheet and duplicates it as before', async ({ page }) => {
  test.setTimeout(300_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // The relatório held the transformer before the copy existed.
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  const sheet = built.sheets.find((row) => row.blockType === TR && row.locationName === LOCAL)!;
  const { typeId, ctx } = await publishCopy(page);

  // --- the template composer: the copy among the eight, the transformer gone ---
  await page.goto('/templates');
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  const composer = page.getByRole('complementary', { name: 'Paleta de blocos' });
  const names = composer.locator('.palette-item.is-stepper .pi-text > span:first-child');
  const types = paletteTypeGroups(SEED_VERSION, ctx).flatMap((group) => group.types);
  await expect(names).toHaveCount(types.length);
  await expect(names.nth(types.indexOf(companyBlockType(typeId)))).toHaveText(COPY_LABEL);
  expect(await names.allTextContents()).not.toContain(blockTypeLabel(SEED_VERSION, TR));
  await expect(composer.locator('.palette-item.is-stepper').nth(types.indexOf(companyBlockType(typeId))).locator('.pi-meta')).toHaveText(/^Tipo da empresa · /);

  // --- the relatório from before: its transformer sheet opens and duplicates as before ---
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toContainText(blockTypeLabel(SEED_VERSION, TR), { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = section9Chevron(page);
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  const before = new Set((await outbox(page)).map((row) => row.path));
  await page.getByRole('button', { name: `Mais opções de ${sheet.tag}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  const dialog = page.getByRole('dialog', { name: `Duplicar ${sheet.tag}` });
  await dialog.getByRole('button', { name: 'Duplicar' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => (await outbox(page)).filter((row) => !before.has(row.path) && row.kind === 'create' && row.path.startsWith('block/')).map((row) => (row.value as EntityRecord['row']).block_type))
    .toEqual([TR]);
});

test('@p1 e24x-E2E-002 the standard template places transformers: its composer keeps "Editar padrões" for the hidden transformer right after the copy, with nothing to add', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  await publishCopy(page);

  await page.goto('/templates');
  await page.getByRole('button', { name: `Abrir template ${STANDARD_TEMPLATE_NAME}`, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: /^Coluna 9/ }).first().click();
  const composer = page.getByRole('complementary', { name: 'Paleta de blocos' });
  const rows = composer.locator('.palette-item.is-stepper');
  const names = await rows.locator('.pi-text > span:first-child').allTextContents();
  const at = names.indexOf(COPY_LABEL);
  expect(at).toBeGreaterThanOrEqual(0);
  const hidden = rows.nth(at + 1);
  await expect(hidden).toHaveAttribute('data-hidden-type', '');
  await expect(hidden.locator('.pi-text > span:first-child')).toHaveText(blockTypeLabel(SEED_VERSION, TR));
  const meta = hidden.locator('.pi-meta');
  await expect(meta).toHaveText(hiddenTypeText([COPY_LABEL])!);
  const metaId = await meta.getAttribute('id');
  // No stepper adds more of it: its buttons are disabled, described by the hidden line.
  const steppers = hidden.locator('.quantity-stepper .step');
  await expect(steppers).toHaveCount(2);
  for (const button of await steppers.all()) {
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toHaveAttribute('aria-describedby', metaId!);
  }
  await hidden.getByRole('button', { name: `Editar padrões de ${blockTypeLabel(SEED_VERSION, TR)}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: new RegExp(blockTypeLabel(SEED_VERSION, TR)) })).toBeVisible();
});
