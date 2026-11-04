import { CLOCK_SKEW_MS, SYNC_ROUTES, type Op } from '@app/domain';
import type { Page } from '@playwright/test';
import { signInForDurability, withoutServiceWorker } from './support/durability.ts';
import { deviceDatabaseName, expect, syncBadge, test, type SeedAccount } from './support/merged-fixtures.ts';
import { pullAll, readStore } from './support/outbox.ts';
import { createProjectFromHome } from './support/relatorio-flow.ts';
import { emCampoDraft, newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';

/*
 * e20f (2026-11-04, integrated review of 76cbdb79): a tablet whose clock is wrong. Story 20.8
 * refuses an op stamped more than 10 minutes past the server's clock, or before the relatório's
 * creation, so a device 30 minutes fast or 3 days slow lost every op it wrote. The device now
 * learns its offset from the `Date` header of the server's answers and stamps with the corrected
 * clock; "Reenviar" stamps again the ops refused before the offset was known. The page's `Date`
 * is shifted by an init script (the constructor without arguments and `Date.now`), as a wrong
 * system clock would; the server and the test runner keep the real time.
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

const MINUTE = 60_000;
const OFFSET_KEY = 'releng.clock-offset';

interface OutboxRecord {
  op_id: string;
  path: string;
  value: unknown;
  status: string;
  error_code: string | null;
  client_ts: string;
}

/** Shifts the page's clock by `shiftMs`: `new Date()`, `Date()` and `Date.now()`; a date built from a value is untouched. */
async function shiftPageClock(page: Page, shiftMs: number): Promise<void> {
  await page.addInitScript((shift: number) => {
    const RealDate = Date;
    const now = () => RealDate.now() + shift;
    function ShiftedDate(this: unknown, ...args: unknown[]): unknown {
      if (!new.target) return new RealDate(now()).toString();
      return args.length === 0 ? new RealDate(now()) : new (RealDate as unknown as new (...a: unknown[]) => Date)(...args);
    }
    ShiftedDate.prototype = RealDate.prototype;
    Object.assign(ShiftedDate, { now, parse: RealDate.parse, UTC: RealDate.UTC });
    (globalThis as { Date: unknown }).Date = ShiftedDate;
  }, shiftMs);
}

/** The offset this device applies to its clock, as `clock.ts` keeps it; null when none was learned. */
async function storedOffset(page: Page): Promise<number | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), OFFSET_KEY);
  return raw === null ? null : Number(raw);
}

const outbox = (page: Page) => readStore<OutboxRecord>(page, database, 'outbox');

/** Opens Sync status and taps "Sincronizar agora" once the button is free (the waits are on the outbox, not on the page's shifted clock). */
async function tapSyncNow(page: Page): Promise<void> {
  await syncBadge(page).click();
  const button = page.getByRole('button', { name: 'Sincronizar agora' });
  await expect(button).not.toHaveAttribute('aria-disabled', 'true', { timeout: 60_000 });
  await button.click();
}

