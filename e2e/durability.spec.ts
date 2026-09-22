import type { Op } from '@app/domain';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import {
  clearSessionPointer,
  deleteDeviceDatabase,
  fixturePath,
  goToNeutralDocument,
  hideTab,
  installRefusedWrites,
  installWaitingShell,
  isApiRequest,
  setWritesRefused,
  shellGateRuns,
  shellMessages,
  signInForDurability,
  waitForShellCache,
  withoutPageErrors,
  withoutServiceWorker,
} from './support/durability.ts';
import { clientCreateOp, pullAll, readDeviceId, readStore, seedOutbox } from './support/outbox.ts';

/**
 * FR-54 / NFR-17: "the tab closed mid-sheet, the network dropped mid-push, the quota
 * exhausted through a mocked `storage.estimate`", plus AD-8's cold open from the shell
 * cache, the 5-day banner and the eviction recovery.
 *
 * This file runs on three projects (desktop Chrome, Android Chrome emulation, WebKit)
 * against the built bundle on the preview server, never on the dev server: under
 * `vite dev` the document references an unbounded module graph, so a precached shell
 * there could not boot offline and the check would assert a lie.
 */

interface OutboxRecord {
  op_id: string;
  status: string;
  seq?: number;
}

interface DraftRecord {
  key: string;
  surface: string;
  entity_id: string;
  value: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;

test('@p0 1.8-E2E-001 the tab closes mid-sheet: committed values survive and the draft is offered, never applied', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signInForDurability(page, context, account.email);

  await page.goto(fixturePath());
  const input = page.getByTestId('fixture-input');
  await input.fill('Cabine 1');
  await input.press('Enter');
  await expect(page.getByTestId('fixture-committed')).toHaveText('Cabine 1');
  const committed = await readStore<OutboxRecord>(page, database, 'outbox');
  expect(committed.length).toBeGreaterThan(0);

  // Now type something the outbox has not seen, and let the tab die on it.
  await input.fill('Cabine 1 — medindo');
  await expect(page.getByTestId('fixture-committed')).toHaveText('Cabine 1');
  await hideTab(page);
  const drafts = await readStore<DraftRecord>(page, database, 'drafts');
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({ surface: 'fixture-field', value: 'Cabine 1 — medindo' });

  await page.close();

  // Reopen. Every committed op is still there, the draft is offered and nothing was
  // applied behind the user's back.
  const reopened = await context.newPage();
  await reopened.goto(fixturePath());
  const toast = reopened.getByTestId('toast');
  await expect(toast).toContainText('Rascunho encontrado');
  await expect(reopened.getByTestId('fixture-input')).toHaveValue('');
  expect(await readStore<DraftRecord>(reopened, database, 'drafts')).toHaveLength(1);
  const kept = await readStore<OutboxRecord>(reopened, database, 'outbox');
  for (const row of committed) expect(kept.some((r) => r.op_id === row.op_id)).toBe(true);

  await toast.getByRole('button', { name: 'Recuperar' }).click();
  await expect(reopened.getByTestId('fixture-input')).toHaveValue('Cabine 1 — medindo');
  await expect.poll(async () => (await readStore(reopened, database, 'drafts')).length).toBe(0);
  await expect(reopened.getByTestId('toast')).toHaveCount(0);
});

