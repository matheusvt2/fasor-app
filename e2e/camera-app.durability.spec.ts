import type { FileChooser, Locator, Page } from '@playwright/test';
import { makeOp, SERVER_DEVICE_ID, toIso, type OpDraft } from '@app/domain';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { asCompanyId } from '../apps/api/src/db/repositories/company-id.ts';
import { newId } from '../apps/api/src/ids.ts';
import { applyOps } from '../apps/api/src/sync/apply.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { signInForDurability, withoutServiceWorker } from './support/durability.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readFileBlobs, readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, jpegFromPage, jpegSize, openChaveSheet, type PhotoRowRecord } from './support/photos.ts';
import { holdPhotoBytes } from './support/reading-ops.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';

/*
 * Stories 17.2 and 17.7 (FR-43; AD-7): the device's camera app takes the photos, and a photo
 * leaves the relatório on request ("Salvar no aparelho"). Durability projects: desktop Chrome,
 * Android Chrome emulation and WebKit.
 *
 * 17.2: on a touch device "Câmera do aparelho" is on by default, so every camera opener
 * clicks its hidden `capture="environment"` input inside the press (the device's camera app
 * opens) and never asks `getUserMedia`; the file it returns runs the capture pipeline as a
 * viewfinder shot does. `getUserMedia` is wrapped here (never removed) by a canvas stream that
 * counts its calls, so the viewfinder still opens where the switch is off. Conta's switch
 * follows the device's touch points, flips on a tap and survives a reload.
 *
 * 17.7: the viewer's "Salvar no aparelho" hands the JPEG to the share sheet where the browser
 * shares files, else downloads it, named by the stamp; nothing in the outbox changes. A
 * colleague's photo whose original is neither here nor uploaded says why it cannot be saved.
 *
 * Playwright's WebKit build cannot store a photo Blob in IndexedDB (`photo-zoom.durability.spec.ts`),
 * so the tests that store a photo skip there; the Conta switch and the chooser run everywhere.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  await withoutServiceWorker(page);
  // A canvas camera behind a counting `getUserMedia`, and a count of the presses that clicked a
  // camera opener's hidden input (WebKit opens no chooser from a press, so the click is counted).
  await page.addInitScript(() => {
    const w = window as unknown as { __gum: number; __cameraInputClicks: number };
    w.__gum = 0;
    w.__cameraInputClicks = 0;
    const click = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function (this: HTMLInputElement) {
      if (this.dataset.testid === 'camera-fallback-input') w.__cameraInputClicks += 1;
      return click.call(this);
    };
    const media = navigator.mediaDevices;
    if (media === undefined) return;
    const getUserMedia = async (): Promise<MediaStream> => {
      w.__gum += 1;
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext('2d')!;
      let tick = 0;
      const draw = () => {
        tick += 1;
        context.fillStyle = tick % 2 === 0 ? '#2a5' : '#25a';
        context.fillRect(0, 0, canvas.width, canvas.height);
      };
      draw();
      // A canvas stream sends a frame only when the canvas is drawn: keep drawing while it is live.
      const stream = canvas.captureStream(10);
      const timer = setInterval(draw, 100);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => {
          clearInterval(timer);
          stop();
        };
      }
      return stream;
    };
    Object.defineProperty(media, 'getUserMedia', { value: getUserMedia, configurable: true });
  });
});

const toast = (page: Page) => page.getByTestId('toast');
const cameraDialog = (page: Page) => page.getByRole('dialog', { name: 'Câmera', exact: true });
/** The `getUserMedia` calls and the camera-input clicks of this document (both start at 0 on every load). */
const probe = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __gum: number; __cameraInputClicks: number };
    return { gum: w.__gum, clicks: w.__cameraInputClicks };
  });
const cameraSwitch = (page: Page) => page.getByRole('switch', { name: 'Câmera do aparelho' });

