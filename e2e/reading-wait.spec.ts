import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes, openTransformerSheet, pushReadingStatus, READING_ACTOR } from './support/reading-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow, syncNowAndReturn } from './support/sync.ts';

/*
 * 13.5-E2E (WAIT-1 to WAIT-3, review-field-ux-2026-10-06): a reading that shows its age,
 * cancels and never dead-ends, driven as a person does it.
 *
 * - The cancel pipeline runs the real reading job under the `fake` providers: the plate and
 *   the thermo-hygrometer photos are imported through the app with their bytes held on the
 *   device (`holdPhotoBytes`), so the reading waits past 10 s; "Cancelar" on each; the bytes
 *   are released, the job reads both, and every suggestion it writes is discarded by the
 *   device's sweep through `discardSuggestionOp`. No server op is seeded there.
 * - A failed display reading on an empty cell offers "Tentar novamente" and "Digitar".
 * - A panel photo whose result dialog was left by navigation is reopened from the palette,
 *   and from the arrival toast's "Ver".
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

// No camera on this browser: every opener falls back to the system picker.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const FIXTURES = resolve(import.meta.dirname, '../services/ocr/tests/fixtures');
const PLATE = readFileSync(resolve(FIXTURES, 'plate-transformador.jpg'));
const TERMO = readFileSync(resolve(FIXTURES, 'display-termo.jpg'));
const ISOLACAO = readFileSync(resolve(FIXTURES, 'display-isolacao.jpg'));
const PANEL = readFileSync(resolve(import.meta.dirname, '../apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'));

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

interface EntityRecord {
  entity: string;
  id: string;
  row: { kind?: string; status?: string; reading_kind?: string | null; reading_status?: string; removed_at?: string | null; source?: { photo_id: string } };
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const entities = (page: Page) => readStore<EntityRecord>(page, database, 'entities');
const nameplate = (page: Page) => page.locator('#ficha-nameplate');
const plateRow = (page: Page) => nameplate(page).locator('.photo-row.ficha-np-photo');
const env = (page: Page) => page.locator('section.ficha-amb');

/** The ids of the photos on the device, before a shot. */
async function photoIds(page: Page): Promise<Set<string>> {
  return new Set((await devicePhotos(page, database)).map((photo) => photo.id));
}

/** One picker shot through `opener`; returns the new photo's id once it is on the device. */
async function importThrough(page: Page, opener: Locator, bytes: Buffer, name: string, mimeType = 'image/jpeg'): Promise<string> {
  const before = await photoIds(page);
  const chooser = page.waitForEvent('filechooser');
  await opener.click();
  await (await chooser).setFiles({ name, mimeType, buffer: bytes });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => !before.has(photo.id)).length, { timeout: 15_000 }).toBe(1);
  return (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!.id;
}

/**
 * Records every toast text the page shows from now on, across the navigations to come
 * (`sessionStorage` `e2e-toasts`), so a toast that came and went is still seen.
 */
