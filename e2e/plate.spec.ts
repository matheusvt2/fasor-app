import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, horizontalOverflow, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';
import { holdPhotoBytes, openTransformerSheet, pushPlateSuggestions, pushReadingStatus, transformerPlateFields } from './support/reading-ops.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
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
  // F-13 (review 2026-10-06): queued with the server reachable already reads "Lendo…"; the
  // waiting words are for a device without signal (8.2-E2E-001, offline).
  await expect(plateRow(page).locator('.reading-line')).toHaveText('Lendo…');
  await expect(plateRow(page).locator('.queued-banner')).toHaveCount(0);

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
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ photo_id: photoId, reading_status: 'running' }) });
  });
  const retry = plateRow(page).getByRole('button', { name: 'Tentar novamente' });
  await retry.click();
  await expect.poll(() => rereads).toEqual([`POST /api/photos/${photoId}/reread`]);
  // E78-Q5: from the tap the button waits for the reading to move; a second tap sends nothing.
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect(retry).toHaveAccessibleDescription('Nova leitura pedida');
  await retry.click({ force: true });
  await page.waitForTimeout(1_000);
  expect(rereads).toEqual([`POST /api/photos/${photoId}/reread`]);
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  // The reading ends failed again (a new status op over `failed`): pulled without leaving the
  // sheet (an `online` event runs one sync cycle), the button is back.
  await pushReadingStatus(account.companyId, ids.relatorioId, photoId, 'failed');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await expect(plateRow(page).locator('.reading-line')).toHaveText('Não foi possível ler');

  // "Preencher manualmente" hands over to the first empty field.
  await plateRow(page).getByRole('button', { name: 'Preencher manualmente' }).click();
  await expect(field(page, 'identificacao').locator('input')).toBeFocused();
});

test('@p0 8.6-E2E-001 Flow 2b: the arrival toast opens the sheet, the crop outlines the focused field, one tap confirms eight, "Criar Celtta?" works offline and the Verificar field is fixed by hand', async ({ page, context }) => {
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

  // The reading job's run over the fixture plate: eleven suggestions, TENSÃO NOMINAL AT a replace.
  const sid = await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId,
    fields: transformerPlateFields(['tensao_nominal_at']),
  });

  // The pull brings one reading: the toast says so, and "Ver" opens the sheet it fills.
  await syncNow(page);
  await expect(toast(page)).toContainText('1 leitura pronta para confirmar', { timeout: 30_000 });
  await toast(page).getByRole('button', { name: 'Ver' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}$`));

  // The sheet's banner, the crop above the fields (at most 160 px) and the note naming the photo.
  await expect(page.locator('[data-banner="suggestions-ready"]')).toContainText('Sugestões prontas — 11 campos para confirmar');
  const crop = section(page).getByRole('img', { name: 'Recorte da placa lida — as regiões marcam os campos sugeridos' });
  await expect(crop).toBeVisible();
  const cropBox = (await crop.boundingBox())!;
  expect(cropBox.height).toBeLessThanOrEqual(160);
  expect(cropBox.y + cropBox.height).toBeLessThanOrEqual((await section(page).locator('.nameplate-grid').boundingBox())!.y);
  await expect(section(page).locator('.plate-crop-view img')).toBeVisible();
  await expect(plateRow(page)).toHaveCount(0);
  await expect(section(page).locator('.suggestion-group-head .section-note')).toHaveText(
    '11 sugestões lidas da foto 1. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.',
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

  // "Confirmar todos (8)": the eight grounded fields without a hint in one batch; the
  // replace, Verificar and Criar wait for their own taps.
  await section(page).locator('.suggestion-group-head').getByRole('button', { name: 'Confirmar todos (8)' }).click();
  await expect(toast(page)).toContainText('8 campos confirmados — 1 campo pede verificação');
  const eight = ['identificacao', 'n_serie', 'tipo', 'tipo_de_isolacao', 'potencia_nominal', 'data_fabricacao', 'tensao_nominal_bt', 'ligacao_secundaria'];
  await expect.poll(async () => (await outbox(page)).filter((row) => row.path.startsWith('suggestion/')).length).toBe(8);
  let rows = await outbox(page);
  const confirmAll = rows.filter((row) => eight.some((key) => row.path === `suggestion/${sid[key]}/status` || row.path === `sheet/${ids.blockId}/nameplate/${key}`));
  expect(confirmAll).toHaveLength(16);
  expect(new Set(confirmAll.map((row) => row.batch_id)).size).toBe(1);
  expect(rows.filter((row) => row.batch_id === confirmAll[0]!.batch_id)).toHaveLength(16);
  for (const key of eight) expect(rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/${key}`)?.meta).toMatchObject({ source_suggestion_id: sid[key] });
  await expect(field(page, 'tensao_nominal_at').locator('.suggestion-alt')).toContainText('Sugerido: 15 kV');
  await expect(at).toHaveValue('13,8');
  // A field confirmed from the plate still outlines its own region while the crop stays.
  await field(page, 'tipo').locator('input').focus();
  await expect(crop.locator('.region')).toHaveCount(1);

  // Offline, "Criar Celtta?" creates the manufacturer and confirms the field in one batch.
  await context.setOffline(true);
  const fab = suggestionOf(page, 'fabricacao');
  // E78-Q13: the accessible name starts with the visible words (label in name).
  const criar = fab.getByRole('button', { name: 'Criar Celtta?, sugerido' });
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

  // The Verificar field: the wrong digit fixed with two keystrokes, then its Confirmar.
  const tap = suggestionOf(page, 'tap_atual');
  await expect(tap).toHaveAttribute('data-state', 'verify');
  const guess = tap.locator('input.sv');
  await expect(guess).toHaveValue('5');
  await guess.click();
  await guess.press('End');
  await guess.press('Backspace');
  await guess.press('3');
  await tap.getByRole('button', { name: 'Verificar, 5, confirmar' }).click();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `suggestion/${sid.tap_atual}/status`)).toBe(true);
  rows = await outbox(page);
  const discard = rows.find((row) => row.path === `suggestion/${sid.tap_atual}/status`)!;
  const typed = rows.find((row) => row.path === `sheet/${ids.blockId}/nameplate/tap_atual`)!;
  expect(discard.value).toBe('discarded');
  expect(typed.value).toBe('3');
  // Contract 12: a plain put carries only the commit stamps (`merge/stamp.ts`), never a confirm's meta.
  expect(typed.meta?.source_suggestion_id).toBeUndefined();
  expect(typed.meta?.auto).toBeUndefined();
  expect(typed.batch_id).toBe(discard.batch_id);
  expect(rows.filter((row) => row.batch_id === discard.batch_id)).toHaveLength(2);

  // Exactly the Story 8.1 batches: the typed-first value, 8 pairs, Criar, the fix.
  const plateWrites = rows.filter((row) => row.path.startsWith(`sheet/${ids.blockId}/nameplate/`) || row.path.startsWith('suggestion/') || row.path.startsWith('registry/'));
  expect(plateWrites).toHaveLength(1 + 16 + 3 + 2);
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

