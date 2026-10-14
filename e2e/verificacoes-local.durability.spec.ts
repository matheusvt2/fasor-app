import { SITE_ITEM_KEYS, type LocationRow } from '@app/domain';
import type { Page, Route } from '@playwright/test';
import { signInForDurability, waitForShellCache, withoutServiceWorker } from './support/durability.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 14.3 in the durability matrix (desktop Chrome, Android Chrome emulation, WebKit,
 * against the built bundle with its service worker): site items tapped and an observation
 * typed offline survive a reload (the answers on screen, their ops still in the outbox with
 * the Em campo status op of the first one), and once back online one sync lands them on the
 * server and drains the outbox. Empresa B is this worker's own (E6-Q7).
 *
 * The Chromium projects reload truly offline, the shell served by the service worker.
 * Playwright's WebKit cuts the network below the service worker, so an offline reload fails
 * there with an internal error (`durability.spec.ts`, the same limit), and a page a worker
 * controls ignores `page.route` on WebKit (`withoutServiceWorker`). On WebKit this scenario
 * therefore runs with no shell worker and reloads online with every sync request refused,
 * which keeps the batch in the outbox just as offline does.
 */

type Local = Extract<LocationRow, { kind: 'cabine' }>;
interface OutboxRow {
  op_id: string;
  path: string;
  value: unknown;
  batch_id: string | null;
  status: string;
}

const [LUVAS, TAPETE, VARA] = SITE_ITEM_KEYS;
const NOTE = 'Tapete com rasgo junto à porta';

/** Not acknowledged by the server yet: waiting to be pushed, or pushed with no answer (a refused request leaves the op `sent`). */
const unsynced = (op: OutboxRow) => op.status === 'pending' || op.status === 'sent';

const row = (page: Page, itemKey: string) => page.locator(`li.checklist-row[data-item-key="${itemKey}"]`);
const seg = (page: Page, itemKey: string, name: 'Conforme' | 'Não conforme' | 'Não se aplica') => row(page, itemKey).getByRole('radio', { name, exact: true });
const progress = (page: Page) => page.getByTestId('local-progress');
const title = (page: Page) => page.locator('.sheet-header .sheet-title');

test('@p1 14.3-E2E-006 site items tapped and typed offline survive a reload with the outbox intact, and drain to the server on sync', async ({ page, context, seed, browserName }) => {
  test.setTimeout(180_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
  await resetEmpresaB(account, { standard: true });
  if (browserName === 'webkit') await withoutServiceWorker(page);
  await signInForDurability(page, context, account.email);
  if (browserName !== 'webkit') await waitForShellCache(page);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const enel = (await readStore<{ entity: string; row: LocationRow }>(page, database, 'entities'))
    .filter((record) => record.entity === 'location')
    .map((record) => record.row)
    .find((location) => location.relatorio_id === relatorioId && location.kind === 'cabine' && location.name === 'Cubículo Enel')!;
  await page.goto(`/relatorio/${relatorioId}/local/${enel.id}/verificacoes`);
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel', { timeout: 30_000 });
  await expect(progress(page)).toHaveText('0 de 19');

  await context.setOffline(true);
  await seg(page, LUVAS!, 'Conforme').click();
  await expect(seg(page, LUVAS!, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await seg(page, TAPETE!, 'Não conforme').click();
  await expect(seg(page, TAPETE!, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  const field = row(page, TAPETE!).getByRole('textbox', { name: 'Observação do item 2' });
  await field.click();
  await field.pressSequentially(NOTE);
  await page.keyboard.press('Tab');
  await seg(page, VARA!, 'Não se aplica').click();
  await expect(seg(page, VARA!, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
  await expect(progress(page)).toHaveText('3 de 19');

  const path = (itemKey: string, cell: 'result' | 'observation') => `location/${enel.id}/checklist/${itemKey}/${cell}`;
  const written = [
    [path(LUVAS!, 'result'), 'C'],
    ['relatorio/status', 'em_campo'],
    [path(TAPETE!, 'result'), 'NC'],
    [path(TAPETE!, 'observation'), NOTE],
    [path(VARA!, 'result'), 'NA'],
  ].sort((a, b) => a[0]!.localeCompare(b[0]!));
  const pendingNow = async () =>
    (await outbox())
      .filter(unsynced)
      .map((op) => [op.path, op.value] as [string, unknown])
      .sort((a, b) => a[0].localeCompare(b[0]));
  await expect.poll(pendingNow).toEqual(written);
  // The first answer moved the Rascunho relatório to Em campo in its own batch.
  const first = (await outbox()).find((op) => op.path === path(LUVAS!, 'result'))!;
  expect((await outbox()).find((op) => op.path === 'relatorio/status')!.batch_id).toBe(first.batch_id);
  const ids = (await outbox()).filter(unsynced).map((op) => op.op_id);

  // WebKit: online with every sync request refused (see the head of this file); Chromium: truly offline.
  const isSync = (url: URL) => url.pathname.startsWith('/api/sync');
  const refuseSync = (route: Route) => route.abort('internetdisconnected');
  if (browserName === 'webkit') {
    await page.route(isSync, refuseSync);
    await context.setOffline(false);
  }
  await page.reload();
  await expect(title(page)).toHaveText('Verificações do local — Cubículo Enel', { timeout: 30_000 });
  await expect(progress(page)).toHaveText('3 de 19');
  await expect(seg(page, LUVAS!, 'Conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(seg(page, TAPETE!, 'Não conforme')).toHaveAttribute('aria-checked', 'true');
  await expect(row(page, TAPETE!).getByRole('textbox', { name: 'Observação do item 2' })).toHaveValue(NOTE);
  await expect(seg(page, VARA!, 'Não se aplica')).toHaveAttribute('aria-checked', 'true');
  expect((await outbox()).filter(unsynced).map((op) => op.op_id)).toEqual(ids);
  expect(await pendingNow()).toEqual(written);

  if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
  await context.setOffline(false);
  await syncNow(page);
  expect((await outbox()).filter((op) => unsynced(op) || op.status === 'dead')).toEqual([]);
  expect((await outbox()).filter((op) => ids.includes(op.op_id)).map((op) => op.status)).toEqual(ids.map(() => 'acked'));
  const server = (await serverRow(account.companyId, 'location', enel.id)) as unknown as Local;
  expect(Object.fromEntries(Object.entries(server.checklist ?? {}).map(([key, entry]) => [key, [entry?.result?.value ?? null, entry?.observation?.value ?? null]]))).toEqual({
    [LUVAS!]: ['C', null],
    [TAPETE!]: ['NC', NOTE],
    [VARA!]: ['NA', null],
  });
});
