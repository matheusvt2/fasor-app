import type { Page } from '@playwright/test';
import { SCREENS, TELEMETRY_BATCH_MAX, TELEMETRY_ROUTE, uxEventSchema, type UxEvent } from '@app/domain';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
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

test('@p1 18.1-E2E-001 offline the device queues its screens, taps and dialogs in ux_events; online, "Sincronizar agora" ships them to the api, every batch answered 204, every event valid, and the queue empties', async ({ page, context }) => {
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
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
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

  // While offline the queue holds every one of them, ids only from the route params.
  const expected = [
    { name: 'screen_view', screen: 'account' },
    { name: 'screen_view', screen: 'home' },
    { name: 'action', screen: 'home', target: 'home.card_open' },
    { name: 'screen_view', screen: 'sumario', relatorio_id: relatorioId },
    { name: 'action', screen: 'sumario', target: 'sumario.open_sheet' },
    { name: 'screen_view', screen: 'ficha', relatorio_id: relatorioId, block_id: blockId },
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
          .map(({ name, screen, target, relatorio_id, block_id }) => ({ name, screen, target, relatorio_id, block_id })),
      { timeout: 15_000 },
    )
    .toEqual(expected.map((event) => ({ target: undefined, relatorio_id: undefined, block_id: undefined, ...event })));
  const offlineQueue = await queued(page);
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
  // Nothing typed or named in an event: neither the relatório's texts nor the TAGs.
  expect(JSON.stringify(posted)).not.toMatch(/Cubículo|Chave seccionadora|Enel/);
});
