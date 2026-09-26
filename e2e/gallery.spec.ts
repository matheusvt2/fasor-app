import { photoStampFull, photoStampShort } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { exifJpeg, plainJpeg, png, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, jpegFromPage, openChaveSheet, shoot, type PhotoRowRecord } from './support/photos.ts';
import { syncNow } from './support/sync.ts';

/*
 * 6.3/6.4/6.5-E2E: the gallery (Sumário row 7), the Photo viewer, removal and "Desfazer",
 * photos added from files (a sheet at once, the gallery through "De qual equipamento?", a
 * drop on a computer) and the Caption composer, driven as a person would. Chromium's fake
 * camera and a fixed position stand in for the tablet's; the import files are drawn in the
 * page (`e2e/fixtures/photos/synthetic.ts`). Uploads are held where a test reads the
 * "Aguardando envio" pills, so the 60 s sync timer cannot race them.
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
const SHEET_CAPTION = 'Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel';
const NC_CAPTION = 'Detalhe da verificação de contatos realizada na chave seccionadora SEC-ENEL do Cubículo Enel';

const toast = (page: Page) => page.getByTestId('toast');
const contatos = (page: Page) => page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
const galleryItems = (page: Page) => page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item');
const tileOf = (page: Page, n: number) => page.getByRole('button', { name: `Foto ${n}, abrir`, exact: true });
const itemOf = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);

/** Holds every photo PUT unanswered, so the pills stay "Aguardando envio" while the test reads them. */
async function holdUploads(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/files/'),
    async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }
      // Never answered while the test runs.
    },
  );
}

