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
import { configFieldsOf, evaluateSheetMeasurements, type EvaluatedMeasurementCell, type MeasurementTestEvaluation } from '../relatorio/measurement-evaluation.ts';
import { nameplateTagPrefill } from '../relatorio/nameplate-copy.ts';
import { isOilFieldExcused } from '../relatorio/oil-rule.ts';
import { evaluateSheetReadings, type EvaluatedCell, type EvaluatedRow, type EvaluatedTable, type TestEvaluation, type TestKey } from '../relatorio/readings.ts';
import { checklistResultOf } from '../relatorio/sheet-progress.ts';
import { enabledSubBlocksOf, isCellFilled } from '../relatorio/sheet-state.ts';
import { SITE_CHECKLIST_LABEL, siteObservationOf, siteResultOf } from '../relatorio/site-checklist.ts';
import { blockTypeLabel, notTestedReasonText } from '../relatorio/tree.ts';
import type { SubBlockKey } from '../schemas/block-config.ts';
import type { BlockRow, UserRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { findDefinition, findSeed, getSeed } from '../seed/definitions.ts';
import type { BlockDefinition, CabineDefinition, ColumnDef, FieldDef, ReportSeed, SiteChecklist, TableDef, TestDef } from '../seed/schema.ts';
import { blockRoleOf, groupForPrint, type PrintGroupWarning } from './group-for-print.ts';

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
 *
 * Story 14.5: a type with a configuration prints it as a CONFIGURAÇÃO table after DADOS DO
 * EQUIPAMENTO, and each measurement test switched on prints as one table after the seeded
 * tests: its title, its instrument line where it has a picker, how it was run (the values
 * line), the ACEITÁVEL line (criterion and source), the rows the configuration shows, the
 * lowest-of-column row where its criterion has one, and its grouped values. A test switched
 * off prints nothing, as a disabled sub-block does, and (2026-10-14, Bruno) so does one its
 * own value says was not run (E5 "Não realizado"). An out-of-criterion cell prints as any
 * other, the plain value with no mark, the seeded tables' convention.
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
  /** Story 14.4: the photos of each local's site items (no block, a `location_id`), in capture order. */
  sitePhotos: ReadonlyMap<string, SnapshotPhoto[]>;
}

function contextOf(snapshot: RelatorioSnapshot): Context {
  const photos = new Map<string, SnapshotPhoto[]>();
  const sitePhotos = new Map<string, SnapshotPhoto[]>();
  for (const photo of livePhotos(snapshot)) {
    // A row carrying both a block and a local is read as its block's.
    if (photo.block_id !== null) photos.set(photo.block_id, [...(photos.get(photo.block_id) ?? []), photo]);
    else if ((photo.location_id ?? null) !== null) sitePhotos.set(photo.location_id!, [...(sitePhotos.get(photo.location_id!) ?? []), photo]);
  }
  return {
    snapshot,
    blocks: new Map(snapshot.blocks.map((block) => [block.id, block])),
    tags: new Map(snapshot.equipment.map((row) => [row.id, row.tag])),
    actors: new Map(snapshot.actors.map((user) => [user.id, user])),
    numbers: numberPhotos(snapshot.files),
    photos,
    sitePhotos,
  };
}

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  return findDefinition(block.seed_version, block.block_type);
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
  // Story 14.9: a type may print its own title (the QGBT's `QGBT/QD's`) instead of its label.
  const label = definitionOf(block)?.print_title ?? blockTypeLabel(block.seed_version, block.block_type);
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

/**
 * CARACTERÍSTICAS DA SE and AMBIENTE DE ENSAIO, labels over values, "-" for a field not
 * filled. ALTITUDE is the relatório's since Story 12.3 (setup Etapa 5, `site_altitude_m`; no
 * sheet asks the cabine's, `relatorio/cabine.ts` SETUP_OWNED): a cabine value still wins when
 * one exists, else the setup's prints.
 */
