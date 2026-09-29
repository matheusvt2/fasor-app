import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes, pushReadingStatus, READING_ACTOR, serverRow } from './support/reading-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * 9.2-E2E: "Fotografar equipamento", driven as a person does it. The field Block palette's
 * first row opens the camera (no camera on this browser: the system picker gets the synthetic
 * panel front), the shot is saved as a panel photo and the result dialog opens on it. Online,
 * the panel suggestion is written the way the reading job writes it (`pushSuggestion`, the
 * photo's bytes held on the device so no real job runs beside it) and arrives with the next
 * cycle; one tap creates equipment + block and re-targets the same photo to the new block's
 * plate, all in one batch. Offline, the type chips alone give the block. The real job is
 * `panel-capture-pipeline.spec.ts`.
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

const PANEL = readFileSync(resolve(import.meta.dirname, '../apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'));

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const menuOf = (page: Page, name: string) => page.getByRole('button', { name: `Mais opções de ${name}`, exact: true });
const result = (page: Page) => page.getByRole('dialog', { name: 'Fotografar equipamento' });

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
  batch_id: string | null;
}

interface EntityRecord {
  entity: string;
  id: string;
  row: { kind?: string; reading_kind?: string | null; reading_status?: string; block_id?: string | null; caption?: string | null; reading_target?: unknown; block_type?: string; location_id?: string };
}

/** Resets Empresa B, signs in, opens the Sumário of a relatório pushed from the office with section 9 and 1° Subsolo open. */
async function openRelatorio(page: Page, width: number): Promise<{ relatorioId: string }> {
  await resetCompany(account, { standard: true });
  await page.setViewportSize({ width, height: 900 });
  await signIn(page, account.email);
  const ids = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${ids.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  return ids;
}

/** Opens the field palette on Coluna 1 and checks its first row is the camera tile. */
async function openPalette(page: Page): Promise<Locator> {
  await menuOf(page, 'Coluna 1').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.getByText('Em: 1° Subsolo › Coluna 1')).toBeVisible();
  const tile = palette.locator('.pal-camera .camera-capture-tile');
  await expect(tile).toHaveText('Fotografar equipamento');
  await expect(tile).toHaveAccessibleDescription('Uma foto da frente do painel: tipo, coluna e TAG sugeridos; a mesma foto vira a placa da ficha.');
  // The camera row comes first, above "Ou escolha o tipo" and the eight types.
  const order = await palette.locator('.pal-camera, .palette-group:not(.palette-where), .pf-field').evaluateAll((nodes) =>
    nodes.map((node) => (node.classList.contains('pal-camera') ? 'camera' : node.classList.contains('palette-group') ? node.textContent : 'type')),
  );
  expect(order).toEqual(['camera', 'Ou escolha o tipo · TAG sugerida por tipo + coluna', ...Array(8).fill('type')]);
  return palette;
}

/** Taps "Fotografar equipamento": the system picker gets the panel front; returns the photo id once it is on the device. */
async function shootPanel(page: Page, palette: Locator): Promise<string> {
  const chooser = page.waitForEvent('filechooser');
  await palette.getByRole('button', { name: 'Fotografar equipamento' }).click();
  await (await chooser).setFiles({ name: 'painel.png', mimeType: 'image/png', buffer: PANEL });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database))[0]!.id;
}

/** The one batch the confirm wrote: equipment + block creates, the four photo puts, and (online) the suggestion's status. */
async function confirmBatch(page: Page, photoId: string): Promise<{ ops: OutboxRow[]; blockId: string; equipmentTag: string }> {
  const outbox = await readStore<OutboxRow>(page, database, 'outbox');
  const put = outbox.find((op) => op.path === `file/${photoId}/reading_kind`)!;
  expect(put).toBeDefined();
  const ops = outbox.filter((op) => op.batch_id === put.batch_id);
  const block = ops.find((op) => op.kind === 'create' && op.path.startsWith('block/'))!;
  const equipment = ops.find((op) => op.kind === 'create' && op.path.startsWith('equipment/'))!;
  return { ops, blockId: (block.value as { id: string }).id, equipmentTag: (equipment.value as { tag: string }).tag };
}

async function photoRecord(page: Page, photoId: string): Promise<EntityRecord['row']> {
  const records = await readStore<EntityRecord>(page, database, 'entities');
  return records.find((record) => record.entity === 'file' && record.id === photoId)!.row;
}

