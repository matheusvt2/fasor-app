import type { Locator, Page } from '@playwright/test';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes, READING_ACTOR } from './support/reading-ops.ts';

/*
 * Review fixes 2026-10-08, batch r8emit (`spec-review-fixes-2026-10-08-emission.md`): toasts
 * that never cover the field or the rows they stand over (H-7, DE-6), and reading arrivals that
 * announce only what the screen does not already draw, caption rows apart, and leave once
 * served (DC-4, merging DB-5, DE-5, DG-3). Driven as the engineer drives them; a reading
 * lands as the job writes it (a server `suggestion` create) and is pulled by a cycle the page
 * starts on its own (`online`), so the screen it lands on stays the one on show.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface EntityRecord<T = Record<string, unknown>> {
  entity: string;
  id: string;
  row: T;
}

interface OutboxRow {
  path: string;
  value: unknown;
}

const toast = (page: Page) => page.getByTestId('toast');
const strip = (page: Page) => page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
const stripRows = (page: Page) => strip(page).locator('.photo-list > .photo-row');
const galleryItems = (page: Page) => page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item');
const nameplateField = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const entities = <T,>(page: Page) => readStore<EntityRecord<T>>(page, database, 'entities');

/** A sync cycle the page runs by itself (the `online` event), leaving the screen as it is. */
async function pullHere(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

/** Waits until the device holds the suggestion `id` (its pull landed), then until the cycle is over. */
async function landed(page: Page, id: string): Promise<void> {
  await expect.poll(async () => (await entities(page)).some((record) => record.entity === 'suggestion' && record.id === id), { timeout: 30_000 }).toBe(true);
  // The arrival is announced once the cycle that pulled it ends.
  await page.waitForTimeout(2_000);
}

/** Another live Chave seccionadora of the relatório than `blockId`. */
async function otherChave(page: Page, relatorioId: string, blockId: string): Promise<string> {
  const blocks = (await entities<{ block_type?: string; relatorio_id?: string; removed_at?: string | null }>(page)).filter(
    (record) => record.entity === 'block' && record.row.block_type === 'chave_seccionadora' && record.row.relatorio_id === relatorioId && record.row.removed_at === null && record.id !== blockId,
  );
  expect(blocks.length).toBeGreaterThan(0);
  return blocks[0]!.id;
}

/** "Adicionar fotos" on the sheet: `n` files through the picker, saved to this sheet with its caption. */
async function addSheetPhotos(page: Page, n: number): Promise<void> {
  const before = (await devicePhotos(page, database)).length;
  const files = await Promise.all(Array.from({ length: n }, (_, i) => plainJpeg(page, `r8e-${i}.jpg`)));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles(files);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await which.getByRole('button', { name: `Adicionar ${n} fotos` }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 30_000 }).toBe(before + n);
}

/** Opens `tile` in the viewer and removes it there: the undo toast "Foto N removida do relatório · Desfazer" stays up. */
async function removeFromViewer(page: Page, tile: Locator): Promise<void> {
  await tile.click();
  const viewer = page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ });
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: /^Remover a foto \d+ do relatório\?$/ }).getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(toast(page)).toContainText(/^Foto \d+ removida do relatório/);
  await expect(toast(page).getByRole('button', { name: 'Desfazer' })).toBeVisible();
}

/**
 * At the end of the page, the last row's centre is its own (not the toast's), and a tap there
 * opens it: the viewer of that photo.
 */
