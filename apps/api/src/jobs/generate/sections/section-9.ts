import type { LayoutSectionSheets, PrintCell, PrintPhoto, PrintRow, PrintSheet, PrintTable, SheetPart } from '@app/domain';
import {
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  LineRuleType,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type IBorderOptions,
  type IParagraphStyleOptions,
} from 'docx';
import { CONTENT_WIDTH_TWIPS, image, sizedImage } from '../docx.ts';

/*
 * Story 7.1 (AD-15), Story 7.2 AC2: draws section 9 from the kernel's `LayoutSectionSheets`
 * (`packages/domain/src/print/section-9.ts`). Every printed string is the layout's; this
 * module only decides widths, borders, shading, spans, images and page breaks: a Heading 2
 * per subsection, every ficha and every local block on a new page (Story 20.6, the rule on
 * `section9Children`), the sheet's title as a grey bar, its tables as native Word tables in
 * 9 pt over the content width whose rows never split across pages, and its photos two per
 * row at half width with their line beneath. A photo whose bytes are missing or unreadable
 * keeps its line and leaves its image cell empty; the document never fails for it. Story 22.2:
 * no attribution line under the title bar and no item line under a photo.
 *
 * Story 20.5 (FR-68): DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS and VERIFICAÇÕES DO LOCAL
 * (`table.keepWhole`) never start on one page and end on the next: every row but the last
 * keeps with the next, and their band and header rows repeat when one taller than a page
 * splits (`drawTable`).
 *
 * Story 14.2: a painel subsection (`subsection.painel`) is not a Heading 2 but a band, bold
 * white on dark grey (`.pp-painel` of `key-print-section-9.html`), so it is no line of the
 * ÍNDICE and no entry of the PDF outline. A subsection may hold no sheet (that band over its
 * type groups, or a local whose sheets all sit in painéis): its heading or band is drawn
 * alone, kept with what follows, and the subsection after it does not start a new page.
 *
 * Story 14.4: a subsection may carry the local's own parts (`subsection.localParts`: SE,
 * AMBIENTE DE ENSAIO, VERIFICAÇÕES DO LOCAL and the site items' photos). They are drawn right
 * under the subsection's heading and before its first sheet, as `key-print-section-9.html`
 * places them, with the tables and photo rows of a sheet. A group row of the site table
 * (`row.group`) is one cell across the table on `F0F0F0` (`.pt-group`), kept with the row
 * under it. Story 20.6: a local block starts its page with its heading, and whatever follows
 * it (its first sheet, its painel's band, the next local) starts a new page.
 *
 * Story 22.3 (FR-68): a table the kernel marks `keepRows` keeps every row but its last with
 * the next (no header repeat), and a part marked `keepWithNext` keeps its last row, or its
 * paragraph, and the gap after it with the next part. Every sheet starts a page, so a sheet
 * that fits stays whole on it, and a taller one breaks only between parts the kernel left
 * free, CONCLUSÃO always with the part before it; the photo block stays free to break.
 *
 * Story 20.6 follow-up (2026-11-04): the empty gap paragraph that keeps two tables apart is
 * drawn only between parts, never after a sheet's or a local's last part, where it spilled
 * onto a blank page of its own before the next ficha's page break (`partsChildren`).
 *
 * Borders, cell margins and the text size live on the table and on paragraph styles, not on
 * every cell and run: 94 sheets are tens of thousands of cells, and the XML each one carries
 * is what the `docx` library and LibreOffice spend their time on.
 *
 * `docx.ts` imports this module and this module imports `docx.ts`'s page width and image
 * helpers: they are read only inside functions, never while the modules load.
 */

const SHEET_TEXT = 'SheetText';
const SHEET_CAPTION = 'SheetCaption';
const SHEET_GAP = 'SheetGap';

