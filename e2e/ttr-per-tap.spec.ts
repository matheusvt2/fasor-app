import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  confirmarTodosText,
  evaluateSheetReadings,
  getDefinition,
  ratioRowCondicaoText,
  SEED_VERSION,
  sheetProgress,
  TAP_NOT_MEASURED_TEXT,
  TAP_OFF_PLATE_TEXT,
  tapMarkText,
  tapPickerOf,
  tapsLine,
  tapTableLine,
  type BlockRow,
  type EvaluatedRow,
  type OpDraft,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { escapeDialog } from './support/dialogs.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 23.8 (seed v13): the transformer's TTR has one row per tap of the plate, driven as a
 * person does on a fresh relatório of Empresa B cut down to the Oxigênio cabine and its
 * transformador de força (no fixed ids, so the DOCX is small). TAPS is typed with five taps and
 * TAP ATUAL picked as the third: five rows in plate order, rows 1, 3 and 5 marked, each VAL
 * CALCULADO from its tap; readings on those three complete the test while the two unmarked rows
 * read "Não medido" and count nothing; at 768 px an Enter run ending on the last tap row leaves it
 * above the Sticky action bar (the e23f pitfall); at 390 px the rows are cards. The last tap,
 * holding readings, is then dropped from TAPS: its row stays after the plate rows with its
 * readings, flagged "Fora da placa", still judged and never missing, and the DOCX, through its
 * download, prints every row. Every derived word and number is the kernel's, from the device's own
 * block row (E12-A6); the readings are invented. It generates through the one queue and
 * LibreOffice of the api, so the file is in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
  status: string;
  batch_id: string | null;
  meta: { source_suggestion_id?: string } | null;
}
interface EntityRecord<T> {
  entity: string;
  id: string;
  row: T;
}

/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const CABINE = 'Oxigênio';
const TEST_KEY = 'relacao_transformacao';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca');
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' });

