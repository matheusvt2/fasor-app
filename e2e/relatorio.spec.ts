import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, makeOp, STANDARD_TEMPLATE_NAME } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { deviceDatabaseName, expect, signIn, syncBadge, test, TEST_SEED } from './support/merged-fixtures.ts';
import { readDeviceId, readStore } from './support/outbox.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';

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

/** "Sincronizar agora" from the Sync status, until nothing is waiting, then back. */
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

const CLIENT = 'Condomínio Teste';
const SITE = 'Torre Norte';
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

/** Types a date into a React Aria date field: click its day segment, then the eight digits. */
async function typeDate(dialog: Locator, label: string, digits: string): Promise<void> {
  await dialog.getByRole('group', { name: label }).getByRole('spinbutton').first().click();
  await dialog.page().keyboard.type(digits);
}

/** Home › "Novo relatório": creates the client and the obra inline and continues to the Project. */
async function createProjectFromHome(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Novo relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toHaveAttribute('aria-disabled', 'true');
  await dialog.getByRole('combobox', { name: 'Cliente' }).fill(CLIENT);
  await page.getByRole('option', { name: `Criar “${CLIENT}”` }).click();
  await expect(page.getByText('Cliente criado no cadastro de Clientes')).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Cliente' })).toHaveValue(CLIENT);
  await dialog.getByRole('combobox', { name: 'Local (obra)' }).fill(SITE);
  await page.getByRole('option', { name: `Criar “${SITE}”` }).click();
  await expect(dialog.getByRole('combobox', { name: 'Local (obra)' })).toHaveValue(SITE);
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(/\/project\/[0-9a-f-]{36}$/);
  await expect(page.locator('.app-bar h1')).toHaveText('Obra');
}

/** The Project's "Novo relatório" dialog, already open for a project born on Home: dates typed, Criar. */
async function createRelatorio(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Novo relatório' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Cabine primária/ })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByRole('combobox', { name: 'Template' })).toHaveValue(STANDARD_TEMPLATE_NAME);
  const create = dialog.getByRole('button', { name: 'Criar relatório' });
  await expect(create).toHaveAttribute('aria-disabled', 'true');
  await expect(create).toHaveAccessibleDescription('Criar relatório: falta a data de início');
  await typeDate(dialog, 'Início da parada', '06092026');
  // The end follows the start.
  await expect(dialog.getByRole('group', { name: 'Fim da parada' }).getByRole('spinbutton')).toHaveText(['06', '09', '2026']);
  await expect(create).not.toHaveAttribute('aria-disabled', 'true');
  await typeDate(dialog, 'Fim da parada', '08092026');
  await create.click();
  await expect(page).toHaveURL(/\/relatorio\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.locator('.app-bar h1')).toHaveText('Sumário');
  return page.url().split('/').at(-1)!;
}

// --- Story 4.1 -------------------------------------------------------------------------

