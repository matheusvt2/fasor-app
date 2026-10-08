import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';
import { holdPhotoBytes, openTransformerSheet, pushPlateSuggestions, pushReadingStatus, transformerPlateFields } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * R8CAP-E2E (review 2026-10-08, "no photo fails silently"): driven as a person does it, with the
 * Chromium fake camera standing in for the tablet's.
 *
 * - A reading that finds nothing says "Nada foi lido nesta foto" with "Fotografar de novo" and
 *   the way to type, on the plate and under a "Ler visor" cell (CAPT-V1).
 * - Closing the camera keeps the sheet where it was (DE-2); a single shot says it is saving
 *   until the view closes (DB-4).
 * - A reading whose bytes the server does not hold yet shows no age and no "Cancelar" (DG-4).
 * - A reading landing on a typed nameplate value can be refused: "Manter o digitado", or a
 *   different typed value, discards it (DG-2).
 * - The screen is held awake while a sheet is open, as "Manter a tela ligada" in Conta allows,
 *   and a refusing Screen Wake Lock API costs nothing (FLD-1, E13-A7).
 *
 * The reading job's own writes (`reading_status`, a run's suggestions) are seeded as the server
 * writes them (`support/reading-ops.ts`), with the photo bytes held on the device so no real
 * job runs. Every test resets Empresa B and opens a sheet of a new relatório.
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
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const prefs = (page: Page) => readStore<{ key: string; value: unknown }>(page, database, 'local_prefs');
const nameplate = (page: Page) => page.locator('#ficha-nameplate');
const plateRow = (page: Page) => nameplate(page).locator('.photo-row.ficha-np-photo');
const cameraDialog = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const field = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"]`);

/** The ids of the photos on the device. */
async function photoIds(page: Page): Promise<Set<string>> {
  return new Set((await devicePhotos(page, database)).map((photo) => photo.id));
}

/** One shutter on the open camera, which closes by itself (a single shot); returns the new photo's id. */
async function shootOnce(page: Page, before: Set<string>, done?: 'Concluir' | 'Concluir fotos'): Promise<string> {
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
  if (done !== undefined) await camera.getByRole('button', { name: done, exact: true }).click();
  await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => !before.has(photo.id)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!.id;
}

/** "Fotografar placa", one shot. */
async function shootPlate(page: Page): Promise<string> {
  const before = await photoIds(page);
  await nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  return shootOnce(page, before);
}

test('@p0 R8CAP-E2E-001 a plate reading that read nothing says so, "Preencher manualmente" focuses an empty plate field, and "Fotografar de novo" takes a new plate photo and cancels the old reading', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const first = await shootPlate(page);
  await syncNowAndReturn(page);
  // The reading job ran and found nothing: `done`, and no suggestion row cites the photo.
  await pushReadingStatus(account.companyId, ids.relatorioId, first, 'done');
  await syncNowAndReturn(page);

  const row = plateRow(page);
  await expect(row).toHaveAttribute('data-reading', 'empty');
  await expect(row.locator('.reading-line')).toHaveText('Nada foi lido nesta foto');
  const retake = row.getByRole('button', { name: 'Fotografar de novo' });
  await expect(retake).toBeVisible();

  // "Preencher manualmente": the focus on an empty field of the plate.
  await row.getByRole('button', { name: 'Preencher manualmente' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLInputElement | null;
        return active !== null && active.closest('#ficha-nameplate .nameplate-grid [data-field-key]') !== null && active.value === '';
      }),
    )
    .toBe(true);

  // "Fotografar de novo": the single-shot camera, one shutter, a new plate photo on this block.
  const before = await photoIds(page);
  await retake.click();
  const second = await shootOnce(page, before);
  expect(second).not.toBe(first);
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path === `file/${second}`);
  expect(create?.value).toMatchObject({ kind: 'photo', block_id: ids.blockId, reading_kind: 'plate', reading_status: 'queued', caption: 'placa de identificação' });
  // The new photo is the plate photo now: the empty line is gone, the old reading is cancelled here.
  await expect(plateRow(page).locator('.photo-tile')).toHaveAttribute('data-photo-id', second);
  await expect(plateRow(page).getByText('Nada foi lido nesta foto')).toHaveCount(0);
  await expect(plateRow(page)).not.toHaveAttribute('data-reading', 'empty');
  const keys = (await prefs(page)).map((row) => row.key);
  expect(keys).toContain(`reading_cancelled:${first}`);
  // The new photo's own reading is never cancelled.
  expect(keys).not.toContain(`reading_cancelled:${second}`);
});

