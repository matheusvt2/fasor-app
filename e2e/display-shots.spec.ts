import { BLOCK_CHAVE_ID } from '@app/domain/fixtures/porto-seguro/small';
import type { Locator, Page } from '@playwright/test';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { plainJpeg } from './fixtures/photos/synthetic.ts';
import { EXPORT_RELATORIO_ID, resetEmpresaBWithFixture } from './support/export-fixture.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { devicePhotos, expectCameraOpen } from './support/photos.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { setParecer } from './support/relatorio-flow.ts';

/*
 * 16.3-E2E: a "Ler visor" display shot (an instrument screen a reading came from) takes no
 * photo number. On the small Porto Seguro fixture (no photo of its own): a display shot on
 * the chave's isolation table, then a site photo; the site photo is "Foto 1" everywhere,
 * the display shot carries no badge in the gallery, the sheet strip and the caption
 * composer and the viewer, the point editor's picker does not offer it, removing it leaves the
 * site photo's number, and in the generated DOCX section 7
 * holds only the site photo ("Imagem 1.") while the chave's sheet in section 9 prints the
 * display shot's caption sentence alone, never "Imagem N". The fixture's ids are fixed and
 * a revision is generated, so this spec runs in the serial group (`e2e/support/groups.ts`).
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
const CAPTION = 'Leitura do megômetro';

const toast = (page: Page) => page.getByTestId('toast');
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const opener = (page: Page, key: string): Locator =>
  page.locator(`#ficha-step-ensaios .ficha-mt[data-table-key="${key}"]`).locator('.mt-actions').getByRole('button', { name: 'Ler visor' });
const galleryItem = (page: Page, id: string) => page.locator(`[data-route="/relatorio/:id/fotos"] .gallery-item[data-photo-id="${id}"]`);

interface FileRecord {
  entity: string;
  id: string;
  row: { id: string; kind: string; block_id: string | null; reading_kind: string | null; caption: string | null; removed_at: string | null };
}

/** The committed photo rows of this device's store with `reading_kind: 'display'`. */
async function displayRows(page: Page): Promise<FileRecord['row'][]> {
  const records = await readStore<FileRecord>(page, database, 'entities');
  return records.filter((record) => record.entity === 'file' && record.row.kind === 'photo' && record.row.reading_kind === 'display').map((record) => record.row);
}

async function openSumario(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}`);
  await expect(page.getByRole('list', { name: 'Sumário do relatório' })).toBeVisible({ timeout: 30_000 });
}

async function openGallery(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/fotos`);
  await expect(page.getByRole('heading', { level: 2, name: /^Registro fotográfico \(\d+\)$/ })).toBeVisible({ timeout: 30_000 });
}

async function openChave(page: Page): Promise<void> {
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/ficha/${BLOCK_CHAVE_ID}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
}

