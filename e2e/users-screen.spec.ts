import {
  ADMIN_ROLE_ROUTES,
  ADMIN_USER_ROUTES,
  adminRoleListResponseSchema,
  adminRoleRoutePath,
  adminUserResponseSchema,
  adminUserRoutePath,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
} from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { waitForEmail } from './support/fake-email.ts';
import { appOrigin } from './support/origin.ts';
import { deviceDatabaseName, expect, horizontalOverflow, SEED_PASSWORD, signIn, test, type WorkerSeed } from './support/merged-fixtures.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { waitForCompanyPull } from './support/sync.ts';

/*
 * Story 26.9 (AD-29; `mockups/prototype/screens/92-usuarios.html`): the Usuários screen as a person
 * uses it. The Admin of this worker's Empresa B creates a user, the invitation reaches the fake
 * e-mail store, the invited person sets a password on the link's page (Story 26.6, web half) and
 * signs in on a device of his own; the Admin changes his role, pauses, reactivates and removes him.
 * Each new user gets an address and a name of this run, so a re-run never meets the last one's.
 */

/** A name and an address no earlier run used. */
function newcomer(seed: WorkerSeed, word: string): { name: string; email: string } {
  const stamp = `${seed.index}${Date.now().toString(36)}`;
  return { name: `${word} ${stamp}`, email: `${word.toLowerCase()}-${stamp}@e2e.example.com` };
}

/** The list row of a user, by the name it shows. */
function userRow(page: Page, name: string): Locator {
  return page.locator('.usr-row', { has: page.locator('.rr-primary', { hasText: name }) });
}

