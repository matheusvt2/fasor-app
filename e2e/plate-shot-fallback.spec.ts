import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';
import { readStore } from './support/outbox.ts';
import { plateFocusPlace, samplePlateFocus, startPlateFocusSampler, stopPlateFocusSampler } from './support/plate-focus.ts';
import { holdPhotoBytes, openTransformerSheet, pushPlateSuggestions, pushReadingStatus, transformerPlateFields } from './support/reading-ops.ts';

/*
 * Review F-01 (Epic 13 QA, High): a single shot on the "Fotografar placa" tile is never lost
 * when the camera's own photo (`ImageCapture.takePhoto()`) fails or answers late. Chromium's
 * fake camera answers `takePhoto()`, so the page stubs it, before any script runs, to reject
 * (as Chromium does on a canvas track: `setPhotoOptions failed`) or to answer after 5 s, past
 * the 2 s timeout. The shot is the frame of the tap: the photo row lands on the device, the
 * plate's row shows, and "Não foi possível salvar a foto" never appears. One shot, one photo:
 * the late answer is not saved too.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const FAILED = 'Não foi possível salvar a foto. Tente de novo.';
const nameplate = (page: Page) => page.locator('#ficha-nameplate');

/** `ImageCapture.prototype.takePhoto` rejects (`reject`) or answers a small JPEG after 5 s (`slow`); every toast text is recorded. */
async function stubTakePhoto(page: Page, mode: 'reject' | 'slow'): Promise<void> {
  await page.addInitScript((how: 'reject' | 'slow') => {
    const w = window as unknown as { __takePhotoCalls?: number; __toasts?: string[] };
    w.__takePhotoCalls = 0;
    w.__toasts = [];
    const Capture = (window as unknown as { ImageCapture?: { prototype: { takePhoto: () => Promise<Blob> } } }).ImageCapture;
    if (Capture !== undefined) {
      Capture.prototype.takePhoto = function takePhoto() {
        w.__takePhotoCalls = (w.__takePhotoCalls ?? 0) + 1;
        if (how === 'reject') return Promise.reject(new DOMException('setPhotoOptions failed', 'UnknownError'));
        return new Promise<Blob>((resolve) => {
          setTimeout(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 48;
            canvas.toBlob((blob) => resolve(blob ?? new Blob(['late'], { type: 'image/jpeg' })), 'image/jpeg');
          }, 5_000);
        });
      };
    }
    const watch = () =>
      new MutationObserver(() => {
        for (const toast of document.querySelectorAll('[data-testid="toast"]')) {
          const text = toast.textContent ?? '';
          if (!w.__toasts!.includes(text)) w.__toasts!.push(text);
        }
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    if (document.documentElement === null) document.addEventListener('DOMContentLoaded', watch);
    else watch();
  }, mode);
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __takePhotoCalls?: number; __toasts?: string[] };
    return { calls: w.__takePhotoCalls ?? 0, toasts: [...(w.__toasts ?? [])] };
  });

async function shootPlate(page: Page): Promise<void> {
  const tile = nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' });
  await expect(tile).toBeVisible({ timeout: 30_000 });
  await tile.click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
}

