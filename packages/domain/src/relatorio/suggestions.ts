import { dateFieldText, parseCalendarDate } from '../format/datetime.ts';
import { splitEntityKey, type EntityState } from '../ops/apply.ts';
import type { OpDraft } from '../ops/op.ts';
import { safeParsePath, suggestionStatusPath } from '../ops/path.ts';
import { canonicalDecimal, formatDecimalGroupedPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { parseVoltageClassKv, type WordRow } from '../registry/word-row.ts';
import { displayCellTargetSchema } from '../reading/target.ts';
import type { BlockRow, Cell, JsonValue, LocationRow, PhotoFileRow, RelatorioStatus, SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition, FieldDef } from '../seed/schema.ts';
import { evaluateSheetReadings, type CellAddress, type TestKey } from './readings.ts';
import { screenLabel } from './screen-label.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { plural } from '../text/plural.ts';
import { relatorioOpEnvelope, type Author } from './ops.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * Story 8.1 (AD-12, EXPERIENCE.md › Suggestion field): every rule of a Suggestion on the
 * device, computed once. A suggestion is a `suggestion` row the reading job writes with
 * `status = pending`; it is never a cell, so nothing reads it as filled, counted or printed
 * until the engineer taps. The only writes are the batches built here:
 *
 * - Confirmar: `suggestion/{id}/status = confirmed` + the target put carrying
 *   `meta.source_suggestion_id` (the cell's provenance, `applyOp`'s `cellOf`);
 * - typing into the guess: the typed value put (no meta) + `status = discarded`;
 * - Confirmar todos: the confirm pairs of every `suggested` fill of the group, one batch;
 * - auto-confirm after a pull: the confirm batch with `meta.auto = true`.
 *
 * `pending` is the stored status, never inferred. The group of the nameplate is the only
 * target Epic 8 reads (`sheet/{block}/nameplate/{field}`).
 */

// --- reading the rows ---------------------------------------------------------------------

/** The suggestion rows of one relatório the state holds, oldest first (uuidv7 order). */
export function suggestionRowsOf(state: EntityState, relatorioId: string): SuggestionRow[] {
  const rows: SuggestionRow[] = [];
  for (const [key, row] of state) {
    if (splitEntityKey(key).entity !== 'suggestion') continue;
    const suggestion = row as SuggestionRow;
    if (suggestion.relatorio_id === relatorioId) rows.push(suggestion);
  }
  return rows.sort(byId);
}

function byId(a: { id: string }, b: { id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The rows still waiting for a tap: the stored `status = pending`, nothing else. */
export function pendingSuggestions(rows: readonly SuggestionRow[]): SuggestionRow[] {
  return rows.filter((row) => row.status === 'pending');
}

/** The block a suggestion targets (any `sheet/*` path), or null for any other target. */
export function suggestionBlockId(s: Pick<SuggestionRow, 'target_path'>): string | null {
  const path = safeParsePath(s.target_path);
  if (path === null || !path.family.startsWith('sheet/')) return null;
  return (path as { block_id: string }).block_id;
}

/** The nameplate field key a suggestion targets on `blockId`, or null. */
function nameplateKeyOf(s: Pick<SuggestionRow, 'target_path'>, blockId: string): string | null {
  const path = safeParsePath(s.target_path);
  if (path === null || path.family !== 'sheet/nameplate' || path.block_id !== blockId) return null;
  return path.field_key;
}

/**
 * The pending suggestion each nameplate field of `blockId` shows: with several on one field
 * the newest (highest uuidv7 id) wins, and Confirmar or typing acts on it alone.
 */
export function pendingByNameplateField(rows: readonly SuggestionRow[], blockId: string): Map<string, SuggestionRow> {
  const out = new Map<string, SuggestionRow>();
  for (const row of rows) {
    if (row.status !== 'pending') continue;
    const key = nameplateKeyOf(row, blockId);
    if (key === null) continue;
    const held = out.get(key);
    if (held === undefined || row.id > held.id) out.set(key, row);
  }
  return out;
}

/** Story 9.1: what a suggestion's target path names: a block (any `sheet/*` path) or a cabine's environment. */
export type SuggestionTarget = { kind: 'block'; block_id: string } | { kind: 'location'; location_id: string };

/** The owner of a suggestion's target (Story 9.1: `location/{id}/env/*` besides `sheet/*`), or null for any other path. */
export function suggestionTarget(path: string): SuggestionTarget | null {
  const parsed = safeParsePath(path);
  if (parsed === null) return null;
  if (parsed.family.startsWith('sheet/')) return { kind: 'block', block_id: (parsed as { block_id: string }).block_id };
  if (parsed.family === 'location/env') return { kind: 'location', location_id: parsed.id };
  return null;
}

/**
 * The pending rows that still wait on a live block of `blocks`: a row whose block was
 * removed (or is not among them) has nothing left to confirm, so it is neither counted nor
 * led to. Every pending count and "N sugestões por confirmar" read this one filter.
 *
 * Story 9.1: given `locations`, a thermo-hygrometer suggestion on a live cabine of them is
 * kept too (Sync status counts it); without them (the pre-issue check, the Sumário) only
 * sheet suggestions are.
 */
export function livePendingSuggestions(
  blocks: readonly Pick<BlockRow, 'id' | 'removed_at'>[],
  pending: readonly SuggestionRow[],
  locations: readonly Pick<LocationRow, 'id' | 'kind' | 'removed_at'>[] = [],
): SuggestionRow[] {
  const live = new Set(blocks.filter((block) => block.removed_at === null).map((block) => block.id));
  const cabines = new Set(locations.filter((location) => location.removed_at === null && location.kind === 'cabine').map((location) => location.id));
  return pending.filter((row) => {
    if (row.status !== 'pending') return false;
    const target = suggestionTarget(row.target_path);
    if (target === null) return false;
    return target.kind === 'block' ? live.has(target.block_id) : cabines.has(target.location_id);
  });
}

/** The blocks holding at least one pending suggestion (never counted as concluded). */
export function blocksWithPendingSuggestions(pending: readonly SuggestionRow[]): Set<string> {
  const out = new Set<string>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const blockId = suggestionBlockId(row);
    if (blockId !== null) out.add(blockId);
  }
  return out;
}

/** The field definition a nameplate suggestion targets on `block`, or null (another target, an unknown key). */
export function suggestionFieldDef(block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type'>, s: Pick<SuggestionRow, 'target_path'>): FieldDef | null {
  const key = nameplateKeyOf(s, block.id);
  if (key === null) return null;
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).nameplate.find((field) => field.key === key) ?? null;
  } catch {
    return null;
  }
}

