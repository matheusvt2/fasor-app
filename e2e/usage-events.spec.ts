import type { Page } from '@playwright/test';
import { SCREENS, TELEMETRY_BATCH_MAX, TELEMETRY_ROUTE, uxEventSchema, type UxEvent } from '@app/domain';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { openChaveSheet } from './support/photos.ts';
import { syncNow } from './support/sync.ts';
import { expandLocation } from './support/tree.ts';

/*
 * 18.1-E2E-001 (Epic 18, AD-28): usage events, driven as a person would. Offline, the device
 * goes to Conta and back Home, opens the relatório's card, opens a sheet from the tree, marks
 * an item and opens and cancels the capture sheet: `ux_events` holds the screens, the
 * actions and the dialog (the op log is not involved). Back online, "Sincronizar agora" runs a
 * cycle, after which the queue goes to `POST /api/telemetry`: every request this page made
 * there is recorded with its answer, every answer is 204 (the api answers 204 only once every
 * event parsed and the sink took the batch), every posted event parses with the kernel schema
 * and carries no text beyond the closed lists, the posted set covers what the queue held, and
 * the queue is empty after.
 *
 * Story 18.4: a `screen_view` is written when its screen is left, with its `duration_ms` and
 * the screen before it (`from`); the walk starts on the sheet `openChaveSheet` opened, so the
 * sheet's own view comes first. Every `session_start` says on what it ran (`viewport`,
 * `standalone`, `online`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  // This worker's Empresa B (E6-Q7): its company, its user and its device database.
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

type QueuedEvent = UxEvent & { id: number };

interface TelemetryPost {
  status: number;
  body: unknown;
}

/** The camera refused, so "Adicionar fotos" opens the Photo capture sheet (11.11-E2E-004). */
async function denyCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const denied = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: denied, configurable: true });
  });
}

const queued = (page: Page) => readStore<QueuedEvent>(page, database, 'ux_events');

/** What the offline walk itself queues (a cycle the 60 s tick finds offline may add its `sync_result`). */
const TRACKED_HERE = new Set(['screen_view', 'action', 'dialog_open', 'dialog_cancel']);

/** One event's identity across the device and the wire (the queue's key never leaves the device). */
const keyOf = (event: UxEvent) => [event.ts, event.session_id, event.name, event.screen, event.target ?? '', event.kind ?? ''].join('|');

