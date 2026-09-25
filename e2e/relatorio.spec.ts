import {
  artOrTrtLabel,
  artTrtEchoText,
  backwardMoveConsequenceText,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  issuedBannerText,
  makeOp,
  registrationNumberLabel,
  STANDARD_TEMPLATE_NAME,
} from '@app/domain';
import type { Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, test, TEST_SEED } from './support/merged-fixtures.ts';
import { syncNowAndReturn } from './support/sync.ts';
import { readDeviceId, readStore } from './support/outbox.ts';
import { pushRevision } from './support/push-server-ops.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';
import { CLIENT, createProjectFromHome, createRelatorio, SITE, typeDate } from './support/relatorio-flow.ts';

/*
 * 4.1-E2E and 4.3-E2E. A relatório is born from Home ("Novo relatório" › client and obra
 * created inline › the Project › its "Novo relatório" dialog) as one batch of 223 ops, and
 * the Sumário is its own table of contents. Driven as a person would: by pointer and by
 * keyboard, online and offline.
 *
 * Every test starts by resetting Empresa B and seeding the standard template into it
 * (the test-company reset, only ever Empresa B), so the file is re-runnable on its own.
 * Safe mid-run only because the suite runs with `workers: 1`.
 */

const account = TEST_SEED.companies[1];
const database = deviceDatabaseName(account.userId);

const resetEmpresaB = () => resetCompany({ standard: true });

/** A client-authored op, pushed straight to the server the way `4.3-E2E-002` does. */
async function pushOp(page: Page, relatorioId: string, deviceId: string, path: string, value: unknown): Promise<void> {
  const op = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path,
      value: value as never,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: `${deviceId}-office`,
    },
    { newId, now: new Date() },
  );
  const pushed = await page.request.post('/api/sync/ops', {
    headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    data: { ops: [op] },
  });
  expect(pushed.ok(), await pushed.text()).toBe(true);
}

/** Cadastros › Instrumentos: a new instrument named by its own Código. The main nav (and
 * so "Cadastros") shows only on the shell's own top-level screens: a relatório detail
 * page's App bar carries only "Voltar", so this goes to Home first. */
async function newInstrument(page: Page, code: string, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await expect(panel).toBeVisible();
  await panel.getByLabel('Código').fill(code);
  await panel.getByLabel('Nome').fill(name);
  await panel.getByRole('button', { name: 'Fechar edição' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: new RegExp(code) })).toBeVisible();
}

const TITLES = [
  'Capa e dados do relatório',
  'Controle do documento',
  'Objetivo',
  'Definições',
  'Limite de escopo',
  'Requisitos básicos',
  'Recomendações gerais (NR-10)',
  'Verificações e ensaios aplicáveis',
  'Registro fotográfico',
  'Pontos de atenção',
  'Relatórios dos ensaios',
  'Conclusão e parecer',
  'Certificados',
];

const sumario = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' });
const sumarioTitles = (page: Page) => sumario(page).locator('.sum-title');
const posBox = (page: Page, title: string) => page.getByRole('textbox', { name: `Número de ${title} — digite outro para mover` });
const announcer = (page: Page) => page.getByTestId('sumario-announcer');

// --- Story 4.1 -------------------------------------------------------------------------

