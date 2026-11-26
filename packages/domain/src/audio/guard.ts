import { canonicalDecimal, parseDecimalPtBr } from '../parse/pt-br-number.ts';
import { parseSpokenNumberPtBr } from '../parse/utterance.ts';

/*
 * Story 31.1 (AD-30, FR-79): a model's text never enters the relatório with a number, a unit or a
 * TAG nobody said. `writtenTextGuard` reads the three in the text as heard, the prompt's context and
 * the written text, and fails when the written text holds one neither source holds, or drops one the
 * heard text held. On a failure the field receives the text as heard (`apps/api` transcription job).
 *
 * - A number is read the pt-BR way (`parseDecimalPtBr`: "13,8", "1.500", "3.7") or spoken
 *   (`parseSpokenNumberPtBr`: "cento e vinte"), compared by its dot-decimal form. A lone "um" or
 *   "uma" is an article, never a number.
 * - A unit counts only right after a number ("147 giga", "13,8 kV", "0,5 %", "23 graus"), compared
 *   by its symbol; a lone "a" or "m" in a sentence is a word.
 * - A TAG is a word that starts with a capital letter and holds a digit ("TR-01", "QGBT2"),
 *   compared without its separators and case ("TR-01" is "TR01").
 */

export type GuardKind = 'number' | 'unit' | 'tag';
export interface GuardReason {
  kind: GuardKind;
  /** The canonical value: a dot-decimal number, a unit symbol, a TAG without separators. */
  value: string;
  problem: 'added' | 'dropped';
}
export type GuardVerdict = { ok: true } | { ok: false; reasons: GuardReason[] };

