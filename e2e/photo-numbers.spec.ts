import { photoToken, type OpDraft } from '@app/domain';
import type { BrowserContext, Download, Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure, readZipEntries } from '../apps/api/src/jobs/generate/docx-structure.ts';
import { samplePdf } from '../apps/api/src/jobs/generate/sample-pdf.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readFileBlobs, readStore } from './support/outbox.ts';
import { devicePhotos } from './support/photos.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { pushDrafts } from './support/relatorio-seed.ts';
import { syncNow } from './support/sync.ts';

/*
 * 7.2/7.3-E2E: the photo numbers a revision freezes (Story 7.2 AC3), and the printed
 * sections 7, 8 and 11 (Stories 7.2 AC1 and 7.3) in a DOCX generated for real by the api
 * (its queue, its LibreOffice: two TOC passes plus the certificate's rasterized pages).
 * Driven on the small Porto Seguro fixture seeded onto this worker's Empresa B, so this
 * spec runs in the serial group (`e2e/support/groups.ts`).
 */

let account: SeedAccount;
let database: string;
test.beforeEach(({ seed }) => {
  account = seed.companies[1];
  database = deviceDatabaseName(account.userId);
});

/** The job's own time: flush, queue pick-up, two LibreOffice passes, the certificate pages. */
const JOB_TIMEOUT = 150_000;

const toast = (page: Page) => page.getByTestId('toast');
const headerPill = (page: Page) => page.locator('.sheet-meta .status-pill');
const footButton = (page: Page) => page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => dialog(page).locator('.generate-row').getByRole('button', { name: 'Gerar relatório' });
const banner = (page: Page) => page.locator('.banner-slot .banner');
const numbersStatus = (page: Page) => page.getByTestId('photo-numbers-status');
const galleryItems = (page: Page) => page.locator('[data-route="/relatorio/:id/fotos"] .gallery-item');
const viewer = (page: Page) => page.getByRole('dialog', { name: /^Foto \d+ de \d+$/ });

async function openSumario(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
}

