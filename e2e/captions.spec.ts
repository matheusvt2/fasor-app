import type { Locator, Page } from '@playwright/test';
import { plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot, type PhotoRowRecord } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 9.3-E2E: vision captions on the gallery, driven as a person would. The photos are added to
 * the gallery as "Geral" (no sheet, no caption); ledger 1131 (contract 14): their creates ask
 * for no reading while "De qual equipamento?" is open, and the answer (or "Cancelar") asks for
 * the caption reading of each photo it leaves with no context with a `reading_kind` put; their
 * bytes stay on the device (`holdPhotoBytes`: no reading job runs), and the suggestions
 * are written the way the reading job writes them (`pushSuggestion`) and pulled with
 * "Sincronizar agora". From there: the tile's Suggestion block and "Confirmar", "Confirmar
 * todas" as one batch, the composer's "Usar", a typed caption that discards, and the "Pessoas
 * na foto" mark on a tile and on an import batch. The real job's path is
 * `prose-reading-pipeline.spec.ts`.
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

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string } | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const itemOf = (page: Page, id: string): Locator => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);
const banner = (page: Page) => page.locator('[data-route="/relatorio/:id/fotos"] .banner.sug-banner');
const counter = (page: Page) => page.locator('.section-head .progress-counter');
const TEXTS = ['Vista geral da cabine primária', 'Painel de média tensão aberto', 'Quadro de comando do Cubículo Enel'];

async function openGallery(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

async function pickFiles(page: Page, files: FilePayload[]): Promise<Locator> {
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles(files);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  return which;
}

/** The `file/{id}/reading_kind` puts in the outbox. */
const readingPuts = async (page: Page): Promise<OutboxRow[]> => (await outbox(page)).filter((op) => op.kind === 'put' && op.path.endsWith('/reading_kind'));

const byCapture = (photos: PhotoRowRecord[]) => [...photos].sort((a, b) => (a.local_seq === b.local_seq ? (a.id < b.id ? -1 : 1) : a.local_seq - b.local_seq));

/**
 * Resets Empresa B, opens the gallery and adds `n` pictures as "Geral" ("Cancelar" on the batch);
 * `whileOpen` runs once the batch is saved and the sheet is still open.
 */
async function geralPhotos(page: Page, n: number, whileOpen?: () => Promise<void>): Promise<{ relatorioId: string; photos: PhotoRowRecord[] }> {
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  const files: FilePayload[] = [];
  for (let i = 0; i < n; i++) files.push(await plainJpeg(page, `geral-${i}.jpg`));
  const which = await pickFiles(page, files);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(n);
  if (whileOpen !== undefined) await whileOpen();
  await which.getByRole('button', { name: 'Cancelar' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await readingPuts(page)).length, { timeout: 15_000 }).toBe(n);
  return { relatorioId, photos: byCapture(await devicePhotos(page, database)) };
}

/** Writes one pending caption suggestion per photo as the reading job would, and pulls them. */
async function suggestCaptions(page: Page, relatorioId: string, photos: readonly PhotoRowRecord[]): Promise<string[]> {
  const ids: string[] = [];
  for (const [i, photo] of photos.entries()) {
    ids.push(await pushSuggestion(account.companyId, relatorioId, { targetPath: `file/${photo.id}/caption`, value: TEXTS[i]!, photoId: photo.id, bbox: [0, 0, 1, 1], actorId: account.userId }));
  }
  await syncNowAndReturn(page);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico/ })).toBeVisible({ timeout: 30_000 });
  return ids;
}

