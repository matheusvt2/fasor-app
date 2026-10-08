import { plateDateAccepted } from '../checks/plate-date.ts';
import { dateFieldText, parsePlateDateText } from '../format/datetime.ts';
import { formatDecimalGroupedPtBr, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { parseVoltageClassKv, type WordRow } from '../registry/word-row.ts';
import type { BlockRow, Cell, JsonValue, RelatorioStatus, SuggestionRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { FieldDef } from '../seed/schema.ts';
import { normalizeRegistryName } from '../text/normalize-name.ts';
import { collapse, numberShape, pendingByNameplateField, suggestionView } from './suggestion-rows.ts';

/*
 * E9-A7, part of `suggestions.ts`: the nameplate group (its suggestions, the registry create
 * hint, "Confirmar todos" candidates, the head's counts, the confirmed glyph) and the
 * editable guess (what a typed value shows and stores).
 */

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

// --- the editable guess ------------------------------------------------------------------------

/*
 * `ficha.ts`'s `fieldValueText` and `numberFieldValue`, restated here: `progress.ts` reads
 * this module, and `ficha.ts` reaches `progress.ts` through `tree.ts`, so importing it back
 * would close an import cycle. Same rules: numbers grouped pt-BR, dates dd/mm/aaaa.
 */
export function valueText(field: Pick<FieldDef, 'kind'>, value: unknown): string {
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
 * Empty text is `null`. Number: `{raw, unit: field.unit, state: 'measured'}`; date: what the
 * plain date field takes (`parsePlateDateText`: `dd/mm/aaaa`, `mm/aaaa`, a bare `aaaa`, ISO or
 * a digit run; PLN-13), refused outside 1900 .. next year when `options.now` is given
 * (`plateDateAccepted`, F-22); select: an option, ignoring case and accents; voltage class: a
 * kV number ("15", "17,5 kV").
 */
export function parseFieldInput(
  field: Pick<FieldDef, 'kind' | 'unit' | 'options'>,
  text: string,
  options: { now?: Date } = {},
): { ok: true; value: JsonValue | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  switch (field.kind) {
    case 'number': {
      const raw = parseDecimalPtBr(trimmed);
      return raw === null ? { ok: false } : { ok: true, value: { raw, unit: field.unit ?? null, state: 'measured' } };
    }
    case 'date': {
      const date = parsePlateDateText(trimmed);
      if (date === null || (options.now !== undefined && !plateDateAccepted(date, options.now))) return { ok: false };
      return { ok: true, value: date };
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