const toast = (page: Page) => page.getByTestId('toast');
const stepper = (page: Page) => page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' });
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const lastValue = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).at(-1)?.value;
const tapTable = (page: Page) => page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] table.ficha-ttr-taps`);
const tapRow = (page: Page, volts: number) => tapTable(page).locator(`tbody tr[data-tap-row="${volts}"]`);
const captures = (page: Page, volts: number) => tapRow(page, volts).locator('input.mf-value');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });

/** The count a step's accessible name reads ("Ensaios, 3 faltando"). */
async function stepMissing(page: Page, step: string): Promise<number> {
  const label = await stepper(page).getByRole('button', { name: new RegExp(`^${step},`) }).getAttribute('aria-label');
  return Number(/, (\d+) faltando/.exec(label ?? '')?.[1] ?? NaN);
}

/** The device's own row of the block, as Dexie holds it. */
async function blockRow(page: Page, blockId: string): Promise<BlockRow> {
  const records = await readStore<EntityRecord<BlockRow>>(page, database, 'entities');
  return records.find((record) => record.entity === 'block' && record.id === blockId)!.row;
}

/** The kernel's rows of the TTR for the device's block row. */
async function kernelRows(page: Page, blockId: string): Promise<EvaluatedRow[]> {
  const ratio = evaluateSheetReadings(await blockRow(page, blockId), DEFINITION).find((test) => test.testKey === TEST_KEY)!;
  return ratio.tables[0]!.rows;
}

/** The standard relatório cut down to the Oxigênio cabine and its transformador de força, Em campo. */
function transformerRelatorio(): { relatorioId: string; blockId: string; drafts: OpDraft[] } {
  const built = newRelatorioDrafts(account);
  const created = (prefix: string) => built.drafts.filter((draft) => draft.kind === 'create' && draft.path.startsWith(prefix)).map((draft) => draft.value as Record<string, unknown>);
  const cabine = created('location/').find((row) => row.kind === 'cabine' && row.name === CABINE)!;
  const block = created('block/').find((row) => row.location_id === cabine.id && row.block_type === 'transformador_forca')!;
  const drafts = built.drafts
    .filter((draft) => {
      if (draft.kind !== 'create') return true;
      const value = draft.value as Record<string, unknown>;
      if (draft.path.startsWith('location/')) return value.id === cabine.id;
      if (draft.path.startsWith('block/')) return value.location_id === null || value.id === block.id;
      if (draft.path.startsWith('equipment/')) return value.id === block.equipment_id;
      return true;
    })
    .map((draft) => (draft.path === `block/${block.id as string}` ? ({ ...draft, value: { ...(draft.value as Record<string, unknown>), feeds_block_id: null } } as OpDraft) : draft));
  return { relatorioId: built.relatorioId, blockId: block.id as string, drafts: [...drafts, emCampoDraft(account, built.relatorioId)] };
}

/** The device's display photos (`reading_kind` display), counted. */
async function displayPhotoCount(page: Page): Promise<number> {
  const records = await readStore<EntityRecord<{ kind?: string; reading_kind?: string | null }>>(page, database, 'entities');
  return records.filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.reading_kind === 'display').length;
}

/** "Ler visor" with no camera (as `read-display-pipeline.spec.ts`): the system picker gets the display JPEG, one shot, saved on the device before this returns. */
async function shootDisplay(page: Page, button: Locator, bytes: Buffer): Promise<void> {
  const before = await displayPhotoCount(page);
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles({ name: 'visor.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect.poll(() => displayPhotoCount(page), { timeout: 15_000 }).toBe(before + 1);
  await expect(button).toHaveAttribute('data-count', '', { timeout: 15_000 });
}

/** Types `text` into the plate field `key` and leaves it with Tab, as a person does. */
async function typeIn(page: Page, key: string, text: string): Promise<void> {
  const input = field(page, key).locator('input').first();
  await input.click();
  await input.fill(text);
  await input.press('Tab');
}

/** The three captures of a tap row, typed in order with Tab. */
async function typeCaptures(page: Page, volts: number, values: readonly [string, string, string]): Promise<void> {
  await captures(page, volts).first().click();
  for (const value of values) {
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
  }
}

/** Presses the dialog's "Gerar relatório", answers the blank-fields question when it is asked, and waits for revision `n`. */
async function generateRevision(page: Page, n: number): Promise<void> {
  const modal = exportDialog(page);
  await expect(modal).toBeVisible();
  const again = modal.getByRole('button', { name: 'Gerar de novo' });
  const generate = modal.locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
  await expect(again.or(generate).first()).toBeVisible({ timeout: 30_000 });
  if (await again.isVisible()) await again.click();
  await expect(generate).toBeEnabled({ timeout: 30_000 });
  await generate.click();
  const question = modal.getByRole('group', { name: /^Gerar com / });
  const ready = modal.getByRole('heading', { level: 2, name: `Revisão ${n} pronta` });
  await expect(question.or(ready).or(modal.locator('.gen-progress')).first()).toBeVisible({ timeout: 30_000 });
  if (await question.isVisible()) await question.getByRole('button', { name: 'Gerar mesmo assim' }).click();
  await expect(toast(page)).toHaveText(`Revisão ${n} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
  await expect(ready).toBeVisible();
}

