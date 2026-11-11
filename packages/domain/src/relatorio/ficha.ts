import type { BlockRow, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { blockDefinitionIn, getSeed, snapshotDefinitionContext, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { formatCalendarDate } from '../format/datetime.ts';
import {
  formatDecimalGroupedPtBr,
  formatNumberListPtBr,
  formatOverSqrt3PtBr,
  isNotApplicableNumber,
  isNotApplicableText,
  NOT_APPLICABLE_NUMBER,
  NOT_APPLICABLE_TEXT,
  numberEchoText,
  parseDecimalPtBr,
  parseNumberListPtBr,
  parseOverSqrt3PtBr,
  parseVoltagePairPtBr,
  type NotApplicableNumber,
} from '../parse/pt-br-number.ts';
import { wordRowByName } from '../registry/instrument-row.ts';
import { typedPieces } from '../registry/nc-phrase-row.ts';
import { sortWordRegistryRows, type WordRow } from '../registry/word-row.ts';
import { plural } from '../text/plural.ts';
import { isMediumItem } from './oil-rule.ts';
import { isReadingValue } from './over-range.ts';
import { checklistResultIsStored, checklistResultOf } from './sheet-progress.ts';
import { isCellFilled } from './sheet-state.ts';
import { blocksWithPendingSuggestions, livePendingSuggestions } from './suggestions.ts';
import { locationTree, siblingLocations, treeNodes, type TreeEquipmentNode } from './tree.ts';

/*
 * Stories 5.1-5.4: the rules the equipment sheet reads and must not decide on its own
 * (AD-1/AD-13): tree order and the next sheet, the cabine a sheet belongs to and whether
 * it is that cabine's first, the checklist's bulk actions, the recent NC observations, the
 * previous cabine's environment, the humidity note and the value shapes a typed field
 * commits.
 */

// --- tree order ------------------------------------------------------------------------

/** The equipment rows of the relatório in tree order (the order "Próxima ficha" walks). */
export function sheetOrder(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>): TreeEquipmentNode[] {
  return treeNodes(locationTree(snapshot)).filter((node): node is TreeEquipmentNode => node.kind === 'equipment');
}

/**
 * Story 8.1: the first sheet in tree order holding a pending suggestion, where the Sumário's
 * "N sugestões por confirmar" leads; null when none does.
 */
export function firstSheetWithPendingSuggestions(
  snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'> & { readonly equipment_types: RelatorioSnapshot['equipment_types'] },
  pending: readonly SuggestionRow[],
): string | null {
  const held = blocksWithPendingSuggestions(livePendingSuggestions(snapshot.blocks, pending, [], snapshotDefinitionContext(snapshot)));
  return sheetOrder(snapshot).find((node) => held.has(node.blockId))?.blockId ?? null;
}

/**
 * What the sheet's primary action moves to (EXPERIENCE.md › Sticky action bar, "Next/
 * previous sheet follows tree order; Próxima coluna jumps locations"): the next sheet in
 * tree order, `coluna` when that sheet hangs off another location than this one, and
 * `relatorio` (back to the Sumário) on the relatório's last sheet.
 */
export type NextSheet = { kind: 'ficha' | 'coluna'; blockId: string } | { kind: 'relatorio' };

export function nextSheet(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, blockId: string): NextSheet {
  const order = sheetOrder(snapshot);
  const at = order.findIndex((node) => node.blockId === blockId);
  const next = at === -1 ? undefined : order[at + 1];
  if (next === undefined) return { kind: 'relatorio' };
  return { kind: next.locationId === order[at]!.locationId ? 'ficha' : 'coluna', blockId: next.blockId };
}

// --- the cabine ------------------------------------------------------------------------
// `cabineOf` and the cabine's required fields live in `cabine.ts`; whether a sheet is its
// cabine's first (`isCabineFirstSheet`) in `sheet-progress.ts`, which counts it.

/**
 * "Copiar da cabine anterior": the cabine right before this one among the roots, by
 * `order_key`, when it holds both a temperature and a humidity; null otherwise. Story 16.4: an
 * "N/A" in either is no reading to copy, so the action is not offered.
 */
export function previousCabineEnv(
  locations: readonly LocationRow[],
  cabineId: string,
): { cabineId: string; name: string; temperature_c: NonNullable<Extract<LocationRow, { kind: 'cabine' }>['env']['temperature_c']>; humidity_pct: NonNullable<Extract<LocationRow, { kind: 'cabine' }>['env']['humidity_pct']> } | null {
  const roots = siblingLocations(locations, null);
  const at = roots.findIndex((row) => row.id === cabineId);
  const previous = at > 0 ? roots[at - 1] : undefined;
  if (previous === undefined || previous.kind !== 'cabine') return null;
  const { temperature_c, humidity_pct } = previous.env;
  if (temperature_c === null || humidity_pct === null) return null;
  if (temperature_c.state === 'empty' || humidity_pct.state === 'empty') return null;
  if (isNotApplicableNumber(temperature_c) || isNotApplicableNumber(humidity_pct)) return null;
  return { cabineId: previous.id, name: previous.name, temperature_c, humidity_pct };
}

// --- humidity and the quick notes --------------------------------------------------------

/**
 * OPEN QUESTION (spec 5.1-5.4, Design Notes): no humidity threshold is configured anywhere
 * in the seed or the checks; until one is decided the rain/humidity note surfaces above a
 * fixed, conservative 80 % relative humidity.
 */
export const HUMIDITY_NOTE_THRESHOLD_PCT = 80;

/** True when the cabine's recorded humidity is above the threshold (Story 5.2 AC 4); only a measured humidity counts (Story 16.4: never "N/A"). */
export function humidityNoteSurfaced(env: Pick<Extract<LocationRow, { kind: 'cabine' }>['env'], 'humidity_pct'> | null): boolean {
  const value = env?.humidity_pct;
  if (value === null || value === undefined || !isReadingValue(value.state)) return false;
  const n = Number(value.raw);
  return Number.isFinite(n) && n > HUMIDITY_NOTE_THRESHOLD_PCT;
}

/** The seed's sheet-level quick notes, the rain/humidity note first (v1 seeds that one note). */
export function quickNotes(seedVersion: string): readonly string[] {
  try {
    return getSeed(seedVersion, 'cabine_primaria').quick_notes;
  } catch {
    return [];
  }
}

/** A chip's text added to the sheet observation: the text itself when empty, else a new paragraph; unchanged when already there. */
export function appendObservation(current: string | null, note: string): string {
  const text = (current ?? '').trim();
  if (text === '') return note;
  if (text.includes(note)) return text;
  return `${text}\n\n${note}`;
}

// --- the checklist ------------------------------------------------------------------------

/** The items "Marcar os restantes como Conforme" sets: the unset ones (NC rows and NA defaults stay as they are). */
export function checklistUnsetItems(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>, ctx: DefinitionContext): string[] {
  const definition = definitionOf(block, ctx);
  if (definition === null || definition.checklist === null) return [];
  return definition.checklist.filter((item) => checklistResultOf(block, item.key, ctx) === null).map((item) => item.key);
}

/** "11 itens marcados Conforme", "1 item marcado Conforme". */
export function itensMarcadosConformeText(n: number): string {
  return plural(n, 'item marcado Conforme', 'itens marcados Conforme');
}

/**
 * "Repetir da ficha anterior do mesmo tipo": the last concluded sheet of the same type in
 * this relatório (latest `concluded_by.at`), or null when none is.
 */
export function repeatChecklistSource(snapshot: Pick<RelatorioSnapshot, 'blocks'>, blockId: string): BlockRow | null {
  const target = snapshot.blocks.find((row) => row.id === blockId);
  if (target === undefined) return null;
  const sources = snapshot.blocks.filter(
    (row) => row.id !== blockId && row.removed_at === null && row.block_type === target.block_type && row.concluded_by !== null && row.not_tested === null,
  );
  sources.sort((a, b) => (a.concluded_by!.at < b.concluded_by!.at ? 1 : a.concluded_by!.at > b.concluded_by!.at ? -1 : 0));
  return sources[0] ?? null;
}

/**
 * The tri-state pattern "Repetir" writes onto `target`: every item still unset on the
 * target (neither answered nor an `na_defaults` display default -- the same rule as
 * "Marcar os restantes como Conforme", `checklistUnsetItems`) whose source holds a
 * result. An item the target already answered, however it reads, is never touched.
 * Never an observation or a photo.
 */
export function repeatChecklistPattern(
  source: Pick<BlockRow, 'config' | 'sheet'> & Partial<Pick<BlockRow, 'seed_version' | 'block_type'>>,
  target: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>,
  ctx: DefinitionContext,
): { itemKey: string; value: 'C' | 'NC' | 'NA' }[] {
  const definition = definitionOf(target, ctx);
  if (definition === null || definition.checklist === null) return [];
  const out: { itemKey: string; value: 'C' | 'NC' | 'NA' }[] = [];
  for (const item of definition.checklist) {
    if (checklistResultOf(target, item.key, ctx) !== null) continue;
    const value = checklistResultOf(source, item.key, ctx);
    if (value === null) continue;
    // Story 14.11: an oil item's NA the source's oil rule only derives is not an answer to copy (batch e24s: nor a dry item's).
    if (isMediumItem(source, item.key, ctx) && !checklistResultIsStored(source, item.key, ctx)) continue;
    out.push({ itemKey: item.key, value });
  }
  return out;
}

/**
 * The NC chips of a row beyond the seed's own phrases: the five most recent observations
 * typed for this item on any sheet of this relatório (cells ordered by their uuidv7 op id),
 * without repeats and without the phrases already offered. F-26: never the observation of
 * `currentBlockId` itself (the sheet on screen), which the field already holds.
 */
export function recentChecklistObservations(
  snapshot: Pick<RelatorioSnapshot, 'blocks'>,
  itemKey: string,
  seeded: readonly string[] = [],
  currentBlockId: string | null = null,
): string[] {
  const cells: { text: string; opId: string }[] = [];
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null || block.id === currentBlockId) continue;
    const cell = block.sheet.checklist[itemKey]?.observation;
    if (cell === undefined || !isCellFilled(cell) || typeof cell.value !== 'string') continue;
    cells.push({ text: cell.value.trim(), opId: cell.op_id });
  }
  cells.sort((a, b) => (a.opId < b.opId ? 1 : a.opId > b.opId ? -1 : 0));
  const skip = new Set(seeded.map((phrase) => phrase.trim()));
  const out: string[] = [];
  for (const { text } of cells) {
    if (skip.has(text) || out.includes(text)) continue;
    out.push(text);
    if (out.length === 5) break;
  }
  return out;
}

