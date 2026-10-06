import type { Locator, Page } from '@playwright/test';
import { plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot, type PhotoRowRecord } from './support/photos.ts';

/*
 * 11.11-E2E: "Fotos da ficha" and the one-tap picker, driven as a person would. A sheet's
 * photos (the plate photo, the bursts, the imports) show at its end as Photo tiles in capture
 * order, numbered as the gallery numbers them, and a tap opens the Photo viewer on that
 * photo. "Adicionar fotos" opens the system picker with no dialog before it, then "De qual
 * equipamento?" with the sheet chosen (nothing chosen from the gallery). Only a denied camera
 * opens the Photo capture sheet, where "Escolher arquivos" is a 56 px Button and "Tirar foto"
 * is disabled with the reason, both reached by Tab. Chromium's fake camera stands in for the
 * tablet's; the files are drawn in the page (`e2e/fixtures/photos/synthetic.ts`).
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const SHEET_CAPTION = 'Detalhe da chave seccionadora SEC-ENEL do Cubículo Enel';
const PLATE_CAPTION = 'placa de identificação';
const DENIED = 'A câmera está bloqueada para este site. Para liberar: Configurações do navegador › Permissões do site › Câmera.';
const SEC_ENEL_OPTION = /^SEC-ENEL · Chave seccionadora · Cubículo Enel$/;

const toast = (page: Page) => page.getByTestId('toast');
const strip = (page: Page) => page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
const stripRows = (page: Page) => strip(page).locator('.photo-list > .photo-row');
const addPhotos = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' });
const which = (page: Page) => page.getByRole('dialog', { name: /^De qual equipamento\?/ });
const galleryItem = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);

const byCapture = (photos: PhotoRowRecord[]) =>
  [...photos].sort((a, b) => (a.captured_at === b.captured_at ? (a.local_seq === b.local_seq ? (a.id < b.id ? -1 : 1) : a.local_seq - b.local_seq) : Date.parse(a.captured_at) - Date.parse(b.captured_at)));

async function openGallery(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

async function openSheet(page: Page, relatorioId: string, blockId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

/**
 * "Adicionar fotos" as a person taps it: the system picker is the first thing that opens
 * (no dialog when it fires), and the files are picked in it.
 */
async function pickDirect(page: Page, opener: Locator, files: FilePayload[]): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await opener.click();
  const picker = await chooser;
  expect(picker.isMultiple()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await picker.setFiles(files);
}

/** "De qual equipamento?" from this sheet: SEC-ENEL chosen, the context caption in the field; "Adicionar N" saves. */
async function addOnSheet(page: Page, n: number): Promise<void> {
  const dialog = which(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: SEC_ENEL_OPTION })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('textbox', { name: n === 1 ? 'Legenda da foto' : `Legenda das ${n} fotos` })).toHaveValue(SHEET_CAPTION);
  await dialog.getByRole('button', { name: n === 1 ? 'Adicionar 1 foto' : `Adicionar ${n} fotos` }).click();
  await expect(dialog).toHaveCount(0);
  await expect(toast(page)).toContainText(n === 1 ? '1 foto adicionada — legenda aplicada' : `${n} fotos adicionadas — legenda aplicada`, { timeout: 20_000 });
}

/** "Fotografar placa", one shutter: the camera closes by itself once the shot is stored. */
async function shootPlate(page: Page, before: number): Promise<void> {
  await page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(before + 1);
}

/** The camera refused: `getUserMedia` rejects as a browser whose camera permission is blocked. */
async function denyCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied, configurable: true });
  });
}

