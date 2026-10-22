import { canonicalJson, getDefinition, SEED_VERSION, type BlockRow } from '@app/domain';
import type { BrowserContext, Locator, Page, Route } from '@playwright/test';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 14.11 in the durability matrix (desktop Chrome, Android Chrome emulation, WebKit), against
 * the built bundle. Two devices of one company hold a v6 transformer whose TIPO DE ISOLAÇÃO is Á
 * SECO with TERMÔMETRO answered C. Offline, device A picks ÓLEO (the crossing clears the C in the
 * same batch) and reloads before any sync; device B, offline at the same time, answers another oil
 * item NC. When both sync, both devices show the same items, and their stored checklist cells
 * (with any merge or conflict marks) are equal to each other and to the server's.
 *
 * The relatório is a standard one pushed from an office device, Em campo from the start. Empresa B
 * is this worker's own (E6-Q7).
 */

const row = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const checked = (page: Page, key: string): Locator => row(page, key).locator('[role="radio"][aria-checked="true"]');
const select = (page: Page, key: string): Locator => page.locator(`#ficha-nameplate [data-field-key="${key}"] select`);
/** The transformer's oil items on the current seed, from the kernel (seven on v9, Story 15.3). */
const OIL = getDefinition(SEED_VERSION, 'cabine_primaria', 'transformador_forca').oil_rule!.items;

async function sheetIsDrawn(page: Page): Promise<void> {
  await expect(page.locator('.sheet-header .sheet-title')).toContainText('Transformador de força', { timeout: 30_000 });
  await expect(page.locator('#ficha-step-verificacoes li.checklist-row').first()).toBeVisible();
}

/** What the device shows for the oil items: the checked value of each, '' when none, read in one pass (a row may redraw between two reads). */
function shown(page: Page): Promise<string[]> {
  return page.evaluate(
    (keys) =>
      keys.map(
        (key) => document.querySelector(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"] [role="radio"][aria-checked="true"]`)?.getAttribute('data-value') ?? '',
      ),
    OIL,
  );
}

test('@p0 14.11-E2E-003 two devices, one crossing Á SECO to ÓLEO (with a reload before sync) and one concurrent oil item answer: both converge on the same items and marks, as the server holds them', async ({ page, context, browser, seed, browserName }) => {
  test.setTimeout(300_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);

  const built = newRelatorioDrafts(account);
  const sheet = built.sheets.find((s) => s.blockType === 'transformador_forca')!;
  const scope = { relatorioId: built.relatorioId };
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, scope, `sheet/${sheet.blockId}/nameplate/tipo_de_isolacao`, 'Á SECO'),
    officeDraft(account, scope, `sheet/${sheet.blockId}/checklist/termometro/result`, 'C'),
  ]);
  const url = `/relatorio/${built.relatorioId}/ficha/${sheet.blockId}`;
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(url);
  await sheetIsDrawn(page);
  // Á SECO: the oil items NA but the one answered C.
  await expect.poll(() => shown(page)).toEqual(OIL.map((key) => (key === 'termometro' ? 'c' : 'na')));

  // Device B: the same account on another device, the same sheet.
  const otherContext: BrowserContext = await browser.newContext();
  try {
    const other = await otherContext.newPage();
    await signInForDurability(other, otherContext, account.email);
    await waitForShellCache(other);
    await other.goto(`/relatorio/${built.relatorioId}`);
    await expect(other.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
    await other.goto(url);
    await sheetIsDrawn(other);
    await expect.poll(() => shown(other)).toEqual(OIL.map((key) => (key === 'termometro' ? 'c' : 'na')));

    // Both offline. A: Á SECO to ÓLEO, which clears the C in its own batch. B: another oil item NC.
    await context.setOffline(true);
    await otherContext.setOffline(true);
    await select(page, 'tipo_de_isolacao').selectOption('ÓLEO');
    await expect(page.getByTestId('toast')).toContainText('1 item de óleo apagado');
    await expect.poll(() => shown(page)).toEqual(OIL.map(() => ''));
    await row(other, 'rele_de_gas_funcionamento').getByRole('radio', { name: 'Não conforme', exact: true }).click();
    await expect(checked(other, 'rele_de_gas_funcionamento')).toHaveAttribute('data-value', 'nc');
    const typed = other.getByLabel('Observação do item 8', { exact: true });
    await typed.fill('presença de gás no visor do relé');
    await typed.press('Tab');

    // A reloads before any sync (WebKit: online with every sync refused, as `cta.durability.spec.ts` does).
    const isSync = (target: URL) => target.pathname.startsWith('/api/sync');
    const refuseSync = (route: Route) => route.abort('internetdisconnected');
    if (browserName === 'webkit') {
      await page.route(isSync, refuseSync);
      await context.setOffline(false);
    }
    await page.reload();
    await sheetIsDrawn(page);
    await expect(select(page, 'tipo_de_isolacao')).toHaveValue('ÓLEO');
    await expect.poll(() => shown(page)).toEqual(OIL.map(() => ''));
    const pending = await readStore<{ path: string; value: unknown }>(page, database, 'outbox');
    expect(pending.filter((op) => op.path === `sheet/${sheet.blockId}/checklist/termometro/result`).map((op) => op.value)).toEqual([null]);

    // Both sync, A again after B, and each reopens the sheet.
    if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
    await context.setOffline(false);
    await otherContext.setOffline(false);
    await syncNow(page);
    await syncNow(other);
    await syncNow(page);
    await page.goto(url);
    await sheetIsDrawn(page);
    await other.goto(url);
    await sheetIsDrawn(other);
    const converged = OIL.map((key) => (key === 'rele_de_gas_funcionamento' ? 'nc' : ''));
    await expect.poll(() => shown(page), { timeout: 30_000 }).toEqual(converged);
    await expect.poll(() => shown(other), { timeout: 30_000 }).toEqual(converged);
    await expect(select(other, 'tipo_de_isolacao')).toHaveValue('ÓLEO');

    // The stored cells, marks included, are the same on both devices and on the server.
    const cells = async (target: Page, name: string) =>
      (await readStore<{ entity: string; id: string; row: BlockRow }>(target, name, 'entities')).find((record) => record.entity === 'block' && record.id === sheet.blockId)!.row.sheet.checklist;
    const server = (await serverRow(account.companyId, 'block', sheet.blockId)) as BlockRow;
    await expect.poll(async () => canonicalJson((await cells(page, database)) as never), { timeout: 30_000 }).toBe(canonicalJson(server.sheet.checklist as never));
    await expect.poll(async () => canonicalJson((await cells(other, database)) as never), { timeout: 30_000 }).toBe(canonicalJson(server.sheet.checklist as never));
  } finally {
    await otherContext.close();
  }
});