/**
 * ~~e22f N3 (integrated review of Epic 22 wave A): a checklist row set back from NC to C clears
 * its observation in the same batch only while that observation is still the NC phrase a chip
 * wrote, unedited: exactly one of the row's chips. Kept otherwise.~~ (`clearsNcObservation`,
 * replaced by Story 24.6.)
 *
 * Story 24.6 (every seed, screen only; Bruno's question 27): what a checklist row's observation
 * does when the row leaves NC for C or for N.A. Null for any other change ("Limpar", C to NC, a
 * row never NC) and for a blank observation: nothing is asked. `clear` while the observation is
 * still automatic, made only of the row's offered phrases (`ncChipPhrases`: the seed's, the
 * learned ones, the recents), joined as a chip tap joins them (`insertPhrase`), a final period
 * aside: the observation is removed in the same batch as the result. `keep` once it holds a typed
 * piece (`typedPieces`): the observation stays, and the row shows its warning ("Observação mantida:
 * o texto foi editado.") with "Apagar observação". A kept observation floors nothing (fix batch
 * e24h, H9).
 */
export function ncObservationOnLeave(from: string | null, to: string | null, observation: string, chips: readonly string[]): 'clear' | 'keep' | null {
  if (from !== 'NC' || (to !== 'C' && to !== 'NA')) return null;
  if (observation.trim() === '') return null;
  // Each offered phrase is taken with and without its final period, so "X." and "X" both cut.
  const offered = chips.flatMap((phrase) => {
    const trimmed = phrase.trim();
    return trimmed.endsWith('.') ? [trimmed, trimmed.slice(0, -1)] : [trimmed, `${trimmed}.`];
  });
  return typedPieces(observation, offered).length === 0 ? 'clear' : 'keep';
}