test('@p0 R8CAP-E2E-002 a "Ler visor" reading that read nothing says so under its empty cell: "Digitar" focuses the cell, "Fotografar de novo" shoots the same target, and a typed value hides the line', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  const opener = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions').getByRole('button', { name: 'Ler visor' });
  let before = await photoIds(page);
  await opener.click();
  const first = await shootOnce(page, before, 'Concluir');
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, first, 'done');
  await syncNowAndReturn(page);

  const input = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  const cell = page.locator('#ficha-step-ensaios .ficha-cell').filter({ has: input });
  const empty = cell.locator('.reading-empty');
  await expect(empty.locator('.reading-line')).toHaveText('Nada foi lido nesta foto');
  await empty.getByRole('button', { name: 'Digitar' }).click();
  await expect(input).toBeFocused();

  // "Fotografar de novo": one shot of that photo's own target.
  before = await photoIds(page);
  await empty.getByRole('button', { name: 'Fotografar de novo' }).click();
  const second = await shootOnce(page, before);
  const creates = (await outbox(page)).filter((op) => op.kind === 'create' && (op.path === `file/${first}` || op.path === `file/${second}`));
  const targetOf = (id: string) => (creates.find((op) => op.path === `file/${id}`)!.value as { reading_kind: string; reading_target: unknown }).reading_target;
  expect((creates.find((op) => op.path === `file/${second}`)!.value as { reading_kind: string }).reading_kind).toBe('display');
  expect(targetOf(second)).toEqual(targetOf(first));
  await expect(cell.locator('.reading-empty')).toHaveCount(0);

  // That one reads nothing too: the line is back, and a typed value hides it.
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, second, 'done');
  await syncNowAndReturn(page);
  await expect(cell.locator('.reading-empty .reading-line')).toHaveText('Nada foi lido nesta foto');
  await input.fill('147G');
  await input.press('Enter');
  await expect(cell.locator('.reading-empty')).toHaveCount(0);
});

test('@p0 R8CAP-E2E-003 at 768 and at 390 px closing the camera from the Sticky action bar, by "Concluir fotos" and by the close button, keeps the sheet where it was and the focus on the opener', async ({ page, context }) => {
  test.setTimeout(240_000);
  await openChaveSheet(page, account, database, { width: 768 });
  await context.setOffline(true);
  const opener = page.locator('.sticky-action-bar .camera-capture-btn');
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const close of ['Concluir fotos', 'Fechar a câmera sem concluir'] as const) {
      await page.evaluate(() => window.scrollTo(0, 300));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
      const y = await page.evaluate(() => window.scrollY);
      // A finger's tap at the button (a locator click would first scroll it "into view", and the
      // sheet's scroll padding counts the Sticky action bar as covered).
      const box = (await opener.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      const camera = await expectCameraOpen(page);
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - y), `${width} px, opening`).toBeLessThanOrEqual(2);
      await camera.getByRole('button', { name: 'Disparar' }).click();
      await expect(camera.locator('.cam-count')).toContainText('1 foto nesta rajada');
      await camera.getByRole('button', { name: close, exact: true }).click();
      await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
      await expect(opener).toBeFocused();
      // The page never moved.
      await expect.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - y), { message: `${width} px, ${close}` }).toBeLessThanOrEqual(2);
    }
  }
});

test('@p1 R8CAP-E2E-004 a single plate shot says it is saving, the shutter disabled, until the view closes', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  await openTransformerSheet(page, account, database);
  await nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  const camera = await expectCameraOpen(page);
  // A slow device: the shot's checksum takes 3 s, as the encode and store of a large photo can.
  await page.evaluate(() => {
    const real = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = ((...args: Parameters<SubtleCrypto['digest']>) =>
      new Promise<ArrayBuffer>((resolve, reject) => setTimeout(() => real(...args).then(resolve, reject), 3_000))) as SubtleCrypto['digest'];
  });
  await camera.getByRole('button', { name: 'Disparar' }).click();
  await expect(camera.locator('.cam-count')).toHaveText('Salvando a foto…');
  await expect(camera.getByRole('button', { name: 'Disparar' })).toBeDisabled();
  await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
});

