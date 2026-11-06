import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { displayEnvTarget, PLATE_CAPTION, photosImportedText, suggestionAnnouncement } from '@app/domain';
import type { FileChooser, Locator, Page } from '@playwright/test';
import { withoutServiceWorker } from './support/durability.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, jpegFromPage, jpegSize, openChaveSheet } from './support/photos.ts';
import { holdPhotoBytes, openTransformerSheet, pushReadingStatus } from './support/reading-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 22.1 (Matheus, 2026-11-06): "Anexar arquivo" beside every opener that asks a reading.
 * A photo file picked from the computer is committed with the opener's own target, so the real
 * reading job reads it under the compose api's `fake` providers (the plate and display fixtures
 * of `services/ocr/tests/fixtures`, re-encoded on the device so only the default fixture of each
 * kind can read them) and the suggestions land as a shot's do. Driven as a person does it, at
 * 390, 768 and 1280 px: the plate tile and a "Ler visor" opener, each through to the accepted
 * suggestion committed in the outbox; then a HEIC file, a 6000 px file and a non-image, and the
 * retake of a plate reading that read nothing (the older plate's reading cancelled, CAPT-V1).
 *
 * No camera on this browser (`getUserMedia` refuses), as the plate and display pipeline specs.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const FIXTURES = resolve(import.meta.dirname, '../services/ocr/tests/fixtures');
const PLATE = readFileSync(resolve(FIXTURES, 'plate-transformador.jpg'));
const ISOLACAO = readFileSync(resolve(FIXTURES, 'display-isolacao.jpg'));
const TERMO = readFileSync(resolve(FIXTURES, 'display-termo.jpg'));
const PANEL = readFileSync(resolve(import.meta.dirname, '../apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'));
const GOHM = 'GΩ';
/** The encoder's cap on the stored original's long edge (`ORIGINAL_MAX_PX`, `apps/web/src/files/photo-encode.ts`). */
const ORIGINAL_MAX_PX = 2560;
const WIDTHS = [390, 768, 1280] as const;

interface OutboxRow {
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
  meta: { source_suggestion_id?: string; auto?: boolean } | null;
}
interface PhotoCreate {
  kind: string;
  block_id: string | null;
  caption: string | null;
  reading_kind: string | null;
  reading_status: string;
  reading_target: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const prefs = (page: Page) => readStore<{ key: string; value: unknown }>(page, database, 'local_prefs');
const toast = (page: Page) => page.getByTestId('toast');
const nameplate = (page: Page) => page.locator('#ficha-nameplate');
const plateRow = (page: Page) => nameplate(page).locator('.photo-row.ficha-np-photo');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const plateAttach = (page: Page) => nameplate(page).locator('.camera-group').getByRole('button', { name: 'Anexar arquivo' });
const cellOf = (page: Page, name: string): Locator => page.locator('#ficha-step-ensaios .ficha-cell').filter({ has: page.getByRole('textbox', { name, exact: true }) });

/** The create op of a photo in the outbox. */
async function photoCreate(page: Page, id: string): Promise<PhotoCreate> {
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path === `file/${id}`);
  expect(create, `the create of photo ${id}`).toBeDefined();
  return create!.value as PhotoCreate;
}

/** "Anexar arquivo" is reachable: named, on screen and at least 44 px tall (the touch target). */
async function expectReachable(button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Anexar arquivo');
  const box = (await button.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
}

/** Presses `button` and answers its system picker (one picture, never several) with `file`; returns the new photo's id once stored. */
async function attach(page: Page, button: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<string> {
  const before = new Set((await devicePhotos(page, database)).map((photo) => photo.id));
  const choosing = page.waitForEvent('filechooser');
  await button.click();
  const chooser: FileChooser = await choosing;
  expect(chooser.isMultiple()).toBe(false);
  expect(await chooser.element().getAttribute('accept')).toBe('image/*,.heic,.heif');
  await chooser.setFiles(file);
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => !before.has(photo.id)).length, { timeout: 30_000 }).toBe(1);
  return (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!.id;
}

/** The original this device stores for `id` (a Blob cannot cross `page.evaluate`, so base64). */
async function storedOriginal(page: Page, id: string): Promise<Buffer | null> {
  const base64 = await page.evaluate(
    async ([name, fileId]) => {
      const open = await new Promise<IDBDatabase>((done, fail) => {
        const request = indexedDB.open(name!);
        request.onsuccess = () => done(request.result);
        request.onerror = () => fail(request.error);
      });
      const row = await new Promise<{ variant: string; blob: Blob } | undefined>((done, fail) => {
        const request = open.transaction('files', 'readonly').objectStore('files').get(fileId!);
        request.onsuccess = () => done(request.result as never);
        request.onerror = () => fail(request.error);
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

/** The plate's IDENTIFICAÇÃO suggestion ("TR-01", the fake provider's transformer plate), accepted; asserts the committed cell. */
async function acceptPlateSuggestion(page: Page, blockId: string): Promise<void> {
  const suggested = field(page, 'identificacao').locator('.field.suggestion-field');
  await expect(suggested).toBeVisible({ timeout: 60_000 });
  await expect(suggested.locator('input')).toHaveValue('TR-01');
  const trust = (await suggested.getAttribute('data-state')) === 'verify' ? 'verify' : 'suggested';
  await suggested.getByRole('button', { name: suggestionAnnouncement(trust, 'TR-01') }).click();
  await expect(field(page, 'identificacao').locator('.field.suggestion-field')).toHaveCount(0);
  await expect
    .poll(async () => (await outbox(page)).filter((op) => op.path === `sheet/${blockId}/nameplate/identificacao`).map((op) => ({ value: op.value, from: typeof op.meta?.source_suggestion_id })), { timeout: 15_000 })
    .toEqual([{ value: 'TR-01', from: 'string' }]);
}

for (const width of WIDTHS) {
  test(`@p0 22.1-E2E-001 at ${width} px a plate photo file attached on the plate tile is read as a shot, and its accepted suggestion fills the nameplate`, async ({ page }) => {
    test.setTimeout(240_000);
    const ids = await openTransformerSheet(page, account, database, { width });
    const button = plateAttach(page);
    await expectReachable(button);
    const photoId = await attach(page, button, { name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });

    // The shot's own target: a sheet photo with the plate reading, queued, captioned as the tile's shot.
    const create = await photoCreate(page, photoId);
    expect(create).toMatchObject({ kind: 'photo', block_id: ids.blockId, caption: PLATE_CAPTION, reading_kind: 'plate', reading_status: 'queued' });
    expect(create.reading_target).toMatchObject({ block_id: ids.blockId, block_type: 'transformador_forca' });
    await expect(plateRow(page).locator('.photo-tile')).toHaveAttribute('data-photo-id', photoId);

    // No "Sincronizar agora": the upload, the reading job and the pulls run on their own.
    await acceptPlateSuggestion(page, ids.blockId);
  });

  test(`@p0 22.1-E2E-002 at ${width} px a display photo file attached beside "Ler visor" reads into the insulation cell the first shot would read`, async ({ page }) => {
    test.setTimeout(240_000);
    const ids = await openChaveSheet(page, account, database, { width });
    const actions = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions');
    await expect(actions.getByRole('button', { name: 'Ler visor' })).toBeVisible();
    const button = actions.getByRole('button', { name: 'Anexar arquivo' });
    await expectReachable(button);
    const photoId = await attach(page, button, { name: 'visor.jpg', mimeType: 'image/jpeg', buffer: ISOLACAO });

    // The burst's first shot's target: the table's first row no display photo targets yet (T1).
    const create = await photoCreate(page, photoId);
    expect(create).toMatchObject({ kind: 'photo', block_id: ids.blockId, reading_kind: 'display', reading_status: 'queued' });
    expect(create.reading_target).toEqual({ block_id: ids.blockId, block_type: 'chave_seccionadora', table_key: 'isolacao', start_cell: { row: 0, col: 0 } });

    // The fake provider reads 147 GΩ into the empty T1: a suggestion, accepted with Enter.
    const t1 = cellOf(page, 'T1, Valor');
    await expect(t1.locator('.field.suggestion-field')).toBeVisible({ timeout: 60_000 });
    const input = t1.getByRole('textbox', { name: 'T1, Valor', exact: true });
    await expect(input).toHaveValue('147');
    await input.click();
    await page.keyboard.press('Enter');
    const cellPath = `sheet/${ids.blockId}/test/isolacao/cell/0/0`;
    await expect.poll(async () => (await outbox(page)).find((op) => op.path === cellPath)?.meta?.source_suggestion_id ?? null, { timeout: 15_000 }).toEqual(expect.any(String));
    expect((await outbox(page)).find((op) => op.path === cellPath)!.value).toEqual({ raw: '147', unit: GOHM, state: 'measured' });
    await expect(t1).toHaveAttribute('data-state', 'confirmed');
  });
}

for (const width of WIDTHS) {
  test(`@p0 22.1-E2E-006 at ${width} px "Anexar arquivo" in the field palette commits a panel photo file and opens the "Fotografar equipamento" result on it`, async ({ page }) => {
    test.setTimeout(180_000);
    await resetEmpresaB(account, { standard: true });
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, account.email);
    const { relatorioId } = await pushNewRelatorio(page, account, database);
    await page.goto(`/relatorio/${relatorioId}`);
    await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
    const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
    if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
    await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
    // The bytes stay on the device: the dialog opens on the stored row, no real job runs beside it.
    await holdPhotoBytes(page);
    await page.getByRole('button', { name: 'Mais opções de Coluna 1 de 1° Subsolo', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
    const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
    const button = palette.locator('.pal-camera').getByRole('button', { name: 'Anexar arquivo' });
    await expectReachable(button);
    const photoId = await attach(page, button, { name: 'painel.png', mimeType: 'image/png', buffer: PANEL });

    // The palette closed, the result dialog opened on the attached photo: the panel reading of the palette's local.
    await expect(palette).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Fotografar equipamento' })).toBeVisible({ timeout: 15_000 });
    const create = await photoCreate(page, photoId);
    expect(create).toMatchObject({ kind: 'photo', block_id: null, reading_kind: 'panel', reading_status: 'queued' });
    expect(create.reading_target).toEqual({ location_id: expect.any(String) });
  });
}

test('@p0 22.1-E2E-003 a HEIC plate file is converted on the device, stored as a JPEG and read as a shot', async ({ page }) => {
  test.setTimeout(240_000);
  // The service worker would answer the decoder's chunk from its cache, past `page.route`.
  await withoutServiceWorker(page);
  // Playwright cannot make an HEVC HEIC here (no encoder in the stack), so the browser's HEIC
  // decoder (`heic-to`, the import path's own dynamic chunk) is answered by a stand-in that
  // decodes the bytes it is given with the browser's own decoder: the import path itself
  // (HEIC by type and extension, read whole, converted before the encode) runs unchanged.
  let decoded = 0;
  await page.route(/\/assets\/heic-to[^/]*\.js(\?.*)?$/, async (route) => {
    decoded += 1;
    await route.fulfill({
      contentType: 'text/javascript',
      body: `export async function heicTo({ blob }) {
  const bitmap = await createImageBitmap(new Blob([await blob.arrayBuffer()], { type: 'image/jpeg' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}
export function isHeic() { return Promise.resolve(true); }`,
    });
  });
  const ids = await openTransformerSheet(page, account, database);
  const photoId = await attach(page, plateAttach(page), { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: PLATE });
  expect(decoded).toBe(1);
  expect(await photoCreate(page, photoId)).toMatchObject({ block_id: ids.blockId, reading_kind: 'plate', reading_status: 'queued' });
  await expect.poll(async () => (await storedOriginal(page, photoId))?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const original = (await storedOriginal(page, photoId))!;
  expect([original[0], original[1]]).toEqual([0xff, 0xd8]);
  await acceptPlateSuggestion(page, ids.blockId);
});

test('@p0 22.1-E2E-004 a 6000 px file is re-encoded to the original cap; a non-image file is not offered and, forced, is skipped with the import\'s toast', async ({ page }) => {
  test.setTimeout(240_000);
  const ids = await openTransformerSheet(page, account, database);
  // A non-image forced past the picker's filter: nothing stored, the import's sentence.
  const choosing = page.waitForEvent('filechooser');
  await plateAttach(page).click();
  const chooser = await choosing;
  expect(await chooser.element().getAttribute('accept')).toBe('image/*,.heic,.heif');
  await chooser.setFiles({ name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await expect(toast(page)).toHaveText(photosImportedText(0, 1, PLATE_CAPTION)!, { timeout: 15_000 });
  expect(await devicePhotos(page, database)).toHaveLength(0);

  const large = await jpegFromPage(page, 6000, 4000);
  expect(jpegSize(large)).toEqual({ width: 6000, height: 4000 });
  const photoId = await attach(page, plateAttach(page), { name: 'grande.jpg', mimeType: 'image/jpeg', buffer: large });
  expect(await photoCreate(page, photoId)).toMatchObject({ block_id: ids.blockId, reading_kind: 'plate' });
  await expect.poll(async () => (await storedOriginal(page, photoId))?.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  const size = jpegSize((await storedOriginal(page, photoId))!);
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(ORIGINAL_MAX_PX);
  expect(size.width / size.height).toBeCloseTo(1.5, 1);
});

test('@p0 22.1-E2E-005 a plate reading that read nothing: "Anexar arquivo" beside "Fotografar de novo" takes a new plate photo and cancels the older reading', async ({ page }) => {
  test.setTimeout(240_000);
  // The bytes stay on the device, so no real job runs: the reading's outcome is written as the server writes it.
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const first = await attach(page, plateAttach(page), { name: 'placa.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, first, 'done');
  await syncNowAndReturn(page);

  const row = plateRow(page);
  await expect(row).toHaveAttribute('data-reading', 'empty');
  await expect(row.getByRole('button', { name: 'Fotografar de novo' })).toBeVisible();
  const again = row.getByRole('button', { name: 'Anexar arquivo' });
  await expectReachable(again);
  const second = await attach(page, again, { name: 'placa-2.jpg', mimeType: 'image/jpeg', buffer: PLATE });
  expect(second).not.toBe(first);
  expect(await photoCreate(page, second)).toMatchObject({ block_id: ids.blockId, reading_kind: 'plate', reading_status: 'queued', caption: PLATE_CAPTION });
  await expect(plateRow(page).locator('.photo-tile')).toHaveAttribute('data-photo-id', second);
  await expect(plateRow(page).getByText('Nada foi lido nesta foto')).toHaveCount(0);
  const keys = async () => (await prefs(page)).map((entry) => entry.key);
  await expect.poll(keys).toContain(`reading_cancelled:${first}`);
  expect(await keys()).not.toContain(`reading_cancelled:${second}`);
});

/** The cabine a block sits under: its location walked up to the root (the thermo-hygrometer's `displayEnvTarget`). */
async function cabineOf(page: Page, blockId: string): Promise<string> {
  const records = await readStore<{ entity: string; id: string; row: { location_id?: string | null; parent_id?: string | null } }>(page, database, 'entities');
  const parents = new Map(records.filter((record) => record.entity === 'location').map((record) => [record.id, record.row.parent_id ?? null]));
  let at = records.find((record) => record.entity === 'block' && record.id === blockId)!.row.location_id!;
  while (parents.get(at) !== null && parents.get(at) !== undefined) at = parents.get(at)!;
  return at;
}

test('@p0 22.1-E2E-007 "Anexar arquivo" beside the thermo-hygrometer\'s "Ler visor" commits a display photo of the cabine\'s environment', async ({ page }) => {
  test.setTimeout(180_000);
  // The bytes stay on the device: the create is what this asserts, no real job runs beside it.
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  const actions = page.locator('section.ficha-amb .ficha-amb-actions');
  await expect(actions.getByRole('button', { name: 'Ler visor' })).toBeVisible();
  const button = actions.getByRole('button', { name: 'Anexar arquivo' });
  await expectReachable(button);
  const photoId = await attach(page, button, { name: 'termo.jpg', mimeType: 'image/jpeg', buffer: TERMO });
  const create = await photoCreate(page, photoId);
  expect(create).toMatchObject({ kind: 'photo', reading_kind: 'display', reading_status: 'queued' });
  expect(create.reading_target).toEqual(displayEnvTarget(await cabineOf(page, ids.blockId)));
});

test('@p0 22.1-E2E-008 a "Ler visor" reading that read nothing: "Anexar arquivo" beside "Fotografar de novo" commits a display photo of the empty photo\'s own target', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  const actions = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions');
  const first = await attach(page, actions.getByRole('button', { name: 'Anexar arquivo' }), { name: 'visor.jpg', mimeType: 'image/jpeg', buffer: ISOLACAO });
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, first, 'done');
  await syncNowAndReturn(page);

  const empty = cellOf(page, 'T1, Valor').locator('.reading-empty');
  await expect(empty.locator('.reading-line')).toHaveText('Nada foi lido nesta foto');
  await expect(empty.getByRole('button', { name: 'Fotografar de novo' })).toBeVisible();
  const again = empty.getByRole('button', { name: 'Anexar arquivo' });
  await expectReachable(again);
  const second = await attach(page, again, { name: 'visor-2.jpg', mimeType: 'image/jpeg', buffer: ISOLACAO });
  expect(second).not.toBe(first);
  const create = await photoCreate(page, second);
  expect(create).toMatchObject({ kind: 'photo', block_id: ids.blockId, reading_kind: 'display', reading_status: 'queued' });
  expect(create.reading_target).toEqual((await photoCreate(page, first)).reading_target);
  expect(create.reading_target).toEqual({ block_id: ids.blockId, block_type: 'chave_seccionadora', table_key: 'isolacao', start_cell: { row: 0, col: 0 } });
  await expect(cellOf(page, 'T1, Valor').locator('.reading-empty')).toHaveCount(0);
});
