import type { Locator, Page } from '@playwright/test';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, openChaveSheet } from './support/photos.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * 9.3/9.5-E2E (E8-A6, the pipeline e2e): the vision caption and the NC draft through the real
 * reading job. A photo taken through the app (the camera fallback input: no camera on this
 * browser; the device re-encodes the shot, so no committed sha256 matches) is uploaded, read by
 * the compose api's `fake` prose provider through its kind's default fixture ("Vista geral da
 * cabine primária" for a caption, "Oxidação aparente na estrutura do equipamento." for an NC
 * draft), and pulled with "Sincronizar agora". Nothing here seeds a reading op: the job
 * writes them.
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

const CAPTION = 'Vista geral da cabine primária';
const DRAFT = 'Oxidação aparente na estrutura do equipamento.';

interface OutboxRow {
  path: string;
  value: unknown;
  meta: { source_suggestion_id?: string } | null;
}

const outbox = (page: Page) => readStore<OutboxRow>(page, database, 'outbox');

/** One shot through the system picker (no camera), saved on the device before this returns. */
async function shootThroughPicker(page: Page, opener: Locator, before: number): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await opener.click();
  const file = await plainJpeg(page, 'foto.jpg');
  await (await chooser).setFiles(file);
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(before + 1);
}

/** "Sincronizar agora" until `target` shows (the upload, the job and the pull take a few cycles). */
async function syncUntilVisible(page: Page, target: Locator): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt++) {
    await syncNowAndReturn(page);
    if (await target.isVisible({ timeout: 5_000 }).catch(() => false)) return;
  }
  await expect(target).toBeVisible();
}

test('@p1 9.3-E2E-004 a gallery shot is read by the job: its suggested caption arrives and Confirmar writes it', async ({ page }) => {
  test.setTimeout(360_000);
  const { relatorioId } = await openChaveSheet(page, account, database);
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await shootThroughPicker(page, page.getByRole('button', { name: 'Tirar foto', exact: true }), 0);
  const [photo] = await devicePhotos(page, database);
  const item = page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${photo!.id}"]`);
  const block = item.locator('.field.suggestion-field[data-state="suggested"]');
  await syncUntilVisible(page, block);
  await expect(block.locator('.sv')).toHaveText(CAPTION);
  await block.getByRole('button', { name: `Sugerido, ${CAPTION}, confirmar` }).click();
  await expect(item.locator('.photo-meta')).toHaveText(CAPTION);
  await expect
    .poll(async () => (await outbox(page)).find((op) => op.path === `file/${photo!.id}/caption`)?.meta?.source_suggestion_id ?? null, { timeout: 15_000 })
    .toEqual(expect.any(String));
});

test('@p1 9.5-E2E-002 an NC row photo is read by the job: the draft arrives above the Observation and "Usar" writes it', async ({ page }) => {
  test.setTimeout(360_000);
  const ids = await openChaveSheet(page, account, database);
  const row = page.locator('#ficha-step-verificacoes li.checklist-row[data-item-key="contatos"]');
  const nc = row.getByRole('radio', { name: 'Não conforme', exact: true });
  await nc.click();
  await expect(nc).toHaveAttribute('aria-checked', 'true');
  await shootThroughPicker(page, row.getByRole('button', { name: 'Adicionar foto' }), 0);
  const draft = row.getByRole('group', { name: 'Rascunho da observação do item 8' });
  await syncUntilVisible(page, draft);
  await expect(draft.locator('.sv')).toContainText(DRAFT);
  await draft.getByRole('button', { name: 'Usar o rascunho da observação do item 8' }).click();
  await expect(row.getByRole('textbox', { name: 'Observação do item 8' })).toHaveValue(DRAFT);
  await expect
    .poll(async () => (await outbox(page)).find((op) => op.path === `sheet/${ids.blockId}/checklist/contatos/observation`)?.meta?.source_suggestion_id ?? null, { timeout: 15_000 })
    .toEqual(expect.any(String));
});