async function watchToasts(page: Page): Promise<void> {
  const install = () => {
    const key = 'e2e-toasts';
    const start = () =>
      new MutationObserver(() => {
        const seen = JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[];
        let changed = false;
        for (const toast of document.querySelectorAll('[data-testid="toast"]')) {
          const text = toast.textContent ?? '';
          if (!seen.includes(text)) {
            seen.push(text);
            changed = true;
          }
        }
        if (changed) sessionStorage.setItem(key, JSON.stringify(seen));
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    if (document.documentElement === null) document.addEventListener('DOMContentLoaded', start);
    else start();
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

async function seenToasts(page: Page): Promise<string[]> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('e2e-toasts') ?? '[]') as string[]);
}

test('@p0 13.5-E2E-001 a plate and a thermo-hygrometer reading pending past 10 s show their age and "Cancelar"; cancelled, the photos stay and every suggestion the real job then writes is discarded, with no arrival toast', async ({ page }) => {
  test.setTimeout(240_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const plateId = await importThrough(page, nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }), PLATE, 'placa.jpg');
  const termoId = await importThrough(page, env(page).locator('.ficha-amb-actions').getByRole('button', { name: 'Ler visor' }), TERMO, 'visor.jpg');
  // The creates go out; the bytes stay here, so no job runs yet.
  await syncNowAndReturn(page);

  // Under 10 s from the capture: "Lendo…" alone (the shot may already be older on a slow run).
  const plateLine = plateRow(page).locator('.reading-wait');
  await expect(plateLine.locator('.reading-line')).toHaveText(/^Lendo…( \d+ s)?$/);
  // From 10 s: the age, ticking, and "Cancelar".
  await expect(plateLine.locator('.reading-line')).toHaveText(/^Lendo… \d+ s$/, { timeout: 20_000 });
  const first = Number(/(\d+) s$/.exec((await plateLine.locator('.reading-line').textContent())!)![1]);
  expect(first).toBeGreaterThanOrEqual(10);
  await expect.poll(async () => Number(/(\d+) s$/.exec((await plateLine.locator('.reading-line').textContent()) ?? '')?.[1] ?? 0), { timeout: 5_000 }).toBeGreaterThan(first);
  const temperature = env(page).locator('[data-field-key="temperature_c"]');
  await expect(temperature.locator('.reading-wait .queued-banner')).toHaveText(/^Lendo… \d+ s$/);

  await watchToasts(page);
  await plateLine.getByRole('button', { name: 'Cancelar' }).click();
  await expect(plateRow(page).locator('.reading-wait, .reading-line, .queued-banner')).toHaveCount(0);
  await temperature.locator('.reading-wait').getByRole('button', { name: 'Cancelar' }).click();
  await expect(env(page).locator('.reading-wait')).toHaveCount(0);
  // The photos stay.
  const live = async () => (await devicePhotos(page, database)).filter((photo) => photo.removed_at === null).map((photo) => photo.id);
  expect(await live()).toEqual(expect.arrayContaining([plateId, termoId]));
  const prefs = await readStore<{ key: string }>(page, database, 'local_prefs');
  expect(prefs.map((row) => row.key)).toEqual(expect.arrayContaining([`reading_cancelled:${plateId}`, `reading_cancelled:${termoId}`]));

  // The bytes go up, the real job reads both photos; no "Sincronizar agora" needed past the first.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await syncNowAndReturn(page);
  const readFrom = async (photoId: string) => (await entities(page)).filter((record) => record.entity === 'suggestion' && record.row.source?.photo_id === photoId);
  // Eleven plate fields and the two environment values arrive, each discarded on this device.
  await expect.poll(async () => (await readFrom(plateId)).length, { timeout: 90_000 }).toBe(11);
  await expect.poll(async () => (await readFrom(termoId)).length, { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => [...(await readFrom(plateId)), ...(await readFrom(termoId))].every((record) => record.row.status === 'discarded'), { timeout: 30_000 }).toBe(true);
  const discards = (await outbox(page)).filter((op) => /^suggestion\/[^/]+\/status$/.test(op.path));
  for (const record of [...(await readFrom(plateId)), ...(await readFrom(termoId))]) {
    expect(discards.filter((op) => op.path === `suggestion/${record.id}/status`).map((op) => op.value)).toEqual(['discarded']);
  }
  // The photos are still there and their readings done; nothing suggested shows; no arrival toast.
  expect(await live()).toEqual(expect.arrayContaining([plateId, termoId]));
  await expect(nameplate(page).locator('.suggestion-field')).toHaveCount(0);
  await expect(nameplate(page).locator('.plate-crop')).toHaveCount(0);
  await expect(env(page).locator('.suggestion-field')).toHaveCount(0);
  const toasts = await seenToasts(page);
  expect(toasts.filter((text) => /prontas? para confirmar/.test(text))).toEqual([]);
  expect((await outbox(page)).some((op) => op.path.startsWith(`sheet/${ids.blockId}/nameplate/`))).toBe(false);
});

test('@p0 13.5-E2E-002 a failed display reading on an empty cell offers "Tentar novamente" (kept disabled across a reload once asked, "Sem conexão" offline) and "Digitar", which focuses the cell; a typed value hides the line', async ({ page, context }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  const opener = page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions').getByRole('button', { name: 'Ler visor' });
  const photoId = await importThrough(page, opener, ISOLACAO, 'visor.jpg');
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, photoId, 'failed');
  await syncNowAndReturn(page);

  const cell = page.locator('#ficha-step-ensaios .ficha-cell').filter({ has: page.getByRole('textbox', { name: 'T1, Valor', exact: true }) });
  const failed = cell.locator('.reading-failed');
  await expect(failed.locator('.reading-line')).toHaveText('Não foi possível ler');
  const retry = failed.getByRole('button', { name: 'Tentar novamente' });
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true');

  const rereads: string[] = [];
  await page.route('**/api/photos/*/reread', async (route) => {
    rereads.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ photo_id: photoId, reading_status: 'running' }) });
  });
  await retry.click();
  await expect.poll(() => rereads).toEqual([`/api/photos/${photoId}/reread`]);
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect(retry).toHaveAccessibleDescription('Nova leitura pedida');
  // A reload before the next status op keeps it asked.
  await page.reload();
  await expect(failed.getByRole('button', { name: 'Tentar novamente' })).toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await expect(failed.getByRole('button', { name: 'Tentar novamente' })).toHaveAccessibleDescription('Nova leitura pedida');

  // "Digitar" takes the focus to the cell's own input.
  await failed.getByRole('button', { name: 'Digitar' }).click();
  await expect(page.getByRole('textbox', { name: 'T1, Valor', exact: true })).toBeFocused();

  // Offline the reread cannot be asked: "Sem conexão".
  await context.setOffline(true);
  await expect(failed.getByRole('button', { name: 'Tentar novamente' })).toHaveAccessibleDescription('Sem conexão');
  await context.setOffline(false);

  // A typed value hides the failure on that cell.
  const t1 = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await t1.fill('147G');
  await t1.press('Enter');
  await expect(cell.locator('.reading-failed')).toHaveCount(0);
});