test('@p0 9.2-E2E-001 online: the panel suggestion reads "Criar SEC-C09-2 · Chave seccionadora · Coluna 9?", and one tap creates the block with the photo as its plate, in one batch', async ({ page, context }) => {
  test.setTimeout(150_000);
  const { relatorioId } = await openRelatorio(page, 768);
  // SEC-C09 is taken first (a Chave seccionadora placed on Coluna 9 from its palette), so the read one is SEC-C09-2.
  await menuOf(page, 'Coluna 9').click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  await page.getByRole('dialog', { name: 'Adicionar bloco' }).getByRole('button', { name: /^Chave seccionadora/ }).click();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C09']);
  await holdPhotoBytes(page);
  const photoId = await shootPanel(page, await openPalette(page));

  const dialog = result(page);
  await expect(dialog).toBeVisible();
  // Online, the server reads the photo; the chips are usable meanwhile.
  await expect(dialog.getByRole('status')).toHaveText('Lendo a foto…');
  await expect(dialog.locator('.chip-row .chip')).toHaveCount(8);
  await expect(dialog.locator('.suggestion-field')).toHaveCount(0);
  const created = await photoRecord(page, photoId);
  expect(created).toMatchObject({ reading_kind: 'panel', reading_status: 'queued', block_id: null, reading_target: { location_id: expect.any(String) } });

  // The reading job's suggestion, as it writes it, then the next cycle (the signal dropping and coming back).
  const suggestionId = await pushSuggestion(account.companyId, relatorioId, {
    targetPath: `file/${photoId}/block_id`,
    value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
    photoId,
    bbox: [0.13, 0.13, 0.71, 0.54],
    actorId: READING_ACTOR,
  });
  await context.setOffline(true);
  await context.setOffline(false);

  const field = dialog.locator('.suggestion-field');
  await expect(field.locator('.sv-main')).toHaveText('Criar SEC-C09-2 · Chave seccionadora · Coluna 9?', { timeout: 60_000 });
  await expect(field.locator('.sv-sub')).toHaveText('1° Subsolo › Coluna 9');
  await expect(field).toHaveAttribute('data-state', 'suggested');
  await expect(field.locator('.suggested-pill')).toHaveText('Sugerido');
  await expect(field.getByRole('button', { name: 'Ver recorte da etiqueta' })).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(dialog.getByRole('list', { name: 'Origem de cada sugestão' }).locator('li')).toHaveText([
    'Tipofrente do painel',
    'Colunaetiqueta "C09" na foto',
    'TAGtipo + coluna · SEC-C09 já existe',
  ]);
  await expect(dialog.getByText('Tipo errado? Toque no certo')).toBeVisible();
  const chips = dialog.locator('.chip-row.chips-recent .chip');
  await expect(chips).toHaveText(['Chave seccionadora', 'Disjuntor MT', /^TP/, /^TC/, 'Outro…']);
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.helper')).toHaveText('A foto entra na ficha como placa de identificação e na fila de leitura.');

  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C09', 'SEC-C09-2']);
  await expect(page.locator('.toast')).toContainText('SEC-C09-2 criada na Coluna 9');

  const { ops, blockId, equipmentTag } = await confirmBatch(page, photoId);
  expect(equipmentTag).toBe('SEC-C09-2');
  expect(ops.map((op) => [op.kind, op.path.replace(/^(equipment|block)\/.*/, '$1'), op.value])).toEqual([
    ['create', 'equipment', expect.anything()],
    ['create', 'block', expect.anything()],
    ['put', `file/${photoId}/block_id`, blockId],
    ['put', `file/${photoId}/caption`, 'placa de identificação'],
    ['put', `file/${photoId}/reading_target`, { block_id: blockId, block_type: 'chave_seccionadora' }],
    ['put', `file/${photoId}/reading_kind`, 'plate'],
    ['put', `suggestion/${suggestionId}/status`, 'confirmed'],
  ]);
  expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);
  expect(await photoRecord(page, photoId)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued', block_id: blockId, caption: 'placa de identificação' });
});

