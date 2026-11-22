import { PRODUTO, SET_PASSWORD_PATH, SYSTEM_ROLE_ROW_IDS } from '@app/domain';
import type { Page } from '@playwright/test';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { readFakeEmails } from '../apps/api/src/email/fake-store.ts';
import type { EmailPurpose } from '../apps/api/src/email/types.ts';
import { adminApi } from './support/admin-route.ts';
import { waitForEmail } from './support/fake-email.ts';
import { expect, test } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * Story 26.6, the web half (frames `10-login.html`, `11-login-esqueci.html`, `13-definir-senha.html`,
 * `14-definir-senha-expirado.html`): the e-mail's link sets a password and the person signs in;
 * "Esqueci minha senha" answers one sentence for any address and stores a message only for a
 * known one; a used or expired link says it is no longer valid.
 *
 * The Admin of this worker's Empresa B creates each invitee through his own route (`adminApi`), as
 * the Usuários screen does; every invitee has an address of his own run, so no spec shares one. The
 * link the message carries points at the api's configured origin, so the test opens its path and
 * fragment on the preview origin (`SET_PASSWORD_PATH#token`).
 */

const SENT = 'Se este e-mail estiver cadastrado, o link chega em alguns minutos. Ele vale por 1 hora. Veja também a caixa de spam.';
const EXPIRED = 'O link venceu ou já foi usado. Peça um link novo com o seu e-mail: ele serve também para um convite que venceu.';
const NEW_PASSWORD = 'uma-senha-nova-26';

/** An address no other run or spec uses. */
const freshEmail = (index: number, word: string) => `e2e-w${index}-${word}-${Date.now().toString(36)}@teste.local`;

/** The messages stored for `to` (of `purpose` when given), straight from the fake provider's table. */
async function storedEmails(to: string, purpose?: EmailPurpose): Promise<number> {
  const { sql, db } = createDb(loadConfig().DATABASE_URL);
  try {
    return (await readFakeEmails(db, { to, ...(purpose === undefined ? {} : { purpose }) })).length;
  } finally {
    await sql.end();
  }
}

/** Makes the link of `token` older than its life (the row's `expires_at` in the past), as 72 hours would. */
async function expireLink(token: string): Promise<void> {
  const { sql } = createDb(loadConfig().DATABASE_URL);
  try {
    await sql`update verification set expires_at = now() - interval '1 minute' where identifier = ${`reset-password:${token}`}`;
  } finally {
    await sql.end();
  }
}

const passwordField = (page: Page) => page.getByLabel('Senha', { exact: true });

/** Opens the link of `token`, types the password twice and presses "Salvar senha". */
async function setPasswordThroughLink(page: Page, token: string, password: string): Promise<void> {
  await page.goto(`${SET_PASSWORD_PATH}#${token}`);
  await expect(page.getByRole('heading', { name: 'Crie a sua senha' })).toBeVisible();
  // The token leaves the address as soon as the page has read it.
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('');
  await expect(passwordField(page)).toHaveAccessibleDescription('Pelo menos 8 caracteres.');
  await passwordField(page).fill(password);
  await page.getByLabel('Repita a senha').fill(password);
  await page.getByRole('button', { name: 'Salvar senha' }).click();
}

/** Login after a set password: the frame's line, then the new pair reaches Home. */
async function signInWithNewPassword(page: Page, email: string, password: string): Promise<void> {
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toHaveText('Senha criada. Entre com o seu e-mail e a senha nova.');
  await page.getByLabel('E-mail').fill(email);
  await passwordField(page).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 15_000 });
}

/** The expired page of frame 14. */
async function expectExpiredPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Este link não vale mais' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(EXPIRED);
  await expect(page.getByRole('button', { name: 'Pedir um link novo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar ao login' })).toBeVisible();
}

