import { PAGE_LINE, PRODUTO, sectionHeading, TOC_TITLE, tocLines, type DocumentLayout, type LayoutParagraph, type TocLine } from '@app/domain';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LeaderType,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlignTable,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type IBorderOptions,
} from 'docx';
import sharp from 'sharp';
import { newNumberedLists, NUMBERED_LIST_CONFIG, numberedItem, richRuns, type NumberedLists } from './rich-runs.ts';
import { section10Children } from './sections/section-10.ts';
import { section11Children } from './sections/section-11.ts';
import { section7Children } from './sections/section-7.ts';
import { section8Children } from './sections/section-8.ts';
import { SECTION_9_PARAGRAPH_STYLES, section9Children } from './sections/section-9.ts';
import type { TocPages } from './toc.ts';
import { watermarkPng } from './watermark.ts';

/*
 * Story 4.8 (AD-15): the one place that knows the `docx` library. It renders the kernel's
 * `DocumentLayout` and never composes a printed string of its own: every line, row and
 * heading is the layout's, and the only text written here is the page-number field pair
 * the footer needs. A4 portrait, 1.27 cm margins (720 twips), Arial 11 pt body (Liberation
 * Sans stands in for it inside the api image), Heading 1 for the eleven sections so
 * LibreOffice exports them as the PDF outline the two-pass TOC reads.
 */

/** A4 in twips (11906 x 16838) and the source margin. */
const A4 = { width: 11906, height: 16838 } as const;
const MARGIN_TWIPS = 720;
export const CONTENT_WIDTH_TWIPS = A4.width - 2 * MARGIN_TWIPS;

/** Printed at 96 px per inch, the scale `docx` assumes for an image's `transformation`. */
export const PX_PER_CM = 96 / 2.54;
const LOGO_MAX_HEIGHT_PX = Math.round(3 * PX_PER_CM);
/** The logo takes at most half the header's width: the title and form lines keep the other half. */
const LOGO_MAX_WIDTH_PX = Math.round((CONTENT_WIDTH_TWIPS / 2 / 1440) * 96);
/** Twips per px at the 96 px per inch `docx` assumes (1440 twips per inch). */
const TWIPS_PER_PX = 1440 / 96;
/** Word's default left plus right cell margin (0.19 cm each side), kept around the logo. */
const CELL_MARGINS_TWIPS = 2 * 108;
const COVER_MAX_WIDTH_PX = Math.round((CONTENT_WIDTH_TWIPS / 1440) * 96);
const COVER_MAX_HEIGHT_PX = Math.round(12 * PX_PER_CM);

const BODY_FONT = 'Arial';
const BODY_SIZE = 22; // half-points: 11 pt
/** The footer's size (half-points: 9 pt), carried by its paragraph style too (Epic 4 QA Q13). */
const FOOTER_SIZE = 18;
/**
 * The footer paragraphs' style. A PAGE/NUMPAGES field result has no run of its own to
 * carry a size: LibreOffice (and Word) lay it out with the paragraph's character
 * properties, so the size lives on the style and the paragraph mark, not only the runs.
 */
const FOOTER_STYLE = 'FooterText';

/** What pass 1 prints where a page number is not known yet: fixed width, so pass 2 moves nothing. */
export const TOC_PLACEHOLDER = '00';

export interface DocxImages {
  /** The company logo, `print` variant bytes (PNG or JPEG). */
  logo?: Buffer;
  /** The cover photo, `print` variant bytes. */
  cover?: Buffer;
  /** Story 7.5: the preview's watermark PNG; drawn from `layout.watermark` when absent. */
  watermark?: Buffer;
  /** Stories 7.1/7.2: the photos' `print` variant bytes by file id (section 7, and the sheets' photos). */
  photos?: ReadonlyMap<string, Buffer>;
  /** Story 7.3: each certificate's page images (PNG or JPEG) by certificate file id (section 11). */
  certificates?: ReadonlyMap<string, readonly Buffer[]>;
}

export interface BuildDocxOptions {
  tocPages: TocPages;
  images?: DocxImages;
}

