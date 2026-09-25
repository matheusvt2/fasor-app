import type { Page } from '@playwright/test';
import {
  deviceDatabaseName,
  expect,
  readLocalMarker,
  readStoreNames,
  signIn,
  syncBadge,
  syncWord,
  test,
  writeLocalMarker,
} from './support/merged-fixtures.ts';
import { syncNow } from './support/sync.ts';
import { readDeviceId, readStore } from './support/outbox.ts';

const MARKER = 'e2e-local-marker';

/**
 * Matches the API routes only. A glob over every path holding "api" would also match the
 * dev server's own `/src/api/auth-client.ts` module, and the bundle would never load.
 */
const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

/** The last-session pointer the cold open boots from (`apps/web/src/state/last-session.ts`). */
const readPointer = (page: Page) => page.evaluate(() => window.localStorage.getItem('releng.last-session'));

/**
 * Waits until the company pull has brought this user's kernel row (the `user/{id}` create
 * provisioning projects), so the Account row reads the device and a save lands on it.
 */
async function waitForUserRow(page: Page, database: string, userId: string): Promise<void> {
  await expect
    .poll(
      async () =>
        (await readStore<{ entity: string; id: string }>(page, database, 'entities')).some(
          (e) => e.entity === 'user' && e.id === userId,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

test('@p0 1.3-E2E-001 signs in, keeps working with the API down, and signs out without dropping the local database', async ({
  page,
  context,
  seed,
}) => {
  const user = seed.companies[0];
  const database = deviceDatabaseName(user.userId);

  await signIn(page, user.email);
  await expect(page.locator('.app-bar .wordmark')).toHaveText('PRODUTO');
  await writeLocalMarker(page, database, MARKER);
  expect(await readStoreNames(page, database)).toEqual([
    'drafts',
    'entities',
    'files',
    'local_prefs',
    'outbox',
    'remote_ops',
    'sync_state',
    'thumbs',
  ]);

  // Reopen the tab with the server unreachable. Without the service worker of Story 1.8
  // (blocked in this project) the document itself still comes from the server, so "network down" is the
  // API being unreachable: the app must reach Home from the cookie and the local
  // database, with no sign-in prompt and no network wait.
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.locator('.login-form')).toHaveCount(0);
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  await page.unroute(isApiRequest);

  // Sign out through the Confirm dialog.
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Sair mesmo assim' }).click();

  await expect(page.locator('.login-wordmark')).toHaveText('PRODUTO');
  // The session cookie is gone.
  const cookies = await context.cookies();
  expect(cookies.filter((cookie) => cookie.name.includes('session_token'))).toHaveLength(0);
  // The database and its rows are not.
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  expect(await readStoreNames(page, database)).toContain('outbox');
});

test('@p1 1.3-E2E-001b offline with no session, Entrar is disabled with the reason beside it', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await expect(page.locator('.login-wordmark')).toHaveText('PRODUTO');
  await context.setOffline(true);
  await expect(page.locator('.login-offline')).toHaveAttribute('role', 'status');
  await expect(page.locator('.login-offline')).toContainText('Sem conexão — entre quando houver sinal');
  const submit = page.getByRole('button', { name: 'Entrar', exact: true });
  await expect(submit).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.btn-reason')).toHaveText('Entrar precisa de conexão');
  // Submitting is a no-op: no request, no spinner. `force` because the button is
  // `aria-disabled` and still focusable by design (AD-23), which Playwright reads as
  // "not enabled".
  await submit.click({ force: true });
  await expect(submit).toHaveText('Entrar');
  await expect(page.locator('.login-error')).toHaveCount(0);
  await context.setOffline(false);
});

test('@p1 1.3-E2E-001c bad credentials show one inline error', async ({ page, seed }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(seed.companies[0].email);
  await page.getByLabel('Senha').fill('senha-errada-000');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  const error = page.locator('.login-error');
  await expect(error).toHaveText('Senha incorreta');
  await expect(error).toHaveAttribute('role', 'alert');
  await expect(page.locator('.input.is-invalid')).toHaveCount(1);
  const describedBy = await page.locator('input[name="password"]').getAttribute('aria-describedby');
  expect(describedBy).toBe(await error.getAttribute('id'));
  await expect(page.locator('.login-wordmark')).toBeVisible();
});

test('@p0 1.3-E2E-002 a 401 mid-call raises the re-auth banner, leaves local data intact, and re-signing in clears it', async ({
  page,
  context,
  seed,
}) => {
  const user = seed.companies[0];
  const database = deviceDatabaseName(user.userId);

  await signIn(page, user.email);
  await writeLocalMarker(page, database, MARKER);

  // The session expires mid-use: the cookie is gone but the tab is still open.
  await context.clearCookies();

  // Client-side navigation, so nothing reloads and the 401 really happens mid-use: the
  // sync cycle "Sincronizar agora" runs is the call the server refuses. (The registration
  // save no longer calls the server at all: it is committed on the device as user ops.)
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 20_000 });
  await button.click();

  const banner = page.locator('.banner[data-banner="re-auth"]');
  await expect(banner).toBeVisible({ timeout: 20_000 });
  await expect(banner.locator('.banner-text')).toHaveText(
    'Sua sessão expirou. Nada foi apagado deste aparelho.',
  );
  await expect(banner).toHaveAttribute('role', 'alert');
  // Nothing can be sent until a new sign-in, so the badge no longer says "Sincronizado",
  // and Sync status (the page this tab is on) names the cause (retro U5).
  await expect(syncWord(page)).toHaveText('Sem conexão');
  await expect(page.getByTestId('sync-unreachable')).toHaveText('Sua sessão expirou. Entre de novo para enviar.');
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  expect(await readStoreNames(page, database)).toContain('outbox');
  expect(await readPointer(page)).not.toBeNull();

  await banner.getByRole('button', { name: 'Entrar de novo' }).click();
  await expect(page.locator('.login-wordmark')).toBeVisible();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(seed.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.locator('.banner[data-banner="re-auth"]')).toHaveCount(0);
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
});