/** Punctuation around a word ("A," "giga." "(TR-01)"); `%` and `°` are kept. */
const EDGE = /^[.,;:!?"'()[\]{}“”‘’«»…]+|[.,;:!?"'()[\]{}“”‘’«»…]+$/g;
const DIGITS = /^\d+(?:[.,]\d+)*$/;
const GLUED = /^(\d+(?:[.,]\d+)*)(\D.*)$/u;
const TAG = /^[A-Z][A-Z0-9]*(?:[-/.][A-Z0-9]+)*$/;

/** Unit symbols, case-sensitive (mΩ is not MΩ). */
const SYMBOLS: Readonly<Record<string, string>> = {
  kV: 'kV',
  KV: 'kV',
  V: 'V',
  A: 'A',
  kA: 'kA',
  mA: 'mA',
  kVA: 'kVA',
  KVA: 'kVA',
  MVA: 'MVA',
  VA: 'VA',
  kW: 'kW',
  MW: 'MW',
  W: 'W',
  Hz: 'Hz',
  '°C': '°C',
  ºC: '°C',
  '°': '°C',
  '%': '%',
  MΩ: 'MΩ',
  GΩ: 'GΩ',
  TΩ: 'TΩ',
  µΩ: 'µΩ',
  μΩ: 'µΩ',
  mΩ: 'mΩ',
  Ω: 'Ω',
};

/** Spoken units, lower case and accents stripped; one word or two ("por cento", "giga ohm"). */
const WORDS: Readonly<Record<string, string>> = {
  volt: 'V',
  volts: 'V',
  quilovolt: 'kV',
  quilovolts: 'kV',
  kilovolt: 'kV',
  kilovolts: 'kV',
  ampere: 'A',
  amperes: 'A',
  amper: 'A',
  quiloampere: 'kA',
  quiloamperes: 'kA',
  miliampere: 'mA',
  miliamperes: 'mA',
  kva: 'kVA',
  mva: 'MVA',
  kw: 'kW',
  hertz: 'Hz',
  grau: '°C',
  graus: '°C',
  'graus celsius': '°C',
  'grau celsius': '°C',
  'por cento': '%',
  porcento: '%',
  giga: 'GΩ',
  gigas: 'GΩ',
  gigaohm: 'GΩ',
  gigaohms: 'GΩ',
  'giga ohm': 'GΩ',
  'giga ohms': 'GΩ',
  mega: 'MΩ',
  megas: 'MΩ',
  megaohm: 'MΩ',
  megaohms: 'MΩ',
  'mega ohm': 'MΩ',
  'mega ohms': 'MΩ',
  tera: 'TΩ',
  teraohm: 'TΩ',
  teraohms: 'TΩ',
  micro: 'µΩ',
  microohm: 'µΩ',
  microohms: 'µΩ',
  'micro ohm': 'µΩ',
  'micro ohms': 'µΩ',
  mili: 'mΩ',
  miliohm: 'mΩ',
  miliohms: 'mΩ',
  'mili ohm': 'mΩ',
  'mili ohms': 'mΩ',
  ohm: 'Ω',
  ohms: 'Ω',
};

/** Words a spoken number never stands alone as (articles). */
const NOT_ALONE: ReadonlySet<string> = new Set(['um', 'uma']);

function plain(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

/** The unit a glued suffix or one or two words name, or null. */
function unitOf(...words: string[]): string | null {
  const joined = words.join(' ');
  if (words.length === 1 && SYMBOLS[joined] !== undefined) return SYMBOLS[joined]!;
  return WORDS[plain(joined)] ?? null;
}

interface Found {
  numbers: Set<string>;
  units: Set<string>;
  tags: Set<string>;
}

function numberOf(text: string): string | null {
  const raw = parseDecimalPtBr(text);
  return raw === null ? null : canonicalDecimal(raw);
}

/** The numbers, units and TAGs a text holds. */
function scan(text: string): Found {
  const found: Found = { numbers: new Set(), units: new Set(), tags: new Set() };
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(EDGE, ''))
    .filter((word) => word !== '');
  /** The unit named right after a number at `at`, and how many words it took (0 when none). */
  const unitAfter = (at: number): number => {
    const two = at + 1 < words.length ? unitOf(words[at]!, words[at + 1]!) : null;
    if (two !== null) {
      found.units.add(two);
      return 2;
    }
    const one = at < words.length ? unitOf(words[at]!) : null;
    if (one !== null) {
      found.units.add(one);
      return 1;
    }
    return 0;
  };
  let i = 0;
  while (i < words.length) {
    const word = words[i]!;
    if (TAG.test(word) && /\d/.test(word)) {
      found.tags.add(word.replace(/[-/.]/g, '').toUpperCase());
      i += 1;
      continue;
    }
    if (DIGITS.test(word)) {
      const number = numberOf(word);
      if (number !== null) found.numbers.add(number);
      i += 1 + unitAfter(i + 1);
      continue;
    }
    const glued = GLUED.exec(word);
    if (glued !== null) {
      const number = numberOf(glued[1]!);
      if (number !== null) found.numbers.add(number);
      const unit = unitOf(glued[2]!);
      if (unit !== null) found.units.add(unit);
      // A date or a range ("2026-11-26", "10/20"): every digit run is a number.
      else for (const part of glued[2]!.split(/[-/]/)) if (DIGITS.test(part)) found.numbers.add(numberOf(part) ?? part);
      i += 1 + (unit === null ? unitAfter(i + 1) : 0);
      continue;
    }
    // The longest run of words from here (at most twelve) that is one spoken number.
    let end = -1;
    let spoken: string | null = null;
    for (let j = i + 1; j <= Math.min(words.length, i + 12); j++) {
      const run = words.slice(i, j);
      if (run.length === 1 && NOT_ALONE.has(plain(run[0]!))) continue;
      const value = parseSpokenNumberPtBr(run.join(' '));
      if (value === null) continue;
      spoken = value;
      end = j;
    }
    if (spoken !== null) {
      found.numbers.add(canonicalDecimal(spoken));
      i = end + unitAfter(end);
      continue;
    }
    i += 1;
  }
  return found;
}

const KINDS: readonly { kind: GuardKind; key: keyof Found }[] = [
  { kind: 'number', key: 'numbers' },
  { kind: 'unit', key: 'units' },
  { kind: 'tag', key: 'tags' },
];

/**
 * Fails when `written` holds a number, a unit or a TAG that neither `heard` nor `context` holds
 * (`added`), or drops one `heard` held (`dropped`); the reasons list every added value first, then
 * every dropped one, each by kind (number, unit, TAG) in the order the text holds them.
 */
export function writtenTextGuard(heard: string, context: string, written: string): GuardVerdict {
  const said = scan(heard);
  const known = scan(context);
  const wrote = scan(written);
  const reasons: GuardReason[] = [];
  for (const { kind, key } of KINDS) {
    for (const value of wrote[key]) if (!said[key].has(value) && !known[key].has(value)) reasons.push({ kind, value, problem: 'added' });
  }
  for (const { kind, key } of KINDS) {
    for (const value of said[key]) if (!wrote[key].has(value)) reasons.push({ kind, value, problem: 'dropped' });
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