/** The block id of the first sheet of `type` under the cabine `cabine`, read from the device store. */
async function blockIn(page: Page, relatorioId: string, cabine: string, type: string): Promise<string> {
  type Record = { entity: string; relatorio_id: string | null; row: { id: string; name?: string; parent_id?: string | null; block_type?: string; location_id?: string | null; order_key?: string } };
  const records = await readStore<Record>(page, database, 'entities');
  const locations = records.filter((r) => r.entity === 'location' && r.relatorio_id === relatorioId).map((r) => r.row);
  const root = locations.find((l) => l.name === cabine && l.parent_id === null)!;
  const ids = new Set([root.id, ...locations.filter((l) => l.parent_id === root.id).map((l) => l.id)]);
  const blocks = records
    .filter((r) => r.entity === 'block' && r.relatorio_id === relatorioId)
    .map((r) => r.row)
    .filter((b) => b.block_type === type && b.location_id != null && ids.has(b.location_id))
    .sort((a, b) => ((a.order_key ?? '') < (b.order_key ?? '') ? -1 : 1));
  return blocks[0]!.id;
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

async function openGallery(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

/** One burst of `n` from an opener, concluded. */
async function burst(page: Page, opener: Locator, n: number): Promise<void> {
  await opener.click();
  const camera = await expectCameraOpen(page);
  await shoot(page, n);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
}

/** "Adicionar fotos" > "Escolher arquivos" > the system picker, as a person picks. */
async function pickFiles(page: Page, opener: Locator, files: FilePayload[]): Promise<void> {
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles(files);
}

const byCapture = (photos: PhotoRowRecord[]) =>
  [...photos].sort((a, b) => (a.captured_at === b.captured_at ? (a.local_seq === b.local_seq ? (a.id < b.id ? -1 : 1) : a.local_seq - b.local_seq) : Date.parse(a.captured_at) - Date.parse(b.captured_at)));

test('@p0 6.3-E2E-001 Sumário row 7 opens the gallery in capture order with numbers, stamps, captions and pills; the cabine filter; the viewer walks the order and Esc returns to the tile', async ({ page }) => {
  test.setTimeout(180_000);
  await holdUploads(page);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  // Two photos on the Cubículo Enel sheet: one on the NC row, one from the bar.
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await burst(page, row.getByRole('button', { name: 'Adicionar foto' }), 1);
  await burst(page, page.getByRole('button', { name: 'Tirar foto', exact: true }), 1);
  // The composer never opens by itself.
  await expect(page.locator('.caption-composer')).toHaveCount(0);

  // One on the Oxigênio sheet.
  const oxigenio = await blockIn(page, relatorioId, 'Oxigênio', 'chave_seccionadora');
  await openSheet(page, relatorioId, oxigenio);
  await burst(page, page.getByRole('button', { name: 'Tirar foto', exact: true }), 1);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);
  const photos = byCapture(await devicePhotos(page, database));

  // Sumário row 7 reads the count and opens the gallery.
  await page.goto(`/relatorio/${relatorioId}`);
  const row7 = page.locator('button.sum-open', { hasText: 'Registro fotográfico' });
  await expect(row7.locator('.sum-status')).toHaveText('3 fotos · 3 aguardando envio');
  await row7.click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/fotos$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Registro fotográfico (3)' })).toBeVisible();
  await expect(page.locator('.section-head .progress-counter')).toHaveText('3 fotos aguardando envio');

  const items = galleryItems(page);
  await expect(items).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const photo = photos[i]!;
    const item = items.nth(i);
    await expect(item).toHaveAttribute('data-photo-id', photo.id);
    await expect(item.locator('.number-badge')).toHaveText(String(i + 1));
    await expect(item.getByRole('button', { name: `Foto ${i + 1}, abrir` })).toBeVisible();
    await expect(item.locator('.photo-stamp')).toContainText(photoStampShort(photo.captured_at));
    await expect(item.locator('.photo-stamp .pin')).toHaveCount(1);
    await expect(item.locator('.photo-stamp')).toContainText('GPS');
    await expect(item.locator('.photo-meta')).toHaveText(photo.caption!);
    await expect(item.locator('.upload-pill')).toHaveText('Aguardando envio');
  }
  expect(photos.map((photo) => photo.caption)).toEqual([NC_CAPTION, SHEET_CAPTION, 'Detalhe da chave seccionadora SEC-OXIGENIO do Oxigênio']);

  // The cabine filter: "Todas" first, then the cabines in tree order.
  const filter = page.getByRole('radiogroup', { name: 'Filtrar por cabine' });
  await expect(filter.getByRole('radio')).toHaveText(['Todas', 'Cubículo Enel', 'Oxigênio']);
  await filter.getByRole('radio', { name: 'Cubículo Enel' }).click();
  await expect(items).toHaveCount(2);
  await expect(page.getByTestId('gallery-filter-status')).toHaveText('Mostrando 2 fotos do Cubículo Enel');
  await filter.getByRole('radio', { name: 'Oxigênio' }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first().locator('.number-badge')).toHaveText('3');
  await expect(page.getByTestId('gallery-filter-status')).toHaveText('Mostrando 1 foto do Oxigênio');
  await filter.getByRole('radio', { name: 'Todas' }).click();
  await expect(items).toHaveCount(3);
  await expect(page.getByTestId('gallery-filter-status')).toHaveText('Mostrando 3 fotos');

  // The viewer on the NC-row photo: count, full stamp, the item line, the caption.
  await tileOf(page, 1).click();
  let viewer = page.getByRole('dialog', { name: 'Foto 1 de 3' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.viewer-count')).toHaveText('1 de 3 · nº provisório');
  await expect(viewer.locator('.viewer-stamp')).toContainText(photoStampFull(photos[0]!));
  await expect(viewer.locator('.viewer-item')).toHaveText(/^Item \d+ · Contatos · NC$/);
  await expect(viewer.locator('.viewer-item .stamp-nc')).toHaveText('NC');
  await expect(viewer.getByText(NC_CAPTION)).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Anterior' })).toHaveAttribute('aria-disabled', 'true');

  // "Próxima" / "Anterior" walk the order.
  await viewer.getByRole('button', { name: 'Próxima' }).click();
  viewer = page.getByRole('dialog', { name: 'Foto 2 de 3' });
  await expect(viewer.locator('.viewer-count')).toHaveText('2 de 3 · nº provisório');
  await expect(viewer.locator('.viewer-item')).toHaveCount(0);
  await viewer.getByRole('button', { name: 'Próxima' }).click();
  viewer = page.getByRole('dialog', { name: 'Foto 3 de 3' });
  await expect(viewer.getByRole('button', { name: 'Próxima' })).toHaveAttribute('aria-disabled', 'true');
  await viewer.getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByRole('dialog', { name: 'Foto 2 de 3' })).toBeVisible();

  // Esc closes it and the focus goes back to the tile of the photo on screen.
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(tileOf(page, 2)).toBeFocused();
  expect(blockId).not.toBe(oxigenio);

  // "Editar legenda" in the viewer: a chip change, "Salvar legenda", the new caption shows.
  await tileOf(page, 2).click();
  viewer = page.getByRole('dialog', { name: 'Foto 2 de 3' });
  await viewer.getByRole('button', { name: 'Editar legenda' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  // 1280 px: the rows are Comboboxes.
  await composer.getByRole('combobox', { name: 'Atividade' }).fill('limpeza');
  await page.getByRole('option', { name: 'limpeza e reaperto' }).click();
  const edited = 'Detalhe da limpeza e reaperto realizada na chave seccionadora SEC-ENEL do Cubículo Enel';
  await expect(composer.locator('.caption-preview')).toHaveText(edited);
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Foto 2 de 3' }).getByText(edited)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(itemOf(page, photos[1]!.id).locator('.photo-meta')).toHaveText(edited);
});

test('@p1 6.4-E2E-006 with the camera denied, the NC row\'s "Adicionar fotos" saves a picked file on that row with its caption', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied, configurable: true });
  });
  const { blockId } = await openChaveSheet(page, account, database);
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await row.getByRole('button', { name: 'Adicionar foto' }).click();
  await expect(row.locator('.camera-denied')).toBeVisible();
  await pickFiles(page, row.getByRole('button', { name: 'Adicionar fotos' }), [await plainJpeg(page, 'nc.jpg')]);
  await expect(toast(page)).toContainText('1 foto adicionada — legenda aplicada');
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, item_key: 'contatos', caption: NC_CAPTION });
  await expect(row.locator('.photo-list .photo-row')).toHaveCount(1);
});