test('@p1 1.3-E2E-002b a cold open whose cookie is gone stays on Home with the re-auth banner, twice, the second time offline', async ({
  page,
  context,
  seed,
}) => {
  const user = seed.companies[0];
  const database = deviceDatabaseName(user.userId);

  await signIn(page, user.email);
  await writeLocalMarker(page, database, MARKER);

  // The session expired while the tab was closed: the cached pointer still names the
  // user, so boot reaches Home and the server's 401 only raises the banner.
  await context.clearCookies();
  await page.reload();

  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.locator('.login-form')).toHaveCount(0);
  const banner = page.locator('.banner[data-banner="re-auth"]');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.banner-text')).toHaveText(
    'Sua sessão expirou. Nada foi apagado deste aparelho.',
  );
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  expect(await readStoreNames(page, database)).toContain('outbox');
  // Retro A8: the boot-time 401 keeps the pointer, exactly like a 401 mid-use.
  expect(await readPointer(page)).not.toBeNull();

  // A second cold open with no connection at all. The document still comes from the dev
  // server (the service worker is the durability project's), so "no connection" is the
  // API unreachable plus the browser reporting itself offline, as in 1.6-E2E-003. The
  // pointer brings Home back from the device, and the banner still stands.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.locator('.login-form')).toHaveCount(0);
  await expect(page.locator('.banner[data-banner="re-auth"]')).toBeVisible();
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  expect(await readPointer(page)).not.toBeNull();
  await page.unroute(isApiRequest);
});

test('@p1 1.3-E2E-003 the Registro profissional dialog follows the council and the row re-reads', async ({
  page,
  seed,
}) => {
  const user = seed.companies[0];
  await signIn(page, user.email);
  await waitForUserRow(page, deviceDatabaseName(user.userId), user.userId);
  await page.getByRole('link', { name: 'Conta' }).click();

  const row = page.getByTestId('registration-row-value');
  await expect(row).toHaveText(`CREA ${user.registrationNumber} · Eng. Eletricista`);

  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByText('Número CREA')).toBeVisible();

  const number = dialog.getByLabel('Número CREA');
  await number.fill('SP 7777');
  // Switching the council swaps the number label and the default title, and never
  // clears the number already typed.
  await dialog.getByRole('radio', { name: 'CRT' }).click();
  await expect(dialog.getByText('Número CRT')).toBeVisible();
  await expect(dialog.getByLabel('Número CRT')).toHaveValue('SP 7777');
  await expect(dialog.getByLabel('Título impresso')).toHaveValue('Técnico(a) em Eletrotécnica');

  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toHaveText('CRT SP 7777 · Técnico(a) em Eletrotécnica');

  // A title the user chose is theirs: switching the council must not overwrite it.
  await page.getByRole('button', { name: 'Editar' }).click();
  const custom = page.getByRole('dialog');
  await custom.getByLabel('Título impresso').fill('Eng. Eletricista Sênior');
  await custom.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toHaveText('CRT SP 7777 · Eng. Eletricista Sênior');

  await page.getByRole('button', { name: 'Editar' }).click();
  const kept = page.getByRole('dialog');
  await expect(kept.getByLabel('Título impresso')).toHaveValue('Eng. Eletricista Sênior');
  await kept.getByRole('radio', { name: 'CREA' }).click();
  await expect(kept.getByText('Número CREA')).toBeVisible();
  await expect(kept.getByLabel('Título impresso')).toHaveValue('Eng. Eletricista Sênior');

  // Put the seeded values back, and prove the CREA direction too.
  await kept.getByLabel('Número CREA').fill(user.registrationNumber);
  await kept.getByLabel('Título impresso').fill('Eng. Eletricista');
  await kept.getByRole('button', { name: 'Salvar' }).click();
  await expect(row).toHaveText(`CREA ${user.registrationNumber} · Eng. Eletricista`);
});