async function lastRowClearOfToast(page: Page, last: Locator): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const box = (await last.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const own = await last.evaluate((row, at) => {
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && row.contains(hit) && hit.closest('[data-testid="toast"]') === null;
  }, centre);
  expect(own).toBe(true);
  const toastBox = (await toast(page).boundingBox())!;
  expect(centre.y).toBeLessThan(toastBox.y);
  await page.mouse.click(centre.x, centre.y);
  await expect(page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
}

test('@p0 R8E-E2E-003 at 390 px an undo toast leaves the last photo rows of the ficha strip and of the gallery reachable: their centres are not under it and a tap opens them', async ({ page }) => {
  test.setTimeout(300_000);
  const { relatorioId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  await addSheetPhotos(page, 7);
  await expect(stripRows(page)).toHaveCount(7);

  // The ficha strip: remove the first photo, the undo toast stays, the last row is still its own.
  await removeFromViewer(page, stripRows(page).first().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(stripRows(page)).toHaveCount(6);
  await lastRowClearOfToast(page, stripRows(page).last().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(toast(page)).toBeVisible();

  // The gallery: the same at the end of its grid.
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(galleryItems(page)).toHaveCount(6);
  await removeFromViewer(page, page.getByRole('button', { name: 'Foto 1, abrir', exact: true }));
  await expect(galleryItems(page)).toHaveCount(5);
  await lastRowClearOfToast(page, galleryItems(page).last().getByRole('button', { name: /^Foto \d+, abrir$/ }));
  await expect(toast(page)).toBeVisible();
});

test('@p0 R8E-E2E-004 a field focused where a toast appears scrolls clear of it: it ends fully above the toast\'s top edge, still focused', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database, { width: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  const other = await otherChave(page, relatorioId, blockId);
  const input = nameplateField(page, 'n_serie').locator('input');
  await input.focus();
  // The field sits just above the Sticky action bar, where the toast is about to show.
  await input.evaluate((element) => {
    const bar = document.querySelector('.sticky-action-bar')!.getBoundingClientRect();
    window.scrollBy(0, element.getBoundingClientRect().bottom - (bar.top - 8));
  });
  await expect(input).toBeFocused();

  // A reading for another sheet arrives while the engineer is on this field.
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${other}/nameplate/n_serie`, value: 'SN-R8E-004', actorId: READING_ACTOR });
  await pullHere(page);
  await landed(page, id);
  await expect(toast(page)).toContainText('1 leitura pronta para confirmar', { timeout: 30_000 });
  await expect(input).toBeFocused();
  await expect
    .poll(async () => {
      const field = (await input.boundingBox())!;
      const over = (await toast(page).boundingBox())!;
      return field.y + field.height <= over.y;
    })
    .toBe(true);
});

test('@p0 R8E-E2E-005 a reading for the open ficha announces nothing; one for another sheet does, its "Ver" opens that sheet and the toast is gone there', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  const other = await otherChave(page, relatorioId, blockId);

  // The open ficha's own reading: drawn on it, no toast over it.
  const own = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${blockId}/nameplate/n_serie`, value: 'SN-R8E-OWN', actorId: READING_ACTOR });
  await pullHere(page);
  await landed(page, own);
  await expect(nameplateField(page, 'n_serie').locator('.field.suggestion-field')).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
  // The engineer confirms it here: the cell holds the value, the suggestion is confirmed.
  await nameplateField(page, 'n_serie').locator('.field.suggestion-field').getByRole('button', { name: /confirmar$/ }).click();
  await expect
    .poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).some((row) => row.path === `suggestion/${own}/status` && row.value === 'confirmed'))
    .toBe(true);

  // Another sheet's reading: announced, and "Ver" leads there.
  const elsewhere = await pushSuggestion(account.companyId, relatorioId, { targetPath: `sheet/${other}/nameplate/n_serie`, value: 'SN-R8E-OTHER', actorId: READING_ACTOR });
  await pullHere(page);
  await landed(page, elsewhere);
  await expect(toast(page)).toHaveText(/^1 leitura pronta para confirmar/, { timeout: 30_000 });
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/ficha/${other}$`));
  await expect(nameplateField(page, 'n_serie').locator('.field.suggestion-field')).toBeVisible({ timeout: 30_000 });
  await expect(toast(page)).toHaveCount(0);
});

/**
 * A "Geral" photo with no caption, its bytes held on the device (`holdPhotoBytes`, so no real
 * caption reading runs): the photo a caption suggestion is for. Added from the screen on show
 * (the ficha's or the gallery's "Adicionar fotos"), so no reload starts the device over.
 */
async function generalPhoto(page: Page): Promise<string> {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'r8e-geral.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await which.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  await which.getByRole('textbox', { name: 'Legenda da foto' }).clear();
  await which.getByRole('button', { name: 'Adicionar 1 foto' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 30_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  expect(photo).toMatchObject({ block_id: null });
  expect(photo!.caption ?? '').toBe('');
  return photo!.id;
}

/** The device's row of suggestion `id`: still pending (a caption of a photo the device holds is never discarded as stale). */
async function suggestionStatus(page: Page, id: string): Promise<unknown> {
  return (await entities<{ status?: string }>(page)).find((record) => record.entity === 'suggestion' && record.id === id)?.row.status;
}

test('@p1 R8E-E2E-006 a caption-only arrival reads "N legendas sugeridas", never "leituras", and its "Ver" opens the gallery', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  const photoId = await generalPhoto(page);
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `file/${photoId}/caption`, value: 'Vista geral do Cubículo Enel', photoId, actorId: READING_ACTOR });
  await pullHere(page);
  await landed(page, id);
  expect(await suggestionStatus(page, id)).toBe('pending');
  await expect(toast(page)).toHaveText(/^1 legenda sugerida/, { timeout: 30_000 });
  await expect(toast(page)).not.toContainText('leitura');
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/fotos$`));
  await expect(toast(page)).toHaveCount(0);
});

test('@p1 R8E-E2E-007 a caption arrival while the gallery is on screen announces nothing', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  const photoId = await generalPhoto(page);
  // The page's own launch cycle is over before the reading lands (its first cycle after a load counts as baseline).
  await page.waitForTimeout(3_000);
  const id = await pushSuggestion(account.companyId, relatorioId, { targetPath: `file/${photoId}/caption`, value: 'Vista geral', photoId, actorId: READING_ACTOR });
  await pullHere(page);
  await landed(page, id);
  expect(await suggestionStatus(page, id)).toBe('pending');
  await expect(page.getByText('1 legenda sugerida').first()).toBeVisible();
  await expect(toast(page)).toHaveCount(0);
});