test('@p0 9.3-E2E-001 a Geral import asks for a caption reading once closed; the suggested caption shows on its tile and nothing is written until Confirmar; Sumário row 7 lists them; "Confirmar todas" is one batch; 390 px keeps the banner in the page', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, photos } = await geralPhotos(page, 3, async () => {
    // Ledger 1131: while "De qual equipamento?" is open the creates ask for no reading.
    const creates = (await outbox(page)).filter((op) => op.kind === 'create' && /^file\/[^/]+$/.test(op.path));
    expect(creates).toHaveLength(3);
    for (const op of creates) expect(op.value).toMatchObject({ block_id: null, caption: null, reading_kind: null, reading_target: null, reading_status: 'none', people_in_photo: false });
    expect(await readingPuts(page)).toEqual([]);
  });

  // "Cancelar" keeps them as "Geral" with no context: one batch of caption puts, one per photo.
  const asked = await readingPuts(page);
  expect(asked.map((op) => op.path).sort()).toEqual(photos.map((photo) => `file/${photo.id}/reading_kind`).sort());
  expect(asked.every((op) => op.value === 'caption')).toBe(true);
  expect(new Set(asked.map((op) => op.batch_id)).size).toBe(1);
  for (const photo of await devicePhotos(page, database)) expect(photo.reading_status).toBe('queued');

  const ids = await suggestCaptions(page, relatorioId, photos);

  // Sumário row 7 lists the suggested captions beside what it already said.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.locator('button.sum-open', { hasText: 'Registro fotográfico' }).locator('.sum-status')).toContainText('3 legendas sugeridas', { timeout: 30_000 });
  await openGallery(page, relatorioId);

  // The tile: the Suggestion block with "Sugerido" and "Confirmar"; its name says so.
  const first = itemOf(page, photos[0]!.id);
  const block = first.locator('.field.suggestion-field[data-state="suggested"]');
  await expect(block.locator('.suggestion-block .sv')).toHaveText(TEXTS[0]!);
  await expect(block.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(first.getByRole('button', { name: 'Foto 1, legenda sugerida, abrir', exact: true })).toBeVisible();
  await expect(banner(page).locator('.banner-text')).toHaveText('3 legendas sugeridas pela leitura das fotos.');
  await expect(counter(page)).toHaveText('3 fotos aguardando envio · 3 legendas sugeridas');
  expect((await outbox(page)).some((op) => op.path.endsWith('/caption'))).toBe(false);

  // 390 px: the banner and the blocks stay inside the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(banner(page)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Confirmar on the tile: the caption put with its provenance and the status put, one batch.
  await block.getByRole('button', { name: `Sugerido, ${TEXTS[0]}, confirmar` }).click();
  await expect(toast(page)).toContainText('Legenda da foto 1 confirmada');
  await expect(first.locator('.photo-meta')).toHaveText(TEXTS[0]!);
  await expect(first.locator('.suggestion-field')).toHaveCount(0);
  const one = await outbox(page);
  const put = one.find((op) => op.path === `file/${photos[0]!.id}/caption`)!;
  expect(put.value).toBe(TEXTS[0]);
  expect(put.meta?.source_suggestion_id).toBe(ids[0]);
  expect(one.find((op) => op.path === `suggestion/${ids[0]}/status`)).toMatchObject({ value: 'confirmed', batch_id: put.batch_id });

  // "Confirmar todas": the two left, every put in one batch; the banner leaves, the counter follows.
  await expect(banner(page).locator('.banner-text')).toHaveText('2 legendas sugeridas pela leitura das fotos.');
  await banner(page).getByRole('button', { name: 'Confirmar todas' }).click();
  await expect(toast(page)).toContainText('2 legendas confirmadas');
  await expect(banner(page)).toHaveCount(0);
  await expect(counter(page)).toHaveText('3 fotos aguardando envio');
  const all = await outbox(page);
  const batch = all.filter((op) => op.path === `file/${photos[1]!.id}/caption` || op.path === `file/${photos[2]!.id}/caption` || op.path === `suggestion/${ids[1]}/status` || op.path === `suggestion/${ids[2]}/status`);
  expect(batch).toHaveLength(4);
  expect(new Set(batch.map((op) => op.batch_id)).size).toBe(1);
  expect(batch.find((op) => op.path === `file/${photos[1]!.id}/caption`)).toMatchObject({ value: TEXTS[1], meta: { source_suggestion_id: ids[1] } });
  expect(batch.find((op) => op.path === `file/${photos[2]!.id}/caption`)).toMatchObject({ value: TEXTS[2], meta: { source_suggestion_id: ids[2] } });
  for (const [i, photo] of photos.entries()) await expect(itemOf(page, photo.id).locator('.photo-meta')).toHaveText(TEXTS[i]!);
});

