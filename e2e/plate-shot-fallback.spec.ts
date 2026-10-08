import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';

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
