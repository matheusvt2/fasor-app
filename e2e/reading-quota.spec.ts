import type { Page } from '@playwright/test';
import { deviceDatabaseName, expect, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen, openChaveSheet } from './support/photos.ts';
import { clearDailyUsage, setDailyUsage } from './support/quota.ts';
import { serverRow } from './support/reading-ops.ts';
import { syncNowAndReturn } from './support/sync.ts';

/*
 * Story 20.12 (security pass S6): the company's daily reading ceiling, through the sheet as an
 * engineer meets it. The worker company is put at its ceiling in the compose Postgres; a
 * nameplate photo is taken and uploaded for real: the server keeps the photo, sends no
 * reading, marks it `failed` and says why in the upload's answer, and the sheet shows the
 * kernel's sentence instead of "Não foi possível ler", with "Tentar novamente" and "Preencher
 * manualmente" still offered. "Tentar novamente" is answered 429 `quota_exceeded`, and the line
 * keeps the same sentence.
 */

test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

const SENTENCE = 'Limite diário de leituras atingido. Tente amanhã ou fale com o administrador.';

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

test.afterEach(async () => {
  await clearDailyUsage(account.companyId);
});

const section = (page: Page) => page.locator('#ficha-nameplate');
const plateRow = (page: Page) => section(page).locator('.photo-row.ficha-np-photo');

test('@p0 20.12-E2E-001 at the daily reading ceiling a nameplate photo is kept, its reading refused, and the sheet says so; "Tentar novamente" is refused too', async ({ page }) => {
  test.setTimeout(180_000);
  await openChaveSheet(page, account, database);
  // Far past any configured ceiling (the default is 400 a day).
  await setDailyUsage(account.companyId, 'reading', 1_000_000);

  const before = new Set((await devicePhotos(page, database)).map((photo) => photo.id));
  await section(page).locator('.camera-group').getByRole('button', { name: 'Fotografar placa' }).click();
  const camera = await expectCameraOpen(page);
  await camera.getByRole('button', { name: 'Disparar' }).click();
  await expect(page.getByRole('dialog', { name: 'Câmera' })).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).filter((photo) => !before.has(photo.id)).length, { timeout: 15_000 }).toBe(1);
  const photoId = (await devicePhotos(page, database)).find((photo) => !before.has(photo.id))!.id;

  // The create and the bytes go out; the server keeps the photo and refuses its reading.
  await syncNowAndReturn(page);
  await expect.poll(async () => (await serverRow(account.companyId, 'file', photoId))?.reading_status, { timeout: 30_000 }).toBe('failed');
  expect((await serverRow(account.companyId, 'file', photoId))?.uploaded_at).not.toBeNull();
  const blob = (await readStore<{ id: string; variant: string; acked: boolean; reading_refused?: string }>(page, database, 'files')).find(
    (row) => row.id === photoId && row.variant === 'original',
  );
  expect(blob).toMatchObject({ acked: true, reading_refused: 'quota_exceeded' });

  await syncNowAndReturn(page);
  await expect(plateRow(page).locator('.reading-line')).toHaveText(SENTENCE, { timeout: 30_000 });
  // The photo stays on the device, and both ways on are offered.
  expect((await devicePhotos(page, database)).map((photo) => photo.id)).toContain(photoId);
  const retry = plateRow(page).getByRole('button', { name: 'Tentar novamente' });
  await expect(retry).toBeVisible();
  await expect(plateRow(page).getByRole('button', { name: 'Preencher manualmente' })).toBeVisible();

  // "Tentar novamente" is answered 429 quota_exceeded, and the line keeps the sentence.
  const answers: number[] = [];
  page.on('response', (response) => {
    if (response.url().endsWith(`/api/photos/${photoId}/reread`)) answers.push(response.status());
  });
  await retry.click();
  await expect.poll(() => answers).toEqual([429]);
  await expect(plateRow(page).locator('.reading-line')).toHaveText(SENTENCE);
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true');
  expect((await serverRow(account.companyId, 'file', photoId))?.reading_status).toBe('failed');
});