/**
 * A chip's phrase inserted at the caret of an observation, without repeating a phrase the
 * text already holds. Returns the new text and where the caret goes.
 */
export function insertPhrase(text: string, phrase: string, caret: number = text.length): { text: string; caret: number } {
  if (text.includes(phrase)) return { text, caret: Math.min(caret, text.length) };
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before === '' || /[\s(]$/.test(before) ? '' : before.endsWith(',') || before.endsWith(';') ? ' ' : ', ';
  const trail = after === '' || /^[\s,.;)]/.test(after) ? '' : ', ';
  const inserted = `${lead}${phrase}${trail}`;
  return { text: `${before}${inserted}${after}`, caret: before.length + lead.length + phrase.length };
}

// --- the nameplate's registry chips (Story 2.5's chip row + "Outro…") ----------------------

/**
 * The chips of a manufacturer or voltage class field: the current value first, then the
 * values typed for fields of that kind on this relatório's sheets, newest first (cells by
 * their uuidv7 op id), then the registry in its own order, up to `limit`, as registry ids.
 */
export function nameplateWordRecents(
  current: string | null,
  blocks: readonly Pick<BlockRow, 'seed_version' | 'block_type' | 'sheet' | 'removed_at' | 'config'>[],
  kind: 'manufacturer' | 'voltage_class',
  rows: readonly WordRow[],
  limit = 5,
  ctx: DefinitionContext,
): string[] {
  const live = rows.filter((row) => row.removed_at === null);
  const used: { name: string; opId: string }[] = [];
  for (const block of blocks) {
    if (block.removed_at !== null) continue;
    const definition = definitionOf(block, ctx);
    if (definition === null) continue;
    for (const field of definition.nameplate) {
      if (field.kind !== kind) continue;
      const cell = block.sheet.nameplate[field.key];
      if (cell !== undefined && isCellFilled(cell) && typeof cell.value === 'string') used.push({ name: cell.value, opId: cell.op_id });
    }
  }
  used.sort((a, b) => (a.opId < b.opId ? 1 : a.opId > b.opId ? -1 : 0));
  const ids: string[] = [];
  const add = (id: string | undefined) => {
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  };
  add(wordRowByName(current, live)?.id);
  for (const { name } of used) add(wordRowByName(name, live)?.id);
  for (const row of sortWordRegistryRows(live)) add(row.id);
  return ids.slice(0, limit);
}

