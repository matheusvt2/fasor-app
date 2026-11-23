import { SET_PASSWORD_PATH, SYSTEM_ROLE_ROW_IDS } from '@app/domain';
import type { Browser, Page } from '@playwright/test';
import { adminApi } from './support/admin-route.ts';
import { waitForEmail } from './support/fake-email.ts';
import { expect, test } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 29.1 (frame `90-account.html` `#acc-senha-row`, `#acc-dlg-senha`): a signed-in user changes
 * the password from the Conta screen, as each of two roles. The dialog refuses a wrong current
 * password under its field and a mismatch or a short password with the messages of "Criar senha",
 * sending nothing for the last two; a valid change keeps this device signed in, ends the session of
 * a second device, and from then on only the new password signs in. Offline the action is
 * disabled with its reason.
 *
 * Each person is invited by this worker's Empresa B Admin through his own route and sets a first
 * password through the invitation's link, so no seeded user's password ever changes.
 */

const FIRST = 'primeira-senha-29';
const CHANGED = 'senha-trocada-29a';

const freshEmail = (index: number, word: string) => `e2e-w${index}-${word}-${Date.now().toString(36)}@e2e.example.com`;
const passwordField = (page: Page) => page.getByLabel('Senha', { exact: true });

/** Signs in on Login and waits for Home. */
async function signInAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await passwordField(page).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 15_000 });
}

/** Login refuses the pair with its one wrong-password line. */
async function signInRefused(browser: Browser, email: string, password: string): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(email);
    await passwordField(page).fill(password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await context.close();
  }
}

/** The invitation's link sets the first password. */
async function acceptInvitation(page: Page, email: string): Promise<void> {
  const message = await waitForEmail(email, 'invitation');
  await page.goto(`${SET_PASSWORD_PATH}#${message.token}`);
  await passwordField(page).fill(FIRST);
  await page.getByLabel('Repita a senha').fill(FIRST);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

for (const role of ['engenheiro_de_campo', 'consulta'] as const) {
  test(`@p0 29.1-E2E-001 ${role}: "Alterar senha" on the Conta screen refuses a wrong current password and a mismatch, changes the password, keeps this device in and ends the other`, async ({ page, request, browser, seed }) => {
    test.setTimeout(150_000);
    const admin = seed.companies[1];
    await resetEmpresaB(admin);
    const api = await adminApi(request, admin.email);
    const email = freshEmail(seed.index, `senha-${role}`);
    await api.create({ name: 'Pessoa da Senha', email, role_id: SYSTEM_ROLE_ROW_IDS[role] });
    await acceptInvitation(page, email);

    // A second device, signed in before the change.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signInAs(otherPage, email, FIRST);

    await signInAs(page, email, FIRST);
    await page.getByRole('link', { name: 'Conta' }).click();
    await expect(page).toHaveURL(/\/account$/);
    const action = page.getByRole('button', { name: 'Alterar senha' });
    await expect(action).toBeEnabled();

    // Offline: disabled with its reason; a press opens nothing.
    await page.context().setOffline(true);
    try {
      await expect(action).toHaveAttribute('aria-disabled', 'true');
      await expect(action).toHaveAccessibleDescription('Alterar senha precisa de conexão');
      await action.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally {
      await page.context().setOffline(false);
    }
    await expect(action).not.toHaveAttribute('aria-disabled', 'true');

    const sent: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/change-password')) sent.push(req.method());
    });
    await action.click();
    const dialog = page.getByRole('dialog', { name: 'Alterar senha' });
    await expect(dialog).toBeVisible();
    const current = dialog.getByLabel('Senha atual');
    const next = dialog.getByLabel('Nova senha');
    const repeat = dialog.getByLabel('Repita a senha');
    await expect(current).toBeFocused();
    await expect(next).toHaveAccessibleDescription('Pelo menos 8 caracteres.');

    // Too short, then a mismatch: the messages of "Criar senha", nothing sent.
    await current.fill(FIRST);
    await next.fill('curta');
    await repeat.fill('curta');
    await dialog.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(next).toHaveAttribute('aria-invalid', 'true');
    await expect(next).toBeFocused();
    await next.fill(CHANGED);
    await repeat.fill(`${CHANGED}x`);
    await dialog.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('As duas senhas não são iguais.');
    await expect(repeat).toBeFocused();
    expect(sent).toEqual([]);

    // A wrong current password: said under its field; the password is unchanged.
    await current.fill('nao-e-a-senha');
    await repeat.fill(CHANGED);
    await dialog.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('A senha atual não confere.');
    await expect(current).toHaveAttribute('aria-invalid', 'true');
    await expect(current).toBeFocused();
    expect(sent).toEqual(['POST']);

    // The change.
    await current.fill(FIRST);
    await dialog.getByRole('button', { name: 'Salvar senha' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.toast')).toContainText('Senha alterada. Os outros aparelhos saíram desta conta.');

    // This device stays signed in: a reload still opens the Conta screen, and the server answers it.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Alterar senha' })).toBeVisible();
    expect((await page.request.get('/api/account')).status()).toBe(200);

    // The other device's session is gone.
    expect((await otherPage.request.get('/api/account')).status()).toBe(401);
    await other.close();

    // Only the new password signs in.
    await signInRefused(browser, email, FIRST);
    const fresh = await browser.newContext();
    try {
      await signInAs(await fresh.newPage(), email, CHANGED);
    } finally {
      await fresh.close();
    }
  });
}
