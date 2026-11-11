import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { serverRow } from './support/reading-ops.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 25.2 (M02): what is typed is saved when the technician leaves the sheet with no tap outside the field, as on
 * the tablet, where a tap on the tree, "Voltar" or the stepper moves no focus. Each leave here is the App bar's
 * "Voltar" pressed with `dispatchEvent('click')` (a click that moves no focus, so the field gets no blur); the way
 * back is the browser's history (`goBack`, in the app, so it also works offline).
 * - 25.2-E2E-001: a reading, FABRICAÇÃO (a name the registry lacks) and the conclusion text are each typed and the
 *   sheet left; each op is in the outbox; after a reload and a sync the server holds each value. Offline, the same
 *   three land in the outbox.
 * - 25.2-E2E-002: a confirmed conclusion text reads as text (no textbox, no border) and "Editar" opens the field; a
 *   reading that is no number, left with the sheet, is offered on return as a draft.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  kind: string;
  value: unknown;
  batch_id: string | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const sheetTitle = (page: Page) => page.locator('.sheet-header .sheet-title');
const back = (page: Page) => page.locator('.app-bar').getByRole('button', { name: 'Voltar', exact: true });
const maker = (page: Page) => page.locator('#ficha-nameplate [data-field-key="fabricacao"]');
const conclusionText = (page: Page) => page.locator('.ficha-conc-text');

/** Leaves the sheet with a press that moves no focus, as a tablet tap on "Voltar" does; the field keeps the focus until it unmounts. */
async function leaveWithoutBlur(page: Page, blockId: string, focused: Locator): Promise<void> {
  await expect(focused).toBeFocused();
  await back(page).dispatchEvent('click');
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${blockId}$`));
}

/** Back to the sheet through the app's history (no page load: offline too). */
async function backToSheet(page: Page, blockId: string): Promise<void> {
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
}

/** The first reading cell of the Ensaios step, and the outbox path its value is written to. */
async function firstReading(page: Page, blockId: string): Promise<{ input: Locator; path: string }> {
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const input = page.locator('input.mf-value').filter({ visible: true }).first();
  await expect(input).toBeVisible();
  const [testKey, row, col] = (await input.getAttribute('data-cell-input'))!.split(':');
  return { input, path: `sheet/${blockId}/test/${testKey}/cell/${row}/${col}` };
}

/** Types into FABRICAÇÃO over what it holds, through "Outro…" where the chip row shows (the tablet), the focus left in the field. */
async function typeMaker(page: Page, name: string): Promise<Locator> {
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  const other = maker(page).getByRole('button', { name: 'Outro…' });
  if (await other.isVisible()) await other.click();
  const input = maker(page).getByRole('combobox');
  await input.click();
  await input.press('Control+A');
  await input.pressSequentially(name);
  return input;
}

/** Picks Aprovado, opens the text with "Editar" and types after it, the focus left in the field. */
async function typeConclusionText(page: Page, blockId: string, typed: string): Promise<{ editor: Locator; expected: () => Promise<string> }> {
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  const aprovado = page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Aprovado' });
  if ((await aprovado.getAttribute('aria-checked')) !== 'true') await aprovado.click();
  const editar = conclusionText(page).getByRole('button', { name: 'Editar' });
  const editor = conclusionText(page).getByRole('textbox', { name: 'Texto da conclusão' });
  // An edited text is already the field; a suggested or confirmed one opens with "Editar".
  if (await editar.isVisible()) {
    await editar.click();
    await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${blockId}/conclusion/text_status` && row.value === 'edited')).toBe(true);
    await expect(editor).toBeFocused();
  } else {
    await editor.click();
  }
  const before = await editor.inputValue();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(typed);
  return { editor, expected: async () => `${before}${typed}` };
}

const lastValue = async (page: Page, path: string): Promise<unknown> => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;