// --- comparing ------------------------------------------------------------------------------

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function kvOf(value: string): string | null {
  const kv = parseVoltageClassKv(value);
  return kv === null ? null : canonicalDecimal(kv.replace(',', '.'));
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => deepEqual(item, other[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => Object.hasOwn(b as object, key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

interface NumberShape {
  raw: string;
  unit: string | null;
  state: string;
}

function numberShape(value: unknown): NumberShape | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.raw !== 'string' || typeof v.state !== 'string') return null;
  return { raw: v.raw, unit: typeof v.unit === 'string' ? v.unit : null, state: v.state };
}

/**
 * The device-side comparison of a filled cell and an incoming suggestion (AD-12): `equal`
 * auto-confirms, `different` shows the replace line. By kind: text and select trimmed with
 * inner whitespace collapsed, then exact; manufacturer by its normalized registry name;
 * voltage class by its kV number ("15" = "15 kV" = "15,0"); number by `canonicalDecimal`
 * of `raw` plus the same unit and state; date as the stored string; no definition: JSON
 * deep equality.
 */
export function compareSuggestion(cellValue: unknown, suggestionValue: unknown, fieldDef: Pick<FieldDef, 'kind'> | null): 'equal' | 'different' {
  const same = (() => {
    if (fieldDef === null) return deepEqual(cellValue, suggestionValue);
    switch (fieldDef.kind) {
      case 'text':
      case 'select':
        return typeof cellValue === 'string' && typeof suggestionValue === 'string' ? collapse(cellValue) === collapse(suggestionValue) : deepEqual(cellValue, suggestionValue);
      case 'manufacturer':
        return typeof cellValue === 'string' && typeof suggestionValue === 'string'
          ? normalizeRegistryName(cellValue) === normalizeRegistryName(suggestionValue)
          : deepEqual(cellValue, suggestionValue);
      case 'voltage_class': {
        if (typeof cellValue !== 'string' || typeof suggestionValue !== 'string') return deepEqual(cellValue, suggestionValue);
        const a = kvOf(cellValue);
        const b = kvOf(suggestionValue);
        return a !== null && b !== null ? a === b : normalizeRegistryName(cellValue) === normalizeRegistryName(suggestionValue);
      }
      case 'number': {
        const a = numberShape(cellValue);
        const b = numberShape(suggestionValue);
        if (a === null || b === null) return deepEqual(cellValue, suggestionValue);
        return canonicalDecimal(a.raw) === canonicalDecimal(b.raw) && a.unit === b.unit && a.state === b.state;
      }
      case 'date':
        return typeof cellValue === 'string' && typeof suggestionValue === 'string' ? cellValue === suggestionValue : deepEqual(cellValue, suggestionValue);
    }
  })();
  return same ? 'equal' : 'different';
}

/**
 * How a pending suggestion shows on its field: an empty cell takes it as a fill (amber
 * field, "Confirmar"); a filled cell with a different value keeps the engineer's value and
 * shows the replace line; a filled cell with an equal value shows nothing (the device
 * auto-confirms it after the pull).
 */
export function suggestionView(cell: Cell | null | undefined, s: Pick<SuggestionRow, 'value'>, fieldDef: Pick<FieldDef, 'kind'> | null): 'fill' | 'replace' | 'none' {
  if (!isCellFilled(cell)) return 'fill';
  return compareSuggestion(cell!.value, s.value, fieldDef) === 'equal' ? 'none' : 'replace';
}

// --- the group -------------------------------------------------------------------------------

/** The nameplate fields of `block` in definition order (none when the definition is unknown). */
function nameplateFields(block: Pick<BlockRow, 'seed_version' | 'block_type'>): readonly FieldDef[] {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).nameplate;
  } catch {
    return [];
  }
}

