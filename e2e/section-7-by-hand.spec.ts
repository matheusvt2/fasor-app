import { BLOCK_CHAVE_ID } from '@app/domain/fixtures/porto-seguro/small';
import type { Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { expectCameraOpen, shoot } from './support/photos.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { setParecer } from './support/relatorio-flow.ts';

/*
 * 17.1-E2E (Bruno, 2026-10-27): section 7 REGISTRO FOTOGRÁFICO holds only the "Geral" photos,
 * the ones added to it by hand, and every photo holds one number in document order. On the
 * small Porto Seguro fixture (no photo of its own): one photo with the chave's sticky bar
 * camera, then one with the gallery camera (target "Geral"). The Geral photo is "1" and the
 * sheet photo "2" although captured first; the gallery says under its camera where its shots
 * print. In the issued DOCX and PDF, section 7 holds "Imagem 1." alone and "Imagem 2" prints
 * once, under the chave's sheet in section 9. The fixture's ids are fixed and a revision is
 * generated, so this spec runs in the serial group (`e2e/support/groups.ts`).
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

/** The job's own time: flush, queue pick-up, two LibreOffice passes. */
const JOB_TIMEOUT = 150_000;
const GERAL_NOTE = 'Fotos tiradas aqui entram como Geral e saem no Registro fotográfico; as fotos de um equipamento ou de um local saem só na ficha ou no local.';
const CHAVE_TAG = 'SEC-TEST';

const toast = (page: Page) => page.getByTestId('toast');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const galleryItem = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);

interface FileRecord {
  entity: string;
  id: string;
  row: { id: string; kind: string; size: number; block_id: string | null; item_key: string | null; location_id?: string | null; reading_kind: string | null; removed_at: string | null; captured_at: string };
}

/** The committed live photo rows of this device's store, oldest first. */
async function photoRows(page: Page): Promise<FileRecord['row'][]> {
  const records = await readStore<FileRecord>(page, database, 'entities');
  return records
    .filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.removed_at === null)
    .map((record) => record.row)
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
}

/** One shot with the camera the sticky bar opens, concluded. */
async function shootFromBar(page: Page): Promise<void> {
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const view = await expectCameraOpen(page);
  await shoot(page, 1);
  await view.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
}

test('@p0 17.1-E2E-001 section 7 holds only the "Geral" photo: numbered 1 before the sheet photo captured earlier, which prints once, as "Imagem 2", under its sheet in section 9 of the DOCX and the PDF', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });

  // A sheet photo first: the chave's sticky bar camera.
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/ficha/${BLOCK_CHAVE_ID}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await shootFromBar(page);
  await expect.poll(async () => (await photoRows(page)).length, { timeout: 15_000 }).toBe(1);
  const [sheetPhoto] = await photoRows(page);
  expect(sheetPhoto).toMatchObject({ block_id: BLOCK_CHAVE_ID, removed_at: null });
  expect(sheetPhoto!.size).toBeGreaterThan(0);

  // Then a "Geral" photo: the gallery camera, its note saying where these shots print.
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sticky-action-bar .gallery-geral-note')).toHaveText(GERAL_NOTE);
  await shootFromBar(page);
  await expect.poll(async () => (await photoRows(page)).length, { timeout: 15_000 }).toBe(2);
  const geral = (await photoRows(page)).find((row) => row.id !== sheetPhoto!.id)!;
  // Story 9.3: a gallery shot with no context is created asking for its vision caption (`captionReadingOf`), which keeps it Geral.
  expect(geral).toMatchObject({ block_id: null, item_key: null, reading_kind: 'caption', removed_at: null });
  expect(geral.location_id ?? null).toBeNull();
  expect(geral.size).toBeGreaterThan(0);

  // Document order over capture order: the Geral photo is 1, the sheet photo 2.
  await expect(galleryItem(page, geral.id).locator('.number-badge')).toHaveText('1');
  await expect(galleryItem(page, sheetPhoto!.id).locator('.number-badge')).toHaveText('2');
  await expect(galleryItem(page, sheetPhoto!.id).getByRole('button', { name: /^Foto 2, (legenda sugerida, )?abrir$/ })).toBeVisible();

  // The sheet's strip carries the same number.
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/ficha/${BLOCK_CHAVE_ID}`);
  const strip = page.getByRole('region', { name: /^Fotos da ficha \(\d+\)$/ });
  await expect(strip.locator('.photo-list > .photo-row .number-badge')).toHaveText(['2']);

  // Generate revision 1; read the DOCX and the PDF back.
  await setParecer(page, EXPORT_RELATORIO_ID);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(exportDialog(page)).toBeVisible();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const docx = extractStructure(await downloadBytes(await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click())));
  const pdf = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  const text = (await pdfTextItems(new Uint8Array(await downloadBytes(pdf)))).join(' ');

  // DOCX: the section 7 heading, the heading after it, and the image lines between them.
  const level1 = docx.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const seven = level1.findIndex((heading) => heading.includes('REGISTRO FOTOGRÁFICO'));
  expect(seven).toBeGreaterThanOrEqual(0);
  const nextHeading = level1[seven + 1]!;
  const from = docx.paragraphs.lastIndexOf(level1[seven]!);
  const to = docx.paragraphs.lastIndexOf(nextHeading);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  const imageLine = /^Imagem \d+[.:]/;
  expect(docx.paragraphs.slice(from, to).filter((paragraph) => imageLine.test(paragraph))).toEqual(['Imagem 1.']);
  // "Imagem 2" prints once in the whole document, under the chave's sheet in section 9.
  const twos = docx.paragraphs.flatMap((paragraph, i) => (/^Imagem 2[.:]/.test(paragraph) ? [i] : []));
  expect(twos).toHaveLength(1);
  // The chave's title bar, after section 7 (section 9's sheets): the line under its photo follows it.
  const chaveAt = docx.paragraphs.findIndex((paragraph, i) => i > to && paragraph.startsWith('CHAVE SECCIONADORA') && paragraph.endsWith(CHAVE_TAG));
  expect(chaveAt).toBeGreaterThan(to);
  expect(twos[0]!).toBeGreaterThan(chaveAt);
  expect(docx.paragraphs.some((paragraph) => paragraph.includes('Imagem 3'))).toBe(false);

  // PDF: the same, read from the last (body) occurrence of each heading title (the ÍNDICE lists them first).
  const title = (heading: string) => heading.replace(/^\d+ /, '');
  const pdfFrom = text.lastIndexOf(title(level1[seven]!));
  const pdfTo = text.lastIndexOf(title(nextHeading));
  expect(pdfFrom).toBeGreaterThanOrEqual(0);
  expect(pdfTo).toBeGreaterThan(pdfFrom);
  const pdfSeven = text.slice(pdfFrom, pdfTo);
  expect(pdfSeven).toContain('Imagem 1.');
  expect(pdfSeven).not.toContain('Imagem 2');
  expect(text.split('Imagem 2').length - 1).toBe(1);
  const pdfChave = text.indexOf(CHAVE_TAG, pdfTo);
  expect(pdfChave).toBeGreaterThan(pdfTo);
  expect(text.indexOf('Imagem 2')).toBeGreaterThan(pdfChave);
  expect(text).not.toContain('Imagem 3');
});
