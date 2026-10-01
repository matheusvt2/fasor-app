import { inflateRawSync } from 'node:zlib';

/*
 * Story 4.8: the structure golden reads a DOCX back without the `docx` library — a
 * minimal zip central-directory reader over Node's zlib and plain string scanning of the
 * WordprocessingML. What comes out is what the AC names: the headings with their level,
 * the tables as text cells, and the header and footer paragraphs, with the PAGE and
 * NUMPAGES fields serialized as `{PAGE}` and `{NUMPAGES}` tokens.
 */

export interface DocxStructure {
  headings: { level: number; text: string }[];
  /** Every table of the body: rows of cells, each cell its paragraphs joined by `\n`. */
  tables: string[][][];
  /** Every paragraph of the body in order (tables included), for assertions on section text. */
  paragraphs: string[];
  header: string[];
  footer: string[];
}

// --- zip -------------------------------------------------------------------------------

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Every entry of the archive by name (stored or deflated; nothing else is written by `docx`). */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 65_535; i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive (no end of central directory)');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL) throw new Error('corrupt central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (buffer.readUInt32LE(localOffset) !== LOCAL) throw new Error(`corrupt local header for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) entries.set(name, Buffer.from(data));
    else if (method === 8) entries.set(name, inflateRawSync(data));
    else throw new Error(`unsupported zip method ${method} for ${name}`);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

// --- WordprocessingML ------------------------------------------------------------------

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

const TOKEN = /<w:instrText(?:\s[^>]*)?>([^<]*)<\/w:instrText>|<w:fldChar\s+w:fldCharType="(\w+)"\s*\/>|<w:fldSimple\s+[^>]*w:instr="([^"]*)"[^>]*>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\s*\/>|<w:br\s*\/>/g;

/** The text of one `<w:p>` element, fields as `{INSTR}` tokens, tabs as `\t`. */
export function paragraphText(xml: string): string {
  let out = '';
  let inFieldResult = false;
  for (const match of xml.matchAll(TOKEN)) {
    const [whole, instr, fieldChar, simpleInstr, text] = match;
    if (instr !== undefined) {
      out += `{${instr.trim().split(/\s+/)[0]}}`;
    } else if (fieldChar !== undefined) {
      if (fieldChar === 'separate') inFieldResult = true;
      if (fieldChar === 'end') inFieldResult = false;
    } else if (simpleInstr !== undefined) {
      out += `{${simpleInstr.trim().split(/\s+/)[0]}}`;
    } else if (text !== undefined) {
      if (!inFieldResult) out += unescapeXml(text);
    } else if (whole.startsWith('<w:tab')) {
      out += '\t';
    } else if (whole.startsWith('<w:br')) {
      out += '\n';
    }
  }
  return out;
}

const PARAGRAPH = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>|<w:p(?:\s[^>]*)?\/>/g;

function paragraphs(xml: string): string[] {
  return [...xml.matchAll(PARAGRAPH)].map((match) => paragraphText(match[0]));
}

function headingLevel(paragraphXml: string): number | null {
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(paragraphXml)?.[1];
  const match = style === undefined ? null : /^Heading(\d)$/.exec(style);
  return match === null ? null : Number(match[1]);
}

const TABLE = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
const ROW = /<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
const CELL = /<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;

function tables(xml: string): string[][][] {
  return [...xml.matchAll(TABLE)].map((table) =>
    [...table[1]!.matchAll(ROW)].map((row) => [...row[1]!.matchAll(CELL)].map((cell) => paragraphs(cell[1]!).join('\n'))),
  );
}

/** The structure the golden compares. */
export function extractStructure(buffer: Buffer): DocxStructure {
  const entries = readZipEntries(buffer);
  const document = entries.get('word/document.xml')?.toString('utf8');
  if (document === undefined) throw new Error('word/document.xml missing');
  const partsNamed = (prefix: string): string[] =>
    [...entries.keys()]
      .filter((name) => new RegExp(`^word/${prefix}\\d*\\.xml$`).test(name))
      .sort()
      .flatMap((name) => paragraphs(entries.get(name)!.toString('utf8')));
  const headings: DocxStructure['headings'] = [];
  for (const match of document.matchAll(PARAGRAPH)) {
    const level = headingLevel(match[0]);
    if (level !== null) headings.push({ level, text: paragraphText(match[0]) });
  }
  return {
    headings,
    tables: tables(document),
    paragraphs: paragraphs(document),
    header: partsNamed('header'),
    footer: partsNamed('footer'),
  };
}
