import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';

/*
 * 9.1-E2E (E8-A6, the pipeline e2e): "Ler visor" through the real reading job. A display
 * photographed through the app (the camera fallback input: no camera on this browser, and
 * the device re-encodes the shot, so no committed sha256 matches) is uploaded, read by the
 * compose api's `fake` providers through its table's default fixture (147 GΩ for an
 * insulation table, 23,4 °C and 58 % for the thermo-hygrometer), and the sheet shows what
 * arrived. Nothing here seeds a reading op: the job writes them.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const FIXTURES = resolve(import.meta.dirname, '../services/ocr/tests/fixtures');
const ISOLACAO = readFileSync(resolve(FIXTURES, 'display-isolacao.jpg'));
const TERMO = readFileSync(resolve(FIXTURES, 'display-termo.jpg'));
const MICROHMIMETRO = readFileSync(resolve(FIXTURES, 'display-microhmimetro.jpg'));
const MICRO = '\u00b5\u03a9';
const GOHM = 'GΩ';

interface OutboxRow {
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string; auto?: boolean } | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const table = (page: Page, key: string): Locator => page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${key}"]`);
const cellOf = (page: Page, name: string): Locator => page.locator('#ficha-step-ensaios .ficha-cell').filter({ has: page.getByRole('textbox', { name, exact: true }) });

async function displayPhotoCount(page: Page): Promise<number> {
  const records = await readStore<{ entity: string; row: { kind?: string; reading_kind?: string | null } }>(page, database, 'entities');
  return records.filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.reading_kind === 'display').length;
}

/** "Ler visor" with no camera: the system picker gets the display JPEG, one shot, saved on the device before this returns. */
async function shootDisplay(page: Page, button: Locator, bytes: Buffer): Promise<void> {
  const before = await displayPhotoCount(page);
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles({ name: 'visor.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect.poll(() => displayPhotoCount(page), { timeout: 15_000 }).toBe(before + 1);
  await expect(button).toHaveAttribute('data-count', '', { timeout: 15_000 });
}

test('@p1 9.1-E2E-003 typed first, the display reading checks the typed values: equal confirms with the crop, different shows "Visor … Conferir" (either value kept by a tap); on an empty cell it is a suggestion Enter or "Confirmar todos" confirms, and typing over it discards it', async ({ page }) => {
  test.setTimeout(360_000);
  const ids = await openChaveSheet(page, account, database);
  const cellPath = (row: number) => `sheet/${ids.blockId}/test/isolacao/cell/${row}/0`;
  const t1 = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await t1.fill('147G');
  await t1.press('Enter');
  const t3 = page.getByRole('textbox', { name: 'T3, Valor', exact: true });
  await expect(t3).toBeFocused();
  await t3.fill('14,7G');
  await t3.press('Enter');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === cellPath(0) || op.path === cellPath(1)).length).toBe(2);

  // One shot per open (the system camera): T1, then T3, then T5 -- each opener starts at the first row no photo targets.
  const opener = table(page, 'contato_aberto').locator('.mt-actions').getByRole('button', { name: 'Ler visor' });
  for (let i = 0; i < 3; i++) await shootDisplay(page, opener, ISOLACAO);

  // T5 was empty: the reading arrives as a suggested cell, its crop beside the guess.
  const t5 = cellOf(page, 'T5, Valor');
  const suggested = t5.locator('.field.suggestion-field[data-state="suggested"]');
  await expect(suggested).toBeVisible({ timeout: 60_000 });
  await expect(t5.getByRole('textbox', { name: 'T5, Valor', exact: true })).toHaveValue('147');
  await expect(suggested.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(suggested.getByRole('button', { name: 'Ver recorte do visor — T5, Valor' })).toBeVisible();
  await expect(suggested.getByRole('button', { name: `Sugerido, 147 ${GOHM}, confirmar` })).toBeVisible();

  // T1 held the same value: confirmed silently, the typed value kept, the crop glyph beside it.
  const t1Cell = cellOf(page, 'T1, Valor');
  await expect(t1Cell).toHaveAttribute('data-state', 'confirmed', { timeout: 60_000 });
  await expect(t1Cell.getByRole('button', { name: 'Ver recorte do visor — T1, Valor' })).toBeVisible();
  const auto = (await outbox(page)).find((op) => op.path === cellPath(0) && op.meta?.auto === true)!;
  expect(auto.value).toEqual({ raw: '147', unit: GOHM, state: 'measured' });
  expect(auto.meta!.source_suggestion_id).toEqual(expect.any(String));

  // T3 held another value: the line offers both, and nothing is overwritten meanwhile.
  const t3Cell = cellOf(page, 'T3, Valor');
  const line = t3Cell.getByRole('group', { name: 'Leitura do visor diferente do valor digitado' });
  await expect(line).toHaveText(`Visor: 147 ${GOHM} · digitado 14,7 ${GOHM} — Conferir`, { timeout: 60_000 });
  // Review fixes 2026-10-06 (F-22): two lines on purpose, "Visor: …" then "digitado … — Conferir".
  await expect(line.locator('.mismatch-line')).toHaveCount(2);
  await expect(line.locator('.mismatch-line').nth(1)).toHaveText(`digitado 14,7 ${GOHM} — Conferir`);
  await expect(t3).toHaveValue('14,7');
  expect((await outbox(page)).filter((op) => op.path === cellPath(1)).map((op) => op.value)).toEqual([{ raw: '14.7', unit: GOHM, state: 'measured' }]);

  // Enter on the suggested cell confirms it with its provenance.
  await t5.getByRole('textbox', { name: 'T5, Valor', exact: true }).click();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await outbox(page)).find((op) => op.path === cellPath(2))?.meta?.source_suggestion_id ?? null, { timeout: 15_000 }).toEqual(expect.any(String));
  expect((await outbox(page)).find((op) => op.path === cellPath(2))!.value).toEqual({ raw: '147', unit: GOHM, state: 'measured' });
  await expect(t5).toHaveAttribute('data-state', 'confirmed');

  // A tap on the display's value keeps it.
  await line.getByRole('button', { name: `147 ${GOHM}` }).click();
  await expect(t3).toHaveValue('147');
  await expect(t3Cell).toHaveAttribute('data-state', 'confirmed');
  const replaced = (await outbox(page)).filter((op) => op.path === cellPath(1)).at(-1)!;
  expect(replaced.value).toEqual({ raw: '147', unit: GOHM, state: 'measured' });
  expect(replaced.meta!.source_suggestion_id).toEqual(expect.any(String));

  // A tap on the typed value keeps it: the reading is discarded, the cell untouched.
  const contactPath = `sheet/${ids.blockId}/test/resistencia_contato/cell/0/0`;
  const contact = page.getByRole('textbox', { name: 'T1-T2, Valor', exact: true });
  await contact.fill('90');
  await contact.press('Enter');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === contactPath).length).toBe(1);
  await shootDisplay(page, table(page, 'resistencia_contato').locator('.mt-actions').getByRole('button', { name: 'Ler visor' }), MICROHMIMETRO);
  const contactLine = cellOf(page, 'T1-T2, Valor').getByRole('group', { name: 'Leitura do visor diferente do valor digitado' });
  await expect(contactLine).toHaveText(`Visor: 87 ${MICRO} · digitado 90 ${MICRO} — Conferir`, { timeout: 60_000 });
  const kept = (await contactLine.getAttribute('data-suggestion-id'))!;
  await contactLine.getByRole('button', { name: `90 ${MICRO}` }).click();
  await expect.poll(async () => (await outbox(page)).find((op) => op.path === `suggestion/${kept}/status`)?.value ?? null, { timeout: 15_000 }).toBe('discarded');
  await expect(contactLine).toHaveCount(0);
  await expect(contact).toHaveValue('90');
  expect((await outbox(page)).filter((op) => op.path === contactPath).map((op) => op.value)).toEqual([{ raw: '90', unit: MICRO, state: 'measured' }]);

  // Contato fechado read on empty cells: a value typed over a suggestion is written with its discard, one batch.
  const closed = table(page, 'contato_fechado');
  for (let i = 0; i < 3; i++) await shootDisplay(page, closed.locator('.mt-actions').getByRole('button', { name: 'Ler visor' }), ISOLACAO);
  await expect(closed.locator('.field.suggestion-field[data-state="suggested"]')).toHaveCount(3, { timeout: 60_000 });
  const faseA = cellOf(page, 'Fase A, Valor');
  const typedOver = (await faseA.getAttribute('data-suggestion-id'))!;
  const faseAInput = faseA.getByRole('textbox', { name: 'Fase A, Valor', exact: true });
  await faseAInput.fill('150');
  await faseAInput.press('Enter');
  await expect.poll(async () => (await outbox(page)).find((op) => op.path === `suggestion/${typedOver}/status`)?.value ?? null, { timeout: 15_000 }).toBe('discarded');
  const rows = await outbox(page);
  const typedPut = rows.find((op) => op.path === cellPath(3))!;
  expect(typedPut.value).toEqual({ raw: '150', unit: GOHM, state: 'measured' });
  expect(typedPut.meta?.source_suggestion_id).toBeUndefined();
  expect(typedPut.batch_id).not.toBeNull();
  expect(rows.find((op) => op.path === `suggestion/${typedOver}/status`)!.batch_id).toBe(typedPut.batch_id);

  // "Confirmar todos (2)": the two suggested cells left, their confirms and their puts in one batch.
  const confirmAll = closed.locator('.mt-actions').getByRole('button', { name: 'Confirmar todos (2)' });
  await expect(confirmAll).toBeVisible({ timeout: 15_000 });
  await confirmAll.click();
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === cellPath(4) || op.path === cellPath(5)).length, { timeout: 15_000 }).toBe(2);
  const after = await outbox(page);
  const puts = after.filter((op) => op.path === cellPath(4) || op.path === cellPath(5));
  const batch = puts[0]!.batch_id;
  expect(batch).not.toBeNull();
  expect(puts.every((op) => op.batch_id === batch && op.meta?.source_suggestion_id !== undefined)).toBe(true);
  expect(puts.map((op) => op.value)).toEqual([
    { raw: '147', unit: GOHM, state: 'measured' },
    { raw: '147', unit: GOHM, state: 'measured' },
  ]);
  const confirmed = after.filter((op) => op.batch_id === batch && /^suggestion\/[^/]+\/status$/.test(op.path));
  expect(confirmed.map((op) => op.value)).toEqual(['confirmed', 'confirmed']);
  expect(after.filter((op) => op.batch_id === batch)).toHaveLength(4);
  await expect(closed.getByRole('button', { name: /^Confirmar todos/ })).toHaveCount(0);
});

