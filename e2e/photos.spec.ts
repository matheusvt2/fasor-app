import { photoStampFull, photoStampShort } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { pullAll, readStore } from './support/outbox.ts';
import { syncNow } from './support/sync.ts';

/*
 * 6.1/6.2-E2E: the burst camera on a sheet, driven as a person would -- the Sticky action
 * bar's "Tirar foto" and an NC row's "Adicionar foto", the denied camera, the upload pills
 * (a refused photo and its retry) and the low-storage banner. 11.5-E2E: Account's
 * "Localização nas fotos" switch and the refused position, seen from the next shot.
 * Chromium's fake camera and a fixed position stand in for the tablet's; each test starts
 * from a fresh device store.
 */

const SAO_PAULO = { latitude: -23.5505, longitude: -46.6333 };

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera', 'geolocation'],
  geolocation: SAO_PAULO,
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});
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

test('@p1 6.2-E2E-006 the Sumário counts "aguardando envio" without the photo whose upload stopped with an error', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);

  // Every file PUT waits until the first photo's id is read off the device; then that
  // photo is refused as too large (a `dead` error) and the others are held unanswered, so
  // they stay waiting while the test reads the Sumário.
  let firstId: string | null = null;
  let idKnown = () => {};
  const idRead = new Promise<void>((resolve) => (idKnown = resolve));
  let refused = 0;
  await page.route(
    (url) => url.pathname.startsWith('/api/files/'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await idRead;
      if (new URL(route.request().url()).pathname !== `/api/files/${firstId}`) return; // held
      refused += 1;
      await route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ code: 'file_too_large', message: 'too large' }) });
    },
  );

  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 3);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);
  const [first] = await devicePhotos(page, database);
  firstId = first!.id;
  idKnown();
  await expect.poll(() => refused, { timeout: 30_000 }).toBe(1);

  // Three photos the server does not hold: one reads "Erro", two are waiting.
  await page.goto(`/relatorio/${relatorioId}`);
  const row7 = page.locator('button.sum-open', { hasText: 'Registro fotográfico' });
  // Story 7.5 (carry-over): the photo with the error is named apart, as the server does not hold it.
  await expect(row7.locator('.sum-status')).toHaveText('3 fotos · 2 aguardando envio · 1 com erro de envio', { timeout: 30_000 });
  const photos = await devicePhotos(page, database);
  expect(photos.filter((photo) => photo.uploaded_at === null)).toHaveLength(3);
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

// --- Story 11.5: "Localização nas fotos" -------------------------------------------------

const locationSwitch = (page: Page) => page.getByRole('switch', { name: 'Gravar coordenadas em cada foto' });
const HELPER_ON = 'O aparelho pede permissão na primeira foto. Se negar, as fotos ficam sem coordenadas e este ajuste mostra "Permissão negada no aparelho".';
const HELPER_OFF = 'Fotos sem coordenadas — a seção 7 imprime só a data e a hora de cada imagem.';
const DENIED = 'Permissão negada no aparelho — as fotos saem sem coordenadas. Libere em Ajustes › Localização e o pino volta na próxima foto.';

async function openAccount(page: Page): Promise<void> {
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 2, name: 'Localização nas fotos' })).toBeVisible({ timeout: 30_000 });
}

/** One shot from the sheet's bar; returns once the camera is closed again. */
async function shootOnce(page: Page): Promise<void> {
  await cameraButton(page).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
}

/** Counts every position request the page makes (`window.__geolocationRequests`). */
async function countPositionRequests(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const geolocation = navigator.geolocation;
    const original = geolocation.getCurrentPosition.bind(geolocation);
    (window as unknown as { __geolocationRequests: number }).__geolocationRequests = 0;
    geolocation.getCurrentPosition = (...args: Parameters<Geolocation['getCurrentPosition']>) => {
      (window as unknown as { __geolocationRequests: number }).__geolocationRequests++;
      original(...args);
    };
  });
}

