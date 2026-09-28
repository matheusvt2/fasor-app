import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { openTransformerSheet } from './support/reading-ops.ts';

/*
 * E78-Q2, E78-Q8 and E78-Q14 over the real reading job: a transformer plate imported through
 * the app's own plate path (the camera fallback input, the device re-encoding the shot, so no
 * committed sha256 matches it) is read by the compose api's `fake` providers through the
 * transformer's default fixture, and the sheet shows the eleven suggestions without a
 * "Sincronizar agora" (the sync engine polls every 5 s while a reading runs). Nothing here
 * seeds a reading op: the job writes them.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const PLATE = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/plate-transformador.jpg'));

const section = (page: Page) => page.locator('#ficha-nameplate');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const plateRow = (page: Page) => section(page).locator('.photo-row.ficha-np-photo');

/** No camera on this device: "Fotografar placa" opens the system picker, which gets the plate JPEG. Returns the photo id. */
async function importPlate(page: Page): Promise<string> {
  const chooser = page.waitForEvent('filechooser');
  await section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  await (await chooser).setFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database))[0]!.id;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

interface EntityRecord {
  entity: string;
  id: string;
  row: { reading_status?: string; status?: string; source?: { photo_id: string } };
}

test('@p0 E78-Q2 8.4-E2E-001 a plate imported through the app is read by the real job under the fake providers, and its eleven suggestions arrive without a manual sync', async ({ page }) => {
  test.setTimeout(180_000);
  await openTransformerSheet(page, account, database);
  const photoId = await importPlate(page);
  const create = (await readStore<{ kind: string; path: string; value: { sha256: string; reading_target: unknown } }>(page, database, 'outbox')).find(
    (op) => op.kind === 'create' && op.path === `file/${photoId}`,
  )!;
  // The device re-encoded the shot: not the committed plate's sha256, so only the default fixture can read it.
  expect(create.value.sha256).not.toBe('a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac');
  expect(create.value.reading_target).toMatchObject({ block_type: 'transformador_forca' });

  // No "Sincronizar agora" from here: the upload, the job and the pulls run on their own.
  const suggested = field(page, 'identificacao').locator('.field.suggestion-field');
  await expect(suggested).toBeVisible({ timeout: 20_000 });
  await expect(suggested.locator('input')).toHaveValue('TR-01');
  await expect(plateRow(page).locator('.reading-line')).toHaveCount(0);
  await expect(plateRow(page).locator('.queued-banner')).toHaveCount(0);
  await expect(section(page).locator('.plate-crop')).toBeVisible();

  const records = await readStore<EntityRecord>(page, database, 'entities');
  expect(records.find((record) => record.entity === 'file' && record.id === photoId)!.row.reading_status).toBe('done');
  const pending = records.filter((record) => record.entity === 'suggestion' && record.row.status === 'pending' && record.row.source?.photo_id === photoId);
  expect(pending).toHaveLength(11);
});

test('@p1 E78-Q14 8.6-E2E-003 the plate crop fills the box width at 768 and 390 px, not a sliver of the read region', async ({ page }) => {
  test.setTimeout(180_000);
  await openTransformerSheet(page, account, database, { width: 768 });
  await importPlate(page);
  for (const width of [768, 390]) {
    if (width !== 768) {
      await page.setViewportSize({ width, height: 900 });
      await page.reload();
    }
    const view = section(page).locator('.plate-crop .plate-crop-view[data-fitted]');
    await expect(view).toBeVisible({ timeout: 30_000 });
    const picture = view.locator('img:not([hidden])');
    await expect(picture).toBeVisible();
    const [inner, shown, full] = await Promise.all([
      section(page).locator('.plate-crop').evaluate((element) => element.clientWidth),
      view.boundingBox(),
      picture.boundingBox(),
    ]);
    // The view is as wide as the box, or as the whole picture when the region reaches its full width.
    expect(shown!.width, `${width} px`).toBeGreaterThanOrEqual(Math.min(inner, full!.width) - 2);
    expect(shown!.width, `${width} px`).toBeGreaterThan(150);
  }
});

test('@p1 E78-R1 8.6-E2E-004 at 768 px a focused field zooms the plate crop to its region, outlined outside the value and at least 12 px high', async ({ page }) => {
  test.setTimeout(180_000);
  await openTransformerSheet(page, account, database, { width: 768 });
  await importPlate(page);
  const crop = section(page).locator('.plate-crop');
  const view = crop.locator('.plate-crop-view[data-fitted]');
  await expect(view).toBeVisible({ timeout: 30_000 });
  const picture = view.locator('img:not([hidden])');
  const before = (await picture.boundingBox())!;

  const input = field(page, 'identificacao').locator('.field.suggestion-field input');
  await expect(input).toHaveValue('TR-01', { timeout: 20_000 });
  await input.focus();
  const region = crop.locator('.region');
  await expect(region).toHaveCount(1);
  // Zoomed: the picture is drawn larger than over the whole read region.
  await expect.poll(async () => (await picture.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
  const drawn = await region.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      border: style.borderTopWidth,
      outline: style.outlineStyle,
      offset: Number.parseFloat(style.outlineOffset),
    };
  });
  expect(drawn.height).toBeGreaterThanOrEqual(12);
  // Nothing drawn over the value's own box: no border inside it, an outline outside it.
  expect(drawn.border).toBe('0px');
  expect(drawn.outline).toBe('solid');
  expect(drawn.offset).toBeGreaterThan(0);
  const [box, shown] = await Promise.all([region.boundingBox(), view.boundingBox()]);
  expect(box!.x).toBeGreaterThan(shown!.x);
  expect(box!.x + box!.width).toBeLessThan(shown!.x + shown!.width);
});
