import { makeOp, type Op } from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { readDeviceId, readStore, seedOutbox, type SeedUser } from './support/outbox.ts';

/*
 * 2.1-E2E. The Registries surface's Instrumentos tab: the six-tab shell (AC1), the
 * persistent edit panel with no Save button (AC2), the calibration-expired sort and
 * amber row (AC1, AC3), Arquivar/Remover + undo (AC4), and offline create (AC5).
 *
 * "Referenced instrument offers only Arquivar" (the other half of AC4) is not exercised
 * here: no block exists before Epic 5, and seeding one needs a full relatorio/location
 * chain through the server this story does not own. It is covered at the kernel level
 * (`packages/domain/src/checks/references.test.ts`) and is correct the day a block does.
 */

function instrumentOp(user: SeedUser, fields: Record<string, unknown>, id = newId()): Op {
  return makeOp(
    {
      kind: 'create',
      scope: 'company',
      company_id: user.companyId,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: user.userId,
      device_id: user.deviceId,
      path: `registry/instrument/${id}`,
      value: {
        id,
        kind: 'instrument',
        code: 'X1',
        name: 'Instrumento seed',
        manufacturer: null,
        model: null,
        serial: null,
        cert_number: null,
        laboratory: null,
        calibrated_at: null,
        calibration_interval_months: null,
        rbc_accredited: null,
        test_isolacao: null,
        test_resistencia_contato: null,
        test_relacao_transformacao: null,
        certificate_file_id: null,
        removed_at: null,
        ...fields,
      },
    },
    { newId, now: new Date() },
  );
}

async function seedUser(page: Page, account: { companyId: string; userId: string }, database: string): Promise<SeedUser> {
  const deviceId = await readDeviceId(page, database);
  return { companyId: account.companyId, userId: account.userId, deviceId };
}

async function syncNow(page: Page): Promise<void> {
  const badge = page.locator('.app-bar [data-testid="sync-badge"]');
  await badge.click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await button.click();
  await expect(badge).toHaveAttribute('data-pending', '0', { timeout: 20_000 });
}

test('@p0 2.1-E2E-001 Cadastros: tabs render with Instrumentos default and remembered, and a new instrument autosaves field by field', async ({
  page,
  seed,
}) => {
  const account = seed.companies[0];
  await signIn(page, account.email);

  await page.getByRole('link', { name: /Cadastros/ }).click();
  const tablist = page.getByRole('tablist', { name: 'Cadastros' });
  await expect(tablist).toBeVisible();
  await expect(tablist.getByRole('tab')).toHaveCount(6);
  await expect(page.getByRole('tab', { name: 'Instrumentos' })).toHaveAttribute('aria-selected', 'true');

  // Switch to Empresa, leave and come back: the same tab-session remembers it (AC1).
  await page.getByRole('tab', { name: 'Empresa' }).click();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.goto('/');
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await expect(page.getByRole('tab', { name: 'Empresa' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Instrumentos' }).click();

  // Create an instrument: every field commits its own op, no Save button anywhere in the panel.
  await page.getByRole('button', { name: 'Novo instrumento' }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Salvar' })).toHaveCount(0);

  await panel.getByLabel('Código').fill('9Z');
  await panel.getByLabel('Nome').fill('Instrumento de teste E2E');
  await panel.getByLabel('Data de calibração').fill('2026-01-15');
  await panel.getByLabel('Intervalo de calibração (meses)').fill('12');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  // Validity is read-only and derived: 2026-01-15 + 12 months = 15/01/2027.
  await page.getByRole('button', { name: /9Z/ }).click();
  await expect(page.locator('.registry-panel')).toContainText('15/01/2027');

  const row = page.getByRole('button', { name: /9Z/ });
  await expect(row).toContainText('9Z');
  await expect(row).toContainText('Instrumento de teste E2E');
});

test('@p1 2.1-E2E-002 an expired instrument sorts first and reads amber, never disabled', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  const expiredId = newId();
  const validId = newId();
  await seedOutbox(page, database, [
    instrumentOp(user, { code: 'Z9', calibrated_at: '2020-01-01', calibration_interval_months: 1 }, expiredId),
    instrumentOp(user, { code: 'A1', calibrated_at: '2026-01-01', calibration_interval_months: 120 }, validId),
  ]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();

  const rows = page.locator('.registry-list .registry-row');
  await expect(rows.first()).toContainText('Z9');
  await expect(rows.first().locator('.rr-expired')).toBeVisible();
  await expect(rows.first()).not.toHaveAttribute('aria-disabled', 'true');
});

test('@p1 2.1-E2E-003 an unreferenced instrument is removed behind a Confirm dialog, with undo', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const user = await seedUser(page, account, database);

  const id = newId();
  await seedOutbox(page, database, [instrumentOp(user, { code: 'R1' }, id)]);
  await page.reload();
  await page.getByRole('link', { name: /Cadastros/ }).click();

  await page.getByRole('button', { name: /R1/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByRole('button', { name: 'Remover' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remover' }).click();

  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('R1 removido');
  await toast.getByRole('button', { name: 'Desfazer' }).click();

  await expect(page.getByRole('button', { name: /R1/ })).toBeVisible();
});

test('@p2 2.1-E2E-004 an instrument created offline lands in the outbox at once and pushes on reconnect', async ({
  page,
  context,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.getByRole('link', { name: /Cadastros/ }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Novo instrumento' }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill('OFF1');
  await panel.getByRole('button', { name: 'Fechar edição' }).click();

  await expect(page.getByRole('button', { name: /OFF1/ })).toBeVisible();
  const pending = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(pending.some((row) => row.status === 'pending' && row.path.startsWith('registry/instrument/'))).toBe(true);

  await context.setOffline(false);
  await syncNow(page);
  const afterSync = await readStore<{ status: string; path: string }>(page, database, 'outbox');
  expect(afterSync.every((row) => row.status !== 'pending' || !row.path.startsWith('registry/instrument/'))).toBe(true);
});