/** The original this device stores for `id`, its bytes (a Blob cannot cross `page.evaluate`, so base64). */
async function storedOriginal(page: Page, id: string): Promise<Buffer | null> {
  const base64 = await page.evaluate(
    async ([name, fileId]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const row = await new Promise<{ variant: string; blob: Blob } | undefined>((resolve, reject) => {
        const request = open.transaction('files', 'readonly').objectStore('files').get(fileId!);
        request.onsuccess = () => resolve(request.result as never);
        request.onerror = () => reject(request.error);
      });
      open.close();
      if (row === undefined || row.variant !== 'original') return null;
      const bytes = new Uint8Array(await row.blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    },
    [database, id],
  );
  return base64 === null ? null : Buffer.from(base64, 'base64');
}

/**
 * Taps `opener` and answers the device's camera app with `jpeg`: the chooser is the opener's own
 * hidden `capture="environment"` input, opened inside the press, one file. Returns the photo row
 * it added once it is stored, after checking no viewfinder opened and the one-photo toast.
 */
async function shootThroughCameraApp(page: Page, opener: Locator, jpeg: Buffer, name: string): Promise<PhotoRowRecord> {
  const before = new Set((await devicePhotos(page, database)).map((photo) => photo.id));
  const counted = await probe(page);
  const choosing = page.waitForEvent('filechooser');
  await opener.click();
  const chooser: FileChooser = await choosing;
  expect(await chooser.element().getAttribute('data-testid')).toBe('camera-fallback-input');
  expect(await chooser.element().getAttribute('capture')).toBe('environment');
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles({ name, mimeType: 'image/jpeg', buffer: jpeg });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(before.size + 1);
  const added = (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!;
  await expect(cameraDialog(page)).toHaveCount(0);
  // One camera-app open for the press, and the live camera never asked.
  expect(await probe(page)).toEqual({ gum: 0, clicks: counted.clicks + 1 });
  await expect(toast(page)).toHaveText(/^Foto salva/, { timeout: 15_000 });
  // The stored original is the pipeline's JPEG, at most 2560 px wide (E13-A7).
  await expect.poll(async () => (await storedOriginal(page, added.id))?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const width = jpegSize((await storedOriginal(page, added.id))!).width;
  expect(width).toBeGreaterThan(0);
  expect(width).toBeLessThanOrEqual(2560);
  return added;
}

/** Reads the toggle word and state of the Conta switch. */
async function expectSwitch(page: Page, on: boolean): Promise<void> {
  await expect(cameraSwitch(page)).toHaveAttribute('aria-checked', String(on), { timeout: 15_000 });
  await expect(cameraSwitch(page)).toContainText(on ? 'Ativado' : 'Desativado');
}

test.describe('on a touch screen', () => {
  // The camera app is the default on a touch device: every project runs this test with one,
  // so the story gate's desktop projects run it too (as `photo-zoom.durability.spec.ts` does).
  test.use({ hasTouch: true });

  test('@p0 17.2-E2E-001 on a touch device every camera opener takes the camera app: the capture input inside the press, no viewfinder, getUserMedia never asked, each photo stored with its opener\'s target', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit cannot store a photo Blob in IndexedDB');
    test.setTimeout(240_000);
    await holdPhotoBytes(page);
    const { relatorioId, blockId } = await openChaveSheet(page, account, database, { signIn: () => signInForDurability(page, context, account.email) });
    expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0);
    const jpeg = await jpegFromPage(page, 4000, 3000);

    // The sticky bar's "Tirar foto": the sheet, no item, no reading.
    const tirar = page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true });
    const shot = await shootThroughCameraApp(page, tirar, jpeg, 'IMG_0001.jpg');
    expect(shot).toMatchObject({ block_id: blockId, item_key: null });
    expect(shot.reading_kind).toBeNull();

    // An NC row's "Adicionar foto": its item, the NC draft reading.
    const contatos = page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
    await contatos.getByRole('radio', { name: 'Não conforme', exact: true }).click();
    const nc = await shootThroughCameraApp(page, contatos.getByRole('button', { name: 'Adicionar foto' }), jpeg, 'IMG_0002.jpg');
    expect(nc).toMatchObject({ block_id: blockId, item_key: 'contatos' });
    expect(nc.reading_kind).toBe('nc_obs');

    // "Fotografar placa": the plate reading.
    const plateTile = page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' });
    const plate = await shootThroughCameraApp(page, plateTile, jpeg, 'IMG_0003.jpg');
    expect(plate).toMatchObject({ block_id: blockId });
    expect(plate.reading_kind).toBe('plate');

    // "Ler visor" (a burst opener): one photo per tap, the display reading, each tap the next row.
    const visor = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions').getByRole('button', { name: 'Ler visor' });
    const displays = [await shootThroughCameraApp(page, visor, jpeg, 'IMG_0004.jpg'), await shootThroughCameraApp(page, visor, jpeg, 'IMG_0004b.jpg')];
    for (const display of displays) {
      expect(display).toMatchObject({ block_id: blockId });
      expect(display.reading_kind).toBe('display');
    }
    expect(displays.map((display) => (display.reading_target as { start_cell: { row: number } }).start_cell.row)).toEqual([0, 1]);

    // The gallery camera: "Geral".
    await page.goto(`/relatorio/${relatorioId}/fotos`);
    const galleryCamera = page.locator('.gallery-bar').getByRole('button', { name: 'Tirar foto', exact: true });
    await expect(galleryCamera).toBeVisible({ timeout: 30_000 });
    const geral = await shootThroughCameraApp(page, galleryCamera, jpeg, 'IMG_0005.jpg');
    expect(geral).toMatchObject({ block_id: null, item_key: null });
    // Story 9.3: a photo with no sheet and no caption asks for the vision caption, which `isGeralPhoto` accepts (Story 17.1).
    expect(geral.reading_kind).toBe('caption');

    // The relatório tree's "Fotografar equipamento": the panel reading, no block yet.
    await page.goto(`/relatorio/${relatorioId}`);
    await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
    const chevron = page.getByRole('button', { name: /^Expandir ou recolher a seção \d+$/ });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await expandLocation(page, '1° Subsolo');
    await page.getByRole('button', { name: 'Mais opções de Coluna 1 de 1° Subsolo', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
    const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
    const panel = await shootThroughCameraApp(page, palette.getByRole('button', { name: 'Fotografar equipamento' }), jpeg, 'IMG_0006.jpg');
    expect(panel).toMatchObject({ block_id: null });
    expect(panel.reading_kind).toBe('panel');
    await expect(page.getByRole('dialog', { name: 'Fotografar equipamento' })).toBeVisible();
  });
});

test('@p0 17.2-E2E-002 Conta: "Câmera do aparelho" follows the touch points, flips on a tap, survives a reload, and "Tirar foto" then takes the other path', async ({ page, context, browserName }) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { signIn: () => signInForDurability(page, context, account.email) });
  const touch = (await page.evaluate(() => navigator.maxTouchPoints)) > 0;
  expect(touch).toBe(test.info().project.use.hasTouch === true);

  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Câmera', exact: true })).toBeVisible();
  await expectSwitch(page, touch);
  await expect(page.getByText('Cada toque abre a câmera do aparelho e tira uma foto. Desligado, a câmera abre aqui dentro, com rajada, lanterna e zoom.')).toBeVisible();
  await expect(page.getByText('As fotos ficam no relatório. Para guardar uma cópia na galeria, use Salvar no aparelho na foto.')).toBeVisible();
  await expect(cameraSwitch(page)).toHaveAccessibleDescription('Cada toque abre a câmera do aparelho e tira uma foto. Desligado, a câmera abre aqui dentro, com rajada, lanterna e zoom.');

  await cameraSwitch(page).click();
  await expectSwitch(page, !touch);
  await page.reload();
  await expectSwitch(page, !touch);

  // The sheet's "Tirar foto" now takes the other path.
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  const tirar = page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true });
  await expect(tirar).toBeVisible({ timeout: 30_000 });
  if (touch) {
    // Android with the switch off: the in-app viewfinder.
    await tirar.click();
    const camera = await expectCameraOpen(page);
    expect(await probe(page)).toEqual({ gum: 1, clicks: 0 });
    await camera.getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
    await expect(cameraDialog(page)).toHaveCount(0);
  } else {
    // A desktop with the switch on: the capture input (the system picker), no viewfinder.
    if (browserName === 'chromium') {
      const choosing = page.waitForEvent('filechooser');
      await tirar.click();
      const chooser = await choosing;
      expect(await chooser.element().getAttribute('data-testid')).toBe('camera-fallback-input');
    } else {
      // WebKit opens no chooser from a press here; the press still clicked the input.
      await tirar.click();
    }
    await expect.poll(() => probe(page)).toEqual({ gum: 0, clicks: 1 });
    await expect(cameraDialog(page)).toHaveCount(0);
  }
});

