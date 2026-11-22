import { pausedSignOutNoteText, pausedSignOutText } from '@app/domain';
import type { BrowserContext, Page } from '@playwright/test';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { workerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { seedRoleUser } from '../apps/api/src/db/seed.ts';
import { adminApi } from './support/admin-route.ts';
import { signInForDurability } from './support/durability.ts';
import { resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, SEED_PASSWORD, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { SYNC_CYCLE_TIMEOUT, waitForCompanyPull } from './support/sync.ts';

/*
 * Story 26.11 (frames `94-conta-pausada.html`, `12-login-pausada.html`, the shell's `#slot-paused`):
 * a field engineer paused while he works without signal keeps what he filled on the device. The
 * Engenheiro de Campo of this worker's Empresa B (`workerRoleUser`) fills five readings of the small
 * fixture's chave seccionadora offline; the Admin pauses him through the Admin route; when the
 * device comes back the paused banner shows and the five ops stay in the outbox (read from the
 * store, never from the screen), "Sair" names five and Cancelar keeps them, a reload and a closed
 * browser keep them; after the reactivation he signs in again on the same device and the five reach
 * the server. *(2026-11-22, e26r: the reactivation ends the kept session, so the old cookie answers
 * 401 `unauthenticated` and the device stays on Login until he signs in.)*
 *
 * Runs on `durability-desktop-chrome` (the file name matches that project's pattern). The matrix
 * projects (Android emulation, WebKit) are not run in this batch (the owner's decision); the second
 * sign-in uses the Login form, which holds the `Secure` cookie on Chromium's localhost only, so on
 * WebKit that step needs the harness's own sign-in.
 */

/** Five values no fixture reading holds, typed one after the other down the insulation table. */
const READINGS = ['501', '502', '503', '504', '505'];
const CELLS = ['T1, Valor', 'T3, Valor', 'T5, Valor', 'Fase A, Valor', 'Fase B, Valor'];

interface OutboxRow {
  path: string;
  status: string;
}

const PAUSED_BANNER = 'Conta pausada. O que você preencher fica salvo neste aparelho e é enviado quando o administrador reativar a sua conta.';

/** The reading ops of the sheet the device has not had acknowledged (pending, or sent and unanswered). */
async function unsentReadings(page: Page, database: string, blockId: string): Promise<OutboxRow[]> {
  const prefix = `sheet/${blockId}/test/isolacao/cell/`;
  return (await readStore<OutboxRow>(page, database, 'outbox')).filter((row) => row.path.startsWith(prefix) && (row.status === 'pending' || row.status === 'sent'));
}

/** How many of the sheet's reading ops the server holds from this user. */
async function serverReadings(companyId: string, userId: string, blockId: string): Promise<number> {
  const { sql } = createDb(loadConfig().DATABASE_URL);
  try {
    const prefix = `sheet/${blockId}/test/isolacao/cell/%`;
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from ops where company_id = ${companyId} and actor_id = ${userId} and path like ${prefix}`;
    return row?.n ?? 0;
  } finally {
    await sql.end();
  }
}

/** Every tab of the browser closed, a fresh one opened on the app: what a browser restart leaves. */
async function restartBrowser(context: BrowserContext): Promise<Page> {
  for (const open of context.pages()) await open.close();
  const fresh = await context.newPage();
  await fresh.goto('/');
  return fresh;
}

const pausedBanner = (page: Page) => page.locator('.banner-slot .banner[data-banner="paused"]');

test('@p0 26.11-E2E-001 a paused field engineer keeps five unsent readings through the banner, "Sair", a reload and a restart, and sends them after the reactivation', async ({ page, context, request, seed }) => {
  test.setTimeout(300_000);
  const fixture = await resetEmpresaBWithFixture(seed.companies[1]);
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo'));
  const campo = workerRoleUser(seed.index, 'engenheiro_de_campo');
  const database = deviceDatabaseName(campo.userId);
  const admin = await adminApi(request, seed.companies[1].email);

  await signInForDurability(page, context, campo.email);
  await waitForCompanyPull(page, database);
  await page.goto(`/relatorio/${fixture.relatorioId}/ficha/${fixture.blockChaveId}`);
  await expect(page.locator('.ficha-main')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('group', { name: 'Seções da ficha — toque para ir à seção' }).getByRole('button', { name: /^Ensaios,/ }).click();
  const first = page.getByRole('textbox', { name: 'T1, Valor', exact: true });
  await expect(first).toBeVisible({ timeout: 30_000 });

  // Offline, five readings, each in its own cell of the insulation table (the Enter run of the first
  // table hands over after T5, so each cell is reached by its own name).
  await context.setOffline(true);
  for (const [index, cell] of CELLS.entries()) {
    const box = page.getByRole('textbox', { name: cell, exact: true });
    await box.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(READINGS[index]!);
    await page.keyboard.press('Tab');
  }
  await expect.poll(async () => (await unsentReadings(page, database, fixture.blockChaveId)).length).toBe(5);

  // The Admin pauses him while the device has no signal.
  await admin.act('pause', campo.userId);

  // The device comes back: the server refuses the push, the paused banner replaces the session one.
  await context.setOffline(false);
  await expect(pausedBanner(page)).toBeVisible({ timeout: SYNC_CYCLE_TIMEOUT });
  await expect(pausedBanner(page)).toHaveText(PAUSED_BANNER);
  await expect(pausedBanner(page)).toHaveAttribute('role', 'status');
  await expect(page.locator('.banner-slot .banner[data-banner="re-auth"]')).toHaveCount(0);
  await expect(pausedBanner(page).getByRole('button', { name: 'Entrar de novo' })).toHaveCount(0);
  expect(await unsentReadings(page, database, fixture.blockChaveId)).toHaveLength(5);

  // "Sair" names the five and what happens to them; Cancelar is the default and keeps them.
  await page.locator('.app-bar').getByRole('link', { name: 'Conta' }).click();
  const sair = page.getByRole('button', { name: 'Sair', exact: true });
  await expect(sair).toHaveAccessibleDescription(pausedSignOutNoteText(5));
  await sair.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole('heading', { name: 'Sair e apagar o que não foi enviado?' })).toBeVisible();
  await expect(dialog).toContainText(pausedSignOutText(5));
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Sair e apagar' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  expect(await unsentReadings(page, database, fixture.blockChaveId)).toHaveLength(5);

  // A reload: the boot lands on Login (Story 20.11) with the pointer and the database kept.
  await page.reload();
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  expect(await unsentReadings(page, database, fixture.blockChaveId)).toHaveLength(5);

  // A browser restart (every tab closed, a fresh one): still the five.
  const tab = await restartBrowser(context);
  await expect(tab).toHaveURL(/\/login$/, { timeout: 30_000 });
  expect(await unsentReadings(tab, database, fixture.blockChaveId)).toHaveLength(5);

  // Reactivated, he signs in again on the same device: the five reach the server and the banner is gone.
  await admin.act('reactivate', campo.userId);
  // 2026-11-22 (e26r, review of Epic 26): the reactivation ended the session the pause kept, so the
  // device's old cookie is no session any more (401 `unauthenticated`, no longer `user_inactive`):
  // the device stays on Login, and only signing in again sends the unsent work.
  const ended = await tab.request.get('/api/account');
  expect(ended.status()).toBe(401);
  expect(((await ended.json()) as { code?: string }).code).toBe('unauthenticated');
  await tab.reload();
  await expect(tab).toHaveURL(/\/login$/, { timeout: 30_000 });
  expect(await unsentReadings(tab, database, fixture.blockChaveId)).toHaveLength(5);
  await expect(tab.getByLabel('E-mail')).toHaveValue(campo.email);
  await tab.getByLabel('Senha').fill(SEED_PASSWORD);
  await tab.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(tab.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => serverReadings(campo.companyId, campo.userId, fixture.blockChaveId), { timeout: SYNC_CYCLE_TIMEOUT }).toBe(5);
  await expect.poll(async () => (await unsentReadings(tab, database, fixture.blockChaveId)).length, { timeout: SYNC_CYCLE_TIMEOUT }).toBe(0);
  await expect(tab.locator('.banner-slot .banner[data-banner="paused"], .banner-slot .banner[data-banner="re-auth"]')).toHaveCount(0);
});

test('@p0 26.11-E2E-001b a paused user on a device with no data of his reads "Conta pausada. Fale com o administrador." at Login', async ({ page, request, seed }) => {
  test.setTimeout(120_000);
  await resetEmpresaBWithFixture(seed.companies[1]);
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo'));
  const campo = workerRoleUser(seed.index, 'engenheiro_de_campo');
  const admin = await adminApi(request, seed.companies[1].email);
  await admin.act('pause', campo.userId);
  try {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(campo.email);
    await page.getByLabel('Senha').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const line = page.locator('.login-form .field .login-error');
    await expect(line).toHaveText('Conta pausada. Fale com o administrador.');
    await expect(page.getByLabel('Senha')).toHaveAccessibleDescription('Conta pausada. Fale com o administrador.');
    // No field is marked, both keep their values, and nothing of his is on the device.
    await expect(page.locator('.login-form .input.is-invalid')).toHaveCount(0);
    await expect(page.getByLabel('E-mail')).toHaveValue(campo.email);
    await expect(page.getByLabel('Senha')).toHaveValue(SEED_PASSWORD);
    await expect(page).toHaveURL(/\/login$/);
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((entry) => entry.name ?? ''));
    expect(names).not.toContain(deviceDatabaseName(campo.userId));
  } finally {
    await admin.act('reactivate', campo.userId);
  }
});