test('@p1 6.4-E2E-005 a JPEG dropped on the gallery opens straight on "De qual equipamento?" and saves on the chosen sheet', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  const file = await plainJpeg(page, 'na-galeria.jpg');
  const transfer = await page.evaluateHandle(
    ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type: 'image/jpeg' }));
      data.items.add(new File(['%PDF'], 'documento.pdf', { type: 'application/pdf' }));
      return data;
    },
    { name: file.name, base64: file.buffer.toString('base64') },
  );
  const zone = page.locator('.gallery-content');
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(page.locator('.drop-hint')).toHaveText('Solte para adicionar');
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  // The PDF is left out of the batch.
  await expect(sheet.locator('.field-label .capture-reason')).toHaveText('— vale para a foto');
  await sheet.getByRole('radio', { name: /· Chave seccionadora · Cubículo Enel$/ }).first().click();
  await sheet.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(toast(page)).toContainText('1 foto adicionada — legenda aplicada');
  await expect(galleryItems(page)).toHaveCount(1);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, caption: SHEET_CAPTION });
});

test('@p0 6.3/6.4-E2E-002 files added from a sheet save at once with its caption; "Remover" redraws the numbers and "Desfazer" brings the photo back, across a reload', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  // "Adicionar fotos" beside the camera: three files, saved at once with the sheet's caption.
  const add = page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' });
  await pickFiles(page, add, [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg'), await png(page, 'c.png')]);
  await expect(page.getByRole('dialog', { name: 'Adicionar fotos' })).toHaveCount(0);
  await expect(toast(page)).toContainText('3 fotos adicionadas — legenda aplicada');
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);
  for (const photo of await devicePhotos(page, database)) {
    expect(photo).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION, mime: 'image/jpeg', coords: null });
  }
  const photos = byCapture(await devicePhotos(page, database));

  await openGallery(page, relatorioId);
  await expect(galleryItems(page)).toHaveCount(3);

  // Remove photo 2 from its viewer, through the Confirm dialog.
  await tileOf(page, 2).click();
  const viewer = page.getByRole('dialog', { name: 'Foto 2 de 3' });
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Remover a foto 2 do relatório?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(toast(page)).toContainText('Foto 2 removida do relatório');
  await expect(galleryItems(page)).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2, name: 'Registro fotográfico (2)' })).toBeVisible();
  await expect(itemOf(page, photos[2]!.id).locator('.number-badge')).toHaveText('2');
  await expect(itemOf(page, photos[1]!.id)).toHaveCount(0);

  // "Desfazer": back, with its number.
  await toast(page).getByRole('button', { name: 'Desfazer' }).click();
  await expect(galleryItems(page)).toHaveCount(3);
  await expect(itemOf(page, photos[1]!.id).locator('.number-badge')).toHaveText('2');
  await expect(itemOf(page, photos[2]!.id).locator('.number-badge')).toHaveText('3');

  // A reload keeps it; a second removal is kept across a reload too.
  await page.reload();
  await expect(galleryItems(page)).toHaveCount(3);
  await tileOf(page, 3).click();
  await page.getByRole('dialog', { name: 'Foto 3 de 3' }).getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remover a foto 3 do relatório?' }).getByRole('button', { name: 'Remover foto' }).click();
  await expect(galleryItems(page)).toHaveCount(2);
  await page.reload();
  await expect(galleryItems(page)).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 2, name: 'Registro fotográfico (2)' })).toBeVisible();
  const kept = await devicePhotos(page, database);
  expect(kept.find((photo) => photo.id === photos[2]!.id)).toMatchObject({ removed_at: expect.any(String) });
});