test('@p0 16.3-E2E-001 a "Ler visor" display shot takes no number: no badge on screen, not in the picker, out of section 7, printed under its test in section 9 with its caption alone', async ({ page }) => {
  test.setTimeout(420_000);
  await resetEmpresaBWithFixture(account);
  await signIn(page, account.email);
  await openSumario(page);

  // A one-shot "Ler visor" burst on the chave's isolation table: the display shot comes first in capture order.
  await openChave(page);
  await opener(page, 'contato_aberto').click();
  const view = await expectCameraOpen(page);
  await view.getByRole('button', { name: 'Disparar' }).click();
  await expect(opener(page, 'contato_aberto')).toHaveAttribute('data-count', '1');
  await view.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });

  // The committed store row: a live photo of the chave with `reading_kind: 'display'`.
  await expect.poll(async () => (await displayRows(page)).length, { timeout: 15_000 }).toBe(1);
  const [display] = await displayRows(page);
  expect(display).toMatchObject({ kind: 'photo', block_id: BLOCK_CHAVE_ID, reading_kind: 'display', removed_at: null });

  // The sheet strip: the display shot's tile has no number badge and no number in its name.
  const strip = page.locator('.sheet-photos');
  await expect(strip.locator('.photo-tile')).toHaveCount(1);
  await expect(strip.locator('.number-badge')).toHaveCount(0);
  await expect(strip.getByRole('button', { name: 'Foto, abrir', exact: true })).toBeVisible();

  // The gallery: a site photo added afterwards is "Foto 1"; the display shot draws no badge.
  await openGallery(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Adicionar fotos' }).click();
  await (await chooser).setFiles([await plainJpeg(page, 'vista-geral.jpg')]);
  const which = page.getByRole('dialog', { name: /^De qual equipamento\?/ });
  await expect(which).toBeVisible();
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(2);
  await which.getByRole('button', { name: 'Cancelar' }).click();
  await expect(which).toHaveCount(0);
  const site = (await devicePhotos(page, database)).find((photo) => photo.id !== display!.id)!;
  expect(site).toMatchObject({ kind: 'photo', block_id: null, removed_at: null });
  await expect(galleryItem(page, site.id).locator('.number-badge')).toHaveText('1');
  await expect(galleryItem(page, site.id).getByRole('button', { name: /^Foto 1, (legenda sugerida, )?abrir$/ })).toBeVisible();
  await expect(galleryItem(page, display!.id).locator('.number-badge')).toHaveCount(0);
  await expect(galleryItem(page, display!.id).getByRole('button', { name: /^Foto, (legenda sugerida, )?abrir$/ })).toBeVisible();

  // The caption composer on the display shot: no badge, "Foto" alone; saving toasts "Legenda salva".
  await galleryItem(page, display!.id).getByRole('button', { name: 'Legendar' }).click();
  const composer = page.getByRole('dialog', { name: 'Legenda' });
  await expect(composer).toBeVisible();
  await expect(composer.locator('.capture-preview')).toHaveAttribute('aria-label', 'Foto');
  await expect(composer.locator('.number-badge')).toHaveCount(0);
  const editText = composer.getByRole('button', { name: 'Editar texto' });
  if ((await editText.getAttribute('aria-pressed')) !== 'true') await editText.click();
  await composer.getByRole('textbox', { name: 'Texto da legenda' }).fill(CAPTION);
  await composer.getByRole('button', { name: 'Salvar legenda' }).click();
  await expect(composer).toHaveCount(0);
  await expect(toast(page)).toContainText('Legenda salva');
  await expect(toast(page)).not.toContainText('Legenda da foto');
  await expect(galleryItem(page, display!.id).locator('.photo-meta')).toHaveText(CAPTION);
  await expect.poll(async () => (await displayRows(page))[0]?.caption).toBe(CAPTION);

  // Generate revision 1 and read the DOCX back.
  await setParecer(page, EXPORT_RELATORIO_ID);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(exportDialog(page)).toBeVisible();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const download = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click());
  const structure = extractStructure(await downloadBytes(download));

  // Section 7 holds one photo, the site photo, "Imagem 1."; no "Imagem 2" anywhere.
  expect(structure.headings.map((h) => h.text)).toContain('7 REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA');
  const imageLines = structure.paragraphs.filter((p) => /^Imagem \d+[.:]/.test(p));
  expect(imageLines).toEqual(['Imagem 1.']);
  expect(structure.paragraphs.some((p) => p.includes('Imagem 2'))).toBe(false);
  // Section 9: the chave's sheet prints the display shot's caption sentence alone, after section 7.
  expect(structure.paragraphs.filter((p) => p === `${CAPTION}.`)).toHaveLength(1);
  expect(structure.paragraphs.indexOf(`${CAPTION}.`)).toBeGreaterThan(structure.paragraphs.indexOf('Imagem 1.'));
  expect(structure.paragraphs.some((p) => p.includes(`Imagem 1: ${CAPTION}`) || p.includes(`Imagem 2: ${CAPTION}`))).toBe(false);
  await page.keyboard.press('Escape');
  await expect(exportDialog(page)).toBeHidden();

  // The point editor's picker offers the site photo alone.
  await page.goto(`/relatorio/${EXPORT_RELATORIO_ID}/pontos`);
  await expect(page.locator('.poa-list')).toBeAttached({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  const editor = page.getByRole('article', { name: 'Novo ponto de atenção em edição' });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Escolher fotos' }).click();
  const picker = page.getByRole('dialog', { name: 'Escolher fotos' });
  const offered = picker.getByRole('group', { name: 'Fotos do relatório' }).getByRole('button');
  await expect(offered).toHaveCount(1);
  await expect(offered.first()).toHaveAccessibleName(/^Imagem 1, /);
  await expect(picker.getByRole('button', { name: new RegExp(CAPTION) })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Cancelar' }).click();
  await expect(picker).toHaveCount(0);

  // The viewer on the display shot: no badge, no count, named "Foto" alone.
  await openGallery(page);
  await galleryItem(page, display!.id).getByRole('button', { name: /^Foto, (legenda sugerida, )?abrir$/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Foto', exact: true });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.number-badge')).toHaveCount(0);
  await expect(viewer.locator('.viewer-count')).toHaveText('');

  // Removing it says so without a number, and the site photo keeps number 1.
  await viewer.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remover a foto do relatório?', exact: true }).getByRole('button', { name: 'Remover foto' }).click();
  await expect(page.locator('.photo-viewer')).toHaveCount(0);
  await expect(toast(page)).toContainText('Foto removida do relatório');
  await expect.poll(async () => (await displayRows(page)).filter((row) => row.removed_at === null).length, { timeout: 15_000 }).toBe(0);
  await expect(galleryItem(page, display!.id)).toHaveCount(0);
  await expect(galleryItem(page, site.id).locator('.number-badge')).toHaveText('1');
});