test('@p0 23.8-E2E-001 five taps with the third in service: five rows in plate order, 1, 3 and 5 marked, each VAL CALCULADO from its tap; readings on 1, 3 and 5 complete the test, the others "Não medido"; a dropped tap keeps its row and reading flagged "Fora da placa"; the DOCX prints every row', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId, blockId, drafts } = transformerRelatorio();
  await pushDrafts(page, database, drafts);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const cellPath = (volts: number, col: number) => `sheet/${blockId}/test/${TEST_KEY}/cell/${volts}/${col}`;

  // The plate: five taps, the third in service, 380 V on a Dyn1 (the factor √3).
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12; 11,4');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/taps`)).toEqual(measured('13.8;13.2;12.6;12;11.4', 'kV'));
  const tapAtual = DEFINITION.nameplate.find((f) => f.key === 'tap_atual_kv')!;
  const third = tapPickerOf(await blockRow(page, blockId), DEFINITION, tapAtual)!.options[2]!;
  await field(page, 'tap_atual_kv').getByRole('button', { name: 'Abrir lista' }).click();
  await page.getByRole('option', { name: third.label, exact: true }).click();
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/tap_atual_kv`)).toEqual(measured('12.6', 'kV'));
  await typeIn(page, 'tensao_nominal_bt', '380');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/tensao_nominal_bt`)).toEqual(measured('380', 'V'));
  await field(page, 'ligacao_secundaria').locator('select').selectOption('Dyn1');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/ligacao_secundaria`)).toBe('Dyn1');

  // The TTR: the line counting the taps, five rows keyed by the tap in V, in plate order.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const line = page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] p.v13-line[data-taps-line]`);
  await expect(line.locator('span').first()).toHaveText(`${tapsLine(5).label} ${tapsLine(5).count}`);
  await expect(line.locator('span').nth(1)).toHaveText(tapsLine(5).note);
  const VOLTS = [13800, 13200, 12600, 12000, 11400];
  await expect(tapTable(page).locator('tbody tr[data-tap-row]')).toHaveCount(5);
  expect(await tapTable(page).locator('tbody tr[data-tap-row]').evaluateAll((rows) => rows.map((row) => Number(row.getAttribute('data-tap-row'))))).toEqual(VOLTS);
  let rows = await kernelRows(page, blockId);
  expect(rows.map((row) => row.row)).toEqual(VOLTS);
  // The matrix row: Extremo, Atual, Extremo on 1, 3, 5; VAL CALCULADO from each tap over 380 V, times √3.
  expect(rows.map((row) => tapMarkText(row.tap))).toEqual(['Extremo', null, 'Atual', null, 'Extremo']);
  expect(rows.map((row) => row.calculated?.text)).toEqual(['62,90', '60,17', '57,43', '54,70', '51,96']);
  for (const [i, row] of rows.entries()) {
    const tr = tapRow(page, row.row);
    await expect(tr.locator('.tap-cell > span').first(), String(row.row)).toHaveText(String(i + 1));
    const mark = tapMarkText(row.tap);
    if (mark === null) await expect(tr.locator('.tap-mark')).toHaveCount(0);
    else await expect(tr.locator('.tap-mark')).toHaveText(mark);
    await expect(tr).toHaveClass(mark === null ? /tap-optional/ : /^(?!.*tap-optional)/);
    await expect(tr.locator('td.cell-calc').first()).toContainText(row.calculated!.text);
    // The tap's V primário and the plate's V secundário are text, never inputs: the three captures are.
    await expect(captures(page, row.row)).toHaveCount(3);
    await expect(tr.locator('td').last()).toHaveText(ratioRowCondicaoText(row));
  }
  await expect(tapRow(page, 13200).locator('td').last()).toHaveText(TAP_NOT_MEASURED_TEXT);

  // Readings on the three marked rows only: the test is complete, the two others still "Não medido".
  const before = await stepMissing(page, 'Ensaios');
  await typeCaptures(page, 13800, ['62,95', '62,88', '62,93']);
  await typeCaptures(page, 12600, ['57,48', '57,41', '57,45']);
  await typeCaptures(page, 11400, ['51,98', '51,93', '51,96']);
  await expect.poll(() => lastValue(page, cellPath(11400, 5))).toEqual(measured('51.96', null));
  expect(await lastValue(page, cellPath(13800, 3))).toEqual(measured('62.95', null));
  expect(await lastValue(page, cellPath(12600, 4))).toEqual(measured('57.41', null));
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(before - 9);
  rows = await kernelRows(page, blockId);
  for (const row of rows) await expect(tapRow(page, row.row).locator('td').last(), String(row.row)).toHaveText(ratioRowCondicaoText(row));
  expect(rows.map((row) => ratioRowCondicaoText(row))).toEqual(['Satisfatório', TAP_NOT_MEASURED_TEXT, 'Satisfatório', TAP_NOT_MEASURED_TEXT, 'Satisfatório']);
  // The device's row holds them under each tap's volts.
  const stored = (await blockRow(page, blockId)).sheet.test[TEST_KEY]!.cells;
  expect(Object.keys(stored).sort()).toEqual(['11400', '12600', '13800']);
  expect(stored['12600']!['3']!.value).toEqual(measured('57.48', null));

  // e23f: at 768 px an Enter run down the captures that ends on the last tap row leaves it above the Sticky action bar.
  await page.setViewportSize({ width: 768, height: 1024 });
  await captures(page, 12000).first().click();
  await page.keyboard.press('Enter');
  await expect(captures(page, 11400).first()).toBeFocused();
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
  const box = await tapRow(page, 11400).evaluate((tr) => {
    const bar = document.querySelector('[data-route="/relatorio/:id/ficha/:blockId"] .sticky-action-bar')!.getBoundingClientRect();
    const row = tr.getBoundingClientRect();
    return { bottom: row.bottom, top: row.top, barTop: bar.top };
  });
  expect(box.bottom, 'the last tap row under the Sticky action bar').toBeLessThanOrEqual(box.barTop + 1);
  expect(box.top).toBeGreaterThanOrEqual(0);

  // At 390 px the rows are cards: the mark beside "Tap N", an unmarked one muted with "Não medido".
  await page.setViewportSize({ width: 390, height: 844 });
  const card = (volts: number) => page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] [data-tap-card="${volts}"]`);
  await expect(card(12600).locator('.card-point')).toContainText('Tap 3');
  await expect(card(12600).locator('.card-point .tap-mark')).toHaveText('Atual');
  await expect(card(13200)).toHaveClass(/tap-optional/);
  await expect(card(13200)).toContainText(`Condição: ${TAP_NOT_MEASURED_TEXT}`);
  await expect(card(13800).locator('.card-dims').first()).toContainText(rows[0]!.calculated!.text);
  await page.setViewportSize({ width: 1280, height: 900 });

  // The last tap, holding readings, dropped from TAPS: its row stays after the plate's, flagged, judged, read-only, never missing.
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/taps`)).toEqual(measured('13.8;13.2;12.6;12', 'kV'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(line.locator('span').first()).toHaveText(`${tapsLine(4).label} ${tapsLine(4).count}`);
  rows = await kernelRows(page, blockId);
  expect(rows.map((row) => row.row)).toEqual(VOLTS);
  expect(rows.map((row) => tapMarkText(row.tap))).toEqual(['Extremo', null, 'Atual', 'Extremo', TAP_OFF_PLATE_TEXT]);
  expect(await tapTable(page).locator('tbody tr[data-tap-row]').evaluateAll((trs) => trs.map((tr) => Number(tr.getAttribute('data-tap-row'))))).toEqual(VOLTS);
  await expect(tapRow(page, 11400).locator('.tap-mark')).toHaveText(TAP_OFF_PLATE_TEXT);
  await expect(tapRow(page, 11400).locator('.tap-cell > span').first()).toHaveText('—');
  await expect(captures(page, 11400)).toHaveCount(0);
  await expect(tapRow(page, 11400)).toContainText('51,98');
  await expect(tapRow(page, 11400).locator('td').last()).toHaveText('Satisfatório');
  // The new last tap of the plate (12 kV) is an extreme now: its three captures are missing; the dropped row counts nothing.
  await expect(tapRow(page, 12000).locator('.tap-mark')).toHaveText('Extremo');
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(before - 9 + 3);
  expect((await blockRow(page, blockId)).sheet.test[TEST_KEY]!.cells['11400']!['3']!.value).toEqual(measured('51.98', null));

  // Synced, the DOCX (through its download) prints every row: the plate's by position, the dropped one with "-".
  await syncNowAndReturn(page);
  await expect.poll(async () => [...new Set((await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}`)).map((row) => row.status))]).toEqual(['acked']);
  await setParecer(page, relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await generateRevision(page, 1);
  const download = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));
  await escapeDialog(page, exportDialog(page));
  const ttr = structure.tables.find((table) => table.some((row) => row[0] === 'TAP Nº'));
  expect(ttr, 'the DOCX prints the TTR').toBeDefined();
  const header = ttr!.findIndex((row) => row[0] === 'TAP Nº');
  const printed = ttr!.slice(header + 1).filter((row) => /^(\d+|-)$/.test(row[0] ?? ''));
  expect(printed.map((row) => row[0])).toEqual(['1', '2', '3', '4', '-']);
  expect(printed.map((row) => row[1])).toEqual(['13,8 kV', '13,2 kV', '12,6 kV', '12 kV', '11,4 kV']);
  // TAP Nº, V PRIMÁRIO, V SECUNDÁRIO, VAL CALCULADO, the three captures, CONDIÇÕES.
  expect(printed[0]!.slice(3, 7)).toEqual(['62,90', '62,95', '62,88', '62,93']);
  // An unmarked tap with nothing measured prints "-" (the conservative reading, open with Bruno).
  expect(printed[1]!.slice(4)).toEqual(['-', '-', '-', '-']);
  expect(printed[4]!.at(-1)).toBe('SATISFATÓRIO');
});

/** The ratio meter's synthetic display (34.512, no unit), which the api's `fake` reads through the TTR's default fixture. */
const DISPLAY_TTR = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/display-ttr.jpg'));

test('@p0 23g-E2E-001 (fix batch e23g, R2-1 and R2-3) five taps, TAP ATUAL the third, no LIGAÇÃO SECUNDÁRIA: the Ensaios count and its group are the kernel\'s (the group 3); three "Ler visor" shots land on tap rows 13800, 13200 and 12600, "Confirmar todos (3)" commits them in one batch and the count drops to the kernel\'s', async ({ page }) => {
  test.setTimeout(360_000);
  // No camera on this browser: "Ler visor" opens the system picker, one shot per open.
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId, blockId, drafts } = transformerRelatorio();
  await pushDrafts(page, database, drafts);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const cellPath = (volts: number, col: number) => `sheet/${blockId}/test/${TEST_KEY}/cell/${volts}/${col}`;
  const kernelEnsaios = async () => sheetProgress({ blocks: [await blockRow(page, blockId)] }, blockId).steps.ensaios;

  // The plate: five taps, the third in service; LIGAÇÃO SECUNDÁRIA left empty, so the TTR waits for its group.
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12; 11,4');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/taps`)).toEqual(measured('13.8;13.2;12.6;12;11.4', 'kV'));
  const tapAtual = DEFINITION.nameplate.find((f) => f.key === 'tap_atual_kv')!;
  const third = tapPickerOf(await blockRow(page, blockId), DEFINITION, tapAtual)!.options[2]!;
  await field(page, 'tap_atual_kv').getByRole('button', { name: 'Abrir lista' }).click();
  await page.getByRole('option', { name: third.label, exact: true }).click();
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/tap_atual_kv`)).toEqual(measured('12.6', 'kV'));
  // The reading job reads the block on the server: the plate is synced before the shots.
  await syncNowAndReturn(page);
  await expect.poll(async () => [...new Set((await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}`)).map((row) => row.status))]).toEqual(['acked']);

  // R2-3: the stepper's count is the kernel's, and the group counts the current tap and the two extremes only.
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  const before = await kernelEnsaios();
  expect(before.group).toBe(3);
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(before.missing);
  // R2-4: the tap line's count is the kernel's.
  const line = page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] p.v13-line[data-taps-line]`);
  const kernelLine = tapTableLine(await kernelRows(page, blockId))!;
  await expect(line.locator('span').first()).toHaveText(`${kernelLine.label} ${kernelLine.count}`);
  expect(kernelLine).toEqual(tapsLine(5));

  // R2-1: three shots on the TTR's opener, each on the first tap row no photo targets yet, in plate order.
  const opener = page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] .mt-actions`).getByRole('button', { name: 'Ler visor' });
  for (let i = 0; i < 3; i++) await shootDisplay(page, opener, DISPLAY_TTR);
  const SHOT = [13800, 13200, 12600];
  for (const volts of SHOT) {
    await expect(tapRow(page, volts).locator('.field.suggestion-field[data-state="suggested"]'), String(volts)).toHaveCount(1, { timeout: 60_000 });
    await expect(captures(page, volts).first(), String(volts)).toHaveValue('34,512');
  }
  // Nothing landed on the other rows.
  for (const volts of [12000, 11400]) await expect(tapRow(page, volts).locator('.field.suggestion-field')).toHaveCount(0);

  // "Confirmar todos (3)": the three puts at cell/{volts}/{first capture}, each with its suggestion, in one batch.
  const confirmAll = page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] .mt-actions`).getByRole('button', { name: confirmarTodosText(3) });
  await expect(confirmAll).toBeVisible({ timeout: 15_000 });
  await confirmAll.click();
  const putsOf = async () => (await outbox(page)).filter((op) => SHOT.some((volts) => op.path === cellPath(volts, 3)));
  await expect.poll(async () => (await putsOf()).length, { timeout: 15_000 }).toBe(3);
  const puts = await putsOf();
  expect(puts.map((op) => op.value)).toEqual(SHOT.map(() => measured('34.512', null)));
  expect(puts[0]!.batch_id).not.toBeNull();
  expect(puts.every((op) => op.batch_id === puts[0]!.batch_id && op.meta?.source_suggestion_id !== undefined)).toBe(true);
  await expect(page.locator(`.ficha-mt[data-table-key="${TEST_KEY}"] .mt-actions`).getByRole('button', { name: /^Confirmar todos/ })).toHaveCount(0);

  // The count drops to the kernel's: the two required rows filled (13800 and 12600), the unmarked 13200 counted nothing; the group still 3.
  await expect.poll(async () => (await kernelEnsaios()).missing).toBe(before.missing - 2);
  const after = await kernelEnsaios();
  expect(after.group).toBe(3);
  await expect.poll(() => stepMissing(page, 'Ensaios')).toBe(after.missing);
  await expect(line.locator('span').first()).toHaveText(`${tapTableLine(await kernelRows(page, blockId))!.label} ${tapTableLine(await kernelRows(page, blockId))!.count}`);
});

test('@p0 e23z-E2E-002 (fix batch e23z, item 3) a tap dropped from TAPS with readings: "Apagar leitura" on its row writes a put of null on each filled cell in one batch, toasts "Leitura apagada", and the row leaves the table; the synced ops are accepted', async ({ page }) => {
  test.setTimeout(240_000);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const { relatorioId, blockId, drafts } = transformerRelatorio();
  await pushDrafts(page, database, drafts);
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const cellPath = (volts: number, col: number) => `sheet/${blockId}/test/${TEST_KEY}/cell/${volts}/${col}`;

  // Five taps; the last one read, then dropped from TAPS: its row stays, "Fora da placa", with its readings.
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12; 11,4');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/taps`)).toEqual(measured('13.8;13.2;12.6;12;11.4', 'kV'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await typeCaptures(page, 11400, ['51,98', '51,93', '51,96']);
  await expect.poll(() => lastValue(page, cellPath(11400, 5))).toEqual(measured('51.96', null));
  // A row of the plate offers no "Apagar leitura".
  await expect(tapRow(page, 11400).getByRole('button', { name: 'Apagar leitura' })).toHaveCount(0);
  await stepper(page).getByRole('button', { name: /^Placa,/ }).click();
  await typeIn(page, 'taps', '13,8; 13,2; 12,6; 12');
  await expect.poll(() => lastValue(page, `sheet/${blockId}/nameplate/taps`)).toEqual(measured('13.8;13.2;12.6;12', 'kV'));
  await stepper(page).getByRole('button', { name: /^Ensaios,/ }).click();
  await expect(tapRow(page, 11400).locator('.tap-mark')).toHaveText(TAP_OFF_PLATE_TEXT);
  for (const volts of [13800, 13200, 12600, 12000]) await expect(tapRow(page, volts).getByRole('button', { name: 'Apagar leitura' })).toHaveCount(0);

  // "Apagar leitura": three puts of null, one batch, the toast with "Desfazer"; the row leaves the table.
  await tapRow(page, 11400).getByRole('button', { name: 'Apagar leitura' }).click();
  const clears = async () => (await outbox(page)).filter((row) => [3, 4, 5].some((col) => row.path === cellPath(11400, col)) && row.value === null);
  await expect.poll(async () => (await clears()).length).toBe(3);
  const batch = await clears();
  expect(batch[0]!.batch_id).not.toBeNull();
  expect(batch.every((row) => row.batch_id === batch[0]!.batch_id)).toBe(true);
  await expect(toast(page)).toContainText('Leitura apagada');
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(tapRow(page, 11400)).toHaveCount(0);
  expect((await kernelRows(page, blockId)).map((row) => row.row)).toEqual([13800, 13200, 12600, 12000]);
  const cleared = (await blockRow(page, blockId)).sheet.test[TEST_KEY]!.cells['11400']!;
  expect([3, 4, 5].map((col) => cleared[String(col)]!.value)).toEqual([null, null, null]);

  // Synced: the server's fold accepts the clears (acked, none dead).
  await syncNowAndReturn(page);
  await expect.poll(async () => [...new Set((await outbox(page)).filter((row) => row.path.startsWith(`sheet/${blockId}`)).map((row) => row.status))]).toEqual(['acked']);
});