test('@p1 1.3-E2E-003b offline, Salvar commits the registration on the device and it reaches the server on reconnect', async ({
  page,
  context,
  seed,
}) => {
  // Company B's user, so this test's server round trip never touches the row the other
  // registration test reads.
  const user = seed.companies[1];
  const database = deviceDatabaseName(user.userId);
  const seededRow = `CRT ${user.registrationNumber} · Técnico(a) em Eletrotécnica`;
  await signIn(page, user.email);
  await waitForUserRow(page, database, user.userId);
  const device = await readDeviceId(page, database);
  await page.getByRole('link', { name: 'Conta' }).click();

  const row = page.getByTestId('registration-row-value');
  await expect(row).toHaveText(seededRow);

  // The old named action must never be called again.
  const registrationRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/account/registration') registrationRequests.push(request.url());
  });

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Número CRT').fill('SP 8888');
  await dialog.getByLabel('Título impresso').fill('Técnico em Eletrotécnica Sênior');
  const save = dialog.getByRole('button', { name: 'Salvar' });
  // Offline is no reason to refuse: the save is a local commit.
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  await expect(dialog.locator('.btn-reason')).toHaveCount(0);
  await save.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // The row re-reads the device at once.
  await expect(row).toHaveText('CRT SP 8888 · Técnico em Eletrotécnica Sênior');

  // One user op per changed field waits in the outbox (the council did not change), stamped
  // with this device's id.
  const waiting = (
    await readStore<{ path: string; value: unknown; status: string; device_id: string }>(page, database, 'outbox')
  ).filter((r) => r.path.startsWith(`user/${user.userId}/`));
  expect(waiting.map((r) => [r.path, r.value]).sort()).toEqual(
    [
      [`user/${user.userId}/registration_number`, 'SP 8888'],
      [`user/${user.userId}/title`, 'Técnico em Eletrotécnica Sênior'],
    ].sort(),
  );
  for (const r of waiting) expect(r).toMatchObject({ status: 'pending', device_id: device });

  // Back online: one cycle pushes them, and the server's entity and account read agree.
  await context.setOffline(false);
  await syncNow(page);
  await expect
    .poll(async () => (await (await page.request.get('/api/account')).json()).user, { timeout: 20_000 })
    .toMatchObject({ council: 'crt', registrationNumber: 'SP 8888', title: 'Técnico em Eletrotécnica Sênior' });
  const gone = await page.request.put('/api/account/registration', {
    data: { council: 'crea', registrationNumber: 'SP 1', title: 'Eng.' },
  });
  expect(gone.status()).toBe(404);
  expect(registrationRequests).toEqual([]);

  // Put the seeded values back through the same path, so the suite ends where it began.
  await page.getByRole('link', { name: 'Conta' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  const restore = page.getByRole('dialog');
  await restore.getByLabel('Número CRT').fill(user.registrationNumber);
  await restore.getByLabel('Título impresso').fill('Técnico(a) em Eletrotécnica');
  await restore.getByRole('button', { name: 'Salvar' }).click();
  await expect(row).toHaveText(seededRow);
  await syncNow(page);
  // Two saves from this device, each chained to its own previous op (AD-3 prev_op_id):
  // the server merged nothing, so Sync status shows no "mescladas" row.
  await expect(page.getByTestId('sync-superseded-row')).toHaveCount(0);
  await expect
    .poll(async () => (await (await page.request.get('/api/account')).json()).user, { timeout: 20_000 })
    .toMatchObject({ registrationNumber: user.registrationNumber, title: 'Técnico(a) em Eletrotécnica' });
});
