import type { Locator, Page } from '@playwright/test';
import { deviceDatabaseName, expect, horizontalOverflow, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { expectCameraOpen, openChaveSheet } from './support/photos.ts';

/*
 * 9.1-E2E "Ler visor" on the sheet, offline: the burst camera of a Measurement table (the
 * Chromium fake camera stands in for the tablet's), one photo per row with its display
 * reading, the opener counting the burst, the hint naming the next row and, past the sheet's
 * last row, "Nada mais a ler nesta ficha". Without signal each photo waits: its cell says so
 * and stays typeable. Every test resets Empresa B and opens a seccionadora of a new relatório.
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

interface PhotoRecord {
  entity: string;
  id: string;
  row: { kind: string; reading_kind: string | null; reading_status: string; reading_target: unknown; local_seq: number; block_id: string | null };
}

async function displayPhotos(page: Page): Promise<PhotoRecord['row'][]> {
  const records = await readStore<PhotoRecord>(page, database, 'entities');
  return records
    .filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.reading_kind === 'display')
    .map((record) => record.row)
    .sort((a, b) => a.local_seq - b.local_seq);
}

const table = (page: Page, key: string): Locator => page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${key}"]`);
const opener = (page: Page, key: string): Locator => table(page, key).locator('.mt-actions').getByRole('button', { name: 'Ler visor' });
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const cellInput = (page: Page, name: string): Locator => page.getByRole('textbox', { name, exact: true });

test('@p0 9.1-E2E-001 offline, "Ler visor" shoots one row per shot with its reading queued, counts the burst, names the next row, and each target cell stays typeable', async ({ page, context }) => {
  test.setTimeout(180_000);
  const ids = await openChaveSheet(page, account, database);
  await context.setOffline(true);

  // The opener sits on each table's title row.
  for (const key of ['contato_aberto', 'contato_fechado', 'resistencia_contato']) await expect(opener(page, key)).toBeVisible();
  await opener(page, 'contato_aberto').click();
  const view = await expectCameraOpen(page);
  const hint = view.locator('.cam-hint');
  await expect(hint).toHaveText('Próxima leitura: Seccionadora contato aberto · T1');
  const rows = ['T3', 'T5', 'Fase A'];
  for (let i = 0; i < 3; i++) {
    await view.getByRole('button', { name: 'Disparar' }).click();
    await expect(hint).toHaveText(`Próxima leitura: ${i < 2 ? 'Seccionadora contato aberto' : 'Seccionadora contato fechado'} · ${rows[i]}`);
    // "Ler visor · N" on the opener while the burst runs (`.read-display-btn[data-count]`).
    await expect(opener(page, 'contato_aberto')).toHaveAttribute('data-count', String(i + 1));
  }
  await expect(view.locator('.cam-count')).toContainText('3 fotos nesta rajada');
  await view.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
  await expect(opener(page, 'contato_aberto')).toHaveAttribute('data-count', '');

  // Three photo rows, each with the display reading of its row, queued.
  await expect.poll(async () => (await displayPhotos(page)).length, { timeout: 15_000 }).toBe(3);
  const photos = await displayPhotos(page);
  photos.forEach((photo, row) => {
    expect(photo).toMatchObject({
      block_id: ids.blockId,
      reading_kind: 'display',
      reading_status: 'queued',
      reading_target: { block_id: ids.blockId, block_type: 'chave_seccionadora', table_key: 'isolacao', start_cell: { row, col: 0 } },
    });
  });

  // Each target cell says its photo waits for signal; the cells stay typeable.
  for (const name of ['T1', 'T3', 'T5']) {
    const cell = table(page, 'contato_aberto').locator('.ficha-cell').filter({ has: cellInput(page, `${name}, Valor`) });
    await expect(cell.locator('.queued-banner')).toHaveText('Foto guardada — leitura quando houver sinal');
  }
  await expect(table(page, 'contato_fechado').locator('.queued-banner')).toHaveCount(0);
  const t1 = cellInput(page, 'T1, Valor');
  await t1.fill('150G');
  await t1.press('Enter');
  await expect
    .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).some((op) => op.path === `sheet/${ids.blockId}/test/isolacao/cell/0/0`))
    .toBe(true);
  await expect(t1).toHaveValue('150');

  // A second burst from the contact resistance runs to the sheet's last row, then nothing is left.
  await opener(page, 'resistencia_contato').click();
  const again = await expectCameraOpen(page);
  await expect(again.locator('.cam-hint')).toHaveText('Próxima leitura: Ensaio de resistência ôhmica de contato · T1-T2');
  for (let i = 0; i < 3; i++) await again.getByRole('button', { name: 'Disparar' }).click();
  await expect(again.locator('.cam-hint')).toHaveText('Nada mais a ler nesta ficha');
  await expect(again.getByRole('button', { name: 'Disparar' })).toBeDisabled();
  await again.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await displayPhotos(page)).length, { timeout: 15_000 }).toBe(6);
  expect((await displayPhotos(page)).slice(3).map((photo) => (photo.reading_target as { table_key: string; start_cell: { row: number } }).start_cell.row)).toEqual([0, 1, 2]);
});

test('@p0 9.1-E2E-002 at 390 px the title row keeps "Ler visor" on its own line and the queued cell fits, no horizontal scroll', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openChaveSheet(page, account, database, { width: 390 });
  await context.setOffline(true);
  const button = opener(page, 'contato_aberto');
  await button.scrollIntoViewIfNeeded();
  const actions = table(page, 'contato_aberto').locator('.mt-actions');
  const row = table(page, 'contato_aberto').locator('.mt-title-row');
  // `.frame-phone .mt-title-row .mt-actions`: the actions take the full width below 768 px.
  expect(Math.abs((await actions.boundingBox())!.width - (await row.boundingBox())!.width)).toBeLessThan(2);
  expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await button.click();
  const view = await expectCameraOpen(page);
  await view.getByRole('button', { name: 'Disparar' }).click();
  await view.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
  const cell = table(page, 'contato_aberto').locator('.ficha-cell').filter({ has: cellInput(page, 'T1, Valor') });
  await expect(cell.locator('.queued-banner')).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
});
