import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, syncBadge, syncWord, test } from './support/merged-fixtures.ts';
import {
  clientCreateOp,
  pullAll,
  readDeviceId,
  readStore,
  relatorioCreateOp,
  seedOutbox,
  serverOnlyOp,
} from './support/outbox.ts';

/**
 * Matches the API routes only. A glob over every path holding "api" would also match the
 * dev server's own `/src/api/...` modules, and the bundle would never load.
 */
const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

interface OutboxRecord {
  op_id: string;
  status: string;
  error_code: string | null;
  seq?: number;
}

/**
 * Leaves the tab on Sync status with the launch cycle over. The page is reloaded with the
 * API cut so the seeded rows reach the live queries; the launch cycle then fails its
 * retries (about 8 s) and the button comes back, with the rows still on the device.
 */
async function openSyncStatusWithRowsWaiting(page: Page, expectedBadge: string): Promise<void> {
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  const badge = syncBadge(page);
  await expect(syncWord(page)).toHaveText(expectedBadge);
  await badge.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeVisible();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  // The cycle could not reach the server, so the badge no longer claims the rows are on
  // their way: it reads "Sem conexão" and Sync status names the cause (retro U5), while
  // the pending count stays on the badge's data and in the headline.
  await expect(syncWord(page)).toHaveText('Sem conexão');
  await expect(page.getByTestId('sync-unreachable')).toHaveText(
    'Não foi possível falar com o servidor. Tudo fica salvo neste aparelho.',
  );
  await expect(page.locator('.sync-headline .sh-counts')).toContainText('aguardando envio');
  // The same count the badge read before the cycle ("2 pendentes") is still on it.
  await expect(syncBadge(page)).toHaveAttribute('data-pending', expectedBadge.split(' ')[0]!);
  await page.unroute(isApiRequest);
}

test('@p0 1.5-E2E-001 work done offline reaches the server on "Sincronizar agora" and comes back as the server log', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await expect(syncWord(page)).toHaveText('Sincronizado');
  const user = { ...account, deviceId: await readDeviceId(page, database) };

  const client = clientCreateOp(user);
  const relatorio = relatorioCreateOp(user);
  const relatorioId = relatorio.relatorio_id!;
  await seedOutbox(page, database, [client, relatorio]);

  await openSyncStatusWithRowsWaiting(page, '2 pendentes');
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '2');

  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await button.click();
  const badge = syncBadge(page);
  await expect(badge).toHaveAttribute('data-pending', '0', { timeout: 20_000 });
  await expect(syncWord(page)).toHaveText('Sincronizado');
  await expect(badge).toHaveAttribute('data-state', 'ok');
  await expect(page.locator('.sync-headline')).toHaveAttribute('data-tone', 'ok');
  await expect(page.locator('.sync-foot')).toContainText('Última sincronização');
  // The badge turns green as soon as the push is acked; the cycle still pulls the company
  // and relatorio streams after that. The button is aria-disabled while a cycle runs, so
  // wait for it to come back, and for the relatorio stream to be complete, before reading
  // any store.
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await expect
    .poll(
      async () =>
        (await readStore<{ id: string; complete: boolean }>(page, database, 'sync_state')).find((s) => s.id === relatorioId)
          ?.complete,
      { timeout: 20_000 },
    )
    .toBe(true);
  // The device's own push is an "Último envio" row: this device, named by the user's name
  // from the `user/{id}` row the company stream carries (retro A2), never by a raw id.
  const mine = page.locator('.sync-row', { hasText: user.name }).filter({ hasText: 'Este aparelho' });
  await expect(mine).toHaveCount(1);
  await expect(mine.locator('.sr-primary')).toHaveText(user.name);
  await expect(page.locator('.sync-row', { hasText: user.userId })).toHaveCount(0);
  await expect(mine.locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

  // The server holds both ops in their streams, through the contract.
  const company = await pullAll(page.request, '/api/sync/company');
  const pushedClient = company.ops.find((o) => o.op_id === client.op_id);
  expect(pushedClient).toBeDefined();
  expect(pushedClient!.seq).toBeGreaterThan(0);
  const stream = await pullAll(page.request, `/api/sync/relatorios/${relatorioId}`);
  const pushedRelatorio = stream.ops.find((o) => o.op_id === relatorio.op_id);
  expect(pushedRelatorio).toBeDefined();
  expect(pushedRelatorio!.seq).toBeGreaterThan(pushedClient!.seq!);

  // And the device holds the server log: both ops in remote_ops with their seqs, both outbox rows acked.
  const remote = await readStore<{ op_id: string; seq: number }>(page, database, 'remote_ops');
  expect(remote.find((r) => r.op_id === client.op_id)?.seq).toBe(pushedClient!.seq);
  expect(remote.find((r) => r.op_id === relatorio.op_id)?.seq).toBe(pushedRelatorio!.seq);
  const outbox = await readStore<OutboxRecord>(page, database, 'outbox');
  expect(outbox.find((r) => r.op_id === client.op_id)).toMatchObject({ status: 'acked', seq: pushedClient!.seq });
  expect(outbox.find((r) => r.op_id === relatorio.op_id)).toMatchObject({ status: 'acked', seq: pushedRelatorio!.seq });
  const entities = await readStore<{ entity: string; id: string }>(page, database, 'entities');
  expect(entities.some((e) => e.entity === 'relatorio' && e.id === relatorioId)).toBe(true);
  const states = await readStore<{ id: string; complete: boolean }>(page, database, 'sync_state');
  expect(states.find((s) => s.id === 'company')?.complete).toBe(true);
  expect(states.find((s) => s.id === relatorioId)?.complete).toBe(true);
});

