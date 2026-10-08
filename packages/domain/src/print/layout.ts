import { DISPLAY_TIME_ZONE } from '../format/datetime.ts';
import { empresaFooterLine, empresaFormLine } from '../registry/empresa.ts';
import { SECTION_BLOCK_TYPES, type SectionBlockType } from '../schemas/block-config.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { relatorioSectionNumber } from '../relatorio/instantiate.ts';
import { section3Blocks, sectionVariables } from '../relatorio/section-variables.ts';
import { printsSeedSections, sectionBlocks, seedSectionNumbers } from '../relatorio/sumario.ts';
import { getSeed, sectionText, type SectionVariable } from '../seed/definitions.ts';
import type { TextBlock } from '../seed/schema.ts';
import { sectionNumber } from '../templates/compose.ts';
import { parseRichText, richBlockNumbers, richRunsResolved, richRunsText, type RichRun } from '../templates/rich-text.ts';
import { isOptionalSectionVariable, resolveSectionText } from '../templates/section-text.ts';
import { documentControlRows, MISSING, REVISION_ROW_LABEL, type DocumentControlRow } from './document-control.ts';
import { section10Layout, type LayoutSection10 } from './section-10.ts';
import { section11Layout, type LayoutSectionCertificates } from './section-11.ts';
import { section7Layout, type LayoutSectionPhotos } from './section-7.ts';
import { section8Layout, type LayoutSectionPoints } from './section-8.ts';
import { section9Layout, type LayoutSectionSheets } from './section-9.ts';

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
 * Sections 7, 8 and 11 are built by their own modules (`section-7.ts`, `section-8.ts`,
 * `section-11.ts`, Stories 7.2 and 7.3) and print the note when they have nothing to
 * print; section 9 prints only its heading and the note until Story 7.1.
 */

/** What sections 7, 8, 9 and 11 print under their heading until Epics 6 and 7 fill them. */
export const EMPTY_SECTION_NOTE = '(sem conteúdo nesta revisão)';

/** The title of the table of contents page, verbatim from FO.SERV-03. */
export const TOC_TITLE = 'ÍNDICE';

/** The footer's page line: "Página X de Y", with the two fields the renderer fills. */
export const PAGE_LINE = { before: 'Página ', between: ' de ' } as const;

/** Story 11.4: one printed run of a paragraph, bold and/or italic (the kernel's `RichRun`). */
export type LayoutRun = RichRun;

export interface LayoutParagraph {
  /** Story 11.4: `numbered` is an item of a numbered list (FR-12); `item` a bullet item. */
  kind: TextBlock['kind'] | 'numbered';
  /** The plain text of the paragraph: its runs' text, concatenated. */
  text: string;
  /** A numbered item's position in its list (1, 2, 3...); absent on every other kind. */
  number?: number;
  /** The paragraph's printed runs; a seed paragraph is one plain run. */
  runs: LayoutRun[];
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

export type LayoutSection = LayoutSectionText | LayoutSectionEmpty | LayoutSection10 | LayoutSectionPhotos | LayoutSectionPoints | LayoutSectionCertificates | LayoutSectionSheets;

/** Story 7.5: the word the preview prints behind every page; issued documents carry none. */
export const DRAFT_WATERMARK = 'RASCUNHO';

/** Stories 7.2/7.3: the sections built by their own module; a null return prints the empty note. */
const SECTION_BUILDERS: Readonly<Partial<Record<number, (snapshot: RelatorioSnapshot, heading: { number: number; title: string }) => LayoutSection | null>>> = {
  7: section7Layout,
  8: section8Layout,
  11: section11Layout,
};

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
  /** Story 7.5: `RASCUNHO` on a preview (behind the text of every page), null on an issued document. */
  watermark: typeof DRAFT_WATERMARK | null;
}