test('@p0 11.11-E2E-001 a sheet lists its plate photo and two imported photos as "Fotos da ficha (3)" in capture order with the gallery\'s numbers; a tap opens the viewer on that photo; the strip survives a reload', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  // No photo yet: no strip at all.
  await expect(page.locator('.sheet-photos')).toHaveCount(0);

  // A "Geral" shot from the gallery first, so the sheet's numbers are the relatório's, not 1..3.
  await openGallery(page, relatorioId);
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);

  // The plate photo, then two files through "Adicionar fotos" (the picker at once).
  await openSheet(page, relatorioId, blockId);
  await shootPlate(page, 1);
  await pickDirect(page, addPhotos(page), [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  await addOnSheet(page, 2);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(4);
  const all = byCapture(await devicePhotos(page, database));
  const sheet = all.filter((photo) => photo.block_id === blockId);
  expect(sheet).toHaveLength(3);
  expect(sheet[0]!.caption).toBe(PLATE_CAPTION);
  for (const photo of sheet.slice(1)) expect(photo).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });

  // The strip, after Conclusão: three rows in capture order, numbered 2, 3, 4.
  await expect(strip(page)).toHaveAccessibleName('Fotos da ficha (3)');
  await expect(strip(page).getByRole('heading', { level: 2 })).toHaveText('Fotos da ficha (3)');
  await expect(page.locator('#ficha-step-conclusao + section.sheet-photos')).toHaveCount(1);
  await expect(stripRows(page)).toHaveCount(3);
  await expect(stripRows(page).locator('.number-badge')).toHaveText(['2', '3', '4']);
  await expect(stripRows(page).locator('.photo-meta')).toHaveText([PLATE_CAPTION, SHEET_CAPTION, SHEET_CAPTION]);
  await expect(stripRows(page).locator('.photo-stamp')).toHaveCount(3);
  // No "Legendar" and no second "Adicionar fotos" in the strip.
  await expect(strip(page).getByRole('button', { name: 'Legendar' })).toHaveCount(0);
  await expect(strip(page).getByRole('button', { name: 'Adicionar fotos' })).toHaveCount(0);

  // Tap the second: the viewer opens on it, and walks the relatório's photos.
  const second = strip(page).getByRole('button', { name: 'Foto 3, abrir', exact: true });
  await second.click();
  const viewer = page.getByRole('dialog', { name: 'Foto 3 de 4' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(SHEET_CAPTION)).toBeVisible();
  await viewer.getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByRole('dialog', { name: 'Foto 2 de 4' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Foto 2 de 4' }).getByRole('button', { name: 'Próxima' }).click();
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(second).toBeFocused();

  // The gallery numbers the same photos the same way.
  await openGallery(page, relatorioId);
  for (const [i, photo] of sheet.entries()) await expect(galleryItem(page, photo.id).locator('.number-badge')).toHaveText(String(i + 2));
  await expect(galleryItem(page, all[0]!.id).locator('.number-badge')).toHaveText('1');

  // Back on the sheet and across a reload, the strip is the same.
  await openSheet(page, relatorioId, blockId);
  await page.reload();
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(stripRows(page).locator('.number-badge')).toHaveText(['2', '3', '4']);
});

test('@p0 11.11-E2E-002 "Adicionar fotos" on a sheet opens the picker with no dialog before it; a picker answered with no file does nothing; picked files are saved on the sheet at once, then "De qual equipamento?" with this sheet chosen; they show in the strip and the gallery', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  // A picker closed with nothing picked: Playwright can drive only the empty `change` it
  // leaves; after a settle, no dialog, no toast, no photo.
  await pickDirect(page, addPhotos(page), []);
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(toast(page)).toHaveCount(0);
  expect(await devicePhotos(page, database)).toEqual([]);

  await pickDirect(page, addPhotos(page), [await plainJpeg(page, 'a.jpg')]);
  // Saved on the sheet with its context caption before the step is answered (6.3/6.4).
  await expect(which(page)).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });
  await addOnSheet(page, 1);
  await expect(stripRows(page)).toHaveCount(1);
  await expect(strip(page)).toHaveAccessibleName('Fotos da ficha (1)');
  const [photo] = await devicePhotos(page, database);
  expect(photo).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });

  await openGallery(page, relatorioId);
  await expect(galleryItem(page, photo!.id).locator('.photo-meta')).toHaveText(SHEET_CAPTION);
});

