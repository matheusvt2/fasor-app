import type { BlockRow } from '@app/domain';
import type { Locator, Page, Route } from '@playwright/test';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 11.2 in the durability matrix: a move made offline survives a reload (the block
 * stays in its new column, the batch stays in the outbox), and once back online a sync
 * lands it on the server. Empresa B is this worker's own (E6-Q7).
 */

const tree = (page: Page) => page.getByRole('list', { name: 'Locais do relatório' });
const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');

async function openSubsolo(page: Page): Promise<void> {
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(tree(page)).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expandir 1° Subsolo' });
  if ((await expand.count()) > 0) await expand.click();
  await expect(coluna(page, 'Coluna 5')).toBeVisible();
}

test('@p1 11.2-E2E-007 a move made offline survives a reload and reaches the server once online', async ({ page, context, seed, browserName }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await openSubsolo(page);
  const blockId = (await page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: /^SEC-C05$/ }) }).getAttribute('data-block-id'))!;
  const coluna9Id = (await coluna(page, 'Coluna 9').getAttribute('data-location-id'))!;

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mais opções de SEC-C05', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Mover para…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mover SEC-C05 para…' });
  await dialog.getByRole('radio', { name: '1° Subsolo › Coluna 9', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C05']);

  // Playwright's WebKit cuts the network below the service worker, so an offline reload
  // fails with an internal error there (`durability.spec.ts`, the same limit). On WebKit the
  // reload runs online with every sync request refused, which keeps the batch in the outbox
  // just as offline does; the Chromium projects reload truly offline.
  const isSync = (url: URL) => url.pathname.startsWith('/api/sync');
  const refuseSync = (route: Route) => route.abort('internetdisconnected');
  if (browserName === 'webkit') {
    await page.route(isSync, refuseSync);
    await context.setOffline(false);
  }
  await page.reload();
  await openSubsolo(page);
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText(['SEC-C05']);
  const pending = await readStore<{ path: string; value: unknown }>(page, database, 'outbox');
  expect(pending.find((op) => op.path === `block/${blockId}/location_id`)?.value).toBe(coluna9Id);

  if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
  await context.setOffline(false);
  await syncNow(page);
  const server = (await serverRow(account.companyId, 'block', blockId)) as unknown as BlockRow;
  expect(server.location_id).toBe(coluna9Id);
});
