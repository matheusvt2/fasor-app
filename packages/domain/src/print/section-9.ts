import { formatDecimalGroupedPtBr, isNotApplicableNumber, NOT_APPLICABLE_TEXT, printNotApplicable } from '../parse/pt-br-number.ts';
import { isUncaptioned, photoStampFull } from '../photos/gallery.ts';
import { photoRefLabel } from '../photos/numbering.ts';
import type { SnapshotPhoto } from '../photos/order.ts';
import { notTestedPointText } from '../points/derived.ts';
import { wordRegistryRowText, type WordRow } from '../registry/word-row.ts';
import type { CabineLocation } from '../relatorio/cabine.ts';
import {
  printedConclusionPair,
  printedConclusionText,
  type ConclusionRestriction,
  type ConclusionResult,
} from '../relatorio/conclusion.ts';
import { fieldValueText } from '../relatorio/ficha.ts';
import { storedInstrumentHeader } from '../relatorio/instrument-pick.ts';
import { configFieldsOf, evaluateSheetMeasurements, type EvaluatedMeasurementCell, type MeasurementTestEvaluation } from '../relatorio/measurement-evaluation.ts';
import { nameplateTagPrefill } from '../relatorio/nameplate-copy.ts';
import { isOilFieldExcused } from '../relatorio/oil-rule.ts';
import { evaluateSheetReadings, MANUFACTURER_PRINT_SUFFIX, polarizationNotApplicable, type EvaluatedCell, type EvaluatedRow, type EvaluatedTable, type TestEvaluation, type TestKey } from '../relatorio/readings.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from '../relatorio/sheet-state.ts';
import { siteAltitudeValue } from '../relatorio/setup-complete.ts';
import { SITE_CHECKLIST_LABEL, siteObservationOf, siteResultOf } from '../relatorio/site-checklist.ts';
import { blockTypeLabel, notTestedReasonText } from '../relatorio/tree.ts';
import { isReadingValue } from '../relatorio/over-range.ts';
import { TEMPERATURE_PRINT_LABEL, type TestTemperatureView } from '../relatorio/temperature-correction.ts';
import { visitContextOf, type VisitContext } from '../relatorio/visit-context.ts';
import type { BlockRow, EquipmentRow, NumberValue } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, findSeed, getSeed, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import { scaleToUnit } from '../seed/criteria.ts';
import type { BlockDefinition, CabineDefinition, ColumnDef, FieldDef, ReportSeed, SiteChecklist, TableDef, TestDef } from '../seed/schema.ts';
import { withCaptionOrdinals } from './caption-ordinal.ts';
import { previousReadingsByAddress, previousResultsFor, previousRowText, type LastResultReading } from './last-results.ts';
import { blockRoleOf, groupForPrint, type PrintGroupWarning } from './group-for-print.ts';
import { documentPhotoOrder, sheetChecklistPrinted, type DocumentPhotoOrder } from './photo-order.ts';
import { printTextEm } from './text-metrics.ts';
import { measurementHistoryNote, testHistoryNote } from './history-note.ts';
import { PREVIOUS_HEADER, previousHeaderText, relatorioVisitDate } from './visit-date.ts';

/*
 * Story 7.1 (FR-68, AR-11, NFR-17), Story 7.2 AC2 and E12-A2: section 9 as data. Every sheet
 * becomes a generic printable model -- tables of cells, photo rows and caption lines -- with
 * every string composed here, so `apps/api/src/jobs/generate/sections/section-9.ts` only
 * draws: widths, borders, shading, spans, images and page breaks (AD-1/AD-13, AD-15).
 *
 * A sheet prints in FO.SERV-03's order (`imports/extract-fo-serv-03.md` §2): the title bar,
 * the cabine's SE and environment on the cabine's first sheet (the first one `groupForPrint`
 * emits for it), DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS, one block per enabled test
 * (instrument header, tables), OBSERVAÇÕES, CONCLUSÃO and then (Story 20.6) one photo block
 * with every photo of the sheet: the plate's, the checklist items' and the others. Story 22.2
 * (Bruno, 2026-11-06, "Remover as quatro"): the attribution line, the "CRITÉRIO:" line, the
 * criteria line under CONCLUSÃO and a photo's item line no longer print (the screen still
 * shows them); the criterion prints in the ACEITÁVEL cell of the instrument header. A
 * switched-off sub-block is
 * omitted; the four uncaptured insulation columns are grid columns and print "-". A Não
 * ensaiada sheet prints its plate, a reason band and then its photo block (Story 17.1: every
 * numbered photo of a placed sheet prints somewhere). Story 20.5: DADOS DO EQUIPAMENTO,
 * VERIFICAÇÕES GERAIS and VERIFICAÇÕES DO LOCAL are marked `keepWhole`. Labels are
 * the seed's strings in caps (the screen shows them sentence-cased); values print as stored.
 * Cells hold only confirmed values, so no suggestion is ever read.
 *
 * Story 14.5: a type with a configuration prints it as a CONFIGURAÇÃO table after DADOS DO
 * EQUIPAMENTO, and each measurement test switched on prints as one table after the seeded
 * tests: its title, its instrument line where it has a picker, how it was run (the values
 * line), the rows the configuration shows, the lowest-of-column row where its criterion has
 * one, and its grouped values (Story 22.2: the "ACEITÁVEL: … · fonte" line is gone). A test switched
 * off prints nothing, as a disabled sub-block does, and (2026-10-14, Bruno) so does one its
 * own value says was not run (E5 "Não realizado"). An out-of-criterion cell prints as any
 * other, the plain value with no mark, the seeded tables' convention.
 *
 * Story 22.2: a text value typed as an N/A spelling ("na", "N.A.", "n/a") prints "N/A"
 * (`printNotApplicable`), and a reading table whose VALORES header carries its one unit
 * prints its cells bare ("VALORES (GΩ)" over "4,9").
 *
 * Story 22.3: every table from a sheet's first part to its CONCLUSÃO keeps its rows together
 * (`keepRows`, or `keepWhole` where Story 20.5 set it), and the joints between parts that
 * belong together carry `keepWithNext`, so a sheet that fits on its page stays whole and a
 * taller one breaks only between parts, CONCLUSÃO kept with the part before it. The label and
 * value pair tables, the cabine tables and the instrument header widen a value column whose
 * longest word would break (`widenToFit`), and a caption repeated inside one photo block
 * takes an ordinal (`withCaptionOrdinals`).
 */

// --- the print model ---------------------------------------------------------------------

export type PrintAlign = 'left' | 'center' | 'right';

export interface PrintCell {
  text: string;
  /** How many columns the cell spans (1 when absent). */
  span?: number;
  bold?: boolean;
  /** Drawn on the grey fill of FO.SERV-03's title bands and header rows. */
  shade?: boolean;
  align?: PrintAlign;
}

export interface PrintRow {
  cells: PrintCell[];
  /** A row of column headers: kept with the row under it. */
  header?: boolean;
  /** A title band across the table: kept with the row under it. */
  band?: boolean;
  /**
   * Story 14.4: a group row inside a table (VERIFICAÇÕES DO LOCAL's "SEGURANÇA E EPC NO
   * LOCAL"): one bold cell across the table on a lighter fill than a band's (`.pt-group` of
   * `key-print-section-9.html`), kept with the row under it.
   */
  group?: boolean;
}

export interface PrintTable {
  /** Relative column widths, spread over the page's content width by the renderer. */
  columns: number[];
  rows: PrintRow[];
  /**
   * Story 20.5 (FR-68): the table never starts on one page and ends on the next. Set on
   * DADOS DO EQUIPAMENTO, VERIFICAÇÕES GERAIS and VERIFICAÇÕES DO LOCAL only: the renderer
   * keeps every row with the next and repeats the leading band and header rows when a table
   * taller than a page has to split (then only at a row boundary). Absent on every other table.
   */
  keepWhole?: true;
  /**
   * Story 22.3: every row but the last keeps with the next, with no header repeat: set on every
   * other table of a sheet from its first part to CONCLUSÃO and on a local's tables, so a table
   * never splits while it fits on a page.
   */
  keepRows?: true;
  /**
   * e22g (review B1): a reading table whose longest words do not fit the page at the sheet's
   * 9 pt prints at this size, in half-points (17 to 14: 8,5 pt to 7 pt), the largest at which
   * every word stays whole (`fittedColumns`). Absent on every table that fits at 9 pt: the
   * renderer then prints it exactly as before. Batch e23a: a per-row table steps on to 13 and 12;
   * fix batch e23p: a whole-fit table (`WHOLE_FIT_TABLES`) down to 10 (5 pt).
   */
  textHalfPoints?: number;
}

export interface PrintPhoto {
  fileId: string;
  /** The photo's number, the one `numberPhotos` gives every reader (Story 17.4: a display shot's too). */
  number: number;
  /**
   * The line under the photo: "Imagem 3: ⟨legenda⟩." or "Imagem 3."; a display shot's, when
   * uncaptioned, "Imagem 3: ⟨full stamp⟩." (Story 17.4).
   */
  caption: string;
}

/**
 * One part of a sheet or of a local. Story 22.3: `keepWithNext` keeps the part's last row (or
 * its paragraph) and the gap after it with the next part, so the two never part at a page foot.
 */
export type SheetPart =
  | { kind: 'table'; table: PrintTable; keepWithNext?: true }
  | { kind: 'photos'; photos: PrintPhoto[]; keepWithNext?: true }
  | { kind: 'paragraph'; text: string; keepWithNext?: true };

export interface PrintSheet {
  blockId: string;
  /** The grey title bar: type, role and TAG ("CHAVE SECCIONADORA DE ENTRADA SEC-C01"). */
  title: string;
  parts: SheetPart[];
}

export interface PrintSheetSubsection {
  /**
   * "9.1 Cubículo Enel": printed as Heading 2. On a painel subsection (`painel: true`), the
   * painel's name in upper case with no number ("PAINEL DE MÉDIA TENSÃO"): a band over its
   * sheets, never a heading of the ÍNDICE.
   */
  heading: string;
  /** May be empty: a painel band over its type groups, or a local whose sheets all sit in painéis (the heading stands alone). */
  sheets: PrintSheet[];
  /** Story 14.2: the subsection is a painel's band. Absent on every other subsection. */
  painel?: true;
  /**
   * Story 14.4: what the local itself prints, right under this heading and before any sheet:
   * CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO, the VERIFICAÇÕES DO LOCAL table, then the site
   * items' photos. Set on the first subsection printed for a local of a relatório whose seed
   * ships a site list (v4 or later), exactly once per local; the local's sheets then carry no
   * cabine parts. Absent on every other subsection and on every relatório on v1 to v3, where
   * the cabine's two tables stay inside its first sheet.
   */
  localParts?: SheetPart[];
}

export interface LayoutSectionSheets {
  number: number;
  title: string;
  kind: 'sheets';
  subsections: PrintSheetSubsection[];
  /** `groupForPrint`'s integrity warnings (an alimentação cable feeding no transformer). */
  warnings: PrintGroupWarning[];
}

// --- the words -----------------------------------------------------------------------------

