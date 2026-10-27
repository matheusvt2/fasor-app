import type { Page } from '@playwright/test';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openTransformerSheet } from './support/reading-ops.ts';

/*
 * Story 17.3 (E10-A4: a touch target on a tablet), on the durability projects (Android Chrome
 * emulation, WebKit, desktop): the "N/A" control beside the transformer's POTÊNCIA NOMINAL, at
 * 390 px, tapped on the empty field commits the `not_applicable` put through the existing
 * nameplate path and reads "N/A"; a number typed over it commits the number and brings the
 * control back; a second tap and a reload keep "N/A". The committed state is asserted in the
 * outbox (E12-A6). The desktop projects' `na-number-field.spec.ts` covers the typed spellings,
 * the cabine field, the three widths and the preview PDF; the Android project matches only
 * `*.durability.spec.ts`, hence this file.
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

const NA = { raw: '', unit: null, state: 'not_applicable' };
const lastValue = async (page: Page, path: string): Promise<unknown> =>
  (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === path).at(-1)?.value;
const plateField = (page: Page) => page.locator('#ficha-nameplate [data-field-key="potencia_nominal"]');
const control = (page: Page) => page.getByRole('button', { name: 'Marcar Potência nominal como não aplicável', exact: true });

test('@p0 17.3-E2E-002 at 390 px the "N/A" control on POTÊNCIA NOMINAL commits the not_applicable put on a tap, hides, comes back after a typed number, and the value survives a reload', async ({ page, context }) => {
  test.setTimeout(150_000);
  const { blockId } = await openTransformerSheet(page, account, database, { width: 390, signIn: () => signInForDurability(page, context, account.email) });
  const path = `sheet/${blockId}/nameplate/potencia_nominal`;
  const field = plateField(page);
  const input = field.locator('input');
  await expect(input).toHaveValue('');
  await expect(field.locator('.mf-unit')).toHaveText('kVA');

  // The control: a 44 px target inside the viewport, right of the value.
  const button = control(page);
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const value = (await field.locator('.measurement-field').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(value.x + value.width).toBeLessThanOrEqual(box.x);

  // One tap on the empty field: the put, "N/A" with no unit, the control gone, no focus moved.
  await button.click();
  await expect(input).toHaveValue('N/A');
  await expect(field.locator('.mf-unit')).toHaveCount(0);
  await expect(control(page)).toHaveCount(0);
  await expect.poll(() => lastValue(page, path)).toEqual(NA);
  await expect(page.locator('input:focus')).toHaveCount(0);

  // A number typed over it commits the number; the control is back.
  await input.fill('1000');
  await input.blur();
  await expect(input).toHaveValue('1.000');
  await expect(field.locator('.mf-unit')).toHaveText('kVA');
  await expect.poll(() => lastValue(page, path)).toEqual({ raw: '1000', unit: 'kVA', state: 'measured' });
  await expect(control(page)).toBeVisible();

  // Tapped again over the number: "N/A" once more, kept across a reload.
  await control(page).click();
  await expect(input).toHaveValue('N/A');
  await expect.poll(() => lastValue(page, path)).toEqual(NA);
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(plateField(page).locator('input')).toHaveValue('N/A');
  await expect(plateField(page).locator('.mf-unit')).toHaveCount(0);
  await expect(control(page)).toHaveCount(0);
});