test('@p0 4.1-E2E-001 Home › Novo relatório creates the client and the obra inline, then the relatório as 223 ops; setup opens at Etapa 1 with the account as responsável, then the Sumário', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  // The standard template reaches the device with the first company pull.
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  await createProjectFromHome(page);
  await expect(page.getByText('Nenhum relatório nesta obra.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo relatório a partir de template' }).first()).toBeVisible();
  await expect(page.locator('.crumbs')).toContainText(`${CLIENT}`);
  await expect(page.locator('.crumbs')).toContainText(SITE);

  // Criar opens Relatório setup at Etapa 1, its band heading focused (Q1, asserted by the
  // helper). Etapa 3 already names the signed-in account as responsável (Q2): the creation
  // batch wrote it, nothing is filled for show.
  const relatorioId = await createRelatorio(page, {
    whileOnSetup: async () => {
      const band = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Etapa 3 — Responsável' }) });
      await expect(band.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue(account.name);
      await expect(band.getByText(registrationNumberLabel('crt'))).toBeVisible();
    },
  });

  // The Sumário: 13 rows and "0 de 94 fichas concluídas"; no responsável missing on the cover row.
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(sumario(page).getByRole('listitem').nth(0).locator('.sum-status')).not.toContainText('Responsável técnico em branco');
  await expect(page.getByRole('button', { name: '0 de 94 fichas concluídas' })).toBeVisible();
  await expect(page.locator('.sheet-title')).toHaveText(`${CLIENT} · ${SITE}`);
  await expect(page.locator('.sheet-meta')).toContainText('06–08/09/2026');
  await expect(page.locator('.sheet-meta')).toContainText(`template ${STANDARD_TEMPLATE_NAME}`);

  // One batch of 223 ops on this device, one batch_id, in the shapes the story names.
  const outbox = await readStore<{ path: string; batch_id: string; value: { template_version?: number; status?: string; setup?: { responsible_user_id?: string | null } } }>(page, database, 'outbox');
  const creation = outbox.filter((op) => !op.path.startsWith('registry/') && !op.path.startsWith('project/'));
  expect(creation).toHaveLength(223);
  expect(new Set(creation.map((op) => op.batch_id)).size).toBe(1);
  expect(creation.filter((op) => op.path.startsWith('equipment/'))).toHaveLength(94);
  expect(creation.filter((op) => op.path.startsWith('block/'))).toHaveLength(105);
  expect(creation.filter((op) => op.path.startsWith('location/'))).toHaveLength(23);
  const relatorio = creation.find((op) => op.path === `relatorio/${relatorioId}`)!;
  expect(relatorio.value).toMatchObject({ template_version: 1, status: 'rascunho', setup: { responsible_user_id: account.userId } });

  // Back on the Project, the row reads the kernel's lines.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  const row = page.getByRole('list', { name: 'Relatórios desta obra' }).getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.status-pill')).toHaveText('Rascunho');
  await expect(row.locator('.lr-dates')).toHaveText('06–08/09/2026');
  await expect(row.locator('.lr-template')).toHaveText(STANDARD_TEMPLATE_NAME);
  await expect(row.locator('.progress-counter')).toHaveText('0 de 94 fichas');
  await expect(page.getByRole('heading', { level: 2, name: 'Relatórios desta obra (1)' })).toBeVisible();
  await expect(page.locator('.project-meta')).toContainText(/Relatórios\s*1/);

  // The template is now referenced on this device, before any sync: no "Remover" on it.
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByRole('link', { name: /Templates/ }).click();
  const templateRow = page.getByRole('list', { name: 'Templates ativos' }).getByRole('listitem');
  await expect(templateRow.locator('.rr-secondary')).toContainText('usado em 1 relatório');
  await expect(templateRow.getByRole('button', { name: `Mais opções de ${STANDARD_TEMPLATE_NAME}` })).toHaveCount(0);
});

test('@p0 4.1-E2E-002 the same creation offline; once online and synced, the client is in Cadastros and another device opens the Sumário', async ({
  page,
  context,
  browser,
}) => {
  // Two whole-relatório syncs (223 ops up, then a second device's pull), each waited on by
  // state: seconds when idle, several times that under load, so the budget fits the work
  // (E5-A1), as the export specs do.
  test.setTimeout(120_000);
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.getByRole('button', { name: '0 de 94 fichas concluídas' })).toBeVisible();
  // Still offline, the Project lists the row from the device (a reload offline is the
  // durability suite's: this project blocks the service worker, so it has no shell cache).
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('list', { name: 'Relatórios desta obra' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('list', { name: 'Relatórios desta obra' }).getByRole('link').click();
  await expect(sumarioTitles(page)).toHaveText(TITLES);

  await context.setOffline(false);
  await syncNowAndReturn(page);

  // The client is in Cadastros › Clientes.
  await page.goto('/cadastros');
  await page.getByRole('tab', { name: 'Clientes' }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${CLIENT}`) })).toBeVisible();

  // Another device of the company: its Home card opens the Sumário with 94 sheets counted (AR-23).
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await signIn(second, account.email);
    const card = second.locator(`.relatorio-card[data-relatorio="${relatorioId}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: new RegExp(CLIENT) }).click();
    await expect(second).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
    await expect(sumarioTitles(second)).toHaveText(TITLES, { timeout: 30_000 });
    await expect(second.getByRole('button', { name: '0 de 94 fichas concluídas' })).toBeVisible({ timeout: 30_000 });
    await expect(second.locator('.sum-status', { hasText: '0 de 94' })).toBeVisible();
  } finally {
    await other.close();
  }
});

test('@p0 4.1-E2E-003 a second relatório of the same obra reuses its equipment (SEC-C05, never SEC-C05-2), and every Home card names the obra as the Sumário header does', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const first = await createRelatorio(page);

  // The same obra, a second relatório; its setup "Local" is the section 1 phrase, not a title.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  await page.getByRole('button', { name: 'Novo relatório a partir de template' }).first().click();
  const second = await createRelatorio(page, {
    whileOnSetup: async () => {
      await page.getByLabel('Local', { exact: true }).fill('da Torre Norte, bloco B');
    },
  });
  expect(second).not.toBe(first);
  await expect(page.locator('.sheet-title')).toHaveText(`${CLIENT} · ${SITE}`);

  // Q4: the second creation batch minted no equipment; its 94 sheets hold the first one's.
  const outbox = await readStore<{ path: string; batch_id: string; relatorio_id: string | null }>(page, database, 'outbox');
  const batchOf = (id: string) => outbox.find((op) => op.path === `relatorio/${id}`)!.batch_id;
  const secondBatch = outbox.filter((op) => op.batch_id === batchOf(second));
  expect(secondBatch.filter((op) => op.path.startsWith('equipment/'))).toHaveLength(0);
  expect(secondBatch.filter((op) => op.path.startsWith('block/'))).toHaveLength(105);
  expect(outbox.filter((op) => op.batch_id === batchOf(first) && op.path.startsWith('equipment/'))).toHaveLength(94);

  // The tree shows the same TAGs the first relatório got.
  await page.getByRole('button', { name: 'Expandir ou recolher a seção 9' }).click();
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  const coluna5 = page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: /^Coluna 5$/ }) });
  await expect(coluna5.locator(':scope > .s9-eqs > li.s9-eq .block-tag')).toHaveText(['SEC-C05', 'DJ-C05']);

  // Q5: Home names both cards "client · obra", exactly as the Sumário header does.
  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('link', { name: 'Início' }).click();
  for (const id of [first, second]) {
    await expect(page.locator(`.relatorio-card[data-relatorio="${id}"] .card-title`)).toHaveText(`${CLIENT} · ${SITE}`);
  }
});

