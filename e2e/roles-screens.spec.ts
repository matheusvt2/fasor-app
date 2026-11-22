import { permissionRefusalText, READ_ONLY_BANNER_TEXT, SCREEN_UNAVAILABLE_TEXT, SYSTEM_ROLE_ROW_IDS, userRolePath } from '@app/domain';
import type { Page } from '@playwright/test';
import { now } from '../apps/api/src/clock.ts';
import { asCompanyId } from '../apps/api/src/db/repositories/company-id.ts';
import { roleOp } from '../apps/api/src/db/roles.ts';
import { seedRoleUser } from '../apps/api/src/db/seed.ts';
import { applyServerBatch } from '../apps/api/src/sync/apply.ts';
import { workerRoleUser, type WorkerRole, type WorkerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { duplicateLibraryType, openTypeList } from './support/company-type.ts';
import { resetEmpresaBWithFixture, type SmallFixtureCopy } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, horizontalOverflow, signIn, test, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow, waitForCompanyPull } from './support/sync.ts';

/*
 * Story 26.5 (AD-29; `21-home-campo.html`, `44-sumario-sem-emissao.html`, `62-ficha-consulta.html`):
 * the app shows each role only its modules. One walk per seeded role (the Admin is every other
 * spec): this worker's Empresa B holds its own copy of the small fixture, the role's user is seeded
 * into it (`seedRoleUser`), signs in and waits for the company pull, which brings the role.
 */

const templatesLink = (page: Page) => page.locator('.shortcut-row').getByRole('link', { name: /Templates/ });
const cadastrosLink = (page: Page) => page.locator('.shortcut-row').getByRole('link', { name: /Cadastros/ });
const newRelatorio = (page: Page) => page.getByRole('button', { name: 'Novo relatório' });
const generate = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const preview = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Pré-visualizar' });

async function asRole(page: Page, seed: WorkerSeed, role: WorkerRole): Promise<{ fixture: SmallFixtureCopy; user: WorkerRoleUser; database: string }> {
  const fixture = await resetEmpresaBWithFixture(seed.companies[1]);
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, role));
  const user = workerRoleUser(seed.index, role);
  const database = deviceDatabaseName(user.userId);
  await signIn(page, user.email);
  await waitForCompanyPull(page, database);
  return { fixture, user, database };
}

/** A typed address of a screen the role does not hold lands on Home with the frame's Toast. */
async function typedAddressRefused(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(SCREEN_UNAVAILABLE_TEXT)).toBeVisible();
}

