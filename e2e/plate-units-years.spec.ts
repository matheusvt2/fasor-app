import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { getDefinition, SEED_VERSION } from '@app/domain';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { openSheetOfType } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Review 2026-10-08 (AIR-1, AIR-V1, PLN-13; E8-A6: the UI entry through the real reading job
 * under the compose api's `fake` providers, no server-op seeding). The synthetic TP plate prints
 * its TENSÃO NOMINAL AT as "13.800 V" on a kV field and its DATA FABRICAÇÃO as the bare year
 * "2020". Imported through "Fotografar placa" (no camera: the device re-encodes the file, so the
 * type's default fixture reads it), the AT arrives as 13,8 kV and the year as printed, both
 * "Sugerido"; confirming the AT writes 13.8 kV, and a year typed over the date suggestion is
 * taken as the plain field takes it, F-22 range included (independent review r8read-tests-1).
 * Confirmar on the bare-year suggestion writes "2020" and the server acks it (r8read-tests-3).
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

const PLATE = readFileSync(resolve(import.meta.dirname, '../apps/api/src/jobs/reading/fixtures/images/plate-tp.png'));
const section = (page: Page) => page.locator('#ficha-nameplate');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string;
  status: string;
}

async function importPlate(page: Page): Promise<string> {
  const chooser = page.waitForEvent('filechooser');
  await section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.png', mimeType: 'image/png', buffer: PLATE });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database))[0]!.id;
}

interface EntityRecord {
  entity: string;
  id: string;
  row: { reading_status?: string; status?: string; target_path?: string; source?: { photo_id: string } };
}

test('@p1 AIR-1 AIR-V1 PLN-13 a TP plate printing "13.800 V" and "2020" is read as 13,8 kV and 2020, both Sugerido; Confirmar writes 13.8 kV and a typed year over the date is taken', async ({ page }) => {
  test.setTimeout(180_000);
  const label = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp').label;
  const { blockId } = await openSheetOfType(page, account, database, { cabine: 'Geradores', typeLabel: label });

  const photoId = await importPlate(page);

  // No "Sincronizar agora": the upload, the job and the pulls run on their own.
  const at = field(page, 'tensao_nominal_at').locator('.field.suggestion-field');
  const date = field(page, 'data_fabricacao').locator('.field.suggestion-field');
  await expect(at).toBeVisible({ timeout: 30_000 });
  await expect(date).toBeVisible({ timeout: 30_000 });
  await expect(at.locator('input')).toHaveValue('13,8');
  await expect(at).toHaveAttribute('data-state', 'suggested');
  await expect(at.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(date.locator('input')).toHaveValue('2020');
  await expect(date).toHaveAttribute('data-state', 'suggested');

  // The stored suggestions are what the screen shows: the field unit, the year as printed.
  const records = await readStore<EntityRecord & { row: { value?: unknown; trust?: string } }>(page, database, 'entities');
  const mine = records.filter((record) => record.entity === 'suggestion' && record.row.source?.photo_id === photoId);
  expect(mine.find((record) => record.row.target_path === `sheet/${blockId}/nameplate/tensao_nominal_at`)!.row).toMatchObject({
    value: { raw: '13.8', unit: 'kV', state: 'measured' },
    trust: 'suggested',
  });
  expect(mine.find((record) => record.row.target_path === `sheet/${blockId}/nameplate/data_fabricacao`)!.row).toMatchObject({ value: '2020', trust: 'suggested' });

  // Confirmar on the AT writes the converted value.
  await at.locator('.confirm-btn').click();
  const atPath = `sheet/${blockId}/nameplate/tensao_nominal_at`;
  await expect.poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === atPath).length, { timeout: 10_000 }).toBe(1);
  expect((await readStore<OutboxRow>(page, database, 'outbox')).find((row) => row.path === atPath)!.value).toEqual({ raw: '13.8', unit: 'kV', state: 'measured' });

  // PLN-13 with the F-22 range: a year before 1900 typed over the date suggestion is refused as
  // the plain field refuses it (the web passes the app clock), and nothing is written.
  const guess = date.locator('input');
  const datePath = `sheet/${blockId}/nameplate/data_fabricacao`;
  await guess.click();
  await guess.fill('1850');
  await guess.press('Enter');
  await expect(field(page, 'data_fabricacao').locator('.helper[data-tone="red"]')).toHaveText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa');
  await expect(guess).toHaveAttribute('aria-invalid', 'true');
  expect((await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === datePath)).toEqual([]);

  // PLN-13: a bare year typed over the date suggestion is taken, with the discard in its batch.
  await guess.fill('2019');
  await guess.press('Enter');
  await expect.poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === datePath).length, { timeout: 10_000 }).toBe(1);
  const rows = await readStore<OutboxRow>(page, database, 'outbox');
  const typed = rows.find((row) => row.path === datePath)!;
  expect(typed.value).toBe('2019');
  const dateSuggestion = mine.find((record) => record.row.target_path === datePath)!;
  const discard = rows.find((row) => row.path === `suggestion/${dateSuggestion.id}/status`)!;
  expect(discard.value).toBe('discarded');
  expect(discard.batch_id).toBe(typed.batch_id);

  // Both survive a reload as plain values.
  await page.reload();
  await expect(field(page, 'tensao_nominal_at').locator('input')).toHaveValue('13,8', { timeout: 30_000 });
  await expect(field(page, 'data_fabricacao').locator('input')).toHaveValue('2019');
  await expect(field(page, 'tensao_nominal_at').locator('.suggestion-field')).toHaveCount(0);
  await expect(field(page, 'data_fabricacao').locator('.suggestion-field')).toHaveCount(0);
});

