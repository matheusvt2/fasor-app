import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, horizontalOverflow, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';
import { holdPhotoBytes, openTransformerSheet, pushPlateSuggestions, pushReadingStatus } from './support/reading-ops.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * 8.2/8.6-E2E: photograph the plate, keep it until there is signal, confirm it in one tap.
 * Every test resets Empresa B, pushes a relatório of the standard template and opens one of
 * its sheets. From there it is a person's taps: "Fotografar placa" and one shutter (the
 * Chromium fake camera stands in for the tablet's), the reading line under the photo, the
 * arrival toast, the plate crop, "Confirmar todos", "Criar Celtta?" and a Verificar field
 * fixed by hand. The reading job's own writes (`reading_status`, the suggestions of one run)
 * are seeded as the server writes them (`support/reading-ops.ts`; the job is Story 8.4's),
 * and the photo bytes are held on the device where a real upload would start that job.
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
  op_id: string;
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  meta: { source_suggestion_id?: string; auto?: boolean } | null;
  status: string;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const toast = (page: Page) => page.getByTestId('toast');
const section = (page: Page) => page.locator('#ficha-nameplate');
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);
const suggestionOf = (page: Page, key: string): Locator => field(page, key).locator('.field.suggestion-field');
const plateRow = (page: Page) => section(page).locator('.photo-row.ficha-np-photo');

/** "Fotografar placa", one shutter: the camera closes by itself. Returns the new photo's id. */
async function shootPlate(page: Page): Promise<string> {
  const before = new Set((await devicePhotos(page, database)).map((photo) => photo.id));
  const tile = section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' });
  await tile.click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => !before.has(photo.id)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!.id;
}

/** The device's plate photo create, as the outbox holds it. */
async function plateCreate(page: Page, photoId: string): Promise<OutboxRow | undefined> {
  return (await outbox(page)).find((row) => row.kind === 'create' && row.path === `file/${photoId}`);
}

test('@p0 8.2-E2E-001 offline, "Fotografar placa" takes one shot and closes; the photo is kept and queued with its reading, and the fields stay typeable', async ({ page, context }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  // Empty plate: the tile sits above the always-visible fields, no "Digitar".
  await expect(section(page).locator('.camera-group .camera-capture-tile')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Digitar' })).toHaveCount(0);
  const tileBox = (await section(page).locator('.camera-capture-tile').boundingBox())!;
  const gridBox = (await section(page).locator('.nameplate-grid').boundingBox())!;
  expect(tileBox.y + tileBox.height).toBeLessThanOrEqual(gridBox.y);

  await context.setOffline(true);
  const photoId = await shootPlate(page);

  // One create in the outbox, carrying the plate reading, captioned, targeted at the sheet.
  const create = (await plateCreate(page, photoId))!;
  expect(create.value).toMatchObject({
    kind: 'photo',
    block_id: ids.blockId,
    item_key: null,
    caption: 'placa de identificação',
    reading_kind: 'plate',
    reading_target: { block_id: ids.blockId, block_type: 'chave_seccionadora' },
    reading_status: 'queued',
  });
  expect(create.status).toBe('pending');

  // The row replaces the tile: the photo, its caption, and the queued line with the note.
  await expect(section(page).locator('.camera-capture-tile')).toHaveCount(0);
  await expect(plateRow(page).locator('.photo-caption')).toHaveText('placa de identificação');
  await expect(plateRow(page).locator('.photo-meta')).toContainText('Nº provisório 1');
  await expect(plateRow(page).locator('.queued-banner')).toHaveText('Foto guardada — leitura quando houver sinal');
  await expect(section(page).locator('.section-note')).toContainText('Os campos continuam digitáveis; o que você digitar não é sobrescrito pela leitura.');

  // The fields stay typeable meanwhile.
  const serie = field(page, 'n_serie').locator('input');
  await serie.fill('SU-OFF-1');
  await serie.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie` && row.value === 'SU-OFF-1')).toBe(true);

  // Back online, the gallery lists the plate photo like any other.
  await holdPhotoBytes(page);
  await context.setOffline(false);
  await page.goto(`/relatorio/${ids.relatorioId}/fotos`);
  await expect(page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${photoId}"]`)).toBeVisible({ timeout: 30_000 });
});