test('@p0 6.4-E2E-003 the gallery asks "De qual equipamento?" once for a batch: both photos take its caption and sheet, the EXIF one sorts by its EXIF time with its position, and the numbers redraw', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await expect(page.getByText('Nenhuma foto. Tire fotos a partir da ficha do equipamento para já sair com legenda.')).toBeVisible();

  // A gallery shot is "Geral": no sheet, no caption.
  await burst(page, page.getByRole('button', { name: 'Tirar foto', exact: true }), 1);
  await expect(galleryItems(page)).toHaveCount(1);
  const [geral] = await devicePhotos(page, database);
  expect(geral).toMatchObject({ block_id: null, item_key: null, caption: null });
  await expect(itemOf(page, geral!.id).locator('.number-badge')).toHaveText('1');

  // Two files, the one without EXIF first; the EXIF one was taken on 06/09 at 08:12 (-03:00).
  const add = page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' });
  const exif = await exifJpeg(page, { dateTimeOriginal: '2026:09:06 08:12:30', offset: '-03:00', lat: -23.5505, lng: -46.6333 });
  await pickFiles(page, add, [await plainJpeg(page), exif]);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.field-label .capture-reason')).toHaveText('— vale para as 2 fotos');
  await sheet.getByRole('radio', { name: /· Chave seccionadora · Cubículo Enel$/ }).first().click();
  const field = sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' });
  await expect(field).toHaveValue(SHEET_CAPTION);
  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(toast(page)).toContainText('2 fotos adicionadas — legenda aplicada');

  await expect(galleryItems(page)).toHaveCount(3);
  const all = await devicePhotos(page, database);
  const imported = all.filter((photo) => photo.id !== geral!.id);
  expect(imported).toHaveLength(2);
  for (const photo of imported) expect(photo).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });
  const fromExif = imported.find((photo) => photo.captured_at === '2026-09-06T11:12:30.000Z')!;
  expect(fromExif.coords).toMatchObject({ source: 'exif', accuracy_m: null });
  expect(fromExif.coords!.lat).toBeCloseTo(-23.5505, 4);
  expect(fromExif.coords!.lng).toBeCloseTo(-46.6333, 4);
  const plain = imported.find((photo) => photo.id !== fromExif.id)!;
  expect(plain.coords).toBeNull();

  // The EXIF photo takes number 1; the gallery shot moves to 2.
  await expect(itemOf(page, fromExif.id).locator('.number-badge')).toHaveText('1');
  await expect(itemOf(page, fromExif.id).locator('.photo-stamp')).toContainText('06/09 08:12');
  await expect(itemOf(page, fromExif.id).locator('.photo-stamp .pin')).toHaveCount(1);
  await expect(itemOf(page, geral!.id).locator('.number-badge')).toHaveText('2');
  await expect(itemOf(page, plain.id).locator('.number-badge')).toHaveText('3');
  await expect(itemOf(page, plain.id).locator('.photo-stamp .pin')).toHaveCount(0);
});