test('@p0 9.3-E2E-002 the composer offers the suggestion with "Usar"; a caption saved by hand discards it; "Pessoas na foto" on a tile writes the mark and discards it, one batch', async ({ page }) => {
  test.setTimeout(240_000);
  const { relatorioId, photos } = await geralPhotos(page, 3);
  const ids = await suggestCaptions(page, relatorioId, photos);
  const composer = page.getByRole('dialog', { name: 'Legenda' });

  // "Usar": confirms the suggestion and closes.
  await itemOf(page, photos[0]!.id).getByRole('button', { name: 'Legendar' }).click();
  const vision = composer.getByRole('group', { name: 'Legenda sugerida' });
  await expect(vision.locator('.sv-kicker')).toHaveText('Sugerida pela foto');
  await expect(vision.locator('.sv')).toContainText(TEXTS[0]!);
  await vision.getByRole('button', { name: `Usar a legenda sugerida: ${TEXTS[0]}` }).click();
  await expect(composer).toHaveCount(0);
  await expect(toast(page)).toContainText('Legenda da foto 1 salva');
  await expect(itemOf(page, photos[0]!.id).locator('.photo-meta')).toHaveText(TEXTS[0]!);
  const used = (await outbox(page)).find((op) => op.path === `file/${photos[0]!.id}/caption`)!;
  expect(used).toMatchObject({ value: TEXTS[0], meta: { source_suggestion_id: ids[0] } });
  expect((await outbox(page)).find((op) => op.path === `suggestion/${ids[0]}/status`)).toMatchObject({ value: 'confirmed', batch_id: used.batch_id });

  // A caption typed by hand: written as typed, the suggestion discarded in the same batch.
  await itemOf(page, photos[1]!.id).getByRole('button', { name: 'Legendar' }).click();
  await expect(composer.getByRole('group', { name: 'Legenda sugerida' })).toBeVisible();
  await composer.getByRole('button', { name: 'Editar texto' }).click();
  await composer.getByRole('textbox', { name: 'Texto da legenda' }).fill('Equipe no desligamento');
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(itemOf(page, photos[1]!.id).locator('.photo-meta')).toHaveText('Equipe no desligamento');
  await expect(itemOf(page, photos[1]!.id).locator('.suggestion-field')).toHaveCount(0);
  const typed = (await outbox(page)).find((op) => op.path === `file/${photos[1]!.id}/caption`)!;
  expect(typed.value).toBe('Equipe no desligamento');
  expect(typed.meta?.source_suggestion_id).toBeUndefined();
  expect((await outbox(page)).find((op) => op.path === `suggestion/${ids[1]}/status`)).toMatchObject({ value: 'discarded', batch_id: typed.batch_id });

  // "Pessoas na foto" on the third tile: the mark and the discard, one batch; the block leaves, the chip stays pressed.
  const third = itemOf(page, photos[2]!.id);
  const chip = third.getByRole('button', { name: 'Pessoas na foto' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(third.locator('.suggestion-field')).toHaveCount(0);
  const mark = (await outbox(page)).find((op) => op.path === `file/${photos[2]!.id}/people_in_photo`)!;
  expect(mark.value).toBe(true);
  expect((await outbox(page)).find((op) => op.path === `suggestion/${ids[2]}/status`)).toMatchObject({ value: 'discarded', batch_id: mark.batch_id });
  await expect(banner(page)).toHaveCount(0);
  await expect(counter(page)).toHaveText('3 fotos aguardando envio · 1 sem legenda');
});

test('@p0 9.3-E2E-003 "Pessoas na foto" in an import batch marks every photo of it; a gallery "Geral" shot asks for a caption reading', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  const which = await pickFiles(page, [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await which.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  const chip = which.getByRole('button', { name: 'Pessoas na foto' });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await which.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(which).toHaveCount(0);
  const batch = await devicePhotos(page, database);
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path.endsWith('/people_in_photo')).length, { timeout: 15_000 }).toBe(2);
  const marks = (await outbox(page)).filter((op) => op.path.endsWith('/people_in_photo'));
  expect(marks.map((op) => op.path).sort()).toEqual(batch.map((photo) => `file/${photo.id}/people_in_photo`).sort());
  expect(marks.every((op) => op.value === true)).toBe(true);
  expect(new Set(marks.map((op) => op.batch_id)).size).toBe(1);
  for (const photo of batch) await expect(itemOf(page, photo.id).getByRole('button', { name: 'Pessoas na foto' })).toHaveAttribute('aria-pressed', 'true');
  // Ledger 1131: a marked batch never asks for a caption reading.
  expect(await readingPuts(page)).toEqual([]);
  for (const photo of batch) expect(photo.reading_status).toBe('none');

  // The gallery's camera: a "Geral" shot, created asking for the vision caption.
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(3);
  const shot = (await devicePhotos(page, database)).find((photo) => !batch.some((b) => b.id === photo.id))!;
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path === `file/${shot.id}`)!;
  expect(create.value).toMatchObject({ block_id: null, caption: null, reading_kind: 'caption', reading_target: null, reading_status: 'queued', people_in_photo: false });
});

test('@p0 9.3-E2E-004 ledger 1131: a batch answered "Geral" with "Adicionar" asks for its caption readings only then, in one batch', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await openGallery(page, relatorioId);
  const which = await pickFiles(page, [await plainJpeg(page, 'a.jpg'), await plainJpeg(page, 'b.jpg')]);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);

  // Saved, the sheet still open: no reading asked for yet.
  expect(await readingPuts(page)).toEqual([]);
  for (const photo of await devicePhotos(page, database)) expect(photo.reading_status).toBe('none');

  await which.getByRole('radio', { name: 'Geral (sem equipamento)' }).click();
  await which.getByRole('button', { name: 'Adicionar 2 fotos' }).click();
  await expect(which).toHaveCount(0);
  await expect.poll(async () => (await readingPuts(page)).length, { timeout: 15_000 }).toBe(2);
  const batch = await devicePhotos(page, database);
  const asked = await readingPuts(page);
  expect(asked.map((op) => op.path).sort()).toEqual(batch.map((photo) => `file/${photo.id}/reading_kind`).sort());
  expect(asked.every((op) => op.value === 'caption')).toBe(true);
  expect(new Set(asked.map((op) => op.batch_id)).size).toBe(1);
  // No other put: "Geral" and no caption leave the saved values as they are.
  expect((await outbox(page)).filter((op) => op.kind === 'put' && op.path.startsWith('file/')).length).toBe(2);
  for (const photo of batch) expect(photo.reading_status).toBe('queued');
});
