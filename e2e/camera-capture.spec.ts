import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, jpegSize, openChaveSheet, shoot } from './support/photos.ts';

/*
 * Stories 13.1, 13.2 and 13.6 (CAP-1, CAP-2, CAP-4), driven from a sheet's "Tirar foto" as a
 * person would: the camera asks for the full resolution and the stored original is the frame
 * the stream gave, fitted to the 2560 px cap; torch, zoom and tap-to-focus appear only when
 * the track offers them (a stub wraps `getUserMedia` to offer them and record what the app
 * applies); a shot the browser refuses to store while offline blocks the next one with the
 * reason, and one refused only once is stored after the eviction retry. Chromium's fake
 * camera stands in for the tablet's.
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

const cameraButton = (page: Page) => page.getByRole('button', { name: 'Tirar foto', exact: true });

interface CameraProbe {
  __gumConstraints?: unknown[];
  __trackSettings?: { width?: number; height?: number }[];
  __stubCapabilities?: boolean;
  __applied?: Record<string, unknown>[];
  __refuseFiles?: 'all' | 'once' | null;
}

/**
 * Records every `getUserMedia` request and the track settings it answered with; with
 * `__stubCapabilities` set, the track also offers torch, zoom (1 to 3, step 0.1) and
 * single-shot focus, and records each `applyConstraints` instead of reaching the fake camera.
 */
async function installCameraProbe(page: Page, stub: boolean): Promise<void> {
  await page.addInitScript((withStub: boolean) => {
    const w = window as unknown as CameraProbe;
    w.__gumConstraints = [];
    w.__trackSettings = [];
    w.__applied = [];
    w.__stubCapabilities = withStub;
    const media = navigator.mediaDevices;
    if (media === undefined) return;
    const real = media.getUserMedia.bind(media);
    media.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      w.__gumConstraints!.push(JSON.parse(JSON.stringify(constraints ?? null)));
      const stream = await real(constraints);
      const track = stream.getVideoTracks()[0]!;
      w.__trackSettings!.push(track.getSettings());
      if (w.__stubCapabilities === true) {
        const offered = { ...track.getCapabilities(), torch: true, zoom: { min: 1, max: 3, step: 0.1 }, focusMode: ['continuous', 'single-shot'] };
        track.getCapabilities = () => offered as MediaTrackCapabilities;
        track.applyConstraints = async (applied?: MediaTrackConstraints) => {
          w.__applied!.push(JSON.parse(JSON.stringify(applied ?? null)));
        };
      }
      return stream;
    };
  }, stub);
}

/** `put`s into the device's `files` store throw the browser's quota refusal: every one, or the next one only. */
async function installFilesRefusal(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const w = window as unknown as CameraProbe;
      if (this.name === 'files' && (w.__refuseFiles === 'all' || w.__refuseFiles === 'once')) {
        if (w.__refuseFiles === 'once') w.__refuseFiles = null;
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
}

async function setFilesRefusal(page: Page, mode: 'all' | 'once' | null): Promise<void> {
  await page.evaluate((value) => {
    (window as unknown as CameraProbe).__refuseFiles = value;
  }, mode);
}

/** The bytes of one stored original, read straight from the device store. */
async function storedOriginal(page: Page, name: string, id: string): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([db, fileId]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(db!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
        const request = open.transaction('files', 'readonly').objectStore('files').get(fileId!);
        request.onsuccess = () => resolve(request.result as never);
        request.onerror = () => reject(request.error);
      });
      open.close();
      if (row === undefined) return '';
      const bytes = new Uint8Array(await row.blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    [name, id],
  );
  return Buffer.from(base64, 'base64');
}

/** `fitWithin` of `photo-encode.ts`: the long edge at most `max`, never enlarged. */
function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const long = Math.max(width, height);
  const scale = long > max ? max / long : 1;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** What the probe recorded so far. */
