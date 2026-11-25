import {
  CONTRACT_VERSION_HEADER,
  formatShortDateTime,
  LOCATION_REMOVAL_TITLE,
  locationChecklistPath,
  readOnlyReasonText,
  SEED_VERSION,
  siteItems,
  type LocationRow,
  type OpDraft,
} from '@app/domain';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { resetTestCompanyData, seedAccount, seedRoleUser } from '../apps/api/src/db/seed.ts';
import { workerRoleUser } from '../apps/api/src/db/e2e-worker-seed.ts';
import { colleagueContext } from './support/colleague.ts';
import { deviceDatabaseName, expect, horizontalOverflow, SEED_PASSWORD, signIn, syncBadge, syncWord, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pushRevision } from './support/push-server-ops.ts';
import { serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB, withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow, waitForCompanyPull } from './support/sync.ts';

/*
 * 30.4-E2E (Story 30.4, Q-8, Matheus: "tem que ser uma notificacao"). Two tablets of one company (two browser
 * contexts: Ana, this worker's Empresa A user, and her colleague Eduardo): Eduardo answers the Verificações of the
 * local offline while Ana removes the local, in both orders of arrival, then "Sincronizar agora" on each (never the
 * timer). The writer's tablet shows the Toast once, every tablet the Sumário's conflict Banner and the Sync status
 * "Decisões" row, all naming the local, Ana, the time and the count; nothing is deleted; "Restaurar local" and "Deixar
 * removido" settle it on both tablets and the server. Then, in this worker's Empresa B: a Consulta sees the notice
 * with both actions disabled and one line of reason; the local stays in "Restaurar ficha removida" after an issue
 * while the mark stands; the notice is checked at 390, 768 and 1280 px and over a dialog; a tablet on the contract
 * before this one is answered 426 and shows "Atualizar". Every @p0 asserts the committed rows on the tablets and the server.
 */

interface Device {
  page: Page;
  context: BrowserContext;
  account: SeedAccount;
  database: string;
}

type Cabine = Extract<LocationRow, { kind: 'cabine' }>;

const KEYS = siteItems(SEED_VERSION).map((item) => item.key);
const N = 3;
/** The standard template's first local, the one each test answers and removes (`localOf` checks the name). */
const LOCAL = 'Cubículo Enel';

const toast = (page: Page) => page.getByTestId('toast');
const conflictBanner = (page: Page) => page.locator('.banner-slot .banner[data-variant="conflict"]');
const decisionRows = (page: Page) => page.getByTestId('sync-decision-row');
const firstName = (account: SeedAccount) => account.name.split(' ')[0]!;
const entities = <T,>(device: Pick<Device, 'page' | 'database'>) => readStore<{ entity: string; id: string; row: T }>(device.page, device.database, 'entities');

async function deviceLocal(device: Pick<Device, 'page' | 'database'>, locationId: string): Promise<Cabine | undefined> {
  return (await entities<Cabine>(device)).find((record) => record.entity === 'location' && record.id === locationId)?.row;
}

/** The standard relatório's local (the root cabine) among its creation drafts. */
function localOf(drafts: readonly OpDraft[]): string {
  const created = drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { kind?: string }).kind === 'cabine');
  const local = created!.value as { id: string; name: string };
  expect(local.name).toBe(LOCAL);
  return local.id;
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