test('@p0 13.5-E2E-006 review F-06/F-07/F-08: one line per thermo-hygrometer photo; the live region says only the transitions; a cancelled reading drops the fields note and offers "Ler de novo" (offline disabled with "Sem conexão"), which asks the reread route and brings the wait line back', async ({ page, context }) => {
  test.setTimeout(180_000);
  await holdPhotoBytes(page);
  await openTransformerSheet(page, account, database);
  const plateId = await importThrough(page, nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }), PLATE, 'placa.jpg');
  const termoId = await importThrough(page, env(page).locator('.ficha-amb-actions').getByRole('button', { name: 'Ler visor' }), TERMO, 'visor.jpg');
  await syncNowAndReturn(page);

  // F-08: the thermo-hygrometer photo has one line, under Temperatura, none under Umidade.
  await expect(env(page).locator(`.reading-wait[data-photo-id="${termoId}"]`)).toHaveCount(1);
  await expect(env(page).locator('[data-field-key="temperature_c"] .reading-wait')).toHaveCount(1);
  await expect(env(page).locator('[data-field-key="humidity_pct"] .reading-wait')).toHaveCount(0);

  // F-06: the ticking age is outside the live region; the region changes only at 10 s.
  const plateLine = plateRow(page).locator('.reading-wait');
  await expect(plateLine.locator('.reading-line')).toHaveText(/^Lendo… \d+ s$/, { timeout: 20_000 });
  expect(await plateLine.locator('.reading-line').evaluate((element) => element.closest('[role="status"], [aria-live]') === null)).toBe(true);
  await expect(plateLine.getByRole('status')).toHaveText('Lendo… já é possível cancelar.');
  const announced = await plateLine.getByRole('status').textContent();
  await expect.poll(async () => plateLine.locator('.reading-line').textContent(), { timeout: 5_000 }).not.toBe(await plateLine.locator('.reading-line').textContent());
  expect(await plateLine.getByRole('status').textContent()).toBe(announced);

  // F-07: the fields note shows while the reading waits, and goes with "Cancelar".
  const note = nameplate(page).getByText('Os campos continuam digitáveis; o que você digitar não é sobrescrito pela leitura.');
  await expect(note).toBeVisible();
  await plateLine.getByRole('button', { name: 'Cancelar' }).click();
  const again = plateRow(page).getByRole('button', { name: 'Ler de novo' });
  await expect(again).toBeVisible();
  await expect(note).toHaveCount(0);
  await expect(plateRow(page).locator('.reading-wait')).toHaveCount(0);

  // Offline it waits with "Tentar novamente"'s reason.
  await context.setOffline(true);
  await expect(again).toHaveAttribute('aria-disabled', 'true');
  await expect(again).toHaveAccessibleDescription('Sem conexão');
  await context.setOffline(false);
  await expect(again).not.toHaveAttribute('aria-disabled', 'true', { timeout: 15_000 });

  // Online it asks the reread route (the bytes are still held: 409 not_caught_up, the reading is on its way).
  const rereads: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/photos\/[^/]+\/reread$/.test(path)) rereads.push(path);
  });
  await again.click();
  await expect.poll(() => rereads).toEqual([`/api/photos/${plateId}/reread`]);
  await expect(plateRow(page).locator('.reading-wait')).toBeVisible({ timeout: 15_000 });
  await expect(plateRow(page).getByRole('button', { name: 'Ler de novo' })).toHaveCount(0);
  await expect(note).toBeVisible();
  await expect(page.getByTestId('toast').filter({ hasText: 'Não foi possível pedir a nova leitura' })).toHaveCount(0);
  const prefs = await readStore<{ key: string }>(page, database, 'local_prefs');
  expect(prefs.map((row) => row.key)).not.toContain(`reading_cancelled:${plateId}`);

  // The display line too: cancelled, one "Ler de novo" for the photo.
  await env(page).locator('.reading-wait').getByRole('button', { name: 'Cancelar' }).click();
  await expect(env(page).getByRole('button', { name: 'Ler de novo' })).toHaveCount(1);
  await expect(env(page).locator('.reading-wait')).toHaveCount(0);
});

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const result = (page: Page) => page.getByRole('dialog', { name: 'Fotografar equipamento' });