export interface NameplateSuggestion {
  field: FieldDef;
  suggestion: SuggestionRow;
  view: 'fill' | 'replace' | 'none';
}

/** Each nameplate field of `block` holding a pending suggestion, in definition order, with its view. */
export function nameplateSuggestions(block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>, pending: readonly SuggestionRow[]): NameplateSuggestion[] {
  const byField = pendingByNameplateField(pending, block.id);
  const out: NameplateSuggestion[] = [];
  for (const field of nameplateFields(block)) {
    const suggestion = byField.get(field.key);
    if (suggestion === undefined) continue;
    out.push({ field, suggestion, view: suggestionView(block.sheet.nameplate[field.key], suggestion, field) });
  }
  return out;
}

/** The registry rows a create hint is checked against (the device's manufacturer words). */
export type RegistryNames = readonly Pick<WordRow, 'name' | 'removed_at'>[];

function registryHolds(registry: RegistryNames, name: string): boolean {
  const wanted = normalizeRegistryName(name);
  return registry.some((row) => row.removed_at === null && normalizeRegistryName(row.name) === wanted);
}

/**
 * Story 8.5: the suggestion carries a `create_registry_entry` hint whose name the device's
 * live registry does not hold yet (normalized, `normalizeRegistryName`): its Confirmar reads
 * "Criar ⟨nome⟩?" and writes the registry row with the confirm pair. A name the registry
 * already holds (typed on another sheet since the reading) is a plain Confirmar.
 */
export function hasCreateHint(s: Pick<SuggestionRow, 'hint'>, registry: RegistryNames): boolean {
  const name = s.hint?.create_registry_entry.name;
  return name !== undefined && !registryHolds(registry, name);
}

/**
 * Story 8.6: a manufacturer the engineer typed (over a guess) that the device's live registry
 * does not hold: the typed put goes with the registry create, one batch, as the plain field's
 * "Criar ⟨nome⟩" does. Any other kind, or an empty value, is never one.
 */
export function unknownManufacturer(field: Pick<FieldDef, 'kind'>, value: unknown, registry: RegistryNames): boolean {
  if (field.kind !== 'manufacturer' || typeof value !== 'string' || value.trim() === '') return false;
  return !registryHolds(registry, value);
}

/**
 * "Confirmar todos": every pending `suggested` suggestion of the group whose target cell
 * is empty, in definition order. Every `verify` one (it confirms only by its own tap), every
 * replace one (the engineer's value is kept) and every one that would create a registry row
 * (`hasCreateHint`: a new manufacturer takes its own "Criar ⟨nome⟩?" tap) are skipped.
 * Without `registry` any hint counts as a create.
 */
export function confirmAllCandidates(block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>, pending: readonly SuggestionRow[], registry: RegistryNames = []): SuggestionRow[] {
  return nameplateSuggestions(block, pending)
    .filter((entry) => entry.view === 'fill' && entry.suggestion.trust === 'suggested' && !hasCreateHint(entry.suggestion, registry))
    .map((entry) => entry.suggestion);
}

/**
 * The group head's numbers: the suggestions shown (fill and replace), the confirmable ones,
 * the `verify` fills and the fills that create a registry row (`create`, counted apart).
 */
export function suggestionGroupCounts(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  registry: RegistryNames = [],
): { shown: number; fills: number; confirmable: number; verify: number; create: number } {
  const entries = nameplateSuggestions(block, pending);
  const fills = entries.filter((entry) => entry.view === 'fill');
  const suggested = fills.filter((entry) => entry.suggestion.trust === 'suggested');
  const create = suggested.filter((entry) => hasCreateHint(entry.suggestion, registry)).length;
  return {
    shown: entries.filter((entry) => entry.view !== 'none').length,
    fills: fills.length,
    confirmable: suggested.length - create,
    verify: fills.filter((entry) => entry.suggestion.trust === 'verify').length,
    create,
  };
}

/** The confirmed glyph: a cell a suggestion filled, while the relatório is not Emitido ("reachable until export"). */
export function showsConfirmedGlyph(cell: Cell | null | undefined, relatorioStatus: RelatorioStatus): boolean {
  return cell != null && cell.source_suggestion_id !== null && relatorioStatus !== 'emitido';
}

// --- the ops ---------------------------------------------------------------------------------

/**
 * Confirmar (and "Substituir", and the device's auto-confirm with `auto`): the status put
 * and the target put carrying `meta.source_suggestion_id`, one batch. `value` replaces the
 * suggestion's value in the put: the auto-confirm writes the engineer's own cell value back
 * (only its provenance changes), never the reading's spelling of it.
 */
export function confirmSuggestionOps(
  author: Author,
  s: Pick<SuggestionRow, 'id' | 'relatorio_id' | 'target_path' | 'value'>,
  opts: { auto?: boolean; value?: JsonValue } = {},
): OpDraft[] {
  const envelope = relatorioOpEnvelope(author, s.relatorio_id);
  const auto = opts.auto === true ? { auto: true } : {};
  return [
    { ...envelope, meta: opts.auto === true ? { auto: true } : null, kind: 'put', path: suggestionStatusPath(s.id), value: 'confirmed' },
    { ...envelope, meta: { source_suggestion_id: s.id, ...auto }, kind: 'put', path: s.target_path, value: (opts.value === undefined ? s.value : opts.value) as JsonValue },
  ];
}

