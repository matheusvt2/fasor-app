import type { Browser, BrowserContext, Page } from '@playwright/test';
import { resetTestCompanyData, seedAccount } from '../apps/api/src/db/seed.ts';
import { exifJpeg, plainJpeg, type FilePayload } from './fixtures/photos/synthetic.ts';
import { signInForDurability, waitForShellCache } from './support/durability.ts';
import { deviceDatabaseName, expect, SEED_PASSWORD, test, timed, type SeedAccount, type WorkerSeed } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { serverRow } from './support/reading-ops.ts';
import { newRelatorioDrafts, pushDrafts } from './support/relatorio-seed.ts';
import { withSeedDb } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * 21.3-E2E durability (Story 21.3): a photo's place in section 7 is one committed
 * `file/{id}/order_key` put, so it survives a reload, reaches a second device of the company
 * through the sync, and a photo added afterwards lands last. Two devices moving the same photo
 * offline converge by the fold (the later applied put wins on both), with no conflict dialog.
 * Ana is this worker's Empresa A user and Eduardo her colleague, each in a browser context of
 * their own (their own IndexedDB); the photos are imports. Playwright's WebKit build cannot
 * store a photo Blob in IndexedDB (`camera-app.durability.spec.ts`), so the WebKit project skips
 * both tests; desktop and Android Chrome run them. "Sincronizar agora" drives every sync (never the 60 s timer).
 */

interface Device {
  page: Page;
  context: BrowserContext;
  account: SeedAccount;
  database: string;
}

interface PhotoRecord {
  id: string;
  kind: string;
  removed_at: string | null;
  captured_at: string;
  local_seq: number;
  order_key?: string | null;
}

const galleryItem = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);
const trigger = (page: Page, id: string) => galleryItem(page, id).getByRole('button', { name: /^Mais opções de Foto \d+$/ });
const moveStatus = (page: Page) => page.getByTestId('gallery-move-status');

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

/** The live photo rows this device holds. */
async function photoRows(device: Device): Promise<PhotoRecord[]> {
  const records = await readStore<{ entity: string; row: PhotoRecord }>(device.page, device.database, 'entities');
  return records.filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.removed_at === null).map((record) => record.row);
}

/** The gallery tiles' photo ids in DOM order. */
async function tileIds(page: Page): Promise<string[]> {
  return page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item').evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.photoId ?? ''));
}