test('@p0 17.7-E2E-001 "Salvar no aparelho" on a stored photo: a download named by the stamp without a share sheet, one shared JPEG with it, the outbox unchanged', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot store a photo Blob in IndexedDB');
  test.setTimeout(180_000);
  // No camera API on this browser: "Tirar foto" takes the capture input on every project.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => undefined, configurable: true });
  });
  const { relatorioId } = await openChaveSheet(page, account, database, { signIn: () => signInForDurability(page, context, account.email) });
  const jpeg = await jpegFromPage(page, 1600, 1200);
  const tirar = page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true });
  const choosing = page.waitForEvent('filechooser');
  await tirar.click();
  await (await choosing).setFiles({ name: 'IMG_0101.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  // Its op and its bytes reach the server; the original stays here (an Em campo relatório).
  await syncNowAndReturn(page);
  const original = (await readFileBlobs(page, database)).find((blob) => blob.id === photo!.id && blob.variant === 'original');
  expect(original?.size ?? 0).toBeGreaterThan(0);
  const outboxBefore = (await readStore<{ op_id: string }>(page, database, 'outbox')).map((row) => row.op_id);

  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await page.getByRole('button', { name: 'Foto 1, abrir', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: /^Foto 1 de/ });
  await expect(viewer).toBeVisible();
  const save = viewer.getByRole('button', { name: 'Salvar no aparelho' });
  await expect(save).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });

  // No share sheet: the JPEG downloads, named by the stamp.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true, writable: true });
  });
  const download = await downloadFrom(page, () => save.click());
  expect(download.suggestedFilename()).toMatch(/^foto-\d{4}-\d{2}-\d{2}-\d{6}\.jpg$/);
  const bytes = await downloadBytes(download);
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  expect(bytes.length).toBe(original!.size);

  // A share sheet that takes files (the Export dialog's recording stub): one share, nothing downloads.
  let downloads = 0;
  page.on('download', () => {
    downloads += 1;
  });
  await page.evaluate(() => {
    const w = window as unknown as { __shares: unknown[] };
    w.__shares = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: async (data: ShareData) => {
        w.__shares.push({ keys: Object.keys(data).sort(), title: data.title, files: (data.files ?? []).map((file) => ({ name: file.name, type: file.type, size: file.size })) });
      },
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, writable: true, value: (data: ShareData) => (data.files ?? []).length > 0 });
  });
  await save.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shares: unknown[] }).__shares))
    .toEqual([{ keys: ['files', 'title'], title: 'Foto do relatório', files: [{ name: download.suggestedFilename(), type: 'image/jpeg', size: original!.size }] }]);
  expect(downloads).toBe(0);
  await expect(viewer).toBeVisible();

  // Nothing in the relatório changed: no op was written by either press.
  expect((await readStore<{ op_id: string }>(page, database, 'outbox')).map((row) => row.op_id)).toEqual(outboxBefore);
});