function probe(page: Page): Promise<{ constraints: unknown[]; settings: { width?: number; height?: number }[]; applied: Record<string, unknown>[] }> {
  return page.evaluate(() => {
    const w = window as unknown as CameraProbe;
    return { constraints: w.__gumConstraints ?? [], settings: w.__trackSettings ?? [], applied: w.__applied ?? [] };
  });
}

test('@p0 13.1-E2E-001 the camera asks for ideal 3840x2160 and the stored original is the stream\'s frame fitted to 2560 px', async ({ page }) => {
  test.setTimeout(120_000);
  await installCameraProbe(page, false);
  await openChaveSheet(page, account, database);

  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  const { constraints, settings } = await probe(page);
  expect(constraints).toHaveLength(1);
  expect(constraints[0]).toMatchObject({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
  const streamed = settings[0]!;
  expect(streamed.width).toBeGreaterThan(0);
  // The fake camera honors the ideal at least past the old 640x480 default.
  expect(streamed.width! * streamed.height!).toBeGreaterThan(640 * 480);
  // The viewfinder plays that stream, live (not a stopped track's placeholder frame).
  await expect.poll(() => camera.locator('video').evaluate((video: HTMLVideoElement) => `${video.videoWidth}x${video.videoHeight}`)).toBe(
    `${streamed.width}x${streamed.height}`,
  );

  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  const bytes = await storedOriginal(page, database, photo!.id);
  expect(jpegSize(bytes)).toEqual(fitWithin(streamed.width!, streamed.height!, 2560));
});

test('@p0 13.2-E2E-001 offered torch, zoom and focus: the controls act through applyConstraints, and the torch is off in every session', async ({ page }) => {
  test.setTimeout(120_000);
  await installCameraProbe(page, true);
  await openChaveSheet(page, account, database);

  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  const torch = camera.getByRole('button', { name: 'Lanterna' });
  await expect(torch).toHaveAttribute('aria-pressed', 'false');
  const box = (await torch.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(48);
  expect(box.height).toBeGreaterThanOrEqual(48);
  await expect.poll(async () => (await probe(page)).applied).toContainEqual({ advanced: [{ torch: false }] });

  await torch.click();
  await expect(torch).toHaveAttribute('aria-pressed', 'true');
  expect((await probe(page)).applied).toContainEqual({ advanced: [{ torch: true }] });

  // Zoom: the visible "+" (the stylus path for the pinch), clamped to the offered range.
  const zoom = camera.getByRole('group', { name: 'Zoom' });
  await expect(zoom).toContainText('1,0×');
  const zoomIn = zoom.getByRole('button', { name: 'Aumentar zoom' });
  for (const box of [await zoomIn.boundingBox(), await zoom.getByRole('button', { name: 'Diminuir zoom' }).boundingBox()]) {
    expect(box!.width).toBeGreaterThanOrEqual(48);
    expect(box!.height).toBeGreaterThanOrEqual(48);
  }
  await zoomIn.click();
  await expect(zoom).toContainText('1,2×');
  expect((await probe(page)).applied).toContainEqual({ advanced: [{ zoom: 1.2 }] });
  while (await zoomIn.isEnabled()) await zoomIn.click();
  await expect(zoom).toContainText('3,0×');
  const zooms = (await probe(page)).applied.flatMap((set) => {
    const value = (set as { advanced: { zoom?: number }[] }).advanced[0]?.zoom;
    return typeof value === 'number' ? [value] : [];
  });
  expect(Math.max(...zooms)).toBe(3);
  expect(Math.min(...zooms)).toBeGreaterThanOrEqual(1);

  // Tap-to-focus: a tap on the preview names the point.
  const finder = camera.getByRole('img', { name: 'Visor da câmera' });
  await finder.click({ position: { x: 40, y: 40 } });
  await expect.poll(async () => (await probe(page)).applied.some((set) => 'pointsOfInterest' in ((set as { advanced: object[] }).advanced[0] ?? {}))).toBe(true);
  const focus = (await probe(page)).applied.find((set) => 'pointsOfInterest' in ((set as { advanced: object[] }).advanced[0] ?? {})) as {
    advanced: { pointsOfInterest: { x: number; y: number }[]; focusMode: string }[];
  };
  expect(focus.advanced[0]!.focusMode).toBe('single-shot');
  const point = focus.advanced[0]!.pointsOfInterest[0]!;
  expect(point.x).toBeGreaterThanOrEqual(0);
  expect(point.x).toBeLessThan(0.5);
  expect(point.y).toBeGreaterThanOrEqual(0);
  expect(point.y).toBeLessThan(0.5);

  // Close and reopen: a new session, the torch off again.
  await camera.getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await cameraButton(page).click();
  const again = await expectCameraOpen(page);
  await expect(again.getByRole('button', { name: 'Lanterna' })).toHaveAttribute('aria-pressed', 'false');
  await expect(again.getByRole('group', { name: 'Zoom' })).toBeVisible();
});

test('@p0 13.2-E2E-002 a camera that offers no torch, zoom or focus shows none of the controls', async ({ page }) => {
  test.setTimeout(120_000);
  await installCameraProbe(page, false);
  await openChaveSheet(page, account, database);
  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await expect(camera.locator('.cam-torch')).toHaveCount(0);
  await expect(camera.locator('.cam-zoom')).toHaveCount(0);
  await camera.getByRole('img', { name: 'Visor da câmera' }).click({ position: { x: 40, y: 40 } });
  await expect(camera.locator('.cam-focus-ring')).toHaveCount(0);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
});

test('@p0 13.6-E2E-002 offline, a shot the device refuses blocks the next one with the reason, and the storage banner shows', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installFilesRefusal(page);
  await openChaveSheet(page, account, database);
  await context.setOffline(true);
  try {
    await setFilesRefusal(page, 'all');
    await cameraButton(page).click();
    const camera = await expectCameraOpen(page);
    const shutter = camera.getByRole('button', { name: 'Disparar' });
    await shoot(page, 1);
    await expect(shutter).toBeDisabled({ timeout: 15_000 });
    await expect(camera.locator('.cam-hint')).toHaveText('Sem espaço para guardar outra foto neste aparelho. Feche a câmera e sincronize para liberar espaço.');
    await expect(page.getByTestId('toast').filter({ hasText: 'Este aparelho recusou guardar a foto.' }).first()).toBeVisible();

    await camera.getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
    await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
    await expect(page.locator('.banner-slot .banner[data-banner="storage-low"] .banner-text')).toContainText('Pouco espaço neste aparelho');
    expect(await devicePhotos(page, database)).toHaveLength(0);

    // Still refused: the opener tries the held shot again and does not open the camera.
    await cameraButton(page).click();
    await expect(page.getByTestId('toast').filter({ hasText: 'Este aparelho recusou guardar a foto.' }).first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);

    // Once the device takes it, the next press stores the held shot and opens the camera.
    await setFilesRefusal(page, null);
    await cameraButton(page).click();
    const reopened = await expectCameraOpen(page);
    await expect(reopened.getByRole('button', { name: 'Disparar' })).toBeEnabled();
    await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
    await expect(page.locator('.banner-slot .banner[data-banner="storage-low"]')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});

test('@p0 13.6-E2E-003 offline, a shot refused once is stored after the eviction retry', async ({ page, context }) => {
  test.setTimeout(120_000);
  await installFilesRefusal(page);
  await openChaveSheet(page, account, database);
  await context.setOffline(true);
  try {
    await setFilesRefusal(page, 'once');
    await cameraButton(page).click();
    const camera = await expectCameraOpen(page);
    await shoot(page, 1);
    await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
    expect(await page.evaluate(() => (window as unknown as CameraProbe).__refuseFiles)).toBeNull();
    await expect(camera.getByRole('button', { name: 'Disparar' })).toBeEnabled();
    await expect(page.getByTestId('toast').filter({ hasText: 'Este aparelho recusou guardar a foto.' })).toHaveCount(0);
    await camera.getByRole('button', { name: 'Concluir fotos' }).click();
    await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
    await expect(page.locator('.banner-slot .banner[data-banner="storage-low"]')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});