async function openGallery(page: Page, relatorioId: string): Promise<void> {
  await page.goto(`/relatorio/${relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

/**
 * "Adicionar fotos" with one file, kept "Geral" ("Cancelar" on "De qual equipamento?"); returns
 * the new photo's id. Where the camera reads as denied, the button opens the Photo capture
 * sheet first and its "Escolher arquivos" opens the picker.
 */
async function importGeral(device: Device, file: FilePayload): Promise<string> {
  const { page } = device;
  const before = new Set((await photoRows(device)).map((row) => row.id));
  const direct = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  let chooser = await direct;
  if (chooser === null) {
    const sheet = page.getByRole('dialog', { name: 'Adicionar fotos' });
    await expect(sheet).toBeVisible();
    const picked = page.waitForEvent('filechooser');
    await sheet.getByRole('button', { name: 'Escolher arquivos' }).click();
    chooser = await picked;
  }
  await chooser.setFiles([file]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  let added: string | undefined;
  await expect
    .poll(async () => {
      added = (await photoRows(device)).find((row) => !before.has(row.id))?.id;
      return added !== undefined;
    }, { timeout: 15_000 })
    .toBe(true);
  await which.getByRole('button', { name: 'Cancelar' }).click();
  await expect(which).toHaveCount(0);
  return added!;
}

/** "Subir" or "Descer" from the tile's Overflow; waits for the announcement of the landing place. */
async function movePhoto(page: Page, id: string, item: 'Subir' | 'Descer', landing: number, total: number): Promise<void> {
  await trigger(page, id).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await expect(moveStatus(page)).toHaveText(new RegExp(`^Foto movida: ${landing} de ${total} na seção \\d+$`));
  await expect(galleryItem(page, id).locator('.number-badge')).toHaveText(String(landing));
}

/** Ana on a new relatório with three EXIF-dated "Geral" imports (06/09, morning) in the gallery; returns her device, the relatório and the photo ids. */
async function anaWithThreePhotos(page: Page, context: BrowserContext, seed: WorkerSeed): Promise<{ ana: Device; relatorioId: string; dated: string[] }> {
  await resetEmpresaA(seed);
  const account = seed.companies[0];
  const ana: Device = { page, context, account, database: deviceDatabaseName(account.userId) };
  await signInForDurability(page, context, account.email);
  await waitForShellCache(page);
  const built = newRelatorioDrafts(account);
  await pushDrafts(page, ana.database, built.drafts);
  await openGallery(page, built.relatorioId);
  const dated: string[] = [];
  for (const [i, time] of ['08:00:00', '08:10:00', '08:20:00'].entries()) {
    dated.push(await importGeral(ana, await exifJpeg(page, { dateTimeOriginal: `2026:09:06 ${time}`, offset: '-03:00', lat: -23.55, lng: -46.63 }, `foto-${i + 1}.jpg`)));
  }
  expect(await tileIds(page)).toEqual(dated);
  return { ana, relatorioId: built.relatorioId, dated };
}

/** Eduardo's device: a context of his own, signed in, on the relatório's gallery after a sync. */
async function eduardoOn(browser: Browser, seed: WorkerSeed, relatorioId: string): Promise<Device> {
  const account = seed.companies[0].colleague!;
  const context = await browser.newContext();
  const other = await context.newPage();
  const eduardo: Device = { page: other, context, account, database: deviceDatabaseName(account.userId) };
  await signInForDurability(other, context, account.email);
  await other.goto(`/relatorio/${relatorioId}`);
  await expect(other.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
  await syncNow(other);
  await openGallery(other, relatorioId);
  return eduardo;
}

test('@p0 21.3-E2E-005 an EXIF-less import moved to second stays second after a reload, after a sync to a second device and after another photo is added (the new one last)', async ({ page, context, browser, seed, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot store a photo Blob in IndexedDB');
  test.setTimeout(300_000);
  const { ana, relatorioId, dated } = await anaWithThreePhotos(page, context, seed);

  // The EXIF-less import takes its file date (now): it sorts last.
  const plain = await importGeral(ana, await plainJpeg(page, 'whatsapp-sem-exif.jpg'));
  expect(await tileIds(page)).toEqual([...dated, plain]);
  await expect(galleryItem(page, plain).locator('.number-badge')).toHaveText('4');

  // Moved to second place: two "Subir".
  await movePhoto(page, plain, 'Subir', 3, 4);
  await movePhoto(page, plain, 'Subir', 2, 4);
  const moved = [dated[0]!, plain, dated[1]!, dated[2]!];
  expect(await tileIds(page)).toEqual(moved);
  const key = (await photoRows(ana)).find((row) => row.id === plain)!.order_key;
  expect(key).toMatch(/^[0-9a-z]+$/);

  // After a reload: still second, from the committed row.
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => tileIds(page)).toEqual(moved);
  await expect(galleryItem(page, plain).locator('.number-badge')).toHaveText('2');

  // After a sync to a second device: the server row and Eduardo's gallery hold the same place.
  await syncNow(page);
  expect((await serverRow(ana.account.companyId, 'file', plain))?.order_key).toBe(key);
  const eduardo = await eduardoOn(browser, seed, relatorioId);
  try {
    await expect.poll(() => tileIds(eduardo.page)).toEqual(moved);
    await expect(galleryItem(eduardo.page, plain).locator('.number-badge')).toHaveText('2');
    expect((await photoRows(eduardo)).find((row) => row.id === plain)!.order_key).toBe(key);

    // A photo added afterwards (now) lands last; the moved one stays second.
    await openGallery(page, relatorioId);
    const later = await importGeral(ana, await plainJpeg(page, 'depois.jpg'));
    await expect.poll(() => tileIds(page)).toEqual([...moved, later]);
    await expect(galleryItem(page, plain).locator('.number-badge')).toHaveText('2');
    await expect(galleryItem(page, later).locator('.number-badge')).toHaveText('5');
  } finally {
    await eduardo.context.close();
  }
});

test('@p0 21.3-E2E-006 two devices move the same photo offline to different places; after "Sincronizar agora" on both they show the same order, with no conflict dialog', async ({ page, context, browser, seed, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit cannot store a photo Blob in IndexedDB');
  test.setTimeout(300_000);
  const { ana, relatorioId, dated } = await anaWithThreePhotos(page, context, seed);
  await syncNow(page);
  await openGallery(page, relatorioId);
  const eduardo = await eduardoOn(browser, seed, relatorioId);
  try {
    await expect.poll(() => tileIds(eduardo.page)).toEqual(dated);
    const [first, second, third] = dated as [string, string, string];

    await ana.context.setOffline(true);
    await eduardo.context.setOffline(true);
    // Ana moves photo 2 down (place 3); Eduardo moves the same photo up (place 1).
    await movePhoto(ana.page, second, 'Descer', 3, 3);
    await movePhoto(eduardo.page, second, 'Subir', 1, 3);
    expect(await tileIds(ana.page)).toEqual([first, third, second]);
    expect(await tileIds(eduardo.page)).toEqual([second, first, third]);

    // Ana syncs first, then Eduardo, then Ana again: Eduardo's put is the later one.
    await ana.context.setOffline(false);
    await syncNow(ana.page);
    await eduardo.context.setOffline(false);
    await syncNow(eduardo.page);
    await syncNow(ana.page);

    const server = await serverRow(ana.account.companyId, 'file', second);
    const eduardoKey = (await photoRows(eduardo)).find((row) => row.id === second)!.order_key;
    expect(server?.order_key).toBe(eduardoKey);
    expect((await photoRows(ana)).find((row) => row.id === second)!.order_key).toBe(eduardoKey);
    for (const device of [ana, eduardo]) {
      await openGallery(device.page, relatorioId);
      await expect.poll(() => tileIds(device.page)).toEqual([second, first, third]);
      await expect(galleryItem(device.page, second).locator('.number-badge')).toHaveText('1');
      await expect(device.page.getByRole('dialog')).toHaveCount(0);
      await expect(device.page.getByRole('alertdialog')).toHaveCount(0);
    }
  } finally {
    await eduardo.context.close();
  }
});