test('@p1 8.6-E2E-002 a manufacturer typed over a guess is created with the typed value; a create hint naming a registered manufacturer is a plain Confirmar', async ({ page }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  const photoId = '019966b0-00a0-7000-8000-000000000002';
  const target = `sheet/${ids.blockId}/nameplate/fabricacao`;
  const hint = (name: string) => ({ create_registry_entry: { kind: 'manufacturer' as const, name } });
  const first = await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId,
    fields: { fabricacao: { value: 'Celtta', bbox: [0.1, 0.1, 0.4, 0.2], hint: hint('Celtta') } },
  });
  await syncNowAndReturn(page);

  // Typed over the guess, a name the registry does not hold: one batch, create + put + discard.
  const guess = suggestionOf(page, 'fabricacao').locator('input.sv');
  await guess.fill('Marca Nova');
  // Edited, the guess no longer offers to create the manufacturer it read.
  await expect(suggestionOf(page, 'fabricacao').getByRole('button', { name: 'Sugerido, Celtta, confirmar' })).toHaveText('Confirmar');
  await guess.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `suggestion/${first.fabricacao}/status`)).toBe(true);
  let rows = await outbox(page);
  const discard = rows.find((row) => row.path === `suggestion/${first.fabricacao}/status`)!;
  expect(discard.value).toBe('discarded');
  const typedBatch = rows.filter((row) => row.batch_id === discard.batch_id);
  expect(typedBatch.map((row) => row.path.split('/')[0]).sort()).toEqual(['registry', 'sheet', 'suggestion']);
  expect(typedBatch.find((row) => row.path.startsWith('registry/manufacturer/'))).toMatchObject({ kind: 'create', value: { name: 'Marca Nova' } });
  const typedPut = typedBatch.find((row) => row.path === target)!;
  expect(typedPut.value).toBe('Marca Nova');
  // Contract 12: a plain put carries only the commit stamps (`merge/stamp.ts`), never a confirm's meta.
  expect(typedPut.meta?.source_suggestion_id).toBeUndefined();
  expect(typedPut.meta?.auto).toBeUndefined();
  await syncNowAndReturn(page);

  // The office empties the field; a new reading hints "Marca Nova", which the registry now holds.
  // Story 10.1: the office saw the typed value (its `prev_op_id`), so the clear is a sequential
  // edit; with no `prev_op_id` it would be a concurrent empty, which "filled beats empty" drops.
  await pushDrafts(page, database, [{ ...officeDraft(account, { relatorioId: ids.relatorioId }, target, null), prev_op_id: typedPut.op_id }]);
  const second = await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId,
    fields: { fabricacao: { value: 'Marca Nova', bbox: [0.1, 0.1, 0.4, 0.2], hint: hint('Marca Nova') } },
  });
  await syncNowAndReturn(page);
  const confirm = suggestionOf(page, 'fabricacao').getByRole('button', { name: 'Sugerido, Marca Nova, confirmar' });
  await expect(confirm).toHaveText('Confirmar');
  await confirm.click();
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `suggestion/${second.fabricacao}/status`)).toBe(true);
  rows = await outbox(page);
  const status = rows.find((row) => row.path === `suggestion/${second.fabricacao}/status`)!;
  const pair = rows.filter((row) => row.batch_id === status.batch_id);
  expect(pair.map((row) => row.path).sort()).toEqual([target, `suggestion/${second.fabricacao}/status`].sort());
  expect(rows.filter((row) => row.path.startsWith('registry/manufacturer/') && (row.value as { name?: string } | null)?.name === 'Marca Nova')).toHaveLength(1);
});