export interface LayoutInputs {
  revisionNumber: number;
  /** The generation instant (UTC ISO): the "Data de emissão" and the date the seed text is in force. */
  issuedAt: string;
  /** Overrides the date the seed text is chosen for (defaults to `issuedAt`). */
  sectionTextAt?: string;
  /** See `documentControlRows`. */
  art?: string | null;
  /** Story 7.5: a preview: the RASCUNHO watermark and no revision number ("Revisão do documento" prints `—`). */
  draft?: boolean;
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

/**
 * Story 11.4: a section's own text (`config.section_text`) as printable paragraphs, through
 * the kernel's markup (`templates/rich-text.ts`): a flat text of Story 3.6 keeps its meaning
 * (blank-line-separated chunks, the first line of a chunk a paragraph, the lines under it
 * items), and a formatted one prints its bold, italic, bullet and numbered items. Variables
 * resolve per run, after parsing.
 */
function ownParagraphs(text: string, variables: Partial<Record<SectionVariable, string>>): LayoutParagraph[] {
  const blocks = parseRichText(text);
  const numbers = richBlockNumbers(blocks);
  return blocks.map((block, index) => {
    const runs = richRunsResolved(block.runs, variables);
    const kind = block.kind === 'bullet' ? 'item' : block.kind;
    const number = numbers[index];
    return { kind, text: richRunsText(runs), ...(number === null || number === undefined ? {} : { number }), runs };
  });
}

/** A seed paragraph (or item, or heading), resolved, as one plain run. */
function seedParagraph(block: { kind: TextBlock['kind']; text: string }, variables: Partial<Record<SectionVariable, string>>): LayoutParagraph {
  const text = resolveSectionText(block.text, variables).resolved;
  return { kind: block.kind, text, runs: [{ text }] };
}

/** The printed sections as (FO.SERV-03 section, own text) pairs: the live section blocks, else the seed's eleven. Story 13.8: exported for the audit input, which names each printed section by its Sumário row. */
export function printedSections(snapshot: RelatorioSnapshot): { section: number; ownText: string | null }[] {
  const live = sectionBlocks(snapshot.blocks)
    .map((block) => {
      const section = relatorioSectionNumber(block.block_type);
      const own = (block.config as { section_text?: unknown } | null)?.section_text;
      return section === null ? null : { section, ownText: typeof own === 'string' ? own : null };
    })
    .filter((entry): entry is { section: number; ownText: string | null } => entry !== null);
  // E78-Q1: the same test the Sumário's virtual rows use (`relatorio/sumario.ts`).
  if (!printsSeedSections(snapshot.blocks)) return live;
  return seedSectionNumbers(snapshot.relatorio.seed_version).map((section) => ({ section, ownText: null }));
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
  // The one section-variable mapping in the kernel (`relatorio/section-variables.ts`):
  // `section-text-surface.tsx` (Story 4.7) and this renderer (Story 4.8) both resolve
  // against it, so `obra`/`escopo`/`exclusions` can never diverge between the two.
  const variables = sectionVariables(snapshot, snapshot.responsible?.name ?? null);
  const textDate = dateInForce(inputs.sectionTextAt ?? inputs.issuedAt);

  const cover = seed.cover;
  // F-04 (D1): a cover row whose optional field is empty is left out, never "[Informações adicionais]".
  const coverRows: DocumentControlRow[] = cover.rows.flatMap((row) => {
    const resolved = resolveSectionText(row.value, variables);
    return resolved.unresolved.some(isOptionalSectionVariable) ? [] : [{ label: row.label, value: resolved.resolved }];
  });

  const sections: LayoutSection[] = printedSections(snapshot).map(({ section, ownText }, index) => {
    const number = index + 1;
    const title = seed.section_titles[String(section)] ?? '';
    // Story 7.1: section 9 prints the equipment sheets (`print/section-9.ts`), else its note.
    if (section === 9) return section9Layout(snapshot, number, title) ?? { number, title, kind: 'empty', note: EMPTY_SECTION_NOTE };
    const build = SECTION_BUILDERS[section];
    if (build !== undefined) return build(snapshot, { number, title }) ?? { number, title, kind: 'empty', note: EMPTY_SECTION_NOTE };
    const composed = sectionType(section) !== null;
    // Section 3's own exclusion list (Story 4.2's `setup.exclusions`, AD-21) overrides the
    // seed's own three items when the relatório carries no per-relatório text edit of its own.
    const seeded = section === 3 ? section3Blocks(seedVersion, textDate, relatorio.setup.exclusions) : seededBlocks(seedVersion, section, textDate);
    const paragraphs = !composed ? null : ownText !== null ? ownParagraphs(ownText, variables) : seeded?.map((block) => seedParagraph(block, variables)) ?? null;
    if (section === 10) return section10Layout(snapshot, { number, title, paragraphs: paragraphs ?? [] });
    if (paragraphs === null || paragraphs.length === 0) return { number, title, kind: 'empty', note: EMPTY_SECTION_NOTE };
    return { number, title, kind: 'text', paragraphs };
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
    documentControl: documentControlRows(snapshot, { revisionNumber: inputs.revisionNumber, issuedAt: inputs.issuedAt, art: inputs.art ?? null }).map((row) =>
      inputs.draft === true && row.label === REVISION_ROW_LABEL ? { ...row, value: MISSING } : row,
    ),
    toc: sections.map(({ number, title }) => ({ number, title })),
    sections,
    watermark: inputs.draft === true ? DRAFT_WATERMARK : null,
  };
}

/** The heading text of a section as printed and as the PDF outline names it: "1 OBJETIVO". */
export function sectionHeading(entry: TocEntry): string {
  return `${entry.number} ${entry.title}`;
}

/**
 * One printed line of the ÍNDICE: a section at level 1 ("9 RELATÓRIOS DOS ENSAIOS"), or one
 * of section 9's subsections at level 2 ("9.1 Cubículo Enel"), as FO.SERV-03's automatic
 * index lists them. `key` is the printed number ("9", "9.1"); `text` is the heading exactly
 * as printed, which is also the PDF outline's title for it (Heading 1 or Heading 2).
 */
export interface TocLine {
  key: string;
  text: string;
  level: 1 | 2;
}

/** E7-A4: the ÍNDICE's lines in print order: every section, section 9 followed by its subsections. */
export function tocLines(layout: Pick<DocumentLayout, 'toc' | 'sections'>): TocLine[] {
  const lines: TocLine[] = [];
  for (const entry of layout.toc) {
    lines.push({ key: String(entry.number), text: sectionHeading(entry), level: 1 });
    const section = layout.sections.find((s) => s.number === entry.number);
    if (section?.kind !== 'sheets') continue;
    for (const subsection of section.subsections) {
      const key = subsection.heading.split(' ', 1)[0]!;
      lines.push({ key, text: subsection.heading, level: 2 });
    }
  }
  return lines;
}