test.describe('26.5 the screens by role', () => {
  test('@p0 26.5-E2E-001a each seeded role sees only its modules: Engenheiro de Campo', async ({ page, seed }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const { fixture } = await asRole(page, seed, 'engenheiro_de_campo');

    // Home: no Atalhos at all, the company's list, "Novo relatório" disabled with its reason.
    await expect(page.locator(`.relatorio-card[data-relatorio="${fixture.relatorioId}"]`)).toBeVisible();
    await expect(page.locator('.shortcut-row')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Atalhos' })).toHaveCount(0);
    await expect(newRelatorio(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.home-new .btn-reason')).toHaveText(permissionRefusalText('relatorio.create'));
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // A typed address of Templates, a type editor or Cadastros lands on Home with the Toast.
    await typedAddressRefused(page, '/templates');
    await typedAddressRefused(page, `/templates/tipos/${fixture.relatorioId}`);
    await typedAddressRefused(page, '/cadastros');

    // Sumário: "Pré-visualizar" and "Gerar relatório" disabled, one shared line; the rows open.
    await page.goto(`/relatorio/${fixture.relatorioId}`);
    await expect(generate(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(preview(page)).toHaveAttribute('aria-disabled', 'true');
    const reason = page.locator('.sticky-action-bar .btn-reason', { hasText: permissionRefusalText('relatorio.issue') });
    await expect(reason).toHaveCount(1);
    const reasonId = await reason.getAttribute('id');
    expect(reasonId).not.toBeNull();
    await expect(generate(page)).toHaveAttribute('aria-describedby', new RegExp(reasonId!));
    await expect(preview(page)).toHaveAttribute('aria-describedby', new RegExp(reasonId!));
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    // The ficha opens and takes input: no read-only Banner, no read-only section.
    await page.goto(`/relatorio/${fixture.relatorioId}/ficha/${fixture.blockChaveId}`);
    await expect(page.locator('.ficha-main')).toBeVisible();
    await expect(page.locator('.fc-banner')).toHaveCount(0);
    await expect(page.locator('.ficha-main .section.is-readonly')).toHaveCount(0);
  });

  test('@p0 26.5-E2E-001b each seeded role sees only its modules: Gestor do Projeto', async ({ page, seed }) => {
    test.setTimeout(150_000);
    await asRole(page, seed, 'gestor_do_projeto');

    // Both shortcuts, as today; "Novo relatório" enabled.
    await expect(templatesLink(page)).toBeVisible();
    await expect(cadastrosLink(page)).toBeVisible();
    await expect(newRelatorio(page)).not.toHaveAttribute('aria-disabled', 'true');

    // Templates, a type editor and Cadastros each open as for every user today.
    await templatesLink(page).click();
    await expect(page).toHaveURL(/\/templates$/);
    await openTypeList(page);
    await duplicateLibraryType(page, 'transformador_forca');
    await page.goto('/');
    await cadastrosLink(page).click();
    await expect(page).toHaveURL(/\/cadastros$/);
    await expect(page.getByRole('tablist')).toBeVisible();
  });

  test('@p0 26.5-E2E-001c each seeded role sees only its modules: Responsável Técnico', async ({ page, seed }) => {
    test.setTimeout(150_000);
    const { fixture } = await asRole(page, seed, 'responsavel_tecnico');

    // Cadastros, no Templates; "Novo relatório" enabled.
    await expect(cadastrosLink(page)).toBeVisible();
    await expect(templatesLink(page)).toHaveCount(0);
    await expect(newRelatorio(page)).not.toHaveAttribute('aria-disabled', 'true');
    await typedAddressRefused(page, '/templates');

    // The Sumário issues: "Gerar relatório" and "Pré-visualizar" take the press.
    await page.goto(`/relatorio/${fixture.relatorioId}`);
    await expect(generate(page)).toBeVisible();
    await expect(generate(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText(permissionRefusalText('relatorio.issue'))).toHaveCount(0);
  });

  test('@p0 26.5-E2E-001d each seeded role sees only its modules: Consulta', async ({ page, seed }) => {
    test.setTimeout(150_000);
    const { fixture, database } = await asRole(page, seed, 'consulta');

    await expect(page.locator('.shortcut-row')).toHaveCount(0);
    await expect(newRelatorio(page)).toHaveAttribute('aria-disabled', 'true');
    await typedAddressRefused(page, '/cadastros');

    // The Sumário: the issuing controls disabled; no row takes an edit (no Overflow on the rows).
    await page.goto(`/relatorio/${fixture.relatorioId}`);
    await expect(generate(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.sumario .sum-row .overflow-trigger')).toHaveCount(0);

    // The ficha opens read-only: one Banner, no camera, no "Adicionar fotos", no Overflow.
    await page.goto(`/relatorio/${fixture.relatorioId}/ficha/${fixture.blockChaveId}`);
    await expect(page.locator('.fc-banner')).toHaveText(READ_ONLY_BANNER_TEXT);
    await expect(page.locator('.fc-banner')).toHaveCount(1);
    await expect(page.locator('.ficha-main .section.is-readonly').first()).toBeVisible();
    await expect(page.locator('.sticky-action-bar .bar-buttons.has-camera')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Adicionar fotos/ })).toHaveCount(0);
    await expect(page.locator('.ficha-head-side .overflow-trigger')).toHaveCount(0);
    // The stepper still moves.
    await expect(page.locator('.section-stepper')).toBeVisible();

    // A tap on a cell writes nothing, and a reload leaves nothing in the outbox for this relatório.
    const cell = page.locator('.ficha-main .tri-state .seg, .ficha-main .measurement-field, .ficha-main .input').first();
    await cell.click({ force: true });
    await page.reload();
    await expect(page.locator('.fc-banner')).toBeVisible();
    const queued = (await readStore<{ relatorio_id: string | null; path: string }>(page, database, 'outbox')).filter((row) => row.relatorio_id === fixture.relatorioId);
    expect(queued).toEqual([]);

    // Photos, points and the section texts open read-only too.
    await page.goto(`/relatorio/${fixture.relatorioId}/fotos`);
    await expect(page.locator('.fc-banner')).toBeVisible();
    await expect(page.locator('.gallery-bar')).toHaveCount(0);
    await page.goto(`/relatorio/${fixture.relatorioId}/pontos`);
    await expect(page.locator('.fc-banner')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Criar/ })).toHaveCount(0);
  });

  test('@p0 26.5-E2E-003 a signed-out user who opens a relatório lands on it after signing in', async ({ page, seed }) => {
    test.setTimeout(120_000);
    const fixture = await resetEmpresaBWithFixture(seed.companies[1]);
    await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'engenheiro_de_campo'));
    const user = workerRoleUser(seed.index, 'engenheiro_de_campo');

    await page.goto(`/relatorio/${fixture.relatorioId}`);
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha').fill(user.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/relatorio/${fixture.relatorioId}$`));
    await expect(generate(page)).toBeVisible({ timeout: 30_000 });
  });

  test('@p1 26.5-E2E-002 a role changed while the device was offline reaches the screen on the pull, with no reload', async ({ page, context, seed }) => {
    test.setTimeout(150_000);
    const { user } = await asRole(page, seed, 'engenheiro_de_campo');
    await expect(page.locator('.shortcut-row')).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { __noReload?: boolean }).__noReload = true;
    });

    await context.setOffline(true);
    // The Admin changes the role on the server: the server-only `user/{id}/role_id` put (a re-seed would
    // also revoke the sessions, which is not what a role change does).
    const companyId = asCompanyId(seed.companies[1].companyId);
    await withSeedDb((db) =>
      applyServerBatch(db, companyId, [roleOp(companyId, { kind: 'put', path: userRolePath(user.userId), value: SYSTEM_ROLE_ROW_IDS.gestor_do_projeto })], { now }),
    );
    await context.setOffline(false);

    await syncNow(page);
    await page.goBack();
    await expect(templatesLink(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
  });
});