test('@p1 R8CAP-E2E-005 a plate photo whose bytes the server does not hold yet reads "Lendo…" with no age, no "Cancelar" and no note past 10 s from its capture (the count from the ack is the kernel and component units\' rule)', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  await openTransformerSheet(page, account, database);
  const plateId = await shootPlate(page);
  await syncNowAndReturn(page);
  const captured = Date.parse((await devicePhotos(page, database)).find((photo) => photo.id === plateId)!.captured_at);
  // Past 10 s since the capture, the server still without the bytes.
  await expect.poll(() => page.evaluate(() => Date.now()), { timeout: 20_000 }).toBeGreaterThan(captured + 11_000);
  const line = plateRow(page).locator('.reading-wait .reading-line');
  await expect(line).toHaveText('Lendo…');
  await expect(plateRow(page).getByRole('button', { name: 'Cancelar' })).toHaveCount(0);
  await expect(plateRow(page).locator('.reading-note')).toHaveCount(0);
});

test('@p0 R8CAP-E2E-006 a reading landing on typed nameplate values: "Manter o digitado" discards it and keeps the value; a different typed value discards it in its own batch; the suggested value typed is left to the auto-confirm; the plate row then reads done', async ({ page, context }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const plateId = await shootPlate(page);
  // Typed offline, before the reading.
  await context.setOffline(true);
  for (const [key, value] of [
    ['n_serie', 'SU-TYPED-1'],
    ['tipo', 'TIPO-A'],
    ['identificacao', 'TR-00'],
  ] as const) {
    const input = field(page, key).locator('input').first();
    await input.fill(value);
    await input.press('Enter');
    await expect.poll(async () => (await outbox(page)).some((op) => op.path === `sheet/${ids.blockId}/nameplate/${key}` && op.value === value)).toBe(true);
  }
  await context.setOffline(false);
  await syncNowAndReturn(page);
  const all = transformerPlateFields(['n_serie', 'tipo', 'identificacao']);
  const suggestions = await pushPlateSuggestions(account.companyId, ids.relatorioId, {
    blockId: ids.blockId,
    photoId: plateId,
    fields: { n_serie: all.n_serie!, tipo: all.tipo!, identificacao: all.identificacao! },
  });
  await pushReadingStatus(account.companyId, ids.relatorioId, plateId, 'done');
  await syncNowAndReturn(page);

  // "Sugerido: 240815-07 — Substituir · Manter o digitado".
  const serieLine = field(page, 'n_serie').locator('.suggestion-alt');
  await expect(serieLine).toContainText('240815-07');
  await expect(serieLine.getByRole('button', { name: 'Substituir' })).toBeVisible();
  await serieLine.getByRole('button', { name: 'Manter o digitado' }).click();
  await expect(field(page, 'n_serie').locator('.suggestion-alt')).toHaveCount(0);
  await expect(field(page, 'n_serie').locator('input').first()).toHaveValue('SU-TYPED-1');
  await expect.poll(async () => (await outbox(page)).filter((op) => op.path === `suggestion/${suggestions.n_serie}/status`).map((op) => op.value)).toEqual(['discarded']);
  // Nothing was written over the typed value.
  expect((await outbox(page)).filter((op) => op.path === `sheet/${ids.blockId}/nameplate/n_serie`).map((op) => op.value)).toEqual(['SU-TYPED-1']);

  // A different value typed over the other one: the put and the discard, one batch.
  await expect(field(page, 'tipo').locator('.suggestion-alt')).toContainText('TSE-500/15');
  const tipo = field(page, 'tipo').locator('input').first();
  await tipo.fill('TIPO-B');
  await tipo.press('Enter');
  await expect(field(page, 'tipo').locator('.suggestion-alt')).toHaveCount(0);
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `suggestion/${suggestions.tipo}/status`)).toBe(true);
  const rows = await outbox(page);
  const put = rows.find((op) => op.path === `sheet/${ids.blockId}/nameplate/tipo` && op.value === 'TIPO-B')!;
  const discard = rows.find((op) => op.path === `suggestion/${suggestions.tipo}/status`)!;
  expect(discard.value).toBe('discarded');
  expect(put.batch_id).not.toBeNull();
  expect(discard.batch_id).toBe(put.batch_id);

  // The suggested value typed exactly under its replace line: no discard in that batch; the
  // device's auto-confirm takes it after the next sync.
  await expect(field(page, 'identificacao').locator('.suggestion-alt')).toContainText('TR-01');
  const ident = field(page, 'identificacao').locator('input').first();
  await ident.fill('TR-01');
  await ident.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === `sheet/${ids.blockId}/nameplate/identificacao` && op.value === 'TR-01')).toBe(true);
  const typed = (await outbox(page)).find((op) => op.path === `sheet/${ids.blockId}/nameplate/identificacao` && op.value === 'TR-01')!;
  expect((await outbox(page)).filter((op) => op.batch_id === typed.batch_id).map((op) => op.path)).toEqual([`sheet/${ids.blockId}/nameplate/identificacao`]);
  await syncNowAndReturn(page);
  const sheetCell = async () => {
    const block = (await readStore<{ entity: string; id: string; row: { sheet: { nameplate: Record<string, { source_suggestion_id: string | null } | undefined> } } }>(page, database, 'entities')).find(
      (record) => record.entity === 'block' && record.id === ids.blockId,
    );
    return block?.row.sheet.nameplate.identificacao?.source_suggestion_id ?? null;
  };
  await expect.poll(sheetCell, { timeout: 30_000 }).toBe(suggestions.identificacao);

  // Every suggestion read from the plate resolved: the row reads done, with no empty line or retake.
  await expect(plateRow(page)).toHaveAttribute('data-reading', 'done');
  await expect(plateRow(page).getByText('Nada foi lido nesta foto')).toHaveCount(0);
  await expect(plateRow(page).getByRole('button', { name: 'Fotografar de novo' })).toHaveCount(0);
});