/** Types an observation on a sheet of the relatório through the ficha, as the engineer does. */
async function typeObservation(page: Page, relatorioId: string, blockId: string, text: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/ficha/${blockId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  const observations = page.getByRole('textbox', { name: 'Observações da ficha' });
  await observations.fill(text);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${blockId}/observations` && row.value === text), { timeout: 15_000 }).toBe(true);
}

/** Every op the device wrote reaches the server: the outbox holds no dead row and the named rows are acked. */
async function expectAllAcked(page: Page, opIds: readonly string[]): Promise<void> {
  await expect
    .poll(async () => (await outbox(page)).filter((row) => opIds.includes(row.op_id)).map((row) => row.status), { timeout: 60_000 })
    .toEqual(opIds.map(() => 'acked'));
  expect((await outbox(page)).filter((row) => row.status === 'dead').map((row) => `${row.path} ${row.error_code}`)).toEqual([]);
}

/** The op ids the device wrote since `before` (its own rows of the outbox). */
async function writtenSince(page: Page, before: ReadonlySet<string>): Promise<OutboxRecord[]> {
  return (await outbox(page)).filter((row) => !before.has(row.op_id));
}

/** Asserts each op's stamp lies within the server's skew of the real clock (the runner's, which the server shares). */
function expectStampedNearNow(rows: readonly { client_ts: string; path: string }[]): void {
  const real = Date.now();
  for (const row of rows) expect(Math.abs(Date.parse(row.client_ts) - real), `${row.path} ${row.client_ts}`).toBeLessThan(CLOCK_SKEW_MS);
}

for (const [title, shift] of [
  ['30 minutes fast', 30 * MINUTE],
  ['3 days behind the relatório\'s creation', -3 * 24 * 60 * MINUTE],
] as const) {
  test(`@p0 e20f-DUR-${shift > 0 ? '001' : '002'} a tablet ${title}: it learns the server's clock, and the obra it creates and the value it types reach the server`, async ({ page, context }) => {
    test.setTimeout(240_000);
    await shiftPageClock(page, shift);
    await resetEmpresaB(account, { standard: true });
    await signInForDurability(page, context, account.email);
    // The first answers of the server teach the offset (one second of resolution, a round trip of error).
    await expect.poll(() => storedOffset(page), { timeout: 30_000 }).not.toBeNull();
    expect(Math.abs((await storedOffset(page))! + shift)).toBeLessThan(5_000);

    // A relatório the office created at the server's now: the lower bound reads its creation.
    const built = newRelatorioDrafts(account);
    await pushDrafts(page, database, [...built.drafts, emCampoDraft(account, built.relatorioId)]);
    const before = new Set((await outbox(page)).map((row) => row.op_id));

    await page.goto('/');
    await createProjectFromHome(page);
    const sheet = built.sheets[0]!;
    const text = shift > 0 ? 'Relógio adiantado' : 'Relógio atrasado';
    await typeObservation(page, built.relatorioId, sheet.blockId, text);

    const written = await writtenSince(page, before);
    expect(written.map((row) => row.path)).toEqual(expect.arrayContaining([expect.stringMatching(/^registry\/client\//), expect.stringMatching(/^project\//), `sheet/${sheet.blockId}/observations`]));
    expectStampedNearNow(written);
    await tapSyncNow(page);
    await expectAllAcked(page, written.map((row) => row.op_id));

    // The server's log holds the work, from the page's own session.
    const relatorioLog = await pullAll(page.request, SYNC_ROUTES.pullRelatorio(built.relatorioId).path);
    const typed = relatorioLog.ops.find((op: Op) => op.path === `sheet/${sheet.blockId}/observations`);
    expect(typed?.value).toBe(text);
    const companyLog = await pullAll(page.request, SYNC_ROUTES.pullCompany.path);
    for (const row of written.filter((entry) => !entry.path.startsWith('sheet/'))) expect(companyLog.ops.some((op: Op) => op.op_id === row.op_id), row.path).toBe(true);
  });
}

test('@p0 e20f-DUR-003 work stamped before the offset was known is refused op_attribution, and "Reenviar" stamps it again so it applies', async ({ page, context }) => {
  test.setTimeout(240_000);
  await withoutServiceWorker(page);
  await shiftPageClock(page, 30 * MINUTE);
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  await expect.poll(() => storedOffset(page), { timeout: 30_000 }).not.toBeNull();

  // The device forgets the offset and is cut from the api: what it writes now carries its fast clock.
  // (No service worker in this scenario: on WebKit its requests skip `page.route`, so the cut api
  // would still answer and teach the offset again.)
  const isApi = (url: URL) => url.pathname.startsWith('/api/');
  await page.route(isApi, (route) => route.abort('internetdisconnected'));
  await page.evaluate((key) => window.localStorage.removeItem(key), OFFSET_KEY);
  await page.reload();
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });
  expect(await storedOffset(page)).toBeNull();
  const before = new Set((await outbox(page)).map((row) => row.op_id));
  await createProjectFromHome(page);
  // The Project opens its "Novo relatório" dialog; the obra is all this device writes here.
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Relatórios por status' })).toBeVisible({ timeout: 30_000 });
  const written = await writtenSince(page, before);
  expect(written.length).toBeGreaterThanOrEqual(2);
  for (const row of written) expect(Date.parse(row.client_ts) - Date.now(), row.path).toBeGreaterThan(CLOCK_SKEW_MS);
  const ids = written.map((row) => row.op_id);

  // Back online: the server refuses every one of them (its clock check is unchanged), and its answer teaches the offset.
  await page.unroute(isApi);
  await tapSyncNow(page);
  await expect
    .poll(async () => (await outbox(page)).filter((row) => ids.includes(row.op_id)).map((row) => `${row.status} ${row.error_code}`), { timeout: 60_000 })
    .toEqual(ids.map(() => 'dead op_attribution'));
  await expect.poll(() => storedOffset(page), { timeout: 30_000 }).not.toBeNull();
  const row = page.getByTestId('sync-rejected-row');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText('Confira a data e a hora deste aparelho');

  // "Reenviar": the rows are stamped again at the corrected now, in their order, and apply.
  await row.getByRole('button', { name: 'Reenviar' }).click();
  await expectAllAcked(page, ids);
  const resent = (await outbox(page)).filter((entry) => ids.includes(entry.op_id));
  expectStampedNearNow(resent);
  const order = (rows: readonly OutboxRecord[]) => [...rows].sort((a, b) => a.client_ts.localeCompare(b.client_ts) || a.op_id.localeCompare(b.op_id)).map((entry) => entry.op_id);
  expect(order(resent)).toEqual(order(written));
  const companyLog = await pullAll(page.request, SYNC_ROUTES.pullCompany.path);
  for (const entry of resent) {
    const logged = companyLog.ops.find((op: Op) => op.op_id === entry.op_id);
    expect(logged?.client_ts, entry.path).toBe(entry.client_ts);
  }
  await expect(row).toHaveCount(0);
});
