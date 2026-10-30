import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, syncBadge, syncWord, test } from './support/merged-fixtures.ts';
import { syncNow, waitForCompanyPull } from './support/sync.ts';
import {
  clientCreateOp,
  projectCreateOp,
  readDeviceId,
  readStore,
  relatorioCreateOp,
  seedOutbox,
} from './support/outbox.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * 1.6-E2E-001. Home over the real pipeline: relatórios are seeded as outbox ops, pushed
 * by "Sincronizar agora", and come back through the streams. Two of them are pulled onto
 * the device by the AD-8 rule (Rascunho, Em campo); the third is Emitido, so it reaches
 * Home only through the company summary and reads "Não está neste aparelho". Since Story
 * 19.2 the list with no tile pressed holds the active statuses only, so the Emitido card
 * is asserted behind its tile.
 *
 * The global setup empties the test companies' ops and entities before the run, but the
 * suite's own specs seed as they go, so the tile counts are asserted as deltas from what
 * this account already had, and the zero rule is asserted as the invariant it is: a tile
 * reads `.is-zero` exactly when it is 0.
 */

const isApiRequest = (url: URL) => url.pathname.startsWith('/api/');

const STATUSES = ['Rascunho', 'Em campo', 'Em revisão', 'Emitido'] as const;

/** The four tile counts, in board order. */
async function tileCounts(page: Page): Promise<number[]> {
  const board = page.getByRole('group', { name: 'Relatórios por status' });
  await expect(board.locator('.status-tile')).toHaveCount(4);
  const texts = await board.locator('.status-tile .tile-count').allTextContents();
  return texts.map((t) => Number(t));
}

function tile(page: Page, status: (typeof STATUSES)[number]): Locator {
  return page.getByRole('group', { name: 'Relatórios por status' }).locator('.status-tile').filter({
    has: page.locator('.status-pill', { hasText: status }),
  });
}

const card = (page: Page, relatorioId: string) => page.locator(`.relatorio-card[data-relatorio="${relatorioId}"]`);