// Verbatim from FO.SERV-03 (`imports/extract-fo-serv-03.md` §2 blocks A-E, §3 T3-T13).
const CABINE_SE_TITLE = 'CARACTERÍSTICAS DA SE';
const CABINE_ENV_TITLE = 'AMBIENTE DE ENSAIO';
/** The site checklist's title band, as `key-print-section-9.html` prints it. */
const SITE_CHECKLIST_TITLE = SITE_CHECKLIST_LABEL.toLocaleUpperCase('pt-BR');
const NAMEPLATE_TITLE = 'DADOS DO EQUIPAMENTO';
const CHECKLIST_TITLE = 'VERIFICAÇÕES GERAIS';
const OBSERVATIONS_TITLE = 'OBSERVAÇÕES';
const CONCLUSION_TITLE = 'CONCLUSÃO';
// authored (Story 14.5): the title of a sheet's configuration table (`key-print-section-9.html`)
// and the prefix of a measurement test's instrument line.
const CONFIG_TITLE = 'CONFIGURAÇÃO';
const INSTRUMENT_PREFIX = 'INSTRUMENTO';
const INSTRUMENT_LABELS = ['INSTRUM./FABRIC.', 'TIPO', 'Nº SÉRIE', 'RBC'] as const;
const ACCEPTABLE_LABEL = 'ACEITÁVEL';
/** The instrument header's test-parameter column: TENSÃO ENSAIO (isolação), CORRENTE (contato); none for relação. */
const TEST_PARAMETER_LABEL: Readonly<Record<TestKey, string | null>> = {
  isolacao: 'TENSÃO ENSAIO',
  resistencia_contato: 'CORRENTE',
  relacao_transformacao: null,
};
const CONCLUSION_BOXES: readonly { value: ConclusionResult | ConclusionRestriction; label: string }[] = [
  { value: 'aprovado', label: 'APROVADO' },
  { value: 'reprovado', label: 'REPROVADO' },
  { value: 'sem_restricoes', label: 'SEM RESTRIÇÕES' },
  { value: 'com_restricoes', label: 'COM RESTRIÇÕES (ver observações)' },
];
/** The value header that carries its unit ("VALORES (GΩ)"), and none when its cells differ. */
const VALORES = 'VALORES';
/** The two grid columns the "IA e IP lidos do visor" sub-block (`ia_ip_display`) fills. */
const IA_IP_COLUMNS: ReadonlySet<string> = new Set(['ABSORÇÃO', 'POLARIZAÇÃO']);
// Batch e23a (Stories 23.2 and 23.4): the per-row ACEITÁVEL header word and the column the N/A of a reading above the limit lands in.
// authored (Story 23.2, listed for Bruno): ACEITÁVEL of a test whose rows are judged by different criteria.
const ACCEPTABLE_PER_ROW = 'POR LINHA';
/** The column that prints N/A on a row whose reading is above the instrument's limit (Story 23.4). */
const POLARIZATION_COLUMN = 'POLARIZAÇÃO';
/** The mark in a chosen C/NC/NA or CONCLUSÃO box, and what an uncaptured value prints. */
const MARK = 'X';
const DASH = '-';

// authored: the reason band of a sheet marked not tested (open question for Bruno).
const NOT_TESTED_PREFIX = 'NÃO ENSAIADO';
// authored: the role words of a sheet title ("CHAVE SECCIONADORA DE ENTRADA SEC-C01"), and
// the title of a cabos de saída sheet with role alimentação ("CABOS DE ALIMENTAÇÃO CB-TR1").
const ROLE_WORDS = { entrada: 'de entrada', saida: 'de saída', alimentacao: 'de alimentação' } as const;
const CABOS_DE_ALIMENTACAO = 'Cabos de alimentação';

const SEP = ' · ';

/**
 * A seed label as the document prints it: caps (the seed's own string, which the screen shows
 * sentence-cased), an acronym's plural "'s" kept lower-case as FO.SERV-03 writes it ("TP's").
 */
