import type { LayoutSectionSheets, PrintCell, PrintPhoto, PrintRow, PrintSheet, PrintTable } from '@app/domain';
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
 * per subsection (a new page before each after the first), each sheet on a new page after
 * its subsection's first, the sheet's title as a grey bar, its tables as native Word tables
 * in 9 pt over the content width whose rows never split across pages, and its photos two per
 * row at half width with their line beneath. A photo whose bytes are missing or unreadable
 * keeps its line and leaves its image cell empty; the document never fails for it.
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
  // The gap after a table (Word joins two tables that no paragraph separates): 3 pt tall.
  { id: SHEET_GAP, name: 'Sheet Gap', basedOn: 'Normal', run: { size: 4 }, paragraph: { spacing: { before: 0, after: 0, line: 60, lineRule: LineRuleType.EXACT } } },
];

const TITLE_TEXT = 20; // half-points: 10 pt
const SHADE_FILL = 'D9D9D9';
const shading = { type: ShadingType.CLEAR, color: 'auto', fill: SHADE_FILL } as const;

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

/** One row: each cell as wide as the columns it spans; a title band or header row stays with the row under it. */
function drawRow(row: PrintRow, widths: readonly number[]): TableRow {
  const keepNext = row.header === true || row.band === true;
  let at = 0;
  return new TableRow({
    cantSplit: true,
    children: row.cells.map((cell) => {
      const span = Math.max(1, cell.span ?? 1);
      const width = widths.slice(at, at + span).reduce((sum, value) => sum + value, 0);
      at += span;
      return new TableCell({
        width: { size: width, type: WidthType.DXA },
        ...(span > 1 ? { columnSpan: span } : {}),
        ...(cell.shade === true ? { shading } : {}),
        children: cellParagraphs(cell, keepNext),
      });
    }),
  });
}

function drawTable(printed: PrintTable): Table {
  const widths = columnWidths(printed.columns);
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: ruledTable,
    margins: CELL_MARGINS,
    rows: printed.rows.map((row) => drawRow(row, widths)),
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

const gap = (): Paragraph => new Paragraph({ style: SHEET_GAP, children: [] });

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
  if (sheet.attribution !== null) out.push(new Paragraph({ style: SHEET_CAPTION, alignment: AlignmentType.RIGHT, keepNext: true, children: [new TextRun(sheet.attribution)] }));
  for (const part of sheet.parts) {
    if (part.kind === 'paragraph') out.push(new Paragraph({ style: SHEET_CAPTION, children: [new TextRun(part.text)] }));
    else out.push(part.kind === 'table' ? drawTable(part.table) : await drawPhotos(part.photos, photos), gap());
  }
  return out;
}

/** Section 9's body under its Heading 1: every subsection's Heading 2 and sheets. */
export async function section9Children(section: LayoutSectionSheets, photos: ReadonlyMap<string, Buffer>): Promise<(Paragraph | Table)[]> {
  const out: (Paragraph | Table)[] = [];
  for (const [k, subsection] of section.subsections.entries()) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, pageBreakBefore: k > 0, children: [new TextRun(subsection.heading)] }));
    for (const [i, sheet] of subsection.sheets.entries()) out.push(...(await sheetChildren(sheet, photos, i > 0)));
  }
  return out;
}