test('@p0 25.2-E2E-001 on the tablet, a reading, FABRICAÇÃO and the conclusion text typed and left with the sheet are saved; after a reload and a sync the server holds each; offline the same lands in the outbox', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 768 });
  await page.setViewportSize({ width: 768, height: 1024 });
  const name = `Fabricante E25A ${Date.now()}`;

  // The reading: "548", the focus still in the cell, the sheet left.
  const reading = await firstReading(page, blockId);
  await reading.input.click();
  await reading.input.pressSequentially('548');
  await leaveWithoutBlur(page, blockId, reading.input);
  await expect.poll(() => lastValue(page, reading.path)).toMatchObject({ raw: '548', state: 'measured' });
  expect(((await lastValue(page, reading.path)) as { unit: string | null }).unit).not.toBeNull();

  // FABRICAÇÃO: a name the registry lacks, created and stored once, in one batch, as "Criar" does.
  await backToSheet(page, blockId);
  const makerInput = await typeMaker(page, name);
  await leaveWithoutBlur(page, blockId, makerInput);
  const makerPath = `sheet/${blockId}/nameplate/fabricacao`;
  await expect.poll(() => lastValue(page, makerPath)).toBe(name);
  const rows = await outbox(page);
  const word = rows.filter((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/') && (row.value as { name?: string }).name === name);
  expect(word).toHaveLength(1);
  expect(rows.filter((row) => row.path === makerPath && row.value === name)).toHaveLength(1);
  expect(rows.find((row) => row.path === makerPath && row.value === name)!.batch_id).toBe(word[0]!.batch_id);

  // The conclusion text: typed a moment ago, the sheet left; committed once, before the screen left.
  await backToSheet(page, blockId);
  const text = await typeConclusionText(page, blockId, ' Texto do técnico, sem sair do campo.');
  const expected = await text.expected();
  await leaveWithoutBlur(page, blockId, text.editor);
  const textPath = `sheet/${blockId}/conclusion/text`;
  await expect.poll(() => lastValue(page, textPath)).toBe(expected);
  expect((await outbox(page)).filter((row) => row.path === textPath && row.value === expected)).toHaveLength(1);

  // A reload and a sync: the server holds the three values.
  await page.reload();
  await syncNow(page);
  const server = (await serverRow(account.companyId, 'block', blockId)) as { sheet: { nameplate: Record<string, { value: unknown }>; conclusion: { text?: { value: unknown } }; test: Record<string, { cells?: Record<string, Record<string, { value: unknown }>> }> } };
  const [, , , testKey, , row, col] = reading.path.split('/');
  expect(server.sheet.test[testKey!]!.cells![row!]![col!]!.value).toMatchObject({ raw: '548', state: 'measured' });
  expect(server.sheet.nameplate.fabricacao!.value).toBe(name);
  expect(server.sheet.conclusion.text!.value).toBe(expected);

  // Offline: the same three leaves write the same three ops, on the device only.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(sheetTitle(page)).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  const offlineName = `${name} off`;
  const second = await firstReading(page, blockId);
  await second.input.click();
  await second.input.press('Control+A');
  await second.input.pressSequentially('612');
  await leaveWithoutBlur(page, blockId, second.input);
  await expect.poll(() => lastValue(page, second.path)).toMatchObject({ raw: '612', state: 'measured' });
  await backToSheet(page, blockId);
  const offlineMaker = await typeMaker(page, offlineName);
  await leaveWithoutBlur(page, blockId, offlineMaker);
  await expect.poll(() => lastValue(page, makerPath)).toBe(offlineName);
  await backToSheet(page, blockId);
  const offlineText = await typeConclusionText(page, blockId, ' Fora da rede.');
  const offlineExpected = await offlineText.expected();
  await leaveWithoutBlur(page, blockId, offlineText.editor);
  await expect.poll(() => lastValue(page, textPath)).toBe(offlineExpected);
  await context.setOffline(false);
});

test('@p1 25.2-E2E-002 a confirmed conclusion text reads as text and "Editar" opens the field; a reading that is no number, left with the sheet, is offered on return', async ({ page }) => {
  test.setTimeout(180_000);
  const { blockId } = await openChaveSheet(page, account, database, { width: 768 });
  await page.setViewportSize({ width: 768, height: 1024 });

  // Aprovado, then "Confirmar" on the suggested text: the confirmed text is no textbox and has no border.
  await stepper(page).getByRole('button', { name: /^Conclusão,/ }).click();
  await page.getByRole('radiogroup', { name: 'Resultado' }).getByRole('radio', { name: 'Aprovado' }).click();
  const field = conclusionText(page).locator('.suggestion-field.is-generated');
  await expect(field).toHaveAttribute('data-state', 'suggested');
  await expect(field.locator('.generated-text')).toHaveCSS('border-top-width', '0px');
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(field).toHaveAttribute('data-state', 'confirmed');
  const shown = field.locator('.generated-text');
  await expect(shown).not.toBeEmpty();
  await expect(conclusionText(page).getByRole('textbox')).toHaveCount(0);
  await expect(shown).toHaveCSS('border-top-width', '0px');
  await expect(shown).toHaveCSS('padding-left', '0px');
  await expect(shown).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  // "Editar" is the way to type: the field it opens is the textbox.
  await field.getByRole('button', { name: 'Editar' }).click();
  await expect(conclusionText(page).getByRole('textbox', { name: 'Texto da conclusão' })).toBeVisible();

  // A reading that is no number, left with the sheet: nothing committed, its draft offered on return.
  const reading = await firstReading(page, blockId);
  await reading.input.click();
  await reading.input.pressSequentially('abc');
  await leaveWithoutBlur(page, blockId, reading.input);
  expect((await outbox(page)).filter((row) => row.path === reading.path)).toEqual([]);
  await expect.poll(async () => (await readStore<{ value: unknown }>(page, database, 'drafts')).map((row) => row.value)).toContain('abc');
  await backToSheet(page, blockId);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Rascunho encontrado');
  await toast.getByRole('button', { name: 'Recuperar' }).click();
  const again = await firstReading(page, blockId);
  await expect(again.input).toHaveValue('abc');
  expect((await outbox(page)).filter((row) => row.path === reading.path)).toEqual([]);
});
