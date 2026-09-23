import { STANDARD_TEMPLATE_NAME, templateRowSchema } from '@app/domain';
import type { Page } from '@playwright/test';
import { createAuth } from '../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { resetTestCompanyData, seedUser } from '../apps/api/src/db/seed.ts';
import { pullAll } from './support/outbox.ts';
import { expect, horizontalOverflow, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';

/*
 * 3.2-E2E. The Templates surface reached from the Home shortcut, as a person would:
 * Empresa B (seeded without a template) creates the standard one from the empty state,
 * it survives a reload, reaches the server on "Sincronizar agora" and another device of
 * the company sees it; Empresa A finds the template the provisioning CLI seeded.
 */

/**
 * Empresa B back to "no template": its log and rows are emptied and its user projected
 * again, so 3.2-E2E-001 starts from the empty state on every run and every retry. Only
 * Empresa B is touched, and only through the test-company reset.
 */
async function resetEmpresaB(): Promise<void> {
  const b = TEST_SEED.companies[1];
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    await resetTestCompanyData(db, [b.companyId]);
    await seedUser(
      db,
      createAuth({
        db,
        secret: config.SESSION_SECRET,
        baseURL: config.AUTH_BASE_URL,
        trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
      }),
      {
        companyId: b.companyId,
        companyName: b.companyName,
        email: b.email,
        password: TEST_SEED.password,
        name: b.name,
        council: b.council,
        registrationNumber: b.registrationNumber,
        userId: b.userId,
      },
    );
  } finally {
    await sql.end();
  }
}

async function openTemplates(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator('.app-bar h1')).toHaveText('Templates');
}

const EMPTY = 'Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.';

test('@p0 3.2-E2E-001 Empresa B creates the standard template from the empty state, keeps it on reload and syncs it', async ({
  page,
  browser,
  seed,
}) => {
  await resetEmpresaB();
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);

  await expect(page.getByRole('heading', { level: 2, name: 'Templates (0)' })).toBeVisible();
  await expect(page.getByText(EMPTY)).toBeVisible();
  const create = page.getByRole('button', { name: 'Criar template padrão' });
  // The action waits for the first company download (a fresh device cannot know yet).
  await expect(create).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });

  // The empty state and its button fit a phone without scrolling sideways.
  const desktop = page.viewportSize()!;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(create).toBeVisible();
  expect(await horizontalOverflow(page), 'Templates empty state at 390px').toBeLessThanOrEqual(0);
  await page.setViewportSize(desktop);

  await create.click();

  const list = page.getByRole('list', { name: 'Templates ativos' });
  await expect(list.getByRole('listitem')).toHaveText([STANDARD_TEMPLATE_NAME]);
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
  await expect(page.getByText(EMPTY)).toHaveCount(0);

  // It lives on the device: a reload reads it back from IndexedDB.
  await page.reload();
  await expect(page.getByRole('list', { name: 'Templates ativos' }).getByRole('listitem')).toHaveText([
    STANDARD_TEMPLATE_NAME,
  ]);

  // "Sincronizar agora" pushes the create.
  await syncBadge(page).click();
  const syncNow = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(syncNow).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await syncNow.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });

  // The server holds exactly one template create for Empresa B, the kernel's standard row.
  const company = await pullAll(page.request, '/api/sync/company');
  const creates = company.ops.filter((op) => op.kind === 'create' && op.path.startsWith('template/'));
  expect(creates).toHaveLength(1);
  expect(templateRowSchema.parse(creates[0]!.value)).toMatchObject({
    name: STANDARD_TEMPLATE_NAME,
    seed_version: 'v1',
    removed_at: null,
  });

  // Another device of the company pulls it and lists it.
  const other = await browser.newContext();
  try {
    const tablet = await other.newPage();
    await signIn(tablet, account.email);
    await openTemplates(tablet);
    await expect(tablet.getByRole('list', { name: 'Templates ativos' }).getByRole('listitem')).toHaveText(
      [STANDARD_TEMPLATE_NAME],
      { timeout: 30_000 },
    );
    await expect(tablet.getByText(EMPTY)).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('@p0 3.2-E2E-002 Empresa A lists the template the provisioning CLI seeded', async ({ page, seed }) => {
  await signIn(page, seed.companies[0].email);
  await openTemplates(page);
  await expect(page.getByRole('list', { name: 'Templates ativos' }).getByRole('listitem')).toHaveText(
    [STANDARD_TEMPLATE_NAME],
    { timeout: 30_000 },
  );
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar template padrão' })).toHaveCount(0);
});
