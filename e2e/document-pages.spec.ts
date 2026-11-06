import { getDefinition, photoToken, sortByOrderKey, type BlockRow, type LocationRow, type OpDraft } from '@app/domain';
import type { Locator, Page } from '@playwright/test';
import { newId } from '../apps/api/src/ids.ts';
import { extractStructure } from '../apps/api/src/jobs/generate/docx-structure.test-support.ts';
import { downloadBytes, downloadFrom } from './support/download.ts';
import { deviceDatabaseName, expect, signIn, test, type SeedAccount } from './support/merged-fixtures.ts';
import { readStore } from './support/outbox.ts';
import { fichaStart, footerOnlyPages, lastPageOf, pdfPageTexts, SHEET_CONTENT_MARKS } from './support/pdf-text.ts';
import { devicePhotos, expectCameraOpen, shoot } from './support/photos.ts';
import { confirmIssue, createProjectFromHome, createRelatorio, setParecer } from './support/relatorio-flow.ts';
import { officeDraft, pushDrafts } from './support/relatorio-seed.ts';
import { resetEmpresaB } from './support/reset-empresa-b.ts';
import { syncNow } from './support/sync.ts';

/*
 * Stories 20.3, 20.5 and 20.6 end to end, on a relatório created from the standard template
 * through the UI and issued for real (the api's queue and LibreOffice), then read page by
 * page off its PDF (`pdfPageTexts`):
 * - 20.3: the Sumário lists "Relatórios dos ensaios" at 8 and "Pontos de atenção" at 9 (the
 *   device's section blocks in that order, Subir and Descer still moving them); the document
 *   prints both headings and the ÍNDICE lines in that order, and the points section starts a
 *   page of its own after the last ficha;
 * - 20.5: a disjuntor whose long plate text pushes VERIFICAÇÕES GERAIS to the page foot prints
 *   the band and the last item on one page, the next;
 * - 20.6: every ficha starts a page; the disjuntor's plate photo, NC photo (with its item line)
 *   and two test photos print together after its CONCLUSÃO, in that order, and the point that
 *   cites the NC photo names the number printed under it;
 * - 20.6 follow-up (2026-11-04): no page of the PDF holds only the header and footer.
 *
 * Two steps are seeded, not tapped (impractical through the UI): the 91 sheets outside three
 * of Cubículo Enel are removed with one office push (the document then stays a few pages
 * long), and the point citing the NC photo is pushed from the office device. The relatório
 * is issued through the shared queue and LibreOffice, so this spec runs in the serial group.
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
const LOCAL = 'Cubículo Enel';
const KEPT_TYPES = ['chave_seccionadora', 'disjuntor_mt', 'tp'] as const;
/** The disjuntor's text plate fields, each filled with a long value (at most 200 characters, the cap Story 20.9 plans). */
const LONG_FIELDS = ['identificacao', 'n_serie', 'tipo', 'aj_bobina', 'aj_rele_50_51'] as const;
const NC_ITEM = 'contatos_movel_e_fixo';

const toast = (page: Page) => page.getByTestId('toast');
const sumarioTitles = (page: Page) => page.getByRole('list', { name: 'Sumário do relatório' }).locator('.sum-title');
const posBox = (page: Page, title: string) => page.getByRole('textbox', { name: `Número de ${title} — digite outro para mover` });
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Gerar relatório' });
const generateButton = (page: Page) => exportDialog(page).locator('.generate-row').getByRole('button', { name: /^(Gerar relatório|Gerando…)$/ });
const camera = (page: Page) => page.getByRole('dialog', { name: 'Câmera' });
const checklistRow = (page: Page, key: string) => page.locator(`#ficha-step-verificacoes li.checklist-row[data-item-key="${key}"]`);

interface Entity<T> {
  entity: string;
  row: T;
}

/** A value of exactly `length` characters, in words, so it wraps in its cell. */
function longValue(field: string, length = 190): string {
  const words = `${field.toUpperCase()} valor de placa transcrito por extenso para ocupar varias linhas da celula`;
  let text = words;
  while (text.length < length) text = `${text} ${words}`;
  return text.slice(0, length).trimEnd();
}

/** The device's live rows of one entity. */
async function liveRows<T extends { removed_at: string | null }>(page: Page, entity: string): Promise<T[]> {
  return (await readStore<Entity<T>>(page, database, 'entities')).filter((record) => record.entity === entity && record.row.removed_at === null).map((record) => record.row);
}

