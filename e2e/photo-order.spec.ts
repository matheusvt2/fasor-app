import { photoToken, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { copy } from '../apps/web/src/copy/pt-br.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { resetEmpresaBWithFixture, type SmallFixtureCopy } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { pdfTextItems } from './support/pdf-text.ts';
import { expectCameraOpen, shoot } from './support/photos.ts';
import { setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { syncNow } from './support/sync.ts';

/*
 * 21.3-E2E (Story 21.3, Bruno 2026-11-05): the REGISTRO FOTOGRÁFICO in the order of the work.
 * On the small Porto Seguro fixture (no photo of its own): one photo with the chave's sticky bar
 * camera, then five "Geral" photos in one burst of the gallery camera. Photo 4 goes up twice
 * through its tile's Overflow ("Subir"): the gallery numbers 1, 4, 2, 3, 5 in tile order, one
 * `file/{id}/order_key` put per move is committed, the first tile's "Subir" and the last tile's
 * "Descer" are disabled and the sheet photo's tile has no Overflow. The issued DOCX and PDF print
 * section 7 in the moved order as "Imagem 1" to "Imagem 5", and the sheet photo keeps its
 * section 9 number. At 390, 768 and 1280 px; a fourth test checks that a section 8 point citing
 * "Imagem 3" prints "conforme Imagem 5" once that photo moved to place 5, and the point editor's
 * "Escolher fotos" offers the photos in the gallery's order. Revisions are generated, so this
 * spec runs in the serial `queue` lane (`e2e/support/groups.ts`), on this worker's own copy of
 * the fixture (chore T3, 2026-11-09).
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
const CHAVE_TAG = 'SEC-TEST';

const toast = (page: Page) => page.getByTestId('toast');
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const galleryItem = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);
const moveStatus = (page: Page) => page.getByTestId('gallery-move-status');

interface PhotoRecord {
  id: string;
  kind: string;
  block_id: string | null;
  removed_at: string | null;
  captured_at: string;
  local_seq: number;
  order_key?: string | null;
}

/** The committed live photo rows of this device's store, in capture order. */
async function photoRows(page: Page): Promise<PhotoRecord[]> {
  const records = await readStore<{ entity: string; row: PhotoRecord }>(page, database, 'entities');
  return records
    .filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.removed_at === null)
    .map((record) => record.row)
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || a.local_seq - b.local_seq || (a.id < b.id ? -1 : 1));
}

/** One camera session from the sticky bar: `n` shots, concluded. */
async function shootFromBar(page: Page, n: number): Promise<void> {
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true }).click();
  const view = await expectCameraOpen(page);
  await shoot(page, n);
  await view.getByRole('button', { name: 'Concluir fotos' }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
}