test('@p0 11.11-E2E-003 from the gallery, the picker opens directly and "De qual equipamento?" has nothing chosen', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await pickDirect(page, addPhotos(page), [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  const dialog = which(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Adicionar 2 fotos' })).toHaveCount(0);
  // The batch is saved as "Geral" at once (E6-Q8), and "Cancelar" leaves it so.
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(toast(page)).toContainText('2 fotos ficaram como Geral, sem legenda');
});

test('@p0 11.11-E2E-004 with the camera denied, "Adicionar fotos" opens the capture sheet: Tab reaches "Escolher arquivos" (56 px) and the disabled "Tirar foto" with the reason; Escape and "Cancelar" close it; "Escolher arquivos" opens the picker', async ({ page }) => {
  test.setTimeout(150_000);
  await denyCamera(page);
  const { blockId } = await openChaveSheet(page, account, database);
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  await expect(page.locator('.sticky-action-bar .camera-denied')).toHaveText(DENIED);

  // Escape closes it.
  await addPhotos(page).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // "Cancelar" closes it.
  await addPhotos(page).click();
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet).toHaveCount(0);

  // Keyboard only: Tab to "Escolher arquivos", then to "Tirar foto".
  await addPhotos(page).focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeVisible();
  const choose = sheet.getByRole('button', { name: 'Escolher arquivos' });
  const take = sheet.getByRole('button', { name: 'Tirar foto' });
  for (let i = 0; i < 6 && !(await choose.evaluate((element) => element === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(choose).toBeFocused();
  expect(Math.round((await choose.boundingBox())!.height)).toBe(56);
  await expect(choose).toHaveClass(/\bbtn-secondary\b/);
  await page.keyboard.press('Tab');
  await expect(take).toBeFocused();
  await expect(take).toHaveAttribute('aria-disabled', 'true');
  await expect(take).toHaveAccessibleDescription(DENIED);
  expect(Math.round((await take.boundingBox())!.height)).toBe(56);
  const reason = sheet.locator('.capture-reason');
  await expect(reason).toHaveText(DENIED);
  expect((await reason.boundingBox())!.y).toBeGreaterThan((await take.boundingBox())!.y);
  // The disabled one does nothing.
  await page.keyboard.press('Enter');
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);

  // "Escolher arquivos" by keyboard opens the picker; the step follows with this sheet chosen.
  await page.keyboard.press('Shift+Tab');
  await expect(choose).toBeFocused();
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles([await plainJpeg(page, 'a.jpg')]);
  await addOnSheet(page, 1);
  await expect(stripRows(page)).toHaveCount(1);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, caption: SHEET_CAPTION });
});

for (const width of [768, 390]) {
  test(`@p1 11.11-E2E-005 at ${width} px: a photo added from a sheet with "Adicionar fotos" shows in its strip and in section 7, with nothing wider than the screen`, async ({ page }) => {
    test.setTimeout(180_000);
    const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width });
    await pickDirect(page, addPhotos(page), [await plainJpeg(page, 'a.jpg')]);
    await expect(which(page)).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // At 390 px the step scrolls inside the sheet (`.photo-capture-sheet` max-height 90dvh): a person scrolls to it.
    const add = which(page).getByRole('button', { name: 'Adicionar 1 foto' });
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    await addOnSheet(page, 1);
    const tile = strip(page).getByRole('button', { name: 'Foto 1, abrir', exact: true });
    await tile.scrollIntoViewIfNeeded();
    await expect(tile).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await tile.click();
    await expect(page.getByRole('dialog', { name: 'Foto 1 de 1' })).toBeVisible();
    await page.keyboard.press('Escape');

    const [photo] = await devicePhotos(page, database);
    expect(photo).toMatchObject({ block_id: blockId, caption: SHEET_CAPTION });
    await openGallery(page, relatorioId);
    await expect(page.getByRole('heading', { level: 2, name: 'Registro fotográfico (1)' })).toBeVisible();
    await expect(galleryItem(page, photo!.id).locator('.number-badge')).toHaveText('1');
  });

  test(`@p1 11.11-E2E-006 at ${width} px: the denied capture sheet draws both 56 px Buttons and the reason inside the screen`, async ({ page }) => {
    test.setTimeout(150_000);
    await denyCamera(page);
    await openChaveSheet(page, account, database, { width });
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
    await expect(page.locator('.sticky-action-bar .camera-denied')).toBeVisible();
    await addPhotos(page).click();
    const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
    await expect(sheet).toBeVisible();
    for (const button of [sheet.getByRole('button', { name: 'Escolher arquivos' }), sheet.getByRole('button', { name: 'Tirar foto' })]) {
      await expect(button).toBeInViewport();
      const box = (await button.boundingBox())!;
      expect(Math.round(box.height)).toBe(56);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await expect(sheet.locator('.capture-reason')).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
}

/** Picks `files` from the sheet's "Adicionar fotos" and waits until the batch is saved, the step still open. */
async function pickSaved(page: Page, files: FilePayload[], saved: number): Promise<Locator> {
  await pickDirect(page, addPhotos(page), files);
  const dialog = which(page);
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(saved);
  return dialog;
}

for (const how of ['Cancelar', 'Escape'] as const) {
  test(`@p0 11.11-E2E-007 ${how} on a sheet's "De qual equipamento?" keeps the saved photos on the sheet with the context caption, and the toast says so`, async ({ page }) => {
    test.setTimeout(150_000);
    const { blockId } = await openChaveSheet(page, account, database);
    const dialog = await pickSaved(page, [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')], 2);
    if (how === 'Cancelar') await dialog.getByRole('button', { name: 'Cancelar' }).click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(toast(page)).toContainText('2 fotos ficaram nesta ficha, com a legenda do contexto');
    for (const photo of await devicePhotos(page, database)) expect(photo).toMatchObject({ block_id: blockId, item_key: null, caption: SHEET_CAPTION });
    await expect(strip(page)).toHaveAccessibleName('Fotos da ficha (2)');
  });
}

test('@p0 11.11-E2E-008 from a sheet the step re-points the saved batch: "Geral" leaves the sheet, another sheet takes it, "Pessoas na foto" marks it', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  // "Geral": no sheet, no item, the caption cleared; the strip stays empty.
  let dialog = await pickSaved(page, [await plainJpeg(page, 'geral.jpg')], 1);
  await dialog.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Legenda da foto' })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).map((photo) => photo.block_id), { timeout: 15_000 }).toEqual([null]);
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: null, item_key: null, caption: null });
  await expect(page.locator('.sheet-photos')).toHaveCount(0);

  // Another sheet: its block, no item, its context caption; it shows in that sheet's strip.
  dialog = await pickSaved(page, [await plainJpeg(page, 'outra.jpg')], 2);
  const other = dialog.getByRole('radio').nth(1);
  const otherName = (await other.textContent()) ?? '';
  expect(otherName).not.toMatch(SEC_ENEL_OPTION);
  expect(otherName).not.toBe('Geral (sem equipamento)');
  await other.click();
  const otherCaption = await dialog.getByRole('textbox', { name: 'Legenda da foto' }).inputValue();
  expect(otherCaption).not.toBe(SHEET_CAPTION);
  await dialog.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(dialog).toHaveCount(0);
  const moved = async () => (await devicePhotos(page, database)).find((photo) => photo.block_id !== null && photo.block_id !== blockId) ?? null;
  await expect.poll(moved, { timeout: 15_000 }).not.toBeNull();
  const movedPhoto = (await moved())!;
  expect(movedPhoto).toMatchObject({ item_key: null, caption: otherCaption === '' ? null : otherCaption });
  await expect(page.locator('.sheet-photos')).toHaveCount(0);
  await openSheet(page, relatorioId, movedPhoto.block_id!);
  await expect(stripRows(page)).toHaveCount(1);

  // "Pessoas na foto" from a sheet: the mark on the saved photo, the sheet kept.
  await openSheet(page, relatorioId, blockId);
  dialog = await pickSaved(page, [await plainJpeg(page, 'pessoas.jpg')], 3);
  await expect(dialog.getByRole('radio', { name: SEC_ENEL_OPTION })).toHaveAttribute('aria-checked', 'true');
  const chip = dialog.getByRole('button', { name: 'Pessoas na foto' });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(dialog).toHaveCount(0);
  type Marked = PhotoRowRecord & { people_in_photo?: boolean };
  const onSheet = async () => (await devicePhotos(page, database)).find((photo) => photo.block_id === blockId) as Marked | undefined;
  await expect.poll(async () => (await onSheet())?.people_in_photo ?? false, { timeout: 15_000 }).toBe(true);
  expect(await onSheet()).toMatchObject({ item_key: null, caption: SHEET_CAPTION });
  await expect(stripRows(page)).toHaveCount(1);
});

test('@p1 11.11-E2E-009 a PDF picked with a JPEG from a sheet is left out: "Adicionar 1 foto", and the toast names the skipped file', async ({ page }) => {
  test.setTimeout(150_000);
  const { blockId } = await openChaveSheet(page, account, database);
  const pdf: FilePayload = { name: 'documento.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') };
  const dialog = await pickSaved(page, [pdf, await plainJpeg(page, 'a.jpg')], 1);
  await expect(dialog.locator('.field-label .capture-reason')).toHaveText('— vale para a foto');
  await dialog.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(toast(page)).toContainText('1 foto adicionada — legenda aplicada. 1 arquivo não pôde ser lido como foto e ficou de fora', { timeout: 20_000 });
  expect((await devicePhotos(page, database))[0]).toMatchObject({ block_id: blockId, caption: SHEET_CAPTION });
});

test('@p1 11.11-E2E-010 the gallery with the camera denied: "Adicionar fotos" opens the chooser, "Escolher arquivos" the picker, and the step has nothing chosen', async ({ page }) => {
  test.setTimeout(150_000);
  await denyCamera(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  await expect(page.locator('.sticky-action-bar .camera-denied')).toHaveText(DENIED);
  await addPhotos(page).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  const choose = sheet.getByRole('button', { name: 'Escolher arquivos' });
  expect(Math.round((await choose.boundingBox())!.height)).toBe(56);
  await expect(sheet.getByRole('button', { name: 'Tirar foto' })).toHaveAttribute('aria-disabled', 'true');
  const chooser = page.waitForEvent('filechooser');
  await choose.click();
  await (await chooser).setFiles([await plainJpeg(page, 'a.jpg')]);
  const dialog = which(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(toast(page)).toContainText('1 foto ficou como Geral, sem legenda');
});
