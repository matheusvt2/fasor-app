import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { tombstoneRelatorio } from './support/push-server-ops.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Fix batch fxrm (contract 28): the one-shot cleanup removes a relatório a device follows.
 * The device opened the relatório (its card on Home, its rows on the device); the server
 * tombstones it with `relatorio/removed_at` as `system:cleanup` (`apps/api/src/db/tombstone.ts`,
 * the production CLI's code path), and after "Sincronizar agora" the card is gone from Home and
 * the device's relatório row carries `removed_at`. The device learns it through the op alone (AD-13).
 */

interface EntityRecord {
  entity: string;
  id: string;
  row: { removed_at: string | null };
  removed_at: string | null;
}

test('@p1 fxrm-E2E-001 a relatório the cleanup tombstones leaves Home on the next sync, and the device row carries removed_at', async ({ page, seed }) => {
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database, { emCampo: true });

  // The device follows the relatório: opened once, its card on Home.
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto('/');
  const card = page.locator(`.relatorio-card[data-relatorio="${relatorioId}"]`);
  await expect(card).toBeVisible();

  await tombstoneRelatorio(account.companyId, relatorioId);
  await syncNow(page);
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(card).toHaveCount(0);

  const record = (await readStore<EntityRecord>(page, database, 'entities')).find((r) => r.entity === 'relatorio' && r.id === relatorioId);
  expect(record, 'the device keeps the relatório row as a tombstone').toBeDefined();
  expect(record!.row.removed_at).not.toBeNull();
  expect(record!.removed_at).not.toBeNull();
});