/** One camera session from `opener`: `n` shots, concluded (the plate camera closes by itself). */
async function shootFrom(page: Page, opener: Locator, n: number, plate = false): Promise<void> {
  const before = (await devicePhotos(page, database)).length;
  await opener.click();
  const view = await expectCameraOpen(page);
  if (plate) await view.getByRole('button', { name: 'Disparar' }).click();
  else {
    await shoot(page, n);
    await view.getByRole('button', { name: 'Concluir fotos' }).click();
  }
  await expect(camera(page)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await devicePhotos(page, database)).length, { timeout: 15_000 }).toBe(before + n);
}

test('@p0 20.3/20.5/20.6-E2E-001 a new relatório prints the tests before the points, keeps VERIFICAÇÕES GERAIS whole, starts every ficha on a page and prints its photos together after CONCLUSÃO', async ({ page }) => {
  test.setTimeout(600_000);
  await resetEmpresaB(account, { standard: true });
  await signIn(page, account.email);
  await expect(page.locator('.shortcut-sub', { hasText: '1 template' })).toBeVisible({ timeout: 30_000 });
  await createProjectFromHome(page);
  const relatorioId = await createRelatorio(page);

  // 20.3: the Sumário rows 8 and 9, and the device's section blocks in that order.
  await expect(sumarioTitles(page).nth(9)).toHaveText('Relatórios dos ensaios');
  await expect(sumarioTitles(page).nth(10)).toHaveText('Pontos de atenção');
  await expect(posBox(page, 'Relatórios dos ensaios')).toHaveValue('8');
  await expect(posBox(page, 'Pontos de atenção')).toHaveValue('9');
  const sections = sortByOrderKey((await liveRows<BlockRow>(page, 'block')).filter((block) => block.location_id === null)).map((block) => block.block_type);
  expect(sections.slice(6, 10)).toEqual(['section_7', 'section_9', 'section_8', 'section_10']);
  // Subir and Descer still move either one.
  await page.getByRole('button', { name: 'Mais opções de Pontos de atenção' }).click();
  await page.getByRole('menuitem', { name: 'Subir' }).click();
  await expect(posBox(page, 'Pontos de atenção')).toHaveValue('8');
  await expect(posBox(page, 'Relatórios dos ensaios')).toHaveValue('9');
  await page.getByRole('button', { name: 'Mais opções de Pontos de atenção' }).click();
  await page.getByRole('menuitem', { name: 'Descer' }).click();
  await expect(posBox(page, 'Pontos de atenção')).toHaveValue('9');
  await expect(posBox(page, 'Relatórios dos ensaios')).toHaveValue('8');

  // Three equipment of Cubículo Enel stay; the office removes the other 91 sheets.
  await syncNow(page);
  const locations = await liveRows<LocationRow>(page, 'location');
  const byId = new Map(locations.map((location) => [location.id, location]));
  const localOf = (id: string): LocationRow => {
    let at = byId.get(id)!;
    while (at.parent_id !== null) at = byId.get(at.parent_id)!;
    return at;
  };
  const sheets = (await liveRows<BlockRow>(page, 'block')).filter((block) => block.location_id !== null);
  const kept = KEPT_TYPES.map((type) => sheets.find((block) => block.block_type === type && localOf(block.location_id!).name === LOCAL)!);
  expect(kept.every((block) => block !== undefined)).toBe(true);
  const removals: OpDraft[] = sheets
    .filter((block) => !kept.includes(block))
    .map((block) => ({ ...officeDraft(account, { relatorioId }, `block/${block.id}/removed_at`, null), kind: 'remove' }));
  expect(removals).toHaveLength(91);
  await pushDrafts(page, database, removals);
  await syncNow(page);
  const disjuntor = kept[1]!;
  const tags = new Map((await liveRows<{ id: string; tag: string; removed_at: string | null }>(page, 'equipment')).map((row) => [row.id, row.tag]));
  const keptTags = kept.map((block) => tags.get(block.equipment_id!)!);

  // The disjuntor: a long plate typed field by field, its plate photo, an NC item with its photo, two test photos.
  await page.goto(`/relatorio/${relatorioId}/ficha/${disjuntor.id}`);
  await expect(page.locator('.sheet-header .sheet-title')).toBeVisible({ timeout: 30_000 });
  for (const key of LONG_FIELDS) {
    const input = page.locator(`#ficha-nameplate [data-field-key="${key}"] input`);
    const value = longValue(key);
    expect(value.length).toBeLessThanOrEqual(200);
    await input.fill(value);
    await input.press('Enter');
    await expect
      .poll(async () => (await readStore<{ path: string; value: unknown }>(page, database, 'outbox')).some((op) => op.path === `sheet/${disjuntor.id}/nameplate/${key}` && op.value === value))
      .toBe(true);
  }
  await shootFrom(page, page.locator('#ficha-nameplate .camera-group').getByRole('button', { name: 'Fotografar placa' }), 1, true);
  const nc = checklistRow(page, NC_ITEM);
  await nc.scrollIntoViewIfNeeded();
  await nc.getByRole('radio', { name: 'Não conforme', exact: true }).click();
  await expect(nc.getByRole('radio', { name: 'Não conforme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await shootFrom(page, nc.getByRole('button', { name: 'Adicionar foto' }), 1);
  await shootFrom(page, page.locator('.sticky-action-bar').getByRole('button', { name: 'Tirar foto', exact: true }), 2);
  const photos = await devicePhotos(page, database);
  const ncPhoto = photos.find((photo) => photo.item_key === NC_ITEM)!;
  expect(ncPhoto).toBeDefined();

  // A point citing the NC photo, written on the office device; Story 22.2: three insulation
  // readings of the contato aberto table in one unit, so its VALORES header carries the unit.
  const pointId = newId();
  const reading = (row: number, raw: string) => officeDraft(account, { relatorioId }, `sheet/${disjuntor.id}/test/isolacao/cell/${row}/0`, { raw, unit: 'GΩ', state: 'measured' });
  await pushDrafts(page, database, [
    reading(0, '4.9'),
    reading(1, '3'),
    reading(2, '2'),
    officeDraft(
      account,
      { relatorioId },
      `point/${pointId}`,
      { id: pointId, relatorio_id: relatorioId, text: `Contatos com desgaste, conforme ${photoToken(ncPhoto.id)}.`, equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null, action: null, priority: null, deadline: null, owner: null },
      'create',
    ),
  ]);

  // Issue revision 1 and read the DOCX and the PDF back.
  await syncNow(page);
  await setParecer(page, relatorioId);
  await page.locator('.sticky-action-bar').getByRole('button', { name: 'Gerar relatório' }).click();
  await expect(exportDialog(page)).toBeVisible();
  await expect(generateButton(page)).toBeEnabled({ timeout: 30_000 });
  await generateButton(page).click();
  await confirmIssue(exportDialog(page), /^Gerar com/);
  await expect(toast(page)).toHaveText('Revisão 1 pronta — DOCX e PDF', { timeout: JOB_TIMEOUT });
  const docx = extractStructure(await downloadBytes(await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'DOCX — abrir no Word' }).click())));
  const pdf = await downloadFrom(page, () => exportDialog(page).getByRole('button', { name: 'PDF — enviar ao cliente' }).click());
  const pages = await pdfPageTexts(new Uint8Array(await downloadBytes(pdf)));

  // Story 20.6 follow-up: no page holds only the header and footer (the cover counts as content).
  expect(pages.length).toBeGreaterThan(3);
  expect(footerOnlyPages(pages, [...docx.header, ...docx.footer]), 'pages holding only the header and footer').toEqual([]);

  // 20.3, DOCX: the headings and the ÍNDICE lines (with their page numbers) in the new order.
  const level1 = docx.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const TESTS = '8 RELATÓRIOS DOS ENSAIOS';
  const POINTS = '9 PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES';
  expect(level1.indexOf(POINTS)).toBe(level1.indexOf(TESTS) + 1);
  const toc = docx.paragraphs.filter((paragraph) => /^\d+(\.\d+)? .*\t\d+$/.test(paragraph));
  const testsLine = toc.findIndex((line) => line.startsWith(`${TESTS}\t`));
  const pointsLine = toc.findIndex((line) => line.startsWith(`${POINTS}\t`));
  expect(testsLine).toBeGreaterThanOrEqual(0);
  expect(pointsLine).toBeGreaterThan(testsLine);
  expect(Number(toc[pointsLine]!.split('\t')[1])).toBeGreaterThan(Number(toc[testsLine]!.split('\t')[1]));

  // 20.3, PDF: the body headings in that order, the ÍNDICE (their first occurrence) too.
  const flat = pages.flat();
  expect(flat.findIndex((text) => text.startsWith(TESTS))).toBeLessThan(flat.findIndex((text) => text.startsWith('9 PONTOS DE ATENÇÃO')));
  const testsPage = lastPageOf(pages, (text) => text.startsWith(TESTS));
  const pointsPage = lastPageOf(pages, (text) => text.startsWith('9 PONTOS DE ATENÇÃO'));
  expect(pointsPage).toBeGreaterThan(testsPage);

  // 20.6: each ficha starts its page; nothing of another ficha or local precedes its title there.
  const starts = keptTags.map((tag) => fichaStart(pages, tag));
  const fichaPages = starts.map((start) => start.page);
  expect(fichaPages.every((at) => at > testsPage)).toBe(true);
  expect(new Set(fichaPages).size).toBe(3);
  for (const [i, start] of starts.entries()) expect(start.before, `${keptTags[i]}'s page`).toEqual([]);
  // 20.3: the points section starts a page after the last ficha, nothing of a ficha before it.
  expect(pointsPage).toBeGreaterThan(Math.max(...fichaPages));
  const pointsItems = pages[pointsPage]!;
  expect(pointsItems.slice(0, pointsItems.findIndex((text) => text.startsWith('9 PONTOS DE ATENÇÃO'))).filter((text) => SHEET_CONTENT_MARKS.includes(text))).toEqual([]);

  // 20.5: the disjuntor's long plate pushes VERIFICAÇÕES GERAIS to the next page, whole.
  const disjuntorPage = fichaPages[1]!;
  const definition = getDefinition('v10', 'cabine_primaria', 'disjuntor_mt');
  const lastItem = `${definition.checklist!.length}. ${definition.checklist!.at(-1)!.label.toLocaleUpperCase('pt-BR')}`;
  const nextFicha = Math.min(...fichaPages.filter((at) => at > disjuntorPage), pointsPage);
  const span = pages.slice(disjuntorPage, nextFicha);
  const bandAt = span.findIndex((items) => items.includes('VERIFICAÇÕES GERAIS'));
  expect(bandAt, 'VERIFICAÇÕES GERAIS moved past the plate page').toBe(1);
  expect(span[bandAt]!, 'the checklist\'s last row on the band\'s page').toContain(lastItem);
  expect(span[0]!).toContain('DADOS DO EQUIPAMENTO');

  // 20.6: the disjuntor's photos together after its CONCLUSÃO: plate, the NC photo, the two test photos.
  const block = span.flat();
  const conclusion = block.lastIndexOf('CONCLUSÃO');
  const imageAt = block.flatMap((text, i) => (/^Imagem \d+[.:]/.test(text) ? [i] : []));
  expect(imageAt).toHaveLength(4);
  expect(imageAt.every((at) => at > conclusion)).toBe(true);
  expect(imageAt.map((at) => Number(/^Imagem (\d+)/.exec(block[at]!)![1]))).toEqual([1, 2, 3, 4]);
  // Story 22.2: no item line under the NC photo any more (the screen still shows it).
  expect(block.some((text) => /^Item \d+ · .+ · NC$/.test(text))).toBe(false);
  // No photo line anywhere else before the points (section 7 holds none, the other fichas none).
  expect(pages.slice(0, pointsPage).flat().filter((text) => /^Imagem \d+[.:]/.test(text))).toHaveLength(4);
  // The point cites the NC photo by the number printed under it.
  expect(pages.slice(pointsPage).flat().join(' ')).toContain('Contatos com desgaste, conforme Imagem 2.');

  // Story 22.2, DOCX: section 9 prints no attribution, no "CRITÉRIO:" line, no criteria line and
  // no item line; the ACEITÁVEL header cell still prints the criterion.
  const body = docx.paragraphs;
  expect(body.filter((text) => /^(Concluída por|Preenchido por|CRITÉRIO:|Item \d+ · )/.test(text))).toEqual([]);
  expect(body.some((text) => text.includes(' · critério '))).toBe(false);
  expect(docx.tables.some((table) => table[1]?.at(-1) === 'ACEITÁVEL' && table[2]?.at(-1) === '>400 MΩ')).toBe(true);
  // The unit once: "VALORES (GΩ)" over bare cells, never "4,9 GΩ".
  const insulation = docx.tables.find((table) => table.some((row) => row.includes('4,9')))!;
  expect(insulation, 'the contato aberto table with its readings').toBeDefined();
  expect(insulation.some((row) => row.includes('VALORES (GΩ)'))).toBe(true);
  expect(insulation.flat().filter((cell) => ['4,9', '3', '2'].includes(cell))).toHaveLength(3);
  expect(docx.tables.flat(2).some((cell) => /\d GΩ$/.test(cell))).toBe(false);
  // Story 22.3: the two test photos share the sheet's caption: the second reads " (2)" before its period.
  const captionOf = (n: number) => body.find((text) => text.startsWith(`Imagem ${n}:`)) ?? body.find((text) => text === `Imagem ${n}.`)!;
  const third = captionOf(3).replace(/^Imagem 3/, '');
  expect(third).toMatch(/^: .+\.$/);
  expect(captionOf(4)).toBe(`Imagem 4${third.replace(/\.$/, ' (2).')}`);
});
