import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { suggestionAnnouncement } from '@app/domain';
import type { Page } from '@playwright/test';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos } from './support/photos.ts';
import { openTransformerSheet } from './support/reading-ops.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): the one full path of an AI answer, end to end, as a human does it.
 * A transformer plate imported through the app is read by the real job under the `fake` providers
 * (the transformer's default fixture), the engineer edits the IDENTIFICAÇÃO the plate suggested and
 * taps "Confirmar", and the server's `ai_answers` row of that field holds what the model read, what
 * was shown and what the engineer kept: `changed` to the typed value, by the engineer. Nothing of it
 * shows on any screen; the row is read from the compose database.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  // No camera on this device: "Fotografar placa" opens the system picker.
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const PLATE = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/plate-transformador.jpg'));

const section = (page: Page) => page.locator('#ficha-nameplate');

interface AnswerRow {
  use: string;
  item_key: string | null;
  suggestion_id: string | null;
  answer: unknown;
  shown: unknown;
  outcome: string | null;
  action: string | null;
  final_value: unknown;
  settled_by: string | null;
  closed_at: string | null;
}

/** The plate record of one field of one photo, from the compose database. */
async function answerOf(companyId: string, photoId: string, itemKey: string): Promise<AnswerRow | undefined> {
  const { sql } = createDb(loadConfig().DATABASE_URL);
  try {
    const [row] = await sql<AnswerRow[]>`
      select use, item_key, suggestion_id, answer, shown, outcome, action, final_value, settled_by, closed_at
      from ai_answers
      where company_id = ${companyId} and input_file_id = ${photoId} and item_key = ${itemKey}`;
    return row;
  } finally {
    await sql.end();
  }
}

test('@p0 32.1-E2E-001 a plate field read, edited and confirmed: its AI answer row holds the read value, the shown one and the typed one', async ({ page }) => {
  test.setTimeout(180_000);
  // Seed v12, whose plate holds every key of the transformer's default fixture (as 8.4-E2E-001).
  await openTransformerSheet(page, account, database, { seedVersion: 'v12' });
  const chooser = page.waitForEvent('filechooser');
  await section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const photoId = (await devicePhotos(page, database))[0]!.id;

  // The real job reads the plate; its record exists, open, before anyone answers.
  const suggested = section(page).locator('[data-field-key="identificacao"] .field.suggestion-field');
  await expect(suggested).toBeVisible({ timeout: 20_000 });
  await expect(suggested.locator('input')).toHaveValue('TR-01');
  await expect
    .poll(async () => {
      const row = await answerOf(account.companyId, photoId, 'identificacao');
      return row === undefined ? 'absent' : row.outcome;
    }, { timeout: 15_000 })
    .toBeNull();
  expect(await answerOf(account.companyId, photoId, 'identificacao')).toMatchObject({ use: 'plate', shown: 'TR-01', closed_at: null });

  // The engineer corrects the read value and confirms what is typed.
  await suggested.locator('input').fill('TR-01A');
  await suggested.getByRole('button', { name: suggestionAnnouncement('suggested', 'TR-01') }).click();
  await expect(section(page).locator('[data-field-key="identificacao"] input')).toHaveValue('TR-01A');

  // Pushed on its own; the server settles the record from the op: changed to the typed value, by the engineer.
  await expect
    .poll(async () => (await answerOf(account.companyId, photoId, 'identificacao'))?.outcome ?? null, { timeout: 30_000 })
    .toBe('changed');
  expect(await answerOf(account.companyId, photoId, 'identificacao')).toMatchObject({ action: 'edit', final_value: 'TR-01A', shown: 'TR-01', settled_by: account.userId, closed_at: null });
});
