import { formatDateTime } from '../format/datetime.ts';
import { formatDecimalGroupedPtBr } from '../parse/pt-br-number.ts';
import { numberPhotos, photoRefLabel } from '../photos/numbering.ts';
import { livePhotos, type SnapshotPhoto } from '../photos/order.ts';
import { notTestedPointText } from '../points/derived.ts';
import { wordRegistryRowText, type WordRow } from '../registry/word-row.ts';
import type { CabineLocation } from '../relatorio/cabine.ts';
import {
  composeConclusion,
  conclusionPairComplete,
  conclusionRestrictionOf,
  conclusionResultOf,
  conclusionTextForPrint,
  conclusionTextState,
  conclusionTextStatusOf,
  type ConclusionRestriction,
  type ConclusionResult,
} from '../relatorio/conclusion.ts';
import { fieldValueText } from '../relatorio/ficha.ts';
import { storedInstrumentHeader } from '../relatorio/instrument-pick.ts';
import { nameplateTagPrefill } from '../relatorio/nameplate-copy.ts';
import { evaluateSheetReadings, type EvaluatedCell, type EvaluatedRow, type EvaluatedTable, type TestEvaluation, type TestKey } from '../relatorio/readings.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from '../relatorio/sheet-state.ts';
import { blockTypeLabel, notTestedReasonText } from '../relatorio/tree.ts';
import type { SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, UserRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition, getSeed } from '../seed/definitions.ts';
import type { BlockDefinition, CabineDefinition, ColumnDef, FieldDef, TableDef, TestDef } from '../seed/schema.ts';
import { blockRoleOf, groupForPrint, type PrintGroupWarning } from './group-for-print.ts';
import type { DocumentLayout } from './layout.ts';

/*
 * Story 7.1 (FR-68, AR-11, NFR-17), Story 7.2 AC2 and E12-A2: section 9 as data. Every sheet
 * becomes a generic printable model -- tables of cells, photo rows and caption lines -- with
 * every string composed here, so `apps/api/src/jobs/generate/sections/section-9.ts` only
 * draws: widths, borders, shading, spans, images and page breaks (AD-1/AD-13, AD-15).
 *
 * A sheet prints in FO.SERV-03's order (`imports/extract-fo-serv-03.md` §2): the title bar,
 * the attribution line, the cabine's SE and environment on the cabine's first sheet (the
 * first one `groupForPrint` emits for it), DADOS DO EQUIPAMENTO, the plate photos,
 * VERIFICAÇÕES GERAIS, the checklist photos, one block per enabled test (instrument header,
 * criterion line, tables), the other photos, OBSERVAÇÕES and CONCLUSÃO. A switched-off
 * sub-block is omitted; the four uncaptured insulation columns are grid columns and print
 * "-". A Não ensaiada sheet prints its plate and a reason band, nothing else. Labels are
 * the seed's strings in caps (the screen shows them sentence-cased); values print as stored.
 * Cells hold only confirmed values, so no suggestion is ever read.
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
}

export interface PrintTable {
  /** Relative column widths, spread over the page's content width by the renderer. */
  columns: number[];
  rows: PrintRow[];
}

export interface PrintPhoto {
  fileId: string;
  /** The photo's number, the same `numberPhotos` gives section 7. */
  number: number;
  /** The line under the photo: "Imagem 3: ⟨legenda⟩." or "Imagem 3.". */
  caption: string;
}

export type SheetPart = { kind: 'table'; table: PrintTable } | { kind: 'photos'; photos: PrintPhoto[] } | { kind: 'paragraph'; text: string };

export interface PrintSheet {
  blockId: string;
  /** The grey title bar: type, role and TAG ("CHAVE SECCIONADORA DE ENTRADA SEC-C01"). */
  title: string;
  /** "Concluída por Bruno · 06/09/2026 10:02", "Preenchido por …", or null. */
  attribution: string | null;
  parts: SheetPart[];
}