test('@p1 6.4-E2E-004 files dropped on a sheet show "Solte para adicionar" while dragged, then save at once with the sheet caption', async ({ page }) => {
  test.setTimeout(120_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const file = await plainJpeg(page, 'solta.jpg');
  const transfer = await page.evaluateHandle(
    ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type: 'image/jpeg' }));
      return data;
    },
    { name: file.name, base64: file.buffer.toString('base64') },
  );
  const zone = page.locator('.ficha-main');
  await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
  await expect(zone).toHaveAttribute('data-dropping', '');
  await expect(page.locator('.drop-hint')).toHaveText('Solte para adicionar');
  await zone.dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.locator('.drop-hint')).toHaveCount(0);
  await expect(toast(page)).toContainText('1 foto adicionada — legenda aplicada');
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });

  // At 390 px the bar keeps the camera, "Adicionar fotos" (its glyph, its name) and the primary without running wider than the phone.
  await page.setViewportSize({ width: 390, height: 844 });
  const bar = page.locator('.sticky-action-bar');
  await expect(bar.getByRole('button', { name: 'Adicionar fotos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const barBox = (await bar.boundingBox())!;
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(390);
});

test('@p0 6.5-E2E-001 "Legendar" on a sheet tile: prefilled chips, agreement on a chip change, "Outro…", "Editar texto" stops regenerating, one caption op; the gallery shows it after a reload, and back', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 1024 });
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await burst(page, row.getByRole('button', { name: 'Adicionar foto' }), 1);
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  const [photo] = await devicePhotos(page, database);

  const tile = row.locator('.photo-list .photo-row').first();
  await tile.getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await expect(composer).toBeVisible();
  const group = (name: string) => composer.getByRole('group', { name });
  await expect(group('Atividade').getByRole('button', { name: 'verificação de contatos' })).toHaveAttribute('aria-pressed', 'true');
  await expect(group('Equipamento').getByRole('button', { name: 'chave seccionadora SEC-ENEL', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(group('Local').getByRole('button', { name: 'Cubículo Enel' })).toHaveAttribute('aria-pressed', 'true');
  const preview = composer.locator('.caption-preview');
  await expect(preview).toHaveText(NC_CAPTION);

  // A chip change rebuilds the preview with agreement (feminine singular "realizada").
  await group('Atividade').getByRole('button', { name: 'limpeza e reaperto' }).click();
  await expect(preview).toHaveText('Detalhe da limpeza e reaperto realizada na chave seccionadora SEC-ENEL do Cubículo Enel');
  await group('Atividade').getByRole('button', { name: 'ensaios de resistência de isolação' }).click();
  await expect(preview).toHaveText('Detalhe dos ensaios de resistência de isolação realizados na chave seccionadora SEC-ENEL do Cubículo Enel');

  // "Outro…" takes a typed word (masculine singular when nothing knows it).
  await group('Local').getByRole('button', { name: 'Outro…' }).click();
  await composer.getByRole('textbox', { name: 'Outro local' }).fill('Pátio de manobra');
  await expect(preview).toHaveText('Detalhe dos ensaios de resistência de isolação realizados na chave seccionadora SEC-ENEL do Pátio de manobra');

  // "Editar texto": free text that no chip regenerates.
  const edit = composer.getByRole('button', { name: 'Editar texto' });
  await edit.click();
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  const text = composer.getByRole('textbox', { name: 'Texto da legenda' });
  await expect(text).toHaveValue('Detalhe dos ensaios de resistência de isolação realizados na chave seccionadora SEC-ENEL do Pátio de manobra');
  const typed = 'Detalhe dos ensaios de resistência de isolação, com a equipe da concessionária';
  await text.fill(typed);
  // E6-R2: while "Editar texto" is on the chips are shown inactive, with a note saying why;
  // pressing one (from the keyboard: Playwright never clicks an `aria-disabled` control) changes nothing.
  const chip = group('Atividade').getByRole('button', { name: 'limpeza e reaperto' });
  await expect(chip).toHaveAttribute('aria-disabled', 'true');
  await expect(composer.getByText('Texto editado à mão. Desligue Editar texto para montar pelas opções.')).toBeVisible();
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(text).toHaveValue(typed);
  await expect(composer.locator('.chip[aria-pressed="true"]')).toHaveCount(0);

  const before = (await readStore<{ path: string }>(page, database, 'outbox')).filter((op) => op.path === `file/${photo!.id}/caption`).length;
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  await expect(tile.locator('.photo-meta')).toHaveText(typed);
  const captionOps = (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).filter((op) => op.path === `file/${photo!.id}/caption`);
  expect(captionOps).toHaveLength(before + 1);
  expect(captionOps.at(-1)!.value).toBe(typed);
  // The composer writes the caption only: the sheet and the item stay.
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, item_key: 'contatos', caption: typed });

  // The gallery shows the same caption after a reload.
  await openGallery(page, relatorioId);
  await page.reload();
  await expect(itemOf(page, photo!.id).locator('.photo-meta')).toHaveText(typed);

  // And back: a change from the gallery reaches the sheet. The stored text is not what the
  // chips compose, so the composer opens in "Editar texto".
  await itemOf(page, photo!.id).getByRole('button', { name: 'Legendar' }).click();
  const again = page.getByRole('dialog', { name: 'Legenda' });
  await expect(again.getByRole('button', { name: 'Editar texto' })).toHaveAttribute('aria-pressed', 'true');
  await again.getByRole('textbox', { name: 'Texto da legenda' }).fill('Detalhe dos contatos após a limpeza');
  await again.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(itemOf(page, photo!.id).locator('.photo-meta')).toHaveText('Detalhe dos contatos após a limpeza');
  await openSheet(page, relatorioId, blockId);
  await page.reload();
  await expect(contatos(page).locator('.photo-list .photo-row').first().locator('.photo-meta')).toHaveText('Detalhe dos contatos após a limpeza');
});

