import type { Page } from '@playwright/test';
import { fixturePath, hideTab } from './support/durability.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, syncWord, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';

/*
 * Epic 1 retro A5, checked in a real browser: the mock's container classes translated
 * into media queries and a root scope (U1, U2), the `online` event starting a sync (U3),
 * Login naming the failure it actually had (U4) and the draft toast that can be put away
 * without losing the draft (U7).
 */

/** The distinct rows the four status tiles sit on. */
async function boardRows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const tops = [...document.querySelectorAll('.status-board .status-tile')].map((tile) =>
      Math.round(tile.getBoundingClientRect().top),
    );
    return new Set(tops).size;
  });
}

test('@p0 A5-E2E-001 no surface scrolls sideways at 390, 384 (768 at 200 %), 768 or 1280 px; the status board is 2x2 below 768', async ({
  page,
  seed,
}) => {
  const favicons: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/favicon.ico') favicons.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.locator('.login-wordmark')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

  await signIn(page, seed.companies[0].email);
  for (const [width, height, rows] of [
    [390, 844, 2],
    // 768 px at 200 % zoom lays out as 384 CSS px.
    [384, 512, 2],
    [768, 1024, 1],
    [1280, 800, 1],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.getByRole('link', { name: /início/ }).or(page.getByRole('button', { name: 'Voltar' })).first().click();
    await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await expect(page.locator('.status-board .status-tile')).toHaveCount(4);
    expect(await boardRows(page), `status board rows at ${width}px`).toBe(rows);
    expect(await horizontalOverflow(page), `Home at ${width}px`).toBeLessThanOrEqual(0);
    // The wordmark and the avatar are ink, never the UA link blue or visited purple, and
    // never underlined (retro U6).
    const looks = await page.evaluate(() => {
      const ink = getComputedStyle(document.documentElement).color;
      return ['.app-bar .wordmark', '.app-bar .avatar-btn'].map((selector) => {
        const style = getComputedStyle(document.querySelector(selector)!);
        return { color: style.color === ink, decoration: style.textDecorationLine };
      });
    });
    expect(looks).toEqual([
      { color: true, decoration: 'none' },
      { color: true, decoration: 'none' },
    ]);

    await page.getByRole('link', { name: /^Templates/ }).click();
    // Empresa A's template arrives by the company pull.
    await expect(page.getByRole('list', { name: 'Templates ativos' })).toBeVisible({ timeout: 30_000 });
    expect(await horizontalOverflow(page), `Templates at ${width}px`).toBeLessThanOrEqual(0);

    await page.getByRole('link', { name: 'Conta' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible();
    expect(await horizontalOverflow(page), `Account at ${width}px`).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: /^Sincronização/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeVisible();
    expect(await horizontalOverflow(page), `Sync status at ${width}px`).toBeLessThanOrEqual(0);
  }
  // The icon is inline in the document: no request, so no 404 (retro U8).
  expect(favicons).toEqual([]);
});

test('@p0 A5-E2E-002 both Account dialogs render in Inter with styled fields, carry aria-modal and give the focus back', async ({
  page,
  seed,
}) => {
  await signIn(page, seed.companies[0].email);
  await page.getByRole('link', { name: 'Conta' }).click();

  const editar = page.getByRole('button', { name: 'Editar' });
  await editar.click();
  const form = page.getByRole('dialog', { name: 'Registro profissional' });
  await expect(form).toHaveAttribute('aria-modal', 'true');
  const fonts = await form.evaluate((dialog) =>
    [dialog.querySelector('.dialog-title'), dialog.querySelector('.field-label'), dialog.querySelector('input'), dialog.querySelector('.seg')].map(
      (node) => getComputedStyle(node!).fontFamily,
    ),
  );
  for (const family of fonts) expect(family).toMatch(/^"?Inter"?/);
  const input = form.locator('.input input').first();
  const box = await input.evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, background: style.backgroundColor };
  });
  expect(box).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });

  // Conselho: one Tab stop, arrows move the choice; Esc gives the focus back to Editar.
  await expect(form.getByRole('radio', { checked: true })).toBeFocused();
  await expect(form.locator('.segmented [tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(editar).toBeFocused();
  // Saving (nothing changed, so nothing is committed) also gives the focus back.
  await editar.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(editar).toBeFocused();

  const sair = page.getByRole('button', { name: 'Sair' });
  await sair.click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toHaveAttribute('aria-modal', 'true');
  expect(await confirm.locator('.dialog-title').evaluate((node) => getComputedStyle(node).fontFamily)).toMatch(/^"?Inter"?/);
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(sair).toBeFocused();
});

test('@p0 A5-E2E-003 coming back online pushes at once, not on the 60 s tick', async ({ page, context, seed }) => {
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.goto(fixturePath());
  const input = page.getByTestId('fixture-input');
  await expect(input).toBeVisible();
  // Let the launch cycle end, so the next timed cycle is a full minute away.
  await expect(syncWord(page)).toHaveText('Sincronizado', { timeout: 30_000 });

  await context.setOffline(true);
  await expect(syncWord(page)).toHaveText('Sem conexão');
  await input.fill(`Cabine ${Date.now()}`);
  await input.press('Enter');
  const waiting = async () =>
    (await readStore<{ status: string }>(page, database, 'outbox')).filter((row) => row.status !== 'acked').length;
  await expect.poll(waiting).toBeGreaterThan(0);

  const back = Date.now();
  await context.setOffline(false);
  await expect.poll(waiting, { timeout: 5_000 }).toBe(0);
  expect(Date.now() - back).toBeLessThan(5_000);
  await expect(syncWord(page)).toHaveText('Sincronizado', { timeout: 10_000 });
});