export interface PrintSheetSubsection {
  /** "9.1 Cubículo Enel": printed as Heading 2. */
  heading: string;
  sheets: PrintSheet[];
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
const NAMEPLATE_TITLE = 'DADOS DO EQUIPAMENTO';
const CHECKLIST_TITLE = 'VERIFICAÇÕES GERAIS';
const OBSERVATIONS_TITLE = 'OBSERVAÇÕES';
const CONCLUSION_TITLE = 'CONCLUSÃO';
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
/** The mark in a chosen C/NC/NA or CONCLUSÃO box, and what an uncaptured value prints. */
const MARK = 'X';
const DASH = '-';

// authored: the prefix of a test's criterion line, "CRITÉRIO: >400 MΩ · aceitável na ficha".
const CRITERION_PREFIX = 'CRITÉRIO';
// authored: the reason band of a sheet marked not tested (open question for Bruno).
const NOT_TESTED_PREFIX = 'NÃO ENSAIADO';
// authored: the attribution line's verbs, after the Sheet header's ("Concluída por Bruno · 06/09 10:02").
const CONCLUDED_BY = 'Concluída por';
const FILLED_BY = 'Preenchido por';
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

/** A number and its unit ("3.300 MΩ"), the number alone without a unit. */
function withUnit(text: string, unit: string | null | undefined): string {
  return unit === null || unit === undefined || unit === '' ? text : `${text} ${unit}`;
}

/**
 * A stored field value as the document prints it: numbers pt-BR with their unit (the stored
 * one, else the field's), a voltage class with " kV", a date dd/mm/aaaa (a date typed in
 * another shape as stored), text as typed; "-" when empty. Never uppercased.
 */
function storedValueText(field: Pick<FieldDef, 'kind' | 'unit'>, value: unknown): string {
  if (value === null || value === undefined) return DASH;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const number = value as { raw?: unknown; unit?: unknown; state?: unknown };
    if (typeof number.raw !== 'string') return DASH;
    const text = fieldValueText(field, { raw: number.raw, state: number.state });
    if (text.trim() === '') return DASH;
    return withUnit(text, typeof number.unit === 'string' ? number.unit : (field.unit ?? null));
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return DASH;
    if (field.kind === 'voltage_class') return wordRegistryRowText({ kind: 'voltage_class', name: value } as WordRow).primary;
    const text = fieldValueText(field, value);
    return text === '' ? value : text;
  }
  return fieldValueText(field, value);
}

// --- the context of one render -----------------------------------------------------------------

interface Context {
  snapshot: RelatorioSnapshot;
  blocks: ReadonlyMap<string, BlockRow>;
  tags: ReadonlyMap<string, string>;
  actors: ReadonlyMap<string, UserRow>;
  numbers: ReadonlyMap<string, number>;
  photos: ReadonlyMap<string, SnapshotPhoto[]>;
}

function contextOf(snapshot: RelatorioSnapshot): Context {
  const photos = new Map<string, SnapshotPhoto[]>();
  for (const photo of livePhotos(snapshot)) {
    if (photo.block_id !== null) photos.set(photo.block_id, [...(photos.get(photo.block_id) ?? []), photo]);
  }
  return {
    snapshot,
    blocks: new Map(snapshot.blocks.map((block) => [block.id, block])),
    tags: new Map(snapshot.equipment.map((row) => [row.id, row.tag])),
    actors: new Map(snapshot.actors.map((user) => [user.id, user])),
    numbers: numberPhotos(snapshot.files),
    photos,
  };
}

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
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

// --- the title and the attribution -------------------------------------------------------------

/** Type, role and TAG: "CHAVE SECCIONADORA DE ENTRADA SEC-C01", "CABOS DE ALIMENTAÇÃO CB-TR1"; the TAG as stored. */
function sheetTitle(block: BlockRow, tag: string): string {
  const label = blockTypeLabel(block.seed_version, block.block_type);
  const role = blockRoleOf(block);
  let type = label;
  if (role === 'alimentacao') type = block.block_type === 'cabos_saida' ? CABOS_DE_ALIMENTACAO : `${label} ${ROLE_WORDS.alimentacao}`;
  else if (role !== null && !label.toLocaleLowerCase('pt-BR').endsWith(ROLE_WORDS[role])) type = `${label} ${ROLE_WORDS[role]}`;
  const printed = printLabel(type);
  const trimmed = tag.trim();
  return trimmed === '' ? printed : `${printed} ${trimmed}`;
}