/** The paragraph styles section 9 draws with, registered by `docx.ts` beside its own. */
export const SECTION_9_PARAGRAPH_STYLES: readonly IParagraphStyleOptions[] = [
  { id: SHEET_TEXT, name: 'Sheet Text', basedOn: 'Normal', run: { size: 18 }, paragraph: { spacing: { before: 0, after: 0 } } },
  { id: SHEET_CAPTION, name: 'Sheet Caption', basedOn: 'Normal', run: { size: 16 }, paragraph: { spacing: { before: 20, after: 40 } } },
  // The gap after a table that another part follows (Word joins two tables that no paragraph separates): 3 pt tall.
  { id: SHEET_GAP, name: 'Sheet Gap', basedOn: 'Normal', run: { size: 4 }, paragraph: { spacing: { before: 0, after: 0, line: 60, lineRule: LineRuleType.EXACT } } },
];

const TITLE_TEXT = 20; // half-points: 10 pt
const SHADE_FILL = 'D9D9D9';
const shading = { type: ShadingType.CLEAR, color: 'auto', fill: SHADE_FILL } as const;
/** Story 14.4: a group row inside a table, `.pt-group` of the print mock: bold on `F0F0F0`. */
export const GROUP_ROW_FILL = 'F0F0F0';
const groupShading = { type: ShadingType.CLEAR, color: 'auto', fill: GROUP_ROW_FILL } as const;
/** Story 14.2: the painel band, `.pp-painel` of the print mock: 11 pt bold white on `404040`. */
const PAINEL_BAND_TEXT = 22;
export const PAINEL_BAND_FILL = '404040';
export const PAINEL_BAND_COLOR = 'FFFFFF';
const painelShading = { type: ShadingType.CLEAR, color: 'auto', fill: PAINEL_BAND_FILL } as const;

const rule: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '404040' };
const ruledTable = { top: rule, bottom: rule, left: rule, right: rule, insideHorizontal: rule, insideVertical: rule };
const blank: IBorderOptions = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const unruledTable = { top: blank, bottom: blank, left: blank, right: blank, insideHorizontal: blank, insideVertical: blank };
const CELL_MARGINS = { top: 15, bottom: 15, left: 70, right: 70 };

/** A photo's box: half the content width, 7 cm tall at most (FO.SERV-03 prints about 8 × 6 cm), at 96 px per inch. */
const PHOTO_MAX_HEIGHT_PX = Math.round((7 / 2.54) * 96);

const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

/** The column weights as twips over the content width; the last column absorbs the rounding. */
function columnWidths(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (weights.length === 0 || total <= 0) return [CONTENT_WIDTH_TWIPS];
  const widths = weights.map((weight) => Math.floor((weight / total) * CONTENT_WIDTH_TWIPS));
  const last = widths.length - 1;
  widths[last] = widths[last]! + CONTENT_WIDTH_TWIPS - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

/** A cell's text, one paragraph per line, in the sheet text style. */
function cellParagraphs(cell: PrintCell, keepNext: boolean): Paragraph[] {
  const align = cell.align === 'center' || cell.align === 'right' ? { alignment: ALIGN[cell.align] } : {};
  return cell.text.split('\n').map(
    (line) =>
      new Paragraph({
        style: SHEET_TEXT,
        ...align,
        ...(keepNext ? { keepNext: true } : {}),
        children: line === '' ? [] : [new TextRun(cell.bold === true ? { text: line, bold: true } : line)],
      }),
  );
}

/**
 * One row: each cell as wide as the columns it spans; a title band, a header row or a group
 * row stays with the row under it, and so does every row but the last of a table kept whole
 * (`keepNext`). A leading band or header row of a table kept whole repeats at the top of the
 * next page when the table, taller than a page, has to split (`tableHeader`).
 */
function drawRow(row: PrintRow, widths: readonly number[], options: { keepNext: boolean; tableHeader: boolean }): TableRow {
  const keepNext = options.keepNext || row.header === true || row.band === true || row.group === true;
  let at = 0;
  return new TableRow({
    cantSplit: true,
    ...(options.tableHeader ? { tableHeader: true } : {}),
    children: row.cells.map((cell) => {
      const span = Math.max(1, cell.span ?? 1);
      const width = widths.slice(at, at + span).reduce((sum, value) => sum + value, 0);
      at += span;
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        ...(span > 1 ? { columnSpan: span } : {}),
        ...(row.group === true ? { shading: groupShading } : cell.shade === true ? { shading } : {}),
        children: cellParagraphs(cell, keepNext),
      });
    }),
  });
}