/** Typing into a suggested field: this suggestion alone is discarded (the typed value op is the caller's). */
export function discardSuggestionOp(author: Author, s: Pick<SuggestionRow, 'id' | 'relatorio_id'>): OpDraft {
  return { ...relatorioOpEnvelope(author, s.relatorio_id), kind: 'put', path: suggestionStatusPath(s.id), value: 'discarded' };
}

// --- the editable guess ------------------------------------------------------------------------

/*
 * `ficha.ts`'s `fieldValueText` and `numberFieldValue`, restated here: `progress.ts` reads
 * this module, and `ficha.ts` reaches `progress.ts` through `tree.ts`, so importing it back
 * would close an import cycle. Same rules: numbers grouped pt-BR, dates dd/mm/aaaa.
 */
function valueText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
  if (value === null || value === undefined) return '';
  const number = numberShape(value);
  if (number !== null) return number.state === 'empty' ? '' : formatDecimalGroupedPtBr(number.raw);
  if (field.kind === 'date' && typeof value === 'string') return dateFieldText(value);
  return typeof value === 'string' ? value : String(value);
}

/** A value as the editable guess shows it: "3.300", "03/2012", "15 kV", the text as it is; '' for none. */
export function fieldInputText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.kind === 'voltage_class' && typeof value === 'string') {
    const kv = parseVoltageClassKv(value);
    return kv === null ? value : `${kv} kV`;
  }
  if (typeof value === 'object' && numberShape(value) === null) return JSON.stringify(value);
  return valueText(field, value);
}

/**
 * What the engineer typed into a suggested field, as the value its kind stores (AR-10), or
 * `{ok: false}` when it is not one (the kind's invalid helper shows and nothing is written).
 * Empty text is `null`. Number: `{raw, unit: field.unit, state: 'measured'}`; date:
 * `dd/mm/aaaa`, `mm/aaaa` or ISO; select: an option, ignoring case and accents; voltage
 * class: a kV number ("15", "17,5 kV").
 */
export function parseFieldInput(field: Pick<FieldDef, 'kind' | 'unit' | 'options'>, text: string): { ok: true; value: JsonValue | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  switch (field.kind) {
    case 'number': {
      const raw = parseDecimalPtBr(trimmed);
      return raw === null ? { ok: false } : { ok: true, value: { raw, unit: field.unit ?? null, state: 'measured' } };
    }
    case 'date': {
      const iso = parseCalendarDate(trimmed);
      return iso === null ? { ok: false } : { ok: true, value: iso };
    }
    case 'select': {
      const wanted = normalizeRegistryName(trimmed);
      const option = (field.options ?? []).find((candidate) => normalizeRegistryName(candidate) === wanted);
      return option === undefined ? { ok: false } : { ok: true, value: option };
    }
    case 'voltage_class': {
      const kv = parseVoltageClassKv(trimmed);
      return kv === null ? { ok: false } : { ok: true, value: kv };
    }
    default:
      return { ok: true, value: collapse(trimmed) };
  }
}

// --- the texts ---------------------------------------------------------------------------------

/** A suggested value as a sentence names it, unit included: "630 A", "15 kV", "03/2012", "Schneider". */
export function suggestionValueText(field: Pick<FieldDef, 'kind' | 'unit'> | null, value: unknown): string {
  if (field === null) return typeof value === 'string' ? value : JSON.stringify(value);
  if (field.kind === 'voltage_class') return fieldInputText(field, value);
  if (field.kind === 'date' && typeof value === 'string') return dateFieldText(value);
  const number = numberShape(value);
  if (number !== null) {
    const unit = number.unit ?? field.unit ?? null;
    const shown = formatDecimalGroupedPtBr(number.raw);
    return unit === null ? shown : `${shown} ${unit}`;
  }
  return valueText(field, value);
}

/** The group button: "Confirmar todos (7)". */
export function confirmarTodosText(n: number): string {
  return `Confirmar todos (${n})`;
}

/** The toast of "Confirmar todos": "7 campos confirmados — 1 campo pede verificação" (the verify clause only when one is left). */
export function confirmedAllToastText(confirmed: number, skipped: number): string {
  const done = plural(confirmed, 'campo confirmado', 'campos confirmados');
  return skipped === 0 ? done : `${done} — ${plural(skipped, 'campo pede verificação', 'campos pedem verificação')}`;
}

/** The toast of one Confirmar: "Fabricante: Schneider — confirmado". */
export function confirmedFieldToastText(label: string, valueText: string): string {
  return `${label}: ${valueText} — confirmado`;
}

/**
 * The group note (`60-ficha.html`'s ".section-note" of the nameplate): "9 sugestões lidas da
 * foto 3. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu
 * toque." Without the photo's number (none given, or a photo this device does not number)
 * "da foto N" is left out.
 */
