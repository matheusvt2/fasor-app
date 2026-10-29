import { getDefinition, screenLabel, sheetChecklistPath, sheetNameplatePath, type ChecklistItem } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { copy } from '../apps/web/src/copy/pt-br.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { relatorioSeedVersion, typeRows } from './support/palette.ts';
import { openSheetOfType } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';

/*
 * 14.12-E2E. The company's learned options (Story 14.12, contract 23), as a technician and the
 * office meet them.
 *
 * 14.12-E2E-001 (@p0, 768 px): on a Disjuntor MT sheet an item is marked NC and its observation
 * typed by hand, and a new FABRICANTE typed ("Criar"); the office types another FABRICANTE on a
 * second sheet with no registry row; "Sincronizar agora". The device then holds one learned
 * `nc_phrase` row and one manufacturer row per name (IndexedDB). On a second relatório a Disjuntor
 * MT added from the field palette offers the phrase on that item after the seed's chips, and both
 * manufacturers as chips. In Cadastros › Frases de NC the phrase is listed under its type with its
 * item and removed (Confirm, outbox op); Fabricantes lists both names. After a sync the second
 * relatório's item offers the seed's chips only, and the first relatório still holds and shows the
 * typed observation (its IndexedDB cell asserted).
 *
 * 14.12-E2E-002 (@p1): a second browser context of the same company offers the learned phrase on
 * another relatório only after its own "Sincronizar agora".
 * 14.12-E2E-003 (@p1, 390 px): Cadastros › Frases de NC (picked at 768 px, kept at 390 px) and
 * its panel fit with no sideways scroll.
 *
 * Each test resets this worker's own Empresa B (E6-Q7).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  relatorio_id: string | null;
}
interface EntityRecord {
  entity: string;
  id: string;
  row: Record<string, unknown>;
}

const DJ = 'disjuntor_mt';
const ITEM = 'abertura_e_fechamento_mecanico';
const LOCAL = 'Cubículo Enel';
const TYPED = 'Mola de fechamento sem carga';
const MAKER = 'Brivolta Aprendida';
const OFFICE_MAKER = 'Celtta Escritório';
const r = copy.registries;

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const records = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const lastWritten = async (page: Page, path: string) => (await outbox(page)).filter((op) => op.path === path).at(-1)?.value;
const checklistRow = (page: Page) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${ITEM}"]`);
const field = (page: Page, key: string) => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const toast = (page: Page) => page.getByTestId('toast');

/** The item's definition on the relatório's seed version, with its number on the sheet. */
async function itemOf(page: Page, relatorioId: string): Promise<{ item: ChecklistItem; n: number }> {
  const checklist = getDefinition(await relatorioSeedVersion(page, database, relatorioId), 'cabine_primaria', DJ).checklist!;
  const index = checklist.findIndex((entry) => entry.key === ITEM);
  return { item: checklist[index]!, n: index + 1 };
}

/** The NC chips the row offers, in order. */
function chips(page: Page, n: number): Locator {
  return checklistRow(page).getByRole('group', { name: `Observações sugeridas do item ${n}` }).getByRole('button');
}

/** Marks the item NC (a no-op when it already is). */
async function markNc(page: Page): Promise<void> {
  const nc = checklistRow(page).getByRole('radio', { name: 'Não conforme' });
  if ((await nc.getAttribute('aria-checked')) !== 'true') await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
}

