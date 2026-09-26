import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, PHOTO_ACCOUNT, shoot } from './support/photos.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { pullAll } from './support/outbox.ts';
import { syncNow } from './support/sync.ts';

/*
 * 6.1/6.2-E2E: the burst camera on a sheet, driven as a person would -- the Sticky action
 * bar's "Tirar foto" and an NC row's "Adicionar foto", the denied camera, the upload pills
 * (a refused photo and its retry) and the low-storage banner. Chromium's fake camera and a
 * fixed position stand in for the tablet's; each test starts from a fresh device store.
 */

const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'geolocation'],
  geolocation: SAO_PAULO,
});

const account = PHOTO_ACCOUNT;
const database = deviceDatabaseName(account.userId);
const cameraButton = (page: Page) => page.getByRole('button', { name: 'Tirar foto', exact: true });
const toast = (page: Page) => page.getByTestId('toast');
const contatos = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');

/**
 * E6-Q14: a saved photo goes out at once while online, so a test reading the pending pills
 * holds the photo PUTs until it calls the returned `release`, which lets them through.
 */
async function holdUploadsUntilReleased(page: Page): Promise<() => Promise<void>> {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const matches = (url: URL) => url.pathname.startsWith('/api/files/');
  await page.route(matches, async (route) => {
    if (route.request().method() === 'PUT') await held;
    await route.continue();
  });
  // The handler stays: once released it lets every PUT through as it comes.
  return async () => {
    release();
  };
}

test('@p0 6.1-E2E-001 "Tirar foto" opens the camera, a burst of three saves at once with the context caption, and survives a reload', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  // The 56 px Camera capture button sits in the Sticky action bar's slot.
  const button = cameraButton(page);
  await expect(page.locator('.sticky-action-bar .bar-buttons.has-camera .camera-capture-btn')).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(Math.round(box.width)).toBe(56);
  expect(Math.round(box.height)).toBe(56);

  await button.click();
  const camera = await expectCameraOpen(page);
  // No chooser and no caption composer: the viewfinder, the context and the shutter.
  await expect(camera.locator('.cam-context')).toHaveText('Contexto: Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(camera.locator('.cam-count')).toHaveText('Rajada: toque no disparador quantas vezes precisar; nada pergunta entre as fotos');

  await shoot(page, 3);
  // The opener's badge counts the burst.
  await expect(page.locator('.camera-capture-btn')).toHaveAttribute('data-count', '3');
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);

  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(toast(page)).toContainText('Fotos salvas neste aparelho — entram na fila de envio');
  await expect(page.locator('.camera-capture-btn')).toHaveAttribute('data-count', '');

  // Reload: the three photos are still there, each with its context caption, in capture
  // order with an increasing per-device counter and the position the browser gave.
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  const photos = await devicePhotos(page, database);
  expect(photos).toHaveLength(3);
  for (const photo of photos) {
    expect(photo).toMatchObject({
      relatorio_id: relatorioId,
      block_id: blockId,
      item_key: null,
      mime: 'image/jpeg',
      caption: 'Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel',
      reading_status: 'none',
    });
    expect(photo.coords).toMatchObject({ lat: SAO_PAULO.latitude, lng: SAO_PAULO.longitude, source: 'geolocation' });
    expect(Number.isInteger(photo.tz_offset)).toBe(true);
  }
  expect(photos.map((photo) => photo.local_seq)).toEqual([1, 2, 3]);
});