test('@p1 AIR-V1 Confirmar on a bare-year plate date writes "2020" as printed and the server acks it', async ({ page }) => {
  test.setTimeout(180_000);
  const label = getDefinition(SEED_VERSION, 'cabine_primaria', 'tp').label;
  const { blockId } = await openSheetOfType(page, account, database, { cabine: 'Geradores', typeLabel: label });
  const photoId = await importPlate(page);

  const date = field(page, 'data_fabricacao').locator('.field.suggestion-field');
  await expect(date).toBeVisible({ timeout: 30_000 });
  await expect(date.locator('input')).toHaveValue('2020');
  await expect(date).toHaveAttribute('data-state', 'suggested');
  const datePath = `sheet/${blockId}/nameplate/data_fabricacao`;
  const records = await readStore<EntityRecord>(page, database, 'entities');
  const suggestion = records.find((record) => record.entity === 'suggestion' && record.row.source?.photo_id === photoId && record.row.target_path === datePath)!;
  const statusPath = `suggestion/${suggestion.id}/status`;

  // Confirmar writes the year as printed and the confirmation, one batch; the toast names the year.
  await date.locator('.confirm-btn').click();
  await expect.poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === datePath).length, { timeout: 10_000 }).toBe(1);
  const rows = await readStore<OutboxRow>(page, database, 'outbox');
  const put = rows.find((row) => row.path === datePath)!;
  const status = rows.find((row) => row.path === statusPath)!;
  expect(put.value).toBe('2020');
  expect(status.value).toBe('confirmed');
  expect(status.batch_id).toBe(put.batch_id);
  await expect(page.locator('.toast')).toContainText('2020 — confirmado');

  // The server takes both ops: they reach `acked`, never `dead` (an op_invalid refusal).
  await syncNowAndReturn(page);
  await expect
    .poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path === datePath || row.path === statusPath).map((row) => row.status), {
      timeout: 30_000,
    })
    .toEqual(['acked', 'acked']);
  await expect(field(page, 'data_fabricacao').locator('input')).toHaveValue('2020', { timeout: 30_000 });
  await expect(field(page, 'data_fabricacao').locator('.suggestion-field')).toHaveCount(0);
});