/** A colleague's photo of "Geral", created on another device of the office; its bytes never sent. */
function colleaguePhotoDraft(relatorioId: string, id: string, size: number): OpDraft {
  return officeDraft(
    account,
    { relatorioId },
    `file/${id}`,
    {
      id,
      company_id: account.companyId,
      relatorio_id: relatorioId,
      sha256: 'e2e'.padEnd(64, '0'),
      mime: 'image/jpeg',
      size,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      kind: 'photo',
      captured_at: '2026-10-28T13:05:09.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 0,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
      people_in_photo: false,
    },
    'create',
  );
}

/** The server recording that it holds the photo's bytes (`file/{id}/uploaded_at`, the files route's own op). */
async function markUploaded(relatorioId: string, id: string): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const at = new Date();
    const op = makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: account.companyId,
        project_id: null,
        relatorio_id: relatorioId,
        path: `file/${id}/uploaded_at`,
        value: toIso(at),
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: 'system:files',
        device_id: SERVER_DEVICE_ID,
      },
      { newId, now: at },
    );
    const result = await applyOps(db, asCompanyId(account.companyId), [op], { origin: 'server', now: () => at });
    if (result.rejected.length > 0) throw new Error(`uploaded_at op rejected: ${JSON.stringify(result.rejected)}`);
  } finally {
    await sql.end();
  }
}