function attributed(verb: string, actor: UserRow | undefined, at: string): string | null {
  const name = actor?.name.trim() ?? '';
  const when = formatDateTime(at);
  return name === '' || when === '' ? null : `${verb} ${name}${SEP}${when}`;
}

/** Who concluded the sheet and when, else who last filled it; null for an unknown actor or no timestamp. */
function attributionOf(block: BlockRow, actors: ReadonlyMap<string, UserRow>): string | null {
  const concluded = block.concluded_by === null ? null : attributed(CONCLUDED_BY, actors.get(block.concluded_by.actor_id), block.concluded_by.at);
  if (concluded !== null) return concluded;
  if (block.last_modified_by === null || block.last_modified_at === null) return null;
  return attributed(FILLED_BY, actors.get(block.last_modified_by), block.last_modified_at);
}

// --- the cabine block -------------------------------------------------------------------------

/** CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO, labels over values, "-" for a field not filled. */
function cabineParts(cabine: CabineLocation, definition: CabineDefinition): SheetPart[] {
  const group = (title: string, fields: readonly FieldDef[], values: Record<string, unknown>): SheetPart =>
    table(
      fields.map(() => 1),
      [bandRow(title, fields.length), headerRow(fields.map((field) => printLabel(field.label))), { cells: fields.map((field) => valueCell(storedValueText(field, values[field.key]))) }],
    );
  return [group(CABINE_SE_TITLE, definition.se, cabine.se as Record<string, unknown>), group(CABINE_ENV_TITLE, definition.env, cabine.env as Record<string, unknown>)];
}

// --- DADOS DO EQUIPAMENTO ---------------------------------------------------------------------

/** Three label/value pairs per row. The TAG field with no cell of its own prints the block's TAG (E12-A2). */
function nameplatePart(ctx: Context, block: BlockRow, definition: BlockDefinition): SheetPart {
  const prefill = nameplateTagPrefill({ blocks: ctx.snapshot.blocks, equipment: ctx.snapshot.equipment }, block.id);
  const pairs = definition.nameplate.map((field) => {
    const cell = block.sheet.nameplate[field.key];
    const value = cell === undefined ? (field.key === 'tag' && prefill !== null ? prefill : DASH) : storedValueText(field, cell.value);
    return [{ text: printLabel(field.label), bold: true, align: 'left' as const }, { text: value, align: 'left' as const }];
  });
  const rows: PrintRow[] = [bandRow(NAMEPLATE_TITLE, 6)];
  for (let i = 0; i < pairs.length; i += 3) {
    const cells = pairs.slice(i, i + 3).flat();
    while (cells.length < 6) cells.push({ text: '', align: 'left' });
    rows.push({ cells });
  }
  return table([1.6, 1.7, 1.6, 1.7, 1.6, 1.7], rows);
}

// --- VERIFICAÇÕES GERAIS ------------------------------------------------------------------------