export function suggestionGroupNoteText(n: number, verifyCount: number, photoNumber?: number | null): string {
  const read = `${plural(n, 'sugestão lida', 'sugestões lidas')}${photoNumber == null ? '' : ` da foto ${photoNumber}`}`;
  const head = n === 1 ? `${read}. Nada foi gravado até você confirmar` : `${read}. Nada foi gravado: confirme um a um ou todos`;
  if (verifyCount === 0) return `${head}.`;
  return verifyCount === 1 ? `${head} — o campo “Verificar” pede o seu toque.` : `${head} — os campos “Verificar” pedem o seu toque.`;
}

/** The Confirmar button's accessible name: "Sugerido, 15 kV, confirmar" ("Verificar, …" for a guess to check). */
export function suggestionAnnouncement(trust: SuggestionRow['trust'], valueText: string): string {
  return `${trust === 'verify' ? 'Verificar' : 'Sugerido'}, ${valueText}, confirmar`;
}

/** The replace line beside an engineer-filled value: "Sugerido: 15 kV" (then "Substituir"). */
export function replaceLineText(valueText: string): string {
  return `Sugerido: ${valueText}`;
}

/** The pre-issue row (Story 8.6): "3 fichas com sugestões por confirmar". */
export function fichasComSugestoesText(n: number): string {
  return plural(n, 'ficha com sugestões por confirmar', 'fichas com sugestões por confirmar');
}

/** "Criar Celtta?": the Confirmar of a suggestion that creates its manufacturer (Story 8.5). */
export function criarText(name: string): string {
  return `Criar ${name}?`;
}

/**
 * E78-Q13 (WCAG 2.5.3, label in name): the accessible name of a "Criar Celtta?" Confirmar
 * starts with its visible words, then the trust: "Criar Celtta?, sugerido" ("…, verificar").
 */
export function criarAnnouncement(name: string, trust: SuggestionRow['trust']): string {
  return `${criarText(name)}, ${trust === 'verify' ? 'verificar' : 'sugerido'}`;
}

// --- the plate photo (Stories 8.2 and 8.6) ---------------------------------------------------

/** The caption of a plate photo, set at capture (it is a normal sheet photo otherwise). */
export const PLATE_CAPTION = 'placa de identificação';

/** What `platePhotoOf` reads of a photo row. */
export type PlatePhotoLike = Pick<PhotoFileRow, 'id' | 'block_id' | 'reading_kind' | 'local_seq' | 'captured_at'> & { removed_at?: string | null };

/**
 * The plate photo of one sheet: the newest live photo taken with the "Fotografar placa" tile
 * (`reading_kind = 'plate'`) on that block, by `local_seq` then `captured_at`; null when none.
 */
export function platePhotoOf<T extends PlatePhotoLike>(photos: readonly T[], blockId: string): T | null {
  let best: T | null = null;
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'plate' || photo.block_id !== blockId) continue;
    if (best === null || photo.local_seq > best.local_seq || (photo.local_seq === best.local_seq && photo.captured_at > best.captured_at)) best = photo;
  }
  return best;
}

export type PlateReadingView = 'queued' | 'running' | 'failed' | 'ready' | 'done';

/**
 * Where the plate photo's reading stands on the sheet: `ready` while any pending suggestion
 * was read from it (whatever its stored status), else its `reading_status`: `queued`
 * ("Foto guardada — leitura quando houver sinal"), `running` ("Lendo…"), `failed` ("Não foi
 * possível ler"), and `done` (nothing left to confirm; `none` reads the same, no line).
 */
export function plateReadingView(photo: Pick<PhotoFileRow, 'id' | 'reading_status'>, pending: readonly Pick<SuggestionRow, 'status' | 'source'>[]): PlateReadingView {
  if (pending.some((row) => row.status === 'pending' && row.source.photo_id === photo.id)) return 'ready';
  switch (photo.reading_status) {
    case 'queued':
    case 'running':
    case 'failed':
      return photo.reading_status;
    default:
      return 'done';
  }
}

/** A normalized region of a picture, `[x0, y0, x1, y1]`, each 0 to 1. */
export type NormalizedBox = readonly [number, number, number, number];

/** The margin around the read region of the plate crop, in normalized units. */
export const PLATE_CROP_MARGIN = 0.02;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * The plate crop's region: the union of the `bbox`es of the pending suggestions read from
 * `photoId`, grown by a small margin and clamped to the picture; null when none is.
 */
export function plateCropRegion(pending: readonly Pick<SuggestionRow, 'status' | 'source'>[], photoId: string, margin = PLATE_CROP_MARGIN): NormalizedBox | null {
  let box: [number, number, number, number] | null = null;
  for (const row of pending) {
    if (row.status !== 'pending' || row.source.photo_id !== photoId) continue;
    const [x0, y0, x1, y1] = row.source.bbox;
    box = box === null ? [x0, y0, x1, y1] : [Math.min(box[0], x0), Math.min(box[1], y0), Math.max(box[2], x1), Math.max(box[3], y1)];
  }
  if (box === null) return null;
  const out: [number, number, number, number] = [clamp01(box[0] - margin), clamp01(box[1] - margin), clamp01(box[2] + margin), clamp01(box[3] + margin)];
  // A degenerate region still draws a sliver of the picture.
  if (out[2] <= out[0]) out[0] = Math.max(0, out[2] - 0.01);
  if (out[3] <= out[1]) out[1] = Math.max(0, out[3] - 0.01);
  return out;
}