test('@p1 6.5-E2E-002 on a desktop the composer rows are Comboboxes; Sumário row 7 names the uncaptioned and the unsent photos', async ({ page }) => {
  test.setTimeout(150_000);
  await holdUploads(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await burst(page, page.getByRole('button', { name: 'Tirar foto', exact: true }), 2);
  await expect(galleryItems(page)).toHaveCount(2);
  await expect(page.locator('.section-head .progress-counter')).toHaveText('2 fotos aguardando envio · 2 sem legenda');

  await page.goto(`/relatorio/${relatorioId}`);
  const row7 = page.locator('button.sum-open', { hasText: 'Registro fotográfico' });
  await expect(row7.locator('.sum-status')).toHaveText('2 fotos · 2 sem legenda · 2 aguardando envio');
  await expect(page.locator('li.sum-row[data-row="section_7"]')).toHaveClass(/has-pend/);
  await row7.click();

  const [first] = await devicePhotos(page, database);
  await itemOf(page, first!.id).getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await expect(composer.getByRole('group', { name: 'Atividade' })).toBeHidden();
  const atividade = composer.getByRole('combobox', { name: 'Atividade' });
  await atividade.fill('limpeza');
  await page.getByRole('option', { name: 'limpeza e reaperto' }).click();
  await composer.getByRole('combobox', { name: 'Local' }).fill('Oxigênio');
  await page.getByRole('option', { name: 'Oxigênio', exact: true }).click();
  await expect(composer.locator('.caption-preview')).toHaveText('Detalhe da limpeza e reaperto realizada no Oxigênio');
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(itemOf(page, first!.id).locator('.photo-meta')).toHaveText('Detalhe da limpeza e reaperto realizada no Oxigênio');
  await expect(page.locator('.section-head .progress-counter')).toHaveText('2 fotos aguardando envio · 1 sem legenda');

  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.locator('button.sum-open', { hasText: 'Registro fotográfico' }).locator('.sum-status')).toHaveText('2 fotos · 1 sem legenda · 2 aguardando envio');
});

// --- Epic 6 review fixes (E6-Q3, E6-Q4, E6-Q8, E6-Q13) -----------------------------------------

interface OutboxOp {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

/** The sheet's option in "De qual equipamento?": "SEC-ENEL · Chave seccionadora · Cubículo Enel". */
const SEC_ENEL_OPTION = /^SEC-ENEL · Chave seccionadora · Cubículo Enel$/;

test('@p0 6.4-E2E-007 E6-Q4 and E6-Q8 at 390 px: the batch is saved as "Geral" when picked; "De qual equipamento?" puts the current sheet first and "Geral" in view; "Adicionar N fotos" is one batch of puts', async ({ page }) => {
  test.setTimeout(180_000);
  // The sheet opened here is this device's last sheet: the current one.
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 390 });
  await openGallery(page, relatorioId);
  await page.setViewportSize({ width: 390, height: 844 });
  await pickFiles(page, page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }), [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();

  // Saved at once, as "Geral" with no caption, before the question is answered.
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  for (const photo of await devicePhotos(page, database)) expect(photo).toMatchObject({ block_id: null, caption: null });

  // The short list: the current sheet first; "Outro equipamento"; "Geral" on screen without a scroll.
  const list = sheet.getByRole('radiogroup', { name: 'Equipamentos do relatório' });
  await expect(list.getByRole('radio').first()).toHaveAccessibleName(SEC_ENEL_OPTION);
  const geral = list.getByRole('radio', { name: 'Geral (sem equipamento)' });
  await expect(geral).toBeInViewport();
  expect(await list.getByRole('radio').count()).toBeLessThanOrEqual(6);
  // "Outro equipamento": the whole relatório grouped as the tree, "Geral" still in view.
  await sheet.getByRole('button', { name: 'Outro equipamento' }).click();
  await expect(list.getByRole('group', { name: 'Cubículo Enel' })).toBeVisible();
  await expect(list.getByRole('group', { name: /^Oxigênio/ }).first()).toBeAttached();
  await expect(geral).toBeInViewport();
  await list.getByRole('group', { name: 'Cubículo Enel' }).getByRole('radio', { name: SEC_ENEL_OPTION }).click();
  await expect(sheet.getByRole('textbox', { name: 'Legenda das 2 fotos' })).toHaveValue(SHEET_CAPTION);
  await sheet.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(toast(page)).toContainText('2 fotos adicionadas — legenda aplicada');

  const photos = await devicePhotos(page, database);
  for (const photo of photos) expect(photo).toMatchObject({ block_id: blockId, caption: SHEET_CAPTION });
  const puts = (await readStore<OutboxOp>(page, database, 'outbox')).filter((op) => op.kind === 'put' && /^file\/[^/]+\/(block_id|caption)$/.test(op.path));
  expect(puts.map((op) => op.path).sort()).toEqual(photos.flatMap((photo) => [`file/${photo.id}/block_id`, `file/${photo.id}/caption`]).sort());
  expect(new Set(puts.map((op) => op.batch_id)).size).toBe(1);
});