export interface SizedImage {
  data: Buffer;
  type: 'png' | 'jpg';
  width: number;
  height: number;
}

function imageType(data: Buffer): 'png' | 'jpg' {
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8 ? 'jpg' : 'png';
}

/*
 * A-24 (review 2026-09-30): the dimensions sharp read, by image buffer. The job hands every
 * TOC pass the same buffers, so each image's header is read once per job, not once per
 * placement per pass; the cache holds nothing once the job drops its buffers.
 */
const dimensions = new WeakMap<Buffer, Promise<{ width?: number; height?: number } | null>>();

function dimensionsOf(data: Buffer): Promise<{ width?: number; height?: number } | null> {
  let known = dimensions.get(data);
  if (known === undefined) {
    known = sharp(data)
      .metadata()
      .then(
        (meta) => ({ width: meta.width, height: meta.height }),
        () => null,
      );
    dimensions.set(data, known);
  }
  return known;
}

/**
 * The image scaled to fit the box, keeping its aspect (`sharp` reads the dimensions).
 * Bytes sharp cannot read (a corrupt upload) yield null: the document prints without
 * that image rather than failing the revision.
 */
export async function sizedImage(data: Buffer, maxWidth: number, maxHeight: number): Promise<SizedImage | null> {
  const meta = await dimensionsOf(data);
  if (meta === null) return null;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { data, type: imageType(data), width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function image(img: SizedImage): ImageRun {
  return new ImageRun({ type: img.type, data: img.data, transformation: { width: img.width, height: img.height } });
}

export const text = (content: string, options: { bold?: boolean; size?: number } = {}): TextRun =>
  new TextRun({ text: content, bold: options.bold, size: options.size });

const plain = (content: string, options: { bold?: boolean; size?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph =>
  new Paragraph({ children: [text(content, options)], alignment: options.alignment });

const pageBreak = (): Paragraph => new Paragraph({ children: [new PageBreak()] });

const hairline: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: hairline, bottom: hairline, left: hairline, right: hairline };

/** A two-column key/value table over the content width. */
function keyValueTable(rows: readonly { label: string; value: string }[], options: { title?: string; labelWidth: number } = { labelWidth: 3400 }): Table {
  const tableRows: TableRow[] = [];
  if (options.title !== undefined) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            borders,
            children: [plain(options.title, { bold: true, alignment: AlignmentType.CENTER })],
          }),
        ],
      }),
    );
  }
  for (const row of rows) {
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({ borders, width: { size: options.labelWidth, type: WidthType.DXA }, children: [plain(row.label, { bold: true })] }),
          new TableCell({ borders, width: { size: CONTENT_WIDTH_TWIPS - options.labelWidth, type: WidthType.DXA }, children: [plain(row.value)] }),
        ],
      }),
    );
  }
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [options.labelWidth, CONTENT_WIDTH_TWIPS - options.labelWidth],
    rows: tableRows,
  });
}

function sectionParagraph(block: LayoutParagraph, lists: NumberedLists): Paragraph {
  switch (block.kind) {
    case 'heading':
      return new Paragraph({ children: richRuns(block.runs, { bold: true }), spacing: { before: 160, after: 80 } });
    case 'item':
      return new Paragraph({ children: richRuns(block.runs), bullet: { level: 0 }, spacing: { after: 60 } });
    case 'numbered':
      return new Paragraph({ children: richRuns(block.runs), numbering: numberedItem(lists, block.number), spacing: { after: 60 } });
    default:
      return new Paragraph({ children: richRuns(block.runs), spacing: { after: 120 } });
  }
}

/** E7-A4: a level 2 line (section 9's subsections) indents like Word's TOC 2 style, as FO.SERV-03's index. */
const TOC_LEVEL_2_INDENT_TWIPS = 220;

function tocParagraph(line: TocLine, page: number | null): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIPS, leader: LeaderType.DOT }],
    spacing: { after: 80 },
    ...(line.level === 2 ? { indent: { left: TOC_LEVEL_2_INDENT_TWIPS } } : {}),
    children: [text(line.text), text(`\t${page === null ? TOC_PLACEHOLDER : String(page)}`)],
  });
}

