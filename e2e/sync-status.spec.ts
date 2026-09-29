import type { BrowserContext, Locator, Page } from '@playwright/test';
import { getDefinition, SEED_VERSION } from '@app/domain';
import { resetTestCompanyData, seedAccount } from '../apps/api/src/db/seed.ts';
import { colleagueContext } from './support/colleague.ts';
import { deviceDatabaseName, expect, horizontalOverflow, SEED_PASSWORD, signIn, syncBadge, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { clientCreateOp, readDeviceId, readFileBlobs, readStore, seedOutbox, serverOnlyOp } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';
import { pushReadingStatus } from './support/reading-ops.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { newRelatorioDrafts, pushDrafts, pushNewRelatorio } from './support/relatorio-seed.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 10.4 (FR-60, UX-DR13): the full Sync status surface, driven as a person would. The
 * surface is always opened by tapping the App bar badge. Each test asserts what the screen
 * lists and, for every button, the committed IndexedDB state it changed.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

interface OutboxRecord {
  op_id: string;
  path: string;
  status: string;
  error_code: string | null;
}

const surface = (page: Page) => page.locator('main[data-route="/sync"]');
const sheetRows = (page: Page) => page.getByTestId('sync-sheet-row');
const photoRows = (page: Page) => page.getByTestId('sync-photo-row');
const mergeRows = (page: Page) => page.getByTestId('sync-merge-row');

/** Opens Sync status from the App bar badge. */
async function openSyncStatus(page: Page): Promise<void> {
  await syncBadge(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sincronização' })).toBeVisible();
}

async function markFirst(page: Page, name: 'Conforme' | 'Não conforme'): Promise<void> {
  const radio = page.locator('#ficha-step-verificacoes li.checklist-row').first().getByRole('radio', { name, exact: true });
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
}

/** One shot from the Sticky action bar's camera, saved on this device. */
async function takePhoto(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0);
}

test('@p0 10.4-E2E-001 offline edits on two sheets and a photo are listed under "Enviando"; "Sincronizar agora" sends them and the rows go', async ({ page, seed }) => {
  test.setTimeout(180_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, database, built.drafts);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await syncNow(page);

  const first = built.sheets[0]!;
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${first.blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await page.context().setOffline(true);

  // Sheet one: a checklist item and a photo. Then "Próxima ficha" (in the app, offline) and
  // sheet two: an item.
  await markFirst(page, 'Conforme');
  await takePhoto(page);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  await page.locator('#ficha-primary').click();
  await expect(page).not.toHaveURL(new RegExp(`/ficha/${first.blockId}$`));
  const secondId = /\/ficha\/([^/?#]+)$/.exec(page.url())![1]!;
  // The new sheet is on screen (the first one's rows are gone), its first item still unmarked.
  await expect(page.locator('.app-bar-title')).not.toHaveText(first.tag);
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row').first().getByRole('radio', { name: 'Conforme', exact: true })).toHaveAttribute('aria-checked', 'false');
  await markFirst(page, 'Conforme');

  await openSyncStatus(page);
  await expect(surface(page).locator('.sh-counts')).toHaveText('2 fichas e 1 foto aguardando');
  await expect(surface(page).locator('.sync-summary .sync-badge[data-state="pending"]')).toHaveText('2 fichas e 1 foto aguardando envio');
  await expect(page.getByText('Fichas (2)')).toBeVisible();
  await expect(sheetRows(page)).toHaveCount(2);
  for (const blockId of [first.blockId, secondId]) {
    const row = sheetRows(page).and(page.locator(`[data-block-id="${blockId}"]`));
    await expect(row.locator('.sr-secondary')).toHaveText(new RegExp(`^Alterada por ${account.name} · \\d{2}/\\d{2} \\d{2}:\\d{2}$`));
    await expect(row.locator('.sr-state')).toHaveText('Aguardando envio');
  }
  await expect(sheetRows(page).and(page.locator(`[data-block-id="${first.blockId}"]`)).locator('.sr-primary')).toHaveText(new RegExp(`^${first.tag} — `));
  await expect(photoRows(page)).toHaveCount(1);
  await expect(photoRows(page).first()).toHaveAttribute('data-photo-id', photo!.id);
  await expect(photoRows(page).first().locator('.upload-pill')).toHaveText('Aguardando envio');

  // Back online, one "Sincronizar agora": the rows go, and the device holds it all as sent.
  await page.context().setOffline(false);
  await syncNow(page);
  await expect(sheetRows(page)).toHaveCount(0);
  await expect(photoRows(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId('sync-sending')).toHaveCount(0);
  await expect(surface(page).locator('.sh-counts')).toHaveText('Nada pendente neste aparelho.');
  const outbox = await readStore<OutboxRecord>(page, database, 'outbox');
  expect(outbox.filter((row) => row.status !== 'acked')).toEqual([]);
  expect(outbox.some((row) => row.path.startsWith(`sheet/${secondId}/`))).toBe(true);
  expect((await readFileBlobs(page, database)).find((blob) => blob.id === photo!.id && blob.variant === 'original')?.acked).toBe(true);
});

// --- two tablets (Story 10.1 x 10.4) -------------------------------------------------------

interface Device {
  page: Page;
  context: BrowserContext;
  account: SeedAccount;
  database: string;
}

/** Empties this worker's Empresa A and seeds Ana (with the standard template) and Eduardo again. */
function resetEmpresaA(seed: WorkerSeed): Promise<void> {
  return timed('resetEmpresaA', () =>
    withSeedDb(async (db, auth) => {
      const a = seed.companies[0];
      await resetTestCompanyData(db, [a.companyId]);
      await seedAccount(db, auth, a, SEED_PASSWORD, { standardTemplate: true });
      await seedAccount(db, auth, a.colleague!, SEED_PASSWORD);
    }),
  );
}

const ITEM = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora').checklist![9]!.key;
const itemRow = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

test('@p0 10.4-E2E-002 a merge by rule (10.1) is listed under "Mesclado automaticamente", survives navigating Home and back through the badge, and a reload clears it', async ({ page, browser, seed }) => {
  test.setTimeout(300_000);
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, a.email);
  const built = newRelatorioDrafts(a);
  const sheet = built.sheets.find((s) => s.tag === 'SEC-C12')!;
  const anaDb = deviceDatabaseName(a.userId);
  await pushDrafts(page, anaDb, built.drafts);
  const colleague = await colleagueContext(browser, seed);
  await colleague.page.setViewportSize({ width: 1280, height: 900 });
  const ana: Device = { page, context: page.context(), account: a, database: anaDb };
  const eduardo: Device = { ...colleague, database: deviceDatabaseName(colleague.account.userId) };
  try {
    for (const device of [ana, eduardo]) {
      await device.page.goto(`/relatorio/${built.relatorioId}`);
      await expect(device.page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
      await syncNow(device.page);
      await device.page.goto(`/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`);
      await expect(device.page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
      await device.context.setOffline(true);
    }
    // Offline on both: Eduardo marks item 10 NC, Ana, not having seen it, C.
    for (const [device, name] of [
      [eduardo, 'Não conforme'],
      [ana, 'Conforme'],
    ] as const) {
      const radio = itemRow(device.page, ITEM).getByRole('radio', { name, exact: true });
      await radio.click();
      await expect(radio).toHaveAttribute('aria-checked', 'true');
    }
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await ana.context.setOffline(false);
    await syncNow(ana.page);

    // The committed cell on Ana's tablet is NC, merged by rule.
    const records = await readStore<{ entity: string; id: string; row: { sheet: { checklist: Record<string, { result?: { value: unknown; merge?: { rule: string } } }> } } }>(ana.page, ana.database, 'entities');
    const cell = records.find((record) => record.entity === 'block' && record.id === sheet.blockId)!.row.sheet.checklist[ITEM]?.result;
    expect(cell).toMatchObject({ value: 'NC', merge: { rule: 'nc_over_c' } });

    const verbatim = 'SEC-C12: item 10 NC de Eduardo mesclado';
    const row = mergeRows(ana.page).filter({ has: ana.page.locator('.sr-primary', { hasText: verbatim }) });
    const decisions = ana.page.getByTestId('sync-decisions');
    await expect(decisions.getByRole('heading', { level: 2 })).toHaveText('Decisões');
    await expect(decisions.getByText('Mesclado automaticamente')).toBeVisible();
    await expect(row).toHaveCount(1);
    await expect(row.locator('.sr-secondary')).toHaveText(/^\d{2}\/\d{2} \d{2}:\d{2} · NC vence C$/);
    await expect(row.locator('.sr-state')).toHaveText('Mesclado');

    // Home (the App bar's "Voltar", in the app) and back through the badge: still listed.
    await ana.page.getByRole('button', { name: 'Voltar' }).click();
    await expect(ana.page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
    await openSyncStatus(ana.page);
    await expect(row).toHaveCount(1);

    // A reload clears the session's merge rows.
    await ana.page.reload();
    await openSyncStatus(ana.page);
    await expect(ana.page.getByRole('button', { name: 'Sincronizar agora' })).toBeVisible();
    await expect(mergeRows(ana.page)).toHaveCount(0);
    await expect(ana.page.getByTestId('sync-decisions')).toHaveCount(0);
  } finally {
    await eduardo.context.close();
  }
});

test('@p1 10.4-E2E-007 after both tablets pushed, the first lists "Último envio de Eduardo Esteves: dd/mm hh:mm"', async ({ page, browser, seed }) => {
  test.setTimeout(180_000);
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  const anaDb = deviceDatabaseName(a.userId);
  await signIn(page, a.email);
  const colleague = await colleagueContext(browser, seed);
  try {
    const eduardoDb = deviceDatabaseName(colleague.account.userId);
    // Each tablet has one change of its own waiting (a client), sent with "Sincronizar agora".
    for (const [device, account, database] of [
      [colleague.page, colleague.account, eduardoDb],
      [page, a, anaDb],
    ] as const) {
      await seedOutbox(device, database, [clientCreateOp({ ...account, deviceId: await readDeviceId(device, database) })]);
      await device.reload();
      await expect(device.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
      await syncNow(device);
    }
    const rows = page.getByTestId('sync-last-send-row');
    const his = rows.filter({ hasText: 'Eduardo Esteves' });
    await expect(his.locator('.sr-primary')).toHaveText(/^Último envio de Eduardo Esteves: \d{2}\/\d{2} \d{2}:\d{2}$/);
    await expect(his.locator('.sr-secondary')).toHaveText('Outro aparelho');
    await expect(rows.filter({ hasText: a.name }).locator('.sr-secondary')).toHaveText('Este aparelho');
  } finally {
    await colleague.context.close();
  }
});

// --- one tablet -----------------------------------------------------------------------------

test('@p1 10.4-E2E-003 a photo whose reading is queued is listed under "Leituras" as "Leitura na fila"', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await takePhoto(page);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  await syncNow(page);
  await pushReadingStatus(account.companyId, relatorioId, photo!.id, 'queued');
  await syncNow(page);
  const row = page.getByTestId('sync-reading-row').and(page.locator(`[data-photo-id="${photo!.id}"]`));
  await expect(row.locator('.sr-state')).toHaveText('Leitura na fila');
  await expect(row.locator('.sr-primary')).toHaveText(photo!.caption ?? 'Foto sem legenda');
  await expect(page.getByTestId('sync-readings-queued')).toHaveText('1 leitura na fila');
  await expect(surface(page).locator('.sh-counts')).toContainText('1 leitura na fila');
});

test('@p1 10.4-E2E-004 while a relatório stream is still coming down, Sync status and Home count it; once it lands the row goes', async ({ page, seed }) => {
  test.setTimeout(180_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, account.email);
  // The relatório stream answers its first page cut short (the device then asks for more) and
  // holds the next request until released, so the stream stays incomplete meanwhile.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let pages = 0;
  const relatorioStream = (url: URL) => url.pathname.startsWith('/api/sync/relatorios/');
  await page.route(relatorioStream, async (route) => {
    pages += 1;
    if (pages > 1) {
      await held;
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as { ops: unknown[]; seq: number };
    await route.fulfill({ response, json: { ...body, ops: body.ops.slice(0, 120) } });
  });
  const { relatorioId } = await pushNewRelatorio(page, account, database);

  await openSyncStatus(page);
  await page.getByRole('button', { name: 'Sincronizar agora' }).click();
  const row = page.getByTestId('sync-download-row').and(page.locator(`[data-relatorio-id="${relatorioId}"]`));
  await expect(row.locator('.sr-secondary')).toHaveText(/^Baixando… \d+ de \d+ fichas$/, { timeout: 30_000 });
  await expect(row.locator('.sr-state')).toHaveText(/^\d+ %$/);
  const [, held1, total] = /Baixando… (\d+) de (\d+) fichas/.exec((await row.locator('.sr-secondary').textContent())!)!;
  expect(Number(held1)).toBeLessThan(Number(total));

  // Home, in the app: the card says the same count.
  await page.getByRole('button', { name: 'Voltar' }).click();
  const card = page.locator(`.relatorio-card[data-relatorio="${relatorioId}"]`);
  await expect(card.locator('.card-device')).toHaveText(/^Baixando… \d+ de \d+ fichas$/);

  release();
  await expect(card.locator('.card-device')).toContainText('No aparelho', { timeout: 60_000 });
  await openSyncStatus(page);
  await expect(page.getByTestId('sync-download-row')).toHaveCount(0);
});

test('@p1 10.4-E2E-005 a photo refused by the server is listed with "Erro — Tentar novamente"; the tap uploads it and the row goes', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await openChaveSheet(page, account, database);
  const filePut = (url: URL) => url.pathname.startsWith('/api/files/');
  await page.route(filePut, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    await route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ code: 'file_too_large', message: 'too large' }) });
  });
  await takePhoto(page);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  await syncNow(page);

  const row = photoRows(page).and(page.locator(`[data-photo-id="${photo!.id}"]`));
  const retry = row.getByRole('button', { name: 'Erro — Tentar novamente' });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  await expect(surface(page).locator('.sync-summary .sync-badge[data-state="error"]')).toHaveText('1 erro');

  await page.unroute(filePut);
  await retry.click();
  await expect
    .poll(async () => (await readFileBlobs(page, database)).find((blob) => blob.id === photo!.id && blob.variant === 'original')?.acked, { timeout: 30_000 })
    .toBe(true);
  await expect(row).toHaveCount(0);
});

test('@p1 10.4-E2E-006 "Reenviar" writes the rejected rows back to pending in the outbox, and the server refuses them again', async ({ page, seed }) => {
  test.setTimeout(120_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  const rejected = serverOnlyOp({ ...account, deviceId: await readDeviceId(page, database) });
  await seedOutbox(page, database, [rejected]);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible();
  await syncNow(page);
  const statusOf = async () => (await readStore<OutboxRecord>(page, database, 'outbox')).find((row) => row.op_id === rejected.op_id);
  await expect.poll(statusOf, { timeout: 30_000 }).toMatchObject({ status: 'dead', error_code: 'op_server_only' });
  const row = page.getByTestId('sync-rejected-row');
  await expect(row).toContainText('1 alteração rejeitada');
  await expect(surface(page).locator('.sync-summary .sync-badge[data-state="error"]')).toHaveText('1 erro');

  // The push is held while "Reenviar" runs, so the row is read back before the server answers.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const pushRoute = (url: URL) => url.pathname === '/api/sync/ops';
  await page.route(pushRoute, async (route) => {
    await held;
    await route.continue();
  });
  await row.getByRole('button', { name: 'Reenviar' }).click();
  await expect.poll(async () => (await statusOf())?.error_code, { timeout: 15_000 }).toBeNull();
  expect(['pending', 'sent']).toContain((await statusOf())!.status);
  release();
  await expect.poll(statusOf, { timeout: 30_000 }).toMatchObject({ status: 'dead', error_code: 'op_server_only' });
  await page.unroute(pushRoute);
});

test('@p1 10.4-E2E-008 at 390 px no list scrolls sideways, the disclosure opens, and nothing on the surface is a live region', async ({ page, seed }) => {
  test.setTimeout(150_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await openChaveSheet(page, account, database, { width: 390 });
  await page.context().setOffline(true);
  await markFirst(page, 'Não conforme');
  await takePhoto(page);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  await openSyncStatus(page);
  await expect(sheetRows(page)).toHaveCount(1);
  await expect(photoRows(page)).toHaveCount(1);

  const how = surface(page).locator('details.sync-how');
  await expect(how).not.toHaveAttribute('open');
  await how.locator('summary.sh-how').click();
  await expect(how).toHaveAttribute('open');
  await expect(how.locator('.how-body')).toBeVisible();

  const lists = surface(page).locator('.sync-list');
  expect(await lists.count()).toBeGreaterThanOrEqual(2);
  for (const list of await lists.all()) {
    const { scroll, client } = await list.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  }
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await surface(page).locator('[aria-live], [role="status"], [role="alert"]').count()).toBe(0);
  await page.context().setOffline(false);
});