test('@p0 6.4-E2E-008 E6-Q8: "Cancelar" on "De qual equipamento?" keeps the saved batch as "Geral", and the toast says so', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await pickFiles(page, page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }), [await plainJpeg(page, 'a.jpg'), await png(page, 'b.png'), await plainJpeg(page, 'c.jpg')]);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(toast(page)).toContainText('3 fotos ficaram como Geral, sem legenda');
  await expect(galleryItems(page)).toHaveCount(3);
  for (const photo of await devicePhotos(page, database)) expect(photo).toMatchObject({ block_id: null, item_key: null, caption: null });
  const puts = (await readStore<OutboxOp>(page, database, 'outbox')).filter((op) => op.kind === 'put' && op.path.startsWith('file/'));
  expect(puts).toHaveLength(0);
});

test('@p1 6.4-E2E-010 E6-Q8: Esc on "De qual equipamento?" keeps the saved batch as "Geral", as "Cancelar" does', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await pickFiles(page, page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }), [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  const sheet = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(toast(page)).toContainText('2 fotos ficaram como Geral, sem legenda');
  await expect(galleryItems(page)).toHaveCount(2);
  for (const photo of await devicePhotos(page, database)) expect(photo).toMatchObject({ block_id: null, item_key: null, caption: null });
});

test('@p0 6.5-E2E-003 E6-Q3 at 390 px: the composer shows the photo on top, and after a chip tap the caption and "Salvar legenda" are both on screen', async ({ page }) => {
  test.setTimeout(150_000);
  await holdUploads(page);
  const { relatorioId } = await openChaveSheet(page, account, database, { width: 390 });
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await burst(page, row.getByRole('button', { name: 'Adicionar foto' }), 1);
  const [photo] = await devicePhotos(page, database);
  await openGallery(page, relatorioId);
  await page.setViewportSize({ width: 390, height: 844 });
  await itemOf(page, photo!.id).getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await expect(composer).toBeVisible();
  // `71-legenda.html`: the photo with its number badge and line.
  await expect(composer.getByRole('img', { name: 'Foto 1' })).toBeVisible();
  await expect(composer.locator('.capture-preview .number-badge')).toHaveText('1');
  await expect(composer.locator('.capture-meta')).toContainText('Nº provisório 1');
  const save = composer.getByRole('button', { name: 'Salvar legenda' });
  const preview = composer.locator('.caption-preview');
  await expect(save).toBeInViewport();

  // A chip of the last row, far down the list: its effect and "Salvar legenda" stay in view.
  const local = composer.getByRole('group', { name: 'Local' });
  const oxigenio = local.getByRole('button', { name: 'Oxigênio', exact: true });
  await oxigenio.scrollIntoViewIfNeeded();
  await oxigenio.click();
  await expect(preview).toHaveText('Detalhe da verificação de contatos realizada na chave seccionadora SEC-ENEL do Oxigênio');
  await expect(preview).toBeInViewport();
  await expect(save).toBeInViewport();
  await save.click();
  await expect(itemOf(page, photo!.id).locator('.photo-meta')).toHaveText('Detalhe da verificação de contatos realizada na chave seccionadora SEC-ENEL do Oxigênio');
});

