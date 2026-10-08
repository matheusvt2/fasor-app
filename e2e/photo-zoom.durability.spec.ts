import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { signInForDurability } from './support/durability.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { devicePhotos } from './support/photos.ts';
import { holdPhotoBytes, openTransformerSheet, pushPlateSuggestions, transformerPlateFields } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 13.3-E2E (CAP-3, review-field-ux-2026-10-06): the photo as a magnifier, on desktop Chrome,
 * Android Chrome emulation and WebKit (the durability projects). The gestures are driven with
 * synthetic touch `PointerEvent`s (two pointers for a pinch, one for a pan or a tap), which
 * is what the app listens to on every engine; the buttons are tapped as a person does.
 *
 * The plate photo is imported through the app's own plate path (no camera here: the system
 * picker gets the 1600 x 1100 transformer plate), with its bytes held on the device so no
 * reading runs; the plate suggestions are written as the reading job writes them, so the
 * inline crop shows.
 */

test.use({ hasTouch: true });

// Playwright's WebKit build cannot store a Blob in IndexedDB ("UnknownError: Error preparing
// Blob/File data to be stored in object store", seen 2026-10-07 on the plate import), so no
// photo can be saved on the device there and no viewer can open on one. The gestures are
// pointer events on every engine; the WebKit pass is the manual iPad script's until that
// limit goes. Desktop Chrome and Android Chrome emulation run every test.
test.skip(({ browserName }) => browserName === 'webkit', 'Playwright WebKit cannot store a photo Blob in IndexedDB');

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

// No camera API on this browser: the plate tile falls back to the system picker at once.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'mediaDevices', { get: () => undefined, configurable: true });
  });
});

const PLATE = readFileSync(resolve(import.meta.dirname, '../services/ocr/tests/fixtures/plate-transformador.jpg'));

const nameplate = (page: Page) => page.locator('#ficha-nameplate');
const viewer = (page: Page) => page.locator('.photo-viewer');
const scaleOf = async (stage: Locator): Promise<number> => Number(await stage.getAttribute('data-zoom-scale'));

