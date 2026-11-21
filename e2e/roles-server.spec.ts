import { opRejectReasonText, OP_FORBIDDEN_BY_ROLE } from '@app/domain';
import { seedRoleUser } from '../apps/api/src/db/seed.ts';
import { workerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 26.4 (AD-29): the server refuses what the role does not allow, and the device says why.
 * The Engenheiro de Campo of this worker's Empresa B (`workerRoleUser`, seeded on demand: a reset
 * of Empresa B empties it) signs in and, as a person would on a build that still shows Cadastros
 * (Story 26.5 hides it), creates a client there. The server refuses the op `op_forbidden`, the
 * op stays on the device as rejected, and Sync status names the cause: the role, not the two
 * other refusals of the code.
 */

test('@p0 26.4-E2E-001 an Engenheiro de Campo\'s refused op shows as rejected in Sync status with the reason of the role', async ({ page, seed }) => {
  test.setTimeout(120_000);
  await resetEmpresaB(seed.companies[1]);
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo'));
  const campo = workerRoleUser(seed.index, 'engenheiro_de_campo');
  const database = deviceDatabaseName(campo.userId);

  await signIn(page, campo.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) cliente$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Nome').fill('Cliente do campo');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  await syncNow(page);
  const row = page.getByTestId('sync-rejected-row');
  await expect(row.locator('.sr-primary')).toContainText('rejeitad');
  await expect(row.locator('.sr-secondary')).toHaveText(opRejectReasonText(OP_FORBIDDEN_BY_ROLE)!);
  // The other cause of the same code is not named: the reason is the role's alone.
  await expect(row.locator('.sr-secondary')).not.toHaveText(opRejectReasonText('op_forbidden')!);

  const dead = (await readStore<{ path: string; status: string; error_code: string | null }>(page, database, 'outbox')).filter((record) => record.path.startsWith('registry/client/'));
  expect(dead.length).toBeGreaterThan(0);
  for (const record of dead) expect(record).toMatchObject({ status: 'dead', error_code: 'op_forbidden' });
});
