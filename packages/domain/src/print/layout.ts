import { DISPLAY_TIME_ZONE, formatServiceDates } from '../format/datetime.ts';
import { empresaFooterLine, empresaFormLine } from '../registry/empresa.ts';
import { SECTION_BLOCK_TYPES, type SectionBlockType } from '../schemas/block-config.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { relatorioSectionNumber } from '../relatorio/instantiate.ts';
import { sectionBlocks } from '../relatorio/sumario.ts';
import { getSeed, sectionText, type SectionVariable } from '../seed/definitions.ts';
import type { TextBlock } from '../seed/schema.ts';
import { sectionNumber } from '../templates/compose.ts';
import { resolveSectionText } from '../templates/section-text.ts';
import { documentControlRows, type DocumentControlRow } from './document-control.ts';

/*
 * Story 4.8 (AD-15): the layout spec of the printed relatório. Pure data: what prints, in
 * which order, with which strings — the header and footer lines, the cover, the document
 * control page, the static table of contents and the sections. `apps/api/src/jobs/generate`
 * renders it with the `docx` library and never composes a string of its own. The two
 * generation dates live only in `documentControl` ("Data de emissão") and the revision
 * line, so a golden comparison can mask them (TC-7).
 *
 * The sections are the relatório's live section blocks in `order_key` order, numbered by
 * position, exactly as the Sumário lists them (Stories 4.1/4.3: removed, moved, duplicated
 * and added sections print as the Sumário shows them). A snapshot without section blocks
 * (a relatório older than them, the fixtures) prints the seed's eleven sections in
 * FO.SERV-03 order. A block's own `config.section_text` (the template's text, later Story
 * 4.7's per-relatório edit) wins over the seed default at the relatório's `seed_version`,
 * which is resolved per `TextBlock` so paragraphs, items and headings keep their kind.
 * Sections 7, 8, 9 and 11 print only their heading and a note until Epics 6 and 7.
 */

/** What sections 7, 8, 9 and 11 print under their heading until Epics 6 and 7 fill them. */
export const EMPTY_SECTION_NOTE = '(sem conteúdo nesta revisão)';

/** The title of the table of contents page, verbatim from FO.SERV-03. */
export const TOC_TITLE = 'ÍNDICE';

/** The footer's page line: "Página X de Y", with the two fields the renderer fills. */
export const PAGE_LINE = { before: 'Página ', between: ' de ' } as const;

export interface LayoutParagraph {
  kind: TextBlock['kind'];
  text: string;
}

export interface LayoutSectionText {
  number: number;
  title: string;
  kind: 'text';
  paragraphs: LayoutParagraph[];
}

export interface LayoutSectionEmpty {
  number: number;
  title: string;
  kind: 'empty';
  note: string;
}

export type LayoutSection = LayoutSectionText | LayoutSectionEmpty;

export interface TocEntry {
  number: number;
  title: string;
}

export interface DocumentLayout {
  page: { size: 'A4'; marginsCm: number };
  header: { logoFileId: string | null; titleLine: string; formLine: string };
  footer: { companyLine: string; contactLine: string };
  cover: {
    title: string;
    table: { title: string; rows: DocumentControlRow[] };
    coverPhotoFileId: string | null;
  };
  documentControl: DocumentControlRow[];
  toc: TocEntry[];
  sections: LayoutSection[];
}

export interface LayoutInputs {
  revisionNumber: number;
  /** The generation instant (UTC ISO): the "Data de emissão" and the date the seed text is in force. */
  issuedAt: string;
  /** Overrides the date the seed text is chosen for (defaults to `issuedAt`). */
  sectionTextAt?: string;
  /** See `documentControlRows`. */
  art?: string | null;
}

const calendarDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The São Paulo calendar date (`YYYY-MM-DD`) of an instant; an instant that does not parse selects the latest seeded text. */
function dateInForce(iso: string): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '9999-12-31' : calendarDate.format(new Date(time));
}

function present(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  return value;
}

/** The section variables of a relatório, only those with a value (AD-15's inputs of `resolveSectionText`). */
export function sectionInputs(snapshot: RelatorioSnapshot): Partial<Record<SectionVariable, string>> {
  const { setup } = snapshot.relatorio;
  const inputs: Partial<Record<SectionVariable, string>> = {};
  const set = (name: SectionVariable, value: string | null | undefined) => {
    const text = present(value);
    if (text !== undefined) inputs[name] = text;
  };
  set('cliente', snapshot.client?.name);
  // A blank `local` falls back to the project's site, as an unset one does.
  set('obra', present(setup.local) ?? snapshot.project?.site);
  set('datas', formatServiceDates(setup.service_start, setup.service_end));
  set('escopo', setup.atividade);
  set('responsavel', snapshot.responsible?.name);
  set('empresa_executora', snapshot.empresa?.name);
  return inputs;
}