test('@p0 1.5-E2E-003 a pull answering 426 replaces the shell with "Atualizar" while the push still goes through', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = { ...account, deviceId: await readDeviceId(page, database) };

  const pending = clientCreateOp(user);
  await seedOutbox(page, database, [pending]);

  // The server's minimum moved past this bundle: every pull answers 426.
  await page.route(
    (url) => url.pathname === '/api/sync/company',
    (route) =>
      route.fulfill({
        status: 426,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'contract_outdated', message: 'Update the app.' }),
      }),
  );
  const pushes: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sync/ops') pushes.push(request.method());
  });
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Atualização necessária' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
  await expect(page.locator('.app-bar')).toHaveCount(0);
  await expect(syncBadge(page)).toHaveCount(0);

  // The launch cycle pushed before it pulled: the op reached the server and is acked on the device.
  await expect.poll(() => pushes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect
    .poll(async () => (await readStore<OutboxRecord>(page, database, 'outbox')).find((r) => r.op_id === pending.op_id)?.status, {
      timeout: 20_000,
    })
    .toBe('acked');
  const company = await pullAll(page.request, '/api/sync/company');
  expect(company.ops.some((o) => o.op_id === pending.op_id)).toBe(true);
});

test('@p0 1.5-E2E-002 a rejected op is dead, excluded from state and listed with "Reenviar"; the button shows its reason while a cycle runs', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = { ...account, deviceId: await readDeviceId(page, database) };

  const rejected = serverOnlyOp(user);
  await seedOutbox(page, database, [rejected]);
  await openSyncStatusWithRowsWaiting(page, '1 pendente');

  // Slow the push down so the running state is observable.
  await page.route(
    (url) => url.pathname === '/api/sync/ops',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    },
  );
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await button.click();
  await expect(button).toHaveAttribute('aria-disabled', 'true');
  const reason = page.locator('.sync-actions .btn-reason');
  await expect(reason).toHaveText('Sincronizando…');
  expect(await button.getAttribute('aria-describedby')).toBe(await reason.getAttribute('id'));
  // A second tap during the cycle is a no-op: one push request only.
  await button.click({ force: true });

  const badge = syncBadge(page);
  await expect(syncWord(page)).toHaveText('Erro', { timeout: 20_000 });
  await expect(badge).toHaveAttribute('data-dead', '1');
  // The pulls that follow the push are still running; wait for the cycle to end before
  // reading the stores.
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await expect(page.locator('.sync-headline')).toHaveAttribute('data-tone', 'error');
  const row = page.getByTestId('sync-rejected-row');
  await expect(row).toContainText('1 alteração rejeitada');
  await expect(row.getByRole('button', { name: 'Reenviar' })).toBeVisible();

  const outbox = await readStore<OutboxRecord & { value: unknown }>(page, database, 'outbox');
  const dead = outbox.find((r) => r.op_id === rejected.op_id);
  expect(dead).toMatchObject({ status: 'dead', error_code: 'op_server_only', value: rejected.value });
  const entities = await readStore<{ entity: string; id: string }>(page, database, 'entities');
  expect(entities.some((e) => e.entity === 'file')).toBe(false);

  // Reenviar returns it to pending and runs a cycle; the same rejection makes it dead again.
  await page.unroute((url) => url.pathname === '/api/sync/ops');
  let pushes = 0;
  await page.route(
    (url) => url.pathname === '/api/sync/ops',
    async (route) => {
      pushes++;
      await route.continue();
    },
  );
  await row.getByRole('button', { name: 'Reenviar' }).click();
  await expect.poll(() => pushes, { timeout: 20_000 }).toBe(1);
  await expect
    .poll(async () => (await readStore<OutboxRecord>(page, database, 'outbox')).find((r) => r.op_id === rejected.op_id)?.status, {
      timeout: 20_000,
    })
    .toBe('dead');
  const again = await readStore<OutboxRecord>(page, database, 'outbox');
  expect(again.find((r) => r.op_id === rejected.op_id)).toMatchObject({ status: 'dead', error_code: 'op_server_only' });
  await expect(syncWord(page)).toHaveText('Erro');
  await expect(row).toContainText('1 alteração rejeitada');
});