for (const mode of ['reject', 'slow'] as const) {
  test(`@p0 F-01 plate tile, takePhoto ${mode === 'reject' ? 'rejects' : 'answers after 5 s'}: the frame of the tap is saved, the plate row shows, no failure`, async ({ page }) => {
    test.setTimeout(120_000);
    await stubTakePhoto(page, mode);
    await openChaveSheet(page, account, database);
    expect(await devicePhotos(page, database)).toHaveLength(0);

    await shootPlate(page);
    // The photo row is committed on the device, as the plate photo of this sheet.
    await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.removed_at === null).length, { timeout: 20_000 }).toBe(1);
    const [photo] = await devicePhotos(page, database);
    expect(photo!.block_id).not.toBeNull();
    // The camera closed by itself; the tile gave way to the plate's committed row.
    await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
    await expect(nameplate(page).locator('.photo-row.ficha-np-photo:not([data-pending-shot])')).toBeVisible({ timeout: 15_000 });
    await expect(nameplate(page).getByRole('button', { name: 'Fotografar placa' })).toHaveCount(0);
    expect((await probe(page)).calls).toBe(1);

    if (mode === 'slow') {
      // The late answer arrives (5 s after the tap) and is ignored: still one photo.
      await page.waitForTimeout(4_000);
      expect((await devicePhotos(page, database)).filter((row) => row.removed_at === null)).toHaveLength(1);
    }
    expect((await probe(page)).toasts.filter((text) => text.includes(FAILED))).toEqual([]);
    await expect(page.getByTestId('toast').filter({ hasText: FAILED })).toHaveCount(0);
  });
}

for (const width of [390, 768]) {
  test(`@p0 14.10-E2E-003 at ${width} px, after a one-shot "Fotografar placa" the focus lands in the plate row, never on BODY while the reading waits`, async ({ page }) => {
    test.setTimeout(150_000);
    await stubTakePhoto(page, 'reject');
    // The bytes stay on the device, so the reading keeps waiting under the plate row.
    await holdPhotoBytes(page);
    await openChaveSheet(page, account, database, { width });
    await shootPlate(page);
    await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });

    // The camera closed: the focus is on the plate row (its reading line, else its tile).
    await expect.poll(() => plateFocusPlace(page), { timeout: 5_000 }).toBe('plate');
    const focused = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement;
      return { reading: active.matches('.reading-line, .queued-banner'), tile: active.matches('.photo-tile') };
    });
    expect(focused.reading || focused.tile).toBe(true);

    // It stays there while the stored row replaces the pending one and the reading waits: sampled every 50 ms for 6 s,
    // twice the focus watch of the camera.
    const samples = await samplePlateFocus(page, 6_000);
    expect(samples.length).toBeGreaterThan(50);
    expect(samples.filter((place) => place !== 'plate')).toEqual([]);
    await expect(nameplate(page).locator('.photo-row.ficha-np-photo:not([data-pending-shot])')).toBeVisible({ timeout: 15_000 });
    expect(await plateFocusPlace(page)).toBe('plate');
  });
}

test('@p0 14.10-E2E-005 once the plate reading is ready, the focus held by the plate row moves to the plate crop, never to BODY', async ({ page }) => {
  test.setTimeout(180_000);
  await stubTakePhoto(page, 'reject');
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  await shootPlate(page);
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => plateFocusPlace(page), { timeout: 5_000 }).toBe('plate');
  const [photo] = (await devicePhotos(page, database)).filter((row) => row.removed_at === null);
  // The photo's create reaches the server (the engine pushes it after the commit; an acked row may be pruned).
  await expect
    .poll(
      async () => {
        const row = (await readStore<{ path: string; status: string }>(page, database, 'outbox')).find((record) => record.path === `file/${photo!.id}`);
        return row === undefined || row.status === 'acked';
      },
      { timeout: 60_000 },
    )
    .toBe(true);

  await startPlateFocusSampler(page);
  // The reading job's run, written as the server writes it; an `online` event makes the engine pull it now, on the sheet.
  await pushPlateSuggestions(account.companyId, ids.relatorioId, { blockId: ids.blockId, photoId: photo!.id, fields: transformerPlateFields() });
  await pushReadingStatus(account.companyId, ids.relatorioId, photo!.id, 'done');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const crop = nameplate(page).locator('.plate-crop-open');
  await expect(crop).toBeVisible({ timeout: 60_000 });
  await expect(nameplate(page).locator('.photo-row.ficha-np-photo')).toHaveCount(0);
  await expect(crop).toBeFocused({ timeout: 5_000 });
  const samples = await stopPlateFocusSampler(page);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.filter((place) => place !== 'plate')).toEqual([]);
});
