import { photoRefLabel } from '../photos/numbering.ts';
import { printedSections, sectionHeading, type DocumentLayout, type LayoutSection } from '../print/layout.ts';
import { ACTION_PLAN_COLUMNS } from '../print/section-8.ts';
import type { PrintRow, PrintSheet } from '../print/section-9.ts';
import { isRelatorioSectionType } from '../relatorio/instantiate.ts';
import { screenLabel } from '../relatorio/screen-label.ts';
import { SUMARIO_TITLES } from '../relatorio/sumario.ts';
import { blockTypeLabel } from '../relatorio/tree.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import type { AuditTarget } from './schema.ts';

/*
 * Story 13.8 (AI-3): the assembled relatório as the audit sends it, built from the kernel's
 * print layout (`layoutSpec`), so the model reads what the document would print. Text and
 * values only: section texts, the sheets' tables with their verdicts, readings, observations
 * and conclusions, the parecer and its bullets, the photo captions and the point rows. Never
 * an image, a file key or a URL: a photo is its "Imagem N" line, and its id appears only
 * inside its ref.
 *
 * Every line the model may point at starts with its ref in brackets: `[section:<n>]` (a
 * printed section, n its printed number), `[sheet:<blockId>]` (a sheet), `[row:<blockId>:
 * <part>:<row>]` (a row of a sheet's table, by its part and row index in the layout) and
 * `[photo:<fileId>]` (a photo line). The refs come back with the kernel's label of each and
 * where its "Ver" goes; the model may cite only those (`validateAuditFindings`).
 *
 * The text is capped at `AUDIT_INPUT_MAX_CHARS` (about one US cent of Haiku 4.5 input), so
 * the sections go in the order the four kinds need them (`AUDIT_SECTION_ORDER`, by FO.SERV-03
 * section): the parecer (10), the points (8), the photo captions (7) and the certificates
 * (11), then the sheets (9), then every other section (the fixed texts 1 to 6) in print
 * order. A long relatório loses its boilerplate and its last sheets, never its parecer. A cut
 * text ends with `AUDIT_TRUNCATED_MARKER`, and a ref whose line was cut is not offered.
 */

/** The most characters one audit sends (about 12k tokens: one US cent of Claude Haiku 4.5 input). */
export const AUDIT_INPUT_MAX_CHARS = 48_000;

/** The line that closes a cut text, so the model knows the rest of the relatório was not sent. */
export const AUDIT_TRUNCATED_MARKER = '[texto truncado: o restante do relatório não foi enviado]';

/** What a row label keeps of its first cell. */
const ROW_LABEL_MAX = 60;

/** The FO.SERV-03 sections sent first, in this order; every other section follows in print order. */
export const AUDIT_SECTION_ORDER: readonly number[] = [10, 8, 7, 11, 9];

/** One ref the model may cite: its id as written in the text, the kernel's label and where "Ver" goes. */
export interface AuditRef {
  id: string;
  label: string;
  target: AuditTarget;
}

export interface AuditInput {
  text: string;
  refs: AuditRef[];
  truncated: boolean;
}

interface Line {
  text: string;
  ref?: AuditRef;
}

const SEP = ' | ';
const DASH = '-';

/** "Seção 10 · Conclusão e parecer": a printed section by its number and Sumário title. */
export function auditSectionLabel(number: number, rowKey: string): string {
  const title = isRelatorioSectionType(rowKey) ? SUMARIO_TITLES[rowKey] : rowKey;
  return `Seção ${number} · ${title}`;
}

/** "Chave seccionadora SEC-C01": the sheet's type as the screen names it, then its TAG. */
function sheetLabelOf(snapshot: RelatorioSnapshot, sheet: PrintSheet): string {
  const block = snapshot.blocks.find((row) => row.id === sheet.blockId);
  if (block === undefined) return screenLabel(sheet.title);
  const tag = block.equipment_id === null ? '' : (snapshot.equipment.find((row) => row.id === block.equipment_id)?.tag.trim() ?? '');
  const type = blockTypeLabel(block.seed_version, block.block_type);
  return tag === '' ? type : `${type} ${tag}`;
}

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
}

/** A data row worth a line: a single-cell row (a text), or one with a value beyond its first cell. */
function rowHasValues(row: PrintRow): boolean {
  if (row.cells.length <= 1) return (row.cells[0]?.text.trim() ?? '') !== '';
  return row.cells.slice(1).some((cell) => {
    const text = cell.text.trim();
    return text !== '' && text !== DASH;
  });
}

function sheetLines(snapshot: RelatorioSnapshot, sheet: PrintSheet, photoRefs: Map<string, AuditRef>): Line[] {
  const sheetLabel = sheetLabelOf(snapshot, sheet);
  const target: AuditTarget = { kind: 'sheet', blockId: sheet.blockId };
  const lines: Line[] = [{ text: `[sheet:${sheet.blockId}] ${sheet.title}`, ref: { id: `sheet:${sheet.blockId}`, label: sheetLabel, target } }];
  sheet.parts.forEach((part, p) => {
    if (part.kind === 'paragraph') {
      lines.push({ text: `  ${part.text}` });
      return;
    }
    if (part.kind === 'photos') {
      for (const photo of part.photos) lines.push(photoLine(photo.fileId, photo.number, photo.caption, photoRefs));
      return;
    }
    part.table.rows.forEach((row, r) => {
      const texts = row.cells.map((cell) => cell.text.trim());
      if (row.band === true) {
        lines.push({ text: `  == ${texts.join(' ')} ==` });
        return;
      }
      if (row.header === true) {
        lines.push({ text: `  # ${texts.join(SEP)}` });
        return;
      }
      if (!rowHasValues(row)) return;
      const id = `row:${sheet.blockId}:${p}:${r}`;
      const label = auditRowLabel(sheetLabel, texts[0] ?? '', r);
      lines.push({ text: `  [${id}] ${texts.join(SEP)}`, ref: { id, label, target } });
    });
  });
  return lines;
}