test('@p0 8.2-E2E-002 the reading line follows the server: "Lendo…", then "Não foi possível ler" with "Tentar novamente" (the reread route) and "Preencher manualmente"', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  const photoId = await shootPlate(page);
  // The create goes out (the bytes stay here, see `holdPhotoBytes`).
  await syncNowAndReturn(page);
  await expect(plateRow(page).locator('.queued-banner')).toBeVisible();

  await pushReadingStatus(account.companyId, ids.relatorioId, photoId, 'running');
  await syncNowAndReturn(page);
  await expect(plateRow(page).locator('.reading-line')).toHaveText('Lendo…');
  await expect(plateRow(page).locator('.queued-banner')).toHaveCount(0);

  await pushReadingStatus(account.companyId, ids.relatorioId, photoId, 'failed');
  await syncNowAndReturn(page);
  await expect(plateRow(page).locator('.reading-line')).toHaveText('Não foi possível ler');
  // The photo stays, and nothing was written on the plate.
  expect((await devicePhotos(page, database)).map((photo) => photo.id)).toContain(photoId);
  expect((await outbox(page)).some((row) => row.path.startsWith(`sheet/${ids.blockId}/nameplate/`))).toBe(false);

  // "Tentar novamente" asks for a new reading (Story 8.4's route, answered here until it ships).
  const rereads: string[] = [];
  await page.route('**/api/photos/*/reread', async (route) => {
    rereads.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' });
  });
  await plateRow(page).getByRole('button', { name: 'Tentar novamente' }).click();
  await expect.poll(() => rereads).toEqual([`POST /api/photos/${photoId}/reread`]);

  // "Preencher manualmente" hands over to the first empty field.
  await plateRow(page).getByRole('button', { name: 'Preencher manualmente' }).click();
  await expect(field(page, 'identificacao').locator('input')).toBeFocused();
});