/**
 * E78-Q14: the crop region widened symmetrically until its aspect in pixels of the picture
 * (`image`) is at least `minRatio` (the box's own width over height), so a tall, narrow read
 * region fills the box's width instead of drawing a sliver. The wider region is shifted to
 * stay inside the picture and stops at its full width; its height never changes. A region
 * already wide enough (or a degenerate input) is returned as it is.
 */
export function padCropToAspect(region: NormalizedBox, image: { width: number; height: number }, minRatio: number): NormalizedBox {
  const [x0, y0, x1, y1] = region;
  const heightPx = (y1 - y0) * image.height;
  if (!(heightPx > 0) || !(image.width > 0) || !(minRatio > 0)) return region;
  if (((x1 - x0) * image.width) / heightPx >= minRatio) return region;
  const width = Math.min(1, (minRatio * heightPx) / image.width);
  const centre = (x0 + x1) / 2;
  let left = centre - width / 2;
  let right = centre + width / 2;
  if (left < 0) {
    right -= left;
    left = 0;
  }
  if (right > 1) {
    left -= right - 1;
    right = 1;
  }
  return [clamp01(left), y0, clamp01(right), y1];
}

/**
 * Where `inner` sits inside `outer` (both normalized boxes of one picture), in percent of
 * `outer`: the outline of the focused field on the plate crop, clamped to the crop.
 */
export function regionWithin(outer: NormalizedBox, inner: NormalizedBox): { left: number; top: number; width: number; height: number } {
  const w = outer[2] - outer[0];
  const h = outer[3] - outer[1];
  if (w <= 0 || h <= 0) return { left: 0, top: 0, width: 100, height: 100 };
  const x0 = clamp01((inner[0] - outer[0]) / w);
  const y0 = clamp01((inner[1] - outer[1]) / h);
  const x1 = clamp01((inner[2] - outer[0]) / w);
  const y1 = clamp01((inner[3] - outer[1]) / h);
  return { left: x0 * 100, top: y0 * 100, width: Math.max(0, x1 - x0) * 100, height: Math.max(0, y1 - y0) * 100 };
}

// --- arrivals and counts (Stories 8.2 and 8.6) -------------------------------------------------

/** "da foto 3": the one photo every row was read from, null when none or several. */
export function singleSourcePhotoId(rows: readonly Pick<SuggestionRow, 'source'>[]): string | null {
  const ids = new Set(rows.map((row) => row.source.photo_id));
  if (ids.size !== 1) return null;
  return [...ids][0]!;
}

/** How many readings arrived with these new suggestion rows: their distinct reading runs. */
export function arrivedReadingsCount(newRows: readonly Pick<SuggestionRow, 'source'>[]): number {
  return new Set(newRows.map((row) => row.source.reading_run_id)).size;
}

/** The arrival toast: "3 leituras prontas para confirmar" / "1 leitura pronta para confirmar". */
export function leiturasProntasText(n: number): string {
  return plural(n, 'leitura pronta para confirmar', 'leituras prontas para confirmar');
}

/** Sync status, "Leituras": "2 leituras na fila" / "1 leitura na fila". */
export function leiturasNaFilaText(n: number): string {
  return plural(n, 'leitura na fila', 'leituras na fila');
}

/** The sheet's banner: "Sugestões prontas — 9 campos para confirmar". */
export function sugestoesProntasBannerText(n: number): string {
  return `Sugestões prontas — ${plural(n, 'campo para confirmar', 'campos para confirmar')}`;
}

// --- Story 9.1: Measurement cells and the thermo-hygrometer ("Ler visor") -------------------

/** A display reading's value is a number cell: `compareSuggestion` reads it as `{kind: 'number'}`. */
const NUMBER_FIELD: Pick<FieldDef, 'kind'> = { kind: 'number' };

/** The stored cell of a Measurement address, or null. */
export function storedTestCell(block: Pick<BlockRow, 'sheet'>, address: CellAddress): Cell | null {
  return block.sheet.test[address.testKey]?.cells[String(address.row)]?.[String(address.col)] ?? null;
}

/** A cabine's environment value as a cell, for the same comparison as a sheet cell's. */
function envCell(value: unknown): Cell | null {
  return value === null || value === undefined ? null : ({ value, source_suggestion_id: null, op_id: '' } as unknown as Cell);
}

export interface MeasurementSuggestion {
  address: CellAddress;
  suggestion: SuggestionRow;
  /** `fill` on an empty cell, `replace` beside a different typed value, `none` beside an equal one (auto-confirmed). */
  view: 'fill' | 'replace' | 'none';
}

function testOrder(block: Pick<BlockRow, 'seed_version' | 'block_type'>): readonly string[] {
  try {
    return getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.map((test) => test.key);
  } catch {
    return [];
  }
}

/**
 * The pending suggestion each Measurement cell of `block` shows (the newest per cell, as on
 * the nameplate), with its view, in reading order (test, row, column).
 */