test('@p0 18.1-E2E-001 offline the device queues its screens, taps and dialogs in ux_events; online, "Sincronizar agora" ships them to the api, every batch answered 204, every event valid, and the queue empties', async ({ page, context }) => {
  test.setTimeout(240_000);
  const posts: TelemetryPost[] = [];
  page.on('requestfinished', (request) => {
    if (request.method() !== TELEMETRY_ROUTE.method || new URL(request.url()).pathname !== TELEMETRY_ROUTE.path) return;
    void request.response().then((response) => posts.push({ status: response?.status() ?? 0, body: request.postDataJSON() as unknown }));
  });
  await denyCamera(page);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);

  await context.setOffline(true);
  const offlineFrom = await page.evaluate(() => new Date().toISOString());

  // Conta, then back Home, through the App bar.
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Uso do aplicativo' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/$/);

  // The relatório's card opens the Sumário; the tree opens the sheet.
  await page.locator(`[data-relatorio="${relatorioId}"] .card-title`).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expandLocation(page, 'Cubículo Enel');
  await page.locator(`li.s9-eq[data-block-id="${blockId}"] .s9-eq-open`).click();
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));

  // Mark an item; the camera is refused, so "Adicionar fotos" opens the capture sheet, cancelled.
  const radio = page.locator('#ficha-step-verificacoes li.checklist-row').first().getByRole('radio', { name: 'Conforme', exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  await expect(page.locator('.sticky-action-bar .camera-denied')).toBeVisible();
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet).toHaveCount(0);

  // While offline the queue holds every one of them, ids only from the route params. Story 18.4:
  // each screen's view is written as it is left, after what was pressed on it, with the screen before it.
  const expected = [
    { name: 'screen_view', screen: 'ficha', relatorio_id: relatorioId, block_id: blockId, from: 'sumario' },
    { name: 'screen_view', screen: 'account', from: 'ficha' },
    { name: 'action', screen: 'home', target: 'home.card_open' },
    { name: 'screen_view', screen: 'home', from: 'account' },
    { name: 'action', screen: 'sumario', target: 'sumario.open_sheet' },
    { name: 'screen_view', screen: 'sumario', relatorio_id: relatorioId, from: 'home' },
    { name: 'action', screen: 'ficha', target: 'ficha.mark_c' },
    { name: 'action', screen: 'ficha', target: 'ficha.photo' },
    { name: 'action', screen: 'ficha', target: 'photos.add' },
    { name: 'dialog_open', screen: 'ficha', target: 'capture_sheet' },
    { name: 'dialog_cancel', screen: 'ficha', target: 'capture_sheet' },
  ];
  await expect
    .poll(
      async () =>
        (await queued(page))
          .filter((event) => event.ts >= offlineFrom && TRACKED_HERE.has(event.name))
          .map(({ name, screen, target, relatorio_id, block_id, from }) => ({ name, screen, target, relatorio_id, block_id, from })),
      { timeout: 15_000 },
    )
    .toEqual(expected.map((event) => ({ target: undefined, relatorio_id: undefined, block_id: undefined, from: undefined, ...event })));
  const offlineQueue = await queued(page);
  // Story 18.4: every view says how long its screen stayed open, in whole milliseconds.
  const views = offlineQueue.filter((event) => event.ts >= offlineFrom && event.name === 'screen_view');
  expect(views).toHaveLength(4);
  for (const view of views) {
    expect(Number.isInteger(view.duration_ms), JSON.stringify(view)).toBe(true);
    expect(view.duration_ms).toBeGreaterThanOrEqual(0);
  }
  expect(offlineQueue.length).toBeGreaterThanOrEqual(expected.length);
  const postsBefore = posts.length;
  for (const event of offlineQueue) {
    const { id, ...wire } = event;
    expect(typeof id).toBe('number');
    expect(uxEventSchema.safeParse(wire).success).toBe(true);
    expect(SCREENS).toContain(event.screen);
  }
  // The app load's `session_start` (with its version) is in the queue or already shipped by an online cycle.
  const startedQueued = offlineQueue.some((event) => event.name === 'session_start' && event.app_version !== '');

  // Online again: one "Sincronizar agora", and the queue goes to the api.
  await context.setOffline(false);
  await syncNow(page);
  await expect.poll(async () => (await queued(page)).length, { timeout: 30_000 }).toBe(0);
  const postedEvents = () => posts.flatMap((post) => (Array.isArray(post.body) ? (post.body as UxEvent[]) : []));
  // Every event the offline queue held has gone out (the recorder hears each answer a moment after the page).
  await expect
    .poll(() => {
      const keys = new Set(postedEvents().map(keyOf));
      return offlineQueue.filter((event) => !keys.has(keyOf(event))).length;
    }, { timeout: 15_000 })
    .toBe(0);
  expect(posts.length).toBeGreaterThan(postsBefore);

  const posted = postedEvents();
  for (const post of posts) {
    expect(post.status).toBe(204);
    expect(Array.isArray(post.body)).toBe(true);
    expect((post.body as unknown[]).length).toBeLessThanOrEqual(TELEMETRY_BATCH_MAX);
  }
  for (const event of posted) {
    const parsed = uxEventSchema.safeParse(event);
    expect(parsed.success, JSON.stringify(event)).toBe(true);
    // No text beyond the closed lists: no key outside the schema (strict), and no queue key.
    expect(Object.keys(event as object)).not.toContain('id');
  }
  // The sync the user waited for, and its result, went out too.
  expect(posted.some((event) => event.name === 'action' && event.target === 'sync.now')).toBe(true);
  expect(posted.some((event) => event.name === 'sync_result' && event.kind === 'ran')).toBe(true);
  expect(startedQueued || posted.some((event) => event.name === 'session_start')).toBe(true);
  // Story 18.4: each load's session_start ran at 1280 px, in a browser tab, online.
  const starts = [...offlineQueue, ...posted].filter((event) => event.name === 'session_start');
  expect(starts.length).toBeGreaterThan(0);
  for (const start of starts) expect({ viewport: start.viewport, standalone: start.standalone, online: start.online }).toEqual({ viewport: 'desktop', standalone: false, online: true });
  // Nothing typed or named in an event: neither the relatório's texts nor the TAGs.
  expect(JSON.stringify(posted)).not.toMatch(/Cubículo|Chave seccionadora|Enel/);
});

/*
 * 18.1-E2E-002 (E18-A1, R-A1 and R-V10): the api's limiter answers 429. The device holds its
 * queue, among it the `undo` of a Cadastros client removed and restored with "Desfazer"; while
 * every telemetry post is answered 429, "Sincronizar agora" sends exactly one batch in its
 * flush (a 429 ends it) and deletes nothing. Once the limiter lets go, the next "Sincronizar
 * agora" empties the queue with 204s.
 */