/** How many rows lead the table as its band and header rows (contiguous from the top). */
function leadingRows(rows: readonly PrintRow[]): number {
  let n = 0;
  while (n < rows.length && (rows[n]!.band === true || rows[n]!.header === true)) n += 1;
  return n;
}

/**
 * A table of the layout. Story 20.5: a table the kernel keeps whole (`keepWhole`) keeps
 * every row but its last with the next, so LibreOffice and Word move it whole to the next
 * page when it does not fit; only one taller than a page splits, at a row boundary (every
 * row is `cantSplit`), with its band and header rows repeated on the next page. A leading
 * band and header block that is the whole table (no body row) repeats nothing. Story 22.3:
 * a `keepRows` table keeps every row but its last with the next too, with no header repeat,
 * and `withNext` (the part's `keepWithNext`) keeps its last row with what follows.
 */
function drawTable(printed: PrintTable, withNext = false): Table {
  const widths = columnWidths(printed.columns);
  const whole = printed.keepWhole === true;
  const kept = whole || printed.keepRows === true;
  const last = printed.rows.length - 1;
  const lead = whole ? leadingRows(printed.rows) : 0;
  const header = lead > 0 && lead < printed.rows.length ? lead : 0;
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: ruledTable,
    margins: CELL_MARGINS,
    rows: printed.rows.map((row, i) => drawRow(row, widths, { keepNext: (kept && i < last) || (withNext && i === last), tableHeader: i < header })),
  });
}

/** Photos two per row, each at half width with its line beneath; a missing or unreadable image leaves its cell empty. */
async function drawPhotos(photos: readonly PrintPhoto[], bytes: ReadonlyMap<string, Buffer>): Promise<Table> {
  const half = Math.floor(CONTENT_WIDTH_TWIPS / 2);
  const maxWidthPx = Math.floor(((half - CELL_MARGINS.left - CELL_MARGINS.right) / 1440) * 96);
  const cell = (children: Paragraph[]) => new TableCell({ width: { size: half, type: WidthType.DXA }, children });
  const cells = await Promise.all(
    photos.map(async (photo) => {
      const data = bytes.get(photo.fileId);
      const sized = data === undefined ? null : await sizedImage(data, maxWidthPx, PHOTO_MAX_HEIGHT_PX);
      return cell([
        new Paragraph({ style: SHEET_TEXT, alignment: AlignmentType.CENTER, keepNext: true, children: sized === null ? [] : [image(sized)] }),
        new Paragraph({ style: SHEET_CAPTION, alignment: AlignmentType.CENTER, children: [new TextRun(photo.caption)] }),
      ]);
    }),
  );
  const rows: TableRow[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(new TableRow({ cantSplit: true, children: [cells[i]!, cells[i + 1] ?? cell([new Paragraph({ style: SHEET_TEXT, children: [] })])] }));
  }
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [half, CONTENT_WIDTH_TWIPS - half],
    layout: TableLayoutType.FIXED,
    borders: unruledTable,
    margins: CELL_MARGINS,
    rows,
  });
}

const gap = (keepNext: boolean): Paragraph => new Paragraph({ style: SHEET_GAP, ...(keepNext ? { keepNext: true } : {}), children: [] });