/** The seed's text blocks of a section in force on `date`, or null when the seed carries none for it. */
function seededBlocks(seedVersion: string, section: number, date: string): readonly TextBlock[] | null {
  const seeded = getSeed(seedVersion, 'cabine_primaria').sections.some(
    (entry) => entry.section === section && entry.effective_from <= date && entry.blocks !== null,
  );
  return seeded ? sectionText(seedVersion, section, date) : null;
}

/** The section block type of a FO.SERV-03 section number, or null for 7 and 9 (never composed as a block). */
function sectionType(section: number): SectionBlockType | null {
  return SECTION_BLOCK_TYPES.find((type) => sectionNumber(type) === section) ?? null;
}

/** The eleven FO.SERV-03 sections in order, from the seed's titles. */
function sectionNumbers(seedVersion: string): number[] {
  return Object.keys(getSeed(seedVersion, 'cabine_primaria').section_titles)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * A section's own flat text (`config.section_text`, the shape `flattenSectionText`
 * writes) as printable paragraphs: blank-line-separated chunks, the first line of a chunk
 * a paragraph, the lines under it items. The flat text cannot say whether a chunk's first
 * line was an item; it prints as a paragraph.
 */
function ownParagraphs(text: string): { kind: TextBlock['kind']; text: string }[] {
  const out: { kind: TextBlock['kind']; text: string }[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    chunk
      .split('\n')
      .filter((line) => line.trim() !== '')
      .forEach((line, index) => out.push({ kind: index === 0 ? 'paragraph' : 'item', text: line }));
  }
  return out;
}

/** The printed sections as (FO.SERV-03 section, own text) pairs: the live section blocks, else the seed's eleven. */
function printedSections(snapshot: RelatorioSnapshot): { section: number; ownText: string | null }[] {
  const live = sectionBlocks(snapshot.blocks)
    .map((block) => {
      const section = relatorioSectionNumber(block.block_type);
      const own = (block.config as { section_text?: unknown } | null)?.section_text;
      return section === null ? null : { section, ownText: typeof own === 'string' ? own : null };
    })
    .filter((entry): entry is { section: number; ownText: string | null } => entry !== null);
  if (live.length > 0) return live;
  return sectionNumbers(snapshot.relatorio.seed_version).map((section) => ({ section, ownText: null }));
}

/**
 * The printed document's data for one frozen snapshot. Never throws for a snapshot the
 * schema accepts: a null Empresa prints empty header and footer lines, a missing value
 * prints `—` in the document control and `[Label]` in a section body.
 */
export function layoutSpec(snapshot: RelatorioSnapshot, inputs: LayoutInputs): DocumentLayout {
  const { empresa, relatorio } = snapshot;
  const seedVersion = relatorio.seed_version;
  const seed = getSeed(seedVersion, 'cabine_primaria');
  const variables = sectionInputs(snapshot);
  const textDate = dateInForce(inputs.sectionTextAt ?? inputs.issuedAt);

  const cover = seed.cover;
  const coverRows: DocumentControlRow[] = cover.rows.map((row) => ({
    label: row.label,
    value: resolveSectionText(row.value, variables).resolved,
  }));

  const sections: LayoutSection[] = printedSections(snapshot).map(({ section, ownText }, index) => {
    const number = index + 1;
    const title = seed.section_titles[String(section)] ?? '';
    const composed = sectionType(section) !== null;
    const blocks = !composed ? null : ownText !== null ? ownParagraphs(ownText) : seededBlocks(seedVersion, section, textDate);
    if (blocks === null || blocks.length === 0) return { number, title, kind: 'empty', note: EMPTY_SECTION_NOTE };
    return {
      number,
      title,
      kind: 'text',
      paragraphs: blocks.map((block) => ({ kind: block.kind, text: resolveSectionText(block.text, variables).resolved })),
    };
  });

  return {
    page: { size: 'A4', marginsCm: 1.27 },
    header: {
      logoFileId: empresa?.logo_file_id ?? null,
      titleLine: present(empresa?.form_title) ?? '',
      formLine: empresaFormLine(empresa),
    },
    footer: {
      companyLine: present(empresa?.name) ?? '',
      contactLine: empresaFooterLine(empresa),
    },
    cover: {
      title: present(empresa?.form_title) ?? '',
      table: { title: cover.title, rows: coverRows },
      coverPhotoFileId: relatorio.setup.cover_photo_file_id,
    },
    documentControl: documentControlRows(snapshot, { revisionNumber: inputs.revisionNumber, issuedAt: inputs.issuedAt, art: inputs.art ?? null }),
    toc: sections.map(({ number, title }) => ({ number, title })),
    sections,
  };
}

/** The heading text of a section as printed and as the PDF outline names it: "1 OBJETIVO". */
export function sectionHeading(entry: TocEntry): string {
  return `${entry.number} ${entry.title}`;
}