test('@p0 6.1-E2E-002 an NC row\'s "Adicionar foto" shoots two photos that show under the row\'s buttons, captioned from the item', async ({ page }) => {
  test.setTimeout(120_000);
  await openChaveSheet(page, account, database);
  const row = contatos(page);
  await row.scrollIntoViewIfNeeded();
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(row.getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');

  const add = row.getByRole('button', { name: 'Adicionar foto' });
  await expect(row.locator('.row-wrap .btn-reason')).toHaveText('Recomendada para não conforme');
  const releaseUploads = await holdUploadsUntilReleased(page);
  await add.click();
  const camera = await expectCameraOpen(page);
  await expect(camera.locator('.cam-context')).toHaveText(
    'Contexto: Detalhe da verificação de contatos realizada na chave seccionadora SEC-ENEL do Cubículo Enel',
  );
  await shoot(page, 2);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect(add).toBeFocused();

  // Two tile rows under the row's buttons, the caption in meta, "Aguardando envio" each.
  const tiles = row.locator('.photo-list .photo-row');
  await expect(tiles).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(tiles.nth(i).locator('.photo-meta')).toHaveText('Detalhe da verificação de contatos realizada na chave seccionadora SEC-ENEL do Cubículo Enel');
    await expect(tiles.nth(i).locator('.upload-pill')).toHaveText('Aguardando envio');
    await expect(tiles.nth(i).locator('.upload-pill')).toHaveAttribute('data-state', 'pending');
    await expect(tiles.nth(i).locator('img.thumb-img')).toBeVisible();
  }
  const photos = await devicePhotos(page, database);
  expect(photos.map((photo) => photo.item_key)).toEqual(['contatos', 'contatos']);

  // Once the server holds them, the pills go.
  await releaseUploads();
  await syncNow(page);
  await page.goBack();
  await expect(contatos(page).locator('.photo-list .photo-row')).toHaveCount(2);
  await expect(contatos(page).locator('.upload-pill')).toHaveCount(0, { timeout: 30_000 });
});

test('@p0 6.1-E2E-003 a denied camera shows the reason and the OS path under the button, and no dialog opens', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied, configurable: true });
  });
  await openChaveSheet(page, account, database);
  const button = cameraButton(page);
  await button.click();
  const note = page.locator('.sticky-action-bar .camera-denied');
  await expect(note).toHaveText('A câmera está bloqueada para este site. Para liberar: Configurações do navegador › Permissões do site › Câmera.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(button).toHaveAttribute('aria-describedby', (await note.getAttribute('id'))!);
  expect(await devicePhotos(page, database)).toEqual([]);
});

test('@p1 6.2-E2E-001 a photo refused with 413 reads "Erro — Tentar novamente" after a reload too, the others upload, and the pill retries it', async ({ page }) => {
  test.setTimeout(150_000);
  await openChaveSheet(page, account, database);
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();

  // The first photo (by capture time) is refused as too large; the second goes through.
  // E6-Q14 sends a saved shot at once, so the route is in place before the shots: every
  // file PUT waits until the first photo's id is read off the device, then only that
  // photo's PUT is refused.
  let firstId: string | null = null;
  let idKnown = () => {};
  const idRead = new Promise<void>((resolve) => (idKnown = resolve));
  let refused = 0;
  const filePut = (url: URL) => url.pathname.startsWith('/api/files/');
  await page.route(filePut, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    await idRead;
    if (new URL(route.request().url()).pathname !== `/api/files/${firstId}`) return route.continue();
    refused += 1;
    await route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ code: 'file_too_large', message: 'too large' }) });
  });

  await row.getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 2);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(row.locator('.photo-list .photo-row')).toHaveCount(2);

  const [first] = await devicePhotos(page, database);
  firstId = first!.id;
  idKnown();
  await syncNow(page);
  expect(refused).toBe(1);
  await page.goBack();

  const tiles = contatos(page).locator('.photo-list .photo-row');
  const errorPill = tiles.nth(0).getByRole('button', { name: 'Erro — Tentar novamente' });
  await expect(errorPill).toBeVisible();
  await expect(errorPill).toHaveAttribute('data-state', 'error');
  expect(Math.round((await errorPill.boundingBox())!.height)).toBeGreaterThanOrEqual(48);
  await expect(tiles.nth(1).locator('.upload-pill')).toHaveCount(0, { timeout: 30_000 });

  // Never retried on its own, and still an error after a reload.
  await page.reload();
  await expect(contatos(page).locator('.photo-list .photo-row').nth(0).getByRole('button', { name: 'Erro — Tentar novamente' })).toBeVisible();
  expect(refused).toBe(1);

  // The pill is the retry: the server now takes it.
  await page.unroute(filePut);
  await contatos(page).locator('.photo-list .photo-row').nth(0).getByRole('button', { name: 'Erro — Tentar novamente' }).click();
  await expect(contatos(page).locator('.photo-list .photo-row').nth(0).locator('.upload-pill')).toHaveCount(0, { timeout: 60_000 });
  expect(refused).toBe(1);
  const photos = await devicePhotos(page, database);
  expect(photos.every((photo) => photo.uploaded_at !== null)).toBe(true);
});

