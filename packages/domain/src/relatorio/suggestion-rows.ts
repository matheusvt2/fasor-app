import { splitEntityKey, type EntityState } from '../ops/apply.ts';
import { safeParsePath } from '../ops/path.ts';
import { canonicalDecimal } from '../parse/pt-br-number.ts';
import { parseVoltageClassKv } from '../registry/word-row.ts';
import type { BlockRow, Cell, LocationRow, SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { isCellFilled } from './sheet-state.ts';

/*
 * E9-A7, part of `suggestions.ts`: reading the suggestion rows (pending, live, by target),
 * comparing a suggestion with a filled cell and the view it takes on its field.
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
export function nameplateKeyOf(s: Pick<SuggestionRow, 'target_path'>, blockId: string): string | null {
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

export function collapse(text: string): string {
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

export interface NumberShape {
  raw: string;
  unit: string | null;
  state: string;
}

export function numberShape(value: unknown): NumberShape | null {
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
 * Review 2026-10-08 (DG-2): whether a value the engineer committed deliberately turns the
 * field's pending suggestion down (it is discarded): only under the replace line (`view`), only
 * for a value (a cleared field makes it a fill again), and only for one other than the
 * suggestion's (an equal value is the device's auto-confirm to make).
 */
export function typedTurnsDownSuggestion(view: 'fill' | 'replace' | 'none' | undefined, suggestionValue: unknown, next: unknown, fieldDef: Pick<FieldDef, 'kind'> | null): boolean {
  if (view !== 'replace' || next === null || next === undefined) return false;
  return compareSuggestion(next, suggestionValue, fieldDef) !== 'equal';
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