test('@p0 9.2-E2E-002 offline: the type chips alone create the block (type plus column give the TAG) and the photo still becomes its plate', async ({ page, context }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 768);
  await context.setOffline(true);
  const photoId = await shootPanel(page, await openPalette(page));

  const dialog = result(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.btn-reason')).toHaveText('Sem sinal, a foto fica guardada: o bloco é criado pelo tipo e a foto já vira a placa dele.');
  await expect(dialog.getByText('Toque no tipo do equipamento')).toBeVisible();
  const chips = dialog.locator('.chip-row.chips-recent .chip');
  await expect(chips).toHaveCount(8);
  await expect(dialog.locator('.chip-other')).toHaveCount(0);
  // Nothing is proposed until a type is tapped.
  await expect(dialog.locator('.suggestion-field')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Disjuntor MT' }).click();
  await expect(dialog.getByRole('button', { name: 'Disjuntor MT' })).toHaveAttribute('aria-pressed', 'true');
  const field = dialog.locator('.suggestion-field');
  await expect(field.locator('.sv-main')).toHaveText('Criar DJ-C01 · Disjuntor MT · Coluna 1?');
  await expect(dialog.locator('.prov-list')).toHaveCount(0);
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01', 'DJ-C01']);

  const { ops, blockId } = await confirmBatch(page, photoId);
  expect(ops.map((op) => [op.kind, op.path.replace(/^(equipment|block)\/.*/, '$1'), op.value])).toEqual([
    ['create', 'equipment', expect.objectContaining({ tag: 'DJ-C01', type: 'disjuntor_mt' })],
    ['create', 'block', expect.objectContaining({ block_type: 'disjuntor_mt' })],
    ['put', `file/${photoId}/block_id`, blockId],
    ['put', `file/${photoId}/caption`, 'placa de identificação'],
    ['put', `file/${photoId}/reading_target`, { block_id: blockId, block_type: 'disjuntor_mt' }],
    ['put', `file/${photoId}/reading_kind`, 'plate'],
  ]);
  expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);
  expect(await photoRecord(page, photoId)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued', block_id: blockId });
});

test('@p0 9.2-E2E-003 at 390 px the result dialog and its eight chips fit with no horizontal overflow; "Cancelar" removes the unconfirmed photo', async ({ page, context }) => {
  test.setTimeout(120_000);
  await openRelatorio(page, 390);
  await context.setOffline(true);
  const photoId = await shootPanel(page, await openPalette(page));
  const dialog = result(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Transformador de força' }).click();
  await expect(dialog.locator('.suggestion-field .sv-main')).toHaveText(/^Criar TR-\d+ · Transformador de força · Coluna 1\?$/);
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390 + 0.5);
  const row = dialog.locator('.chip-row');
  expect(await row.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  for (const chip of await row.locator('.chip').all()) {
    const chipBox = (await chip.boundingBox())!;
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(390);
  }
  // A bottom sheet on the phone.
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(899);

  // "Fotografar de novo": the first photo is removed, the camera (the system picker) opens again,
  // and the dialog comes back on the new shot, nothing picked yet.
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Fotografar de novo' }).click();
  await expect.poll(async () => (await photoRecord(page, photoId)) as { removed_at?: string | null }).toMatchObject({ removed_at: expect.any(String) });
  await (await chooser).setFiles({ name: 'painel-2.png', mimeType: 'image/png', buffer: PANEL });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  const second = (await devicePhotos(page, database)).find((photo) => photo.id !== photoId)!.id;
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.suggestion-field')).toHaveCount(0);
  await expect(dialog.locator('.chip[aria-pressed="true"]')).toHaveCount(0);

  // "Cancelar" removes the photo the dialog is on now, and the focus lands on the coluna's chevron.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await photoRecord(page, second)) as { removed_at?: string | null }).toMatchObject({ removed_at: expect.any(String) });
  await expect(page.locator('[data-tree-chevron]:focus')).toHaveCount(1);
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01']);
});

/** One sync cycle while the result dialog is up (the Sync badge is under its scrim): the signal dropping and coming back. */
async function cycle(page: Page): Promise<void> {
  await page.context().setOffline(true);
  await page.context().setOffline(false);
}

test('@p1 9.2-E2E-005 online, a panel reading that ends with nothing, or fails, says why under the title and never "Lendo a foto…"; the chips still create the block', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openRelatorio(page, 768);
  await holdPhotoBytes(page);
  const photoId = await shootPanel(page, await openPalette(page));
  const dialog = result(page);
  await expect(dialog.getByRole('status')).toHaveText('Lendo a foto…');
  // The photo row reaches the server (its bytes are held on the device, so no real job runs).
  await cycle(page);
  await expect.poll(() => serverRow(account.companyId, 'file', photoId), { timeout: 60_000 }).toMatchObject({ reading_kind: 'panel' });

  // The reading ended with no suggestion.
  await pushReadingStatus(account.companyId, relatorioId, photoId, 'done');
  await cycle(page);
  // Said in the dialog's live region, where "Lendo a foto…" was.
  await expect(dialog.getByRole('status').locator('.btn-reason')).toHaveText('A foto não mostrou o tipo do equipamento.', { timeout: 60_000 });
  await expect(dialog.getByText('Lendo a foto…')).toHaveCount(0);
  // Read again, and failed this time.
  await pushReadingStatus(account.companyId, relatorioId, photoId, 'failed');
  await cycle(page);
  await expect(dialog.getByRole('status').locator('.btn-reason')).toHaveText('Não foi possível ler a foto.', { timeout: 60_000 });
  await expect(dialog.getByText('Lendo a foto…')).toHaveCount(0);
  expect((await readStore<EntityRecord>(page, database, 'entities')).find((record) => record.entity === 'file' && record.id === photoId)!.row).toMatchObject({ reading_status: 'failed' });

  // The chips give the block all the same.
  await expect(dialog.getByText('Toque no tipo do equipamento')).toBeVisible();
  await dialog.getByRole('button', { name: 'Disjuntor MT' }).click();
  const field = dialog.locator('.suggestion-field');
  await expect(field.locator('.sv-main')).toHaveText('Criar DJ-C01 · Disjuntor MT · Coluna 1?');
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 1'))).toHaveText(['SEC-C01', 'DJ-C01']);
  const { blockId } = await confirmBatch(page, photoId);
  expect(await photoRecord(page, photoId)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued', block_id: blockId });
});

test('@p1 9.2-E2E-006 "Desfazer" right after a photo-backed create removes the block, leaves the photo a plain one and discards the panel suggestion; the server holds it so, no reading queued', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId } = await openRelatorio(page, 768);
  await holdPhotoBytes(page);
  const photoId = await shootPanel(page, await openPalette(page));
  const dialog = result(page);
  await expect(dialog).toBeVisible();
  const suggestionId = await pushSuggestion(account.companyId, relatorioId, {
    targetPath: `file/${photoId}/block_id`,
    value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
    photoId,
    bbox: [0.13, 0.13, 0.71, 0.54],
    actorId: READING_ACTOR,
  });
  await cycle(page);
  const field = dialog.locator('.suggestion-field');
  await expect(field.locator('.sv-main')).toHaveText('Criar SEC-C09 · Chave seccionadora · Coluna 9?', { timeout: 60_000 });
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C09']);
  const { blockId } = await confirmBatch(page, photoId);

  await page.locator('.toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveCount(0);
  // The undo batch: the re-target put back to nothing (never the panel kind again) and the suggestion discarded.
  await expect
    .poll(async () => (await readStore<OutboxRow>(page, database, 'outbox')).filter((op) => op.path === `file/${photoId}/reading_kind`).map((op) => op.value))
    .toEqual(['plate', null]);
  const outbox = await readStore<OutboxRow>(page, database, 'outbox');
  const undoBatch = outbox.filter((op) => op.path === `file/${photoId}/reading_kind`)[1]!.batch_id;
  const undo = outbox.filter((op) => op.batch_id === undoBatch);
  expect(undo.find((op) => op.path === `suggestion/${suggestionId}/status`)?.value).toBe('discarded');
  expect(undo.find((op) => op.path === `file/${photoId}/reading_target`)?.value).toBeNull();
  expect(undo.find((op) => op.path === `file/${photoId}/block_id`)?.value).toBeNull();
  expect(undo.some((op) => op.path === `block/${blockId}/removed_at`)).toBe(true);
  expect(await photoRecord(page, photoId)).toMatchObject({ reading_kind: null, reading_target: null, reading_status: 'none', block_id: null });
  const suggestion = (await readStore<{ entity: string; id: string; row: { status: string } }>(page, database, 'entities')).find((record) => record.entity === 'suggestion' && record.id === suggestionId)!;
  expect(suggestion.row.status).toBe('discarded');

  // "Sincronizar agora": the server holds the same, with no reading queued for the photo.
  await syncNow(page);
  expect(await serverRow(account.companyId, 'file', photoId)).toMatchObject({ reading_kind: null, reading_target: null, reading_status: 'none', block_id: null });
  expect(await serverRow(account.companyId, 'suggestion', suggestionId)).toMatchObject({ status: 'discarded' });
  expect(await serverRow(account.companyId, 'block', blockId)).toMatchObject({ removed_at: expect.any(String) });
});