async function sheetChildren(sheet: PrintSheet, photos: ReadonlyMap<string, Buffer>, newPage: boolean): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [
    new Paragraph({
      pageBreakBefore: newPage,
      keepNext: true,
      alignment: AlignmentType.CENTER,
      shading,
      border: { top: rule, bottom: rule, left: rule, right: rule },
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: sheet.title, bold: true, size: TITLE_TEXT })],
    }),
  ];
  out.push(...(await partsChildren(sheet.parts, photos)));
  return out;
}

/**
 * The parts of a sheet, or of a local (Story 14.4), in order: a paragraph, or a table or
 * photo rows followed by the gap when another part follows. Story 20.6 follow-up
 * (2026-11-04): the last part takes no gap. What follows a sheet or a local is a paragraph
 * (the next title bar, a Heading 2, a painel band, a Heading 1) or, when the tests section
 * was moved to the end of a relatório without sections 10 and 11, the document's end, so
 * Word never joins that table to another; and a trailing empty paragraph after photo rows
 * that end at the page foot spilled onto a page of its own before the next ficha's page break.
 */
async function partsChildren(parts: readonly SheetPart[], photos: ReadonlyMap<string, Buffer>): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const [i, part] of parts.entries()) {
    // Story 22.3: a part kept with the next keeps its last row (or its paragraph) and its gap with it.
    const withNext = part.keepWithNext === true;
    if (part.kind === 'paragraph') {
      out.push(new Paragraph({ style: SHEET_CAPTION, ...(withNext ? { keepNext: true } : {}), children: [new TextRun(part.text)] }));
      continue;
    }
    out.push(part.kind === 'table' ? drawTable(part.table, withNext) : await drawPhotos(part.photos, photos));
    if (i < parts.length - 1) out.push(gap(withNext));
  }
  return out;
}

/** Story 14.2: a painel's band over its sheets (or over its type groups): never a heading, so never in the ÍNDICE. */
function painelBand(text: string, newPage: boolean): Paragraph {
  return new Paragraph({
    pageBreakBefore: newPage,
    keepNext: true,
    shading: painelShading,
    spacing: { before: 120, after: 80 },
    indent: { left: 80 },
    children: [new TextRun({ text, bold: true, color: PAINEL_BAND_COLOR, size: PAINEL_BAND_TEXT })],
  });
}

/**
 * Section 9's body under its Heading 1: every subsection's Heading 2 (a painel's band
 * instead), the local's own parts when it carries them (Story 14.4), and its sheets.
 * Story 20.6 (FR-68): every ficha and every local block starts a page, the break on the
 * first heading that introduces it, so a heading never sits alone at a page foot:
 * - a subsection starts a new page unless it is the first (it follows the section's own
 *   Heading 1, which already starts a page) or the one before it drew only its heading
 *   (a heading or band drawn alone keeps with what follows, on the same page);
 * - a sheet starts a new page unless its subsection's heading is all that precedes it
 *   (it is the subsection's first and the subsection drew no local part).
 */
export async function section9Children(section: LayoutSectionSheets, photos: ReadonlyMap<string, Buffer>): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const [k, subsection] of section.subsections.entries()) {
    const previous = k > 0 ? section.subsections[k - 1]! : null;
    // Story 20.6: a subsection starts a page when the one before it drew anything beyond its heading.
    const newPage = previous !== null && (previous.sheets.length > 0 || (previous.localParts?.length ?? 0) > 0);
    out.push(
      subsection.painel === true
        ? painelBand(subsection.heading, newPage)
        : new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: newPage, children: [new TextRun(subsection.heading)] }),
    );
    const localParts = subsection.localParts ?? [];
    if (localParts.length > 0) out.push(...(await partsChildren(localParts, photos)));
    // Story 20.6: a sheet starts a page unless only its subsection's heading precedes it.
    for (const [i, sheet] of subsection.sheets.entries()) out.push(...(await sheetChildren(sheet, photos, i > 0 || localParts.length > 0)));
  }
  return out;
}