test('@p0 18.1-E2E-002 a 429 on the telemetry post keeps every queued event and ends the flush; the next sync ships them with 204s', async ({ page }) => {
  test.setTimeout(240_000);
  let refused = 0;
  // Every telemetry post is answered 429 from the first one on, so the queue keeps what the walk tracks.
  await page.route(`**${TELEMETRY_ROUTE.path}`, async (route) => {
    if (route.request().method() !== TELEMETRY_ROUTE.method) return route.continue();
    refused += 1;
    await route.fulfill({ status: 429, contentType: 'application/json', headers: { 'retry-after': '60' }, body: JSON.stringify({ code: 'rate_limited', message: 'Too many events.' }) });
  });
  await signIn(page, account.email);

  // A client created, removed and restored in Cadastros: the toast's "Desfazer" is an `undo`.
  const name = `Cliente Desfazer ${Date.now().toString(36)}`;
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Nome').fill(name);
  await panel.getByRole('button', { name: 'Fechar edição' }).click();
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await panel.getByRole('button', { name: 'Remover' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Remover' }).click();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText(`${name} removido`);
  await toast.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  await expect.poll(async () => (await queued(page)).some((event) => event.name === 'undo' && event.target === 'toast.undo' && event.screen === 'cadastros'), { timeout: 15_000 }).toBe(true);

  // The launch cycle's flush met the limiter: one post, answered 429.
  await expect.poll(() => refused, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // "Sincronizar agora" while the limiter's 60 s window stands (fix batch e25x: opening Sync status runs a cycle and
  // the button another, Story 25.3; neither posts inside the window): at most one more post (none while the window
  // of the launch's 429 stands; one when a slow run let it lapse, which opens a new window), and no row deleted.
  const held = await queued(page);
  expect(held.length).toBeGreaterThan(0);
  const refusedBefore = refused;
  await syncNow(page);
  await page.waitForTimeout(1_000);
  expect(refused - refusedBefore).toBeLessThanOrEqual(1);
  const ids = new Set((await queued(page)).map((event) => event.id));
  expect(held.filter((event) => !ids.has(event.id))).toEqual([]);

  // The limiter lets go, and the window is the page's own (a reload starts without it): the launch cycle or the next
  // "Sincronizar agora" ships the queue, every answer 204.
  await page.unroute(`**${TELEMETRY_ROUTE.path}`);
  const statuses: number[] = [];
  page.on('requestfinished', (request) => {
    if (request.method() !== TELEMETRY_ROUTE.method || new URL(request.url()).pathname !== TELEMETRY_ROUTE.path) return;
    void request.response().then((response) => statuses.push(response?.status() ?? 0));
  });
  await page.reload();
  await syncNow(page);
  await expect.poll(async () => (await queued(page)).length, { timeout: 30_000 }).toBe(0);
  await expect.poll(() => statuses.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(statuses.every((status) => status === 204)).toBe(true);
});

/*
 * 18.4-E2E-001 (Story 18.4): a value typed in a sheet number field that the field refuses is
 * one `input_refused` with the field's constant name and the kernel's reason, on blur; the
 * keystrokes queue nothing, and no queued event carries the typed text. The typed word is not
 * hexadecimal ("quinze"), so it cannot occur by chance inside an id of the queue.
 */
test('@p0 18.4-E2E-001 a typed value the sheet refuses queues one input_refused with its name and reason, and never the text', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openChaveSheet(page, account, database);
  // Offline, so no sync cycle ships the queue while it is read.
  await context.setOffline(true);
  const typed = 'quinze';
  const field = page.locator('input[data-telemetry="ficha.number"]').first();
  await field.scrollIntoViewIfNeeded();
  const from = await page.evaluate(() => new Date().toISOString());
  await field.click();
  await field.pressSequentially(typed);
  const refusals = async () => (await queued(page)).filter((event) => event.ts >= from && event.name === 'input_refused');
  // Typing alone queues nothing.
  expect(await refusals()).toEqual([]);
  await field.blur();
  await expect(page.getByText('Número não reconhecido').first()).toBeVisible();
  await expect.poll(async () => (await refusals()).length, { timeout: 15_000 }).toBe(1);
  const [refusal] = await refusals();
  expect(refusal).toMatchObject({ name: 'input_refused', screen: 'ficha', target: 'ficha.number', kind: 'not_a_number' });
  expect(refusal!.outcome).toBeUndefined();
  expect(refusal!.duration_ms).toBeUndefined();
  const { id, ...wire } = refusal!;
  expect(typeof id).toBe('number');
  expect(uxEventSchema.safeParse(wire).success).toBe(true);
  // A click into the field is no action.
  expect((await queued(page)).filter((event) => event.ts >= from && event.name === 'action')).toEqual([]);
  // Never the typed text, anywhere in the queue.
  expect(JSON.stringify(await queued(page))).not.toContain(typed);
  await context.setOffline(false);
});
