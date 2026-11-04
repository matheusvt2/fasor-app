import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '@app/domain';
import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 20.11 (security pass S2, `test-artifacts/manual/security-pass-2026-11-03.md`): the
 * regression proof of `attack.mjs` step 6 and `inject.mjs`. Before, "Sair" kept the user's
 * `releng-{user_id}` database, and a last-session pointer put back by hand reopened that
 * user's Home with no password, online and offline, and what was written there was pushed as
 * the user at the next sign-in. Now "Sair" flushes, confirms with what is still unsent,
 * deletes the database and only then the pointer; a boot that finds a pointer but no database
 * lands on Login without creating one. Every row is asserted on the committed state
 * (`indexedDB.databases()`, the outbox, the pointer), not only on the screen.
 */

const POINTER_KEY = 'releng.last-session';
/** The project name `pushNewRelatorio` gives, which Home shows once pulled. */
const OBRA = 'Obra da árvore';

const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[0];
  database = deviceDatabaseName(account.userId);
});

/** The IndexedDB databases of this origin, listed without opening (so never creating) one. */
const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((info) => info.name ?? ''));
const readPointer = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), POINTER_KEY);

/** Signs in, brings a relatório onto the device, and answers the pointer the boot would read. */
async function signedInWithData(page: Page): Promise<string> {
  await signIn(page, account.email);
  await pushNewRelatorio(page, account, database);
  await syncNow(page);
  await page.goto('/');
  await expect(page.getByText(OBRA).first()).toBeVisible();
  const pointer = await readPointer(page);
  expect(pointer).not.toBeNull();
  return pointer!;
}

/** "Sair" from Account, through its Confirm dialog, to Login. */
async function signOut(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Conta' }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Sair desta conta?', { timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Sair mesmo assim' }).click();
  await expect(page.locator('.login-wordmark')).toBeVisible();
}

/** What Home would show of the user, none of which may be on screen. */
async function expectNothingShown(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('.login-wordmark')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toHaveCount(0);
  await expect(page.getByText(OBRA)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo relatório' })).toHaveCount(0);
}

test('@p0 20.11-E2E-001 S2 read: after Sair, a pointer put back by hand opens nothing, online and offline, and no database comes back', async ({ page }) => {
  const pointer = await signedInWithData(page);
  await signOut(page);
  await expect.poll(() => databases(page)).not.toContain(database);
  expect(await readPointer(page)).toBeNull();

  // attack.mjs step 6: the old profile JSON back in localStorage, then a reload online.
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [POINTER_KEY, pointer] as const);
  await page.goto('/');
  await expectNothingShown(page);
  expect(await databases(page)).not.toContain(database);

  // And offline (the API unreachable and the browser saying so, as in 1.6-E2E-003).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await expectNothingShown(page);
  expect(await databases(page)).not.toContain(database);
  // The pointer is not what opens a session: it stays where the attacker put it, harmless.
  expect(await readPointer(page)).toBe(pointer);
  await page.unroute(isApiRequest);
});

test('@p0 20.11-E2E-002 S2 write: after Sair, a restored pointer gives no Home to write from, and the next sign-in sends nothing of it', async ({ page }) => {
  const tag = `INJECTED-${Date.now()}`;
  const pointer = await signedInWithData(page);
  await signOut(page);

  // inject.mjs: the pointer back, then a try at "Novo relatório".
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [POINTER_KEY, pointer] as const);
  await page.goto('/');
  await expectNothingShown(page);
  expect(await databases(page)).not.toContain(database);

  // The real user signs in again on this device: a fresh store, an empty outbox, and the
  // server holds no op of the tag (nothing could be written while signed out).
  await signIn(page, account.email);
  await syncNow(page);
  const outbox = await readStore<{ status: string; value?: unknown }>(page, database, 'outbox');
  expect(outbox.filter((row) => row.status !== 'acked')).toEqual([]);
  expect(JSON.stringify(outbox)).not.toContain(tag);
  const stream = await page.evaluate(
    async ([header, version]) => (await fetch('/api/sync/company?since=0', { headers: { [header]: version } })).text(),
    [CONTRACT_VERSION_HEADER, String(CONTRACT_VERSION)] as const,
  );
  expect(stream).not.toContain(tag);
});

test('@p0 20.11-E2E-003 Sair with work still unsent: the confirm counts it, Cancelar keeps everything, Sair mesmo assim deletes it', async ({ page }) => {
  await signIn(page, account.email);
  // The server takes no push: the flush "Sair" runs first leaves the three registration ops unsent.
  await page.route('**/api/sync/ops', (route) => route.abort('connectionrefused'));
  await expect
    .poll(async () => (await readStore<{ entity: string; id: string }>(page, database, 'entities')).some((row) => row.entity === 'user' && row.id === account.userId), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.getByRole('link', { name: 'Conta' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  const form = page.getByRole('dialog');
  await form.getByLabel('Número CREA').fill('SP 2011');
  await form.getByRole('radio', { name: 'CRT' }).click();
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const unsent = async () => (await readStore<{ status: string }>(page, database, 'outbox')).filter((row) => row.status !== 'acked').length;
  await expect.poll(unsent).toBe(3);

  const sair = page.getByRole('button', { name: 'Sair', exact: true });
  await sair.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Sair com envios pendentes?', { timeout: 20_000 });
  await expect(dialog).toHaveAccessibleDescription('3 alterações ainda não foram enviadas. Sair apaga-as deste aparelho.');

  // Cancelar: the database, the pointer and the outbox are as they were.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await databases(page)).toContain(database);
  expect(await readPointer(page)).not.toBeNull();
  expect(await unsent()).toBe(3);

  // Sair mesmo assim: gone, all of it.
  await sair.click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('Sair com envios pendentes?', { timeout: 20_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Sair mesmo assim' }).click();
  await expect(page.locator('.login-wordmark')).toBeVisible();
  await expect.poll(() => databases(page)).not.toContain(database);
  expect(await readPointer(page)).toBeNull();
  await page.unroute('**/api/sync/ops');
});