/** A fake Screen Wake Lock: every request and release is recorded on `window.__wakeLock`; `mode` grants or rejects. */
async function fakeWakeLock(page: Page, mode: 'grant' | 'reject'): Promise<void> {
  await page.addInitScript((how) => {
    const log = { requests: [] as string[], releases: 0, held: 0 };
    (window as unknown as { __wakeLock: typeof log }).__wakeLock = log;
    const request = (type: string) => {
      log.requests.push(type);
      if (how === 'reject') return Promise.reject(new DOMException('e2e: refused', 'NotAllowedError'));
      const listeners: (() => void)[] = [];
      let released = false;
      log.held += 1;
      const sentinel = {
        type,
        get released() {
          return released;
        },
        release: () => {
          if (!released) {
            released = true;
            log.held -= 1;
            log.releases += 1;
            listeners.forEach((listener) => listener());
          }
          return Promise.resolve();
        },
        addEventListener: (_event: string, listener: () => void) => listeners.push(listener),
        removeEventListener: () => undefined,
      };
      return Promise.resolve(sentinel);
    };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  }, mode);
}

const wakeLog = (page: Page) => page.evaluate(() => (window as unknown as { __wakeLock: { requests: string[]; releases: number; held: number } }).__wakeLock);

test('@p0 R8CAP-E2E-007 an open sheet holds one screen wake lock and leaving it releases it; "Manter a tela ligada" reads on on a fresh device and, off (stored on the device), no lock is asked for', async ({ page }) => {
  test.setTimeout(180_000);
  await fakeWakeLock(page, 'grant');
  const ids = await openChaveSheet(page, account, database);
  await expect.poll(async () => (await wakeLog(page)).held).toBe(1);
  expect((await wakeLog(page)).requests.every((type) => type === 'screen')).toBe(true);
  // Back to the Sumário inside the app: the sheet gave the lock back.
  await page.goBack();
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible();
  await expect.poll(async () => (await wakeLog(page)).held).toBe(0);
  expect((await wakeLog(page)).releases).toBeGreaterThanOrEqual(1);

  // A camera outside any sheet (the gallery's): held while it is open, released once it closes.
  await page.goto(`/relatorio/${ids.relatorioId}/fotos`);
  const galleryCamera = page.getByRole('button', { name: 'Tirar foto', exact: true });
  await expect(galleryCamera).toBeVisible({ timeout: 30_000 });
  expect((await wakeLog(page)).held).toBe(0);
  await galleryCamera.click();
  const view = await expectCameraOpen(page);
  await expect.poll(async () => (await wakeLog(page)).held).toBe(1);
  await view.getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
  await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await wakeLog(page)).held).toBe(0);

  // Conta: on by default; off, stored in IndexedDB.
  await page.goto('/account');
  const toggle = page.getByRole('switch', { name: 'Manter a tela ligada' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect((await prefs(page)).find((row) => row.key === 'keep_screen_on')).toBeUndefined();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await prefs(page)).find((row) => row.key === 'keep_screen_on')?.value).toBe(false);

  // A sheet opened now asks for nothing.
  await page.goto(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  // A touch on the sheet, then the camera opened and closed (two more holders): still nothing asked.
  await page.locator('.sheet-header .sheet-title').click();
  await page.locator('.sticky-action-bar .camera-capture-btn').click();
  await (await expectCameraOpen(page)).getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
  await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
  expect((await wakeLog(page)).requests).toEqual([]);

  // On again, the next sheet takes it.
  await page.goto('/account');
  await page.getByRole('switch', { name: 'Manter a tela ligada' }).click();
  await expect.poll(async () => (await prefs(page)).find((row) => row.key === 'keep_screen_on')?.value).toBe(true);
  await page.goto(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}`);
  await expect.poll(async () => (await wakeLog(page)).held, { timeout: 30_000 }).toBe(1);
});

test('@p0 R8CAP-E2E-008 with a Screen Wake Lock that refuses, the sheet, the camera and Conta work with nothing shown and no page error', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await fakeWakeLock(page, 'reject');
  const ids = await openChaveSheet(page, account, database);
  await expect.poll(async () => (await wakeLog(page)).requests.length).toBeGreaterThan(0);
  // The sheet: a typed field commits.
  const input = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await input.fill('147G');
  await input.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((op) => op.path.startsWith(`sheet/${ids.blockId}/test/`))).toBe(true);
  // The camera: opens and closes; each touch asks again, refused again, silently.
  const asked = (await wakeLog(page)).requests.length;
  await page.locator('.sticky-action-bar .camera-capture-btn').click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Fechar a câmera sem concluir' }).click();
  await expect(cameraDialog(page)).toHaveCount(0, { timeout: 15_000 });
  expect((await wakeLog(page)).requests.length).toBeGreaterThan(asked);
  // Conta: the switch still works.
  await page.goto('/account');
  const toggle = page.getByRole('switch', { name: 'Manter a tela ligada' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('toast')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('@p0 R8CAP-E2E-009 a thermo-hygrometer reading that read nothing says so under the first empty environment field, with "Fotografar de novo" and "Digitar"; the retake shoots the same target', async ({ page }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const env = page.locator('section.ficha-amb');
  let before = await photoIds(page);
  await env.locator('.ficha-amb-actions').getByRole('button', { name: 'Ler visor' }).click();
  const first = await shootOnce(page, before);
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, first, 'done');
  await syncNowAndReturn(page);

  // One line, under Temperatura (the first empty field), none under Umidade.
  const temperature = env.locator('[data-field-key="temperature_c"]');
  const empty = temperature.locator('.reading-empty');
  await expect(empty.locator('.reading-line')).toHaveText('Nada foi lido nesta foto');
  await expect(env.locator('.reading-empty')).toHaveCount(1);
  await expect(empty.getByRole('button', { name: 'Digitar' })).toBeVisible();

  before = await photoIds(page);
  await empty.getByRole('button', { name: 'Fotografar de novo' }).click();
  const second = await shootOnce(page, before);
  const creates = (await outbox(page)).filter((op) => op.kind === 'create' && (op.path === `file/${first}` || op.path === `file/${second}`));
  const targetOf = (id: string) => (creates.find((op) => op.path === `file/${id}`)!.value as { reading_target: unknown }).reading_target;
  expect((creates.find((op) => op.path === `file/${second}`)!.value as { reading_kind: string }).reading_kind).toBe('display');
  expect(targetOf(second)).toEqual(targetOf(first));
  await expect(env.locator('.reading-empty')).toHaveCount(0);
});