/** The watermark image, as wide as the content, floating behind the text at the centre of the page. */
async function watermarkRun(data: Buffer): Promise<ImageRun> {
  const sized = await sizedImage(data, COVER_MAX_WIDTH_PX, COVER_MAX_WIDTH_PX);
  // A preview must never render without its RASCUNHO: fail the job instead.
  if (sized === null) throw new Error('watermark image could not be read');
  return new ImageRun({
    type: 'png',
    data: sized.data,
    transformation: { width: sized.width, height: sized.height },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
      behindDocument: true,
      allowOverlap: true,
      wrap: { type: TextWrappingType.NONE },
    },
  });
}

type HeaderLines = DocumentLayout['header'];

/** Without a logo: the title line (bold, the watermark riding in it) over the form line. */
function plainHeader(lines: HeaderLines, watermark: ImageRun | null): Paragraph[] {
  return [new Paragraph({ children: [...(watermark === null ? [] : [watermark]), text(lines.titleLine, { bold: true })] }), plain(lines.formLine)];
}

/**
 * With a logo (Epic 9 A11): a two-cell borderless table, the logo in the left cell and the
 * title and form lines stacked in the right one, both centred vertically, so both lines sit
 * beside the logo rather than the form line falling under it. A header must end in a
 * paragraph, so a 1 pt empty one follows the table and carries the watermark.
 */
function logoHeader(lines: HeaderLines, logo: SizedImage, watermark: ImageRun | null): (Table | Paragraph)[] {
  const logoWidth = Math.min(CONTENT_WIDTH_TWIPS / 2, Math.ceil(logo.width * TWIPS_PER_PX) + CELL_MARGINS_TWIPS);
  const linesWidth = CONTENT_WIDTH_TWIPS - logoWidth;
  const table = new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: [logoWidth, linesWidth],
    layout: TableLayoutType.FIXED,
    borders: TableBorders.NONE,
    rows: [
      new TableRow({
        children: [
          new TableCell({ width: { size: logoWidth, type: WidthType.DXA }, verticalAlign: VerticalAlignTable.CENTER, children: [new Paragraph({ children: [image(logo)] })] }),
          new TableCell({
            width: { size: linesWidth, type: WidthType.DXA },
            verticalAlign: VerticalAlignTable.CENTER,
            children: [plain(lines.titleLine, { bold: true }), plain(lines.formLine)],
          }),
        ],
      }),
    ],
  });
  const tail = new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, run: { size: 2 }, children: watermark === null ? [] : [watermark] });
  return [table, tail];
}

