import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts, type SeededSheet } from './support/relatorio-seed.ts';
import { humanTap } from './support/taps.ts';

/*
 * Story 13.4 (review-field-ux-2026-10-06 INP-2) in the durability matrix (desktop Chrome,
 * Android Chrome emulation, WebKit), against the built bundle: the readings' continuous
 * Enter run labels the keyboard's Enter key ("next", and "done" where it hands the focus to
 * the primary), and a reading or a nameplate number typed and then left by a tap on another
 * field (no Enter, the iOS decimal pad has none) is committed and survives a reload.
 *
 * Each test resets Empresa B (this worker's own, E6-Q7), pushes a standard relatório from an
 * office device and opens a chave seccionadora sheet by its address.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const written = async (page: Page, path: string) => (await outbox(page)).filter((row) => row.path === path).map((row) => row.value);
const cellInput = (page: Page, key: string) => page.locator(`input[data-cell-input="${key}"]`).filter({ visible: true });
/** A tap: a real touch on the Chromium projects, the mouse on WebKit. */
const tap = (page: Page, target: Locator, info: TestInfo) => humanTap(page, target, info, undefined, { touch: true });

async function openSeccionadora(page: Page, context: BrowserContext): Promise<SeededSheet> {
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const sheet = built.sheets.find((row) => row.blockType === 'chave_seccionadora')!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  return sheet;
}

test('@p0 13.4-E2E-004 INP-2: every run cell carries enterkeyhint, "done" on the one whose Enter reaches the primary, recomputed as cells fill', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const { blockId } = await openSeccionadora(page, context);
  // The chave seccionadora's run: insulation T1 .. (isolacao:0..5:0), then contact resistance (resistencia_contato:0..2:0).
  const all = page.locator('#ficha-step-ensaios input[data-cell-input]');
  await expect(all.first()).toBeVisible();
  const hints = await all.evaluateAll((inputs) => inputs.map((input) => [input.getAttribute('data-cell-input'), input.getAttribute('enterkeyhint')]));
  expect(hints.length).toBeGreaterThan(1);
  for (const [key, hint] of hints) expect(hint, `${key}`).toBe(key === 'resistencia_contato:2:0' ? 'done' : 'next');

  // Fill the contact resistance column: the insulation column's last cell now hands Enter to the primary.
  for (const row of [0, 1, 2]) {
    const input = cellInput(page, `resistencia_contato:${row}:0`);
    await tap(page, input, info);
    await expect(input).toBeFocused();
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    await expect.poll(() => written(page, `sheet/${blockId}/test/resistencia_contato/cell/${row}/0`)).toHaveLength(1);
  }
  await expect(cellInput(page, 'isolacao:5:0')).toHaveAttribute('enterkeyhint', 'done');
  await expect(cellInput(page, 'isolacao:4:0')).toHaveAttribute('enterkeyhint', 'next');
});

test('@p0 13.4-E2E-005 INP-2: a reading and a nameplate number typed and left by a tap on another field are committed and survive a reload', async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const { blockId } = await openSeccionadora(page, context);

  // The nameplate number, left by a tap on another field (no Enter, no Tab).
  const corrente = page.getByLabel('Corrente nominal', { exact: true });
  await tap(page, corrente, info);
  await expect(corrente).toBeFocused();
  await page.keyboard.type('630');
  await tap(page, page.getByLabel('Nº série', { exact: true }), info);
  await expect(page.getByLabel('Nº série', { exact: true })).toBeFocused();
  await expect.poll(() => written(page, `sheet/${blockId}/nameplate/corrente_nominal`)).toEqual([expect.objectContaining({ raw: '630', state: 'measured' })]);

  // A reading, left by a tap on the next one. (The cells are tapped where they are: a stepper
  // jump scrolls smoothly, and a tap during that scroll lands beside its target.)
  const first = cellInput(page, 'resistencia_contato:0:0');
  await tap(page, first, info);
  await expect(first).toBeFocused();
  await page.keyboard.type('1500');
  await tap(page, cellInput(page, 'resistencia_contato:1:0'), info);
  await expect(cellInput(page, 'resistencia_contato:1:0')).toBeFocused();
  const cellPath = `sheet/${blockId}/test/resistencia_contato/cell/0/0`;
  await expect.poll(() => written(page, cellPath)).toHaveLength(1);
  expect(((await written(page, cellPath))[0] as { raw: string }).raw).toBe('1500');

  // Invalid text stays typed and writes nothing.
  const second = cellInput(page, 'resistencia_contato:1:0');
  await page.keyboard.type('abc');
  await tap(page, cellInput(page, 'resistencia_contato:2:0'), info);
  await expect(second).toHaveValue('abc');
  expect(await written(page, `sheet/${blockId}/test/resistencia_contato/cell/1/0`)).toEqual([]);

  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Corrente nominal', { exact: true })).toHaveValue('630');
  await expect(cellInput(page, 'resistencia_contato:0:0')).toHaveValue(/^1[.]?500$/);
});