test('@p0 4.1-E2E-001 Home › Novo relatório creates the client and the obra inline, then the relatório as 223 ops, and the Sumário opens', async ({
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

  const relatorioId = await createRelatorio(page);

  // The Sumário: 13 rows and "0 de 94 fichas concluídas".
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.getByRole('button', { name: '0 de 94 fichas concluídas' })).toBeVisible();
  await expect(page.locator('.sheet-title')).toHaveText(`${CLIENT} · ${SITE}`);
  await expect(page.locator('.sheet-meta')).toContainText('06–08/09/2026');
  await expect(page.locator('.sheet-meta')).toContainText(`template ${STANDARD_TEMPLATE_NAME}`);

  // One batch of 223 ops on this device, one batch_id, in the shapes the story names.
  const outbox = await readStore<{ path: string; batch_id: string; value: { template_version?: number; status?: string } }>(page, database, 'outbox');
  const creation = outbox.filter((op) => !op.path.startsWith('registry/') && !op.path.startsWith('project/'));
  expect(creation).toHaveLength(223);
  expect(new Set(creation.map((op) => op.batch_id)).size).toBe(1);
  expect(creation.filter((op) => op.path.startsWith('equipment/'))).toHaveLength(94);
  expect(creation.filter((op) => op.path.startsWith('block/'))).toHaveLength(105);
  expect(creation.filter((op) => op.path.startsWith('location/'))).toHaveLength(23);
  const relatorio = creation.find((op) => op.path === `relatorio/${relatorioId}`)!;
  expect(relatorio.value).toMatchObject({ template_version: 1, status: 'rascunho' });

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
  await resetEmpresaB();
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);
  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.getByRole('button', { name: '0 de 94 fichas concluídas' })).toBeVisible();
  // Still offline, the Project lists the row from the device (a reload offline is the
  // durability suite's, on the built bundle: the dev server has no shell cache).
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('list', { name: 'Relatórios desta obra' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('list', { name: 'Relatórios desta obra' }).getByRole('link').click();
  await expect(sumarioTitles(page)).toHaveText(TITLES);

  await context.setOffline(false);
  await syncNow(page);

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
  await expect(rows.nth(0).locator('.sum-status')).toContainText('Responsável técnico em branco');
  await expect(rows.nth(10).locator('.sum-status')).toHaveText('0 de 94');
  await expect(rows.nth(3).locator('.sum-status')).toHaveText('texto padrão');
  await expect(page.getByText('Nada impede gerar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pré-visualizar' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: 'Pré-visualizar' })).toHaveAccessibleDescription('Pré-visualizar: disponível na pré-visualização do documento');
  // Every row is 64 px tall.
  for (const i of [0, 2, 5, 12]) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(Math.round(box.height), `row ${i} height`).toBeGreaterThanOrEqual(64);
  }

  // The Capa row opens the setup at Etapa 1.
  await rows.nth(0).getByRole('button', { name: /^Capa e dados do relatório/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=1$`));
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));

  // Rows 1 and 3 open the setup at Etapa 2; row 2 opens the section text; 7, 8, 10, 11 have no control.
  await rows.nth(2).getByRole('button', { name: /^Objetivo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=2$`));
  await expect(page.getByTestId('setup-stub-note')).toHaveText('Etapa 2 — disponível na próxima etapa deste épico');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  await rows.nth(4).getByRole('button', { name: /^Limite de escopo/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/setup\\?etapa=2$`));
  await page.getByRole('link', { name: 'Voltar para o sumário' }).click();
  await rows.nth(3).getByRole('button', { name: /^Definições/ }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}/secao/[0-9a-f-]{36}$`));
  await expect(page.locator('.section-text-title')).toHaveText('2 Definições');
  await expect(page.getByTestId('section-text').locator('p').first()).not.toBeEmpty();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
  for (const i of [8, 9, 11, 12]) await expect(rows.nth(i).locator('button.sum-open')).toHaveCount(0);

  // "Gerar relatório" is this batch's stub.
  await page.getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(page.getByText('Gerar relatório: disponível na próxima etapa')).toBeVisible();

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
  await syncNow(page);

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
  await syncNow(page);
  await page.reload();

  await expect(sumarioTitles(page)).toHaveText(TITLES);
  await expect(page.locator('.sheet-meta .status-pill')).toHaveText('Em campo');
  await expect(chevron).toHaveAttribute('aria-expanded', 'true');
  const tree = page.getByRole('list', { name: 'Locais do relatório' });
  await expect(tree).toBeVisible();
  await expect(tree.getByRole('listitem')).toHaveCount(6);
  const current = tree.locator('.s9-cabine.is-current');
  await expect(current).toHaveCount(1);
  await expect(current.locator('.s9-cab-name')).toContainText('Geradores');
  await expect(current.locator('.sum-here')).toHaveText('você parou aqui');
  await expect(current.locator('.progress-counter')).toHaveText('0 de 19');
  await expect(page.getByText('Organizados por local aqui; no documento, agrupados como no FO.SERV-03.')).toBeVisible();
});