/** The Sumário with section 9 and 1° Subsolo open. */
async function openSumario(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir 1° Subsolo' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(coluna(page, 'Coluna 1')).toBeVisible();
}

/** The field palette on Coluna 1. */
async function openPalette(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Mais opções de Coluna 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.getByText('Em: 1° Subsolo › Coluna 1')).toBeVisible();
  return palette;
}

/** A panel shot from the palette of Coluna 1, its result dialog open, the bytes held. */
async function panelShot(page: Page): Promise<{ relatorioId: string; photoId: string }> {
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await holdPhotoBytes(page);
  await openSumario(page, relatorioId);
  const palette = await openPalette(page);
  const photoId = await importThrough(page, palette.getByRole('button', { name: 'Fotografar equipamento' }), PANEL, 'painel.png', 'image/png');
  await expect(result(page)).toBeVisible();
  await expect(result(page).getByRole('status')).toHaveText('Lendo a foto…');
  return { relatorioId, photoId };
}

/** The reading job's panel suggestion, as it writes it: a Chave seccionadora on Coluna 9. */
function pushPanelSuggestion(relatorioId: string, photoId: string): Promise<string> {
  return pushSuggestion(account.companyId, relatorioId, {
    targetPath: `file/${photoId}/block_id`,
    value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
    photoId,
    bbox: [0.13, 0.13, 0.71, 0.54],
    actorId: READING_ACTOR,
  });
}

