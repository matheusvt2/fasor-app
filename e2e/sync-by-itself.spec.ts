import { lateOpCount, syncLateText } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, syncBadge, syncWord, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pullAll, readStore } from './support/outbox.ts';
import { expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';
import { SYNC_CYCLE_TIMEOUT } from './support/sync.ts';

/*
 * Story 25.3 (M03): a sheet edit reaches the server by itself.
 * - 25.3-E2E-001: an edit is pushed within five seconds with no tap and no screen change, and reaches the server;
 *   opening Sync status starts a cycle with no tap on "Sincronizar agora".
 * - 25.3-E2E-002: five photos upload on a slow file route; an edit committed during the second upload is pushed
 *   before the third upload's request starts (the order of the requests the page sends).
 * - 25.3-E2E-003: an edit whose push is held at the network for more than one minute (the page's clock jumps the
 *   minute) turns the badge to "Envio atrasado" and Sync status shows the kernel's line beside "Sincronizar agora";
 *   once the push goes through, the alert goes.
 * It times a push against a commit and jumps the page's clock, so it runs in the `solo` lane (`e2e/support/groups.ts`).
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
  path: string;
  value: unknown;
  status: string;
  client_ts: string;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const isPush = (url: URL) => url.pathname === '/api/sync/ops';

/** Marks the sheet's first checklist item "Conforme", as a technician does; returns the op's path. */
async function markFirstConforme(page: Page, blockId: string): Promise<string> {
  const row = page.locator('#ficha-step-verificacoes li.checklist-row').first();
  const radio = row.getByRole('radio', { name: 'Conforme', exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
  const itemKey = (await row.getAttribute('data-item-key'))!;
  const path = `sheet/${blockId}/checklist/${itemKey}/result`;
  await expect.poll(async () => (await outbox(page)).some((op) => op.path === path)).toBe(true);
  return path;
}

/** The launch cycle (and the one opening the relatório asked for) are over: nothing waits, nothing runs. */
async function settled(page: Page): Promise<void> {
  // A short wait: the work in flight is the launch's and the open's own cycles, never the 60 s tick (chore T2 guard).
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 20_000 });
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok', { timeout: SYNC_CYCLE_TIMEOUT });
}

test('@p0 25.3-E2E-001 an edit reaches the server with no tap and no screen change, and opening Sync status starts a cycle', async ({ page }) => {
  test.setTimeout(150_000);
  const { relatorioId, blockId } = await openChaveSheet(page, account, database);
  await settled(page);
  const pushes: { at: number; body: string }[] = [];
  const pulls: number[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (isPush(url) && request.method() === 'POST') pushes.push({ at: Date.now(), body: request.postData() ?? '' });
    if (url.pathname === '/api/sync/company') pulls.push(Date.now());
  });

  const committedAt = Date.now();
  const path = await markFirstConforme(page, blockId);
  // A cycle starts within five seconds (the 2 s window, then the push), with no tap.
  await expect.poll(() => pushes.find((push) => push.body.includes(path))?.at ?? null, { timeout: 15_000 }).not.toBeNull();
  expect(pushes.find((push) => push.body.includes(path))!.at - committedAt).toBeLessThan(5_000);
  // The op leaves the outbox and the server holds it; the screen never changed.
  const opId = (await outbox(page)).find((op) => op.path === path)!.op_id;
  await expect.poll(async () => (await outbox(page)).find((op) => op.op_id === opId)?.status, { timeout: SYNC_CYCLE_TIMEOUT }).toBe('acked');
  expect((await pullAll(page.request, `/api/sync/relatorios/${relatorioId}`)).ops.some((op) => op.op_id === opId)).toBe(true);
  await expect(page).toHaveURL(new RegExp(`/ficha/${blockId}$`));

  // Sync status opens and a cycle starts by itself: a company pull after the badge is tapped, "Sincronizar agora" untouched.
  await settled(page);
  const openedAt = Date.now();
  await syncBadge(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeVisible();
  await expect.poll(() => pulls.filter((at) => at >= openedAt).length, { timeout: 10_000 }).toBeGreaterThan(0);
});

test('@p1 25.3-E2E-002 while five photos upload on a slow connection, an edit committed during the second upload is pushed before the third upload starts', async ({ page, context }) => {
  test.setTimeout(240_000);
  const { blockId } = await openChaveSheet(page, account, database);
  await settled(page);

  // Five photos taken offline wait on the device.
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 5);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);

  // Each upload takes four seconds; the page's requests are listed in the order they leave.
  await page.route(
    (url) => url.pathname.startsWith('/api/files/'),
    async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      return route.continue();
    },
  );
  const events: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() === 'PUT' && url.pathname.startsWith('/api/files/')) events.push(`put:${url.pathname}`);
    if (isPush(url) && request.method() === 'POST') events.push(`push:${request.postData() ?? ''}`);
  });
  const puts = () => events.filter((event) => event.startsWith('put:'));
  await context.setOffline(false);
  await expect.poll(() => puts().length, { timeout: SYNC_CYCLE_TIMEOUT }).toBeGreaterThanOrEqual(2);

  // During the second upload: one edit.
  const path = await markFirstConforme(page, blockId);
  await expect.poll(() => puts().length, { timeout: SYNC_CYCLE_TIMEOUT }).toBeGreaterThanOrEqual(3);
  const third = events.indexOf(puts()[2]!);
  const editPush = events.findIndex((event) => event.startsWith('push:') && event.includes(path));
  expect(editPush, 'the edit is pushed between two uploads').toBeGreaterThan(-1);
  expect(editPush, 'before the third upload starts').toBeLessThan(third);
  await page.unroute((url) => url.pathname.startsWith('/api/files/'));
});

