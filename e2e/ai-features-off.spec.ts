import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet, shoot } from './support/photos.ts';
import { pushSuggestion } from './support/push-server-ops.ts';
import { holdPhotoBytes } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 11.8 follow-up (AI_FEATURES): a server whose AI features are off. `GET /api/account` is
 * the real answer with `features.ai = false` laid over it (the way other specs stub a server
 * fact). Driven as a person would: the sheet shows no "Fotografar placa", keeps "Ler visor" and
 * "Ditar observações", commits a typed plate value; a photo from an NC row asks for no draft,
 * while a draft already on the server still shows (settling it calls no LLM); the Sumário's palette has no "Fotografar
 * equipamento"; and after an offline reload the cached flag keeps every entry hidden.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

interface OutboxRow {
  kind: string;
  path: string;
  value: unknown;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');
const plate = (page: Page) => page.locator('#ficha-nameplate');
const rowOf = (page: Page, key: string): Locator => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);
const readDisplay = (page: Page) => page.locator('#ficha-step-ensaios .ficha-mt[data-table-key="contato_aberto"] .mt-actions').getByRole('button', { name: 'Ler visor' });

/** The real account answer with the server's AI features off. */
async function aiFeaturesOff(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/account',
    async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = (await response.json()) as Record<string, unknown>;
      return route.fulfill({ response, json: { ...body, features: { ai: false } } });
    },
  );
}

/** The sheet with the AI entries hidden and the manual and OCR-only ones present (dictation needs a connection, Story 9.4). */
async function expectAiEntriesHidden(page: Page, online = true): Promise<void> {
  await expect(plate(page).locator('.nameplate-grid')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Fotografar placa' })).toHaveCount(0);
  await expect(plate(page).locator('.camera-capture-tile')).toHaveCount(0);
  await expect(readDisplay(page)).toBeVisible();
  if (online) await expect(page.getByRole('button', { name: 'Ditar observações' })).toBeVisible();
}

test('@p0 11.8-E2E-001 AI features off: no plate, panel or NC-draft entry; "Ler visor", dictation and typing stay; the flag holds after an offline reload', async ({ page }) => {
  test.setTimeout(240_000);
  await aiFeaturesOff(page);
  await holdPhotoBytes(page);
  const ids = await openChaveSheet(page, account, database);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('releng.ai-features'))).toBe('off');

  // The sheet: no "Fotografar placa"; "Ler visor" and "Ditar observações" stay.
  await expectAiEntriesHidden(page);

  // A typed plate value commits as the op it always was.
  const serie = plate(page).locator('[data-field-key="n_serie"] input');
  await serie.fill('AI-OFF-1');
  await serie.press('Enter');
  await expect.poll(async () => (await outbox(page)).some((row) => row.path === `sheet/${ids.blockId}/nameplate/n_serie` && row.value === 'AI-OFF-1')).toBe(true);

  // A photo from an NC row is saved with no reading (no NC draft is asked for).
  const contatos = rowOf(page, 'contatos');
  const nc = contatos.getByRole('radio', { name: 'Não conforme', exact: true });
  await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
  await contatos.getByRole('button', { name: 'Adicionar foto' }).click();
  const camera = await expectCameraOpen(page);
  await shoot(page, 1);
  await camera.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const [photo] = await devicePhotos(page, database);
  const create = (await outbox(page)).find((op) => op.kind === 'create' && op.path === `file/${photo!.id}`)!;
  expect(create.value).toMatchObject({ block_id: ids.blockId, item_key: 'contatos', reading_kind: null, reading_status: 'none' });

  // A draft the server already holds still shows: settling it calls no LLM.
  await pushSuggestion(account.companyId, ids.relatorioId, {
    targetPath: `sheet/${ids.blockId}/checklist/contatos/observation`,
    value: 'Oxidação aparente na estrutura do equipamento.',
    bbox: [0, 0, 1, 1],
    actorId: account.userId,
  });
  await syncNowAndReturn(page);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await expect(contatos.getByRole('group', { name: 'Rascunho da observação do item 8' })).toBeVisible({ timeout: 30_000 });

  // The Sumário's field palette: the eight types, no "Fotografar equipamento".
  await page.goto(`/relatorio/${ids.relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  const expand = page.getByRole('button', { name: 'Expandir Cubículo Enel' });
  if ((await expand.count()) > 0) await expand.click();
  await page.getByRole('button', { name: 'Adicionar bloco em Cubículo Enel' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  await expect(palette.getByText('Ou escolha o tipo · TAG sugerida por tipo + coluna')).toBeVisible();
  await expect(palette.locator('.pf-field')).toHaveCount(8);
  await expect(palette.locator('.pal-camera')).toHaveCount(0);
  await expect(palette.getByRole('button', { name: /Fotografar equipamento/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(palette).toHaveCount(0);

  // Offline reload of the sheet: the cached flag keeps the entries hidden.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.abort('internetdisconnected'),
  );
  await page.goto(`/relatorio/${ids.relatorioId}/ficha/${ids.blockId}`);
  await expectAiEntriesHidden(page, false);
  await expect(plate(page).locator('[data-field-key="n_serie"] input')).toHaveValue('AI-OFF-1');
});
