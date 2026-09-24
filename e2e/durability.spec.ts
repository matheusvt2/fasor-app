import type { Op } from '@app/domain';
import { deviceDatabaseName, expect, test, TEST_SEED } from './support/merged-fixtures.ts';
import {
  clearSessionPointer,
  closeEveryTab,
  deleteDeviceDatabase,
  fixturePath,
  goToNeutralDocument,
  hideTab,
  installNextShell,
  installRefusedWrites,
  installWaitingShell,
  isApiRequest,
  readShellPin,
  runningEntry,
  serveNextBuild,
  setWritesRefused,
  shellCacheNames,
  shellGateRuns,
  shellMessages,
  signInForDurability,
  stopServiceWorkers,
  waitForSettledShell,
  waitForShellCache,
  withoutPageErrors,
  withoutServiceWorker,
} from './support/durability.ts';
import { clientCreateOp, pullAll, readDeviceId, readStore, seedOutbox } from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

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

test('@p0 1.8-E2E-006 a pending job keeps its shell through a worker restart and every tab closing, and the new shell arrives once the outbox drains', async ({
  page,
  context,
  seed,
  browserName,
}) => {
  // Stopping a worker needs CDP, and Playwright only routes the requests a worker makes
  // itself (the update check, its precache) on Chromium; the rule under test is the same
  // `public/sw.js` everywhere, and its lifecycle is also run in `sw-lifecycle.test.ts`.
  test.skip(browserName !== 'chromium', 'needs CDP to stop the worker and service-worker request routing (Chromium only)');
  test.setTimeout(120_000);

  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signInForDurability(page, context, account.email);
  const shells = await waitForShellCache(page);
  expect(shells).toContain('/');
  const [original] = await shellCacheNames(page);
  expect(original).toBeDefined();

  // One op that cannot reach the server: the job is not over.
  let pushBlocked = true;
  await context.route(
    (url) => url.pathname === '/api/sync/ops',
    (route) => (pushBlocked ? route.abort('internetdisconnected') : route.continue()),
  );
  const user = { ...account, deviceId: await readDeviceId(page, database) };
  await seedOutbox(page, database, [clientCreateOp(user)]);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  // The page reported the backlog, and the worker pinned the build the job runs on: the
  // entry chunk of this document.
  const entry = await runningEntry(page);
  expect(entry).toMatch(/^\/assets\/index-.+\.js$/);
  await expect.poll(() => readShellPin(page), { timeout: 15_000 }).toBe(entry);

  // A new build is deployed and its worker installs and waits.
  const restoreBuild = await serveNextBuild(context);
  try {
    await installNextShell(page);
    expect(await shellCacheNames(page)).toHaveLength(2);

    // D-1, first half: the browser stops the worker, the tab is reopened. The restarted
    // worker has a fresh scope and no message, and must still serve the old shell.
    await stopServiceWorkers(page);
    await page.reload();
    await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(page.locator('meta[name="shell-build"]')).toHaveCount(0);

    // D-1, second half: every tab closes, so the browser activates the new worker by
    // itself. The app reopens on the old shell anyway, from the cache that is still kept.
    let tab = await closeEveryTab(context);
    await tab.goto('/');
    await expect(tab.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(tab.locator('meta[name="shell-build"]')).toHaveCount(0);
    // The new worker really took over (not discarded, not still waiting): the lifecycle
    // settled on an activated worker, and its cache is there beside the pinned one.
    await waitForSettledShell(tab);
    expect(await shellCacheNames(tab)).toEqual([original, `${original}-next`]);
    expect(await readShellPin(tab)).toBe(entry);
    expect(await runningEntry(tab)).toBe(entry);

    // The job finishes: the push goes through and the outbox drains.
    pushBlocked = false;
    await tab.goto('/sync');
    const syncNow = tab.getByRole('button', { name: 'Sincronizar agora' });
    await expect(syncNow).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
    await syncNow.click();
    await expect
      .poll(async () => (await readStore<OutboxRecord>(tab, database, 'outbox')).every((row) => row.status === 'acked'), {
        timeout: 30_000,
      })
      .toBe(true);
    await expect.poll(() => readShellPin(tab), { timeout: 15_000 }).toBeNull();

    // The next launch takes the new shell, and the old cache goes.
    tab = await closeEveryTab(context);
    await tab.goto('/');
    await expect(tab.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(tab.locator('meta[name="shell-build"]')).toHaveCount(1);
    expect(await runningEntry(tab)).toBe(entry.replace(/\.js$/, '-next.js'));
    await waitForSettledShell(tab);
    await expect.poll(() => shellCacheNames(tab), { timeout: 15_000 }).toEqual([`${original}-next`]);
  } finally {
    await restoreBuild();
  }
});

/*
 * 4.3-E2E-003 (E3-A8's touch rule): on the Android emulation the Position box is the
 * reorder path that costs one tap and a number; typed by touch, it moves the row like the
 * desktop path does. Runs against the built bundle like every scenario here.
 */
test('@p1 4.3-E2E-003 the Position box typed by touch moves a Sumário row', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'the touch rule is asserted on the Android emulation; WebKit runs the desktop spec');
  await resetEmpresaB({ standard: true });
  const account = TEST_SEED.companies[1];
  await signInForDurability(page, context, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  // Home › Novo relatório › client and obra created inline › Continuar.
  await page.getByRole('button', { name: 'Novo relatório' }).tap();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await dialog.getByRole('combobox', { name: 'Cliente' }).fill('Cliente por toque');
  await page.getByRole('option', { name: 'Criar “Cliente por toque”' }).tap();
  await expect(dialog.getByRole('combobox', { name: 'Cliente' })).toHaveValue('Cliente por toque');
  await dialog.getByRole('combobox', { name: 'Local (obra)' }).fill('Obra por toque');
  await page.getByRole('option', { name: 'Criar “Obra por toque”' }).tap();
  await expect(dialog.getByRole('combobox', { name: 'Local (obra)' })).toHaveValue('Obra por toque');
  await dialog.getByRole('button', { name: 'Continuar' }).tap();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);

  // The Project's dialog: the start date by touch and keyboard, then Criar.
  const create = page.getByRole('dialog', { name: 'Novo relatório' });
  await create.getByRole('group', { name: 'Início da parada' }).getByRole('spinbutton').first().tap();
  await page.keyboard.type('06092026');
  await create.getByRole('button', { name: 'Criar relatório' }).tap();
  await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const titles = page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title');
  await expect(titles.nth(3)).toHaveText('Definições');

  // The Position box of row 2, tapped and typed: the row lands at 4 and the move is announced.
  const box = page.getByRole('textbox', { name: 'Número de Definições — digite outro para mover' });
  await box.tap();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await expect(titles.nth(5)).toHaveText('Definições');
  await expect(page.getByTestId('sumario-announcer')).toHaveText('Seção 2 movida para a posição 4 de 11');
  await expect(box).toHaveValue('4');
  await expect(page.getByText('Definições movida — numeração refeita')).toBeVisible();
});