test('@p1 25.3-E2E-003 an edit waiting more than one minute online turns the badge to "Envio atrasado" with the kernel\'s line on Sync status; once sent, the alert goes', async ({ page }) => {
  test.setTimeout(180_000);
  // The page's clock jumps the minute instead of spending it (13.5-E2E-004's precedent).
  await page.clock.install();
  const { blockId } = await openChaveSheet(page, account, database);
  await settled(page);

  // The push is held at the network until released (its own bound, 60 s and its body's share, never runs out here).
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let pushed = 0;
  await page.route(isPush, async (route) => {
    pushed += 1;
    await held;
    await route.continue();
  });
  const path = await markFirstConforme(page, blockId);
  await expect.poll(() => pushed, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(syncBadge(page)).not.toHaveAttribute('data-state', 'late');
  // The commit is at least 2 s old here (the window): 59 s more is past the minute, short of the push's bound.
  await page.clock.fastForward('00:59');
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'late');
  await expect(syncWord(page)).toHaveText('Envio atrasado');

  // Sync status: the headline, the kernel's line, the one "Sincronizar agora" beside it.
  await syncBadge(page).click();
  const surface = page.locator('main[data-route="/sync"]');
  await expect(surface.locator('.sync-headline')).toHaveAttribute('data-tone', 'late');
  const waiting = (await outbox(page)).filter((op) => op.status === 'pending' || op.status === 'sent');
  const nowMs = await page.evaluate(() => Date.now());
  expect(waiting.some((op) => op.path === path)).toBe(true);
  await expect(surface.locator('.e25-late .e25-late-line')).toHaveText(syncLateText(lateOpCount(waiting.map((op) => op.client_ts), nowMs)));
  await expect(surface.locator('.e25-late').getByRole('button', { name: 'Sincronizar agora' })).toBeVisible();
  await expect(surface.getByRole('button', { name: 'Sincronizar agora' })).toHaveCount(1);
  await expect(surface.locator('.sync-actions')).toHaveCount(0);

  // The push goes through: the alert goes.
  release();
  await expect(surface.locator('.e25-late')).toHaveCount(0, { timeout: SYNC_CYCLE_TIMEOUT });
  await expect(syncBadge(page)).not.toHaveAttribute('data-state', 'late');
  await expect.poll(async () => (await outbox(page)).find((op) => op.path === path)?.status, { timeout: SYNC_CYCLE_TIMEOUT }).toBe('acked');
  await page.unroute(isPush);
});
