import { deviceDatabaseName, expect, signIn, test } from './support/merged-fixtures.ts';
import { syncNow } from './support/sync.ts';
import { readFileBlobs, readStore } from './support/outbox.ts';
import type { Locator, Page } from '@playwright/test';

/*
 * 2.2-E2E. The certificate upload end to end: pick on the instrument row, one batch in
 * the outbox with the Blob beside it, the upload after the push, and the offline queue.
 * The Empresa half of Story 2.3 lives in `cadastros.spec.ts` beside the other tabs.
 */

const PDF = Buffer.from('%PDF-1.4\ncertificado de teste E2E\n%%EOF\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

/** Opens Cadastros › Instrumentos with one new instrument in the panel. */
async function newInstrument(page: Page, code: string): Promise<void> {
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill(code);
  await panel.getByLabel('Nome').fill('Instrumento com certificado');
}

/** The tile's hidden native input; the panel has exactly one file input. */
function certificateInput(panel: Locator): Locator {
  return panel.locator('input[type="file"]');
}

interface OutboxRecord {
  path: string;
  batch_id: string | null;
  status: string;
}

test('@p0 2.2-E2E-001 a certificate is attached in one batch and uploads after the next push', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await newInstrument(page, 'C1');

  const panel = page.locator('.registry-panel');
  await certificateInput(panel).setInputFiles({
    name: 'certificado-c1.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });

  // The tile names the file at once, before anything has been pushed (AC 2.2-1).
  await expect(panel.locator('.file-input .file-name')).toContainText('certificado-c1.pdf');
  await expect(panel.locator('.file-input .file-name')).toContainText('Envio pendente');

  // The create op and the `certificate_file_id` op share one batch; the Blob is beside them.
  const outbox = await readStore<OutboxRecord>(page, database, 'outbox');
  const fileCreate = outbox.find((row) => /^file\/[0-9a-f-]+$/.test(row.path));
  const ownerPut = outbox.find((row) => row.path.endsWith('/certificate_file_id'));
  expect(fileCreate, 'the file create op is in the outbox').toBeDefined();
  expect(ownerPut, 'the certificate_file_id op is in the outbox').toBeDefined();
  expect(fileCreate!.batch_id).toBe(ownerPut!.batch_id);
  const blobs = await readFileBlobs(page, database);
  expect(blobs).toHaveLength(1);
  expect(blobs[0]!.name).toBe('certificado-c1.pdf');

  // The Blob survives a reload: it is in IndexedDB, not in React state.
  await page.reload();
  expect(await readFileBlobs(page, database)).toHaveLength(1);

  // One cycle pushes the ops, uploads the bytes and pulls `uploaded_at` back (AC 2.2-2).
  await syncNow(page);
  await expect
    .poll(async () => (await readFileBlobs(page, database))[0]?.acked, { timeout: 20_000 })
    .toBe(true);

  // `syncNow` leaves the Sync status surface open, which carries no Cadastros link.
  await page.goto('/cadastros');
  await page.getByRole('button', { name: /C1/ }).click();
  await expect(page.locator('.registry-panel .file-input .file-name')).toContainText('Enviado');
});

test('@p1 2.2-E2E-002 a file over 25 MB is refused inline, with no op and no Blob', async ({ page, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await newInstrument(page, 'C2');

  const panel = page.locator('.registry-panel');
  await certificateInput(panel).setInputFiles({
    name: 'enorme.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(26 * 1024 * 1024, 0x20),
  });

  await expect(panel.getByRole('alert')).toContainText('25 MB');
  expect(await readFileBlobs(page, database)).toHaveLength(0);
  const outbox = await readStore<OutboxRecord>(page, database, 'outbox');
  expect(outbox.some((row) => row.path.startsWith('file/'))).toBe(false);
});

test('@p2 2.2-E2E-003 a certificate attached offline queues and uploads on reconnect', async ({ page, context, seed }) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  await signIn(page, account.email);
  await newInstrument(page, 'C3');

  await context.setOffline(true);
  const panel = page.locator('.registry-panel');
  await certificateInput(panel).setInputFiles({
    name: 'offline.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(panel.locator('.file-input .file-name')).toContainText('offline.pdf');

  const offlineBlobs = await readFileBlobs(page, database);
  expect(offlineBlobs).toHaveLength(1);
  expect(offlineBlobs[0]!.acked).toBe(false);

  await context.setOffline(false);
  await syncNow(page);
  await expect
    .poll(async () => (await readFileBlobs(page, database))[0]?.acked, { timeout: 20_000 })
    .toBe(true);
});

test('@p1 2.2-E2E-004 the certificate opens from the row, here and on another device (Epic 2 retro D-3)', async ({
  page,
  browser,
  seed,
}) => {
  const account = seed.companies[0];
  const database = deviceDatabaseName(account.userId);
  const code = `A${Date.now().toString(36).slice(-4).toUpperCase()}`;
  await signIn(page, account.email);
  await newInstrument(page, code);

  const panel = page.locator('.registry-panel');
  // An image, not a PDF: headless Chromium downloads a PDF instead of showing it, and the
  // point here is the tab the tap opens, not the viewer.
  await certificateInput(panel).setInputFiles({ name: 'abrir.png', mimeType: 'image/png', buffer: PNG });
  await expect(panel.locator('.file-input .file-name')).toContainText('abrir.png');

  // On the device that picked it, before any upload: the local Blob opens in a new tab.
  const localTab = page.waitForEvent('popup');
  await panel.getByRole('button', { name: 'Abrir — Arquivo do certificado' }).click();
  await expect.poll(async () => (await localTab).url()).toMatch(/^blob:/);
  await (await localTab).close();

  await syncNow(page);
  await expect
    .poll(async () => (await readFileBlobs(page, database))[0]?.acked, { timeout: 20_000 })
    .toBe(true);

  // Another device of the office: nothing prefetched, the original is fetched on demand and kept.
  const office = await browser.newContext();
  try {
    const other = await office.newPage();
    await signIn(other, account.email);
    await other.getByRole('link', { name: /Cadastros/ }).click();
    await other.getByRole('tab', { name: 'Instrumentos' }).click();
    await other.getByRole('button', { name: new RegExp(`^${code} `) }).click();
    const otherPanel = other.locator('.registry-panel');
    expect(await readFileBlobs(other, database)).toHaveLength(0);
    const fetchedTab = other.waitForEvent('popup');
    await otherPanel.getByRole('button', { name: 'Abrir — Arquivo do certificado' }).click();
    await expect.poll(async () => (await fetchedTab).url()).toMatch(/^blob:/);
    await expect.poll(async () => (await readFileBlobs(other, database)).length).toBe(1);
  } finally {
    await office.close();
  }
});