/** Review F-10: a first cell that is only placeholder dashes ("-", "–", "—") or blank names nothing. */
const PLACEHOLDER_CELL = /^[\s\-\u2013\u2014]*$/;

/**
 * A printed row's finding label: the sheet and the row's first printed cell, or "linha N"
 * (1-based) when that cell is empty or only a placeholder dash (review F-10).
 */
export function auditRowLabel(sheetLabel: string, firstCell: string, rowIndex: number): string {
  const first = firstCell.trim();
  return PLACEHOLDER_CELL.test(first) ? `${sheetLabel} · linha ${rowIndex + 1}` : `${sheetLabel} · ${clip(screenLabel(first), ROW_LABEL_MAX)}`;
}

/** One photo line, its ref offered once however often the photo prints (section 7 and its sheet). */
function photoLine(fileId: string, number: number, caption: string, photoRefs: Map<string, AuditRef>): Line {
  const id = `photo:${fileId}`;
  const known = photoRefs.get(id);
  const ref = known ?? { id, label: photoRefLabel(number), target: { kind: 'photos' as const } };
  if (known === undefined) photoRefs.set(id, ref);
  return { text: `  [${id}] ${caption}`, ref };
}

function sectionLines(snapshot: RelatorioSnapshot, section: LayoutSection, rowKey: string, photoRefs: Map<string, AuditRef>): Line[] {
  const id = `section:${section.number}`;
  const lines: Line[] = [
    {
      text: `[${id}] ${sectionHeading(section)}`,
      ref: { id, label: auditSectionLabel(section.number, rowKey), target: { kind: 'section', rowKey } },
    },
  ];
  switch (section.kind) {
    case 'text':
      for (const paragraph of section.paragraphs) {
        const prefix = paragraph.kind === 'item' ? '- ' : paragraph.kind === 'numbered' ? `${paragraph.number ?? ''}. ` : '';
        lines.push({ text: `${prefix}${paragraph.text}` });
      }
      break;
    case 'empty':
      lines.push({ text: section.note });
      break;
    case 'section_10':
      lines.push({ text: `PARECER: ${section.parecer.title}` });
      if (section.parecer.text !== null) lines.push({ text: section.parecer.text });
      for (const bullet of section.bullets) lines.push({ text: `- ${bullet.text}` });
      break;
    case 'photos':
      for (const photo of section.photos) {
        const caption = `${photo.label}${photo.caption ?? ''}${photo.itemLine === null ? '' : ` (${photo.itemLine})`}`;
        lines.push(photoLine(photo.fileId, photo.number, caption, photoRefs));
      }
      break;
    case 'points':
      if (section.table.length === 0) {
        for (const bullet of section.bullets) lines.push({ text: `- ${bullet}` });
        break;
      }
      lines.push({ text: `# ${ACTION_PLAN_COLUMNS.join(SEP)}` });
      for (const row of section.table) {
        lines.push({ text: [row.number, row.point, row.local, row.priority, row.deadline, row.action, row.owner, row.images].join(SEP) });
      }
      break;
    case 'certificates':
      // Calibration certificates print as page images: nothing here is text to compare.
      break;
    case 'sheets':
      for (const subsection of section.subsections) {
        lines.push({ text: subsection.heading });
        for (const sheet of subsection.sheets) lines.push(...sheetLines(snapshot, sheet, photoRefs));
      }
      break;
  }
  return lines;
}

/**
 * The audit's text and the refs it offers, from the layout of `snapshot` (`layoutSpec`, a
 * draft). Pure: the same snapshot and layout give the same text, refs and order.
 */
export function auditInput(layout: DocumentLayout, snapshot: RelatorioSnapshot, maxChars: number = AUDIT_INPUT_MAX_CHARS): AuditInput {
  // The FO.SERV-03 section each printed (positional) section is, for its Sumário row.
  const printed = printedSections(snapshot);
  const photoRefs = new Map<string, AuditRef>();
  const sectionOf = (section: LayoutSection): number => printed[section.number - 1]?.section ?? section.number;
  const rowKeyOf = (section: LayoutSection): string => `section_${sectionOf(section)}`;
  const rank = (section: LayoutSection): number => {
    const at = AUDIT_SECTION_ORDER.indexOf(sectionOf(section));
    return at === -1 ? AUDIT_SECTION_ORDER.length : at;
  };
  const ordered = layout.sections.map((section, index) => ({ section, index })).sort((a, b) => rank(a.section) - rank(b.section) || a.index - b.index).map(({ section }) => section);
  const lines = ordered.flatMap((section) => sectionLines(snapshot, section, rowKeyOf(section), photoRefs));

  const out: string[] = [];
  const refs = new Map<string, AuditRef>();
  let length = 0;
  let truncated = false;
  const budget = maxChars - AUDIT_TRUNCATED_MARKER.length - 1;
  for (const line of lines) {
    const cost = line.text.length + (out.length === 0 ? 0 : 1);
    if (length + cost > budget) {
      truncated = true;
      break;
    }
    out.push(line.text);
    length += cost;
    if (line.ref !== undefined && !refs.has(line.ref.id)) refs.set(line.ref.id, line.ref);
  }
  if (truncated) out.push(AUDIT_TRUNCATED_MARKER);
  return { text: out.join('\n'), refs: [...refs.values()], truncated };
}