test('@p0 A5-E2E-004 Login names the failure: fields checked on the device, a 503 is the server, not the password', async ({
  page,
  seed,
}) => {
  const signIns: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/sign-in/email') signIns.push(request.method());
  });
  await page.goto('/login');

  // Empty and malformed input never leave the device.
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Senha')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').first()).toHaveText('Informe o e-mail');
  await expect(page.getByLabel('E-mail')).toBeFocused();
  await page.getByLabel('E-mail').fill('nao-e-email');
  await page.getByLabel('Senha').fill(seed.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail inválido')).toBeVisible();
  expect(signIns).toEqual([]);

  // The database is down: the auth route answers 503.
  const signInRoute = (url: URL) => url.pathname === '/api/auth/sign-in/email';
  await page.route(
    signInRoute,
    (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'down' }) }),
  );
  await page.getByLabel('E-mail').fill(seed.companies[0].email);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Não foi possível falar com o servidor. Tente de novo em instantes.');
  await expect(page.getByLabel('Senha')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Senha incorreta')).toHaveCount(0);
  await expect(page.locator('.login-offline')).toHaveCount(0);

  // A retry once the server is back signs in.
  await page.unroute(signInRoute);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page).toHaveTitle('PRODUTO');
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page).toHaveTitle('Conta · PRODUTO');
});

test('@p0 A5-E2E-005 the draft toast can be dismissed: the draft stays, no banner repeats it, the next launch offers it again', async ({
  page,
  seed,
}) => {
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await page.goto(fixturePath());
  const input = page.getByTestId('fixture-input');
  await input.fill('Cabine 2 — medindo');
  await hideTab(page);
  await expect.poll(async () => (await readStore(page, database, 'drafts')).length).toBe(1);

  await page.reload();
  const toast = page.getByTestId('toast');
  await expect(toast).toContainText('Rascunho encontrado');
  await expect(page.locator('.banner')).toHaveCount(0);
  const close = toast.getByRole('button', { name: 'Fechar' });
  const box = await close.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(48);
  await close.click();
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await expect(input).toHaveValue('');
  expect(await readStore(page, database, 'drafts')).toHaveLength(1);
  // Not raised again in this page session.
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId('toast')).toHaveCount(0);

  // The next launch offers it again; Esc on the focused toast also puts it away.
  await page.reload();
  await expect(page.getByTestId('toast')).toContainText('Rascunho encontrado');
  await page.getByTestId('toast').getByRole('button', { name: 'Recuperar' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('toast')).toHaveCount(0);
  expect(await readStore(page, database, 'drafts')).toHaveLength(1);

  // Leave the device clean for the rest of the suite: recover it and commit it.
  await page.reload();
  await page.getByTestId('toast').getByRole('button', { name: 'Recuperar' }).click();
  await expect(input).toHaveValue('Cabine 2 — medindo');
  await input.press('Enter');
  await expect.poll(async () => (await readStore(page, database, 'drafts')).length).toBe(0);
});

test('@p0 A5-E2E-006 Toggle, Checkbox and a grouped filter chip show the mock on look in both themes; Space toggles', async ({
  page,
  seed,
}) => {
  await signIn(page, seed.companies[0].email);
  await page.goto(fixturePath());
  const section = page.getByTestId('fixture-on-states');
  await expect(section).toBeVisible();

  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    const looks = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--primary)';
      document.body.append(probe);
      const primary = getComputedStyle(probe).color;
      probe.remove();
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!);
      return {
        primary,
        toggleOn: style('.toggle[aria-checked="true"] .track').backgroundColor,
        toggleOff: style('.toggle[aria-checked="false"] .track').backgroundColor,
        checkOn: style('.checkbox[aria-checked="true"] .box').backgroundColor,
        checkOff: style('.checkbox[aria-checked="false"] .box').backgroundColor,
        chipOn: style('.chip[aria-checked="true"]').color,
        chipOff: style('.chip[aria-checked="false"]').color,
      };
    });
    expect(looks.toggleOn, theme).toBe(looks.primary);
    expect(looks.checkOn, theme).toBe(looks.primary);
    expect(looks.chipOn, theme).toBe(looks.primary);
    expect(looks.toggleOff, theme).not.toBe(looks.primary);
    expect(looks.checkOff, theme).not.toBe(looks.primary);
    expect(looks.chipOff, theme).not.toBe(looks.primary);
  }

  // Keyboard: Space turns the off ones on.
  const toggle = section.getByRole('switch', { name: 'Alternador desligado' });
  await toggle.focus();
  await page.keyboard.press(' ');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const checkbox = section.getByRole('checkbox', { name: 'Caixa desmarcada' });
  await checkbox.focus();
  await page.keyboard.press(' ');
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
});
