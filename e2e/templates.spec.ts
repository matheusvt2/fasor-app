import { materializeEntity, STANDARD_TEMPLATE_NAME, templateRowSchema } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { createAuth } from '../apps/api/src/auth/auth.ts';
import { parseTrustedOrigins } from '../apps/api/src/auth/trusted-origins.ts';
import { loadConfig } from '../apps/api/src/config.ts';
import { createDb } from '../apps/api/src/db/client.ts';
import { asCompanyId } from '../apps/api/src/db/repositories/company-id.ts';
import { resetTestCompanyData, seedStandardTemplate, seedUser } from '../apps/api/src/db/seed.ts';
import { pullAll, readStore } from './support/outbox.ts';
import {
  deviceDatabaseName,
  expect,
  horizontalOverflow,
  signIn,
  syncBadge,
  test,
  TEST_SEED,
} from './support/merged-fixtures.ts';

/*
 * 3.2-E2E, 3.3-E2E and 3.4-E2E. The Templates surface and the Template composer, driven
 * as a person would: from the Home shortcut, by pointer and by keyboard.
 *
 * Empresa A holds the standard template the provisioning CLI seeded and is only read here.
 * Every test that writes starts by resetting Empresa B (the test-company reset, only ever
 * Empresa B) and, when it needs one, seeding the standard template into it again, so the
 * file is re-runnable on its own. Safe mid-run only because the suite runs with
 * `workers: 1` and no later spec needs data Empresa B held before.
 */

async function resetEmpresaB({ standard = false }: { standard?: boolean } = {}): Promise<void> {
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
    if (standard) await seedStandardTemplate(db, asCompanyId(b.companyId));
  } finally {
    await sql.end();
  }
}

async function openTemplates(page: Page): Promise<void> {
  await page.getByRole('link', { name: /Templates/ }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(page.locator('.app-bar h1')).toHaveText('Templates');
}

const activeList = (page: Page) => page.getByRole('list', { name: 'Templates ativos' });
const archivedList = (page: Page) => page.getByRole('list', { name: 'Templates arquivados' });
const names = (list: Locator) => list.locator('.rr-primary');

/** Opens the composer of a template from the list, by its row. */
async function openComposer(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: `Abrir template ${name}`, exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.locator('.app-bar h1')).toHaveText('Template');
  await expect(page.getByRole('textbox', { name: 'Nome do template' })).toHaveValue(name);
}

/** "Sincronizar agora" from the Sync status, until nothing is waiting. */
async function syncNow(page: Page): Promise<void> {
  const back = page.url();
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await button.click();
  await expect(syncBadge(page)).toHaveAttribute('data-pending', '0', { timeout: 30_000 });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 30_000 });
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'ok');
  await page.goto(back);
}

async function outboxPaths(page: Page, userId: string): Promise<string[]> {
  return (await readStore<{ path: string }>(page, deviceDatabaseName(userId), 'outbox')).map((op) => op.path);
}

const palette = (page: Page) => page.getByRole('complementary', { name: 'Paleta de blocos' });
const announcer = (page: Page) => page.getByTestId('composer-announcer');
const colunaNames = (page: Page, cabine: string) => page.getByRole('list', { name: `Colunas de ${cabine}` }).locator('.col-name');
const skeletonHeading = (page: Page) => page.locator('.composer-main h2').first();

/** The standard template's Coluna 9 of 1° Subsolo, which holds no equipment. */
const ORPHAN_REF = 'subsolo-1/coluna-9';
const EMPTY = 'Nenhum template. Crie um a partir do relatório padrão FO.SERV-03.';
const STANDARD_SUMMARY = 'Semente v1 · 9 seções · 6 cabines · 17 colunas · 94 blocos de equipamento';
const STANDARD_TOTALS =
  '25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos · 4 cabos de entrada · 9 cabos de saída · 5 para-raios';