// --- the value shapes a typed field commits (AR-10) ------------------------------------------

/**
 * The AR-10 value of a typed number: `{raw, unit, state: 'measured'}`, null for an empty field,
 * `'invalid'` for text that is no number. Story 16.4: an accepted "N.A" spelling ("N.A", "NA",
 * "N/A", "N.A.", any case, whitespace anywhere) answers `NOT_APPLICABLE_NUMBER`. Fix batch
 * fxpw G4: with `pair` (the field accepts a two-level voltage, `acceptsVoltagePair`), a typed
 * "380/220" is measured too, its `raw` the dot-decimal pair (`parseVoltagePairPtBr`).
 *
 * Seed v13 (Story 23.7): with `list` (a `list` field, the transformer's TAPS) the typed text is
 * a list of values only (`parseNumberListPtBr`, two or more, none repeated, whole in V), its raw
 * "13.8;13.2;12.6"; with `sqrt3` (an `over_sqrt3` field, the TP's TENSÃO NOMINAL AT and BT) a
 * typed "115/√3" ("115/V3", "115/raiz3") is measured too, its raw "115/√3". The flags are the
 * kernel's `nameplateFieldInput`.
 */
export function numberFieldValue(
  typed: string,
  unit: string | null,
  options: { pair?: boolean; list?: boolean; sqrt3?: boolean } = {},
): NotApplicableNumber | { raw: string; unit: string | null; state: 'measured' } | null | 'invalid' {
  if (typed.trim() === '') return null;
  if (isNotApplicableText(typed)) return NOT_APPLICABLE_NUMBER;
  if (options.list === true) {
    const list = parseNumberListPtBr(typed, { unit });
    return list === null ? 'invalid' : { raw: list, unit, state: 'measured' };
  }
  const raw = parseDecimalPtBr(typed) ?? (options.pair === true ? parseVoltagePairPtBr(typed) : null) ?? (options.sqrt3 === true ? parseOverSqrt3PtBr(typed) : null);
  return raw === null ? 'invalid' : { raw, unit, state: 'measured' };
}