/** Renders the layout into DOCX bytes. */
export async function buildDocx(layout: DocumentLayout, options: BuildDocxOptions): Promise<Buffer> {
  const logo = options.images?.logo === undefined ? null : await sizedImage(options.images.logo, LOGO_MAX_WIDTH_PX, LOGO_MAX_HEIGHT_PX);
  const cover = options.images?.cover === undefined ? null : await sizedImage(options.images.cover, COVER_MAX_WIDTH_PX, COVER_MAX_HEIGHT_PX);

  // Story 7.5: a preview's RASCUNHO rides in a header paragraph, floating behind the text at
  // the page's centre, so every page carries it and the header's lines do not change.
  const watermark = layout.watermark === null ? null : await watermarkRun(options.images?.watermark ?? (await watermarkPng(layout.watermark)));
  const header = new Header({ children: logo === null ? plainHeader(layout.header, watermark) : logoHeader(layout.header, logo, watermark) });

  // Footer: the company lines that exist, then the page line, all in the footer style.
  const footerParagraph = (children: TextRun[], alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]) =>
    new Paragraph({ style: FOOTER_STYLE, run: { size: FOOTER_SIZE }, alignment, children });
  const footer = new Footer({
    children: [
      ...[layout.footer.companyLine, layout.footer.contactLine].filter((line) => line !== '').map((line) => footerParagraph([text(line, { size: FOOTER_SIZE })])),
      footerParagraph(
        [
          text(PAGE_LINE.before, { size: FOOTER_SIZE }),
          new TextRun({ children: [PageNumber.CURRENT], size: FOOTER_SIZE }),
          text(PAGE_LINE.between, { size: FOOTER_SIZE }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: FOOTER_SIZE }),
        ],
        AlignmentType.RIGHT,
      ),
    ],
  });

  const children: (Paragraph | Table)[] = [];

  // Cover page.
  children.push(new Paragraph({ spacing: { before: 2400, after: 480 } }));
  children.push(plain(layout.cover.title, { bold: true, size: 40, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ spacing: { after: 480 } }));
  children.push(keyValueTable(layout.cover.table.rows, { title: layout.cover.table.title, labelWidth: 3800 }));
  if (cover !== null) {
    children.push(new Paragraph({ spacing: { before: 480 }, alignment: AlignmentType.CENTER, children: [image(cover)] }));
  }
  children.push(pageBreak());

  // Document control page.
  children.push(new Paragraph({ spacing: { after: 240 } }));
  children.push(keyValueTable(layout.documentControl, { labelWidth: 3400 }));
  children.push(pageBreak());

  // Table of contents.
  children.push(new Paragraph({ spacing: { after: 240 } }));
  children.push(plain(TOC_TITLE, { bold: true, size: 28, alignment: AlignmentType.CENTER }));
  children.push(new Paragraph({ spacing: { after: 240 } }));
  for (const line of tocLines(layout)) children.push(tocParagraph(line, options.tocPages.get(line.key) ?? null));
  children.push(pageBreak());

  // Sections. Story 11.4: each numbered list (its item numbered 1 starts one) restarts at 1.
  const lists = newNumberedLists();
  for (const section of layout.sections) {
    // E7-A4: section 9 starts a page from its own heading, so its first sheet never splits
    // across the page section 8 ends on (a break before its first subsection would leave
    // the Heading 1 alone at the foot of that page; LibreOffice keeps no keep-with-next over it).
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: section.kind === 'sheets', children: [text(sectionHeading(section))] }));
    if (section.kind === 'empty') children.push(new Paragraph({ children: [text(section.note)], spacing: { after: 120 } }));
    else if (section.kind === 'section_10') children.push(...section10Children(section, CONTENT_WIDTH_TWIPS, lists));
    else if (section.kind === 'photos') children.push(...(await section7Children(section, options.images?.photos ?? new Map())));
    else if (section.kind === 'points') children.push(...section8Children(section));
    else if (section.kind === 'certificates') children.push(...(await section11Children(section, options.images?.certificates ?? new Map())));
    else if (section.kind === 'sheets') children.push(...(await section9Children(section, options.images?.photos ?? new Map())));
    else for (const block of section.paragraphs) children.push(sectionParagraph(block, lists));
  }

  const document = new Document({
    creator: PRODUTO,
    // Without it the `docx` library writes its own "Un-named" into cp:lastModifiedBy (Q13).
    lastModifiedBy: PRODUTO,
    // Story 11.4: only a layout with a numbered item carries the numbering definition, so a
    // document without one renders byte for byte as before (the golden).
    ...(lists.used ? { numbering: { config: [NUMBERED_LIST_CONFIG] } } : {}),
    styles: {
      default: { document: { run: { font: BODY_FONT, size: BODY_SIZE } } },
      paragraphStyles: [
        {
          id: FOOTER_STYLE,
          name: 'Footer Text',
          basedOn: 'Normal',
          quickFormat: true,
          run: { font: BODY_FONT, size: FOOTER_SIZE },
        },
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: BODY_FONT, size: 28, bold: true },
          paragraph: { spacing: { before: 360, after: 160 }, outlineLevel: 0, keepNext: true },
        },
        {
          // Story 7.1: section 9's subsections ("9.1 Cubículo Enel"), level 2 of the PDF outline.
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: BODY_FONT, size: 24, bold: true },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true },
        },
        ...SECTION_9_PARAGRAPH_STYLES,
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4.width, height: A4.height },
            margin: { top: MARGIN_TWIPS, right: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, header: 360, footer: 360 },
          },
        },
        headers: { default: header },
        footers: { default: footer },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}