async function openGallery(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

/** "Adicionar fotos" > "Escolher arquivos" > one JPEG, then "Cancelar" on "De qual equipamento?": a "Geral" photo. */
async function addGeneralPhoto(page: Page, name: string): Promise<void> {
  const before = (await devicePhotos(page, database)).length;
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  const picker = page.getByRole('dialog', { name: 'Adicionar fotos' });
  await expect(picker).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await picker.getByRole('button', { name: 'Escolher arquivos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, name)]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(before + 1);
  await which.getByRole('button', { name: 'Cancelar' }).click();
  await expect(which).toHaveCount(0);
  await expect(toast(page)).toContainText('1 foto ficou como Geral, sem legenda');
}

/** The Export dialog from the Sumário foot: generate, wait for the revision, close. */
async function generateRevision(page: Page, n: number): Promise<void> {
  await footButton(page).click();
  await expect(dialog(page)).toBeVisible();
  const again = dialog(page).getByRole('button', { name: 'Gerar de novo' });
  if (await again.isVisible()) await again.click();
  // A blocked "Gerar relatório" is aria-disabled: fail in seconds, not at the test timeout.
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await expect(toast(page)).toHaveText(`Revisão ${n} pronta — DOCX e PDF`, { timeout: JOB_TIMEOUT });
  await expect(dialog(page).getByRole('heading', { level: 2, name: `Revisão ${n} pronta` })).toBeVisible();
}

async function closeDialog(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
}

/**
 * Tile `n` of the gallery. Since Story 9.3 a "Geral" photo asks for a vision caption, so once
 * it is uploaded its suggested caption may arrive and the tile reads "Foto n, legenda sugerida, abrir".
 */
function galleryTile(page: Page, n: number): Locator {
  return page.getByRole('button', { name: new RegExp(`^Foto ${n}, (legenda sugerida, )?abrir$`) });
}

/** Opens the viewer on `tile`, reads its count, closes it. */
async function viewerCount(page: Page, tile: Locator): Promise<string> {
  await tile.click();
  await expect(viewer(page)).toBeVisible();
  const text = (await viewer(page).locator('.viewer-count').textContent()) ?? '';
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toHaveCount(0);
  return text;
}

/** Presses the button and returns the download it starts (in this tab or a new one). */
async function downloadFrom(page: Page, context: BrowserContext, press: () => Promise<void>): Promise<Download> {
  const downloadPromise = new Promise<Download>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no download started within 30 s')), 30_000);
    const settle = (download: Download) => {
      clearTimeout(timer);
      resolve(download);
    };
    context.once('page', (popup) => popup.once('download', settle));
    page.once('download', settle);
  });
  await press();
  const download = await downloadPromise;
  for (const extra of context.pages()) if (extra !== page) await extra.close().catch(() => undefined);
  await page.bringToFront();
  return download;
}

test('@p0 7.2-E2E-001 an issued revision freezes the gallery numbers; a photo added afterwards makes them provisional again and the Sumário names revision 2', async ({ page }) => {
  test.setTimeout(360_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openSumario(page);
  await expect(headerPill(page)).toHaveText('Em campo', { timeout: 30_000 });

  // Before any revision: the note alone says the numbers are provisional.
  await openGallery(page);
  await addGeneralPhoto(page, 'antes.jpg');
  await expect(galleryItems(page)).toHaveCount(1);
  await expect(numbersStatus(page)).toHaveCount(0);
  // The new photo is a `file` row on this device and a `file` create in its outbox.
  const [first] = await devicePhotos(page, database);
  expect(first).toMatchObject({ kind: 'photo', relatorio_id: EXPORT_RELATORIO_ID, block_id: null, caption: null, removed_at: null });
  const outbox = await readStore<{ path: string; kind: string }>(page, database, 'outbox');
  expect(outbox.some((op) => op.kind === 'create' && op.path === `file/${first!.id}`)).toBe(true);
  expect(await viewerCount(page, galleryTile(page, 1))).toBe('1 de 1 · nº provisório');

  // Issue revision 1 through the Export dialog (it drains the photo's upload first); the
  // parecer is the one blocking row since Story 7.4, so it is set first (and opens the Sumário).
  await setParecer(page, EXPORT_RELATORIO_ID);
  await generateRevision(page, 1);
  await closeDialog(page);
  await expect(headerPill(page)).toHaveText('Emitido', { timeout: 30_000 });

  // Nothing edited since: the numbers are the revision's, and the viewer drops "nº provisório".
  await openGallery(page);
  await expect(numbersStatus(page)).toHaveText('Números da revisão 1', { timeout: 30_000 });
  await expect(numbersStatus(page)).toHaveClass('section-note');
  expect(await viewerCount(page, galleryTile(page, 1))).toBe('1 de 1');

  // A photo added afterwards: provisional again, until revision 2.
  await addGeneralPhoto(page, 'depois.jpg');
  await expect(galleryItems(page)).toHaveCount(2);
  await expect(numbersStatus(page)).toHaveText('Números provisórios — serão definidos na revisão 2');
  const photos = await devicePhotos(page, database);
  const added = photos.find((photo) => photo.id !== first!.id)!;
  expect(added).toMatchObject({ kind: 'photo', relatorio_id: EXPORT_RELATORIO_ID, removed_at: null });
  expect((await readStore<{ path: string; kind: string }>(page, database, 'outbox')).some((op) => op.kind === 'create' && op.path === `file/${added.id}`)).toBe(true);
  const addedTile = page.locator(`.gallery-item[data-photo-id="${added.id}"]`).getByRole('button', { name: /^Foto \d+, abrir$/ });
  expect(await viewerCount(page, addedTile)).toMatch(/^\d de 2 · nº provisório$/);

  // The Sumário's banner names the next revision.
  await openSumario(page);
  await expect(banner(page)).toContainText('(revisão 1). Alterações geram a revisão 2.');
});

test('@p1 7.3-E2E-001 the DOCX prints "Imagem 1:" in section 7, the point citing it as "Imagem 1" in section 8, and the certificate checked at setup as rasterized pages in section 11', async ({ page, context }) => {
  test.setTimeout(420_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);

  // Cadastros › Instrumentos: a new instrument with a two-page PDF certificate, uploaded.
  await page.getByRole('link', { name: /Cadastros/ }).click();
  await page.getByRole('tab', { name: 'Instrumentos' }).click();
  await page.getByRole('button', { name: /^(Novo|Cadastrar) instrumento$/ }).click();
  const panel = page.locator('.registry-panel');
  await panel.getByLabel('Código').fill('CT-7');
  await panel.getByLabel('Nome').fill('Terrômetro');
  await panel.locator('input[type="file"]').setInputFiles({ name: 'certificado-ct7.pdf', mimeType: 'application/pdf', buffer: samplePdf(2) });
  await expect(panel.locator('.file-input .file-name')).toContainText('certificado-ct7.pdf', { timeout: 15_000 });
  await syncNow(page);
  await expect.poll(async () => (await readFileBlobs(page, database))[0]?.acked, { timeout: 30_000 }).toBe(true);

  // Dados do relatório › Etapa 4: the instrument checked for this relatório.
  await openSumario(page);
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/setup?etapa=4`);
  const checkbox = page.getByRole('checkbox', { name: /^CT-7/ });
  await expect(checkbox).toBeVisible({ timeout: 30_000 });
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect.poll(async () => (await readStore<{ path: string }>(page, database, 'outbox')).some((op) => op.path === 'relatorio/setup/instrument_ids')).toBe(true);

  // One photo in the gallery; a point citing it, written on another device of the office
  // (the point editor's photo reference has its own e2e, `points.spec.ts`).
  await openGallery(page);
  await addGeneralPhoto(page, 'isolador.jpg');
  const [photo] = await devicePhotos(page, database);
  const pointId = newId();
  const point: OpDraft = {
    kind: 'create',
    scope: 'relatorio',
    company_id: account.companyId,
    project_id: null,
    relatorio_id: EXPORT_RELATORIO_ID,
    path: `point/${pointId}`,
    value: {
      id: pointId,
      relatorio_id: EXPORT_RELATORIO_ID,
      text: `Isolador trincado, conforme ${photoToken(photo!.id)}.`,
      equipment_id: null,
      origin: 'manual',
      order_key: 'a0',
      removed_at: null,
      action: 'Substituir na próxima parada.',
      priority: null,
      deadline: null,
      owner: null,
    },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: account.userId,
  };
  await pushDrafts(page, database, [point]);

  // Generate and download the DOCX: "Parecer não preenchido" is the one row that blocks (E78-Q1).
  await setParecer(page, EXPORT_RELATORIO_ID);
  await openSumario(page);
  await generateRevision(page, 1);
  const download = await downloadFrom(page, context, () => dialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const response = await page.request.get(download.url());
  expect(response.status()).toBe(200);
  const docx = Buffer.from(await response.body());
  const structure = extractStructure(docx);

  // Section 7: the photo embedded, "Imagem 1." (no caption) under it.
  const photoTable = structure.tables.find((table) => table[0]?.[0]?.includes('Imagem 1'));
  expect(photoTable?.[0]?.[0]).toMatch(/^\nImagem 1\.\n\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  // Section 8: the token printed as the frozen number, the action after it.
  expect(structure.paragraphs).toContain('Isolador trincado, conforme Imagem 1. Substituir na próxima parada.');
  // Section 11: the two certificate pages as images, the first under the heading and the second on its own page, no placeholder for it.
  expect(structure.paragraphs.some((p) => p.startsWith('Certificado não anexado: CT-7'))).toBe(false);
  const media = [...readZipEntries(docx).keys()].filter((name) => name.startsWith('word/media/') && !name.endsWith('/'));
  expect(media.length).toBeGreaterThanOrEqual(1 + 2);
  const document = readZipEntries(docx).get('word/document.xml')!.toString('utf8');
  // Section 9's sheets and subsections break pages of their own: count only from section 11's heading on.
  const section11 = document.slice(document.lastIndexOf('CERTIFICADOS</w:t>'));
  expect((section11.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(1);
  expect(structure.headings.map((h) => h.text)).toEqual(expect.arrayContaining(['7 REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA', '11 CERTIFICADOS']));
});