test('@p1 9.1-E2E-004 the thermo-hygrometer: one shot in "Da cabine" fills temperature and humidity as suggestions', async ({ page }) => {
  test.setTimeout(240_000);
  await openChaveSheet(page, account, database);
  const env = page.locator('section.ficha-amb');
  await expect(env.locator('.ficha-amb-actions .btn-reason')).toHaveText('Termo-higrômetro');
  await shootDisplay(page, env.locator('.ficha-amb-actions').getByRole('button', { name: 'Ler visor' }), TERMO);

  const temperature = env.getByRole('group', { name: 'Temperatura' });
  const humidity = env.getByRole('group', { name: 'Umidade relativa do ar' });
  await expect(temperature).toHaveAttribute('data-state', 'verify', { timeout: 60_000 });
  await expect(temperature.locator('input')).toHaveValue('23,4');
  await expect(humidity).toHaveAttribute('data-state', 'suggested');
  await expect(humidity.locator('input')).toHaveValue('58');
  await expect(humidity.getByRole('button', { name: 'Ver recorte do visor — Umidade relativa do ar' })).toBeVisible();

  await humidity.getByRole('button', { name: 'Sugerido, 58 %, confirmar' }).click();
  await expect
    .poll(async () => (await outbox(page)).find((op) => /^location\/[^/]+\/env\/humidity_pct$/.test(op.path) && op.meta?.source_suggestion_id !== undefined)?.value ?? null, { timeout: 15_000 })
    .toEqual({ raw: '58', unit: '%', state: 'measured' });
  // The "Verificar" temperature, fixed by hand: the typed value, the reading discarded.
  await temperature.locator('input').fill('24');
  await temperature.locator('input').press('Enter');
  await expect.poll(async () => (await outbox(page)).find((op) => /^location\/[^/]+\/env\/temperature_c$/.test(op.path))?.value ?? null, { timeout: 15_000 }).toEqual({
    raw: '24',
    unit: '°C',
    state: 'measured',
  });
  await expect(env.getByRole('group', { name: 'Temperatura' })).toHaveCount(0);
});