test('@p0 1.8-AC-001 a cold open with no network serves the shell from the cache and Home renders from IndexedDB', async ({
  page,
  context,
  seed,
  browserName,
}) => {
  const account = seed.companies[0];
  await signInForDurability(page, context, account.email);
  const cached = await waitForShellCache(page);

  // AD-8's precache list: the document, the hashed JS and CSS, the Inter woff2 and the
  // SVG sprite, and nothing else.
  expect(cached).toContain('/');
  expect(cached).toContain('/sprite.svg');
  expect(cached.some((url) => /^\/assets\/.*\.js$/.test(url))).toBe(true);
  expect(cached.some((url) => /^\/assets\/.*\.css$/.test(url))).toBe(true);
  expect(cached.some((url) => url.endsWith('.woff2'))).toBe(true);
  expect(cached.filter((url) => url.startsWith('/api'))).toEqual([]);

  // Playwright's WebKit cuts the network below the service worker: an offline navigation
  // fails with an internal error before the worker is asked, so the cached shell can
  // never answer it there. What the worker precached is asserted above on all three
  // browsers; the offline reopen on Safari itself is the manual iPad script (AC 5),
  // which is exactly what that script exists to prove.
  if (browserName === 'webkit') {
    test.info().annotations.push({
      type: 'not-covered-here',
      description:
        "Playwright's WebKit offline emulation bypasses the service worker; the offline reopen on Safari is the pending manual iPad script",
    });
    return;
  }

  await page.close();
  await context.setOffline(true);
  const offline = await context.newPage();
  try {
    await offline.goto('/');
    // The document and its assets came from the shell cache; Home is drawn from the
    // device store, with no network anywhere in the path.
    await expect(offline.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(offline.locator('.app-bar .wordmark')).toHaveText('PRODUTO');
    await expect(offline.locator('.login-form')).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
});

test('@p0 1.8-E2E-002 the network drops mid-push: the cycle resumes and no op is applied twice', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await withoutServiceWorker(page);
  await signInForDurability(page, context, account.email);
  const user = { ...account, deviceId: await readDeviceId(page, database) };

  const ops: Op[] = [clientCreateOp(user), clientCreateOp(user), clientCreateOp(user)];
  await seedOutbox(page, database, ops);

  // The worst kind of drop: the server applied the push and the answer never arrived,
  // so the device re-sends ops the server already has.
  let dropped = false;
  await page.route(
    (url) => url.pathname === '/api/sync/ops',
    async (route) => {
      if (dropped) {
        await route.continue();
        return;
      }
      dropped = true;
      await route.fetch();
      await route.abort('internetdisconnected');
    },
  );

  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect.poll(() => dropped, { timeout: 30_000 }).toBe(true);

  await page.goto('/sync');
  const syncNow = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(syncNow).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await syncNow.click();
  await expect(page.locator('.app-bar [data-testid="sync-badge"]')).toHaveAttribute('data-pending', '0', {
    timeout: 30_000,
  });

  // Every op is acked exactly once on the device...
  const outbox = await readStore<OutboxRecord>(page, database, 'outbox');
  for (const op of ops) {
    const rows = outbox.filter((row) => row.op_id === op.op_id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('acked');
    expect(rows[0]!.seq).toBeGreaterThan(0);
  }
  // ...and the server holds one row per op_id, not two.
  const company = await pullAll(page.request, '/api/sync/company');
  for (const op of ops) {
    expect(company.ops.filter((served) => served.op_id === op.op_id)).toHaveLength(1);
  }
});

test('@p0 1.8-E2E-003 a refused write names itself and the value is not lost', async ({ page, context, seed }) => {
  const account = seed.companies[0];
  await installRefusedWrites(page);
  await signInForDurability(page, context, account.email);
  await page.goto(fixturePath());

  const input = page.getByTestId('fixture-input');
  await withoutPageErrors(page, async () => {
    await setWritesRefused(page, true);
    await input.fill('Valor que o aparelho recusa');
    await input.press('Enter');
    await expect(page.getByTestId('toast')).toContainText(
      'Não foi possível salvar neste aparelho. Libere espaço e tente de novo.',
    );
  });
  // Nothing silently swallowed: the value is still on screen and still uncommitted.
  await expect(input).toHaveValue('Valor que o aparelho recusa');
  await expect(page.getByTestId('fixture-committed')).toHaveText('');

  // And the retry the toast implies actually commits it.
  await setWritesRefused(page, false);
  await input.press('Enter');
  await expect(page.getByTestId('fixture-committed')).toHaveText('Valor que o aparelho recusa');
});

test('@p1 1.8-E2E-004 an evicted origin with a live cookie gets the one-time recovery screen', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signInForDurability(page, context, account.email);

  // The eviction: the database and the local pointer go, the session cookie stays. It
  // happens from a document that is not the app, because the app's live queries would
  // re-create the database the moment it was deleted under them.
  await goToNeutralDocument(page);
  await deleteDeviceDatabase(page, database);
  await clearSessionPointer(page);
  await page.goto('/');

  const heading = page.getByRole('heading', { level: 1, name: 'Dados deste aparelho foram apagados' });
  await expect(heading).toBeVisible();
  await expect(page.getByTestId('recovery-holds')).toBeVisible();
  // What the server holds is counted from the company pull, which carries the company's
  // `user/{id}` rows: company A has exactly one person, never "0 pessoas da equipe".
  await expect(page.getByTestId('recovery-holds')).toContainText('1 pessoa da equipe', { timeout: 20_000 });
  // The sign-in form is never involved: the cookie alone brought the user here.
  await expect(page.locator('.login-form')).toHaveCount(0);
  // And the screen is not a dead end: `navigator.onLine` can be true with the API down,
  // so there is always a way through without downloading.
  await expect(page.getByRole('button', { name: 'Continuar sem baixar' })).toBeVisible();

  await page.getByRole('button', { name: 'Baixar do servidor' }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });

  // One-time: a reload goes straight to Home.
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(heading).toHaveCount(0);
});

test('@p1 1.8-E2E-005 work older than five days raises the banner, and a new shell waits for an empty outbox', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await withoutServiceWorker(page);
  await installWaitingShell(page);
  await signInForDurability(page, context, account.email);
  const user = { ...account, deviceId: await readDeviceId(page, database) };

  // Nothing is waiting yet, so the launch promotes the waiting shell (AD-8).
  await expect.poll(async () => shellMessages(page), { timeout: 15_000 }).toEqual([{ type: 'activate-shell' }]);

  // Work that never reached the server, with the tab still open six days later.
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await seedOutbox(page, database, [clientCreateOp(user)]);
  await page.clock.setFixedTime(new Date(Date.now() + 6 * DAY_MS));
  await page.reload();

  await expect(page.locator('.banner[data-banner="unsynced-5-days"]')).toHaveText('Alterações sem envio há 5 dias');

  // Same launch, with the backlog no longer empty: the new shell is held back. The gate
  // is asynchronous, so wait for the positive signal that it ran on this launch before
  // asserting that it posted nothing — otherwise this passes for a gate that was never
  // reached, or deleted.
  await expect.poll(async () => shellGateRuns(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1_000);
  expect(await shellMessages(page)).toEqual([]);
});
