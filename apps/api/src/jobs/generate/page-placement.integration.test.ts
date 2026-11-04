import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { buildSnapshot, layoutSpec, replay, type DocumentLayout, type PrintSheetSubsection } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { convertToPdf } from './libreoffice.ts';
import { checklistTable, fillerParts, nameplateTable, photosPart, sheet, tablePart, withNewSectionOrder, withSheetsSection } from './page-layout.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * Stories 20.3, 20.5 and 20.6 on the PDF LibreOffice makes (`convertToPdf`, the generate
 * job's own conversion), not only on the XML: `docx.ts` notes LibreOffice drops a
 * keep-with-next in one case, so where a page breaks is read off the PDF, page by page.
 *
 * The layouts are the Porto Seguro fixture's with the section blocks a relatório created
 * today carries (the tests before the points) and its sheets section replaced by hand-built
 * subsections, so each case puts a table exactly where it needs it: filler lines push
 * DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS and VERIFICAÇÕES DO LOCAL into the last part of a
 * page, a checklist runs longer than a page, and short fichas follow a local block. The
 * Story 20.6 follow-up (2026-11-04) case ends a ficha's photo rows at the page foot.
 *
 * It needs LibreOffice, which the api image carries and the tools image does not: run it
 * in the api container,
 *   podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/page-placement.integration.test.ts
 * Where no `soffice` is on the PATH (the tools container's `pnpm test:api`) it is skipped.
 */

const sofficeOnPath = (process.env.PATH ?? '').split(delimiter).some((dir) => {
  try {
    accessSync(join(dir, 'soffice'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path (as `pdf-outline.ts`).
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

interface Item {
  str: string;
  /** Distance from the page's bottom edge, in points. */
  y: number;
}

/** Every non-blank text item, trimmed, one list per page (page n at index n - 1), with its height on the page. */
async function pdfPages(pdf: Buffer): Promise<{ height: number; items: Item[] }[]> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages: { height: number; items: Item[] }[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.trim() === '') continue;
        items.push({ str: item.str.trim(), y: item.transform[5] as number });
      }
      pages.push({ height: page.getViewport({ scale: 1 }).height, items });
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

const base = (): DocumentLayout => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  return layoutSpec(withNewSectionOrder(snapshot), { revisionNumber: 1, issuedAt: '2026-09-23T12:00:00.000Z' });
};

async function render(subsections: PrintSheetSubsection[], photos?: ReadonlyMap<string, Buffer>): Promise<{ layout: DocumentLayout; pages: { height: number; items: Item[] }[] }> {
  const layout = withSheetsSection(base(), subsections);
  const docx = await buildDocx(layout, { tocPages: placeholderPages(layout), ...(photos === undefined ? {} : { images: { photos } }) });
  const pdf = await convertToPdf(docx, { jobId: `page-placement-${Date.now()}` });
  return { layout, pages: await pdfPages(pdf) };
}

/** The 0-based pages holding an item that reads `text` exactly. */
const pagesOf = (pages: { items: Item[] }[], text: string): number[] => pages.flatMap((page, n) => (page.items.some((item) => item.str === text) ? [n] : []));
const onePage = (pages: { items: Item[] }[], text: string): number => {
  const found = pagesOf(pages, text);
  expect(found, `"${text}" on exactly one page`).toHaveLength(1);
  return found[0]!;
};
const itemOn = (pages: { items: Item[] }[], page: number, text: string): Item => pages[page]!.items.find((item) => item.str === text)!;

describe.skipIf(!sofficeOnPath)('20.5 and 20.6 page placement on the PDF LibreOffice makes', () => {
  it('a kept-whole table that starts in the last part of a page moves whole, band and every row, to the next page: VERIFICAÇÕES GERAIS, DADOS DO EQUIPAMENTO and VERIFICAÇÕES DO LOCAL', async () => {
    // Each case is its own subsection, so each starts a page (Story 20.6) and its filler
    // places the table the same way whatever came before.
    const { pages } = await render([
      { heading: '8.1 Caso VG', sheets: [sheet('FICHA VG', [...fillerParts(40, 'Enchimento VG'), tablePart(checklistTable('VERIFICAÇÕES GERAIS', 24))])] },
      { heading: '8.2 Caso DE', sheets: [sheet('FICHA DE', [...fillerParts(44, 'Enchimento DE'), tablePart(nameplateTable(90))])] },
      { heading: '8.3 Caso VL', localParts: [...fillerParts(40, 'Enchimento VL'), tablePart(checklistTable('VERIFICAÇÕES DO LOCAL', 27, { groups: 3, label: 'ITEM DO LOCAL' }))], sheets: [] },
    ]);
    const cases = [
      { filler: 'Enchimento VG 40', band: 'VERIFICAÇÕES GERAIS', last: '24. ITEM DE TESTE 24' },
      { filler: 'Enchimento DE 44', band: 'DADOS DO EQUIPAMENTO', last: 'CAMPO 90' },
      { filler: 'Enchimento VL 40', band: 'VERIFICAÇÕES DO LOCAL', last: '27. ITEM DO LOCAL 27' },
    ];
    for (const { filler, band, last } of cases) {
      const fillerPage = onePage(pages, filler);
      // The filler ends in the last part of its page: the table started there would not fit.
      const { height } = pages[fillerPage]!;
      expect(itemOn(pages, fillerPage, filler).y, `${filler} in the lower part of its page`).toBeLessThan(height * 0.45);
      const bandPage = onePage(pages, band);
      const around = (n: number) => pages[n]!.items.slice(-8).map((item) => `${item.str}@${Math.round(item.y)}`).join(' | ');
      expect(bandPage, `${band} moved to the next page; page ${fillerPage + 1} ends: ${around(fillerPage)}`).toBe(fillerPage + 1);
      expect(onePage(pages, last), `${band}: its last row on the band's page`).toBe(bandPage);
    }
  }, 180_000);

  it('a checklist longer than a page splits only at a row boundary, its band and header rows repeated at the top of the next page', async () => {
    const long = (k: number) => `Observação ${k}: contatos com sinais de aquecimento, reaperto e limpeza recomendados na próxima parada programada.`;
    const items = 60;
    const { pages } = await render([{ heading: '8.1 Caso longo', sheets: [sheet('FICHA LONGA', [tablePart(checklistTable('VERIFICAÇÕES GERAIS', items, { observation: long }))])] }]);
    const bandPages = pagesOf(pages, 'VERIFICAÇÕES GERAIS');
    expect(bandPages.length, 'the table spans more than one page').toBeGreaterThan(1);
    for (const page of bandPages.slice(1)) {
      // The repeated rows open the page's body: the band, then the column header.
      const body = pages[page]!.items.map((item) => item.str);
      const at = body.indexOf('VERIFICAÇÕES GERAIS');
      expect(body.slice(at, at + 5), `page ${page + 1}`).toEqual(['VERIFICAÇÕES GERAIS', 'ITEM', 'C', 'NC', 'NA']);
      const firstItem = body.findIndex((text) => /^\d+\. ITEM DE TESTE \d+$/.test(text));
      expect(firstItem, `page ${page + 1}: no item row before the repeated header`).toBeGreaterThan(at);
    }
    // No row splits: every item's label and the start of its observation share one page.
    for (let k = 1; k <= items; k += 1) {
      const label = onePage(pages, `${k}. ITEM DE TESTE ${k}`);
      const observation = pages.findIndex((page) => page.items.some((item) => item.str.startsWith(`Observação ${k}:`)));
      expect(observation, `item ${k}`).toBe(label);
    }
  }, 180_000);

  it('every ficha and every local block starts a page; the points section starts a page after the last ficha', async () => {
    const short = (title: string) => sheet(title, [tablePart(nameplateTable(3)), ...fillerParts(3, `Texto de ${title}`)]);
    const { layout, pages } = await render([
      { heading: '8.1 Local A', localParts: [tablePart(checklistTable('VERIFICAÇÕES DO LOCAL', 4))], sheets: [short('FICHA A1'), short('FICHA A2'), short('FICHA A3')] },
      { heading: '8.2 Local B', sheets: [short('FICHA B1'), short('FICHA B2')] },
    ]);
    const sections = layout.sections.map((section) => `${section.number} ${section.title}`);
    const tests = sections.find((title) => title.startsWith('8 '))!;
    expect(tests).toBe('8 RELATÓRIOS DOS ENSAIOS');
    const testsPage = pagesOf(pages, tests).at(-1)!;
    // The local block shares the tests heading's page; each ficha after it has a page of its own.
    // The ÍNDICE lists the subsection headings too: the body's is the last.
    expect(pagesOf(pages, '8.1 Local A').at(-1)).toBe(testsPage);
    expect(onePage(pages, 'VERIFICAÇÕES DO LOCAL')).toBe(testsPage);
    const fichaPages = ['FICHA A1', 'FICHA A2', 'FICHA A3', 'FICHA B1', 'FICHA B2'].map((title) => onePage(pages, title));
    expect(fichaPages).toEqual([1, 2, 3, 4, 5].map((n) => testsPage + n));
    // The ficha's title is the first thing of section 9 on its page (after the subsection
    // heading for a subsection's first ficha with no local block): nothing before runs on.
    expect(pagesOf(pages, '8.2 Local B').at(-1)).toBe(fichaPages[3]);
    for (const [i, title] of ['FICHA A1', 'FICHA A2', 'FICHA A3', 'FICHA B1', 'FICHA B2'].entries()) {
      const texts = pages[fichaPages[i]!]!.items.map((item) => item.str);
      const before = texts.slice(0, texts.indexOf(title));
      expect(before.filter((text) => text.startsWith('Texto de ') || text.startsWith('CAMPO ') || text === 'DADOS DO EQUIPAMENTO' || text === 'VERIFICAÇÕES DO LOCAL'), title).toEqual([]);
    }
    // Story 20.3: the points section, after the tests, starts its own page after the last ficha.
    // The ÍNDICE names it too: the body's heading is the last.
    const points = pages.findLastIndex((page) => page.items.some((item) => item.str.startsWith('9 PONTOS DE ATENÇÃO')));
    expect(points).toBeGreaterThan(fichaPages.at(-1)!);
    expect(pages[points]!.items.some((item) => item.str.startsWith('Texto de FICHA B2'))).toBe(false);
  }, 180_000);

  it('Story 20.6 follow-up: a ficha whose photo rows end at the page foot is followed by the next ficha on the very next page, with no page of header and footer only', async () => {
    // Each case is a subsection whose first ficha runs filler down its page and ends with one
    // photo row, its photos a pixel taller than the case before, so the sweep walks the row's
    // foot down to the page's (measured: 52 lines and 132 px end it under a point from the foot
    // on this LibreOffice) and past it (the row moves whole to the next page). A short ficha
    // follows each. An opening subsection takes section 8's Heading 1, so every case lays out alike.
    const heights = Array.from({ length: 12 }, (_, k) => 122 + k);
    const photos = new Map<string, Buffer>();
    const subsections: PrintSheetSubsection[] = [{ heading: '8.1 Abertura', sheets: [sheet('FICHA ABERTURA', [tablePart(nameplateTable(3))])] }];
    for (const [k, height] of heights.entries()) {
      for (const side of ['A', 'B']) {
        photos.set(`foto-${k}-${side}`, await sharp({ create: { width: 300, height, channels: 3, background: { r: 200, g: 100, b: 20 } } }).png().toBuffer());
      }
      subsections.push({
        heading: `8.${k + 2} Caso ${k}`,
        sheets: [
          sheet(`FICHA FOTOS ${k}`, [
            tablePart(nameplateTable(3)),
            ...fillerParts(52, `Enchimento ${k}`),
            photosPart([
              { fileId: `foto-${k}-A`, number: 2 * k + 1, caption: `Imagem ${2 * k + 1}: Foto A do caso ${k}.` },
              { fileId: `foto-${k}-B`, number: 2 * k + 2, caption: `Imagem ${2 * k + 2}: Foto B do caso ${k}.` },
            ]),
          ]),
          sheet(`FICHA SEGUINTE ${k}`, [tablePart(nameplateTable(3))]),
        ],
      });
    }
    const { layout, pages } = await render(subsections, photos);

    // No page holds only the header and footer: every page carries something else.
    const chrome = new Set([layout.header.titleLine, layout.header.formLine, layout.footer.companyLine, layout.footer.contactLine].filter((line) => line !== ''));
    const isChrome = (text: string) => chrome.has(text) || /^Página \d+ de \d+$/.test(text);
    const footerOnly = pages.flatMap((page, n) => (page.items.every((item) => isChrome(item.str)) ? [n + 1] : []));
    expect(footerOnly, 'pages holding only the header and footer').toEqual([]);

    let footed = 0;
    for (const k of heights.keys()) {
      const caption = `Imagem ${2 * k + 2}: Foto B do caso ${k}.`;
      const photosPage = onePage(pages, caption);
      const fillerPage = onePage(pages, `Enchimento ${k} 52`);
      // The next ficha's title is on the page right after the photos' last page.
      expect(onePage(pages, `FICHA SEGUINTE ${k}`), `case ${k}: the next ficha right after the photos`).toBe(photosPage + 1);
      if (photosPage !== fillerPage) continue;
      // The sweep reaches the foot: the photo row that still fits ends right above the footer.
      const footer = itemOn(pages, photosPage, layout.footer.companyLine).y;
      if (itemOn(pages, photosPage, caption).y - footer < 20) footed += 1;
    }
    expect(footed, 'at least one case whose photo row ends at the page foot').toBeGreaterThan(0);
  }, 240_000);
});