/** The transformer sheet with its plate photo imported (bytes held); returns the ids. */
async function plateSheet(page: Page, context: Parameters<typeof signInForDurability>[1], width: number): Promise<{ relatorioId: string; blockId: string; photoId: string }> {
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database, { width, signIn: () => signInForDurability(page, context, account.email) });
  // The tap opens the system picker (its fallback input); the file is handed to that input
  // directly, which WebKit needs (its picker opens only inside a click, React Aria presses on
  // pointer up) and which is the same change event on every engine.
  const group = nameplate(page).locator('.camera-group');
  await group.getByRole('button', { name: 'Fotografar placa' }).click();
  await group.getByTestId('camera-fallback-input').setInputFiles({ name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  return { ...ids, photoId: (await devicePhotos(page, database))[0]!.id };
}

/** The gallery's viewer on photo 1, with its original drawn (its natural size known). */
async function openGalleryViewer(page: Page, relatorioId: string, total = 1): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  const tile = page.getByRole('button', { name: 'Foto 1, abrir', exact: true });
  await tile.click();
  const dialog = page.getByRole('dialog', { name: `Foto 1 de ${total}` });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.locator('img.viewer-img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth >= 1000), { timeout: 15_000 }).toBe(true);
  return dialog;
}

/** Two touch pointers spread from `from` to `to` px apart around the element's centre (a pinch out when `to > from`). */
async function pinch(target: Locator, from: number, to: number): Promise<void> {
  await target.evaluate(
    (element, [start, end]) => {
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fire = (type: string, id: number, x: number) =>
        element.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 31, clientX: x, clientY: cy, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
      fire('pointerdown', 31, cx - start! / 2);
      fire('pointerdown', 32, cx + start! / 2);
      for (let i = 1; i <= 10; i++) {
        const d = start! + ((end! - start!) * i) / 10;
        fire('pointermove', 31, cx - d / 2);
        fire('pointermove', 32, cx + d / 2);
      }
      fire('pointerup', 31, cx - end! / 2);
      fire('pointerup', 32, cx + end! / 2);
    },
    [from, to],
  );
}

/** One touch pointer dragged by `(dx, dy)` from the element's centre. */
async function drag(target: Locator, dx: number, dy: number): Promise<void> {
  await target.evaluate(
    (element, [x, y]) => {
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const fire = (type: string, px: number, py: number) =>
        element.dispatchEvent(new PointerEvent(type, { pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
      fire('pointerdown', cx, cy);
      for (let i = 1; i <= 8; i++) fire('pointermove', cx + (x! * i) / 8, cy + (y! * i) / 8);
      fire('pointerup', cx + x!, cy + y!);
    },
    [dx, dy],
  );
}

/** Two quick taps of one touch pointer at the element's centre. */
async function doubleTap(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (const id of [51, 52]) {
      for (const type of ['pointerdown', 'pointerup']) {
        element.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
      }
    }
  });
}

test('@p0 13.3-E2E-001 the gallery viewer: pinch zooms up to native resolution, one finger pans, double-tap toggles, the buttons step and stop at the bounds with their reason, Escape closes back to the tile', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await plateSheet(page, context, 1280);
  // A second photo on the sheet ("Adicionar fotos", then "De qual equipamento?" with this sheet chosen).
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles({ name: 'segunda.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await which.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  const dialog = await openGalleryViewer(page, relatorioId, 2);
  const stage = dialog.locator('.viewer-photo');
  const picture = dialog.locator('img.viewer-img');
  const zoomIn = dialog.getByRole('button', { name: 'Ampliar' });
  const zoomOut = dialog.getByRole('button', { name: 'Reduzir' });
  const fit = dialog.getByRole('button', { name: 'Ajustar à tela' });

  // At fit: "Reduzir" and "Ajustar à tela" are disabled with their reason; "Ampliar" is not.
  expect(await scaleOf(stage)).toBe(1);
  await expect(zoomOut).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomOut).toHaveAccessibleDescription('Foto inteira na tela');
  await expect(fit).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true');

  // A pinch out zooms; never past one picture pixel per CSS pixel.
  await pinch(stage, 80, 320);
  await expect.poll(() => scaleOf(stage)).toBeGreaterThan(1.5);
  const max = await stage.evaluate((element) => {
    const img = element.querySelector('img')!;
    const rect = element.getBoundingClientRect();
    return Math.max(img.naturalWidth / rect.width, img.naturalHeight / rect.height);
  });
  await pinch(stage, 40, 2000);
  await expect.poll(() => scaleOf(stage)).toBeCloseTo(max, 2);

  // One finger pans the zoomed picture.
  const before = await picture.evaluate((img) => img.style.transform);
  await drag(stage, -120, -60);
  await expect.poll(() => picture.evaluate((img) => img.style.transform)).not.toBe(before);
  expect(await scaleOf(stage)).toBeCloseTo(max, 2);

  // "Ajustar à tela" returns to fit; a double-tap zooms 2x (capped at the maximum) and back.
  await fit.click();
  await expect.poll(() => scaleOf(stage)).toBe(1);
  await doubleTap(stage);
  await expect.poll(() => scaleOf(stage)).toBeCloseTo(Math.min(2, max), 2);
  await doubleTap(stage);
  await expect.poll(() => scaleOf(stage)).toBe(1);
  // A single tap does nothing.
  await stage.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) element.dispatchEvent(new PointerEvent(type, { pointerId: 61, pointerType: 'touch', isPrimary: true, clientX: rect.left + 50, clientY: rect.top + 50, bubbles: true }));
  });
  await page.waitForTimeout(350);
  expect(await scaleOf(stage)).toBe(1);

  // The buttons: 1.5x a step, up to the maximum, where "Ampliar" stops with its reason.
  await zoomIn.click();
  await expect.poll(() => scaleOf(stage)).toBeCloseTo(Math.min(1.5, max), 2);
  for (let i = 0; i < 8 && (await zoomIn.getAttribute('aria-disabled')) !== 'true'; i++) await zoomIn.click();
  await expect(zoomIn).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomIn).toHaveAccessibleDescription('Ampliação máxima');
  expect(await scaleOf(stage)).toBeCloseTo(max, 2);
  await zoomOut.click();
  await expect.poll(() => scaleOf(stage)).toBeCloseTo(max / 1.5, 2);
  await expect(zoomIn).not.toHaveAttribute('aria-disabled', 'true');

  // The rest of the viewer is as before: no swipe navigation, Escape closes, the focus is back on the tile.
  await expect(dialog.getByRole('button', { name: 'Anterior' })).toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.getByRole('button', { name: 'Editar legenda' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Remover', exact: true })).toBeVisible();
  // "Próxima" walks to photo 2 at fit; "Anterior" back to photo 1, at fit too.
  await dialog.getByRole('button', { name: 'Próxima' }).click();
  const second = page.getByRole('dialog', { name: 'Foto 2 de 2' });
  await expect(second).toBeVisible();
  await expect.poll(() => scaleOf(second.locator('.viewer-photo'))).toBe(1);
  await second.getByRole('button', { name: 'Anterior' }).click();
  await expect(page.getByRole('dialog', { name: 'Foto 1 de 2' })).toBeVisible();
  await expect.poll(() => scaleOf(stage)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Foto 1, abrir', exact: true })).toBeFocused();
});

test('@p0 13.3-E2E-002 the inline plate crop pinches and pans in its box, a tap still opens the viewer on the crop region, which zooms from there; another focused field shows its own view again', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { relatorioId, blockId, photoId } = await plateSheet(page, context, 1280);
  await pushPlateSuggestions(account.companyId, relatorioId, { blockId, photoId, fields: transformerPlateFields() });
  await syncNowAndReturn(page);
  const crop = nameplate(page).locator('.plate-crop');
  await expect(crop).toBeVisible({ timeout: 30_000 });
  const box = (await crop.boundingBox())!;

  // A pinch zooms the crop inside its 160 px box; one finger pans it; the box keeps its size.
  expect(await scaleOf(crop)).toBe(1);
  await expect(crop).toHaveCSS('touch-action', 'pan-y');
  await pinch(crop, 40, 200);
  await expect.poll(() => scaleOf(crop)).toBeGreaterThan(1.5);
  await expect(crop).toHaveCSS('touch-action', 'none');
  const layer = crop.locator('.plate-crop-zoom');
  const before = await layer.evaluate((element: HTMLElement) => element.style.transform);
  await drag(crop, -60, -20);
  await expect.poll(() => layer.evaluate((element: HTMLElement) => element.style.transform)).not.toBe(before);
  expect((await crop.boundingBox())!.height).toBeCloseTo(box.height, 0);
  // The viewer did not open on a gesture.
  await expect(viewer(page)).toHaveCount(0);
  // Nor on a mouse drag across the zoomed crop (it pans; the click that ends it is not a tap).
  const cropBox = (await crop.boundingBox())!;
  await page.mouse.move(cropBox.x + cropBox.width / 2, cropBox.y + cropBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cropBox.x + cropBox.width / 2 - 80, cropBox.y + cropBox.height / 2 - 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(viewer(page)).toHaveCount(0);

  // Focusing a field returns the crop to that field's view.
  await nameplate(page).locator('[data-field-key="n_serie"] input').focus();
  await expect.poll(() => scaleOf(crop)).toBe(1);
  await expect(crop.getByTestId('plate-crop-region')).toBeVisible();

  // A tap opens the viewer, landed on the crop region; the user zoom multiplies from there.
  await nameplate(page).locator('.plate-crop-open').tap();
  const dialog = page.getByRole('dialog', { name: /^Foto 1 de 1$/ });
  await expect(dialog).toBeVisible();
  const zoomed = dialog.locator('svg.viewer-zoom');
  await expect(zoomed).toHaveAttribute('data-zoom', /^[\d.]+,[\d.]+,[\d.]+,[\d.]+$/);
  const stage = dialog.locator('.viewer-photo');
  expect(await scaleOf(stage)).toBe(1);
  // Review F-05: at the crop's own fit "Reduzir" says "Recorte na tela"; "Ajustar à tela" stays enabled.
  const zoomOut = dialog.getByRole('button', { name: 'Reduzir' });
  const fit = dialog.getByRole('button', { name: 'Ajustar à tela' });
  await expect(zoomOut).toHaveAttribute('aria-disabled', 'true');
  await expect(zoomOut).toHaveAccessibleDescription('Recorte na tela');
  await expect(fit).not.toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('button', { name: 'Ampliar' }).click();
  await expect.poll(() => scaleOf(stage)).toBeGreaterThan(1);
  await expect(zoomed).toHaveAttribute('data-zoom', /,/);
  await pinch(stage, 60, 200);
  await expect.poll(() => scaleOf(stage)).toBeGreaterThan(1.5);
  // "Ajustar à tela" leaves the crop for the whole photo at fit.
  await fit.click();
  await expect(dialog.locator('svg.viewer-zoom')).toHaveCount(0);
  await expect(dialog.locator('img.viewer-img')).toBeVisible();
  await expect.poll(() => scaleOf(stage)).toBe(1);
  await expect(zoomOut).toHaveAccessibleDescription('Foto inteira na tela');
  await expect(fit).toHaveAttribute('aria-disabled', 'true');
  // Two reasons at once never run together.
  expect(await dialog.getByRole('group', { name: 'Ampliação da foto' }).textContent()).not.toMatch(/tela\s*Ampliação|Recorte na telaFoto/);
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
});

test('@p0 13.3-E2E-003 at 390 px the viewer pinches too, every control is at least 48 x 48 and nothing scrolls sideways', async ({ page, context }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await plateSheet(page, context, 390);
  const dialog = await openGalleryViewer(page, relatorioId);
  const stage = dialog.locator('.viewer-photo');
  await pinch(stage, 40, 260);
  await expect.poll(() => scaleOf(stage)).toBeGreaterThan(1);
  for (const name of ['Fechar', 'Ampliar', 'Reduzir', 'Ajustar à tela', 'Editar legenda', 'Remover', 'Anterior', 'Próxima']) {
    const control = dialog.getByRole('button', { name, exact: true });
    const rect = (await control.boundingBox())!;
    expect(rect.width, `${name} width`).toBeGreaterThanOrEqual(48);
    expect(rect.height, `${name} height`).toBeGreaterThanOrEqual(48);
    expect(rect.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width, `${name} right edge`).toBeLessThanOrEqual(390);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await viewer(page).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
});
