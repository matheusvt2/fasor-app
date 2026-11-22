import {
  ADMIN_ROLE_ROUTES,
  adminRoleListResponseSchema,
  adminUserRoutePath,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  restoredPermissions,
  roleInUseText,
  SCREEN_UNAVAILABLE_TEXT,
  SYSTEM_ROLE_ROW_IDS,
  systemRoleRow,
  type AdminRoleView,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { seedRoleUser } from '../apps/api/src/db/seed.ts';
import { workerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test } from './support/merged-fixtures.ts';
import { appOrigin } from './support/origin.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow, waitForCompanyPull } from './support/sync.ts';

/*
 * Story 26.10 (AD-29; `mockups/prototype/screens/93-papeis.html`): Papéis e permissões. The Admin of
 * this worker's Empresa B (reset first: a reset empties the company's roles and its next seed puts
 * the five back, so the spec changes roles freely) edits the grid; what the server committed is read
 * back through the list route after each save, not only from the screen.
 * - 26.10-E2E-001 @p0: "Criar relatório" given to Engenheiro de Campo reaches a field engineer's
 *   device signed in before the change, at its next sync, with no reload; a custom role is created,
 *   given "Preencher fichas, fotos e pontos" and removed.
 * - 26.10-E2E-002 @p1: the refused removal names the count; the Gestor lands on Home with the Toast
 *   and the route answers 403; a changed seeded role restored; 390, 768 and 1280 px; eight roles at 768.
 */

const headers = (page: Page) => ({ ...appOrigin(page), [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) });

/** The roles the server holds, read through the list route as the signed-in Admin. */
async function serverRoles(page: Page): Promise<AdminRoleView[]> {
  const res = await page.request.get(ADMIN_ROLE_ROUTES.list.path, { headers: headers(page) });
  expect(res.status()).toBe(200);
  return adminRoleListResponseSchema.parse(await res.json()).roles;
}

const byName = (roles: AdminRoleView[], name: string) => roles.find((role) => role.name === name);

async function openGrid(page: Page): Promise<void> {
  await page.goto('/usuarios/papeis');
  await expect(page.getByRole('table', { name: 'Permissões por papel' })).toBeVisible({ timeout: 30_000 });
}

const cell = (page: Page, name: string) => page.getByRole('switch', { name, exact: true });
const moduleToggle = (page: Page, module: string) => page.getByRole('button', { name: `Abrir ou fechar as permissões de ${module}` });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Salvar alterações' });
const roleMenu = (page: Page, role: string) => page.getByRole('button', { name: `Opções do papel ${role}` });

/** "Salvar alterações", then the saved line. */
async function save(page: Page): Promise<void> {
  await saveButton(page).click();
  await expect(page.locator('.pp-saved-line')).toHaveText('Permissões salvas. Cada aparelho passa a segui-las na próxima sincronização.');
}

/** "Novo papel" with `name`, then its column. */
async function createRole(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Novo papel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo papel' });
  await dialog.getByRole('textbox', { name: 'Nome do papel' }).fill(name);
  await dialog.getByRole('button', { name: 'Criar papel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(roleMenu(page, name)).toBeVisible();
}

test.describe('26.10 Papéis e permissões', () => {
  test('@p0 26.10-E2E-001 a seeded role changed reaches a second device; a custom role created, given a key and removed', async ({ page, browser, seed }) => {
    test.setTimeout(180_000);
    const empresaB = seed.companies[1];
    await resetEmpresaB(empresaB);
    await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo'));
    const campo = workerRoleUser(seed.index, 'engenheiro_de_campo');

    // The field engineer's device, signed in before the change: "Novo relatório" disabled.
    const fieldContext = await browser.newContext();
    try {
      const field = await fieldContext.newPage();
      await signIn(field, campo.email);
      await waitForCompanyPull(field, deviceDatabaseName(campo.userId));
      const newRelatorio = field.getByRole('button', { name: 'Novo relatório' });
      await expect(newRelatorio).toHaveAttribute('aria-disabled', 'true');
      await field.evaluate(() => {
        (window as unknown as { __noReload?: boolean }).__noReload = true;
      });

      // The Admin gives "Criar relatório" to Engenheiro de Campo and saves.
      await signIn(page, empresaB.email);
      await openGrid(page);
      await moduleToggle(page, 'Relatórios').click();
      await cell(page, 'Criar relatório — Engenheiro de Campo').click();
      await expect(page.locator('.pp-dirty-line')).toHaveText('1 alteração não salva: Engenheiro de Campo · Criar relatório.');
      await save(page);
      expect(byName(await serverRoles(page), 'Engenheiro de Campo')!.permissions).toEqual(['relatorio.view', 'relatorio.create', 'relatorio.fill']);

      // The field device's next sync brings the change: "Novo relatório" enabled, the page never reloaded.
      await syncNow(field);
      await field.goBack();
      await expect(newRelatorio).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
      expect(await field.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    } finally {
      await fieldContext.close();
    }

    // A custom role: created with "Ver relatórios" only, given "Preencher fichas, fotos e pontos", removed.
    await createRole(page, 'Estagiário');
    await expect(page.getByText('Papel Estagiário criado. Ele aparece como uma coluna nova.')).toBeVisible();
    expect(byName(await serverRoles(page), 'Estagiário')).toMatchObject({ system: null, permissions: ['relatorio.view'], user_count: 0 });
    await cell(page, 'Preencher fichas, fotos e pontos — Estagiário').click();
    await save(page);
    expect(byName(await serverRoles(page), 'Estagiário')!.permissions).toEqual(['relatorio.view', 'relatorio.fill']);

    await roleMenu(page, 'Estagiário').click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    const confirm = page.getByRole('dialog', { name: 'Remover o papel Estagiário?' });
    await confirm.getByRole('button', { name: 'Remover' }).click();
    await expect(roleMenu(page, 'Estagiário')).toHaveCount(0);
    await expect(page.getByText('Papel removido')).toBeVisible();
    expect(byName(await serverRoles(page), 'Estagiário')).toBeUndefined();
  });

  test('@p1 26.10-E2E-002 the refused removal, the Gestor, the restore, and the widths', async ({ page, browser, seed }) => {
    test.setTimeout(180_000);
    const empresaB = seed.companies[1];
    await resetEmpresaB(empresaB);
    await withSeedDb(async (db, auth) => {
      await seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo');
      await seedRoleUser(db, auth, seed.index, 'gestor_do_projeto');
    });
    const campo = workerRoleUser(seed.index, 'engenheiro_de_campo');
    const gestor = workerRoleUser(seed.index, 'gestor_do_projeto');

    await signIn(page, empresaB.email);
    await openGrid(page);

    // A custom role held by one user: "Remover" is refused with the sentence that names the count.
    await createRole(page, 'Estagiário');
    const estagiario = byName(await serverRoles(page), 'Estagiário')!;
    const given = await page.request.patch(adminUserRoutePath('edit', campo.userId), { headers: headers(page), data: { role_id: estagiario.id } });
    expect(given.status()).toBe(200);
    await openGrid(page);
    await roleMenu(page, 'Estagiário').click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    const refused = page.getByRole('dialog', { name: 'Não é possível remover Estagiário' });
    await expect(refused).toContainText(roleInUseText({ user_count: 1, user_names: [campo.name] }));
    await refused.getByRole('button', { name: 'Entendi' }).click();
    await expect(refused).toHaveCount(0);
    expect(byName(await serverRoles(page), 'Estagiário')).toMatchObject({ user_count: 1 });
    // Back to his seeded role, so the rest reads the seeded table.
    expect((await page.request.patch(adminUserRoutePath('edit', campo.userId), { headers: headers(page), data: { role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo } })).status()).toBe(200);

    // A seeded role whose keys were changed, restored: its keys are the epic's table again.
    await openGrid(page);
    await moduleToggle(page, 'Relatórios').click();
    await cell(page, 'Criar relatório — Consulta').click();
    await save(page);
    expect(byName(await serverRoles(page), 'Consulta')!.permissions).toContain('relatorio.create');
    await roleMenu(page, 'Consulta').click();
    await page.getByRole('menuitem', { name: 'Restaurar permissões padrão' }).click();
    await expect(page.getByText('Permissões padrão de volta na grade. Salve para aplicar.')).toBeVisible();
    await save(page);
    expect(byName(await serverRoles(page), 'Consulta')!.permissions).toEqual(restoredPermissions(systemRoleRow('consulta')));

    // The widths: no sideways scroll; on a phone one role at a time; up to seven roles every one is a column at 768.
    for (const width of [390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await openGrid(page);
      expect(await horizontalOverflow(page), `${width} px`).toBeLessThanOrEqual(0);
      await expect(page.locator('th.pp-role:visible')).toHaveCount(width < 768 ? 1 : 6);
    }
    // Eight roles: at 768 one role shows at a time, the chips pick it.
    for (const name of ['Supervisor', 'Auditor']) {
      const res = await page.request.post(ADMIN_ROLE_ROUTES.create.path, { headers: headers(page), data: { name } });
      expect(res.status()).toBe(201);
    }
    expect(await serverRoles(page)).toHaveLength(8);
    await page.setViewportSize({ width: 768, height: 900 });
    await openGrid(page);
    await expect(page.locator('.pp-root')).toHaveClass(/pp-many/);
    await expect(page.locator('th.pp-role:visible')).toHaveCount(1);
    await page.getByRole('radio', { name: 'Auditor' }).click();
    await expect(page.locator('th.pp-role:visible')).toHaveText(/Auditor/);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // A Gestor do Projeto: the tab's address lands on Home with the Toast; the route answers 403.
    const gestorContext = await browser.newContext();
    try {
      const other = await gestorContext.newPage();
      await signIn(other, gestor.email);
      await waitForCompanyPull(other, deviceDatabaseName(gestor.userId));
      await other.goto('/usuarios/papeis');
      await expect(other).toHaveURL(/\/$/);
      await expect(other.getByText(SCREEN_UNAVAILABLE_TEXT)).toBeVisible();
      const forbidden = await other.request.get(ADMIN_ROLE_ROUTES.list.path, { headers: headers(other) });
      expect(forbidden.status()).toBe(403);
      expect(((await forbidden.json()) as { code: string }).code).toBe('forbidden');
    } finally {
      await gestorContext.close();
    }
  });
});