test('@p1 6.4-E2E-009 E6-Q13: "ou arraste para cá" is said on a computer, never on a phone', async ({ page }) => {
  test.setTimeout(120_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  const reason = page.locator('.sticky-action-bar').getByText('ou arraste para cá');
  await expect(reason).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reason).toBeHidden();
  await expect(page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' })).toBeVisible();
});

test('@p1 6.3-E2E-008 the viewer shows the original this device holds, and the server\'s print copy of a photo whose original it does not', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied, configurable: true });
  });
  const { relatorioId } = await openChaveSheet(page, account, database);
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await row.getByRole('button', { name: 'Adicionar foto' }).click();
  await expect(row.locator('.camera-denied')).toBeVisible();
  // Larger than the print copy's 2000 px bound and under the device's 2560 px original bound.
  const big = async (name: string): Promise<FilePayload> => ({ name, mimeType: 'image/jpeg', buffer: await jpegFromPage(page, 2400, 1600) });
  await pickFiles(page, row.getByRole('button', { name: 'Adicionar fotos' }), [await big('local.jpg'), await big('servidor.jpg')]);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);

  // Both uploaded and rendered by the server, as this device learns on a sync.
  await expect
    .poll(
      async () => {
        await syncNow(page);
        return (await devicePhotos(page, database)).filter((photo) => photo.uploaded_at !== null && photo.variants !== null).length;
      },
      { timeout: 120_000, intervals: [1_000] },
    )
    .toBe(2);
  const [local, remote] = byCapture(await devicePhotos(page, database));

  // The second photo's original leaves this device, as an eviction takes it; its thumb stays.
  await page.evaluate(
    async ([name, id]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = open.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id!);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      open.close();
    },
    [database, remote!.id],
  );

  // What a person sees: the picture's own pixel size, the original's or the print copy's.
  const picture = page.locator('.photo-viewer img.viewer-img');
  const size = () => picture.evaluate((img: HTMLImageElement) => (img.complete ? `${img.naturalWidth}x${img.naturalHeight}` : 'loading'));
  await openGallery(page, relatorioId);
  await itemOf(page, local!.id).getByRole('button', { name: /^Foto \d+, abrir$/ }).click();
  await expect.poll(size, { timeout: 30_000 }).toBe('2400x1600');
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);

  await itemOf(page, remote!.id).getByRole('button', { name: /^Foto \d+, abrir$/ }).click();
  await expect.poll(size, { timeout: 30_000 }).toBe('2000x1333');
});

test('@p1 6.5-E2E-004 E6-R2: a caption typed by hand opens in "Editar texto" with inactive chips and a note; a chip tap changes nothing stored', async ({ page }) => {
  test.setTimeout(180_000);
  await openChaveSheet(page, account, database, { width: 1024 });
  const row = contatos(page);
  await row.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await burst(page, row.getByRole('button', { name: 'Adicionar foto' }), 1);
  const [photo] = await devicePhotos(page, database);
  const tile = row.locator('.photo-list .photo-row').first();
  const composer = page.getByRole('dialog', { name: 'Legenda' });

  // A caption the rows do not compose, typed and saved.
  const typed = 'Contato com marcas de arco, fotografado antes da limpeza';
  await tile.getByRole('button', { name: 'Legendar' }).click();
  await composer.getByRole('button', { name: 'Editar texto' }).click();
  await composer.getByRole('textbox', { name: 'Texto da legenda' }).fill(typed);
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).find((p) => p.id === photo!.id)?.caption).toBe(typed);

  // Reopened: free text, every chip inactive and none pressed, the note says why.
  await tile.getByRole('button', { name: /^(Legendar|Editar legenda)$/ }).click();
  await expect(composer.getByRole('button', { name: 'Editar texto' })).toHaveAttribute('aria-pressed', 'true');
  await expect(composer.getByText('Texto editado à mão. Desligue Editar texto para montar pelas opções.')).toBeVisible();
  const chips = composer.locator('.caption-part .chip-row .chip');
  expect(await chips.count()).toBeGreaterThan(0);
  for (const chip of await chips.all()) {
    await expect(chip).toHaveAttribute('aria-disabled', 'true');
    await expect(chip).not.toHaveAttribute('aria-pressed', 'true');
  }
  // Below 1280 px the chips are the rows; pressing one (from the keyboard: Playwright never
  // clicks an `aria-disabled` control) changes neither the text nor, once saved, the stored caption.
  await composer.getByRole('group', { name: 'Atividade' }).getByRole('button', { name: 'limpeza e reaperto' }).focus();
  await page.keyboard.press('Enter');
  await expect(composer.getByRole('textbox', { name: 'Texto da legenda' })).toHaveValue(typed);
  await expect(composer.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(page.locator('.caption-composer')).toHaveCount(0);
  expect((await devicePhotos(page, database)).find((p) => p.id === photo!.id)?.caption).toBe(typed);
});