test('@p0 8.6-E2E-001 Flow 2b: the arrival toast opens the sheet, the crop outlines the focused field, one tap confirms seven, "Criar Celtta?" works offline and the Verificar field is fixed by hand', async ({ page, context }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);

  // The engineer types TENSÃO NOMINAL AT before the reading comes.
  const at = field(page, 'tensao_nominal_at').locator('input');
  await at.fill('13,8');
  await at.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${ids.blockId}/nameplate/tensao_nominal_at`)).toBe(true);

  const photoId = await shootPlate(page);
  await syncNow(page);

  // The reading job's run over the fixture plate (`services/ocr/tests/fixtures/plate-transformador.md`).
  const box = (row: number, col: number): [number, number, number, number] => [0.05 + col * 0.45, 0.12 + row * 0.12, 0.45 + col * 0.45, 0.2 + row * 0.12];
  const sid = await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId,
    fields: {
      fabricacao: { value: 'Celtta', bbox: box(0, 1), hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } } },
      n_serie: { value: '240815-01', trust: 'verify', bbox: box(1, 0) },
      tipo: { value: 'TSE-500/15', bbox: box(1, 1) },
      tipo_de_isolacao: { value: 'EPÓXI', bbox: box(2, 0) },
      potencia_nominal: { value: { raw: '500', unit: 'kVA', state: 'measured' }, bbox: box(2, 1) },
      tap_atual: { value: '3', bbox: box(3, 0) },
      data_fabricacao: { value: '2024-08', bbox: box(3, 1) },
      tensao_nominal_at: { value: { raw: '15', unit: 'kV', state: 'measured' }, bbox: box(4, 0) },
      tensao_nominal_bt: { value: { raw: '380', unit: 'V', state: 'measured' }, bbox: box(4, 1) },
      ligacao_secundaria: { value: 'Dyn1', bbox: box(5, 0) },
    },
  });

  // The pull brings one reading: the toast says so, and "Ver" opens the sheet it fills.
  await syncNow(page);
  await expect(toast(page)).toContainText('1 leitura pronta para confirmar', { timeout: 30_000 });
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}$`));

  // The sheet's banner, the crop above the fields (at most 160 px) and the note naming the photo.
  await expect(page.locator('[data-banner="suggestions-ready"]')).toContainText('Sugestões prontas — 10 campos para confirmar');
  const crop = section(page).getByRole('img', { name: 'Recorte da placa lida — as regiões marcam os campos sugeridos' });
  await expect(crop).toBeVisible();
  const cropBox = (await crop.boundingBox())!;
  expect(cropBox.height).toBeLessThanOrEqual(160);
  expect(cropBox.y + cropBox.height).toBeLessThanOrEqual((await section(page).locator('.nameplate-grid').boundingBox())!.y);
  await expect(section(page).locator('.plate-crop-view img')).toBeVisible();
  await expect(plateRow(page)).toHaveCount(0);
  await expect(section(page).locator('.suggestion-group-head .section-note')).toHaveText(
    '10 sugestões lidas da foto 1. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.',
  );

  // Focusing a suggested field outlines its one region on the crop.
  await expect(crop.locator('.region')).toHaveCount(0);
  await suggestionOf(page, 'tipo').locator('input.sv').focus();
  await expect(crop.locator('.region')).toHaveCount(1);
  await suggestionOf(page, 'tap_atual').locator('input.sv').focus();
  await expect(crop.locator('.region')).toHaveCount(1);

  // The typed field keeps its value and offers the reading beside it.
  await expect(at).toHaveValue('13,8');
  await expect(field(page, 'tensao_nominal_at').locator('.suggestion-alt')).toContainText('Sugerido: 15 kV');
  await expect(field(page, 'tensao_nominal_at').locator('.suggestion-alt').getByRole('button', { name: 'Substituir' })).toBeVisible();

  // "Confirmar todos (7)": the seven grounded fields in one batch; Verificar and Criar wait.
  await section(page).locator('.suggestion-group-head').getByRole('button', { name: 'Confirmar todos (7)' }).click();
  await expect(toast(page)).toContainText('7 campos confirmados — 1 campo pede verificação');
  const seven = ['tipo', 'tipo_de_isolacao', 'potencia_nominal', 'tap_atual', 'data_fabricacao', 'tensao_nominal_bt', 'ligacao_secundaria'];
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('suggestion/')).length).toBe(7);
  let rows = await outbox(page);
  const confirmAll = rows.filter((row) => seven.some((key) => row.path === `suggestion/${sid[key]}/status` || row.path === `sheet/${ids.blockId}/nameplate/${key}`));
  expect(confirmAll).toHaveLength(14);
  expect(new Set(confirmAll.map((row) => row.batch_id)).size).toBe(1);
  for (const key of seven) expect(rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/${key}`)?.meta).toMatchObject({ source_suggestion_id: sid[key] });
  await expect(field(page, 'tensao_nominal_at').locator('.suggestion-alt')).toContainText('Sugerido: 15 kV');
  await expect(at).toHaveValue('13,8');

  // Offline, "Criar Celtta?" creates the manufacturer and confirms the field in one batch.
  await context.setOffline(true);
  const fab = suggestionOf(page, 'fabricacao');
  const criar = fab.getByRole('button', { name: 'Sugerido, Celtta, confirmar' });
  await expect(criar).toHaveText('Criar Celtta?');
  await criar.click();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `suggestion/${sid.fabricacao}/status`)).toBe(true);
  rows = await outbox(page);
  const status = rows.find((row) => row.path === `suggestion/${sid.fabricacao}/status`)!;
  const put = rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/fabricacao`)!;
  const registry = rows.find((row) => row.kind === 'create' && row.path.startsWith('registry/manufacturer/') && (row.value as { name?: string }).name === 'Celtta')!;
  expect(status.value).toBe('confirmed');
  expect(put).toMatchObject({ value: 'Celtta', meta: { source_suggestion_id: sid.fabricacao } });
  expect(registry).toBeDefined();
  expect(new Set([status.batch_id, put.batch_id, registry.batch_id]).size).toBe(1);
  expect(rows.filter((row) => row.batch_id === status.batch_id)).toHaveLength(3);

  // The Verificar field: one wrong digit fixed with two keystrokes, then its Confirmar.
  const serie = suggestionOf(page, 'n_serie');
  await expect(serie).toHaveAttribute('data-state', 'verify');
  const guess = serie.locator('input.sv');
  await expect(guess).toHaveValue('240815-01');
  await guess.click();
  await guess.press('End');
  await guess.press('Backspace');
  await guess.press('7');
  await serie.getByRole('button', { name: 'Verificar, 240815-01, confirmar' }).click();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `suggestion/${sid.n_serie}/status`)).toBe(true);
  rows = await outbox(page);
  const discard = rows.find((row) => row.path === `suggestion/${sid.n_serie}/status`)!;
  const typed = rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie`)!;
  expect(discard.value).toBe('discarded');
  expect(typed.value).toBe('240815-07');
  expect(typed.meta ?? null).toBeNull();
  expect(typed.batch_id).toBe(discard.batch_id);
  expect(rows.filter((row) => row.batch_id === discard.batch_id)).toHaveLength(2);

  // Exactly the Story 8.1 batches: the typed-first value, the photo, 7 pairs, Criar, the fix.
  const plateWrites = rows.filter((row) => row.path.startsWith(`sheet/${ids.blockId}/nameplate/`) || row.path.startsWith('suggestion/') || row.path.startsWith('registry/'));
  expect(plateWrites).toHaveLength(1 + 14 + 3 + 2);
  // The one replace still waits for its own tap, the engineer's value untouched.
  await expect(at).toHaveValue('13,8');
  await context.setOffline(false);
});

test('@p1 8.2-E2E-003 Sync status counts the readings in the queue and the suggestions to confirm; the sheet says "Sugestões prontas"', async ({ page, context }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  // Three suggestions of an earlier reading (a photo taken on another device).
  await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId: '019966b0-00a0-7000-8000-000000000001',
    fields: {
      fabricacao: { value: 'Schneider', bbox: [0.1, 0.1, 0.4, 0.2] },
      n_serie: { value: 'SU1240998', bbox: [0.1, 0.3, 0.4, 0.4] },
      tipo: { value: 'Manual', bbox: [0.1, 0.5, 0.4, 0.6] },
    },
  });
  await syncNowAndReturn(page);
  await expect(page.locator('[data-banner="suggestions-ready"]')).toContainText('Sugestões prontas — 3 campos para confirmar');

  // Offline, a plate photo waits for its reading.
  await context.setOffline(true);
  await shootPlate(page);
  await syncBadge(page).click();
  const readings = page.getByTestId('sync-readings');
  await expect(readings.getByRole('heading', { name: 'Leituras' })).toBeVisible();
  await expect(page.getByTestId('sync-readings-queued')).toHaveText('1 leitura na fila');
  await expect(page.getByTestId('sync-suggestions-pending')).toHaveText('3 sugestões por confirmar');
  await context.setOffline(false);
});

test('@p1 8.2-E2E-004 the plate group with its photo row and its crop fits 390 px without a sideways scroll', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database, { width: 390 });
  await expect(section(page).locator('.camera-group .camera-capture-tile')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const photoId = await shootPlate(page);
  await expect(plateRow(page)).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  await syncNow(page);
  await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId,
    fields: { fabricacao: { value: 'Schneider Electric do Brasil', bbox: [0.1, 0.1, 0.9, 0.2] }, n_serie: { value: 'SU1240998', bbox: [0.1, 0.3, 0.5, 0.4], trust: 'verify' } },
  });
  await syncNow(page);
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(section(page).locator('.plate-crop')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const cropBox = (await section(page).locator('.plate-crop').boundingBox())!;
  expect(cropBox.x).toBeGreaterThanOrEqual(0);
  expect(cropBox.x + cropBox.width).toBeLessThanOrEqual(390);
});