function printLabel(label: string): string {
  return label.toLocaleUpperCase('pt-BR').replace(/(\p{Lu})(['’])S(?![\p{L}\p{N}])/gu, '$1$2s');
}

// --- cells and rows ------------------------------------------------------------------------

const bandRow = (text: string, span: number, options: { bold?: boolean; align?: PrintAlign } = {}): PrintRow => ({
  band: true,
  cells: [{ text, span, bold: options.bold ?? true, shade: true, align: options.align ?? 'center' }],
});

const headerCell = (text: string, span = 1): PrintCell => (span > 1 ? { text, span, bold: true, shade: true, align: 'center' } : { text, bold: true, shade: true, align: 'center' });

const headerRow = (labels: readonly string[]): PrintRow => ({ header: true, cells: labels.map((label) => headerCell(label)) });

const valueCell = (text: string): PrintCell => ({ text, align: 'center' });

const table = (columns: number[], rows: PrintRow[]): SheetPart => ({ kind: 'table', table: { columns, rows } });

/** Story 20.5: a table the renderer keeps whole on one page (`PrintTable.keepWhole`). */
const wholeTable = (columns: number[], rows: PrintRow[]): SheetPart => ({ kind: 'table', table: { columns, rows, keepWhole: true } });

/** A number and its unit ("3.300 MΩ"), the number alone without a unit. */
function withUnit(text: string, unit: string | null | undefined): string {
  return unit === null || unit === undefined || unit === '' ? text : `${text} ${unit}`;
}

/**
 * A stored field value as the document prints it: numbers pt-BR with their unit (the stored
 * one, else the field's), a voltage class with " kV", a date dd/mm/aaaa (a date typed in
 * another shape as stored), text as typed; "-" when empty; "N/A" with no unit for the
 * `not_applicable` state (Story 16.4) and (Story 22.2) for a value typed as an N/A spelling
 * (`printNotApplicable`). Never uppercased.
 */
function storedValueText(field: Pick<FieldDef, 'kind' | 'unit'>, value: unknown): string {
  if (value === null || value === undefined) return DASH;
  if (isNotApplicableNumber(value)) return NOT_APPLICABLE_TEXT;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const number = value as { raw?: unknown; unit?: unknown; state?: unknown };
    if (typeof number.raw !== 'string') return DASH;
    const text = fieldValueText(field, { raw: number.raw, state: number.state });
    if (text.trim() === '') return DASH;
    const printed = printNotApplicable(text);
    return printed === NOT_APPLICABLE_TEXT ? printed : withUnit(text, typeof number.unit === 'string' ? number.unit : (field.unit ?? null));
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return DASH;
    if (printNotApplicable(value) === NOT_APPLICABLE_TEXT) return NOT_APPLICABLE_TEXT;
    if (field.kind === 'voltage_class') return wordRegistryRowText({ kind: 'voltage_class', name: value } as WordRow).primary;
    const text = fieldValueText(field, value);
    return printNotApplicable(text === '' ? value : text);
  }
  return printNotApplicable(fieldValueText(field, value));
}

// --- the context of one render -----------------------------------------------------------------

interface Context {
  snapshot: RelatorioSnapshot;
  blocks: ReadonlyMap<string, BlockRow>;
  tags: ReadonlyMap<string, string>;
  /** Story 22.12: the snapshot's equipment rows by id, for each sheet's previous visit (`previousResultsFor`). */
  equipment: ReadonlyMap<string, EquipmentRow>;
  /** Every live photo's number, in document order (`numberPhotos`'s map). */
  numbers: ReadonlyMap<string, number>;
  /** Stories 17.1 and 17.4: the one walk the numbers come from; its groups are what prints where. */
  photos: DocumentPhotoOrder;
  /** Story 14.6: the company type versions the snapshot carries, which a company sheet resolves through. */
  definitions: DefinitionContext;
}

function contextOf(snapshot: RelatorioSnapshot): Context {
  const photos = documentPhotoOrder(snapshot);
  return {
    snapshot,
    blocks: new Map(snapshot.blocks.map((block) => [block.id, block])),
    tags: new Map(snapshot.equipment.map((row) => [row.id, row.tag])),
    equipment: new Map(snapshot.equipment.map((row) => [row.id, row])),
    numbers: new Map(photos.order.map((photo, i) => [photo.id, i + 1])),
    photos,
    definitions: snapshotDefinitionContext(snapshot),
  };
}

/** A sheet's definition: a seeded type's from its seed version, a company type's from the snapshot (Story 14.6). */
function definitionOf(ctx: Context, block: Pick<BlockRow, 'seed_version' | 'block_type' | 'config'>): BlockDefinition | null {
  return blockDefinitionIn(ctx.definitions, block);
}

/** What a sheet reads of its seed version beyond its block definition: the cabine's fields and the checklist's columns. */
function sheetSeedOf(seedVersion: string): { cabine: CabineDefinition; checklistColumns: readonly string[] } | null {
  try {
    const seed = getSeed(seedVersion, 'cabine_primaria');
    return { cabine: seed.cabine, checklistColumns: seed.checklist_columns };
  } catch {
    return null;
  }
}

// --- the title ---------------------------------------------------------------------------------

/** Type, role and TAG: "CHAVE SECCIONADORA DE ENTRADA SEC-C01", "CABOS DE ALIMENTAÇÃO CB-TR1"; the TAG as stored. */
function sheetTitle(definition: BlockDefinition | null, block: BlockRow, tag: string): string {
  // Story 14.9: a type may print its own title (the QGBT's `QGBT/QD's`) instead of its label.
  // Story 14.6: a company type prints its version's `print_title`, or else its version's label.
  const label = definition?.print_title ?? definition?.label ?? blockTypeLabel(block.seed_version, block.block_type);
  const role = blockRoleOf(block);
  let type = label;
  if (role === 'alimentacao') type = block.block_type === 'cabos_saida' ? CABOS_DE_ALIMENTACAO : `${label} ${ROLE_WORDS.alimentacao}`;
  else if (role !== null && !label.toLocaleLowerCase('pt-BR').endsWith(ROLE_WORDS[role])) type = `${label} ${ROLE_WORDS[role]}`;
  const printed = printLabel(type);
  const trimmed = tag.trim();
  return trimmed === '' ? printed : `${printed} ${trimmed}`;
}

// --- the cabine block -------------------------------------------------------------------------

/**
 * CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO, labels over values, "-" for a field not
 * filled. ALTITUDE is the relatório's since Story 12.3 (setup Etapa 5, `site_altitude_m`; no
 * sheet asks the cabine's, `relatorio/cabine.ts` SETUP_OWNED): a cabine value still wins when
 * one exists, else the setup's prints ("N/A" when `site_altitude_na`, Story 17.6).
 */
function cabineParts(cabine: CabineLocation, definition: CabineDefinition, siteAltitude: NumberValue | null): SheetPart[] {
  // Story 22.3: equal weights widened where a word would break (every column holds values, its header label counting as a word),
  // each table kept with the part after it.
  const group = (title: string, fields: readonly FieldDef[], values: Record<string, unknown>): SheetPart => {
    const rows = [bandRow(title, fields.length), headerRow(fields.map((field) => printLabel(field.label))), { cells: fields.map((field) => valueCell(storedValueText(field, values[field.key]))) }];
    return { ...table(widenToFit(fields.map(() => 1), rows, fields.map((_, col) => col)), rows), keepWithNext: true };
  };
  const env: Record<string, unknown> = { ...(cabine.env as Record<string, unknown>) };
  if ((env.altitude_m === null || env.altitude_m === undefined) && siteAltitude !== null) env.altitude_m = siteAltitude;
  return [group(CABINE_SE_TITLE, definition.se, cabine.se as Record<string, unknown>), group(CABINE_ENV_TITLE, definition.env, env)];
}

// --- DADOS DO EQUIPAMENTO ---------------------------------------------------------------------

/** The label and value pair tables' base weights (three pairs to a row) and their value columns (Story 22.3). */
const PAIR_WEIGHTS: readonly number[] = [1.6, 1.7, 1.6, 1.7, 1.6, 1.7];
const PAIR_VALUE_COLUMNS: readonly number[] = [1, 3, 5];

/** Three label/value pairs per row. The TAG field with no cell of its own prints the block's TAG (E12-A2). */
function nameplatePart(ctx: Context, block: BlockRow, definition: BlockDefinition): SheetPart {
  // e22h B1: the snapshot's type versions too, so a company plate's TAG field reads its prefill.
  const prefill = nameplateTagPrefill({ blocks: ctx.snapshot.blocks, equipment: ctx.snapshot.equipment, equipment_types: ctx.snapshot.equipment_types }, block.id);
  const pairs = definition.nameplate.map((field) => {
    const cell = block.sheet.nameplate[field.key];
    // Story 14.11 (seed v6): an oil field of a non-oil unit prints "-" whatever is stored.
    const excused = isOilFieldExcused(block, field.key, ctx.definitions);
    const value = excused ? DASH : cell === undefined ? (field.key === 'tag' && prefill !== null ? prefill : DASH) : storedValueText(field, cell.value);
    return [{ text: printLabel(field.label), bold: true, align: 'left' as const }, { text: value, align: 'left' as const }];
  });
  const rows: PrintRow[] = [bandRow(NAMEPLATE_TITLE, 6)];
  for (let i = 0; i < pairs.length; i += 3) {
    const cells = pairs.slice(i, i + 3).flat();
    while (cells.length < 6) cells.push({ text: '', align: 'left' });
    rows.push({ cells });
  }
  return wholeTable(widenToFit(PAIR_WEIGHTS, rows, PAIR_VALUE_COLUMNS), rows);
}

// --- VERIFICAÇÕES GERAIS ------------------------------------------------------------------------

/** The seed's normalized columns (ÍTEM · C · NC · NA · OBSERVAÇÕES); "⟨n⟩. ⟨ITEM⟩", an X in the chosen box, the observation. */
function checklistPart(block: BlockRow, definition: BlockDefinition, columns: readonly string[], definitions: DefinitionContext): SheetPart | null {
  if (definition.checklist === null) return null;
  const items = definition.checklist;
  const last = columns.length - 1;
  const rows: PrintRow[] = [bandRow(CHECKLIST_TITLE, columns.length), headerRow(columns.map(printLabel))];
  items.forEach((item, index) => {
    const result = checklistResultOf(block, item.key, definitions);
    const observationCell = block.sheet.checklist[item.key]?.observation;
    const observation = isCellFilled(observationCell) && typeof observationCell!.value === 'string' ? observationCell!.value.trim() : '';
    rows.push({
      cells: columns.map((column, c): PrintCell => {
        if (c === 0) return { text: `${index + 1}. ${printLabel(item.label)}`, align: 'left' };
        if (column === 'C' || column === 'NC' || column === 'NA') return valueCell(result === column ? MARK : '');
        return c === last ? { text: observation, align: 'left' } : valueCell('');
      }),
    });
  });
  return wholeTable(
    columns.map((column, c) => (c === 0 ? 5 : column === 'C' || column === 'NC' || column === 'NA' ? 0.6 : 3.4)),
    rows,
  );
}

// --- VERIFICAÇÕES DO LOCAL ----------------------------------------------------------------------

const isMarkColumn = (column: string): boolean => column === 'C' || column === 'NC' || column === 'NA';

/**
 * Story 14.4 (`key-print-section-9.html` `.pt-check`): the local's site checklist under the
 * seed's normalized columns (ÍTEM · C · NC · NA · OBSERVAÇÕES). A group row before each
 * group, its label in caps; each item "⟨n⟩. ⟨ITEM⟩" in caps with n running 1 to 19 across the
 * groups, an X in the chosen box and the observation as typed. An unanswered item prints
 * with no mark.
 */
function siteChecklistPart(cabine: CabineLocation, list: SiteChecklist, columns: readonly string[]): SheetPart {
  const last = columns.length - 1;
  const rows: PrintRow[] = [bandRow(SITE_CHECKLIST_TITLE, columns.length), headerRow(columns.map(printLabel))];
  let number = 0;
  for (const group of list.groups) {
    rows.push({ group: true, cells: [{ text: printLabel(group.label), span: columns.length, bold: true, align: 'left' }] });
    for (const item of group.items) {
      number += 1;
      const result = siteResultOf(cabine, item.key);
      const observation = siteObservationOf(cabine, item.key) ?? '';
      rows.push({
        cells: columns.map((column, c): PrintCell => {
          if (c === 0) return { text: `${number}. ${printLabel(item.label)}`, align: 'left' };
          if (isMarkColumn(column)) return valueCell(result === column ? MARK : '');
          return c === last ? { text: observation, align: 'left' } : valueCell('');
        }),
      });
    }
  }
  return wholeTable(
    columns.map((column, c) => (c === 0 ? 5 : isMarkColumn(column) ? 0.6 : 3.4)),
    rows,
  );
}

/**
 * Story 14.4: what a local prints under its first heading on a relatório with a site list:
 * its SE and environment tables, its VERIFICAÇÕES DO LOCAL table, then the photos taken on
 * its site items (in capture order, numbered as section 7 numbers them).
 */
function localPartsOf(ctx: Context, cabine: CabineLocation, seed: ReportSeed, list: SiteChecklist): SheetPart[] {
  // The walk kept only this local's photos on an item of `list` (the seed's site list).
  const photos = printPhotos(ctx, ctx.photos.locals.get(cabine.id) ?? []);
  return keptTogether([
    ...cabineParts(cabine, seed.cabine, siteAltitudeValue(ctx.snapshot.relatorio.setup)),
    siteChecklistPart(cabine, list, seed.checklist_columns),
    ...photosPart(photos),
  ]);
}

// --- one test ----------------------------------------------------------------------------------

/** The instrument header copied onto the sheet (AR-18), "-" where it holds nothing, and the criterion. */
function instrumentPart(block: BlockRow, test: TestDef, evaluation: TestEvaluation): SheetPart {
  const header = storedInstrumentHeader(block.sheet.test[test.key]?.instrument?.value);
  const text = (value: string | null | undefined) => (value === null || value === undefined || value.trim() === '' ? DASH : value);
  const parameter = TEST_PARAMETER_LABEL[test.key];
  // Story 14.9: a criterion picked from the plate prints its unit in the header and the band's
  // minimum alone ("ACEITÁVEL MΩ" over "0,5"), "-" when no band applies.
  const bands = test.criterion_bands;
  const acceptableLabel = bands === undefined ? ACCEPTABLE_LABEL : `${ACCEPTABLE_LABEL} ${bands.bands[0]!.unit}`;
  // Batch e23a: the manufacturer's value prints with its suffix ("<80 µΩ (fabricante)"), rows judged
  // by different criteria print POR LINHA here and their own in each table's ACEITÁVEL column.
  // Review fix (item 2): under "ACEITÁVEL MΩ" a band test's manufacturer's value prints in the band style, scaled into the band unit.
  const bandManufacturer = bands === undefined || evaluation.manufacturer === undefined ? null : scaleToUnit(evaluation.manufacturer.criterion.value, evaluation.manufacturer.criterion.unit, bands.bands[0]!.unit);
  const acceptable =
    evaluation.manufacturer !== undefined
      ? bands !== undefined && bandManufacturer !== null
        ? `${bandValueText(bandManufacturer)}${MANUFACTURER_PRINT_SUFFIX}`
        : `${evaluation.manufacturer.criterionText}${MANUFACTURER_PRINT_SUFFIX}`
      : evaluation.perRow === true
        ? ACCEPTABLE_PER_ROW
        : bands === undefined
          ? evaluation.criterionText
          : evaluation.criterion === null
            ? DASH
            : bandValueText(evaluation.criterion.value);
  // Batch e23v (Story 23.5, seed v13; Story 23.1's frame, M-5): a corrected test prints the temperature used, and where it came from, before ACEITÁVEL.
  const temperature = evaluation.temperature;
  const labels: string[] = [...INSTRUMENT_LABELS, ...(parameter === null ? [] : [parameter]), ...(temperature === undefined ? [] : [TEMPERATURE_PRINT_LABEL]), acceptableLabel];
  const values = [
    text(header?.manufacturer),
    text(header?.model),
    text(header?.serial),
    text(header?.cert_number),
    ...(parameter === null ? [] : [text(header?.test_parameter)]),
    ...(temperature === undefined ? [] : [temperature.print]),
    acceptable,
  ];
  const rows = [bandRow(printLabel(test.label), labels.length), headerRow(labels), { cells: values.map(valueCell) }];
  // Story 22.3: equal weights widened where a word would break, the header labels counting as words.
  return table(
    widenToFit(
      labels.map(() => 1),
      rows,
      labels.map((_, col) => col),
    ),
    rows,
  );
}

/** A band's minimum as ACEITÁVEL prints it: pt-BR, at least one decimal ("0,5", "1,0", "0,25"). */
function bandValueText(value: number): string {
  const decimals = Math.max(1, (String(value).split('.')[1] ?? '').length);
  return value.toFixed(decimals).replace('.', ',');
}

/** The one unit a VALORES header over these columns carries: the measured cells' one unit, else the seed's; null when they differ. */
function valoresUnit(cols: readonly number[], evaluated: EvaluatedTable, columns: readonly ColumnDef[]): string | null {
  const measured = new Set<string>();
  for (const row of evaluated.rows) {
    for (const cell of row.cells) if (cols.includes(cell.address.col) && isReadingValue(cell.state) && cell.unit !== null) measured.add(cell.unit);
  }
  const seeded = new Set(cols.map((col) => columns[col]?.unit ?? null).filter((unit): unit is string => unit !== null));
  const units = measured.size > 0 ? measured : seeded;
  return units.size === 1 ? [...units][0]! : null;
}

/** The measured units under a VALORES header: one prints "VALORES (GΩ)", several "VALORES"; none falls back to the seed's column unit. */
function valoresHeader(cols: readonly number[], evaluated: EvaluatedTable, columns: readonly ColumnDef[]): string {
  const unit = valoresUnit(cols, evaluated, columns);
  return unit === null ? VALORES : `${VALORES} (${unit})`;
}

/**
 * Story 22.2: the unit each value column's printed header carries, so its cells print bare: a
 * column titled VALORES, or one under a VALORES group (every column of the group shares the
 * group header's unit), when that header names one unit; null for every other column.
 */
function headerUnits(definition: TableDef, evaluated: EvaluatedTable): (string | null)[] {
  const values = definition.value_columns;
  return values.map((column, col) => {
    if (column.label === VALORES) return valoresUnit([col], evaluated, values);
    if (column.group !== VALORES) return null;
    const cols = values.flatMap((other, c) => (other.group === VALORES && groupRun(values, c, col) ? [c] : []));
    return valoresUnit(cols, evaluated, values);
  });
}

/** True when columns `a` and `b` sit in one contiguous run of the same group (the run `measurementHeader` spans). */
function groupRun(values: readonly ColumnDef[], a: number, b: number): boolean {
  const [from, to] = a <= b ? [a, b] : [b, a];
  for (let c = from; c <= to; c++) if (values[c]!.group !== values[a]!.group) return false;
  return true;
}

// --- the voltage column (Story 22.8, seed v12) -----------------------------------------------

/**
 * Story 22.8: the per-row test voltage of a v12 insulation table. It is stored after the other
 * value columns (`seed/v12.ts`) and prints right after the connection columns, never in its
 * storage position: its header, its cells and the value columns that print after it. A table
 * without one (every table of v1 to v11) prints as before. The one place the column's print
 * lives, so a later column beside it (e22r) has one helper to extend.
 */
interface PrintedVoltage {
  /** The column's index in `value_columns`. */
  col: number;
  /** "TENSÃO (kV)". */
  header: string;
}

function printedVoltageOf(definition: TableDef): PrintedVoltage | null {
  const col = definition.value_columns.findIndex((column) => column.role === 'voltage');
  if (col === -1) return null;
  const column = definition.value_columns[col]!;
  return { col, header: withUnitHeader(printLabel(column.label), column.unit) };
}

/** A header with its unit: "TENSÃO (kV)". */
function withUnitHeader(label: string, unit: string | null): string {
  return unit === null ? label : `${label} (${unit})`;
}

/**
 * The value columns that print after the connection (and voltage) columns, in storage order, the voltage column left out.
 * Batch e23e (Story 23.18, seed v13): a `choice` column, stored last, prints right before CONDIÇÕES (the table's last
 * derived column), as the screen draws it; a table without one (every table of v1 to v12) prints as before.
 */
function printedValueColumns(definition: TableDef): { col: number; column: ColumnDef }[] {
  const printed = definition.value_columns.flatMap((column, col) => (column.role === 'voltage' || column.role === 'choice' ? [] : [{ col, column }]));
  const choice = definition.value_columns.findIndex((column) => column.role === 'choice');
  if (choice === -1) return printed;
  let before = printed.length;
  printed.forEach((entry, i) => {
    if (entry.column.role === 'derived') before = i;
  });
  return [...printed.slice(0, before), { col: choice, column: definition.value_columns[choice]! }, ...printed.slice(before)];
}

// --- the corrected column (batch e23v, Story 23.5, seed v13) -------------------------------------

/**
 * Story 23.5 (Matheus at the Story 23.1 approval, 2026-11-08): a test with `temperature_correction`
 * prints its readings corrected to 20 °C in one more column headed "20 °C", right after the table's
 * capture column and inside its group (the transformer's VALORES; beside VALORES on the disjuntor's
 * and the seccionadora's tables), its values in the group's header unit, "-" without a corrected
 * value. `after` is the position in `printedValueColumns` it follows, `capture` the column it
 * corrects. A table of any other test (every table of v1 to v12) has none and prints as before.
 */
interface PrintedCorrected {
  after: number;
  capture: number;
  header: string;
}

function printedCorrectedOf(definition: TableDef, temperature: TestTemperatureView | undefined): PrintedCorrected | null {
  if (temperature === undefined) return null;
  const printed = printedValueColumns(definition);
  let after = -1;
  printed.forEach(({ column }, i) => {
    if (column.role === 'capture') after = i;
  });
  return after === -1 ? null : { after, capture: printed[after]!.col, header: temperature.printHeader };
}

/** One printed value column: a seed column, or (batch e23v) the corrected one. */
type PrintedEntry = { kind: 'seed'; col: number; column: ColumnDef } | { kind: 'corrected'; corrected: PrintedCorrected; group: string | undefined };

/** The printed value columns with the corrected one in its place (after its capture column, in that column's group). */
function printedEntries(definition: TableDef, corrected: PrintedCorrected | null): PrintedEntry[] {
  const seed = printedValueColumns(definition).map(({ col, column }): PrintedEntry => ({ kind: 'seed', col, column }));
  if (corrected === null) return seed;
  const followed = definition.value_columns[corrected.capture]!;
  return [...seed.slice(0, corrected.after + 1), { kind: 'corrected', corrected, group: followed.group }, ...seed.slice(corrected.after + 1)];
}

/** A row's corrected cell: the capture's value at 20 °C, bare in its header's unit, with its unit under a header with none; "-" without one. */
function correctedCellText(row: EvaluatedRow, corrected: PrintedCorrected, headerUnit: string | null): string {
  const value = row.cells.find((cell) => cell.address.col === corrected.capture)?.corrected ?? null;
  if (value === null) return DASH;
  return headerUnit !== null && value.unit === headerUnit ? formatDecimalGroupedPtBr(value.raw) : value.text;
}

/**
 * A row's voltage cell: the effective voltage ("10", "1", "0,5"), "-" when none applies or the row
 * holds no measured capture (a row not tested prints no test voltage). Story 22.10: a capture
 * above the instrument's limit is a reading too, so its row prints its voltage.
 */
function voltageText(row: EvaluatedRow): string {
  if (row.voltage === null || row.voltage.kv === null) return DASH;
  return row.cells.some((cell) => cell.role === 'capture' && isReadingValue(cell.state)) ? row.voltage.text : DASH;
}

/**
 * One header row, or two where the seed groups its columns (PONTO DE ENSAIO/CONEXÃO over LINHA · TERRA · GUARD).
 * Batch e23v (Story 23.5): the corrected column, where the test has one, sits after its capture column in that column's group.
 */
function measurementHeader(definition: TableDef, evaluated: EvaluatedTable, corrected: PrintedCorrected | null = null): PrintRow[] {
  const values = definition.value_columns;
  const voltage = printedVoltageOf(definition);
  const printed = printedEntries(definition, corrected);
  // Story 21.1: a column prints the evaluated label, which on a ratio table's captures is its vector group's pair.
  const columnLabel = (column: ColumnDef, col: number) =>
    column.label === VALORES ? valoresHeader([col], evaluated, values) : printLabel(evaluated.columns.find((visible) => visible.col === col)?.label ?? column.label);
  const bottom = headerRow([
    ...definition.connection_columns.map(printLabel),
    ...(voltage === null ? [] : [voltage.header]),
    ...printed.map((entry) => (entry.kind === 'corrected' ? entry.corrected.header : columnLabel(entry.column, entry.col))),
  ]);
  if (definition.connection_group === undefined && !values.some((column) => column.group !== undefined)) return [bottom];
  const top: PrintCell[] = [];
  if (definition.connection_group !== undefined) top.push(headerCell(printLabel(definition.connection_group), definition.connection_columns.length));
  else for (let i = 0; i < definition.connection_columns.length; i++) top.push(headerCell(''));
  if (voltage !== null) top.push(headerCell(''));
  const groupOf = (entry: PrintedEntry) => (entry.kind === 'corrected' ? entry.group : entry.column.group);
  for (let i = 0; i < printed.length; ) {
    const group = groupOf(printed[i]!);
    let end = i + 1;
    if (group !== undefined) while (end < printed.length && groupOf(printed[end]!) === group) end++;
    const cols = printed.slice(i, end).flatMap((entry) => (entry.kind === 'seed' ? [entry.col] : []));
    top.push(headerCell(group === undefined ? '' : group === VALORES ? valoresHeader(cols, evaluated, values) : printLabel(group), end - i));
    i = end;
  }
  return [{ header: true, cells: top }, bottom];
}

/**
 * A typed reading: the number with its own unit, "-" when not measured or empty; an untyped
 * ratio input reads the nameplate. Story 22.2: the number alone when its header carries that unit.
 * Story 22.10: a reading above the instrument's limit prints "> 2 TΩ" ("> 2" under "VALORES
 * (TΩ)"), and one stored where the cell refuses it reads invalid and prints "> 2" as shown.
 */
function readingText(cell: EvaluatedCell, column: ColumnDef, headerUnit: string | null): string {
  const unitOf = (unit: string | null | undefined) => (headerUnit !== null && unit === headerUnit ? null : unit);
  if (isReadingValue(cell.state)) return withUnit(cell.displayText, unitOf(cell.unit));
  if (cell.state === 'invalid') return cell.raw.trim() === '' ? DASH : cell.displayText;
  if (cell.state === 'empty' && cell.fallback !== null) return withUnit(cell.fallback.text, unitOf(column.unit));
  return DASH;
}

/**
 * A `print` column's cell: "-", but ABSORÇÃO and POLARIZAÇÃO print what `ia_ip_display` stored.
 * Story 23.4 (seed v13): POLARIZAÇÃO prints N/A on a row whose reading is above the instrument's
 * limit, on a test with `instrument_limit_note` (`polarizationNotApplicable`).
 */
function printColumnText(block: BlockRow, testKey: TestKey, row: number, col: number, column: ColumnDef, enabled: ReadonlySet<string>, notApplicable = false): string {
  if (notApplicable && column.label === POLARIZATION_COLUMN) return NOT_APPLICABLE_TEXT;
  if (!IA_IP_COLUMNS.has(column.label) || !enabled.has('ia_ip_display')) return DASH;
  const value = block.sheet.test[testKey]?.cells[String(row)]?.[String(col)]?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DASH;
  const number = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (number.state !== 'measured' || typeof number.raw !== 'string' || !/^-?\d+(\.\d+)?$/.test(number.raw)) return DASH;
  return withUnit(formatDecimalGroupedPtBr(number.raw), typeof number.unit === 'string' ? number.unit : null);
}

function valueText(
  block: BlockRow,
  testKey: TestKey,
  row: EvaluatedRow,
  evaluated: EvaluatedTable,
  col: number,
  column: ColumnDef,
  enabled: ReadonlySet<string>,
  headerUnit: string | null,
  test?: TestDef,
): string {
  switch (column.role) {
    case 'capture':
    case 'input': {
      const cell = row.cells.find((candidate) => candidate.address.col === col);
      return cell === undefined ? DASH : readingText(cell, column, headerUnit);
    }
    case 'derived':
      return evaluated.columns.find((visible) => visible.col === col)?.derivedKind === 'condicao' ? (row.condicao ?? DASH) : (row.calculated?.text ?? DASH);
    case 'print':
      return printColumnText(block, testKey, row.row, col, column, enabled, test !== undefined && polarizationNotApplicable(test, row));
    case 'voltage':
      return voltageText(row);
    case 'choice':
      // Seed v13, batch e23e (Story 23.18): the row's answer in caps ("INVERTIDA"), "-" while empty.
      return row.choice === undefined || row.choice.raw === '' ? DASH : printLabel(row.choice.raw);
    case 'index': {
      // Seed v13, batch e23t (Story 23.16): the typed IP or DAR as typed; an IP on a row above the instrument's limit prints N/A (Story 23.4's rule).
      const cell = row.cells.find((candidate) => candidate.address.col === col);
      if (cell === undefined) return DASH;
      if (cell.index?.notApplicable === true) return NOT_APPLICABLE_TEXT;
      return cell.state === 'measured' ? cell.displayText : DASH;
    }
  }
}

/**
 * The approximate advance width of a text in ems of the sheet's sans-serif face (Arial's
 * metrics, bold about 7 % wider): enough to size columns, not to typeset.
 */
function emWidth(text: string, bold: boolean): number {
  let em = 0;
  for (const ch of text) {
    if (/[ilj.,:;'’|!Iíìï\s]/u.test(ch)) em += 0.28;
    else if (/[ftr/()[\]-]/u.test(ch)) em += 0.34;
    else if (/[mwMWΩ]/u.test(ch)) em += 0.84;
    else if (/\p{Lu}/u.test(ch)) em += 0.72;
    else em += 0.56;
  }
  return bold ? em * 1.07 : em;
}

/** A short text asks to stay whole on one line ("1 MINUTO", "FASE RESERVA"); a longer one only its longest word. */
const SHORT_TEXT = 14;
/** What a cell's margins take from its column, in ems. */
const CELL_ALLOWANCE_EM = 0.9;
/**
 * The page's content width in ems of the 9 pt table text (A4 less 1.27 cm margins: 18,5 cm).
 * It only decides whether the short texts fit whole; the renderer spreads the weights.
 */
const CONTENT_WIDTH_EM = 58;
/**
 * e22g (review B1): the width a reading table's longest words may take together and still print
 * whole at 9 pt, in the same ems. `emWidth` and `CELL_ALLOWANCE_EM` measure on the safe side: the
 * transformer's insulation table of seeds v1 to v11 measures 59,8 em here (three SECUNDÁRIO and
 * POLARIZAÇÃO) and printed every word whole on the wave A PDF (`e22q/tr1-058.png`), so the step
 * down starts above 60 em, never on a table Bruno has already seen print whole.
 */
export const READING_FIT_WIDTH_EM = 60;

/** The sheet's table text, 9 pt, in the renderer's half-points (`SHEET_TEXT`). */
export const SHEET_TEXT_HALF_POINTS = 18;
/**
 * e22g (review B1): the smaller sizes a reading table steps down to, in half-points (8,5 pt to
 * the floor of 7 pt), when its longest words do not fit the page at 9 pt.
 */
export const TABLE_TEXT_STEPS_HALF_POINTS: readonly number[] = [17, 16, 15, 14];
/**
 * Batch e23a (review fix 7c, Story 23.2): the steps of a v13 reading table judged row by row, which
 * carries its own ACEITÁVEL column and, with a previous visit, MANUT. ANTERIOR too: the transformer's
 * eleven columns hold every word whole only at 6 pt, so such a table steps on to 6,5 and 6 pt. No
 * other table takes these steps, so every v1 to v12 table fits as before.
 */
export const PER_ROW_TEXT_STEPS_HALF_POINTS: readonly number[] = [...TABLE_TEXT_STEPS_HALF_POINTS, 13, 12];

/**
 * Fix batch e23p (P2): the smallest size a whole-fit table (`WHOLE_FIT_TABLES`) steps on to, past its
 * given steps, one half point at a time, when its words still do not fit: 5 pt.
 */
const WHOLE_FIT_FLOOR_HALF_POINTS = 10;

/** A table's text size as a share of the 9 pt base: the factor its words' widths take. */
const textScale = (halfPoints: number | undefined) => (halfPoints ?? SHEET_TEXT_HALF_POINTS) / SHEET_TEXT_HALF_POINTS;

/** A reading table's fitted columns, and its smaller text size when it needed one. */
interface FittedTable {
  columns: number[];
  textHalfPoints?: number;
}

/**
 * Column weights from what each column holds in its own cells (a cell spanning several
 * columns is left out): every column gets at least its longest word, so nothing breaks
 * inside a word ("POLARIZAÇÃO", "SECUNDÁRIO"), and a short text stays on one line while
 * the row still fits the page; what is left is shared out by what each column still asks.
 *
 * e22g (review B1, the coordinator's decision of 2026-11-07): when the columns' longest words
 * together are wider than `READING_FIT_WIDTH_EM` at 9 pt (a v12 insulation table with its TENSÃO
 * column, a table with MANUT. ANTERIOR), the table steps down to the largest of
 * `TABLE_TEXT_STEPS_HALF_POINTS` at which every word fits whole, the floor of 7 pt when none
 * does, and carries that size for the renderer. Every table that fits at 9 pt comes back
 * exactly as before, with no size: the margins stay the same points whatever the size, so
 * only the words shrink.
 */
function fittedColumns(rows: readonly PrintRow[], count: number, steps: readonly number[] = TABLE_TEXT_STEPS_HALF_POINTS, outsideBudget: readonly number[] = [], wholeFit = false): FittedTable {
  // Fix batch e23p (P2): a whole-fit table measures its words by the face's advance widths.
  const measure = wholeFit ? printTextEm : emWidth;
  const least = new Array<number>(count).fill(0);
  const whole = new Array<number>(count).fill(0);
  for (const row of rows) {
    let col = 0;
    for (const cell of row.cells) {
      const span = cell.span ?? 1;
      if (span === 1 && col < count) {
        const bold = cell.bold === true;
        const word = Math.max(0, ...cell.text.split(/\s+/).map((part) => measure(part, bold)));
        least[col] = Math.max(least[col]!, word);
        whole[col] = Math.max(whole[col]!, [...cell.text].length <= SHORT_TEXT ? measure(cell.text, bold) : word);
      }
      col += span;
    }
  }
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  /** The columns at one text size, in ems of the 9 pt text; `fits` when every longest word does. */
  const at = (scale: number) => {
    const minimum = least.map((em) => Math.max(em, 1.5) * scale + CELL_ALLOWANCE_EM);
    const preferred = whole.map((em, col) => Math.max(em * scale + CELL_ALLOWANCE_EM, minimum[col]!));
    // Fix batch e23w (W2-K2): a corrected column (`outsideBudget`) rides on the table and is measured outside the 60 em budget.
    // Fix batch e23p (P2): a whole-fit table counts every column, the corrected one included, against the page.
    const fits = wholeFit ? sum(minimum) <= CONTENT_WIDTH_EM : sum(minimum.filter((_, col) => !outsideBudget.includes(col))) <= READING_FIT_WIDTH_EM;
    if (sum(preferred) <= CONTENT_WIDTH_EM) return { fits, columns: preferred };
    const room = CONTENT_WIDTH_EM - sum(minimum);
    const asked = sum(preferred) - sum(minimum);
    if (room <= 0 || asked <= 0) return { fits, columns: minimum };
    return { fits, columns: minimum.map((em, col) => em + (room * (preferred[col]! - em)) / asked) };
  };
  const base = at(1);
  if (base.fits) return { columns: base.columns };
  // Fix batch e23p (P2): past its given floor, a whole-fit table keeps stepping one half point at a time down to 5 pt.
  const floor = steps[steps.length - 1];
  const tried = wholeFit && floor !== undefined ? [...steps, ...Array.from({ length: Math.max(0, floor - WHOLE_FIT_FLOOR_HALF_POINTS) }, (_, i) => floor - 1 - i)] : steps;
  for (const halfPoints of tried) {
    const step = at(textScale(halfPoints));
    if (step.fits || halfPoints === tried[tried.length - 1]) return { columns: step.columns, textHalfPoints: halfPoints };
  }
  return { columns: base.columns };
}

/** Each column's longest word in ems, over the cells that sit in it alone (a cell spanning several columns is left out). */
function longestWords(rows: readonly PrintRow[], count: number): number[] {
  const longest = new Array<number>(count).fill(0);
  for (const row of rows) {
    let col = 0;
    for (const cell of row.cells) {
      const span = cell.span ?? 1;
      if (span === 1 && col < count) longest[col] = Math.max(longest[col]!, ...cell.text.split(/\s+/).map((part) => emWidth(part, cell.bold === true)));
      col += span;
    }
  }
  return longest;
}

/**
 * Story 22.3 (FR-68): the base weights of a fixed-shape table (the label and value pairs, the
 * cabine tables, the instrument header), widened only where a word would break inside itself.
 * A value column whose longest word (its margins included) is wider than its share of the
 * page takes the difference from the other value columns' slack, never below their own
 * longest word; label columns keep their weights. The base weights come back unchanged when
 * every word fits, and as fitted as the slack allows when it falls short.
 */
export function widenToFit(base: readonly number[], rows: readonly PrintRow[], valueColumns: readonly number[]): number[] {
  const total = base.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return [...base];
  const share = base.map((weight) => (weight / total) * CONTENT_WIDTH_EM);
  const need = longestWords(rows, base.length).map((em) => em + CELL_ALLOWANCE_EM);
  const values = [...new Set(valueColumns)].filter((col) => col >= 0 && col < base.length);
  let wanted = 0;
  let spare = 0;
  for (const col of values) {
    const gap = need[col]! - share[col]!;
    if (gap > 0) wanted += gap;
    else spare -= gap;
  }
  const moved = Math.min(wanted, spare);
  if (moved <= 0) return [...base];
  const widths = [...share];
  for (const col of values) {
    const gap = need[col]! - share[col]!;
    widths[col] = gap > 0 ? share[col]! + (moved * gap) / wanted : share[col]! + (moved * gap) / spare;
  }
  return widths.map((em) => (em * total) / CONTENT_WIDTH_EM);
}

/**
 * Story 22.3: the words of a printed table wider than their column (margins included), as
 * `{ col, word }`; empty when every word fits. The measure `widenToFit` sizes by, for tests and checks.
 * e22g: a table printed smaller (`textHalfPoints`) has its words measured at that size, and a
 * reading table is measured against `READING_FIT_WIDTH_EM` (`pageEm`), the width its fit decides by.
 */
export function wordsWiderThanColumns(printed: Pick<PrintTable, 'columns' | 'rows' | 'textHalfPoints'>, pageEm: number = CONTENT_WIDTH_EM): { col: number; word: string }[] {
  const total = printed.columns.reduce((sum, weight) => sum + weight, 0);
  const scale = textScale(printed.textHalfPoints);
  // Fix batch e23p (P2): a whole-fit table's words are measured by the face's advance widths, as it was fitted.
  const measure = WHOLE_FIT_TABLES.has(printed) ? printTextEm : emWidth;
  const out: { col: number; word: string }[] = [];
  for (const row of printed.rows) {
    let col = 0;
    for (const cell of row.cells) {
      const span = cell.span ?? 1;
      if (span === 1 && col < printed.columns.length) {
        const width = (printed.columns[col]! / total) * pageEm;
        for (const word of cell.text.split(/\s+/)) if (measure(word, cell.bold === true) * scale + CELL_ALLOWANCE_EM > width + 1e-9) out.push({ col, word });
      }
      col += span;
    }
  }
  return out;
}

/**
 * One measurement table: its title band, its header, then one row per connection with every value column.
 * Batch e23v (Story 23.5, seed v13): a corrected test (`temperature`) prints its corrected column too.
 */
function measurementTable(
  block: BlockRow,
  testKey: TestKey,
  definition: TableDef,
  evaluated: EvaluatedTable,
  enabled: ReadonlySet<string>,
  test?: TestDef,
  temperature?: TestTemperatureView,
  single = false,
): PrintTable {
  const corrected = printedCorrectedOf(definition, temperature);
  const width = definition.connection_columns.length + definition.value_columns.length + (corrected === null ? 0 : 1);
  const rows: PrintRow[] = [];
  if (definition.title !== undefined) rows.push(bandRow(printLabel(definition.title), width));
  rows.push(...measurementHeader(definition, evaluated, corrected));
  const units = headerUnits(definition, evaluated);
  const voltage = printedVoltageOf(definition);
  const printed = printedEntries(definition, corrected);
  // Story 23.8 (seed v13): a `rows_from` table prints every evaluated row, one per tap (TAP Nº its position)
  // then each row off the plate (TAP Nº "-"), V PRIMÁRIO its tap; every other table its seeded rows, as before.
  const lines = definition.rows_from === undefined ? definition.rows.map((connection, r) => ({ connection, row: evaluated.rows[r]! })) : evaluated.rows.map((row) => ({ connection: row.connection, row }));
  lines.forEach(({ connection, row }) => {
    rows.push({
      cells: [
        // F42: a typed connection the seed leaves blank prints the evaluated one (the plate's TAP ATUAL), "-" when none.
        ...connection.map((text, i) => valueCell(definition.connection_typed && text.trim() === '' ? row.connection[i] || DASH : printLabel(text))),
        ...(voltage === null ? [] : [valueCell(voltageText(row))]),
        ...printed.map((entry) =>
          valueCell(
            entry.kind === 'corrected'
              ? correctedCellText(row, entry.corrected, units[entry.corrected.capture] ?? null)
              : valueText(block, testKey, row, evaluated, entry.col, entry.column, enabled, units[entry.col] ?? null, test),
          ),
        ),
      ],
    });
  });
  // Fix batch e23w (W2-K2): the corrected column's place in a data row, measured outside the budget.
  const at = printed.findIndex((entry) => entry.kind === 'corrected');
  const outside = at === -1 ? [] : [definition.connection_columns.length + (voltage === null ? 0 : 1) + at];
  // Fix batch e23p (P2): a table printed alone (not side by side) with its corrected column fits whole.
  const wholeFit = single && corrected !== null;
  return withWholeFit(withCorrectedColumns({ ...fittedColumns(rows, width, TABLE_TEXT_STEPS_HALF_POINTS, outside, wholeFit), rows }, outside), wholeFit);
}

/**
 * Fix batch e23w (W2-K2, the approved Story 23.1 frame: the transformer's table at 8 pt): the printed
 * position of each table's corrected "20 °C" column, by table, measured outside the 60 em budget by
 * `fittedColumns` (the approved column rides on v12's table: v12's table fits at 8 pt, 58,9 em, and
 * the column takes it to 61,6 em). Kept beside the table, never in it, so the layout's shape is the
 * one it was; carried by every re-fit (`withAppendedColumn` appends after it, `sideBySide` shifts the
 * right half's). A table of any other test has none and fits as before.
 */
const CORRECTED_COLUMNS = new WeakMap<PrintTable, readonly number[]>();

/**
 * Fix batch e23p (P2, the behaviour pass's F3: the v13 transformer's insulation table broke "SECUNDÁRIO"
 * and "22,6" in the PDF in all three shapes): the reading tables fitted whole. A table printed alone
 * (never a side-by-side pair) with a corrected "20 °C" column measures its words by the face's advance
 * widths (`printTextEm`) and counts every column, the corrected one included, against the page
 * (`CONTENT_WIDTH_EM`), stepping past its floor down to 5 pt. Kept beside the table, as
 * `CORRECTED_COLUMNS`; `withAppendedColumn` re-fits such a table the same way. The disjuntor's and the
 * seccionadora's pairs keep e23w's rule, and every table of seeds v1 to v12 has no corrected column.
 */
const WHOLE_FIT_TABLES = new WeakSet<object>();

/** The table, recorded as fitted whole when `wholeFit`. */
function withWholeFit(table: PrintTable, wholeFit: boolean): PrintTable {
  if (wholeFit) WHOLE_FIT_TABLES.add(table);
  return table;
}

/** The table, with its corrected columns recorded, as `fittedColumns` gave it. */
function withCorrectedColumns(table: PrintTable, columns: readonly number[]): PrintTable {
  if (columns.length > 0) CORRECTED_COLUMNS.set(table, columns);
  return table;
}

/**
 * Fix batch e23w (W2-K2): the width a printed reading table's longest words are measured against:
 * `READING_FIT_WIDTH_EM`, plus what its corrected "20 °C" columns take at the table's size (measured
 * outside the budget). Every table without a corrected column measures against 60 em, as before.
 */
export function readingFitWidthEm(table: PrintTable): number {
  // Fix batch e23p (P2): a whole-fit table's words were fitted against the whole page.
  if (WHOLE_FIT_TABLES.has(table)) return CONTENT_WIDTH_EM;
  const outside = CORRECTED_COLUMNS.get(table) ?? [];
  if (outside.length === 0) return READING_FIT_WIDTH_EM;
  const scale = textScale(table.textHalfPoints);
  const longest = longestWords(table.rows, table.columns.length);
  return READING_FIT_WIDTH_EM + outside.reduce((sum, col) => sum + Math.max(longest[col] ?? 0, 1.5) * scale + CELL_ALLOWANCE_EM, 0);
}

/** A titled table with one header row and no column groups: the shape FO.SERV-03 prints side by side (contato aberto · fechado). */
function simpleTitled(definition: TableDef): boolean {
  return definition.title !== undefined && definition.connection_group === undefined && definition.value_columns.every((column) => column.group === undefined);
}

/** Two tables of the same shape drawn as one, side by side, row by row, its columns fitted over the joined rows. */
function sideBySide(left: PrintTable, right: PrintTable): PrintTable {
  const rows = left.rows.map((row, i) => ({ ...row, cells: [...row.cells, ...right.rows[i]!.cells] }));
  const outside = [...(CORRECTED_COLUMNS.get(left) ?? []), ...(CORRECTED_COLUMNS.get(right) ?? []).map((col) => col + left.columns.length)];
  return withCorrectedColumns({ ...fittedColumns(rows, left.columns.length + right.columns.length, TABLE_TEXT_STEPS_HALF_POINTS, outside), rows }, outside);
}

// --- MANUT. ANTERIOR (Story 22.12) ----------------------------------------------------------------

/**
 * The previous visit's readings of a sheet by `readingAddressKey`, or null when its equipment has
 * none from another relatório. Batch e24p (Story 24.15): with the MANUT. ANTERIOR header its tables
 * print (`previousHeaderText`: the visit's date on a second line on v14, the header alone on v1 to v13).
 */
type PreviousReadings = { readings: ReadonlyMap<string, LastResultReading>; header: string } | null;

/**
 * Story 22.12: a reading table with MANUT. ANTERIOR appended as its last column, nothing else
 * moved: the last header row gets the header (an earlier header row, where the table has two, an
 * empty shaded cell), a band or a line across the table spans one more, and each other row gets
 * its cell, `texts` in order ('' past their end: a reference or a group row). Columns re-fitted.
 */
export function withPreviousColumn(printed: PrintTable, texts: readonly string[], header: string = PREVIOUS_HEADER): PrintTable {
  return withAppendedColumn(printed, header, texts);
}

/**
 * The shape `withPreviousColumn` gives, for any header (batch e23a: Story 23.2's per-row ACEITÁVEL
 * column takes it too, before MANUT. ANTERIOR): the column appended last, the last header row
 * carrying `header`, bands and lines across spanning one more, data rows taking `texts` in order.
 */
export function withAppendedColumn(printed: PrintTable, header: string, texts: readonly string[], steps: readonly number[] = TABLE_TEXT_STEPS_HALF_POINTS): PrintTable {
  const width = printed.columns.length;
  const headers = printed.rows.filter((row) => row.header === true);
  const last = headers[headers.length - 1];
  let data = 0;
  const rows = printed.rows.map((row): PrintRow => {
    if (row.header === true) return { ...row, cells: [...row.cells, headerCell(row === last ? header : '')] };
    const span = row.cells.reduce((sum, cell) => sum + (cell.span ?? 1), 0);
    if (row.band === true || (row.cells.length === 1 && span === width && width > 1)) return { ...row, cells: [{ ...row.cells[0]!, span: width + 1 }] };
    const text = texts[data] ?? '';
    data += 1;
    return { ...row, cells: [...row.cells, valueCell(text)] };
  });
  // The size is the re-fitted table's own: the one the narrower table carried no longer applies.
  const kept: PrintTable = { ...printed };
  delete kept.textHalfPoints;
  const outside = CORRECTED_COLUMNS.get(printed) ?? [];
  // Fix batch e23p (P2): a whole-fit table stays one, re-fitted the same way.
  const wholeFit = WHOLE_FIT_TABLES.has(printed);
  return withWholeFit(withCorrectedColumns({ ...kept, ...fittedColumns(rows, width + 1, steps, outside, wholeFit), rows }, outside), wholeFit);
}

/** Story 22.12: the sheet's previous visit (`previousResultsFor`), its readings by address; null with none. */
function previousReadingsOf(ctx: Context, block: BlockRow, definition: BlockDefinition): PreviousReadings {
  const equipment = block.equipment_id === null ? undefined : ctx.equipment.get(block.equipment_id);
  // Fix batch e24x (D3): never a visit later than this relatório's own.
  const entry = previousResultsFor(equipment, block, ctx.snapshot.relatorio.id, relatorioVisitDate(ctx.snapshot.relatorio.setup));
  if (entry === null) return null;
  // An entry none of whose keys this definition holds (every row renamed by a later seed) is no previous visit to print.
  // Story 23.8: the block's tap rows read the readings of their taps.
  const readings = previousReadingsByAddress(entry, definition, block);
  // Batch e24p (Story 24.15): the header names the visit's date on a seed that turns `previous_visit_date` on.
  return readings.size === 0 ? null : { readings, header: previousHeaderText(entry, block.seed_version) };
}

function testParts(block: BlockRow, definition: BlockDefinition, evaluation: TestEvaluation, enabled: ReadonlySet<string>, previous: PreviousReadings): SheetPart[] {
  const test = definition.tests.find((candidate) => candidate.key === evaluation.testKey);
  if (test === undefined) return [];
  // FO.SERV-03 prints the seccionadora's and the disjuntor's contato aberto and contato
  // fechado tables side by side (`extract-fo-serv-03.md` §2, modelos 3 and 4).
  const [first, second] = test.tables;
  const pairShape = test.tables.length === 2 && first !== undefined && second !== undefined && simpleTitled(first) && simpleTitled(second) && first.rows.length === second.rows.length;
  // Story 22.12: each row's previous captures, in column order; '-' for a row with none.
  let offset = 0;
  const previousTexts = test.tables.map((tableDef, i) => {
    const start = offset;
    offset += tableDef.rows.length;
    if (previous === null) return null;
    const captures = tableDef.value_columns.flatMap((column, col) => (column.role === 'capture' ? [col] : []));
    // Story 23.8: a `rows_from` table's rows are its evaluated ones (a tap row is keyed by its volts).
    const indices = tableDef.rows_from === undefined ? tableDef.rows.map((_, r) => start + r) : (evaluation.tables[i]?.rows ?? []).map((row) => row.row);
    return indices.map((row) => previousRowText(previous.readings, captures.map((col) => ({ testKey: test.key, row, col }))));
  });
  // e22g (review N1): MANUT. ANTERIOR is decided per table, printed only where a row of that
  // table has a previous value; the two halves of a side-by-side pair decide together, so the
  // pair still prints as one.
  const holds = previousTexts.map((texts) => texts !== null && texts.some((text) => text !== DASH));
  const tables = test.tables.map((tableDef, i) => {
    const plain = measurementTable(block, test.key, tableDef, evaluation.tables[i]!, enabled, test, evaluation.temperature, !pairShape);
    // Story 23.2 (seed v13): rows judged by different criteria print each row's in an ACEITÁVEL column, before MANUT. ANTERIOR.
    const perRow = evaluation.perRow === true;
    const printed = perRow ? withAppendedColumn(plain, ACCEPTABLE_LABEL, evaluation.tables[i]!.rows.map((row) => row.criterionText ?? DASH), PER_ROW_TEXT_STEPS_HALF_POINTS) : plain;
    const texts = previousTexts[i];
    if (previous === null || texts === null || texts === undefined || !(holds[i] || (pairShape && holds.some(Boolean)))) return printed;
    // Batch e24p (Story 24.15): the header names the previous visit's date on v14 (a second line, the weights and size kept).
    return perRow ? withAppendedColumn(printed, previous.header, texts, PER_ROW_TEXT_STEPS_HALF_POINTS) : withPreviousColumn(printed, texts, previous.header);
  });
  const paired = pairShape && tables[0]!.columns.length === tables[1]!.columns.length;
  // Story 22.3: the instrument header and every table but the last keep with the next, so a test never parts from its header.
  // Story 23.4 (seed v13): the instrument-limit note, a paragraph right after the test's last table, kept with it.
  // Batch e23e (Story 23.18, seed v13): the test's print note (the ratio check is not an accuracy test), the same way.
  // Batch e24p (Story 24.16, seed v14): the rows a previous-visit rule flagged, one line after the test's other notes.
  const notes = [evaluation.limitNote ?? null, evaluation.printNote ?? null, testHistoryNote(block.seed_version, evaluation)].filter((text): text is string => text !== null);
  const printed = (paired ? [sideBySide(tables[0]!, tables[1]!)] : tables).map((one, i, all): SheetPart =>
    i < all.length - 1 || notes.length > 0 ? { kind: 'table', table: one, keepWithNext: true } : { kind: 'table', table: one },
  );
  const paragraphs = notes.map((text, i): SheetPart => (i < notes.length - 1 ? { kind: 'paragraph', text, keepWithNext: true } : { kind: 'paragraph', text }));
  return [{ ...instrumentPart(block, test, evaluation), keepWithNext: true }, ...printed, ...paragraphs];
}

// --- CONFIGURAÇÃO and the measurement tests (Story 14.5) ----------------------------------------

/** Label and value pairs, three to a row, under one title band: the nameplate's shape. */
function pairsTable(title: string, pairs: readonly { label: string; value: string }[]): SheetPart {
  const rows: PrintRow[] = [bandRow(title, 6)];
  for (let i = 0; i < pairs.length; i += 3) {
    const cells: PrintCell[] = pairs.slice(i, i + 3).flatMap((pair) => [
      { text: pair.label, bold: true, align: 'left' as const },
      { text: pair.value, align: 'left' as const },
    ]);
    while (cells.length < 6) cells.push({ text: '', align: 'left' });
    rows.push({ cells });
  }
  return table(widenToFit(PAIR_WEIGHTS, rows, PAIR_VALUE_COLUMNS), rows);
}

/** The block's configuration in force (the stored options, else the defaults), or null for a type with none. */
function configPart(block: BlockRow, definition: BlockDefinition): SheetPart | null {
  const fields = configFieldsOf(block, definition);
  if (fields.length === 0) return null;
  return pairsTable(
    CONFIG_TITLE,
    fields.map((field) => ({ label: printLabel(field.label), value: printNotApplicable(printLabel(field.valueLabel)) })),
  );
}

/** One line across a measurement test's table, left-aligned. */
const lineRow = (text: string, span: number): PrintRow => ({ cells: [{ text, span, align: 'left' }] });

/**
 * "INSTRUMENTO: HTMO-10 · Hi-Tech · Nº SÉRIE G282926 · RBC 37276/26", "INSTRUMENTO: -" while none
 * was picked. The line carries no test parameter, whatever the stored header holds: the test
 * voltage of a measurement test is the one its ACEITÁVEL line states.
 */
function instrumentLine(block: BlockRow, testKey: string): string {
  const header = storedInstrumentHeader(block.sheet.test[testKey]?.instrument?.value);
  const present = (value: string | null | undefined): value is string => value !== null && value !== undefined && value.trim() !== '';
  const parts = [
    header?.model,
    header?.manufacturer,
    present(header?.serial) ? `${INSTRUMENT_LABELS[2]} ${header.serial}` : null,
    present(header?.cert_number) ? `${INSTRUMENT_LABELS[3]} ${header.cert_number}` : null,
  ].filter(present);
  return `${INSTRUMENT_PREFIX}: ${parts.length === 0 ? DASH : parts.join(SEP)}`;
}

/** The one unit every number cell of a column shows, which its header then carries; null when they differ or none is a number. */
function sharedUnit(test: MeasurementTestEvaluation, col: number): string | null {
  const units = new Set<string | null>();
  for (const row of test.rows) {
    const cell = row.cells[col]!;
    if (cell.fixed === null && cell.kind === 'number') units.add(cell.unit);
  }
  const [unit] = [...units];
  return units.size === 1 && unit !== null && unit !== undefined ? unit : null;
}

/** A cell as printed: a fixed text as written, a choice's option in caps, a number (with its unit unless the header carries it), "-" when empty. */
function measurementText(cell: EvaluatedMeasurementCell, headerUnit: string | null): string {
  if (cell.fixed !== null) return cell.fixed;
  if (cell.state === 'invalid') return cell.raw.trim() === '' ? DASH : cell.displayText;
  // Story 22.10: a reading above the instrument's limit prints as a number does ("> 2.000 µΩ").
  if (!isReadingValue(cell.state)) return DASH;
  if (cell.kind === 'choice') return printLabel(cell.displayText);
  return headerUnit === null ? withUnit(cell.displayText, cell.unit) : cell.displayText;
}

/** Batch e23t (Story 23.15): a cell's value at 75 °C, bare under a header carrying its unit; "-" without one. */
function correctedMeasurementText(cell: EvaluatedMeasurementCell, headerUnit: string | null): string {
  const value = cell.corrected ?? null;
  if (cell.fixed !== null || value === null) return DASH;
  return headerUnit !== null && value.unit === headerUnit ? formatDecimalGroupedPtBr(value.raw) : value.text;
}

/**
 * One measurement test as one table; null for a test switched off and (2026-10-14, Bruno) for
 * one marked not run (`skipped`, E5's método "Não realizado"): neither prints a title, a
 * method or a criterion line. The other tests keep their numbers ("E6 · …").
 */
function measurementTestPart(block: BlockRow, test: MeasurementTestEvaluation, previous: PreviousReadings): SheetPart | null {
  // Story 23.9: a test the nameplate makes not applicable is omitted, as a switched-off one is (FR-11).
  if (!test.enabled || test.skipped || test.applicability.state === 'na') return null;
  // Batch e23t (Story 23.15, seed v13): a test corrected to 75 °C repeats its columns in a "75 °C" group after them.
  const corrected = test.temperature ?? null;
  const width = 1 + test.columns.length * (corrected === null ? 1 : 2);
  const rows: PrintRow[] = [bandRow(printLabel(test.title), width)];
  if (test.instrumentOf !== null) rows.push(lineRow(instrumentLine(block, test.testKey), width));
  // Batch e23t (Story 23.15): the temperature the values were corrected from, in e23v's print text ("TEMPERATURA: 30 °C (ÓLEO)").
  if (corrected !== null) rows.push(lineRow(`${TEMPERATURE_PRINT_LABEL}: ${corrected.print}`, width));
  if (test.valuesLine !== null) {
    rows.push(lineRow(test.valuesLine.parts.map((part) => `${printLabel(part.label)}: ${part.kind === 'choice' ? printLabel(part.text) : part.text}`).join(SEP), width));
  }
  const units = test.columns.map((column) => sharedUnit(test, column.col));
  const headers = test.columns.map((column, c) => (units[c] === null ? printLabel(column.label) : `${printLabel(column.label)} (${units[c]})`));
  if (corrected !== null) rows.push({ header: true, cells: [headerCell(''), headerCell('', test.columns.length), headerCell(corrected.printHeader, test.columns.length)] });
  rows.push(headerRow([printLabel(test.rowHeader), ...headers, ...(corrected === null ? [] : headers)]));
  for (const row of test.rows) {
    const atReference = corrected === null ? [] : row.cells.map((cell, c) => valueCell(correctedMeasurementText(cell, units[c] ?? null)));
    rows.push({ cells: [valueCell(printLabel(row.label)), ...row.cells.map((cell, c) => valueCell(measurementText(cell, units[c] ?? null))), ...atReference] });
  }
  if (test.reference !== null && test.reference.cells.some((cell) => cell.text !== null)) {
    rows.push({
      cells: [
        { text: printLabel(test.reference.label), bold: true, align: 'center' },
        ...test.reference.cells.map((cell, c) => valueCell(cell.text === null ? DASH : units[c] !== null && units[c] === cell.unit ? cell.value! : cell.text)),
        // Batch e23t (Story 23.15): under a corrected test's 75 °C group the reference row spans the doubled width.
        ...(corrected === null ? [] : [{ text: '', span: test.columns.length, align: 'center' as const }]),
      ],
    });
  }
  for (const group of test.groups) {
    if (group.text === '') continue;
    rows.push({ cells: [{ text: printLabel(group.label), bold: true, align: 'center' }, { text: group.text, span: width - 1, align: 'center' }] });
  }
  const printed: PrintTable = { ...fittedColumns(rows, width), rows };
  if (previous === null) return { kind: 'table', table: printed };
  // Story 22.12: each shown row's previous number cells, in column order (the reference and group rows take none).
  const texts = test.rows.map((row) =>
    previousRowText(
      previous.readings,
      row.cells.filter((cell) => cell.kind === 'number' && cell.fixed === null).map((cell) => cell.address),
    ),
  );
  // e22g (review N1): no column of "-" on a table none of whose rows has a previous value.
  if (texts.every((text) => text === DASH)) return { kind: 'table', table: printed };
  // Batch e24p (Story 24.15): the header names the previous visit's date on v14.
  return { kind: 'table', table: withPreviousColumn(printed, texts, previous.header) };
}

/**
 * Batch e24p (Story 24.16, seed v14): a measurement test's parts, its table and, under it, the note
 * slot of the rows its history rule flagged (`measurementHistoryNote`), the table kept with the line.
 * Every other test, and every test of v1 to v13, prints its table alone, as before.
 */
function measurementTestParts(block: BlockRow, test: MeasurementTestEvaluation, previous: PreviousReadings): SheetPart[] {
  const part = measurementTestPart(block, test, previous);
  if (part === null) return [];
  const note = measurementHistoryNote(block.seed_version, test);
  return note === null ? [part] : [{ ...part, keepWithNext: true }, { kind: 'paragraph', text: note }];
}

/** The measurement tests of a sheet that print, in the definition's order. */
function measurementParts(block: BlockRow, definition: BlockDefinition, previous: PreviousReadings, visit: VisitContext): SheetPart[] {
  // Batch e23t (Story 23.15): judged and corrected under the sheet's visit context, as on screen.
  return evaluateSheetMeasurements(block, definition, visit).flatMap((test) => measurementTestParts(block, test, previous));
}

// --- OBSERVAÇÕES and CONCLUSÃO ----------------------------------------------------------------

function observationsPart(block: BlockRow): SheetPart | null {
  const cell = block.sheet.observations;
  if (!isCellFilled(cell) || typeof cell!.value !== 'string') return null;
  return table([1], [bandRow(OBSERVATIONS_TITLE, 1), { cells: [{ text: cell!.value.trim(), align: 'left' }] }]);
}

/**
 * The result pair with an X in the chosen boxes, and the confirmed conclusion text under it:
 * an edited text always, a confirmed one while its basis is still the current one (AR-11);
 * never an unconfirmed or stale text, nor one of an incomplete pair. Story 22.2: the criteria
 * line no longer prints under it (the screen still shows it).
 */
function conclusionParts(block: BlockRow, definition: BlockDefinition, tag: string, visit: VisitContext): SheetPart[] {
  // Story 22.4: the X marks of the effective pair (the stricter of the floor and the stored pair);
  // e22f N2: of the chosen pair while the sheet is open, so the floor alone prints no mark.
  // Batch e23v (Stories 23.5 and 23.6): the sheet judged under its visit context, as on screen.
  const printed = printedConclusionPair(block, definition, visit);
  const chosen = new Set<string>([printed.result, printed.restriction].filter((value): value is ConclusionResult | ConclusionRestriction => value !== null));
  // e22f S1: a confirmed text the floor made stale prints the text composed now.
  const text = printedConclusionText(block, definition, tag, visit);
  const rows: PrintRow[] = [
    bandRow(CONCLUSION_TITLE, CONCLUSION_BOXES.length * 2),
    { cells: CONCLUSION_BOXES.flatMap(({ value, label }) => [{ text: printLabel(label), bold: true, align: 'left' as const }, valueCell(chosen.has(value) ? MARK : '')]) },
  ];
  if (text !== null) rows.push({ cells: [{ text: text.trim(), span: CONCLUSION_BOXES.length * 2, align: 'left' }] });
  return [table([1.4, 0.45, 1.5, 0.45, 2.1, 0.45, 4.55, 0.45], rows)];
}

// --- the reason band --------------------------------------------------------------------------

/** "NÃO ENSAIADO — Solicitação do cliente: ⟨justificativa⟩", the justification section 8 prints for it (the seed's, else the typed text). */
function notTestedPart(block: BlockRow): SheetPart {
  const reason = notTestedReasonText(block) ?? '';
  const justification = notTestedPointText(block).trim();
  const text = justification === '' || justification === reason ? `${NOT_TESTED_PREFIX} — ${reason}` : `${NOT_TESTED_PREFIX} — ${reason}: ${justification}`;
  return table([1], [bandRow(text, 1, { bold: false, align: 'left' })]);
}

// --- photos ---------------------------------------------------------------------------------------

/** A caption already closed by its own punctuation, a quote or parenthesis allowed after it ("Está oxidado?", "(ver nota.)"). */
const CLOSED_CAPTION = /[.!?…]["'”’»)\]]*$/u;

/** "Imagem 3: ⟨legenda⟩." (nothing added to a caption already closed), "Imagem 3." without a caption. */
function photoLine(n: number, caption: string | null): string {
  const text = (caption ?? '').trim();
  if (text === '') return `${photoRefLabel(n)}.`;
  return `${photoRefLabel(n)}: ${text}${CLOSED_CAPTION.test(text) ? '' : '.'}`;
}

/**
 * Photos as printed: "Imagem N: ⟨legenda⟩." or "Imagem N.". Story 17.4: a "Ler visor" display
 * shot is numbered like any photo; uncaptioned, its line carries its full stamp
 * ("Imagem 7: 06/09/2026 14:32 · …."), never the bare "Imagem 7.". Story 22.2: no item line
 * under a checklist item's photo. Story 22.3: a caption repeated inside the block takes an
 * ordinal ("… TR-1 (2)."), the numbers unchanged (`withCaptionOrdinals`).
 */
function printPhotos(ctx: Context, photos: readonly SnapshotPhoto[]): PrintPhoto[] {
  const numbered = photos.flatMap((photo) => {
    const number = ctx.numbers.get(photo.id);
    return number === undefined ? [] : [{ photo, number }];
  });
  // An uncaptioned display shot prints its stamp, which takes no ordinal.
  const captions = withCaptionOrdinals(numbered.map(({ photo }) => photo.caption));
  return numbered.map(({ photo, number }, i) => {
    const caption = photo.reading_kind === 'display' && isUncaptioned(photo.caption) ? photoStampFull(photo) : (captions[i] ?? null);
    return { fileId: photo.id, number, caption: photoLine(number, caption) };
  });
}

/**
 * The sheet's photos by `documentPhotoOrder`'s groups: the plate's, a checklist row's and the
 * rest, a display shot among them in capture order. Story 20.6: the three groups print
 * together, in that order, as the sheet's last part, one block (Story 22.3: one ordinal run).
 */
function sheetPhotos(ctx: Context, blockId: string): PrintPhoto[] {
  const groups = ctx.photos.sheets.get(blockId);
  if (groups === undefined) return [];
  return printPhotos(ctx, [...groups.plate, ...groups.items, ...groups.other]);
}

const photosPart = (photos: PrintPhoto[]): SheetPart[] => (photos.length === 0 ? [] : [{ kind: 'photos', photos }]);

// --- one sheet -------------------------------------------------------------------------------------

function sheetOf(ctx: Context, blockId: string, cabine: CabineLocation | null): PrintSheet | null {
  const block = ctx.blocks.get(blockId);
  if (block === undefined) return null;
  const tag = block.equipment_id === null ? '' : (ctx.tags.get(block.equipment_id) ?? '');
  const definition = definitionOf(ctx, block);
  const seed = sheetSeedOf(block.seed_version);
  const enabled = enabledSubBlocksOf(block);
  const parts: SheetPart[] = [];
  const sheet = (): PrintSheet => ({ blockId, title: sheetTitle(definition, block, tag), parts: keptTogether(parts) });
  if (cabine !== null && seed !== null) parts.push(...cabineParts(cabine, seed.cabine, siteAltitudeValue(ctx.snapshot.relatorio.setup)));
  const nameplate = definition !== null && enabled.has('nameplate') && definition.nameplate.length > 0;
  if (nameplate) parts.push(nameplatePart(ctx, block, definition));
  if (block.not_tested !== null) {
    // Story 22.3: the plate keeps with the reason band under it.
    if (nameplate) parts.push({ ...parts.pop()!, keepWithNext: true });
    // Stories 17.1 and 17.4: its photos print under it, in the walk's order (they no longer
    // print in section 7). Story 20.6: all of them after the reason band, plate first.
    parts.push(notTestedPart(block), ...photosPart(sheetPhotos(ctx, blockId)));
    return sheet();
  }
  if (definition === null) return sheet();

  const config = configPart(block, definition);
  if (config !== null) parts.push(config);
  // The walk splits items from the other photos by the same predicate.
  const checklist = sheetChecklistPrinted(block, definition) && seed !== null ? checklistPart(block, definition, seed.checklistColumns, ctx.definitions) : null;
  if (checklist !== null) parts.push(checklist);
  // Story 22.12: with a previous visit of another relatório, every reading table gets MANUT. ANTERIOR.
  const previous = previousReadingsOf(ctx, block, definition);
  // Batch e23v (Stories 23.5 and 23.6, seed v13): the sheet judged under its visit context (the cabine's ambient, the previous visit).
  const visit = visitContextOf(ctx.snapshot, block);
  for (const evaluation of evaluateSheetReadings(block, definition, visit)) parts.push(...testParts(block, definition, evaluation, enabled, previous));
  parts.push(...measurementParts(block, definition, previous, visit));
  const observations = enabled.has('observations') ? observationsPart(block) : null;
  if (observations !== null) parts.push(observations);
  if (enabled.has('conclusion')) {
    // Story 22.3: CONCLUSÃO never sits alone at the top of a page; it keeps with the part before it.
    if (parts.length > 0) parts.push({ ...parts.pop()!, keepWithNext: true });
    parts.push(...conclusionParts(block, definition, tag, visit));
  }
  // Story 20.6 (FR-68): one photo block closes the ficha, so no photo sits between its tables.
  parts.push(...photosPart(sheetPhotos(ctx, blockId)));
  return sheet();
}

/**
 * Story 22.3 (FR-68): a sheet's or a local's parts as they keep together on the page. Every
 * table before the photo block keeps its rows together (`keepRows`; a `keepWhole` table already
 * does), and a part keeps with the next only where one follows that is not the photo block,
 * which stays free to break (Story 20.6). Every sheet starts a page, so a sheet that fits on
 * it prints whole and a taller one breaks only at a joint left free: between two parts.
 */
function keptTogether(parts: readonly SheetPart[]): SheetPart[] {
  return parts.map((part, i): SheetPart => {
    const next = parts[i + 1];
    const keep = part.keepWithNext === true && next !== undefined && next.kind !== 'photos';
    switch (part.kind) {
      case 'table': {
        // Fix batch e23w (W2-K2): a copy keeps the table's corrected columns (`CORRECTED_COLUMNS`); e23p (P2): and its whole fit.
        const kept: PrintTable =
          part.table.keepWhole === true
            ? part.table
            : withWholeFit(withCorrectedColumns({ ...part.table, keepRows: true }, CORRECTED_COLUMNS.get(part.table) ?? []), WHOLE_FIT_TABLES.has(part.table));
        return keep ? { kind: 'table', table: kept, keepWithNext: true } : { kind: 'table', table: kept };
      }
      case 'photos':
        return { kind: 'photos', photos: part.photos };
      case 'paragraph':
        return keep ? { kind: 'paragraph', text: part.text, keepWithNext: true } : { kind: 'paragraph', text: part.text };
    }
  });
}

// --- section 9 ------------------------------------------------------------------------------------

/**
 * Section 9 of the layout spec: `groupForPrint`'s subsections numbered "N.k" across the
 * section, each with its sheets; the first sheet each cabine gets carries the cabine's SE and
 * environment. Story 14.2: a painel subsection is an unnumbered band (its name in upper
 * case) that the "N.k" counter skips, and a subsection `groupForPrint` emitted with no sheet
 * on purpose (that band over its type groups, or a local whose sheets all sit in painéis)
 * keeps its heading alone. Null when the relatório holds no sheet to print (the section
 * keeps its note).
 *
 * Story 14.4: on a relatório whose seed ships a site list (v4 or later) the local prints its
 * own parts instead: the first subsection of each local carries `localParts` (SE, AMBIENTE
 * DE ENSAIO, VERIFICAÇÕES DO LOCAL, the site items' photos), once per local under either
 * scheme, and no sheet of that local repeats the cabine's tables. A local with no sheet
 * still prints its heading and those parts, so the section is null only when it prints no
 * sheet and no local part. A relatório on v1 to v3 carries no local part and keeps the
 * cabine's tables on the first sheet of each cabine; for a local with no painel it prints
 * exactly as before. The one change that reaches every relatório, whatever its seed, comes
 * from `groupForPrint` (the 2026-10-13 criterion is not tied to a seed): with "Agrupar por
 * tipo" on, a type group under a painel is titled with the painel and the local, and a local
 * whose sheets all sit in painéis prints its own heading before its first painel.
 */
export function section9Layout(snapshot: RelatorioSnapshot, number: number, title: string): LayoutSectionSheets | null {
  const grouping = groupForPrint(snapshot);
  const ctx = contextOf(snapshot);
  const cabines = new Map(snapshot.locations.filter((location): location is CabineLocation => location.kind === 'cabine').map((location) => [location.id, location]));
  const seed = findSeed(snapshot.relatorio.seed_version);
  const siteList = seed?.site_checklist ?? null;
  const seen = new Set<string>();
  const subsections: PrintSheetSubsection[] = [];
  let numbered = 0;
  let printed = 0;
  for (const subsection of grouping.subsections) {
    // The local's own parts, once: on the first subsection `groupForPrint` emits for it.
    const cabine = cabines.get(subsection.cabineId) ?? null;
    const localParts = seed !== null && siteList !== null && cabine !== null && !seen.has(subsection.cabineId) ? localPartsOf(ctx, cabine, seed, siteList) : null;
    if (localParts !== null) seen.add(subsection.cabineId);
    const sheets: PrintSheet[] = [];
    for (const blockId of subsection.blockIds) {
      const first = !seen.has(subsection.cabineId);
      seen.add(subsection.cabineId);
      const sheet = sheetOf(ctx, blockId, first ? cabine : null);
      if (sheet !== null) sheets.push(sheet);
    }
    // A subsection whose every sheet failed to resolve is dropped, as before; one emitted empty on purpose, or carrying the local's parts, stands.
    if (sheets.length === 0 && subsection.blockIds.length > 0 && localParts === null) continue;
    printed += sheets.length + (localParts === null ? 0 : 1);
    const local = localParts === null ? {} : { localParts };
    if (subsection.kind === 'painel') {
      subsections.push({ heading: subsection.title.toLocaleUpperCase('pt-BR'), sheets, painel: true, ...local });
    } else {
      numbered += 1;
      subsections.push({ heading: `${number}.${numbered} ${subsection.title}`, sheets, ...local });
    }
  }
  if (printed === 0) return null;
  return { number, title, kind: 'sheets', subsections, warnings: grouping.warnings };
}