// --- Story 3.2 -------------------------------------------------------------------------

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

  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
  await expect(page.getByText(EMPTY)).toHaveCount(0);

  // It lives on the device: a reload reads it back from IndexedDB.
  await page.reload();
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);

  // "Sincronizar agora" pushes the create.
  await syncNow(page);

  // The server holds exactly one template create for Empresa B, the kernel's standard row.
  const company = await pullAll(page.request, '/api/sync/company');
  const creates = company.ops.filter((op) => op.kind === 'create' && op.path.startsWith('template/'));
  expect(creates).toHaveLength(1);
  expect(templateRowSchema.parse(creates[0]!.value)).toMatchObject({
    name: STANDARD_TEMPLATE_NAME,
    seed_version: 'v1',
    archived_at: null,
    removed_at: null,
  });

  // Another device of the company pulls it and lists it.
  const other = await browser.newContext();
  try {
    const tablet = await other.newPage();
    await signIn(tablet, account.email);
    await openTemplates(tablet);
    await expect(names(activeList(tablet))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
    await expect(tablet.getByText(EMPTY)).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('@p0 3.2-E2E-002 Empresa A lists the template the provisioning CLI seeded', async ({ page, seed }) => {
  await signIn(page, seed.companies[0].email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar template padrão' })).toHaveCount(0);
});

// --- Story 3.3 -------------------------------------------------------------------------

test('@p0 3.3-E2E-001 Empresa A reads the standard template row: summary line, Novo template, Duplicar and Arquivar', async ({
  page,
  seed,
}) => {
  await signIn(page, seed.companies[0].email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (1)' })).toBeVisible();
  const row = activeList(page).getByRole('listitem');
  // The kernel's line for the standard template, which has 17 colunas (all in 1° Subsolo).
  await expect(row.locator('.rr-secondary')).toHaveText(STANDARD_SUMMARY);
  await expect(page.getByRole('button', { name: 'Novo template' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Duplicar' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Arquivar' })).toBeVisible();
  // Nothing was created from it, so it can be removed.
  await row.getByRole('button', { name: `Mais opções de ${STANDARD_TEMPLATE_NAME}` }).click();
  await expect(page.getByRole('menuitem', { name: 'Remover' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('@p0 3.3-E2E-002 "Duplicar" makes "⟨nome⟩ — cópia" with the same composition, as one template create', async ({
  page,
  seed,
}) => {
  await resetEmpresaB({ standard: true });
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });

  await activeList(page).getByRole('button', { name: 'Duplicar' }).click();
  const copyName = `${STANDARD_TEMPLATE_NAME} — cópia`;
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME, copyName]);
  await expect(page.getByText(`Duplicado como “${copyName}”`)).toBeVisible();

  const outbox = await readStore<{ kind: string; path: string; value: unknown }>(page, deviceDatabaseName(account.userId), 'outbox');
  expect(outbox).toHaveLength(1);
  expect(outbox[0]!.kind).toBe('create');
  const created = templateRowSchema.parse(outbox[0]!.value);
  expect(outbox[0]!.path).toBe(`template/${created.id}`);

  await openComposer(page, STANDARD_TEMPLATE_NAME);
  const sourceHeading = await skeletonHeading(page).textContent();
  const sourceTotals = await page.locator('.composer-meta').textContent();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await openComposer(page, copyName);
  await expect(skeletonHeading(page)).toHaveText(sourceHeading!);
  await expect(page.locator('.composer-meta')).toHaveText(sourceTotals!);
  await expect(page.locator('.composer-meta')).toHaveText(STANDARD_TOTALS);
});

test('@p0 3.3-E2E-003 archive, restore, remove with confirm and undo, all kept on reload', async ({ page, seed }) => {
  await resetEmpresaB({ standard: true });
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });

  await activeList(page).getByRole('button', { name: 'Arquivar' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Arquivados (1)' })).toBeVisible();
  await expect(names(archivedList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
  await expect(page.getByRole('heading', { level: 2, name: 'Templates (0)' })).toBeVisible();
  await page.reload();
  await expect(names(archivedList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);

  await archivedList(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
  await expect(archivedList(page)).toHaveCount(0);

  await activeList(page).getByRole('button', { name: `Mais opções de ${STANDARD_TEMPLATE_NAME}` }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  const dialog = page.getByRole('dialog', { name: `Remover ${STANDARD_TEMPLATE_NAME}?` });
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Remover' }).click();
  await expect(activeList(page)).toHaveCount(0);
  await expect(page.getByText(`${STANDARD_TEMPLATE_NAME} removido`)).toBeVisible();

  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
  await page.reload();
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
  expect((await outboxPaths(page, account.userId)).every((path) => path.startsWith('template/'))).toBe(true);
});

// --- Story 3.4 -------------------------------------------------------------------------

test('@p0 3.4-E2E-001 builds a skeleton from "Novo template" and reorders a coluna every way, announcing each move', async ({
  page,
  seed,
}) => {
  await resetEmpresaB();
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);
  await page.getByRole('button', { name: 'Novo template' }).click();
  await expect(page).toHaveURL(/\/templates\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('textbox', { name: 'Nome do template' })).toHaveValue('Novo template');

  await page.getByRole('button', { name: 'Adicionar cabine' }).click();
  await expect(page.getByRole('list', { name: 'Cabines do template' }).locator('.block-name')).toHaveText(['Cabine 1']);
  const addColuna = page.getByRole('button', { name: 'Adicionar coluna' });
  for (const n of [1, 2, 3]) {
    await addColuna.click();
    await expect(colunaNames(page, 'Cabine 1')).toHaveCount(n);
  }
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1', 'Coluna 2', 'Coluna 3']);

  await page.getByRole('button', { name: 'Mais opções de Coluna 3' }).click();
  await page.getByRole('menuitem', { name: 'Renomear' }).click();
  const rename = page.getByRole('dialog', { name: 'Renomear Coluna 3' });
  await rename.getByRole('textbox', { name: 'Nome' }).fill('Coluna 5');
  await rename.getByRole('button', { name: 'Salvar' }).click();
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1', 'Coluna 2', 'Coluna 5']);

  // Alt+Up twice, focus staying in the row.
  await page.getByRole('button', { name: /^Coluna 5/ }).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1', 'Coluna 5', 'Coluna 2']);
  await expect(announcer(page)).toHaveText('Coluna 5 movida para a posição 2 de 3');
  await expect(page.getByRole('button', { name: /^Coluna 5/ })).toBeFocused();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 5', 'Coluna 1', 'Coluna 2']);
  await expect(announcer(page)).toHaveText('Coluna 5 movida para a posição 1 de 3');

  // Overflow "Descer".
  await page.getByRole('button', { name: 'Mais opções de Coluna 5' }).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1', 'Coluna 5', 'Coluna 2']);
  await expect(announcer(page)).toHaveText('Coluna 5 movida para a posição 2 de 3');

  // The Position box.
  const posBox = page.getByRole('textbox', { name: 'Posição de Coluna 5' });
  await posBox.fill('3');
  await posBox.press('Enter');
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1', 'Coluna 2', 'Coluna 5']);
  await expect(announcer(page)).toHaveText('Coluna 5 movida para a posição 3 de 3');

  // A mouse drag from the handle to the top.
  const handle = page.getByRole('button', { name: 'Reordenar Coluna 5' });
  const from = (await handle.boundingBox())!;
  const top = (await page.getByRole('button', { name: 'Reordenar Coluna 1' }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, top.y - 4, { steps: 8 });
  await page.mouse.up();
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 5', 'Coluna 1', 'Coluna 2']);
  await expect(announcer(page)).toHaveText('Coluna 5 movida para a posição 1 de 3');

  await page.reload();
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 5', 'Coluna 1', 'Coluna 2']);

  // 3.4-E2E-004: every op of this whole edit is a template op.
  const paths = await outboxPaths(page, account.userId);
  expect(paths.length).toBeGreaterThan(5);
  expect(paths.every((path) => path.startsWith('template/'))).toBe(true);
});

test('@p0 3.4-E2E-002 sets quantities per node with the palette stepper; the coluna and the totals follow', async ({ page, seed }) => {
  await resetEmpresaB();
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);
  await page.getByRole('button', { name: 'Novo template' }).click();
  await page.getByRole('button', { name: 'Adicionar cabine' }).click();
  await page.getByRole('button', { name: 'Adicionar coluna' }).click();
  await expect(colunaNames(page, 'Cabine 1')).toHaveText(['Coluna 1']);
  await page.getByRole('button', { name: /^Coluna 1/ }).click();
  await expect(palette(page).getByText('Equipamentos · quantidade em Coluna 1')).toBeVisible();

  const stepper = (n: number) => palette(page).getByRole('group', { name: `Seccionadoras, ${n}` });
  const count = palette(page).locator('.palette-item', { hasText: 'Chave seccionadora' }).getByRole('textbox', { name: 'Quantidade' });
  await expect(count).toHaveValue('—');

  // "+" twice.
  await stepper(0).getByRole('button', { name: 'Mais um' }).click();
  await expect(stepper(1)).toBeVisible();
  await stepper(1).getByRole('button', { name: 'Mais um' }).click();
  await expect(stepper(2)).toBeVisible();
  const body = page.locator('.column-row.is-open .col-body');
  await expect(body.getByRole('group', { name: 'Seccionadoras, 2' })).toBeVisible();
  await expect(page.locator('.composer-meta')).toHaveText('2 seccionadoras');

  // A typed 3.
  await count.fill('3');
  await count.press('Enter');
  await expect(stepper(3)).toBeVisible();
  await expect(page.locator('.composer-meta')).toHaveText('3 seccionadoras');

  // Press and hold "+" for over a second: it repeats, and writes once on release.
  const plus = stepper(3).getByRole('button', { name: 'Mais um' });
  const box = (await plus.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1_100);
  await page.mouse.up();
  await expect.poll(async () => Number(await count.inputValue())).toBeGreaterThanOrEqual(8);
  const held = Number(await count.inputValue());
  await expect(palette(page).getByRole('group', { name: `Seccionadoras, ${held}` })).toBeVisible();
  await expect(page.locator('.composer-meta')).toHaveText(`${held} seccionadoras`);
  await expect(body.getByRole('group', { name: `Seccionadoras, ${held}` })).toBeVisible();

  // Another type on the same coluna, then "−" to zero shows "—" and leaves the body.
  const dj = (n: number) => palette(page).getByRole('group', { name: `Disjuntores, ${n}` });
  await dj(0).getByRole('button', { name: 'Mais um' }).click();
  await expect(page.locator('.composer-meta')).toHaveText(`${held} seccionadoras · 1 disjuntor`);
  await count.fill('1');
  await count.press('Enter');
  await expect(stepper(1)).toBeVisible();
  await stepper(1).getByRole('button', { name: 'Menos um' }).click();
  await expect(stepper(0)).toBeVisible();
  await expect(count).toHaveValue('—');
  await expect(body.getByRole('group', { name: /^Seccionadoras/ })).toHaveCount(0);
  await expect(page.locator('.composer-meta')).toHaveText('1 disjuntor');

  // Blocks placed on the cabine itself, with no coluna, count and show.
  await page.getByRole('button', { name: /^Cabine 1/ }).click();
  await expect(palette(page).getByText('Equipamentos · quantidade em Cabine 1')).toBeVisible();
  await palette(page).getByRole('group', { name: 'Cabos de entrada, 0' }).getByRole('button', { name: 'Mais um' }).click();
  await expect(page.locator('.cabine-card.is-open > .block-expand > .col-body').getByRole('group', { name: 'Cabos de entrada, 1' })).toBeVisible();
  await expect(page.locator('.composer-meta')).toHaveText('1 disjuntor · 1 cabos de entrada');
  await expect(skeletonHeading(page)).toHaveText('Esqueleto de locais · 1 cabine · 1 coluna · 2 blocos');

  const paths = await outboxPaths(page, account.userId);
  expect(paths.every((path) => path.startsWith('template/'))).toBe(true);
});

test('@p0 3.4-E2E-003 section blocks reorder, duplicate and remove with undo; Agrupar por tipo survives reload and sync', async ({
  page,
  browser,
  seed,
}) => {
  await resetEmpresaB({ standard: true });
  const account = seed.companies[1];
  await signIn(page, account.email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
  await openComposer(page, STANDARD_TEMPLATE_NAME);
  const tags = page.getByRole('list', { name: 'Blocos do template' }).locator('.block-tag');
  await expect(tags).toHaveText(['1', '2', '3', '4', '5', '6', '8', '10', '11']);

  await page.getByRole('button', { name: 'Mais opções de 2 Definições' }).click();
  await page.getByRole('menuitem', { name: 'Subir' }).click();
  await expect(tags).toHaveText(['2', '1', '3', '4', '5', '6', '8', '10', '11']);
  await expect(announcer(page)).toHaveText('Seção 2 movida para a posição 1 de 9');
  await page.getByRole('button', { name: 'Mais opções de 3 Limite de escopo' }).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '8', '10', '11']);

  await page.getByRole('button', { name: 'Mais opções de 10 Conclusão' }).click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '8', '10', '10', '11']);

  // A section added from "Seções" lands at the end.
  await palette(page).getByRole('button', { name: '5 Segurança (NR-10)' }).click();
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '8', '10', '10', '11', '5']);

  await page.getByRole('button', { name: 'Mais opções de 8 Pontos de atenção' }).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remover 8 Pontos de atenção?' });
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Remover' }).click();
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '10', '10', '11', '5']);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '8', '10', '10', '11', '5']);

  // Agrupar por tipo on the Cubículo Enel.
  const toggle = page.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' })).toHaveAttribute('aria-checked', 'true');
  await expect(tags).toHaveText(['2', '1', '4', '3', '5', '6', '8', '10', '10', '11', '5']);

  expect((await outboxPaths(page, account.userId)).every((path) => path.startsWith('template/'))).toBe(true);
  await syncNow(page);

  // Another device of the company pulls the same composition.
  const other = await browser.newContext();
  try {
    const tablet = await other.newPage();
    await signIn(tablet, account.email);
    await openTemplates(tablet);
    await expect(names(activeList(tablet))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
    await openComposer(tablet, STANDARD_TEMPLATE_NAME);
    await expect(tablet.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' })).toHaveAttribute('aria-checked', 'true');
    await expect(tablet.getByRole('list', { name: 'Blocos do template' }).locator('.block-tag')).toHaveText([
      '2', '1', '4', '3', '5', '6', '8', '10', '10', '11', '5',
    ]);
  } finally {
    await other.close();
  }
});

test('@p0 3.4-E2E-005 a coluna removed on one device while a stale device sets quantities on it converges, the orphan unseen', async ({
  page,
  browser,
  seed,
}) => {
  await resetEmpresaB({ standard: true });
  const account = seed.companies[1];

  // Context 1 (the remover, this page) and context 2 (the stale device) open the standard template.
  await signIn(page, account.email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
  await openComposer(page, STANDARD_TEMPLATE_NAME);
  const templateId = page.url().split('/').at(-1)!;
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await signIn(second, account.email);
    await openTemplates(second);
    await expect(names(activeList(second))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
    await openComposer(second, STANDARD_TEMPLATE_NAME);

    // Context 2 goes offline and, on the old row, sets quantities on Coluna 9.
    await other.setOffline(true);
    await second.getByRole('button', { name: /^Coluna 9/ }).click();
    await palette(second).getByRole('group', { name: 'Seccionadoras, 0' }).getByRole('button', { name: 'Mais um' }).click();
    await expect(palette(second).getByRole('group', { name: 'Seccionadoras, 1' })).toBeVisible();
    await palette(second).getByRole('group', { name: 'Disjuntores, 0' }).getByRole('button', { name: 'Mais um' }).click();
    await expect(second.locator('.composer-meta')).toHaveText(/^26 seccionadoras · 22 disjuntores/);

    // Context 1 removes Coluna 9 and syncs FIRST.
    await page.getByRole('button', { name: 'Mais opções de Coluna 9' }).click();
    await page.getByRole('menuitem', { name: 'Remover' }).click();
    await page.getByRole('dialog', { name: 'Remover Coluna 9?' }).getByRole('button', { name: 'Remover' }).click();
    await expect(skeletonHeading(page)).toHaveText('Esqueleto de locais · 6 cabines · 16 colunas · 94 blocos');
    await syncNow(page);

    // Context 2 comes back and syncs LAST: its blocks, built on the old row, win on the server.
    await other.setOffline(false);
    await syncNow(second);

    // The server now holds an orphan: blocks on a coluna its skeleton no longer has.
    const log = (await pullAll(page.request, '/api/sync/company')).ops.filter((op) => op.path.startsWith(`template/${templateId}`));
    const server = templateRowSchema.parse(materializeEntity({ entity: 'template', id: templateId }, log, []));
    expect(server.skeleton.some((n) => n.ref === ORPHAN_REF)).toBe(false);
    expect(server.blocks.filter((b) => b.skeleton_location_ref === ORPHAN_REF).map((b) => b.block_type).sort()).toEqual([
      'chave_seccionadora',
      'disjuntor_mt',
    ]);

    // Both sync once more; neither shows a failure, and both composers show one skeleton
    // and one set of totals, with the orphan quantities nowhere.
    await syncNow(page);
    await syncNow(second);
    for (const p of [page, second]) {
      await expect(syncBadge(p)).toHaveAttribute('data-state', 'ok');
      await expect(skeletonHeading(p)).toHaveText('Esqueleto de locais · 6 cabines · 16 colunas · 94 blocos');
      await expect(p.locator('.composer-meta')).toHaveText(STANDARD_TOTALS);
      await expect(p.getByRole('button', { name: /^Coluna 9/ })).toHaveCount(0);
    }
  } finally {
    await other.close();
  }
});

test('@p1 3.4-E2E-006 the palette sits beside the composition from 1024px, in a drawer at 768px and a sheet at 390px', async ({
  page,
  seed,
}) => {
  await signIn(page, seed.companies[0].email);
  await openTemplates(page);
  await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME], { timeout: 30_000 });
  await openComposer(page, STANDARD_TEMPLATE_NAME);
  const blocos = page.getByRole('button', { name: 'Blocos', exact: true });

  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(palette(page)).toBeVisible();
    await expect(blocos).toBeHidden();
    const side = (await palette(page).boundingBox())!;
    const main = (await page.locator('.composer-main').boundingBox())!;
    expect(side.x + side.width, `palette left of the composition at ${width}px`).toBeLessThanOrEqual(main.x + 1);
    expect(await horizontalOverflow(page), `composer at ${width}px`).toBeLessThanOrEqual(0);
  }

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(palette(page)).toBeHidden();
  expect(await horizontalOverflow(page), 'composer at 768px').toBeLessThanOrEqual(0);
  await blocos.click();
  const drawer = page.getByRole('dialog', { name: 'Blocos' });
  await expect(drawer).toBeVisible();
  const d = (await drawer.boundingBox())!;
  expect(Math.round(d.x + d.width)).toBe(768);
  expect(d.height).toBeGreaterThan(900);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page), 'composer at 390px').toBeLessThanOrEqual(0);
  await blocos.click();
  const sheet = page.getByRole('dialog', { name: 'Blocos' });
  await expect(sheet).toBeVisible();
  const s = (await sheet.boundingBox())!;
  expect(Math.round(s.width)).toBe(390);
  expect(Math.round(s.y + s.height)).toBe(844);
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Voltar' }).click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(names(activeList(page))).toHaveText([STANDARD_TEMPLATE_NAME]);
    expect(await horizontalOverflow(page), `Templates list at ${width}px`).toBeLessThanOrEqual(0);
  }
});
