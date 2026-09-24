import type { BlockRow, LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition, getSeed } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { formatCalendarDate } from '../format/datetime.ts';
import { formatDecimalPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { wordRowByName } from '../registry/instrument-row.ts';
import { sortWordRegistryRows, type WordRow } from '../registry/word-row.ts';
import { plural } from '../text/plural.ts';
import { checklistResultOf } from './sheet-progress.ts';
import { isCellFilled } from './sheet-state.ts';
import { firstInTree, locationTree, siblingLocations, treeNodes, type TreeEquipmentNode } from './tree.ts';

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

/** The root location (the cabine) above a location, or null when it is not on this device. */
export function cabineOf(locations: readonly LocationRow[], locationId: string | null): Extract<LocationRow, { kind: 'cabine' }> | null {
  const byId = new Map(locations.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let at = locationId === null ? undefined : byId.get(locationId);
  while (at !== undefined && !seen.has(at.id)) {
    seen.add(at.id);
    if (at.kind === 'cabine' && (at.parent_id === null || !byId.has(at.parent_id))) return at;
    at = at.parent_id === null ? undefined : byId.get(at.parent_id);
  }
  return null;
}

/** Story 5.2: the cabine block is edited on its cabine's first sheet (`firstInTree`) and read-only on every other. */
export function isCabineFirstSheet(snapshot: Pick<RelatorioSnapshot, 'locations' | 'blocks' | 'equipment'>, blockId: string): boolean {
  const block = snapshot.blocks.find((row) => row.id === blockId);
  const cabine = cabineOf(snapshot.locations, block?.location_id ?? null);
  return cabine !== null && firstInTree(snapshot, cabine.id) === blockId;
}

/**
 * "Copiar da cabine anterior": the cabine right before this one among the roots, by
 * `order_key`, when it holds both a temperature and a humidity; null otherwise.
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
  return { cabineId: previous.id, name: previous.name, temperature_c, humidity_pct };
}

// --- humidity and the quick notes --------------------------------------------------------

/**
 * OPEN QUESTION (spec 5.1-5.4, Design Notes): no humidity threshold is configured anywhere
 * in the seed or the checks; until one is decided the rain/humidity note surfaces above a
 * fixed, conservative 80 % relative humidity.
 */
export const HUMIDITY_NOTE_THRESHOLD_PCT = 80;

/** True when the cabine's recorded humidity is above the threshold (Story 5.2 AC 4). */
export function humidityNoteSurfaced(env: Pick<Extract<LocationRow, { kind: 'cabine' }>['env'], 'humidity_pct'> | null): boolean {
  const value = env?.humidity_pct;
  if (value === null || value === undefined || value.state === 'empty') return false;
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
export function checklistUnsetItems(block: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>): string[] {
  const definition = definitionOf(block);
  if (definition === null || definition.checklist === null) return [];
  return definition.checklist.filter((item) => checklistResultOf(block, item.key) === null).map((item) => item.key);
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
  source: Pick<BlockRow, 'config' | 'sheet'>,
  target: Pick<BlockRow, 'config' | 'sheet' | 'seed_version' | 'block_type'>,
): { itemKey: string; value: 'C' | 'NC' | 'NA' }[] {
  const definition = definitionOf(target);
  if (definition === null || definition.checklist === null) return [];
  const out: { itemKey: string; value: 'C' | 'NC' | 'NA' }[] = [];
  for (const item of definition.checklist) {
    if (checklistResultOf(target, item.key) !== null) continue;
    const value = checklistResultOf(source, item.key);
    if (value === null) continue;
    out.push({ itemKey: item.key, value });
  }
  return out;
}

/**
 * "Marcar não ensaiado": the reason the seed offers by default -- the latest
 * `not_tested.at` among the relatório's live blocks that carry one, or null when none
 * does. Used to pre-select the picker's chip the next time it opens (a repeated visit's
 * most likely reason).
 */
export function lastNotTestedReason(blocks: readonly Pick<BlockRow, 'not_tested' | 'removed_at'>[]): string | null {
  const marked = blocks.filter((block): block is Pick<BlockRow, 'not_tested' | 'removed_at'> & { not_tested: NonNullable<BlockRow['not_tested']> } => block.removed_at === null && block.not_tested !== null);
  marked.sort((a, b) => (a.not_tested.at < b.not_tested.at ? 1 : a.not_tested.at > b.not_tested.at ? -1 : 0));
  return marked[0]?.not_tested.reason ?? null;
}

/**
 * The NC chips of a row beyond the seed's own phrases: the five most recent observations
 * typed for this item on any sheet of this relatório (cells ordered by their uuidv7 op id),
 * without repeats and without the phrases already offered.
 */
export function recentChecklistObservations(snapshot: Pick<RelatorioSnapshot, 'blocks'>, itemKey: string, seeded: readonly string[] = []): string[] {
  const cells: { text: string; opId: string }[] = [];
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null) continue;
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
  blocks: readonly Pick<BlockRow, 'seed_version' | 'block_type' | 'sheet' | 'removed_at'>[],
  kind: 'manufacturer' | 'voltage_class',
  rows: readonly WordRow[],
  limit = 5,
): string[] {
  const live = rows.filter((row) => row.removed_at === null);
  const used: { name: string; opId: string }[] = [];
  for (const block of blocks) {
    if (block.removed_at !== null) continue;
    const definition = definitionOf(block);
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

/** The AR-10 value of a typed number: `{raw, unit, state: 'measured'}`, null for an empty field, `'invalid'` for text that is no number. */
export function numberFieldValue(typed: string, unit: string | null): { raw: string; unit: string | null; state: 'measured' } | null | 'invalid' {
  if (typed.trim() === '') return null;
  const raw = parseDecimalPtBr(typed);
  return raw === null ? 'invalid' : { raw, unit, state: 'measured' };
}

/** A stored field value as a field shows it: numbers pt-BR, dates dd/mm/aaaa, text as typed; '' when empty. */
export function fieldValueText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && !Array.isArray(value) && 'raw' in (value as object)) {
    const number = value as { raw: string; state?: string };
    return number.state === 'empty' ? '' : formatDecimalPtBr(number.raw);
  }
  if (field.kind === 'date' && typeof value === 'string') return formatCalendarDate(value);
  return typeof value === 'string' ? value : String(value);
}

function definitionOf(block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition | null {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
  } catch {
    return null;
  }
}
