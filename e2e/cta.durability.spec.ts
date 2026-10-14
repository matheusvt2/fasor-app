import { getDefinition, initialOrderKey, newEquipmentBlock, SEED_VERSION, type MeasurementTest } from '@app/domain';
import type { Page, Route } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, test } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { emCampoDraft, newRelatorioDrafts, officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Story 14.5 in the durability matrix (desktop Chrome, Android Chrome emulation, WebKit),
 * against the built bundle: a reading typed into a table cell of a Chave de transferência
 * automática and an E5 option chosen, both offline, survive a reload made before any sync.
 * Both values are on the sheet and in the outbox, and once back online a sync lands them.
 * The two writes are the story's two sheet families: the cell family addressing a measurement
 * test and the new `sheet/{b}/test/{t}/value/{key}`.
 *
 * The relatório is a standard one pushed from an office device, Em campo from the start (the
 * status flow is `cta.spec.ts`'s), with one CTA created on the local Geradores by office ops,
 * as the palette creates it. Empresa B is this worker's own (E6-Q7).
 */

const CTA = 'chave_transferencia_automatica';
const E1 = 'cta_resistencia_contato';
const E5 = 'cta_transferencia';
const DEFINITION = getDefinition(SEED_VERSION, 'cabine_primaria', CTA);
const testOf = (key: string): MeasurementTest => DEFINITION.measurement_tests!.find((test) => test.key === key)!;
const rowOf = (testKey: string, rowKey: string) => testOf(testKey).rows.findIndex((row) => row.key === rowKey);
const colOf = (testKey: string, columnKey: string) => testOf(testKey).columns.findIndex((column) => column.key === columnKey);

interface OutboxRow {
  path: string;
  value: unknown;
}

const cellInput = (page: Page, key: string) => page.locator(`input[data-cell-input="${key}"]`).filter({ visible: true });
const metodo = (page: Page) => page.locator(`.lib-test[data-test-key="${E5}"]`).getByRole('radiogroup', { name: 'Método' });

async function sheetIsDrawn(page: Page): Promise<void> {
  await expect(page.locator('.sheet-header .sheet-title')).toContainText('Chave de transferência automática', { timeout: 30_000 });
  await expect(page.locator(`.lib-test[data-test-key="${E1}"] h2`)).toHaveText('E1 · Resistência de contato');
}

test('@p0 14.5-E2E-003 a CTA reading and an E5 option written offline survive a reload before any sync: both on the sheet and in the outbox, then on the server', async ({ page, context, seed, browserName }) => {
  test.setTimeout(180_000);
  const account = seed.companies[1];
  const database = deviceDatabaseName(account.userId);
  await resetEmpresaB(account, { standard: true });
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);

  // A standard relatório (seed v5), Em campo, plus one CTA on the local Geradores, from the office.
  const built = newRelatorioDrafts(account);
  const scope = { relatorioId: built.relatorioId };
  const geradores = built.drafts.find((draft) => draft.kind === 'create' && draft.path.startsWith('location/') && (draft.value as { name?: string; kind?: string }).name === 'Geradores')!.value as { id: string };
  const { equipment, block } = newEquipmentBlock({
    blockId: newId(),
    equipmentId: newId(),
    relatorioId: built.relatorioId,
    projectId: built.projectId,
    locationId: geradores.id,
    type: CTA,
    tag: 'CTA-GERADORES',
    seedVersion: SEED_VERSION,
    // After the local's own blocks (the standard template places nineteen on Geradores).
    orderKey: initialOrderKey(999),
  });
  await pushDrafts(page, database, [
    ...built.drafts,
    emCampoDraft(account, built.relatorioId),
    officeDraft(account, { projectId: built.projectId }, `equipment/${equipment.id}`, equipment, 'create'),
    officeDraft(account, scope, `block/${block.id}`, block, 'create'),
  ]);
  await page.goto(`/relatorio/${built.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${block.id}`);
  await sheetIsDrawn(page);

  const outbox = () => readStore<OutboxRow>(page, database, 'outbox');
  const written = async (path: string) => (await outbox()).filter((row) => row.path === path).map((row) => row.value);
  const cellKey = `${E1}:${rowOf(E1, 'polo_b')}:${colOf(E1, 'lado_emergencia')}`;
  const cellPath = `sheet/${block.id}/test/${E1}/cell/${rowOf(E1, 'polo_b')}/${colOf(E1, 'lado_emergencia')}`;
  const valuePath = `sheet/${block.id}/test/${E5}/value/metodo`;

  await context.setOffline(true);
  // The reading: typed and left with Tab (the blur commits it; the iOS decimal pad has no Enter).
  const input = cellInput(page, cellKey);
  await input.scrollIntoViewIfNeeded();
  await input.click();
  await expect(input).toBeFocused();
  await page.keyboard.type('39');
  await page.keyboard.press('Tab');
  await expect.poll(() => written(cellPath)).toEqual([{ raw: '39', unit: 'µΩ', state: 'measured' }]);
  // The E5 option: one tap on its row.
  const botao = metodo(page).getByRole('radio', { name: 'Botão de teste do controlador' });
  await botao.scrollIntoViewIfNeeded();
  await botao.click();
  await expect(botao).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => written(valuePath)).toEqual([{ raw: 'botao_teste', unit: null, state: 'measured' }]);

  // Playwright's WebKit cuts the network below the service worker, so an offline reload fails
  // with an internal error there (`durability.spec.ts`, the same limit). On WebKit the reload
  // runs online with every sync request refused, which keeps the two ops in the outbox just as
  // offline does; the Chromium projects reload truly offline.
  const isSync = (url: URL) => url.pathname.startsWith('/api/sync');
  const refuseSync = (route: Route) => route.abort('internetdisconnected');
  if (browserName === 'webkit') {
    await page.route(isSync, refuseSync);
    await context.setOffline(false);
  }
  await page.reload();
  await sheetIsDrawn(page);
  await expect(cellInput(page, cellKey)).toHaveValue('39');
  await expect(metodo(page).getByRole('radio', { name: 'Botão de teste do controlador' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`.lib-test[data-test-key="${E5}"]`).getByTestId('measurement-values-line')).toHaveText('Método: Botão de teste do controlador (sem TD 1C)');
  expect(await written(cellPath)).toEqual([{ raw: '39', unit: 'µΩ', state: 'measured' }]);
  expect(await written(valuePath)).toEqual([{ raw: 'botao_teste', unit: null, state: 'measured' }]);

  // Back online: one sync and nothing is left pending; the sheet still holds both.
  if (browserName === 'webkit') await page.unroute(isSync, refuseSync);
  await context.setOffline(false);
  await syncNow(page);
  await page.goto(`/relatorio/${built.relatorioId}/ficha/${block.id}`);
  await sheetIsDrawn(page);
  await expect(cellInput(page, cellKey)).toHaveValue('39');
  await expect(metodo(page).getByRole('radio', { name: 'Botão de teste do controlador' })).toHaveAttribute('aria-checked', 'true');
});
