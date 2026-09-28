import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { pushNewRelatorio } from './support/relatorio-seed.ts';
import { resetEmpresaB as resetCompany } from './support/reset-empresa-b.ts';

/*
 * 9.2-E2E (E8-A6, the pipeline e2e): "Fotografar equipamento" through the real reading jobs
 * under the compose api's `fake` providers, with no server op seeded. The panel front shot
 * through the app (the camera fallback input; the device re-encodes it, so only the panel
 * kind's default fixture can read it) is uploaded and read as a Chave seccionadora on column
 * 9; the engineer corrects the type ("Outro…", "Transformador de força") and confirms; the
 * push route sends the plate reading the re-target queued, and the transformer plate's
 * nameplate suggestions arrive on the new sheet (the plate kind's default fixture).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const none = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: none, configurable: true });
  });
});

const PANEL = readFileSync(resolve(import.meta.dirname, '../apps/api/src/jobs/reading/fixtures/images/panel-seccionadora.png'));

const coluna = (page: Page, name: string) => page.locator('li.s9-coluna').filter({ has: page.locator(':scope > .s9-col .s9-col-name', { hasText: new RegExp(`^${name}$`) }) });
const tagsIn = (li: Locator) => li.locator(':scope > .s9-eqs > li.s9-eq .block-tag');
const eqRow = (page: Page, tag: string) => page.locator('li.s9-eq').filter({ has: page.locator('.block-tag', { hasText: new RegExp(`^${tag}$`) }) });

test('@p1 9.2-E2E-004 the panel is read by the real job, the corrected type is created with the photo as its plate, and the plate reading arrives on the new sheet', async ({ page }) => {
  test.setTimeout(300_000);
  await resetCompany(account, { standard: true });
  await page.setViewportSize({ width: 768, height: 900 });
  await signIn(page, account.email);
  const { relatorioId } = await pushNewRelatorio(page, account, database);
  await page.goto(`/relatorio/${relatorioId}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title').first()).toHaveText('Capa e dados do relatório', { timeout: 30_000 });
  const chevron = page.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
  if ((await chevron.getAttribute('aria-expanded')) !== 'true') await chevron.click();
  await page.getByRole('button', { name: 'Expandir 1° Subsolo' }).click();
  const before = await tagsIn(coluna(page, 'Coluna 9')).allTextContents();

  await page.getByRole('button', { name: 'Mais opções de Coluna 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Adicionar bloco' }).click();
  const palette = page.getByRole('dialog', { name: 'Adicionar bloco' });
  const chooser = page.waitForEvent('filechooser');
  await palette.getByRole('button', { name: 'Fotografar equipamento' }).click();
  await (await chooser).setFiles({ name: 'painel.png', mimeType: 'image/png', buffer: PANEL });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(1);
  const photoId = (await devicePhotos(page, database))[0]!.id;

  // No "Sincronizar agora": the upload, the panel job and the pulls run on their own.
  const dialog = page.getByRole('dialog', { name: 'Fotografar equipamento' });
  const line = dialog.locator('.suggestion-field .sv-main');
  await expect(line).toHaveText(/^Criar SEC-C09(-\d+)? · Chave seccionadora · Coluna 9\?$/, { timeout: 90_000 });
  await dialog.getByRole('button', { name: 'Outro…' }).click();
  await expect(dialog.locator('.chip-row .chip')).toHaveCount(8);
  await dialog.getByRole('button', { name: 'Transformador de força' }).click();
  await expect(line).toHaveText(/^Criar TR-\d+ · Transformador de força · Coluna 9\?$/);
  const tag = /^Criar (TR-\d+) /.exec((await line.textContent()) ?? '')![1]!;
  await dialog.locator('.suggestion-field').getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toBeHidden();
  await expect(tagsIn(coluna(page, 'Coluna 9'))).toHaveText([...before, tag]);

  const outbox = await readStore<{ path: string; value: unknown }>(page, database, 'outbox');
  expect(outbox.find((op) => op.path.startsWith('suggestion/') && op.path.endsWith('/status'))!.value).toBe('discarded');

  // The new sheet: its plate is the panel photo, read as a transformer plate by the job the re-target queued.
  await eqRow(page, tag).locator('.s9-eq-open').click();
  const identificacao = page.locator('#ficha-nameplate [data-field-key="identificacao"] .field.suggestion-field');
  await expect(identificacao).toBeVisible({ timeout: 90_000 });
  await expect(identificacao.locator('input')).toHaveValue('TR-01');
  const records = await readStore<{ entity: string; id: string; row: { reading_kind?: string; reading_status?: string; status?: string; source?: { photo_id: string } } }>(page, database, 'entities');
  expect(records.find((record) => record.entity === 'file' && record.id === photoId)!.row).toMatchObject({ reading_kind: 'plate', reading_status: 'done' });
  expect(records.filter((record) => record.entity === 'suggestion' && record.row.status === 'pending' && record.row.source?.photo_id === photoId)).toHaveLength(11);
});