/** The company's registry rows of `kind` this device holds, live ones only, by name. */
async function liveRegistryNames(page: Page, kind: string): Promise<string[]> {
  return (await records(page))
    .filter((record) => record.entity === 'registry' && record.row.kind === kind && record.row.removed_at === null)
    .map((record) => String(record.row.name))
    .sort();
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

test('@p0 14.12-E2E-001 an NC observation typed by hand and a new FABRICANTE become the company\'s options on a later sheet; the office removes the phrase in Cadastros › Frases de NC and the sheets keep their values', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId: first, blockId } = await openSheetOfType(page, account, database, { cabine: LOCAL, typeLabel: 'Disjuntor MT', width: 768 });
  const { item, n } = await itemOf(page, first);

  // The NC item, its observation typed by hand.
  await markNc(page);
  const observation = page.getByLabel(`Observação do item ${n}`, { exact: true });
  await observation.fill(TYPED);
  await observation.press('Tab');
  await expect.poll(() => lastWritten(page, sheetChecklistPath(blockId, ITEM, 'observation')), { timeout: 15_000 }).toBe(TYPED);

  // A FABRICANTE the company never registered, typed ("Criar").
  const maker = field(page, 'fabricacao');
  await maker.getByRole('button', { name: 'Outro…' }).click();
  await maker.getByRole('combobox').fill(MAKER);
  await page.getByRole('option', { name: `Criar “${MAKER}”` }).click();
  await expect.poll(() => lastWritten(page, sheetNameplatePath(blockId, 'fabricacao')), { timeout: 15_000 }).toBe(MAKER);

  // The office types another FABRICANTE on another Disjuntor MT of this relatório, with no registry row.
  const otherSheet = (await records(page)).find((record) => record.entity === 'block' && record.row.relatorio_id === first && record.row.block_type === DJ && record.id !== blockId)!.id;
  await pushDrafts(page, database, [officeDraft(account, { relatorioId: first }, sheetNameplatePath(otherSheet, 'fabricacao'), OFFICE_MAKER)]);

  await syncNowAndReturn(page);
  // Committed state: one learned phrase, one row per manufacturer name (the "Criar" row is not doubled).
  await expect.poll(() => liveRegistryNames(page, 'nc_phrase'), { timeout: 30_000 }).toEqual([TYPED]);
  await expect.poll(() => liveRegistryNames(page, 'manufacturer'), { timeout: 30_000 }).toEqual([MAKER, OFFICE_MAKER].sort());
  const learned = (await records(page)).find((record) => record.entity === 'registry' && record.row.kind === 'nc_phrase')!;
  expect(learned.row).toMatchObject({ block_type: DJ, item_key: ITEM, name: TYPED });

  // A second relatório: a Disjuntor MT added from the field palette.
  const { relatorioId: second } = await pushNewRelatorio(page, account, database, { emCampo: true });
  await page.goto(`/relatorio/${second}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, LOCAL);
  await page.getByRole('button', { name: `Adicionar equipamento no local ${LOCAL}`, exact: true }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await typeRows(palette, [DJ]).click();
  await expect(palette).toBeHidden();
  await expect
    .poll(async () => (await outbox(page)).some((op) => op.kind === 'create' && op.relatorio_id === second && (op.value as { block_type?: string }).block_type === DJ))
    .toBe(true);
  const added = (await outbox(page)).find((op) => op.kind === 'create' && op.relatorio_id === second && (op.value as { block_type?: string }).block_type === DJ)!;
  const addedId = (added.value as { id: string }).id;
  await openSheet(page, second, addedId);

  // The learned phrase is offered on that item after the seed's chips; both manufacturers as chips.
  await markNc(page);
  await expect(chips(page, n)).toHaveText([...item.nc_phrases, TYPED]);
  for (const name of [MAKER, OFFICE_MAKER]) await expect(field(page, 'fabricacao').getByRole('button', { name, exact: true })).toBeVisible();

  // Cadastros › Frases de NC: listed under its type with its item, removed behind a Confirm.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: r.tabFrasesNc }).click();
  const list = page.getByRole('group', { name: r.frasesNc.listLabel }).getByRole('list', { name: 'Disjuntor MT' });
  await list.getByRole('button', { name: `${TYPED}, ${screenLabel(item.label)}`, exact: true }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel.getByRole('heading', { name: TYPED })).toBeVisible();
  await panel.getByRole('button', { name: r.frasesNc.panel.remove }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(r.frasesNc.panel.removeConfirmBody);
  await dialog.getByRole('button', { name: r.frasesNc.panel.remove }).click();
  await expect(toast(page)).toContainText(r.frasesNc.panel.removed);
  await expect.poll(async () => (await outbox(page)).some((op) => op.kind === 'remove' && op.path === `registry/nc_phrase/${learned.id}/removed_at`)).toBe(true);
  await expect(page.getByText(r.frasesNc.emptyText)).toBeVisible();

  // Fabricantes lists both names.
  await page.getByRole('tab', { name: r.tabFabricantes }).click();
  const makers = page.getByRole('list', { name: r.tabFabricantes });
  for (const name of [MAKER, OFFICE_MAKER]) await expect(makers.getByRole('button', { name, exact: true })).toBeVisible();

  await syncNowAndReturn(page);
  await expect.poll(() => liveRegistryNames(page, 'nc_phrase')).toEqual([]);

  // The second relatório's item offers the seed's chips only.
  await openSheet(page, second, addedId);
  await markNc(page);
  await expect(chips(page, n)).toHaveText([...item.nc_phrases]);

  // The first relatório still holds and shows what was typed.
  await openSheet(page, first, blockId);
  await expect(page.getByLabel(`Observação do item ${n}`, { exact: true })).toHaveValue(TYPED);
  const block = (await records(page)).find((record) => record.entity === 'block' && record.id === blockId)!;
  expect((block.row.sheet as { checklist: Record<string, { observation?: { value: unknown } }> }).checklist[ITEM]!.observation!.value).toBe(TYPED);
  expect((block.row.sheet as { nameplate: Record<string, { value: unknown }> }).nameplate.fabricacao!.value).toBe(MAKER);
});

test('@p1 14.12-E2E-002 a second device of the company offers the learned phrase only after its own sync', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  // Two relatórios from the office: the first device types on one, the second opens the other.
  const one = newRelatorioDrafts(account);
  const two = newRelatorioDrafts(account);
  await pushDrafts(page, database, [...one.drafts, emCampoDraft(account, one.relatorioId), ...two.drafts, emCampoDraft(account, two.relatorioId)]);
  const sheetOne = one.sheets.find((sheet) => sheet.blockType === DJ)!;
  const sheetTwo = two.sheets.find((sheet) => sheet.blockType === DJ)!;

  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.setViewportSize({ width: 768, height: 1024 });
    await signIn(other, account.email);
    await syncNowAndReturn(other);
    await openSheet(other, two.relatorioId, sheetTwo.blockId);
    const { item, n } = await itemOf(other, two.relatorioId);
    await markNc(other);
    await expect(chips(other, n)).toHaveText([...item.nc_phrases]);

    // The first device types the phrase and syncs.
    await syncNowAndReturn(page);
    await openSheet(page, one.relatorioId, sheetOne.blockId);
    await markNc(page);
    const observation = page.getByLabel(`Observação do item ${n}`, { exact: true });
    await observation.fill(TYPED);
    await observation.press('Tab');
    await expect.poll(() => lastWritten(page, sheetChecklistPath(sheetOne.blockId, ITEM, 'observation')), { timeout: 15_000 }).toBe(TYPED);
    await syncNowAndReturn(page);
    await expect.poll(() => liveRegistryNames(page, 'nc_phrase'), { timeout: 30_000 }).toEqual([TYPED]);

    // The second device does not offer it yet; after its own sync it does.
    await expect(chips(other, n)).toHaveText([...item.nc_phrases]);
    await syncNowAndReturn(other);
    await markNc(other);
    await expect(chips(other, n)).toHaveText([...item.nc_phrases, TYPED]);
  } finally {
    await context.close();
  }
});

test('@p1 14.12-E2E-003 at 390 px Cadastros › Frases de NC and its panel fit with no sideways scroll', async ({ page }) => {
  test.setTimeout(180_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  // The office types the NC observation: the server learns it from that push.
  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((entry) => entry.blockType === DJ)!;
  await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: built.relatorioId }, sheetChecklistPath(sheet.blockId, ITEM, 'result'), 'NC'),
    officeDraft(account, { relatorioId: built.relatorioId }, sheetChecklistPath(sheet.blockId, ITEM, 'observation'), `${TYPED} com folga visível no eixo do mecanismo de acionamento`),
  ]);
  await syncNowAndReturn(page);
  await expect.poll(() => liveRegistryNames(page, 'nc_phrase'), { timeout: 30_000 }).toHaveLength(1);

  // The tab is picked at 768 px (below it the tabs are a one-row selector) and kept at 390 px.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: r.tabFrasesNc }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: r.tabFrasesNc, exact: true })).toBeVisible();
  const row = page.getByRole('group', { name: r.frasesNc.listLabel }).getByRole('button').first();
  await expect(row).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await row.click();
  const panel = page.locator('.registry-panel');
  await expect(panel.getByRole('textbox', { name: r.frasesNc.panel.nameLabel })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});

test('@p1 14.12-E2E-004 fix batch fxpw G8: at 390 px a 66-character learned NC phrase wraps inside its chip, and the sheet does not scroll sideways', async ({ page }) => {
  test.setTimeout(180_000);
  const LONG = 'Temperatura elevada do transformador de força indicada no display.';
  expect(LONG).toHaveLength(66);
  // The server learns the phrase without its closing period (the registry's normalized name), as the pass's chip read.
  const LEARNED = LONG.slice(0, -1);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, account.email);
  // The office types the long observation on one relatório: the server learns it from that push.
  const one = newRelatorioDrafts(account);
  const two = newRelatorioDrafts(account);
  const sheetOne = one.sheets.find((entry) => entry.blockType === DJ)!;
  const sheetTwo = two.sheets.find((entry) => entry.blockType === DJ)!;
  await pushDrafts(page, database, [...one.drafts, emCampoDraft(account, one.relatorioId), ...two.drafts, emCampoDraft(account, two.relatorioId)]);
  await pushDrafts(page, database, [
    officeDraft(account, { relatorioId: one.relatorioId }, sheetChecklistPath(sheetOne.blockId, ITEM, 'result'), 'NC'),
    officeDraft(account, { relatorioId: one.relatorioId }, sheetChecklistPath(sheetOne.blockId, ITEM, 'observation'), LONG),
  ]);
  await syncNowAndReturn(page);
  await expect.poll(() => liveRegistryNames(page, 'nc_phrase'), { timeout: 30_000 }).toEqual([LEARNED]);

  // A later sheet at 390 px offers it as a chip.
  await page.setViewportSize({ width: 390, height: 844 });
  await openSheet(page, two.relatorioId, sheetTwo.blockId);
  const { item, n } = await itemOf(page, two.relatorioId);
  await markNc(page);
  await expect(chips(page, n)).toHaveText([...item.nc_phrases, LEARNED]);
  const chip = chips(page, n).last();
  await chip.scrollIntoViewIfNeeded();
  await expect(chip).toHaveText(LEARNED);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const chipBox = (await chip.boundingBox())!;
  const rowBox = (await checklistRow(page).boundingBox())!;
  expect(chipBox.x).toBeGreaterThanOrEqual(rowBox.x - 0.5);
  expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 0.5);
  // Wrapped: the pill is taller than one line of chip text.
  expect(chipBox.height).toBeGreaterThan(48);
});