test('@p1 1.6-E2E-001 Home shows the status board, the current relatório first and the three device states', async ({
  page,
  seed,
}) => {
  // Status flow 2026-10-10: this worker's Empresa B, emptied first (as 1.6-E2E-002 does). The
  // relatórios other specs leave behind are Em campo once a sheet of theirs was filled, and one
  // of them would be the current card; with the company reset the test depends on no leftover.
  const account = seed.companies[1];
  await resetEmpresaB(account);
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  // The baseline is what the company already holds, so it is read once the launch pull
  // has landed; read earlier, it misses relatórios still on their way (E5-A1).
  await waitForCompanyPull(page, database);
  const before = await tileCounts(page);

  const user = { ...account, deviceId: await readDeviceId(page, database) };
  const client = clientCreateOp(user);
  const clientId = client.path.split('/').at(-1)!;
  const project = projectCreateOp(user, undefined, clientId);
  const projectId = project.path.split('/').at(-1)!;

  const emCampo = relatorioCreateOp(user, undefined, projectId, {
    status: 'em_campo',
    local: 'Blocos Norte e Sul',
    serviceStart: '2026-09-06',
    serviceEnd: '2026-09-08',
  });
  const rascunho = relatorioCreateOp(user, undefined, projectId, { status: 'rascunho', local: 'Oxigênio' });
  const emitido = relatorioCreateOp(user, undefined, projectId, { status: 'emitido', local: 'Subestação' });
  const emCampoId = emCampo.relatorio_id!;
  const rascunhoId = rascunho.relatorio_id!;
  const emitidoId = emitido.relatorio_id!;

  await seedOutbox(page, database, [client, project, emCampo, rascunho, emitido]);
  await page.reload();
  await syncNow(page);

  // Rascunho and Em campo are pulled onto the device with no cap (AD-8).
  await expect
    .poll(
      async () => {
        const rows = await readStore<{ id: string; complete: boolean }>(page, database, 'sync_state');
        return [emCampoId, rascunhoId].every((id) => rows.find((r) => r.id === id)?.complete === true);
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();

  // The board counts every relatório the device knows of, the Emitido one included.
  await expect.poll(async () => tileCounts(page), { timeout: 20_000 }).toEqual([
    before[0]! + 1,
    before[1]! + 1,
    before[2]!,
    before[3]! + 1,
  ]);
  // A tile reads `.is-zero` exactly when its count is 0, and is never hidden.
  for (const status of STATUSES) {
    const t = tile(page, status);
    const count = Number(await t.locator('.tile-count').textContent());
    await expect(t).toBeVisible();
    await expect(t.locator('.tile-count.is-zero')).toHaveCount(count === 0 ? 1 : 0);
  }

  // The Em campo relatório on this device sorts first, carries .is-current and its two actions.
  const first = page.locator('.relatorio-card').first();
  await expect(first).toHaveAttribute('data-relatorio', emCampoId);
  await expect(first).toHaveClass(/is-current/);
  // Q5: the card names the client and the obra as the Sumário header does, not the setup Local.
  await expect(first.locator('.card-title')).toContainText('Cliente E2E · Projeto E2E');
  await expect(first.locator('.card-meta')).toContainText('06–08/09/2026');
  // Story 12.2: "Continuar" is live (no sheet here, so it names none) and the card counts its sheets.
  await expect(first.getByRole('button', { name: 'Continuar' })).not.toHaveAttribute('aria-disabled', 'true');
  await expect(first.locator('.card-state .progress-counter')).toHaveText('0 de 0 fichas');
  await expect(card(page, rascunhoId).getByRole('button', { name: 'Continuar' })).toHaveCount(0);
  // "Ver sumário" opens the relatório's Sumário (Story 4.3).
  await first.getByRole('button', { name: 'Ver sumário' }).click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${emCampoId}$`));
  await page.goBack();
  await expect(card(page, emCampoId)).toBeVisible();

  // The three device lines; the Emitido card is behind its tile (Story 19.2).
  await expect(first.locator('.card-device')).toContainText('No aparelho · atualizado');
  await expect(card(page, rascunhoId).locator('.card-device')).toContainText('No aparelho · atualizado');
  await expect(card(page, emitidoId)).toHaveCount(0);
  await tile(page, 'Emitido').click();
  await expect(card(page, emitidoId).locator('.card-device')).toContainText('Não está neste aparelho');
  await expect(card(page, emitidoId).locator('.progress-counter')).toHaveCount(0);
  await tile(page, 'Emitido').click();
  await expect(card(page, emitidoId)).toHaveCount(0);

  // The tile filter, and a second tap that clears it.
  const emCampoTile = tile(page, 'Em campo');
  const background = (t: Locator) => t.evaluate((el) => getComputedStyle(el).backgroundColor);
  const restingBackground = await background(emCampoTile);
  await emCampoTile.click();
  await expect(emCampoTile).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 'Emitido')).toHaveAttribute('aria-pressed', 'false');
  // The Story 1.2 hand-off was about seeing the on state, not only about carrying the
  // attribute: the pressed look is authored in `app.css` and nothing else can observe it.
  expect(await background(emCampoTile)).not.toBe(restingBackground);
  expect(await background(tile(page, 'Emitido'))).toBe(restingBackground);
  await expect(card(page, emCampoId)).toBeVisible();
  await expect(card(page, rascunhoId)).toHaveCount(0);
  await emCampoTile.click();
  await expect(emCampoTile).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page, rascunhoId)).toBeVisible();

  // Another tile takes over the filter, and stays pressed for the tap on the Emitido card below.
  await emCampoTile.click();
  await tile(page, 'Emitido').click();
  await expect(emCampoTile).toHaveAttribute('aria-pressed', 'false');
  await expect(card(page, emCampoId)).toHaveCount(0);
  await expect(card(page, emitidoId)).toBeVisible();

  // Tapping the Emitido card starts its pull and opens its Sumário (AD-8 "pulled on open"),
  // which says so while the stream is slow; once it lands the Sumário draws and, back on
  // Home, the card reads "No aparelho". The predicate is held in a const: Playwright
  // matches function URL-patterns by reference, so unrouting with a fresh lambda would
  // leave the delay installed for every assertion below it.
  const slowStream = (url: URL) => url.pathname.startsWith(`/api/sync/relatorios/${emitidoId}`);
  await page.route(slowStream, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    await route.continue();
  });
  await card(page, emitidoId).locator('.card-title').click();
  await expect(page).toHaveURL(new RegExp(`/relatorio/${emitidoId}$`));
  await expect(page.getByText('Baixando o relatório…')).toBeVisible({ timeout: 20_000 });
  await page.unroute(slowStream);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 40_000 });
  await page.goBack();
  // Home opens again on the active list: the Emitido card is behind its tile.
  await tile(page, 'Emitido').click();
  await expect(card(page, emitidoId).locator('.card-device')).toContainText('No aparelho', { timeout: 40_000 });
  await tile(page, 'Emitido').click();

  // The App bar carries the surface title from the real route config (hidden on Home,
  // per `key-home.html`, because the wordmark already names the page) and the badge word.
  await expect(page.locator('.app-bar h1.app-bar-title.visually-hidden')).toHaveText('Início');
  await expect(syncWord(page)).toHaveText('Sincronizado');
  const shortcuts = page.locator('.shortcut-card');
  await expect(shortcuts).toHaveCount(2);
  // Both shortcuts open their surfaces: Templates since Story 3.2, Cadastros since 2.1.
  await expect(shortcuts.first()).toHaveAttribute('href', '/templates');
  await expect(shortcuts.first()).not.toHaveAttribute('aria-disabled');
  await expect(page.locator('.shortcut-card .sync-badge')).toHaveCount(0);
  // Story 19.1 (2026-10-30): the shortcut row sits between the Status board and the "Relatórios" heading.
  const boardBox = (await page.getByRole('group', { name: 'Relatórios por status' }).boundingBox())!;
  const rowBox = (await page.locator('.shortcut-row').boundingBox())!;
  const headBox = (await page.getByRole('heading', { level: 2, name: 'Relatórios', exact: true }).boundingBox())!;
  expect(rowBox.y).toBeGreaterThanOrEqual(boardBox.y + boardBox.height);
  expect(headBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height);
});

test('@p1 19.2-E2E-001 Home opens on the active work, most recent first; Emitido behind its tile; the list cut at a page size kept across a reload', async ({
  page,
  seed,
}) => {
  const account = seed.companies[1];
  await resetEmpresaB(account);
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await waitForCompanyPull(page, database);

  const user = { ...account, deviceId: await readDeviceId(page, database) };
  const client = clientCreateOp(user);
  const clientId = client.path.split('/').at(-1)!;
  const project = projectCreateOp(user, undefined, clientId);
  const projectId = project.path.split('/').at(-1)!;

  // Pushed in this order, so each op's server sequence (the summary's `updated_seq`) grows
  // with it: the last pushed is the most recent. The service dates do not follow the push
  // order: the active ones run against it (Em campo, pushed last, has the oldest date), and
  // the emitted ones climb from January to September and wrap back to January at the tenth,
  // with ties among them. Only the summary's sequence gives the order asserted below.
  const rascunho = relatorioCreateOp(user, undefined, projectId, { status: 'rascunho', local: 'Antigo', serviceStart: '2026-10-20' });
  const emitidos = Array.from({ length: 12 }, (_, i) =>
    relatorioCreateOp(user, undefined, projectId, { status: 'emitido', local: `Emitido ${i + 1}`, serviceStart: `2026-0${(i % 9) + 1}-01` }),
  );
  const emRevisao = relatorioCreateOp(user, undefined, projectId, { status: 'em_revisao', local: 'Revisão', serviceStart: '2026-05-01' });
  const emCampo = relatorioCreateOp(user, undefined, projectId, { status: 'em_campo', local: 'Campo', serviceStart: '2026-01-01' });
  await seedOutbox(page, database, [client, project, rascunho, ...emitidos, emRevisao, emCampo]);
  await page.reload();
  await syncNow(page);
  await page.getByRole('button', { name: 'Voltar' }).click();

  const board = page.getByRole('group', { name: 'Relatórios por status' });
  await expect(board).toBeVisible();
  const listIds = () => page.locator('.relatorio-card').evaluateAll((cards) => cards.map((c) => c.getAttribute('data-relatorio')));
  const note = page.locator('.home-list-note .section-note');
  const chips = page.getByRole('radiogroup', { name: 'Relatórios por página' });

  // The default list: the active relatórios only, most recent first; the board counts every one.
  await expect.poll(async () => tileCounts(page), { timeout: 30_000 }).toEqual([1, 1, 1, 12]);
  await expect.poll(listIds, { timeout: 30_000 }).toEqual([emCampo.relatorio_id, emRevisao.relatorio_id, rascunho.relatorio_id]);
  await expect(note).toHaveCount(0);
  await expect(chips).toHaveCount(0);

  // The Emitido tile: the emitted ones, most recent first, cut at 10 with the note and the chips.
  const emitido = tile(page, 'Emitido');
  await expect(emitido).toHaveAttribute('data-telemetry', 'home.status_chip');
  await emitido.click();
  const newestFirst = emitidos.map((op) => op.relatorio_id).reverse();
  await expect.poll(listIds).toEqual(newestFirst.slice(0, 10));
  await expect(note).toHaveText('Mostrando 10 de 12 relatórios');
  const radios = chips.getByRole('radio');
  await expect(radios).toHaveText(['10', '20', '50', '100']);
  await expect(chips.getByRole('radio', { name: '10', exact: true })).toHaveAttribute('aria-checked', 'true');
  for (const radio of await radios.all()) await expect(radio).toHaveAttribute('data-telemetry', 'home.page_size');

  // 50: every one shows, the note follows, the choice is stored on the device.
  await chips.getByRole('radio', { name: '50', exact: true }).click();
  await expect.poll(listIds).toEqual(newestFirst);
  await expect(note).toHaveText('Mostrando 12 de 12 relatórios');
  await expect
    .poll(async () => (await readStore<{ key: string; value: unknown }>(page, database, 'local_prefs')).find((row) => row.key === 'home_page_size')?.value)
    .toBe(50);

  // A second tap on the tile returns to the active list.
  await emitido.click();
  await expect.poll(listIds).toEqual([emCampo.relatorio_id, emRevisao.relatorio_id, rascunho.relatorio_id]);

  // A reload keeps 50.
  await page.reload();
  await tile(page, 'Emitido').click();
  await expect(chips.getByRole('radio', { name: '50', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(listIds).toEqual(newestFirst);

  // 390 px: the note row wraps, nothing scrolls sideways, and the chips are reached by keyboard.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(note).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await tile(page, 'Emitido').focus();
  let reached = false;
  for (let i = 0; i < 60 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label') === 'Relatórios por página');
  }
  expect(reached).toBe(true);
  await expect(chips.getByRole('radio', { name: '50', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(chips.getByRole('radio', { name: '100', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(chips.getByRole('radio', { name: '50', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('@p1 1.6-E2E-002 a device with nothing on it says so and offers "Novo relatório"', async ({ page, seed }) => {
  // Empresa B is the company the writing specs use (`e2e/relatorio.spec.ts` resets it and
  // leaves relatórios behind), so it is emptied here first: the reset is only ever Empresa B's.
  await resetEmpresaB(seed.companies[1]);
  await signIn(page, seed.companies[1].email);
  await expect(page.getByText('Nenhum relatório ainda.')).toBeVisible();
  await expect(page.locator('.relatorio-card')).toHaveCount(0);
  // "Novo relatório" asks for the client and the obra (Story 4.1).
  await page.getByRole('button', { name: 'Novo relatório' }).click();
  const dialog = page.getByRole('dialog', { name: 'Novo relatório', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Cliente' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('@p1 1.6-E2E-003 a cold open with a session and no connection renders from the device', async ({ page, seed }) => {
  const account = seed.companies[0];
  await signIn(page, account.email);

  // A genuine cold open with `navigator.onLine` false at the first render. The document
  // itself still comes from the server (this project blocks the Story 1.8 service worker), so "no
  // connection" is the API being unreachable plus the browser reporting itself offline.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.route(isApiRequest, (route) => route.abort('internetdisconnected'));
  await page.reload();

  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(syncBadge(page)).toHaveAttribute('data-state', 'offline');
  await expect(syncWord(page)).toHaveText('Sem conexão');
  const toast = page.getByTestId('toast');
  await expect(toast).toHaveText('Sem conexão. Tudo fica salvo neste aparelho.');
  await expect(toast).toHaveAttribute('role', 'status');
  // Offline alone is the toast and the badge, never a banner (EXPERIENCE.md).
  await expect(page.locator('.banner')).toHaveCount(0);

  // It waits out its 6 s and does not come back after navigating away and back.
  await expect(toast).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Conta' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await page.unroute(isApiRequest);
});