test('@p1 17.7-E2E-002 a colleague\'s photo: disabled with its reason until uploaded, the server\'s original downloads once the route answers, the fetch failure says so', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Playwright WebKit cannot store a photo Blob in IndexedDB');
  test.setTimeout(180_000);
  const { relatorioId } = await openChaveSheet(page, account, database, { signIn: () => signInForDurability(page, context, account.email) });
  const jpeg = await jpegFromPage(page, 1200, 900);
  const photoId = newId();
  await pushDrafts(page, database, [colleaguePhotoDraft(relatorioId, photoId, jpeg.length)]);

  const gallery = `/relatorio/${relatorioId}/fotos`;
  const openViewer = async (): Promise<Locator> => {
    await page.goto(gallery);
    await page.getByRole('button', { name: 'Foto 1, abrir', exact: true }).click({ timeout: 30_000 });
    const viewer = page.getByRole('dialog', { name: /^Foto 1 de/ });
    await expect(viewer).toBeVisible();
    return viewer;
  };

  // Neither here nor uploaded: disabled, with the reason.
  await page.goto(gallery);
  await syncNowAndReturn(page);
  await expect.poll(async () => (await devicePhotos(page, database)).map((photo) => photo.id), { timeout: 30_000 }).toEqual([photoId]);
  let viewer = await openViewer();
  let save = viewer.getByRole('button', { name: 'Salvar no aparelho' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(save).toHaveAccessibleDescription('O original ainda não foi enviado pelo aparelho que tirou a foto.');
  await expect(viewer.getByText('O original ainda não foi enviado pelo aparelho que tirou a foto.')).toBeVisible();

  // Uploaded while the viewer stays open, the file route answering the original: the open viewer
  // fetches it, the reason goes and "Salvar no aparelho" enables; those bytes download. The sync
  // runs without leaving the page (the app's own cycle on `online`, else its 60 s tick), so the
  // viewer is never remounted.
  await page.route(`**/api/files/${photoId}/original`, (route) => route.fulfill({ status: 200, contentType: 'image/jpeg', body: jpeg }));
  await markUploaded(relatorioId, photoId);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await devicePhotos(page, database))[0]?.uploaded_at ?? null, { timeout: 90_000 }).not.toBeNull();
  await expect(save).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });
  await expect(viewer.getByText('O original ainda não foi enviado pelo aparelho que tirou a foto.')).toHaveCount(0);
  await expect(viewer.getByText('Preparando a foto…')).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true, writable: true });
  });
  const download = await downloadFrom(page, () => save.click());
  expect(download.suggestedFilename()).toBe('foto-2026-10-28-100509.jpg');
  expect((await downloadBytes(download)).equals(jpeg)).toBe(true);

  // The file route failing (offline from the server's side), on a fresh viewer: the failure is the reason.
  await page.unroute(`**/api/files/${photoId}/original`);
  await page.route(`**/api/files/${photoId}/original`, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"unavailable","message":"e2e"}' }));
  viewer = await openViewer();
  save = viewer.getByRole('button', { name: 'Salvar no aparelho' });
  await expect(save).toHaveAccessibleDescription('Não foi possível buscar a foto no servidor. Tente de novo com conexão.', { timeout: 15_000 });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
});
