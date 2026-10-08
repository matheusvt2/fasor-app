import { shiftDecimal } from '../relatorio/reading-cells.ts';

/*
 * AIR-1 (review 2026-10-08): a plate prints a value in whatever unit of its quantity the maker
 * chose ("13.800 V", "1,5 MVA", "0,5 kVA"), while each nameplate field stores one unit (the
 * seed's `FieldDef.unit`: kV, V, kVA, VA, kA, A, L ...). These read a unit's SI prefix and base
 * and move a value between two units of one base by a decimal shift (exact, never a float
 * product), so a reading lands in the field's unit instead of keeping the printed digits under
 * the wrong unit.
 */

/** A unit read as an SI prefix (a power of ten) and its base (`V`, `A`, `VA`, `Ω`, `L`, `%`). */
export interface SiUnit {
  /** The prefix's power of ten: 3 for kilo, 6 for mega, -6 for micro, 0 for none. */
  power: number;
  base: string;
}

/** The bases the eight block types' fields use, matched ignoring case; `Ω` also as `ohm`/`ohms`. */
const BASES: readonly { base: string; spellings: readonly string[] }[] = [
  { base: 'VA', spellings: ['va'] },
  { base: 'V', spellings: ['v'] },
  { base: 'A', spellings: ['a'] },
  { base: 'Ω', spellings: ['ω', 'ohm', 'ohms'] },
  { base: 'L', spellings: ['l'] },
  { base: '%', spellings: ['%'] },
];

/** Prefixes by their exact character: `M` is mega and `m` milli; `k` and `K` are both kilo. */
const PREFIXES: Readonly<Record<string, number>> = { T: 12, G: 9, M: 6, k: 3, K: 3, m: -3, µ: -6, μ: -6, u: -6 };

function baseOf(text: string): string | null {
  const lower = text.toLowerCase();
  return BASES.find((entry) => entry.spellings.includes(lower))?.base ?? null;
}

/**
 * The prefix and base of a unit text ("kV", "KVA", "MVA", "mA", "µΩ", "V."), or null when it is
 * not one of the known bases with at most one known prefix. Surrounding spaces and a trailing
 * dot are ignored.
 */
export function parseSiUnit(text: string): SiUnit | null {
  const trimmed = text.trim().replace(/\.$/, '').trim();
  if (trimmed === '') return null;
  const bare = baseOf(trimmed);
  if (bare !== null) return { power: 0, base: bare };
  const prefix = PREFIXES[trimmed[0]!];
  if (prefix === undefined) return null;
  const base = baseOf(trimmed.slice(1));
  // `%` takes no prefix ("k%" is not a unit).
  if (base === null || base === '%') return null;
  return { power: prefix, base };
}

/**
 * `raw` (a dot-decimal string) moved from unit `from` into unit `to` of the same base
 * ("13800" V -> "13.8" kV, "1.5" MVA -> "1500" kVA); `raw` unchanged when both units have the
 * same power; null when either unit is unknown or the bases differ (kV into kVA).
 */
export function convertReadingUnit(raw: string, from: string, to: string): string | null {
  const source = parseSiUnit(from);
  const target = parseSiUnit(to);
  if (source === null || target === null || source.base !== target.base) return null;
  if (source.power === target.power) return raw;
  return shiftDecimal(raw, source.power - target.power);
}