function cabineParts(cabine: CabineLocation, definition: CabineDefinition, siteAltitudeM: number | null): SheetPart[] {
  const group = (title: string, fields: readonly FieldDef[], values: Record<string, unknown>): SheetPart =>
    table(
      fields.map(() => 1),
      [bandRow(title, fields.length), headerRow(fields.map((field) => printLabel(field.label))), { cells: fields.map((field) => valueCell(storedValueText(field, values[field.key]))) }],
    );
  const env: Record<string, unknown> = { ...(cabine.env as Record<string, unknown>) };
  if ((env.altitude_m === null || env.altitude_m === undefined) && siteAltitudeM !== null) {
    env.altitude_m = { raw: String(siteAltitudeM), unit: 'm', state: 'measured' };
  }
  return [group(CABINE_SE_TITLE, definition.se, cabine.se as Record<string, unknown>), group(CABINE_ENV_TITLE, definition.env, env)];
}

// --- DADOS DO EQUIPAMENTO ---------------------------------------------------------------------

/** Three label/value pairs per row. The TAG field with no cell of its own prints the block's TAG (E12-A2). */
function nameplatePart(ctx: Context, block: BlockRow, definition: BlockDefinition): SheetPart {
  const prefill = nameplateTagPrefill({ blocks: ctx.snapshot.blocks, equipment: ctx.snapshot.equipment }, block.id);
  const pairs = definition.nameplate.map((field) => {
    const cell = block.sheet.nameplate[field.key];
    // Story 14.11 (seed v6): an oil field of a non-oil unit prints "-" whatever is stored.
    const excused = isOilFieldExcused(block, field.key);
    const value = excused ? DASH : cell === undefined ? (field.key === 'tag' && prefill !== null ? prefill : DASH) : storedValueText(field, cell.value);
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
  return table(
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
  const keys = new Set<string>(list.groups.flatMap((group) => group.items.map((item) => item.key)));
  const photos: PrintPhoto[] = [];
  for (const photo of ctx.sitePhotos.get(cabine.id) ?? []) {
    const number = ctx.numbers.get(photo.id);
    if (number === undefined || photo.item_key === null || !keys.has(photo.item_key)) continue;
    photos.push({ fileId: photo.id, number, caption: photoLine(number, photo.caption) });
  }
  return [
    ...cabineParts(cabine, seed.cabine, ctx.snapshot.relatorio.setup.site_altitude_m),
    siteChecklistPart(cabine, list, seed.checklist_columns),
    ...photosPart(photos),
  ];
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
  const acceptable = bands === undefined ? evaluation.criterionText : evaluation.criterion === null ? DASH : bandValueText(evaluation.criterion.value);
  const labels: string[] = [...INSTRUMENT_LABELS, ...(parameter === null ? [] : [parameter]), acceptableLabel];
  const values = [
    text(header?.manufacturer),
    text(header?.model),
    text(header?.serial),
    text(header?.cert_number),
    ...(parameter === null ? [] : [text(header?.test_parameter)]),
    acceptable,
  ];
  return table(
    labels.map(() => 1),
    [bandRow(printLabel(test.label), labels.length), headerRow(labels), { cells: values.map(valueCell) }],
  );
}

/** A band's minimum as ACEITÁVEL prints it: pt-BR, at least one decimal ("0,5", "1,0", "0,25"). */
function bandValueText(value: number): string {
  const decimals = Math.max(1, (String(value).split('.')[1] ?? '').length);
  return value.toFixed(decimals).replace('.', ',');
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

/** Two tables of the same shape drawn as one, side by side, row by row, its columns fitted over the joined rows. */
function sideBySide(left: PrintTable, right: PrintTable): PrintTable {
  const rows = left.rows.map((row, i) => ({ ...row, cells: [...row.cells, ...right.rows[i]!.cells] }));
  return { columns: fittedColumns(rows, left.columns.length + right.columns.length), rows };
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
  return table([1.6, 1.7, 1.6, 1.7, 1.6, 1.7], rows);
}

/** The block's configuration in force (the stored options, else the defaults), or null for a type with none. */
function configPart(block: BlockRow, definition: BlockDefinition): SheetPart | null {
  const fields = configFieldsOf(block, definition);
  if (fields.length === 0) return null;
  return pairsTable(
    CONFIG_TITLE,
    fields.map((field) => ({ label: printLabel(field.label), value: printLabel(field.valueLabel) })),
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
  if (cell.state === 'invalid') return cell.raw.trim() === '' ? DASH : cell.raw;
  if (cell.state !== 'measured') return DASH;
  if (cell.kind === 'choice') return printLabel(cell.displayText);
  return headerUnit === null ? withUnit(cell.displayText, cell.unit) : cell.displayText;
}

/**
 * One measurement test as one table; null for a test switched off and (2026-10-14, Bruno) for
 * one marked not run (`skipped`, E5's método "Não realizado"): neither prints a title, a
 * method or a criterion line. The other tests keep their numbers ("E6 · …").
 */
function measurementTestPart(block: BlockRow, test: MeasurementTestEvaluation): SheetPart | null {
  if (!test.enabled || test.skipped) return null;
  const width = 1 + test.columns.length;
  const rows: PrintRow[] = [bandRow(printLabel(test.title), width)];
  if (test.instrumentOf !== null) rows.push(lineRow(instrumentLine(block, test.testKey), width));
  if (test.valuesLine !== null) {
    rows.push(lineRow(test.valuesLine.parts.map((part) => `${printLabel(part.label)}: ${part.kind === 'choice' ? printLabel(part.text) : part.text}`).join(SEP), width));
  }
  rows.push(lineRow(`${ACCEPTABLE_LABEL}: ${test.criterionText}${SEP}${test.sourceName}`, width));
  const units = test.columns.map((column) => sharedUnit(test, column.col));
  rows.push(headerRow([printLabel(test.rowHeader), ...test.columns.map((column, c) => (units[c] === null ? printLabel(column.label) : `${printLabel(column.label)} (${units[c]})`))]));
  for (const row of test.rows) {
    rows.push({ cells: [valueCell(printLabel(row.label)), ...row.cells.map((cell, c) => valueCell(measurementText(cell, units[c] ?? null)))] });
  }
  if (test.reference !== null && test.reference.cells.some((cell) => cell.text !== null)) {
    rows.push({
      cells: [
        { text: printLabel(test.reference.label), bold: true, align: 'center' },
        ...test.reference.cells.map((cell, c) => valueCell(cell.text === null ? DASH : units[c] !== null && units[c] === cell.unit ? cell.value! : cell.text)),
      ],
    });
  }
  for (const group of test.groups) {
    if (group.text === '') continue;
    rows.push({ cells: [{ text: printLabel(group.label), bold: true, align: 'center' }, { text: group.text, span: test.columns.length, align: 'center' }] });
  }
  return { kind: 'table', table: { columns: fittedColumns(rows, width), rows } };
}

/** The measurement tests of a sheet that print, in the definition's order. */
function measurementParts(block: BlockRow, definition: BlockDefinition): SheetPart[] {
  return evaluateSheetMeasurements(block, definition).flatMap((test) => {
    const part = measurementTestPart(block, test);
    return part === null ? [] : [part];
  });
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

/** A caption already closed by its own punctuation, a quote or parenthesis allowed after it ("Está oxidado?", "(ver nota.)"). */
const CLOSED_CAPTION = /[.!?…]["'”’»)\]]*$/u;

/** "Imagem 3: ⟨legenda⟩." (nothing added to a caption already closed), "Imagem 3." without a caption. */
function photoLine(n: number, caption: string | null): string {
  const text = (caption ?? '').trim();
  if (text === '') return `${photoRefLabel(n)}.`;
  return `${photoRefLabel(n)}: ${text}${CLOSED_CAPTION.test(text) ? '' : '.'}`;
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
  if (cabine !== null && seed !== null) parts.push(...cabineParts(cabine, seed.cabine, ctx.snapshot.relatorio.setup.site_altitude_m));
  const nameplate = definition !== null && enabled.has('nameplate') && definition.nameplate.length > 0;
  if (nameplate) parts.push(nameplatePart(ctx, block, definition));
  const sheet = { blockId, title: sheetTitle(block, tag), attribution: attributionOf(block, ctx.actors), parts };
  if (block.not_tested !== null) {
    parts.push(notTestedPart(block));
    return sheet;
  }
  if (definition === null) return sheet;

  const config = configPart(block, definition);
  if (config !== null) parts.push(config);
  const checklist = enabled.has('checklist') && seed !== null ? checklistPart(block, definition, seed.checklistColumns) : null;
  const photos = sheetPhotos(ctx, blockId, checklist !== null);
  parts.push(...photosPart(photos.plate));
  if (checklist !== null) parts.push(checklist, ...photosPart(photos.items));
  for (const evaluation of evaluateSheetReadings(block, definition)) parts.push(...testParts(block, definition, evaluation, enabled));
  parts.push(...measurementParts(block, definition));
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