test('@p0 13.5-E2E-003 a panel photo whose dialog was left by navigation waits in its palette: the row shows its state, then the proposal, and a tap reopens the dialog where "Confirmar" creates the block', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, photoId } = await panelShot(page);
  // Review F-06: past 10 s the dialog shows the age outside its live region, which still says "Lendo a foto…".
  const waiting = result(page).locator('.detect-waiting');
  await expect(waiting).toHaveText(/^Lendo… \d+ s$/, { timeout: 20_000 });
  expect(await waiting.evaluate((element) => element.closest('[role="status"], [aria-live]') === null)).toBe(true);
  await expect(result(page).getByRole('status')).toHaveText('Lendo a foto…');
  // Away from the dialog (another screen), then back to the Sumário: no dialog by itself.
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await openSumario(page, relatorioId);
  await expect(result(page)).toHaveCount(0);

  // The palette of the location the photo was taken from lists it, reading.
  let palette = await openPalette(page);
  let row = palette.locator(`.pal-awaiting[data-photo-id="${photoId}"]`);
  await expect(palette.locator('.palette-awaiting')).toHaveText('Fotos de equipamento à espera');
  await expect(row.locator('.pi-text > span').first()).toHaveText('Foto do equipamento');
  await expect(row.locator('.pi-meta')).toHaveText('Lendo a foto…');
  // Another location's palette does not.
  await palette.getByRole('button', { name: 'Fechar' }).click();

  // The reading lands meanwhile: the row now carries the proposal.
  await pushPanelSuggestion(relatorioId, photoId);
  await syncNowAndReturn(page);
  await openSumario(page, relatorioId);
  palette = await openPalette(page);
  row = palette.locator(`.pal-awaiting[data-photo-id="${photoId}"]`);
  await expect(row.locator('.pi-meta')).toHaveText('Criar SEC-C09 · Chave seccionadora · Coluna 9?');
  await row.click();
  await expect(palette).toBeHidden();
  const dialog = result(page);
  await expect(dialog).toBeVisible();
  const field = dialog.locator('.suggestion-field');
  await expect(field.locator('.sv-main')).toHaveText('Criar SEC-C09 · Chave seccionadora · Coluna 9?');
  await field.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toContainText(['SEC-C09']);
  const reKind = (await outbox(page)).find((op) => op.path === `file/${photoId}/reading_kind`);
  expect(reKind?.value).toBe('plate');
  // Confirmed, the photo is no longer waiting: the palette does not list it.
  palette = await openPalette(page);
  await expect(palette.locator('.pal-awaiting')).toHaveCount(0);
});

test('@p1 13.5-E2E-004 a reading still running past 120 s keeps its age and adds the still-reading note, and the device keeps polling every 60 s', async ({ page }) => {
  test.setTimeout(360_000);
  await holdPhotoBytes(page);
  const ids = await openTransformerSheet(page, account, database);
  const plateId = await importThrough(page, nameplate(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }), PLATE, 'placa.jpg');
  await syncNowAndReturn(page);
  await pushReadingStatus(account.companyId, ids.relatorioId, plateId, 'running');
  await syncNowAndReturn(page);
  const line = plateRow(page).locator('.reading-wait');
  await expect(line.locator('.reading-line')).toHaveText(/^Lendo… \d+ s$/, { timeout: 20_000 });
  await expect(line.locator('.reading-note')).toHaveCount(0);

  const pulls: number[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sync/company') pulls.push(Date.now());
  });
  await expect(line.locator('.reading-line')).toHaveText(/^Lendo… 2 min \d\d s$/, { timeout: 150_000 });
  await expect(line.locator('.reading-note')).toHaveText('A leitura está demorando. O app continua conferindo a cada minuto; a foto está guardada.');
  await expect(line.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  // Past the fast window the cycles keep coming, every 60 s.
  const past = Date.now();
  await expect.poll(() => pulls.filter((at) => at > past).length, { timeout: 75_000 }).toBeGreaterThan(0);
});

test('@p1 13.5-E2E-005 the arrival toast\'s "Ver" on a panel suggestion reopens that photo\'s result dialog on the proposal', async ({ page }) => {
  test.setTimeout(180_000);
  const { relatorioId, photoId } = await panelShot(page);
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  // The launch cycle of the reload settles first: what it pulls is the device's baseline.
  await syncNow(page);
  await pushPanelSuggestion(relatorioId, photoId);
  await syncNow(page);
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('1 leitura pronta para confirmar', { timeout: 30_000 });
  await toast.getByRole('button', { name: 'Ver' }).click();
  const dialog = result(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('.suggestion-field .sv-main')).toHaveText('Criar SEC-C09 · Chave seccionadora · Coluna 9?');
  // The address carries no parameter any more: a reload opens the Sumário alone.
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
});