/** Both tablets signed in on one relatório pushed from the office, each holding it, at 1280 px. */
async function twoDevices(page: Page, browser: Parameters<typeof colleagueContext>[0], seed: WorkerSeed): Promise<{ ana: Device; eduardo: Device; relatorioId: string; localId: string }> {
  await resetEmpresaA(seed);
  const a = seed.companies[0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, a.email);
  const built = newRelatorioDrafts(a);
  const anaDb = deviceDatabaseName(a.userId);
  await pushDrafts(page, anaDb, built.drafts);
  const colleague = await colleagueContext(browser, seed);
  await colleague.page.setViewportSize({ width: 1280, height: 900 });
  const ana: Device = { page, context: page.context(), account: a, database: anaDb };
  const eduardo: Device = { ...colleague, database: deviceDatabaseName(colleague.account.userId) };
  for (const device of [ana, eduardo]) {
    await device.page.goto(`/relatorio/${built.relatorioId}`);
    await expect(device.page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
    await syncNow(device.page);
  }
  return { ana, eduardo, relatorioId: built.relatorioId, localId: localOf(built.drafts) };
}

/**
 * Eduardo answers the first `N` site items of the local "Conforme" on its Verificações surface, each committed; with
 * `offline`, the tablet goes offline once the surface is open (this project has no shell cache to navigate offline).
 */
async function answerSiteItems(device: Device, relatorioId: string, localId: string, { offline = false }: { offline?: boolean } = {}): Promise<void> {
  await device.page.goto(`/relatorio/${relatorioId}/local/${localId}/verificacoes`);
  await expect(device.page.locator('.sheet-header .sheet-title')).toHaveText(`Verificações do local — ${LOCAL}`, { timeout: 30_000 });
  if (offline) await device.context.setOffline(true);
  for (const key of KEYS.slice(0, N)) {
    const radio = device.page.locator(`li.checklist-row[data-item-key="${key}"]`).getByRole('radio', { name: 'Conforme', exact: true });
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
  }
  await expect
    .poll(async () => (await readStore<{ path: string }>(device.page, device.database, 'outbox')).filter((op) => op.path.startsWith(`location/${localId}/checklist/`)).length, { timeout: 15_000 })
    .toBe(N);
}

/** The Sumário with its tree (section 8) open, so a removal can follow with no navigation (offline included). */
async function openTree(device: Device, relatorioId: string): Promise<void> {
  const { page } = device;
  await page.goto(`/relatorio/${relatorioId}`);
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 8' });
  await expect(chevron).toBeVisible({ timeout: 30_000 });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await expect(page.getByRole('button', { name: `Mais opções de ${LOCAL}`, exact: true })).toBeVisible();
}

/** Ana removes the local from the open tree (`openTree`; it holds sheets: the Confirm "Remover local"). */
async function removeLocal(device: Device, localId: string): Promise<void> {
  const { page } = device;
  await page.getByRole('button', { name: `Mais opções de ${LOCAL}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Remover', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: `Remover ${LOCAL}?`, exact: true });
  await confirm.getByRole('button', { name: 'Remover local', exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect
    .poll(async () => (await readStore<{ path: string; kind: string }>(page, device.database, 'outbox')).some((op) => op.path === `location/${localId}/removed_at` && op.kind === 'remove'))
    .toBe(true);
}

/** The local's row on both tablets equals the server's; returns it. */
async function expectConverged(ana: Device, eduardo: Device, localId: string): Promise<Cabine> {
  const server = (await serverRow(ana.account.companyId, 'location', localId)) as unknown as Cabine;
  expect(await deviceLocal(ana, localId)).toEqual(server);
  expect(await deviceLocal(eduardo, localId)).toEqual(server);
  return server;
}

/** "Local removido com respostas — Cubículo: removido por Ana em 07/09 13:50. 3 respostas de você nas Verificações do local não foram mantidas." */
function noticeText(removedAt: string, remover: string, writer: string): string {
  return `${LOCATION_REMOVAL_TITLE} — ${LOCAL}: removido por ${remover} em ${formatShortDateTime(removedAt)}. ${N} respostas de ${writer} nas Verificações do local não foram mantidas.`;
}

async function expectBanner(page: Page, relatorioId: string, text: string): Promise<Locator> {
  await page.goto(`/relatorio/${relatorioId}`);
  const banner = conflictBanner(page);
  await expect(banner).toHaveAttribute('role', 'alert', { timeout: 30_000 });
  await expect(banner.locator('.banner-text')).toHaveText(text);
  await expect(banner.locator('.banner-text strong')).toHaveText(LOCATION_REMOVAL_TITLE);
  await expect(banner.getByRole('button')).toHaveText(['Restaurar local', 'Deixar removido']);
  await expect(syncWord(page)).toHaveText('Conflito');
  return banner;
}

test('@p0 30.4-E2E-001a removal first: Eduardo\'s offline answers meet Ana\'s removal; his tablet shows the Toast once, both the Banner and the Decisões row naming the local, Ana, the time and N; nothing is deleted; "Restaurar local" brings the local and the answers back on both tablets and the server', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { ana, eduardo, relatorioId, localId } = await twoDevices(page, browser, seed);
  try {
    await answerSiteItems(eduardo, relatorioId, localId, { offline: true });
    await openTree(ana, relatorioId);
    await removeLocal(ana, localId);
    await syncNow(ana.page);
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await syncNow(ana.page);

    const marked = await expectConverged(ana, eduardo, localId);
    expect(marked.removed_at).not.toBeNull();
    expect(marked.removal_conflict).toMatchObject({ removed_by: ana.account.userId, edited_by: eduardo.account.userId });
    expect(Object.keys(marked.checklist ?? {})).toHaveLength(N);

    // The Toast, on the writer's tablet only, once, whatever screen is open (here Sync status after the cycle).
    const said = `${LOCAL} foi removido por ${firstName(ana.account)}. Suas ${N} respostas não foram mantidas.`;
    await expect(toast(eduardo.page)).toContainText(said);
    await expect(decisionRows(eduardo.page)).toHaveCount(1);
    await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(noticeText(marked.removed_at!, firstName(ana.account), 'você'));
    await expect(decisionRows(eduardo.page)).toHaveAttribute('data-kind', 'location_removal');
    await expect(decisionRows(ana.page).locator('.banner-text')).toHaveText(noticeText(marked.removed_at!, 'você', firstName(eduardo.account)));
    // Ana removed the local and wrote no answer: she is not told by a Toast (her removal's own undo Toast may stand).
    await expect(toast(ana.page).filter({ hasText: 'não foram mantidas' })).toHaveCount(0);

    // "Ver" opens the Sumário, where the Banner stands.
    await toast(eduardo.page).getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(eduardo.page).toHaveURL(new RegExp(`/relatorio/${relatorioId}$`));
    await expectBanner(eduardo.page, relatorioId, noticeText(marked.removed_at!, firstName(ana.account), 'você'));
    // Once: a reload and another cycle say nothing again.
    await eduardo.page.reload();
    await syncNow(eduardo.page);
    await expect(toast(eduardo.page).filter({ hasText: said })).toHaveCount(0);

    const banner = await expectBanner(ana.page, relatorioId, noticeText(marked.removed_at!, 'você', firstName(eduardo.account)));
    await banner.getByRole('button', { name: 'Restaurar local', exact: true }).click();
    await expect(toast(ana.page)).toContainText(`${LOCAL} restaurado`);
    await expect(conflictBanner(ana.page)).toHaveCount(0);
    await syncNow(ana.page);
    await syncNow(eduardo.page);
    const restored = await expectConverged(ana, eduardo, localId);
    expect(restored.removed_at).toBeNull();
    expect(restored.removal_conflict).toBeUndefined();
    expect(Object.keys(restored.checklist ?? {})).toHaveLength(N);
    for (const device of [ana, eduardo]) {
      await expect(decisionRows(device.page)).toHaveCount(0);
      await expect(syncWord(device.page)).toHaveText('Sincronizado');
    }
  } finally {
    await eduardo.context.close();
  }
});

test('@p0 30.4-E2E-001b work first: Eduardo\'s answers pushed before Ana\'s unseeing removal; both tablets show the Banner and the Decisões row, nothing is deleted; "Deixar removido" ends the notice on both, the local stays removed and in "Restaurar ficha removida"', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(300_000);
  const { ana, eduardo, relatorioId, localId } = await twoDevices(page, browser, seed);
  try {
    // Ana holds the tree open, then goes offline: she never pulls Eduardo's answers before her removal.
    await openTree(ana, relatorioId);
    await ana.context.setOffline(true);
    await answerSiteItems(eduardo, relatorioId, localId);
    await syncNow(eduardo.page);
    await removeLocal(ana, localId);
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await syncNow(eduardo.page);

    const marked = await expectConverged(ana, eduardo, localId);
    expect(marked.removal_conflict).toMatchObject({ removed_by: ana.account.userId, edited_by: eduardo.account.userId });
    expect(Object.keys(marked.checklist ?? {})).toHaveLength(N);
    await expect(decisionRows(ana.page).locator('.banner-text')).toHaveText(noticeText(marked.removed_at!, 'você', firstName(eduardo.account)));
    await expect(decisionRows(eduardo.page).locator('.banner-text')).toHaveText(noticeText(marked.removed_at!, firstName(ana.account), 'você'));
    await expect(toast(eduardo.page)).toContainText(`Suas ${N} respostas não foram mantidas.`);
    await expectBanner(ana.page, relatorioId, noticeText(marked.removed_at!, 'você', firstName(eduardo.account)));

    // "Deixar removido" from Eduardo's Decisões row.
    await syncBadge(eduardo.page).click();
    await decisionRows(eduardo.page).getByRole('button', { name: 'Deixar removido', exact: true }).click();
    await expect(toast(eduardo.page)).toContainText(`${LOCAL} continua removido.`);
    await expect(decisionRows(eduardo.page)).toHaveCount(0);
    await syncNow(eduardo.page);
    await syncNow(ana.page);
    const left = await expectConverged(ana, eduardo, localId);
    expect(left.removed_at).toBe(marked.removed_at);
    expect(left.removal_conflict).toBeUndefined();
    expect(Object.keys(left.checklist ?? {})).toHaveLength(N);
    await expect(decisionRows(ana.page)).toHaveCount(0);
    await ana.page.goto(`/relatorio/${relatorioId}`);
    await expect(ana.page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
    await expect(conflictBanner(ana.page)).toHaveCount(0);
    await ana.page.getByRole('button', { name: 'Mais opções do relatório' }).click();
    await ana.page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
    const restore = ana.page.getByRole('dialog', { name: 'Restaurar ficha removida' });
    await expect(restore.locator(`.restore-list > li[data-location-id="${localId}"]`)).toHaveCount(1);
  } finally {
    await eduardo.context.close();
  }
});

/** This worker's Empresa B with one relatório whose local was removed, then answered by a device that had not seen it (a mark). */
async function markedInEmpresaB(page: Page, seed: WorkerSeed): Promise<{ relatorioId: string; localId: string; b: SeedAccount }> {
  const b = seed.companies[1];
  await resetEmpresaB(b, { standard: true });
  await signIn(page, b.email);
  const built = newRelatorioDrafts(b);
  const localId = localOf(built.drafts);
  const scope = { relatorioId: built.relatorioId };
  // One office batch: the removal, then answers from a device that never saw it (the fold marks the local).
  const removal: OpDraft = { ...officeDraft(b, scope, `location/${localId}/removed_at`, null), kind: 'remove' };
  const writes = KEYS.slice(0, N).map((key) => officeDraft(b, scope, locationChecklistPath(localId, key, 'result'), 'C'));
  await pushDrafts(page, deviceDatabaseName(b.userId), [...built.drafts, removal, ...writes]);
  const server = (await serverRow(b.companyId, 'location', localId)) as unknown as Cabine;
  expect(server.removal_conflict).toMatchObject({ removed_by: b.userId, edited_by: b.userId });
  return { relatorioId: built.relatorioId, localId, b };
}

test('@p0 30.4-E2E-001c a role without relatorio.fill sees the notice with both actions disabled and one line of reason; issued while the mark stands, the local is still offered in "Restaurar ficha removida"; the notice fits 390, 768 and 1280 px and stays over a dialog', async ({
  page,
  browser,
  seed,
}) => {
  test.setTimeout(240_000);
  const { relatorioId, localId } = await markedInEmpresaB(page, seed);
  // Issued after the removal: the restore list's cut (the newest revision) is past the local's removal.
  await pushRevision(seed.companies[1].companyId, relatorioId, { number: 1, createdBy: seed.companies[1].userId, createdAt: new Date(Date.now() + 60_000) });

  // The Admin: the Banner, the restore list past the emission cut, and the screen check.
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
    await page.goto(`/relatorio/${relatorioId}`);
    const banner = conflictBanner(page);
    await expect(banner).toHaveAttribute('role', 'alert', { timeout: 30_000 });
    await expect(banner.locator('.banner-text strong')).toHaveText(LOCATION_REMOVAL_TITLE);
    await expect(banner.getByRole('button', { name: 'Restaurar local', exact: true })).not.toHaveAttribute('aria-disabled', 'true');
    expect(await horizontalOverflow(page)).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`notice-${width}.png`) });
    await page.getByRole('button', { name: 'Mais opções do relatório' }).click();
    await page.getByRole('menuitem', { name: 'Restaurar ficha removida' }).click();
    const restore = page.getByRole('dialog', { name: 'Restaurar ficha removida' });
    await expect(restore.locator(`.restore-list > li[data-location-id="${localId}"]`)).toHaveCount(1);
    // The Banner stays in its slot under the open dialog.
    await expect(banner).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`notice-dialog-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(restore).toBeHidden();
  }

  // A Consulta (no relatorio.fill) on its own tablet: both actions disabled, one line of reason.
  await withSeedDb((db, auth) => seedRoleUser(db, auth, seed.index, 'consulta'));
  const consulta = workerRoleUser(seed.index, 'consulta');
  const context = await browser.newContext();
  try {
    const reader = await context.newPage();
    await reader.setViewportSize({ width: 1280, height: 900 });
    await signIn(reader, consulta.email);
    await waitForCompanyPull(reader, deviceDatabaseName(consulta.userId));
    await reader.goto(`/relatorio/${relatorioId}`);
    const banner = conflictBanner(reader);
    await expect(banner.locator('.banner-text strong')).toHaveText(LOCATION_REMOVAL_TITLE, { timeout: 60_000 });
    for (const name of ['Restaurar local', 'Deixar removido']) {
      await expect(banner.getByRole('button', { name, exact: true })).toHaveAttribute('aria-disabled', 'true');
    }
    await expect(banner.locator('.btn-reason')).toHaveText(readOnlyReasonText('relatorio.fill'));
    // A press of the disabled action (it stays focusable, `aria-disabled`) writes nothing.
    await banner.getByRole('button', { name: 'Restaurar local', exact: true }).focus();
    await reader.keyboard.press('Enter');
    await reader.screenshot({ path: test.info().outputPath('notice-consulta-1280.png') });
    // Nothing was written: the mark stands on the server.
    expect(((await serverRow(seed.companies[1].companyId, 'location', localId)) as unknown as Cabine).removal_conflict).toBeDefined();
  } finally {
    await context.close();
  }
});

test('@p1 30.4-E2E-002 a tablet on the contract before this one (60) is answered 426 and shows "Atualizar"', async ({ page, seed }) => {
  const b = seed.companies[1];
  await resetEmpresaB(b);
  // Every sync request leaves as the previous bundle would: the server's own minimum answers it.
  await page.route('**/api/sync/**', (route) => route.continue({ headers: { ...route.request().headers(), [CONTRACT_VERSION_HEADER]: '60' } }));
  const refused = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/sync/company' && response.status() === 426, { timeout: 60_000 });
  // The sign-in steps of `signIn`, without its wait on Home: the shell is replaced before Home paints.
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(b.email);
  await page.getByLabel('Senha').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await refused;
  await expect(page.getByRole('heading', { level: 1, name: 'Atualização necessária' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Atualizar' })).toBeVisible();
});