export function measurementSuggestions(block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>, pending: readonly SuggestionRow[]): MeasurementSuggestion[] {
  const byCell = new Map<string, { address: CellAddress; suggestion: SuggestionRow }>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const path = safeParsePath(row.target_path);
    if (path === null || path.family !== 'sheet/test/cell' || path.block_id !== block.id) continue;
    const address: CellAddress = { testKey: path.test_key as TestKey, row: path.row, col: path.col };
    const key = `${address.testKey}:${address.row}:${address.col}`;
    const held = byCell.get(key);
    if (held === undefined || row.id > held.suggestion.id) byCell.set(key, { address, suggestion: row });
  }
  const order = testOrder(block);
  const rank = (key: string) => (order.indexOf(key) === -1 ? order.length : order.indexOf(key));
  return [...byCell.values()]
    .sort((a, b) => rank(a.address.testKey) - rank(b.address.testKey) || a.address.row - b.address.row || a.address.col - b.address.col)
    .map(({ address, suggestion }) => ({ address, suggestion, view: suggestionView(storedTestCell(block, address), suggestion, NUMBER_FIELD) }));
}

/** The rows of one table of a test, across the test's tables (the op path's rows), or null. */
function tableRows(block: Pick<BlockRow, 'seed_version' | 'block_type'>, testKey: string, tableKey: string): { from: number; to: number } | null {
  try {
    const test = getDefinition(block.seed_version, 'cabine_primaria', block.block_type).tests.find((t) => t.key === testKey);
    if (test === undefined) return null;
    let offset = 0;
    for (const table of test.tables) {
      if (table.key === tableKey) return { from: offset, to: offset + table.rows.length };
      offset += table.rows.length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A table's "Confirmar todos": every `suggested` fill of its cells, in reading order. A
 * `verify` fill (its own tap) and a replace (the engineer's value is kept) are skipped.
 */
export function measurementConfirmAllCandidates(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  testKey: string,
  tableKey: string,
): SuggestionRow[] {
  const rows = tableRows(block, testKey, tableKey);
  if (rows === null) return [];
  return measurementSuggestions(block, pending)
    .filter((entry) => entry.address.testKey === testKey && entry.address.row >= rows.from && entry.address.row < rows.to)
    .filter((entry) => entry.view === 'fill' && entry.suggestion.trust === 'suggested')
    .map((entry) => entry.suggestion);
}

/** The `verify` fills of one table, which its "Confirmar todos" leaves for their own tap. */
export function measurementTableVerifyCount(
  block: Pick<BlockRow, 'id' | 'seed_version' | 'block_type' | 'sheet'>,
  pending: readonly SuggestionRow[],
  testKey: string,
  tableKey: string,
): number {
  const rows = tableRows(block, testKey, tableKey);
  if (rows === null) return 0;
  return measurementSuggestions(block, pending).filter(
    (entry) => entry.address.testKey === testKey && entry.address.row >= rows.from && entry.address.row < rows.to && entry.view === 'fill' && entry.suggestion.trust === 'verify',
  ).length;
}

export type EnvSuggestionField = 'temperature_c' | 'humidity_pct' | 'altitude_m';

export interface EnvSuggestion {
  field: EnvSuggestionField;
  suggestion: SuggestionRow;
  view: 'fill' | 'replace' | 'none';
}

/** The pending thermo-hygrometer suggestion of each environment field of a cabine, newest wins. */
export function envSuggestions(location: Pick<Extract<LocationRow, { kind: 'cabine' }>, 'id' | 'env'>, pending: readonly SuggestionRow[]): EnvSuggestion[] {
  const byField = new Map<EnvSuggestionField, SuggestionRow>();
  for (const row of pending) {
    if (row.status !== 'pending') continue;
    const path = safeParsePath(row.target_path);
    if (path === null || path.family !== 'location/env' || path.id !== location.id) continue;
    const field = path.field as EnvSuggestionField;
    const held = byField.get(field);
    if (held === undefined || row.id > held.id) byField.set(field, row);
  }
  return [...byField.entries()].map(([field, suggestion]) => ({ field, suggestion, view: suggestionView(envCell(location.env[field]), suggestion, NUMBER_FIELD) }));
}

export interface MismatchPart {
  text: string;
  /** The value a tap keeps: the display's (confirms the reading) or the typed one (drops the reading). */
  pick?: 'visor' | 'typed';
}

function numberText(value: unknown): string {
  const number = numberShape(value);
  if (number === null) return typeof value === 'string' ? value : '';
  if (number.state === 'not_measured') return '-';
  const shown = formatDecimalGroupedPtBr(number.raw);
  return number.unit === null ? shown : `${shown} ${number.unit}`;
}

/**
 * EXPERIENCE.md › Measurement readings: a display reading that disagrees with what was typed,
 * "Visor: 147 GΩ · digitado 14,7 GΩ — Conferir", the two values being the parts a tap picks.
 */
export function displayMismatchText(cellValue: unknown, s: Pick<SuggestionRow, 'value'>): { text: string; parts: MismatchPart[] } {
  const parts: MismatchPart[] = [
    { text: 'Visor: ' },
    { text: numberText(s.value), pick: 'visor' },
    { text: ' · digitado ' },
    { text: numberText(cellValue), pick: 'typed' },
    { text: ' — Conferir' },
  ];
  return { text: parts.map((part) => part.text).join(''), parts };
}

// --- the burst ---------------------------------------------------------------------------

/** One row a "Ler visor" burst shoots: the first capture cell of a Measurement row. */
export interface DisplayBurstStop {
  testKey: TestKey;
  tableKey: string;
  /** The op path's row, across the test's tables. */
  row: number;
  /** The row's first capture column. */
  col: number;
  /** The table's title, else its test's ("Seccionadora contato aberto", "Ensaio de isolação"). */
  tableTitle: string;
  /** The row's name ("T1", "Fase A"). */
  rowLabel: string;
}

/** Every row of the sheet's enabled tests a burst walks, in sheet order (tests, tables, rows). */
export function displayBurstStops(block: BlockRow, definition: BlockDefinition): DisplayBurstStop[] {
  const out: DisplayBurstStop[] = [];
  for (const test of evaluateSheetReadings(block, definition)) {
    for (const table of test.tables) {
      const capture = table.columns.find((column) => column.role === 'capture');
      if (capture === undefined) continue;
      for (const row of table.rows) {
        out.push({ testKey: test.testKey, tableKey: table.key, row: row.row, col: capture.col, tableTitle: table.title ?? test.title, rowLabel: row.label });
      }
    }
  }
  return out;
}

type DisplayPhotoLike = Pick<PhotoFileRow, 'reading_kind' | 'reading_target'> & { removed_at?: string | null };

/**
 * Where a burst opened on one table starts: the table's first row that no live display photo
 * of the block targets yet (a typed row still gets its evidence shot, so typing does not
 * skip it), else the table's first row; 0 when the table is not among the stops.
 */
export function displayBurstStart(stops: readonly DisplayBurstStop[], photos: readonly DisplayPhotoLike[], blockId: string, testKey: string, tableKey: string): number {
  const targeted = new Set<string>();
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'display') continue;
    const target = displayCellTargetSchema.safeParse(photo.reading_target);
    if (target.success && target.data.block_id === blockId) targeted.add(`${target.data.table_key}:${target.data.start_cell.row}`);
  }
  const inTable = stops.flatMap((stop, index) => (stop.testKey === testKey && stop.tableKey === tableKey ? [index] : []));
  const free = inTable.find((index) => !targeted.has(`${testKey}:${stops[index]!.row}`));
  return free ?? inTable[0] ?? 0;
}

/** The stop of the burst's `shot`-th shot (0-based) from `start`; null past the sheet's last row. */
export function displayBurstStop(stops: readonly DisplayBurstStop[], start: number, shot: number): DisplayBurstStop | null {
  return stops[start + shot] ?? null;
}

/** The viewfinder's hint: "Próxima leitura: Seccionadora contato aberto · T1", "Nada mais a ler nesta ficha" past the last row. */
export function displayBurstHintText(stop: DisplayBurstStop | null): string {
  if (stop === null) return 'Nada mais a ler nesta ficha';
  return `Próxima leitura: ${screenLabel(stop.tableTitle)} · ${screenLabel(stop.rowLabel)}`;
}

/** Where a display photo's reading stands on the cell it starts at: queued (no signal yet) or running. */
export type DisplayQueuedState = 'queued' | 'running';

type DisplayReadingPhoto = DisplayPhotoLike & Pick<PhotoFileRow, 'reading_status'>;

/**
 * The start cells of `blockId` whose display photo is still waiting for its reading: each
 * shows "Foto guardada — leitura quando houver sinal" and stays typeable.
 */
export function displayQueuedCells(photos: readonly DisplayReadingPhoto[], blockId: string): { address: CellAddress; state: DisplayQueuedState }[] {
  const out = new Map<string, { address: CellAddress; state: DisplayQueuedState }>();
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'display') continue;
    if (photo.reading_status !== 'queued' && photo.reading_status !== 'running') continue;
    const target = displayCellTargetSchema.safeParse(photo.reading_target);
    if (!target.success || target.data.block_id !== blockId) continue;
    const address: CellAddress = { testKey: target.data.table_key as TestKey, row: target.data.start_cell.row, col: target.data.start_cell.col };
    out.set(`${address.testKey}:${address.row}:${address.col}`, { address, state: photo.reading_status });
  }
  return [...out.values()];
}

/** The reading state of a cabine's thermo-hygrometer photo still waiting, or null. */
export function displayQueuedEnv(photos: readonly DisplayReadingPhoto[], locationId: string): DisplayQueuedState | null {
  let state: DisplayQueuedState | null = null;
  for (const photo of photos) {
    if ((photo.removed_at ?? null) !== null || photo.reading_kind !== 'display') continue;
    if (photo.reading_status !== 'queued' && photo.reading_status !== 'running') continue;
    const target = photo.reading_target as { location_id?: unknown } | null;
    if (target !== null && typeof target === 'object' && target.location_id === locationId) state = photo.reading_status;
  }
  return state;
}