// --- Story 4.3 -------------------------------------------------------------------------

test('@p0 4.3-E2E-001 the Sumário: order, rows that open, the Position box, Overflow moves, Alt+arrows, Duplicar, Adicionar abaixo, Remover with focus, Restaurar, reload', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  // Order, titles, the fixed rows' notes and metas.
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  const rows = sumario(page).getByRole('listitem');
  await expect(rows.nth(0).locator('.sum-ro')).toHaveText('sempre no início');
  await expect(rows.nth(1).locator('.sum-ro')).toHaveText('montado sozinho');
  // Q2: the creation batch named the account as responsável, so the cover row does not ask for one.
  await expect(rows.nth(0).locator('.sum-status')).not.toContainText('Responsável técnico em branco');
  await expect(rows.nth(10).locator('.sum-status')).toHaveText('0 de 94');
  await expect(rows.nth(3).locator('.sum-status')).toHaveText('texto padrão');
  await expect(page.getByText('Nada impede gerar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pré-visualizar' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Pré-visualizar' })).toHaveAccessibleDescription('Pré-visualizar: disponível em uma próxima etapa');
  // Every row is 64 px tall.
  for (const i of [0, 2, 5, 12]) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(Math.round(box.height), `row ${i} height`).toBeGreaterThanOrEqual(64);
  }

  // The Capa row opens the setup at Etapa 1.
  await rows.nth(0).getByRole('button', { name: /^Capa e dados do relatório/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=1$`));
  // The setup scrolls its band to the top and focuses its heading as it opens (the App bar
  // is not sticky): Voltar is pressed once the page has settled, as a person would.
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));

  // Rows 1 and 3 open the setup at Etapa 2; row 2 opens the section text; 7, 8, 10, 11 have no control.
  await rows.nth(2).getByRole('button', { name: /^Objetivo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=2$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 2 — Objetivo e escopo' })).toBeFocused();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await rows.nth(4).getByRole('button', { name: /^Limite de escopo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=2$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 2 — Objetivo e escopo' })).toBeFocused();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await rows.nth(3).getByRole('button', { name: /^Definições/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/secao/[0-9a-f-]{36}$`));
  await expect(page.locator('.section-text-title')).toHaveText('Seção 2 — Definições');
  // Q14: opening a section moves the focus to its heading, never leaving it on <body>.
  await expect(page.getByRole('heading', { level: 2, name: 'Seção 2 — Definições' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Texto da seção' })).not.toBeEmpty();
  await page.getByRole('button', { name: 'Voltar ao sumário' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  for (const i of [8, 9, 11, 12]) await expect(rows.nth(i).locator('button.sum-open')).toHaveCount(0);

  // "Gerar relatório" opens the Export dialog (Story 4.8, `e2e/export.spec.ts`); Esc closes it
  // and the focus returns to the foot's button.
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(page.getByRole('dialog', { name: 'Gerar relatório' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Gerar relatório' })).toBeHidden();
  await expect(page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' })).toBeFocused();

  // Position box "4" on row 2: announced, toasted, renumbered; Desfazer restores.
  await posBox(page, 'Definições').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('4');
  await page.keyboard.press('Enter');
  await expect(sumarioTitles(page).nth(5)).toHaveText('Definições');
  await expect(announcer(page)).toHaveText('Seção 2 movida para a posição 4 de 11');
  await expect(page.getByText('Definições movida — numeração refeita')).toBeVisible();
  await expect(posBox(page, 'Definições')).toHaveValue('4');
  await expect(posBox(page, 'Limite de escopo')).toHaveValue('2');
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(sumarioTitles(page).nth(3)).toHaveText('Definições');
  await expect(posBox(page, 'Definições')).toHaveValue('2');
  // E3-A8: the toast is gone, so the row that came back takes the focus, on its Position box.
  await expect(posBox(page, 'Definições')).toBeFocused();

  // Overflow › Descer and Subir.
  await page.getByRole('button', { name: 'Mais opções de Definições' }).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(sumarioTitles(page).nth(4)).toHaveText('Definições');
  await expect(announcer(page)).toHaveText('Seção 2 movida para a posição 3 de 11');
  await expect(page.getByRole('button', { name: 'Mais opções de Definições' })).toBeFocused();
  await page.getByRole('button', { name: 'Mais opções de Definições' }).click();
  await page.getByRole('menuitem', { name: 'Subir' }).click();
  await expect(sumarioTitles(page).nth(3)).toHaveText('Definições');

  // Alt+ArrowDown with the focus in the row.
  await posBox(page, 'Definições').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(sumarioTitles(page).nth(4)).toHaveText('Definições');
  await expect(announcer(page)).toHaveText('Seção 2 movida para a posição 3 de 11');
  await page.keyboard.press('Alt+ArrowUp');
  await expect(sumarioTitles(page).nth(3)).toHaveText('Definições');

  // Duplicar: a second "Definições" right below, numbering redrawn.
  await page.getByRole('button', { name: 'Mais opções de Definições' }).first().click();
  await page.getByRole('menuitem', { name: 'Duplicar' }).click();
  await expect(page.getByText('Seção duplicada abaixo')).toBeVisible();
  await expect(sumarioTitles(page)).toHaveCount(14);
  await expect(sumarioTitles(page).nth(4)).toHaveText('Definições');
  await expect(posBox(page, 'Limite de escopo')).toHaveValue('4');

  // Adicionar abaixo on row 3 (Limite de escopo): pick "Definições".
  await page.getByRole('button', { name: 'Mais opções de Limite de escopo' }).click();
  await page.getByRole('menuitem', { name: 'Adicionar abaixo' }).click();
  const picker = page.getByRole('dialog', { name: 'Adicionar seção abaixo' });
  await picker.getByRole('option', { name: 'Definições' }).click();
  await expect(page.getByText('Nova seção adicionada abaixo — numeração refeita')).toBeVisible();
  await expect(sumarioTitles(page)).toHaveCount(15);
  await expect(sumarioTitles(page).nth(6)).toHaveText('Definições');

  // A Position box move committed with Enter keeps the focus on the box; the removal that
  // follows at once must still send the focus to its own target (a watch left by the move
  // once stole it, real-browser pass 2026-09-24).
  await posBox(page, 'Objetivo').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(sumarioTitles(page).nth(3)).toHaveText('Objetivo');
  await expect(posBox(page, 'Objetivo')).toBeFocused();

  // Remover row 5 (now "Definições", the added one): the row now at 5 takes the focus.
  await expect(posBox(page, 'Requisitos básicos')).toHaveValue('6');
  await page.getByRole('button', { name: 'Mais opções de Definições' }).nth(2).click();
  await page.getByRole('menuitem', { name: 'Remover' }).click();
  await expect(page.getByText('Seção removida deste relatório — numeração refeita')).toBeVisible();
  await expect(sumarioTitles(page)).toHaveCount(14);
  await expect(posBox(page, 'Requisitos básicos')).toHaveValue('5');
  await expect(page.getByRole('button', { name: 'Mais opções de Requisitos básicos' })).toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.closest('li')?.querySelector('.pos-box')?.getAttribute('value'))).toBe('5');

  // Header Overflow › Restaurar ficha removida: the row comes back and takes the focus.
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
  const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
  await expect(restore.getByText('2 Definições')).toBeVisible();
  await restore.getByRole('button', { name: 'Restaurar 2 Definições' }).click();
  await expect(sumarioTitles(page)).toHaveCount(15);
  await expect(page.getByText('Ficha restaurada — numeração refeita')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mais opções de Definições' }).nth(2)).toBeFocused();
  await expect(posBox(page, 'Requisitos básicos')).toHaveValue('6');

  // A reload keeps the order.
  const before = await sumarioTitles(page).allTextContents();
  await page.reload();
  await expect(sumarioTitles(page)).toHaveText(before);
});

test('@p1 4.3-E2E-002 Em campo opens section 9 expanded at the last sheet cabine; Rascunho opens it collapsed', async ({ page }) => {
  // A relatório creation, two syncs and a reload: 14 s warm, but a cold first run in
  // `test:e2e:full` crossed the default 30 s test budget (Epic 5 QA batch, 1 of 3 runs).
  test.setTimeout(60_000);
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect(sumarioTitles(page)).toHaveText(TITLES);

  // Rascunho: collapsed.
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  await expect(chevron).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.s9-tree')).toBeHidden();
  await syncNowAndReturn(page);

  // A block of the Geradores cabine is the last sheet on this device; the status goes Em
  // campo through the api with the page's own session. The rows are read from `entities`:
  // the outbox may already be drained after "Sincronizar agora".
  const entities = await readStore<{ entity: string; id: string; row: { name?: string; kind?: string; location_id?: string | null } }>(page, database, 'entities');
  const geradores = entities.find((r) => r.entity === 'location' && r.row.kind === 'cabine' && r.row.name === 'Geradores')!;
  const block = entities.find((r) => r.entity === 'block' && r.row.location_id === geradores.id)!;
  await page.evaluate(
    async ([name, key, value]) => {
      const open = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = open.transaction('local_prefs', 'readwrite');
        tx.objectStore('local_prefs').put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      open.close();
    },
    [database, `last_sheet:${relatorioId}`, block.id] as const,
  );
  const deviceId = await readDeviceId(page, database);
  const status = makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: account.companyId,
      project_id: null,
      relatorio_id: relatorioId,
      path: 'relatorio/status',
      value: 'em_campo',
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: account.userId,
      device_id: `${deviceId}-office`,
    },
    { newId, now: new Date() },
  );
  const pushed = await page.request.post('/api/sync/ops', {
    headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) },
    data: { ops: [status] },
  });
  expect(pushed.ok(), await pushed.text()).toBe(true);
  await syncNowAndReturn(page);
  // A short viewport: the Geradores row would sit below the fold unless the Sumário scrolls to it.
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.reload();

  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  const tree = page.getByRole('list', { name: 'Locais do relatório' });
  await expect(tree).toBeVisible();
  // Story 4.4: the six cabine rows; the path to the last sheet is open and its row says so.
  await expect(tree.locator(':scope > li.s9-cabine')).toHaveCount(6);
  const current = tree.locator('.s9-cabine.is-current');
  await expect(current).toHaveCount(1);
  await expect(current.locator('.s9-cab-name')).toContainText('Geradores');
  await expect(current.locator('.sum-here')).toHaveText('você parou aqui');
  await expect(current.locator('.s9-cab-row .progress-counter')).toHaveText('0 de 19');
  const currentRow = tree.locator('li.s9-eq.is-current');
  await expect(currentRow).toHaveAttribute('data-block-id', block.id);
  await expect(currentRow).toHaveAttribute('aria-current', 'true');
  await expect(page.getByText('Organizados por local aqui; no documento, agrupados como no FO.SERV-03.')).toBeVisible();
  // AC 3 "scrolled to the last sheet": the current row's box lies inside the 600 px viewport.
  await expect
    .poll(async () => {
      const box = await currentRow.boundingBox();
      return box !== null && box.y >= 0 && box.y + box.height <= 600;
    })
    .toBe(true);
});

// --- Story 4.2 -------------------------------------------------------------------------

// A one-pixel PNG, the same fixture buffer `e2e/files.spec.ts` already uses for a picked file.
const COVER_PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('@p0 4.2-E2E-001 Relatório setup: the five Etapa bands, autosave, geolocation altitude, and Concluir dados do relatório', async ({
  page,
  context,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  await newInstrument(page, 'M1', 'Multímetro E2E');
  await newInstrument(page, 'M2', 'Megôhmetro E2E');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  const rows = sumario(page).getByRole('listitem');
  // Q2: the responsável came with the creation batch.
  await expect(rows.nth(0).locator('.sum-status')).not.toContainText('Responsável técnico em branco');

  // Geolocation stubbed before the setup page mounts Etapa 5's effect. Chromium's emulated
  // position carries no altitude (Playwright's `setGeolocation` has no such field), so the
  // field is correctly left empty and typeable by hand (a real GPS reading is not exercised
  // here; the field's own always-typeable behavior is what this test proves).
  await context.grantPermissions(['geolocation'], { origin: new URL(page.url()).origin });
  await context.setGeolocation({ latitude: -23.561, longitude: -46.656 });

  await rows
    .nth(0)
    .getByRole('button', { name: /^Capa e dados do relatório/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=1$`));
  await expect(page.getByRole('heading', { level: 2, name: 'Etapa 1 — Capa' })).toBeFocused();

  // Etapa 1 — Capa: client and obra are read-only display; dates, additional info and the
  // cover photo autosave.
  await expect(page.getByText(CLIENT)).toBeVisible();
  await expect(page.getByText(SITE)).toBeVisible();
  const setupRoot = page.locator('.setup-content');
  // Typed at keyboard speed (`typeDate`'s own `page.keyboard.type`, no per-key delay): the
  // regression this batch's review caught corrupted the year or dropped the date entirely
  // when the field's `value` came straight off the live query with no debounce (finding 1).
  // Reading the rendered segments back, not just the input's own echo, proves the fix.
  await typeDate(setupRoot, 'Início da execução', '01102026');
  await expect(setupRoot.getByRole('group', { name: 'Início da execução' }).getByRole('spinbutton')).toHaveText(['01', '10', '2026']);
  await typeDate(setupRoot, 'Fim da execução', '03102026');
  await expect(setupRoot.getByRole('group', { name: 'Fim da execução' }).getByRole('spinbutton')).toHaveText(['03', '10', '2026']);
  await page.getByLabel('Informações adicionais').fill('Acesso pela portaria 2');
  await page.getByTestId('upload-input-cover_photo').setInputFiles({ name: 'capa.png', mimeType: 'image/png', buffer: COVER_PHOTO });
  await expect(page.locator('.tile-name')).toContainText('capa.png');

  // Etapa 2 — Objetivo e escopo: Local autosaves; one exclusion added, one edited. No
  // "Escopo" field (Q3): the cover's `{escopo}` prints Etapa 1's "Informações adicionais".
  await page.getByLabel('Local', { exact: true }).fill('das Torres A e B');
  await expect(page.getByRole('textbox', { name: 'Escopo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Exclusão 1' })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Adicionar exclusão' }).click();
  await page.getByRole('textbox', { name: 'Exclusão 4' }).fill('Exclusão nova E2E');
  await page.getByRole('textbox', { name: 'Exclusão 1' }).fill('Exclusão editada E2E');

  // Etapa 3 — Responsável: the one seeded user (Empresa B, council CRT) is already the
  // responsável (Q2, written at creation) and relabels the field TRT.
  await expect(page.getByRole('combobox', { name: 'Responsável técnico' })).toHaveValue(account.name);
  await expect(page.getByText('CRT', { exact: true })).toBeVisible();
  await expect(page.getByText(registrationNumberLabel('crt'))).toBeVisible();
  await page.getByLabel(artOrTrtLabel('crt'), { exact: true }).fill('2620262602583');
  await expect(page.getByText(artTrtEchoText(artOrTrtLabel('crt'), '2620262602583')!)).toBeVisible();

  // Etapa 4 — Instrumentos: two checked, one unchecked back.
  const m1 = page.getByRole('checkbox', { name: /^M1/ });
  const m2 = page.getByRole('checkbox', { name: /^M2/ });
  await m1.click();
  await expect(m1).toHaveAttribute('aria-checked', 'true');
  await m2.click();
  await expect(m2).toHaveAttribute('aria-checked', 'true');
  await m2.click();
  await expect(m2).toHaveAttribute('aria-checked', 'false');

  // Etapa 5 — Local: the altitude field is always typeable (geolocation here carries no
  // altitude, so the field stays empty rather than a false "0 m" reading); typed by hand and
  // confirmed once.
  const altitudeInput = page.getByLabel('Altitude do site', { exact: true });
  await expect(altitudeInput).toHaveValue('');
  // Q8: with no reading nothing is suggested: no amber state, no "Sugerido" pill.
  const altitudeField = page.locator('.altitude-field');
  await expect(altitudeField).not.toHaveAttribute('data-state', 'suggested');
  await expect(altitudeField.locator('.suggested-pill')).toHaveCount(0);
  await altitudeInput.fill('800');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Altitude do site: < 1000 m — confirmada')).toBeVisible();
  // Q8: "Alterar" reopens the confirmed altitude with its value kept and the focus in it.
  await page.getByRole('button', { name: 'Alterar altitude do site' }).click();
  await expect(altitudeInput).toBeFocused();
  await expect(altitudeInput).toHaveValue('800');
  await altitudeInput.fill('820');
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Altitude do site: < 1000 m — confirmada')).toBeVisible();
  await typeDate(setupRoot, 'Próxima intervenção recomendada', '15092027');
  await expect(setupRoot.getByRole('group', { name: 'Próxima intervenção recomendada' }).getByRole('spinbutton')).toHaveText(['15', '09', '2027']);
  await page.getByLabel('Justificativa').fill('Manutenção anual programada');

  // "Concluir dados do relatório": every gap closed, one Rascunho → Em campo status put.
  const complete = page.getByRole('button', { name: 'Concluir dados do relatório' });
  await expect(complete).not.toHaveAttribute('aria-disabled', 'true');
  await complete.click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');
  await expect(rows.nth(0).locator('.sum-status')).not.toContainText('Responsável técnico em branco');

  // The stored value, not just the segments: all three dates committed with the right
  // year (finding 1's "0202" / dropped-date failure mode would show up here too).
  const entities = await readStore<{
    entity: string;
    id: string;
    row: { setup?: { service_start?: string; service_end?: string; next_intervention_date?: string; site_altitude_m?: number; site_altitude_confirmed?: boolean } };
  }>(
    page,
    database,
    'entities',
  );
  const relatorioRow = entities.find((r) => r.entity === 'relatorio' && r.id === relatorioId)!;
  expect(relatorioRow.row.setup?.service_start).toBe('2026-10-01');
  expect(relatorioRow.row.setup?.service_end).toBe('2026-10-03');
  expect(relatorioRow.row.setup?.next_intervention_date).toBe('2027-09-15');
  expect(relatorioRow.row.setup).toMatchObject({ site_altitude_m: 820, site_altitude_confirmed: true });
});

/** The seed v1 equipment block types (`packages/domain/src/seed/v1.ts`); every one has an `isolacao` test. */
const EQUIPMENT_BLOCK_TYPES = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'];

test('@p1 4.2-E2E-002 an instrument still referenced by a sheet cannot be unchecked', async ({ page }) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await newInstrument(page, 'R1', 'Instrumento referenciado E2E');
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(sumarioTitles(page)).toHaveText(TITLES);

  // The relatório (and its blocks) must exist server-side before a `sheet/test` put on one
  // of them can materialize; the instrument itself never needs to sync (its id is carried
  // by value in the cell, the same way `isInstrumentReferenced` reads it).
  await syncNowAndReturn(page);
  const entities = await readStore<{ entity: string; id: string; row: { code?: string; kind?: string; block_type?: string } }>(
    page,
    database,
    'entities',
  );
  const instrument = entities.find((r) => r.entity === 'registry' && r.row.kind === 'instrument' && r.row.code === 'R1')!;
  // E5-Q1: an equipment block and a real test key; the kernel refuses a seed key outside the
  // block's definition (`isolacao` is a test of every equipment block type in seed v1).
  const block = entities.find((r) => r.entity === 'block' && EQUIPMENT_BLOCK_TYPES.includes(r.row.block_type ?? ''))!;
  const deviceId = await readDeviceId(page, database);
  await pushOp(page, relatorioId, deviceId, `sheet/${block.id}/test/isolacao/instrument`, { instrument_id: instrument.id });
  await syncNowAndReturn(page);
  await page.reload();

  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await sumario(page)
    .getByRole('listitem')
    .nth(0)
    .getByRole('button', { name: /^Capa e dados do relatório/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=1$`));

  const checkbox = page.getByRole('checkbox', { name: /^R1/ });
  await checkbox.click();
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await checkbox.click();
  // Refused, not a throw: the row stays checked, the inline note explains why.
  await expect(checkbox).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Continua na seção 11 porque uma ficha usa este instrumento')).toBeVisible();
});

// --- Story 4.6 -------------------------------------------------------------------------

test('@p0 4.6-E2E-001 Emitido shows the issued banner; moving a numbered row advances the pill to Em revisão with no separate issue action', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  const deviceId = await readDeviceId(page, database);

  // The relatório must exist server-side before the direct `revision` create below can
  // target it; the status put goes through the ordinary client op push (`4.3-E2E-002`'s
  // pattern), the `revision` row through `pushRevision` (its own family is `serverOnly`,
  // refused on `/api/sync/ops` the way `file/server`/`suggestion` are).
  await syncNowAndReturn(page);
  await pushOp(page, relatorioId, deviceId, 'relatorio/status', 'emitido');
  const createdAt = new Date('2026-09-10T12:00:00.000Z');
  await pushRevision(account.companyId, relatorioId, { number: 2, createdBy: account.userId, createdAt });
  await syncNowAndReturn(page);
  await page.reload();

  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Emitido');
  const banner = issuedBannerText('emitido', { number: 2, created_at: createdAt.toISOString() });
  // Through the real Banner component (UX-DR11), not a plain paragraph.
  await expect(page.locator('.banner-slot .banner')).toHaveText(banner!);

  // Moving a numbered row is an `editedSince`-family op (`block/{id}/order_key`); the
  // status advances on its own, in the same batch, with no separate issue action.
  await page.getByRole('button', { name: 'Mais opções de Definições' }).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em revisão');
  // Still Emitido-derived (Em revisão after an issue), so the banner stays.
  await expect(page.locator('.banner-slot .banner')).toBeVisible();

  // Backed all the way to Em campo: the AC scopes the banner to "Emitido or Em revisão
  // after an issue", so it disappears even though the revision row is still on record.
  await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
  await page.getByRole('menuitem', { name: 'Voltar para Em campo' }).click();
  await page.getByRole('dialog', { name: 'Voltar para Em campo' }).getByRole('button', { name: 'Voltar para Em campo' }).click();
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');
  await expect(page.locator('.banner-slot .banner')).toHaveCount(0);
});

test('@p1 4.6-E2E-002 the header Overflow\'s backward-move item: a Confirm dialog states the consequence, the pill updates and focus returns to the trigger', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  const deviceId = await readDeviceId(page, database);
  await syncNowAndReturn(page);
  await pushOp(page, relatorioId, deviceId, 'relatorio/status', 'em_campo');
  await syncNowAndReturn(page);
  await page.reload();
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');

  const trigger = page.getByRole('button', { name: 'Mais opções do relatório' });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Voltar para Rascunho' }).click();
  const dialog = page.getByRole('dialog', { name: 'Voltar para Rascunho' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(backwardMoveConsequenceText('em_campo', 'rascunho'));
  await dialog.getByRole('button', { name: 'Voltar para Rascunho' }).click();
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Rascunho');
  // The server never wrote this: the client op is the only author of a backward move.
  await expect(trigger).toBeFocused();
});

// --- Story 4.7 -------------------------------------------------------------------------

test('@p0 4.7-E2E-001 section text: edited text, a chip inserted by mouse and removed by keyboard Backspace, autosaved and kept on reload', async ({
  page,
}) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  await createRelatorio(page);

  const rows = sumario(page).getByRole('listitem');
  await rows
    .nth(3)
    .getByRole('button', { name: /^Definições/ })
    .click();
  await expect(page.locator('.section-text-title')).toHaveText('Seção 2 — Definições');
  await expect(page.getByRole('heading', { level: 2, name: 'Seção 2 — Definições' })).toBeFocused();
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  const chips = area.locator('.var-chip');
  await expect(area).not.toBeEmpty();

  await area.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Texto do relatório E2E.');
  await page.getByRole('group', { name: 'Inserir dado do relatório' }).getByRole('button', { name: 'obra', exact: true }).click();
  await expect(chips).toHaveCount(1);
  await expect(chips).toHaveText(['{obra}']);
  await expect(area).toBeFocused();
  await page.keyboard.press('Backspace');
  await expect(chips).toHaveCount(0);

  // Tab away: blur flushes the autosave at once.
  await page.keyboard.press('Tab');
  await expect
    .poll(async () => {
      const rowsData = await readStore<{ entity: string; row: { config?: { section_text?: string } | null } }>(page, database, 'entities');
      return rowsData.some((r) => r.entity === 'block' && (r.row.config?.section_text ?? '').includes('Texto do relatório E2E.'));
    })
    .toBe(true);

  await page.reload();
  const areaAfter = page.getByRole('textbox', { name: 'Texto da seção' });
  await expect(areaAfter).toContainText('Texto do relatório E2E.');
  await expect(areaAfter.locator('.var-chip')).toHaveCount(0);
});

test('@p1 4.7-E2E-002 "Restaurar texto do template" then "Desfazer" restores the just-edited text', async ({ page }) => {
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  await createRelatorio(page);

  const rows = sumario(page).getByRole('listitem');
  await rows
    .nth(3)
    .getByRole('button', { name: /^Definições/ })
    .click();
  const area = page.getByRole('textbox', { name: 'Texto da seção' });
  const restore = page.getByRole('button', { name: 'Restaurar texto do template' });
  await expect(restore).toHaveAttribute('aria-disabled', 'true');

  await area.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Texto próprio E2E.');
  const edited = (await area.innerText()).trim();
  await page.keyboard.press('Tab');
  await expect(restore).not.toHaveAttribute('aria-disabled', 'true');

  await restore.click();
  await expect(page.getByText('Texto do template restaurado nesta seção')).toBeVisible();
  await expect(area).not.toContainText('Texto próprio E2E.');
  await expect(restore).toHaveAttribute('aria-disabled', 'true');

  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(area).toContainText('Texto próprio E2E.');
  expect((await area.innerText()).trim()).toBe(edited);
});