test('@p0 26.6-E2E-001 an invited user opens the e-mail\'s link, sets a password and signs in', async ({ page, request, seed }) => {
  test.setTimeout(120_000);
  const admin = seed.companies[1];
  await resetEmpresaB(admin);
  const api = await adminApi(request, admin.email);
  const email = freshEmail(seed.index, 'convite');

  const created = await api.create({ name: 'Fernanda Faria', email, role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo });
  expect(created.user.status).toBe('invited');
  expect(created.invitation).toBe('sent');

  const message = await waitForEmail(email, 'invitation');
  expect(message.subject).toBe(`Convite para o ${PRODUTO}`);
  expect(new URL(message.link).pathname).toBe(SET_PASSWORD_PATH);

  await setPasswordThroughLink(page, message.token, NEW_PASSWORD);
  await signInWithNewPassword(page, email, NEW_PASSWORD);
});

test('@p1 26.6-E2E-002 "Esqueci minha senha": one sentence for a known and an unknown address, a message only for the first; the link sets a new password once; a paused user gets nothing', async ({ page, request, seed }) => {
  test.setTimeout(150_000);
  const admin = seed.companies[1];
  await resetEmpresaB(admin);
  const api = await adminApi(request, admin.email);
  const known = freshEmail(seed.index, 'esqueci');
  const unknown = freshEmail(seed.index, 'ninguem');
  const created = await api.create({ name: 'Eduardo Esquecido', email: known, role_id: SYSTEM_ROLE_ROW_IDS.consulta });
  await waitForEmail(known, 'invitation');

  // Login: the typed e-mail goes along to the request page.
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(known);
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(page).toHaveURL(/\/login\/esqueci$/);
  await expect(page.getByRole('heading', { name: 'Criar uma senha nova' })).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveValue(known);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText(SENT);
  const knownAnswer = await page.getByRole('status').textContent();

  // An address nobody has reads the very same.
  await page.getByRole('button', { name: 'Usar outro e-mail' }).click();
  await page.getByLabel('E-mail').fill(unknown);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('heading', { name: 'Confira o seu e-mail' })).toBeVisible();
  expect(await page.getByRole('status').textContent()).toBe(knownAnswer);

  // Only the known address stored a message.
  const reset = await waitForEmail(known, 'reset');
  expect(reset.subject).toBe(`Crie uma senha nova no ${PRODUTO}`);
  expect(await storedEmails(unknown)).toBe(0);

  // The link sets a new password, and the person signs in with it.
  await setPasswordThroughLink(page, reset.token, NEW_PASSWORD);
  await signInWithNewPassword(page, known, NEW_PASSWORD);

  // The same link a second time: the expired page (the server knows it on "Salvar senha").
  await page.context().clearCookies();
  await setPasswordThroughLink(page, reset.token, `${NEW_PASSWORD}-2`);
  await expectExpiredPage(page);
  await page.getByRole('button', { name: 'Pedir um link novo' }).click();
  await expect(page).toHaveURL(/\/login\/esqueci$/);

  // A paused user's request shows the same sentence and stores nothing.
  await api.act('pause', created.user.id);
  const before = await storedEmails(known, 'reset');
  await page.getByLabel('E-mail').fill(known);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByRole('status')).toContainText(SENT);
  // The send runs after the answer; give it the time a message takes, then count again.
  await page.waitForTimeout(2_000);
  expect(await storedEmails(known, 'reset')).toBe(before);
});

test('@p1 26.6-E2E-003 an invitation older than its 72 hours is refused like a used link', async ({ page, request, seed }) => {
  test.setTimeout(120_000);
  const admin = seed.companies[1];
  await resetEmpresaB(admin);
  const api = await adminApi(request, admin.email);
  const email = freshEmail(seed.index, 'vencido');
  await api.create({ name: 'Vera Vencida', email, role_id: SYSTEM_ROLE_ROW_IDS.consulta });
  const message = await waitForEmail(email, 'invitation');
  await expireLink(message.token);

  await setPasswordThroughLink(page, message.token, NEW_PASSWORD);
  await expectExpiredPage(page);
  await page.getByRole('button', { name: 'Voltar ao login' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