test('@p1 6.2-E2E-002 under 500 MB free the low-storage banner shows on every surface, and a capture still saves', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const MB = 1024 * 1024;
    const low = async () => ({ usage: 10_000 * MB - 180 * MB, quota: 10_000 * MB });
    Object.defineProperty(navigator.storage, 'estimate', { value: low, configurable: true });
  });
  await openChaveSheet(page, account, database);
  const banner = page.locator('.banner-slot .banner[data-banner="storage-low"]');
  await expect(banner.locator('.banner-text')).toHaveText('Pouco espaço neste aparelho (180 MB). Sincronize para liberar.');
  await expect(banner.getByRole('button', { name: 'Sincronizar' })).toBeVisible();

  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length).toBe(1);

  // Another surface: the same banner.
  await page.goto('/');
  await expect(page.locator('.banner-slot .banner[data-banner="storage-low"] .banner-text')).toHaveText(
    'Pouco espaço neste aparelho (180 MB). Sincronize para liberar.',
  );
});

test('@p1 6.2-E2E-004 the browser refuses to store a shot while online: it goes straight to the server and is not lost', async ({ page }) => {
  test.setTimeout(120_000);
  // The next `put` into the device's `files` store throws the browser's quota refusal, once.
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      const w = window as unknown as { __refuseFilesPut?: boolean };
      if (w.__refuseFilesPut === true && this.name === 'files') {
        w.__refuseFilesPut = false;
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  const { relatorioId } = await openChaveSheet(page, account, database);
  await page.evaluate(() => {
    (window as unknown as { __refuseFilesPut?: boolean }).__refuseFilesPut = true;
  });

  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __refuseFilesPut?: boolean }).__refuseFilesPut)).toBe(false);

  // The server holds the photo's create and its bytes.
  const serverPhoto = async () => {
    const { ops } = await pullAll(page.request, `/api/sync/relatorios/${relatorioId}`);
    const creates = ops.filter((op) => /^file\/[0-9a-f-]+$/.test(op.path) && (op.value as { kind?: string }).kind === 'photo');
    const uploaded = creates.filter((create) => ops.some((op) => op.path === `${create.path}/uploaded_at`));
    return { creates, uploaded };
  };
  await expect.poll(async () => (await serverPhoto()).uploaded.length, { timeout: 30_000 }).toBe(1);
  const { creates } = await serverPhoto();
  expect(creates).toHaveLength(1);
  expect(creates[0]!.value).toMatchObject({ kind: 'photo', caption: 'Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel' });

  // The next pull brings the row back to this device.
  await syncNow(page);
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.uploaded_at !== null).length, { timeout: 30_000 }).toBe(1);
});

test('@p1 6.2-E2E-005 E6-Q14: online, a shot and a file added from the sheet go out on their own, with no "Sincronizar agora"', async ({ page }) => {
  test.setTimeout(120_000);
  await openChaveSheet(page, account, database);
  const uploaded = async () => (await devicePhotos(page, database)).filter((photo) => photo.uploaded_at !== null).length;

  // One shot: the server holds it within seconds, not at the next 60 s tick.
  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
  await expect.poll(uploaded, { timeout: 10_000 }).toBe(1);

  // One file through "Adicionar fotos": the same.
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles(await plainJpeg(page, 'depois.jpg'));
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await expect.poll(uploaded, { timeout: 10_000 }).toBe(2);
});
