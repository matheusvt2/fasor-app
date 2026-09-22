import {
  deviceDatabaseName,
  expect,
  readLocalMarker,
  readStoreNames,
  signIn,
  test,
  writeLocalMarker,
} from './support/merged-fixtures.ts';

const MARKER = 'e2e-local-marker';

/**
 * Matches the API routes only. A glob over every path holding "api" would also match the
 * dev server's own `/src/api/auth-client.ts` module, and the bundle would never load.
 */
const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

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
  ]);

  // Reopen the tab with the server unreachable. Without the service worker of Story 1.8
  // the document itself still has to come from the dev server, so "network down" is the
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

  // Client-side navigation, so nothing reloads and the 401 really happens mid-use.
  await page.getByRole('link', { name: 'Conta' }).click();
  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Número CREA').fill('SP 4242');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  // Server failure keeps the dialog open with its error; the banner is behind it.
  await expect(dialog.getByRole('alert')).toHaveText('Não foi possível salvar. Tente de novo.');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const banner = page.locator('.banner[data-banner="re-auth"]');
  await expect(banner).toBeVisible();
  await expect(banner.locator('.banner-text')).toHaveText(
    'Sua sessão expirou. Nada foi apagado deste aparelho.',
  );
  await expect(banner).toHaveAttribute('role', 'alert');
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
  expect(await readStoreNames(page, database)).toContain('outbox');

  await banner.getByRole('button', { name: 'Entrar de novo' }).click();
  await expect(page.locator('.login-wordmark')).toBeVisible();
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha').fill(seed.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.locator('.banner[data-banner="re-auth"]')).toHaveCount(0);
  expect(await readLocalMarker(page, database, MARKER)).toMatchObject({ kind: 'relatorio' });
});

test('@p1 1.3-E2E-002b a cold open whose cookie is gone stays on Home with the re-auth banner', async ({
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
});

test('@p1 1.3-E2E-003 the Registro profissional dialog follows the council and the row re-reads', async ({
  page,
  seed,
}) => {
  const user = seed.companies[0];
  await signIn(page, user.email);
  await page.goto('/account');

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

test('@p1 1.3-E2E-003b offline, the dialog Salvar is disabled with the reason beside it', async ({
  page,
  context,
  seed,
}) => {
  const user = seed.companies[0];
  await signIn(page, user.email);
  await page.goto('/account');

  const row = page.getByTestId('registration-row-value');
  const before = await row.textContent();

  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Número CREA').fill('SP 8888');

  // Only the account routes matter here: the sync engine of Story 1.5 has its own requests.
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/account')) requests.push(request.url());
  });
  await context.setOffline(true);

  const save = dialog.getByRole('button', { name: 'Salvar' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  const reason = dialog.locator('.btn-reason');
  await expect(reason).toHaveText('Salvar precisa de conexão');
  expect(await save.getAttribute('aria-describedby')).toBe(await reason.getAttribute('id'));

  // `force` because the button is `aria-disabled` and still focusable by design (AD-23),
  // which Playwright reads as "not enabled".
  await save.click({ force: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(requests).toEqual([]);

  await context.setOffline(false);
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Nothing was saved while offline.
  await expect(row).toHaveText(before ?? '');
});