/** The seed's normalized columns (ÍTEM · C · NC · NA · OBSERVAÇÕES); "⟨n⟩. ⟨ITEM⟩", an X in the chosen box, the observation. */
function checklistPart(block: BlockRow, definition: BlockDefinition, columns: readonly string[]): SheetPart | null {
  if (definition.checklist === null) return null;
  const items = definition.checklist;
  const last = columns.length - 1;
  const rows: PrintRow[] = [bandRow(CHECKLIST_TITLE, columns.length), headerRow(columns.map(printLabel))];
  items.forEach((item, index) => {
    const result = checklistResultOf(block, item.key);
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
  return table(
    columns.map((column, c) => (c === 0 ? 5 : column === 'C' || column === 'NC' || column === 'NA' ? 0.6 : 3.4)),
    rows,
  );
}

// --- one test ----------------------------------------------------------------------------------

/** The instrument header copied onto the sheet (AR-18), "-" where it holds nothing, and the criterion. */
function instrumentPart(block: BlockRow, test: TestDef, evaluation: TestEvaluation): SheetPart {
  const header = storedInstrumentHeader(block.sheet.test[test.key]?.instrument?.value);
  const text = (value: string | null | undefined) => (value === null || value === undefined || value.trim() === '' ? DASH : value);
  const parameter = TEST_PARAMETER_LABEL[test.key];
  const labels: string[] = [...INSTRUMENT_LABELS, ...(parameter === null ? [] : [parameter]), ACCEPTABLE_LABEL];
  const values = [
    text(header?.manufacturer),
    text(header?.model),
    text(header?.serial),
    text(header?.cert_number),
    ...(parameter === null ? [] : [text(header?.test_parameter)]),
    evaluation.criterionText,
  ];
  return table(
    labels.map(() => 1),
    [bandRow(printLabel(test.label), labels.length), headerRow(labels), { cells: values.map(valueCell) }],
  );
}

/** The measured units under a VALORES header: one prints "VALORES (GΩ)", several "VALORES"; none falls back to the seed's column unit. */
function valoresHeader(cols: readonly number[], evaluated: EvaluatedTable, columns: readonly ColumnDef[]): string {
  const measured = new Set<string>();
  for (const row of evaluated.rows) {
    for (const cell of row.cells) if (cols.includes(cell.address.col) && cell.state === 'measured' && cell.unit !== null) measured.add(cell.unit);
  }
  const seeded = new Set(cols.map((col) => columns[col]?.unit ?? null).filter((unit): unit is string => unit !== null));
  const units = measured.size > 0 ? measured : seeded;
  return units.size === 1 ? `${VALORES} (${[...units][0]})` : VALORES;
}

/** One header row, or two where the seed groups its columns (PONTO DE ENSAIO/CONEXÃO over LINHA · TERRA · GUARD). */
function measurementHeader(definition: TableDef, evaluated: EvaluatedTable): PrintRow[] {
  const values = definition.value_columns;
  const columnLabel = (column: ColumnDef, col: number) => (column.label === VALORES ? valoresHeader([col], evaluated, values) : printLabel(column.label));
  const bottom = headerRow([...definition.connection_columns.map(printLabel), ...values.map(columnLabel)]);
  if (definition.connection_group === undefined && !values.some((column) => column.group !== undefined)) return [bottom];
  const top: PrintCell[] = [];
  if (definition.connection_group !== undefined) top.push(headerCell(printLabel(definition.connection_group), definition.connection_columns.length));
  else for (let i = 0; i < definition.connection_columns.length; i++) top.push(headerCell(''));
  for (let i = 0; i < values.length; ) {
    const group = values[i]!.group;
    let end = i + 1;
    if (group !== undefined) while (end < values.length && values[end]!.group === group) end++;
    const cols = Array.from({ length: end - i }, (_, k) => i + k);
    top.push(headerCell(group === undefined ? '' : group === VALORES ? valoresHeader(cols, evaluated, values) : printLabel(group), end - i));
    i = end;
  }
  return [{ header: true, cells: top }, bottom];
}

/** A typed reading: the number with its own unit, "-" when not measured or empty; an untyped ratio input reads the nameplate. */
function readingText(cell: EvaluatedCell, column: ColumnDef): string {
  if (cell.state === 'measured') return withUnit(cell.displayText, cell.unit);
  if (cell.state === 'invalid') return cell.raw.trim() === '' ? DASH : cell.raw;
  if (cell.state === 'empty' && cell.fallback !== null) return withUnit(cell.fallback.text, column.unit);
  return DASH;
}

/** A `print` column's cell: "-", but ABSORÇÃO and POLARIZAÇÃO print what `ia_ip_display` stored. */
function printColumnText(block: BlockRow, testKey: TestKey, row: number, col: number, column: ColumnDef, enabled: ReadonlySet<SubBlockKey>): string {
  if (!IA_IP_COLUMNS.has(column.label) || !enabled.has('ia_ip_display')) return DASH;
  const value = block.sheet.test[testKey]?.cells[String(row)]?.[String(col)]?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DASH;
  const number = value as { raw?: unknown; unit?: unknown; state?: unknown };
  if (number.state !== 'measured' || typeof number.raw !== 'string' || !/^-?\d+(\.\d+)?$/.test(number.raw)) return DASH;
  return withUnit(formatDecimalGroupedPtBr(number.raw), typeof number.unit === 'string' ? number.unit : null);
}

function valueText(block: BlockRow, testKey: TestKey, row: EvaluatedRow, evaluated: EvaluatedTable, col: number, column: ColumnDef, enabled: ReadonlySet<SubBlockKey>): string {
  switch (column.role) {
    case 'capture':
    case 'input': {
      const cell = row.cells.find((candidate) => candidate.address.col === col);
      return cell === undefined ? DASH : readingText(cell, column);
    }
    case 'derived':
      return evaluated.columns.find((visible) => visible.col === col)?.derivedKind === 'condicao' ? (row.condicao ?? DASH) : (row.calculated?.text ?? DASH);
    case 'print':
      return printColumnText(block, testKey, row.row, col, column, enabled);
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
 * Column weights from what each column holds in its own cells (a cell spanning several
 * columns is left out): every column gets at least its longest word, so nothing breaks
 * inside a word ("POLARIZAÇÃO", "SECUNDÁRIO"), and a short text stays on one line while
 * the row still fits the page; what is left is shared out by what each column still asks.
 */
function fittedColumns(rows: readonly PrintRow[], count: number): number[] {
  const least = new Array<number>(count).fill(0);
  const whole = new Array<number>(count).fill(0);
  for (const row of rows) {
    let col = 0;
    for (const cell of row.cells) {
      const span = cell.span ?? 1;
      if (span === 1 && col < count) {
        const bold = cell.bold === true;
        const word = Math.max(0, ...cell.text.split(/\s+/).map((part) => emWidth(part, bold)));
        least[col] = Math.max(least[col]!, word);
        whole[col] = Math.max(whole[col]!, [...cell.text].length <= SHORT_TEXT ? emWidth(cell.text, bold) : word);
      }
      col += span;
    }
  }
  const minimum = least.map((em) => Math.max(em, 1.5) + CELL_ALLOWANCE_EM);
  const preferred = whole.map((em, col) => Math.max(em + CELL_ALLOWANCE_EM, minimum[col]!));
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
  if (sum(preferred) <= CONTENT_WIDTH_EM) return preferred;
  const room = CONTENT_WIDTH_EM - sum(minimum);
  const asked = sum(preferred) - sum(minimum);
  if (room <= 0 || asked <= 0) return minimum;
  return minimum.map((em, col) => em + (room * (preferred[col]! - em)) / asked);
}

/** One measurement table: its title band, its header, then one row per connection with every value column. */
function measurementTable(block: BlockRow, testKey: TestKey, definition: TableDef, evaluated: EvaluatedTable, enabled: ReadonlySet<SubBlockKey>): PrintTable {
  const width = definition.connection_columns.length + definition.value_columns.length;
  const rows: PrintRow[] = [];
  if (definition.title !== undefined) rows.push(bandRow(printLabel(definition.title), width));
  rows.push(...measurementHeader(definition, evaluated));
  definition.rows.forEach((connection, r) => {
    const row = evaluated.rows[r]!;
    rows.push({
      cells: [
        ...connection.map((text) => valueCell(definition.connection_typed && text.trim() === '' ? DASH : printLabel(text))),
        ...definition.value_columns.map((column, col) => valueCell(valueText(block, testKey, row, evaluated, col, column, enabled))),
      ],
    });
  });
  return { columns: fittedColumns(rows, width), rows };
}

/** A titled table with one header row and no column groups: the shape FO.SERV-03 prints side by side (contato aberto · fechado). */
function simpleTitled(definition: TableDef): boolean {
  return definition.title !== undefined && definition.connection_group === undefined && definition.value_columns.every((column) => column.group === undefined);
}

/** Two tables of the same shape drawn as one, side by side, row by row. */
function sideBySide(left: PrintTable, right: PrintTable): PrintTable {
  return {
    columns: [...left.columns, ...right.columns],
    rows: left.rows.map((row, i) => ({ ...row, cells: [...row.cells, ...right.rows[i]!.cells] })),
  };
}

function testParts(block: BlockRow, definition: BlockDefinition, evaluation: TestEvaluation, enabled: ReadonlySet<SubBlockKey>): SheetPart[] {
  const test = definition.tests.find((candidate) => candidate.key === evaluation.testKey);
  if (test === undefined) return [];
  const tables = test.tables.map((tableDef, i) => measurementTable(block, test.key, tableDef, evaluation.tables[i]!, enabled));
  // FO.SERV-03 prints the seccionadora's and the disjuntor's contato aberto and contato
  // fechado tables side by side (`extract-fo-serv-03.md` §2, modelos 3 and 4).
  const [first, second] = test.tables;
  const paired =
    tables.length === 2 && first !== undefined && second !== undefined && simpleTitled(first) && simpleTitled(second) && first.rows.length === second.rows.length && tables[0]!.columns.length === tables[1]!.columns.length;
  return [
    instrumentPart(block, test, evaluation),
    { kind: 'paragraph', text: `${CRITERION_PREFIX}: ${evaluation.criterionText}${SEP}${evaluation.sourceName}` },
    ...(paired ? [sideBySide(tables[0]!, tables[1]!)] : tables).map((printed): SheetPart => ({ kind: 'table', table: printed })),
  ];
}

// --- OBSERVAÇÕES and CONCLUSÃO ----------------------------------------------------------------

function observationsPart(block: BlockRow): SheetPart | null {
  const cell = block.sheet.observations;
  if (!isCellFilled(cell) || typeof cell!.value !== 'string') return null;
  return table([1], [bandRow(OBSERVATIONS_TITLE, 1), { cells: [{ text: cell!.value.trim(), align: 'left' }] }]);
}

/**
 * The result pair with an X in the chosen boxes, and the confirmed conclusion text under it
 * with its criteria line: an edited text always, a confirmed one while its basis is still
 * the current one (AR-11); never an unconfirmed or stale text, nor one of an incomplete pair.
 */
function conclusionParts(block: BlockRow, definition: BlockDefinition, tag: string): SheetPart[] {
  const chosen = new Set<string>([conclusionResultOf(block), conclusionRestrictionOf(block)].filter((value): value is ConclusionResult | ConclusionRestriction => value !== null));
  const composed = composeConclusion(block, definition, tag);
  const status = conclusionTextStatusOf(block);
  const printable = conclusionPairComplete(block) && (status === 'edited' || (status === 'confirmed' && conclusionTextState(block, composed) === 'confirmed'));
  const text = printable ? conclusionTextForPrint(block) : null;
  const rows: PrintRow[] = [
    bandRow(CONCLUSION_TITLE, CONCLUSION_BOXES.length * 2),
    { cells: CONCLUSION_BOXES.flatMap(({ value, label }) => [{ text: printLabel(label), bold: true, align: 'left' as const }, valueCell(chosen.has(value) ? MARK : '')]) },
  ];
  if (text !== null) rows.push({ cells: [{ text: text.trim(), span: CONCLUSION_BOXES.length * 2, align: 'left' }] });
  const parts: SheetPart[] = [table([1.4, 0.45, 1.5, 0.45, 2.1, 0.45, 4.55, 0.45], rows)];
  if (text !== null && composed.criteriaLine !== '') parts.push({ kind: 'paragraph', text: composed.criteriaLine });
  return parts;
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

/** "Imagem 3: ⟨legenda⟩." (no second period after a caption that ends in one), "Imagem 3." without a caption. */
function photoLine(n: number, caption: string | null): string {
  const text = (caption ?? '').trim();
  if (text === '') return `${photoRefLabel(n)}.`;
  return `${photoRefLabel(n)}: ${text}${text.endsWith('.') ? '' : '.'}`;
}

/** The sheet's photos by where they print: the plate's after the nameplate, a checklist row's after the checklist, the rest after the tests. */
function sheetPhotos(ctx: Context, blockId: string, checklistPrinted: boolean): { plate: PrintPhoto[]; items: PrintPhoto[]; other: PrintPhoto[] } {
  const out = { plate: [] as PrintPhoto[], items: [] as PrintPhoto[], other: [] as PrintPhoto[] };
  for (const photo of ctx.photos.get(blockId) ?? []) {
    const number = ctx.numbers.get(photo.id);
    if (number === undefined) continue;
    const printed: PrintPhoto = { fileId: photo.id, number, caption: photoLine(number, photo.caption) };
    if (photo.item_key !== null && checklistPrinted) out.items.push(printed);
    else if (photo.item_key === null && photo.reading_kind === 'plate') out.plate.push(printed);
    else out.other.push(printed);
  }
  return out;
}

const photosPart = (photos: PrintPhoto[]): SheetPart[] => (photos.length === 0 ? [] : [{ kind: 'photos', photos }]);

// --- one sheet -------------------------------------------------------------------------------------

function sheetOf(ctx: Context, blockId: string, cabine: CabineLocation | null): PrintSheet | null {
  const block = ctx.blocks.get(blockId);
  if (block === undefined) return null;
  const tag = block.equipment_id === null ? '' : (ctx.tags.get(block.equipment_id) ?? '');
  const definition = definitionOf(block);
  const seed = sheetSeedOf(block.seed_version);
  const enabled = enabledSubBlocksOf(block);
  const parts: SheetPart[] = [];
  if (cabine !== null && seed !== null) parts.push(...cabineParts(cabine, seed.cabine));
  const nameplate = definition !== null && enabled.has('nameplate') && definition.nameplate.length > 0;
  if (nameplate) parts.push(nameplatePart(ctx, block, definition));
  const sheet = { blockId, title: sheetTitle(block, tag), attribution: attributionOf(block, ctx.actors), parts };
  if (block.not_tested !== null) {
    parts.push(notTestedPart(block));
    return sheet;
  }
  if (definition === null) return sheet;

  const checklist = enabled.has('checklist') && seed !== null ? checklistPart(block, definition, seed.checklistColumns) : null;
  const photos = sheetPhotos(ctx, blockId, checklist !== null);
  parts.push(...photosPart(photos.plate));
  if (checklist !== null) parts.push(checklist, ...photosPart(photos.items));
  for (const evaluation of evaluateSheetReadings(block, definition)) parts.push(...testParts(block, definition, evaluation, enabled));
  parts.push(...photosPart(photos.other));
  const observations = enabled.has('observations') ? observationsPart(block) : null;
  if (observations !== null) parts.push(observations);
  if (enabled.has('conclusion')) parts.push(...conclusionParts(block, definition, tag));
  return sheet;
}

// --- section 9 ------------------------------------------------------------------------------------

/**
 * Section 9 of the layout spec: `groupForPrint`'s subsections numbered "N.k" across the
 * section, each with its sheets; the first sheet each cabine gets carries the cabine's SE and
 * environment. Null when the relatório holds no sheet to print (the section keeps its note).
 */
export function section9Layout(snapshot: RelatorioSnapshot, number: number, title: string): LayoutSectionSheets | null {
  const grouping = groupForPrint(snapshot);
  const ctx = contextOf(snapshot);
  const cabines = new Map(snapshot.locations.filter((location): location is CabineLocation => location.kind === 'cabine').map((location) => [location.id, location]));
  const seen = new Set<string>();
  const subsections: PrintSheetSubsection[] = [];
  for (const subsection of grouping.subsections) {
    const sheets: PrintSheet[] = [];
    for (const blockId of subsection.blockIds) {
      const first = !seen.has(subsection.cabineId);
      seen.add(subsection.cabineId);
      const sheet = sheetOf(ctx, blockId, first ? (cabines.get(subsection.cabineId) ?? null) : null);
      if (sheet !== null) sheets.push(sheet);
    }
    if (sheets.length > 0) subsections.push({ heading: `${number}.${subsections.length + 1} ${subsection.title}`, sheets });
  }
  if (subsections.length === 0) return null;
  return { number, title, kind: 'sheets', subsections, warnings: grouping.warnings };
}

/** Every photo a sheet of the layout prints, once, in print order: the `print` variants the job loads. */
export function layoutPhotoIds(layout: Pick<DocumentLayout, 'sections'>): string[] {
  const ids: string[] = [];
  for (const section of layout.sections) {
    if (section.kind !== 'sheets') continue;
    for (const subsection of section.subsections) {
      for (const sheet of subsection.sheets) {
        for (const part of sheet.parts) if (part.kind === 'photos') for (const photo of part.photos) if (!ids.includes(photo.fileId)) ids.push(photo.fileId);
      }
    }
  }
  return ids;
}