/** Opens the row's Overflow menu and picks one item. */
async function rowAction(page: Page, name: string, item: string): Promise<void> {
  await userRow(page, name).getByRole('button', { name: `Mais opções de ${name}` }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}

/** The Admin of this worker's Empresa B, signed in, on the Usuários screen reached from Home. */
async function adminOnUsers(page: Page, seed: WorkerSeed): Promise<void> {
  const admin = seed.companies[1];
  await resetEmpresaB(admin);
  await signIn(page, admin.email);
  await waitForCompanyPull(page, deviceDatabaseName(admin.userId));
  await page.locator('.shortcut-row').getByRole('link', { name: /Usuários/ }).click();
  await expect(page).toHaveURL(/\/usuarios$/);
  await expect(userRow(page, admin.name)).toBeVisible();
}

test.describe('26.9 the Usuários screen', () => {
  test('@p0 26.9-E2E-001 create, the link, first sign-in, change role, pause, reactivate, remove, as a person would', async ({ page, browser, seed }) => {
    test.setTimeout(180_000);
    await adminOnUsers(page, seed);
    const person = newcomer(seed, 'Convidado');

    // Novo usuário: Nome, E-mail, a role; "Enviar convite".
    await page.getByRole('button', { name: 'Novo usuário' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo usuário' });
    await expect(dialog.getByText('O convite chega neste endereço. O link vale por 72 horas.')).toBeVisible();
    await dialog.getByLabel('Nome').fill(person.name);
    await dialog.getByLabel('E-mail').fill(person.email);
    await dialog.getByRole('radio', { name: /Engenheiro de Campo/ }).click();
    const since = new Date(Date.now() - 5_000);
    await dialog.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Convite enviado para ${person.email}. Vale por 72 horas.`)).toBeVisible();
    const row = userRow(page, person.name);
    await expect(row.locator('.status-pill')).toHaveText('Convite pendente');
    await expect(row).toHaveAttribute('data-status', 'convite');
    await expect(row).toContainText('Engenheiro de Campo');

    // The invitation's link: the person sets a password and signs in on a device of his own.
    const message = await waitForEmail(person.email, 'invitation', { since });
    const device = await browser.newContext();
    try {
      const invited = await device.newPage();
      await invited.goto(`/definir-senha#${message.token}`);
      await invited.getByLabel('Senha', { exact: true }).fill(SEED_PASSWORD);
      await invited.getByLabel('Repita a senha', { exact: true }).fill(SEED_PASSWORD);
      await invited.getByRole('button', { name: 'Salvar senha' }).click();
      await expect(invited).toHaveURL(/\/login$/);
      await signIn(invited, person.email);
    } finally {
      await device.close();
    }

    // The first sign-in made him active; the Admin's list says so once it asks the route again.
    await page.reload();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Ativo');
    await expect(userRow(page, person.name)).toContainText('último acesso');

    // Editar: a new role; the Admin's list shows it at once.
    await rowAction(page, person.name, 'Editar');
    const edit = page.getByRole('dialog', { name: 'Editar usuário' });
    await expect(edit.getByLabel('E-mail')).toHaveValue(person.email);
    await expect(edit.getByText('O e-mail não muda depois do convite.')).toBeVisible();
    await edit.getByRole('radio', { name: /^Consulta/ }).click();
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByText(`${person.name} alterado. O aparelho dele segue o novo papel na próxima sincronização.`)).toBeVisible();
    await expect(userRow(page, person.name)).toContainText('Consulta');
    await expect(userRow(page, person.name)).not.toContainText('Engenheiro de Campo');

    // Pausar: the pill reads "Pausado" and the menu offers "Reativar".
    await rowAction(page, person.name, 'Pausar');
    const pause = page.getByRole('dialog', { name: `Pausar ${person.name}?` });
    await expect(pause.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await pause.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByText(`${person.name} pausado. O aparelho dele para na próxima vez que falar com o servidor.`)).toBeVisible();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Pausado');
    await userRow(page, person.name).getByRole('button', { name: `Mais opções de ${person.name}` }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Editar', 'Reativar', 'Remover']);
    await page.getByRole('menuitem', { name: 'Reativar', exact: true }).click();

    // Reativar.
    const reactivate = page.getByRole('dialog', { name: `Reativar ${person.name}?` });
    await expect(reactivate).toContainText('Ele volta a entrar com a mesma senha e o mesmo papel, Consulta.');
    await reactivate.getByRole('button', { name: 'Reativar' }).click();
    await expect(page.getByText(`${person.name} reativado. Ele já pode entrar.`)).toBeVisible();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Ativo');

    // Remover: the row leaves the "Todos" list and shows under "Removido".
    await rowAction(page, person.name, 'Remover');
    const remove = page.getByRole('dialog', { name: `Remover ${person.name}?` });
    await remove.getByRole('button', { name: 'Remover' }).click();
    await expect(page.getByText(`${person.name} removido. O aparelho dele para na próxima vez que falar com o servidor.`)).toBeVisible();
    await expect(userRow(page, person.name)).toHaveCount(0);
    await page.getByRole('radiogroup', { name: 'Situação' }).getByRole('radio', { name: 'Removido' }).click();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Removido');
    await expect(page.locator('.usr-count')).toContainText('removido');
  });

  test('@p1 26.9-E2E-002 the last Admin, the duplicate e-mail, offline, and the screen at 390, 768 and 1280 px by keyboard', async ({ page, seed }) => {
    test.setTimeout(150_000);
    await adminOnUsers(page, seed);
    const admin = seed.companies[1];
    const adminWrites: string[] = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/admin/users')) adminWrites.push(request.url());
    });

    // The only Admin removing or pausing himself: the sentence, and nothing changes.
    for (const item of ['Remover', 'Pausar']) {
      await rowAction(page, admin.name, item);
      const refusal = page.getByRole('alertdialog', { name: 'Não é possível' });
      await expect(refusal).toContainText('Você é o único Admin ativo. Dê o papel Admin a outra pessoa antes de pausar, remover ou mudar o seu papel.');
      await refusal.getByRole('button', { name: 'Entendi' }).click();
      await expect(refusal).toBeHidden();
    }
    await expect(userRow(page, admin.name).locator('.status-pill')).toHaveText('Ativo');
    expect(adminWrites).toEqual([]);

    // His own edit: the Banner above the roles, the other roles disabled.
    await rowAction(page, admin.name, 'Editar');
    const self = page.getByRole('dialog', { name: 'Editar usuário' });
    await expect(self.getByRole('status')).toContainText('Você é o único Admin ativo.');
    await expect(self.getByRole('radio', { name: /^Consulta/ })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(self).toBeHidden();

    // A duplicate e-mail: the red field, the frame's sentence, "Enviar convite" waits until it changes.
    await page.getByRole('button', { name: 'Novo usuário' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo usuário' });
    await dialog.getByLabel('Nome').fill('Outra Pessoa');
    await dialog.getByLabel('E-mail').fill(admin.email);
    await dialog.getByRole('radio', { name: /^Consulta/ }).click();
    await dialog.getByRole('button', { name: 'Enviar convite' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Este e-mail já está cadastrado. Se a pessoa foi removida, use Reativar na lista, filtro Removido.');
    await expect(dialog.getByLabel('E-mail')).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('button', { name: 'Enviar convite' })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 390, 768 and 1280 px, the list and a dialog open: no sideways scroll; every action by keyboard.
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(userRow(page, admin.name)).toBeVisible();
      expect(await horizontalOverflow(page), `list at ${width} px`).toBeLessThanOrEqual(0);
      const create = page.getByRole('button', { name: 'Novo usuário' });
      await create.focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Nome')).toBeFocused();
      expect(await horizontalOverflow(page), `dialog at ${width} px`).toBeLessThanOrEqual(0);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(create).toBeFocused();
      // Tab from "Novo usuário" reaches the Situação chips (one tab stop, the checked one), then the Papel field;
      // the arrow keys move the filter.
      await page.keyboard.press('Tab');
      const todos = page.getByRole('radiogroup', { name: 'Situação' }).getByRole('radio', { name: 'Todos' });
      await expect(todos).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radiogroup', { name: 'Situação' }).getByRole('radio', { name: 'Ativo' })).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('ArrowLeft');
      await expect(todos).toHaveAttribute('aria-checked', 'true');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('combobox', { name: 'Papel' })).toBeFocused();
      // The row menu opens and closes by keyboard.
      await userRow(page, admin.name).getByRole('button', { name: `Mais opções de ${admin.name}` }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menuitem', { name: 'Editar', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
    }

    // Offline: the list shows from the device, every action is disabled with the Banner line, nothing is asked.
    adminWrites.length = 0;
    const reads: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/admin/users')) reads.push(request.url());
    });
    await page.context().setOffline(true);
    try {
      await expect(page.locator('.usr-offline')).toHaveText('Sem conexão. A lista é a da última sincronização. Criar ou alterar um usuário precisa de conexão.');
      await expect(userRow(page, admin.name)).toBeVisible();
      const create = page.getByRole('button', { name: 'Novo usuário' });
      await expect(create).toHaveAttribute('aria-disabled', 'true');
      await expect(userRow(page, admin.name).getByRole('button', { name: `Mais opções de ${admin.name}` })).toHaveAttribute('aria-disabled', 'true');
      await create.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(reads).toEqual([]);
    } finally {
      await page.context().setOffline(false);
    }
  });

  test('@p1 e26r-E2E-001 a removed user whose custom role was removed: Reativar is refused with the sentence and he stays removed', async ({ page, seed }) => {
    test.setTimeout(120_000);
    await adminOnUsers(page, seed);
    const person = newcomer(seed, 'Estagiario');
    // The setup through the Admin's routes, as the screens would call them: a custom role, a user
    // holding it, the user removed, then the role removed (a removed user holds no role for the role rules).
    const headers = { ...appOrigin(page), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) };
    const role = await page.request.post(ADMIN_ROLE_ROUTES.create.path, { headers, data: { name: 'Estagiário' } });
    expect(role.status(), await role.text()).toBe(201);
    const roleId = adminRoleListResponseSchema.parse(await role.json()).roles.find((entry) => entry.name === 'Estagiário')!.id;
    const created = await page.request.post(ADMIN_USER_ROUTES.create.path, { headers, data: { name: person.name, email: person.email, role_id: roleId } });
    expect(created.status(), await created.text()).toBe(201);
    const userId = adminUserResponseSchema.parse(await created.json()).user.id;
    expect((await page.request.post(adminUserRoutePath('remove', userId), { headers, data: {} })).status()).toBe(200);
    expect((await page.request.post(adminRoleRoutePath('remove', roleId), { headers, data: {} })).status()).toBe(200);

    await page.reload();
    await page.getByRole('radiogroup', { name: 'Situação' }).getByRole('radio', { name: 'Removido' }).click();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Removido');
    await rowAction(page, person.name, 'Reativar');
    await page.getByRole('dialog', { name: `Reativar ${person.name}?` }).getByRole('button', { name: 'Reativar' }).click();
    await expect(page.getByText('Esse papel não existe mais. Escolha outro.')).toBeVisible();
    await expect(userRow(page, person.name).locator('.status-pill')).toHaveText('Removido');
  });
});