async function openGallery(page: Page, fixture: SmallFixtureCopy): Promise<void> {
  await page.goto(`/relatorio/${fixture.relatorioId}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

/** Every gallery tile in DOM order: its photo id and its number badge. */
async function tileOrder(page: Page): Promise<[string, string][]> {
  return page
    .locator('[data-route="/relatorio/:id/fotos"] .gallery-item')
    .evaluateAll((items) => items.map((item) => [(item as HTMLElement).dataset.photoId ?? '', item.querySelector('.number-badge')?.textContent ?? ''] as [string, string]));
}

/** The tile's Overflow trigger ("Mais opções de Foto N"). */
const trigger = (page: Page, id: string): Locator => galleryItem(page, id).getByRole('button', { name: /^Mais opções de Foto \d+$/ });

/** "Subir" or "Descer" from the tile's Overflow; the announcement names the landing place; the focus comes back to the trigger. */
async function movePhoto(page: Page, id: string, item: 'Subir' | 'Descer', landing: number, total: number): Promise<void> {
  await trigger(page, id).click();
  const menuItem = page.getByRole('menuitem', { name: item, exact: true });
  await expect(menuItem).not.toHaveAttribute('aria-disabled', 'true');
  await menuItem.click();
  await expect(moveStatus(page)).toHaveText(new RegExp(`^Foto movida: ${landing} de ${total} na seção \\d+$`));
  await expect(galleryItem(page, id).locator('.number-badge')).toHaveText(String(landing));
  await expect(trigger(page, id)).toBeFocused();
  await expect(trigger(page, id)).toHaveAccessibleName(`Mais opções de Foto ${landing}`);
}

/** Opens the tile's Overflow, reads which of Subir/Descer are disabled, closes it. */
async function disabledItems(page: Page, id: string): Promise<{ up: boolean; down: boolean }> {
  await trigger(page, id).click();
  const up = page.getByRole('menuitem', { name: 'Subir', exact: true });
  const down = page.getByRole('menuitem', { name: 'Descer', exact: true });
  await expect(up).toBeVisible();
  const state = { up: (await up.getAttribute('aria-disabled')) === 'true', down: (await down.getAttribute('aria-disabled')) === 'true' };
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return state;
}

/** No horizontal page scroll, and the open Overflow and its trigger inside the viewport. */
async function expectFits(page: Page, id: string): Promise<void> {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const box = (await trigger(page, id).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  await trigger(page, id).click();
  const menu = (await page.getByRole('menu').boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/**
 * The sheet photo (chave's sticky bar), then five "Geral" photos (gallery burst), each Geral
 * photo captioned "Captura n" from the office so the documents say which photo prints where.
 * Returns the sheet photo, the five Geral photos in capture order and this worker's fixture copy.
 */
async function sheetPhotoAndFiveGeral(page: Page): Promise<{ sheet: PhotoRecord; geral: PhotoRecord[]; fixture: SmallFixtureCopy }> {
  const fixture = await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await page.goto(`/relatorio/${fixture.relatorioId}/ficha/${fixture.blockChaveId}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  await shootFromBar(page, 1);
  await expect.poll(async () => (await photoRows(page)).length, { timeout: 15_000 }).toBe(1);
  const [sheet] = await photoRows(page);
  expect(sheet!.block_id).toBe(fixture.blockChaveId);

  await openGallery(page, fixture);
  await shootFromBar(page, 5);
  await expect.poll(async () => (await photoRows(page)).length, { timeout: 15_000 }).toBe(6);
  const geral = (await photoRows(page)).filter((row) => row.id !== sheet!.id);
  expect(geral).toHaveLength(5);
  for (const photo of geral) expect(photo.block_id).toBeNull();

  // The creates reach the server first (a put on a row it does not hold is refused), then the captions come back.
  await syncNow(page);
  await pushDrafts(page, database, geral.map((photo, i) => officeDraft(account, { relatorioId: fixture.relatorioId }, `file/${photo.id}/caption`, `Captura ${i + 1}`)));
  await syncNow(page);
  await openGallery(page, fixture);
  for (const [i, photo] of geral.entries()) await expect(galleryItem(page, photo.id).locator('.photo-meta')).toHaveText(`Captura ${i + 1}`);
  return { sheet: sheet!, geral, fixture };
}

/** Generates revision 1 from the Sumário; returns the DOCX structure and the PDF text. */
async function generate(page: Page, fixture: SmallFixtureCopy): Promise<{ docx: ReturnType<typeof extractStructure>; pdf: string }> {
  await setParecer(page, fixture.relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(exportDialog(page)).toBeVisible();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const docx = extractStructure(await downloadBytes(await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click())));
  const pdf = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  return { docx, pdf: (await pdfTextItems(new Uint8Array(await downloadBytes(pdf)))).join(' ') };
}

/** Section 7 of the DOCX: its heading, the next one, and the paragraphs between (read from the body, after the ÍNDICE). */
function docxSection7(docx: ReturnType<typeof extractStructure>): { paragraphs: string[]; heading: string; next: string; end: number } {
  const level1 = docx.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const seven = level1.findIndex((heading) => heading.includes('REGISTRO FOTOGRÁFICO'));
  expect(seven).toBeGreaterThanOrEqual(0);
  const next = level1[seven + 1]!;
  const from = docx.paragraphs.lastIndexOf(level1[seven]!);
  const to = docx.paragraphs.lastIndexOf(next);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return { paragraphs: docx.paragraphs.slice(from, to), heading: level1[seven]!, next, end: to };
}

/** The PDF's section 7, from the last (body) occurrence of its title to the next heading's. */
function pdfSection7(text: string, heading: string, next: string): { body: string; end: number } {
  const title = (h: string) => h.replace(/^\d+ /, '');
  const from = text.lastIndexOf(title(heading));
  const to = text.lastIndexOf(title(next));
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return { body: text.slice(from, to), end: to };
}

/** Every "Imagem n: Captura m" of a text, in order, as [n, m]. */
const imageCaptions = (text: string): [number, number][] => [...text.matchAll(/Imagem (\d+):\s+Captura (\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

for (const [n, width] of [[1, 390], [2, 768], [3, 1280]] as const) {
  test(`@p0 21.3-E2E-00${n} at ${width} px: photo 4 moved up twice prints section 7 as 1, 4, 2, 3, 5 ("Imagem 1" to "Imagem 5") in the DOCX and the PDF, the sheet photo keeps its section 9 number, the ends are disabled and a sheet photo has no move`, async ({ page }) => {
    test.setTimeout(480_000);
    await page.setViewportSize({ width, height: 900 });
    const { sheet, geral, fixture } = await sheetPhotoAndFiveGeral(page);
    const [p1, p2, p3, p4, p5] = geral.map((photo) => photo.id) as [string, string, string, string, string];

    // Before: capture order, the sheet photo (captured first) numbered after section 7.
    expect(await tileOrder(page)).toEqual([[sheet.id, '6'], [p1, '1'], [p2, '2'], [p3, '3'], [p4, '4'], [p5, '5']]);
    // e21g D3: the gallery note says Geral photos follow the relatório (Subir, Descer), sheet photos capture order.
    const note = page.locator('.section-note').first();
    await expect(note).toContainText(copy.gallery.orderNote);
    await expect(note).not.toContainText('Ordem cronológica');
    await expect(galleryItem(page, sheet.id).getByRole('button', { name: /^Mais opções de / })).toHaveCount(0);
    await expectFits(page, p4);

    // "Subir" twice on photo 4, through its Overflow.
    await movePhoto(page, p4, 'Subir', 3, 5);
    await movePhoto(page, p4, 'Subir', 2, 5);
    expect(await tileOrder(page)).toEqual([[sheet.id, '6'], [p1, '1'], [p4, '2'], [p2, '3'], [p3, '4'], [p5, '5']]);

    // One put per move, committed on this device; only photo 4 carries a key.
    const outbox = await readStore<{ path: string; value: unknown }>(page, database, 'outbox');
    expect(outbox.filter((op) => op.path === `file/${p4}/order_key`)).toHaveLength(2);
    expect(outbox.filter((op) => /^file\/[^/]+\/order_key$/.test(op.path) && op.path !== `file/${p4}/order_key`)).toEqual([]);
    const rows = await photoRows(page);
    expect(rows.find((row) => row.id === p4)!.order_key).toMatch(/^[0-9a-z]+$/);
    for (const row of rows.filter((r) => r.id !== p4)) expect(row.order_key ?? null).toBeNull();

    // The ends: the first Geral tile cannot go up, the last cannot go down.
    expect(await disabledItems(page, p1)).toEqual({ up: true, down: false });
    expect(await disabledItems(page, p5)).toEqual({ up: false, down: true });
    expect(await disabledItems(page, p4)).toEqual({ up: false, down: false });
    await expectFits(page, p1);

    // The documents (the same at every width: generated from the Sumário at 1280 px).
    await page.setViewportSize({ width: 1280, height: 900 });
    const { docx, pdf } = await generate(page, fixture);
    const seven = docxSection7(docx);
    expect(seven.paragraphs.filter((paragraph) => /^Imagem \d+[.:]/.test(paragraph))).toEqual([
      'Imagem 1: Captura 1.',
      'Imagem 2: Captura 4.',
      'Imagem 3: Captura 2.',
      'Imagem 4: Captura 3.',
      'Imagem 5: Captura 5.',
    ]);
    const pdfSeven = pdfSection7(pdf, seven.heading, seven.next);
    expect(imageCaptions(pdfSeven.body)).toEqual([[1, 1], [2, 4], [3, 2], [4, 3], [5, 5]]);
    // The sheet photo keeps "Imagem 6", once, under the chave's sheet in section 9.
    const sixes = docx.paragraphs.flatMap((paragraph, i) => (/^Imagem 6[.:]/.test(paragraph) ? [i] : []));
    expect(sixes).toHaveLength(1);
    const chaveAt = docx.paragraphs.findIndex((paragraph, i) => i > seven.end && paragraph.startsWith('CHAVE SECCIONADORA') && paragraph.endsWith(CHAVE_TAG));
    expect(chaveAt).toBeGreaterThan(seven.end);
    expect(sixes[0]!).toBeGreaterThan(chaveAt);
    expect(pdf.split('Imagem 6').length - 1).toBe(1);
    expect(pdf.indexOf('Imagem 6')).toBeGreaterThan(pdf.indexOf(CHAVE_TAG, pdfSeven.end));
    expect(docx.paragraphs.some((paragraph) => paragraph.includes('Imagem 7'))).toBe(false);
  });
}

test('@p0 21.3-E2E-004 a section 8 point citing "Imagem 3" prints "conforme Imagem 5" once that photo moved to place 5', async ({ page }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const { geral, fixture } = await sheetPhotoAndFiveGeral(page);
  const [p1, p2, p3, p4, p5] = geral.map((photo) => photo.id) as [string, string, string, string, string];

  // A point citing photo 3, written on another device of the office (the point editor's photo reference has its own e2e).
  const pointId = newId();
  const point: OpDraft = officeDraft(
    account,
    { relatorioId: fixture.relatorioId },
    `point/${pointId}`,
    {
      id: pointId,
      relatorio_id: fixture.relatorioId,
      text: `Isolador trincado, conforme ${photoToken(p3)}.`,
      equipment_id: null,
      origin: 'manual',
      order_key: 'a0',
      removed_at: null,
      action: 'Substituir na próxima parada.',
      priority: null,
      deadline: null,
      owner: null,
    },
    'create',
  );
  await pushDrafts(page, database, [point]);
  await syncNow(page);
  await openGallery(page, fixture);

  // Photo 3 down twice: place 5.
  await movePhoto(page, p3, 'Descer', 4, 5);
  await movePhoto(page, p3, 'Descer', 5, 5);
  expect((await tileOrder(page)).filter(([id]) => geral.some((photo) => photo.id === id))).toEqual([[p1, '1'], [p2, '2'], [p4, '3'], [p5, '4'], [p3, '5']]);

  const { docx, pdf } = await generate(page, fixture);
  expect(docx.paragraphs).toContain('Isolador trincado, conforme Imagem 5. Substituir na próxima parada.');
  expect(docx.paragraphs.some((paragraph) => paragraph.includes('conforme Imagem 3'))).toBe(false);
  expect(pdf.replace(/\s+/g, ' ')).toContain('conforme Imagem 5');
  const seven = docxSection7(docx);
  expect(seven.paragraphs.filter((paragraph) => /^Imagem \d+[.:]/.test(paragraph))).toEqual([
    'Imagem 1: Captura 1.',
    'Imagem 2: Captura 2.',
    'Imagem 3: Captura 4.',
    'Imagem 4: Captura 5.',
    'Imagem 5: Captura 3.',
  ]);

  // The point editor's "Escolher fotos" offers the photos in the gallery's order: the sheet photo
  // (captured first, Imagem 6) in its capture slot, the Geral ones in section 7's moved order.
  await page.goto(`/relatorio/${fixture.relatorioId}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Escolher fotos' }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher fotos' });
  const offered = picker.getByRole('group', { name: 'Fotos do relatório' }).getByRole('button');
  const expected = [/^Imagem 6[,]/, /^Imagem 1, Captura 1, referenciar$/, /^Imagem 2, Captura 2, referenciar$/, /^Imagem 3, Captura 4, referenciar$/, /^Imagem 4, Captura 5, referenciar$/, /^Imagem 5, Captura 3, referenciar$/];
  await expect(offered).toHaveCount(expected.length);
  for (const [i, name] of expected.entries()) await expect(offered.nth(i)).toHaveAccessibleName(name);
  await picker.getByRole('button', { name: 'Cancelar' }).click();
  await expect(picker).toHaveCount(0);
});