test('@p0 11.5-E2E-001 11.5-OFF-STAMP: "Localização nas fotos" off (by keyboard) is one user op with no undo, survives a reload, and the next photo carries date and time only', async ({ page }) => {
  test.setTimeout(180_000);
  await countPositionRequests(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const sheetUrl = page.url();

  // On by default, with the "on" helper describing it.
  await openAccount(page);
  const toggle = locationSwitch(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(toggle.locator('.toggle-word')).toHaveText('Ativado');
  await expect(page.getByText('Impressas na seção 7 com a data e a hora: "Imagem 5 · 06/09/2026 14:32 · −23,5505, −46,6333"')).toBeVisible();
  await expect(page.getByText(HELPER_ON)).toBeVisible();
  await expect(toggle).toHaveAccessibleDescription(HELPER_ON);

  // Off by keyboard: Space on the focused switch.
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(toggle.locator('.toggle-word')).toHaveText('Desativado');
  await expect(page.getByText(HELPER_OFF)).toBeVisible();
  await expect(page.getByText(HELPER_ON)).toHaveCount(0);
  await expect(toggle).toHaveAccessibleDescription(HELPER_OFF);
  // 11.5-UNDO: a switch is its own inverse; no "Desfazer" is offered, by design.
  await expect(page.getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
  await expect(page.getByTestId('toast')).toHaveCount(0);

  // One op in the outbox: the user's own row, by this device.
  await expect
    .poll(async () =>
      (await readStore<{ path: string; value: unknown }>(page, database, 'outbox'))
        .filter((op) => op.path === `user/${account.userId}/photo_location_enabled`)
        .map((op) => op.value),
    )
    .toEqual([false]);

  // A reload keeps it off.
  await page.reload();
  await expect(locationSwitch(page)).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
  await expect(page.getByText(HELPER_OFF)).toBeVisible();

  // The next shot: no position asked, no coordinates stored.
  await page.goto(sheetUrl);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
  await shootOnce(page);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  expect(photo!.coords).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { __geolocationRequests: number }).__geolocationRequests)).toBe(0);

  // Its tile and its viewer stamp carry the date and time only: no pin, no "GPS".
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  const item = page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item').first();
  await expect(item.locator('.photo-stamp')).toHaveText(photoStampShort(photo!.captured_at));
  await expect(item.locator('.photo-stamp .pin')).toHaveCount(0);
  await page.getByRole('button', { name: 'Foto 1, abrir', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Foto 1 de 1' });
  await expect(viewer.locator('.viewer-stamp')).toHaveText(photoStampFull({ captured_at: photo!.captured_at, coords: null }));
  await expect(viewer.locator('.viewer-stamp .pin')).toHaveCount(0);
});

test.describe('without the position permission', () => {
  test.use({ permissions: ['camera'] });

  test('@p0 11.5-E2E-002 11.5-DENIED: a refused position never blocks the shot; Account shows "Permissão negada no aparelho" with the switch still on; granted again, the next shot clears it', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await openChaveSheet(page, account, database);
    const sheetUrl = page.url();

    // The shot is taken and saved, with no coordinates.
    await shootOnce(page);
    await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
    expect((await devicePhotos(page, database))[0]!.coords).toBeNull();

    // Account: the denied line in place of the "on" helper, amber, and the switch stays on.
    await openAccount(page);
    const toggle = locationSwitch(page);
    const denied = page.getByText(DENIED);
    await expect(denied).toBeVisible();
    await expect(denied).toHaveAttribute('data-tone', 'amber');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toHaveAccessibleDescription(DENIED);
    await expect(page.getByText(HELPER_ON)).toHaveCount(0);
    await expect(page.getByText(/Erro de GPS/)).toHaveCount(0);

    // Granted in the device's settings: the next shot has its position, and the line goes.
    await context.grantPermissions(['camera', 'geolocation']);
    await context.setGeolocation(SAO_PAULO);
    await page.goto(sheetUrl);
    await expect(page.locator('.sheet-header .sheet-title')).toBeVisible();
    await shootOnce(page);
    await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => photo.coords !== null).length, { timeout: 15_000 }).toBe(1);
    // The fix itself clears the device's denial, before Account's own permission check runs.
    await expect
      .poll(async () => (await readStore<{ key: string }>(page, database, 'local_prefs')).some((pref) => pref.key === 'geolocation_denied'), { timeout: 10_000 })
      .toBe(false);
    await openAccount(page);
    await expect(page.getByText(HELPER_ON)).toBeVisible();
    await expect(page.getByText(DENIED)).toHaveCount(0);
    await expect(locationSwitch(page)).toHaveAttribute('aria-checked', 'true');
  });
});