/**
 * Seed v13 (Story 23.7): the echo line under a nameplate number field while typing, `numberEchoText`
 * for every field of v1 to v12; a list reads "= 13,8 · 13,2 · 12,6 kV", a value over √3 "= 115/√3 V".
 */
export function nameplateEchoText(field: Pick<FieldDef, 'kind'> & Partial<Pick<FieldDef, 'list' | 'over_sqrt3'>>, raw: string, unit: string | null): string {
  if (field.list !== true && field.over_sqrt3 !== true) return numberEchoText(raw, unit);
  const text = fieldValueText(field, { raw, state: 'measured' });
  return unit === null || unit === '' ? `= ${text}` : `= ${text} ${unit}`;
}

/** Seed v13 (Story 23.7): how the sheet's number field of a nameplate `FieldDef` takes its input, read from the definition (AD-13). */
export interface NameplateFieldInput {
  /** A list of the plate's values (TAPS): typed as text, parsed by `parseNumberListPtBr`. */
  list: boolean;
  /** Also "N/√3" (the TP's secondary): typed as text. */
  sqrt3: boolean;
  /** The `list` field this field's value is picked from (TAP ATUAL from TAPS), or null. */
  pickFrom: string | null;
  /** The keyboard the field asks for: the decimal keypad has no ";" nor "/". */
  inputMode: 'decimal' | 'text';
}

/** Seed v13 (Story 23.7): the input flags of a nameplate field; every field of v1 to v12 reads `{list: false, sqrt3: false, pickFrom: null, inputMode: 'decimal'}`. */
export function nameplateFieldInput(field: Pick<FieldDef, 'list' | 'over_sqrt3' | 'pick_from'>): NameplateFieldInput {
  const list = field.list === true;
  const sqrt3 = field.over_sqrt3 === true;
  return { list, sqrt3, pickFrom: field.pick_from ?? null, inputMode: list || sqrt3 ? 'text' : 'decimal' };
}

/**
 * A stored field value as a field shows it: numbers pt-BR with thousands grouped ("1.500", E5-Q14), "N/A" for the `not_applicable` state (Story 16.4), dates dd/mm/aaaa, text as typed; '' when empty.
 * Seed v13 (Story 23.7): a `list` field's value reads "13,8 · 13,2 · 12,6", an `over_sqrt3` field's "N/√3" reads "115/√3" ("13,8/√3").
 */
export function fieldValueText(field: Pick<FieldDef, 'kind'> & Partial<Pick<FieldDef, 'list' | 'over_sqrt3'>>, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (isNotApplicableNumber(value)) return NOT_APPLICABLE_TEXT;
  if (typeof value === 'object' && !Array.isArray(value) && 'raw' in (value as object)) {
    const number = value as { raw: string; state?: string };
    if (number.state === 'empty') return '';
    if (field.list === true) return formatNumberListPtBr(number.raw);
    if (field.over_sqrt3 === true) return formatOverSqrt3PtBr(formatDecimalGroupedPtBr(number.raw));
    return formatDecimalGroupedPtBr(number.raw);
  }
  // E78-Q3: a date in another shape ("07/2025", "2012") shows as stored, never blank.
  if (field.kind === 'date' && typeof value === 'string') return formatCalendarDate(value) || value;
  return typeof value === 'string' ? value : String(value);
}

/** A block's definition; Story 14.6: a company type's through the context the caller passes. */
function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type' | 'config'>, ctx: DefinitionContext): BlockDefinition | null {
  return blockDefinitionIn(ctx, block);
}
