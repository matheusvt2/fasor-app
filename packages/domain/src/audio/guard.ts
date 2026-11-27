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

export type GuardKind = 'number' | 'unit' | 'tag' | 'result';
export interface GuardReason {
  kind: GuardKind;
  /** The canonical value: a dot-decimal number (with its sign), a unit symbol, a TAG without separators, a result word's lemma. */
  value: string;
  problem: 'added' | 'dropped' | 'reordered';
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

/** One number of a text in reading order, with the unit said right after it (null when none). */
interface Measure {
  number: string;
  unit: string | null;
}

interface Found {
  numbers: Set<string>;
  units: Set<string>;
  tags: Set<string>;
  /** e31f: the result words the text holds, by lemma (`GUARD_RESULT_WORDS`). */
  results: Set<string>;
  /** e31f: every number in reading order, with its unit, for the order and binding checks. */
  measures: Measure[];
}

/** e31f: a sign written before a number: minus (hyphen or U+2212), plus-minus, or plus (dropped). */
const SIGNED = /^([-−±+])(?=\d)/;
const SIGN_OF: Readonly<Record<string, string>> = { '-': '-', '−': '-', '±': '±', '+': '' };

function numberOf(text: string): string | null {
  const raw = parseDecimalPtBr(text);
  return raw === null ? null : canonicalDecimal(raw);
}

/** A number with its sign: "-5", "±5", "5" (a minus on zero is zero). */
function signed(sign: string, number: string): string {
  return sign === '' || number === '0' ? number : `${sign}${number.replace(/^-/, '')}`;
}

/**
 * e31f: the result words (FR-79: a model never decides a result), lower case and accents stripped,
 * each with its inflections, by lemma. Preceded by "não" the lemma is the negated one ("não conforme"
 * is `nao_conforme`, never `conforme`), so a negation added or dropped is a different word.
 */
export const GUARD_RESULT_WORDS: Readonly<Record<string, string>> = {
  aprovado: 'aprovado',
  aprovada: 'aprovado',
  aprovados: 'aprovado',
  aprovadas: 'aprovado',
  reprovado: 'reprovado',
  reprovada: 'reprovado',
  reprovados: 'reprovado',
  reprovadas: 'reprovado',
  conforme: 'conforme',
  conformes: 'conforme',
  apto: 'apto',
  apta: 'apto',
  aptos: 'apto',
  aptas: 'apto',
  inapto: 'inapto',
  inapta: 'inapto',
  inaptos: 'inapto',
  inaptas: 'inapto',
};

/** e31f: the result words of a text, by lemma ("não conforme" and "não-conforme" read as `nao_conforme`). */
export function resultWordsOf(text: string): Set<string> {
  const words = plain(text)
    .split(/[\s\-‐‑–—/]+/)
    .map((word) => word.replace(EDGE, ''))
    .filter((word) => word !== '');
  const found = new Set<string>();
  words.forEach((word, at) => {
    const lemma = GUARD_RESULT_WORDS[word];
    if (lemma === undefined) return;
    found.add(at > 0 && words[at - 1] === 'nao' ? `nao_${lemma}` : lemma);
  });
  return found;
}

/**
 * Story 31.10: which words of a text (split on spacing, punctuation kept) are values the guard keeps:
 * a written number (signed, or with its unit glued), the unit right after one (one word or two), or
 * a TAG. The AI control's comparison never marks them as changed (`aiRewriteDiff`), since a proposal
 * that passed the guard holds the same ones. A spoken number is a word like any other here.
 */
export function guardedWordFlags(words: readonly string[]): boolean[] {
  const flags = words.map(() => false);
  let afterNumber = false;
  for (let i = 0; i < words.length; i++) {
    const bare = words[i]!.replace(EDGE, '');
    const unsigned = bare.replace(SIGNED, '');
    if (bare !== '' && (DIGITS.test(unsigned) || GLUED.test(unsigned))) {
      flags[i] = true;
      // A unit glued to the number ("13,8kV") is its unit; the next word is a word, as the guard reads it.
      const glued = GLUED.exec(unsigned);
      afterNumber = glued === null || unitOf(glued[2]!) === null;
      continue;
    }
    if (TAG.test(bare) && /\d/.test(bare)) {
      flags[i] = true;
      afterNumber = false;
      continue;
    }
    if (afterNumber && bare !== '') {
      const next = i + 1 < words.length ? words[i + 1]!.replace(EDGE, '') : '';
      if (next !== '' && unitOf(bare, next) !== null) {
        flags[i] = true;
        flags[i + 1] = true;
        i += 1;
        afterNumber = false;
        continue;
      }
      if (unitOf(bare) !== null) {
        flags[i] = true;
        afterNumber = false;
        continue;
      }
    }
    afterNumber = false;
  }
  return flags;
}

/** The numbers, units, TAGs and result words a text holds. */
function scan(text: string): Found {
  const found: Found = { numbers: new Set(), units: new Set(), tags: new Set(), results: resultWordsOf(text), measures: [] };
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(EDGE, ''))
    .filter((word) => word !== '');
  const addNumber = (number: string): Measure => {
    found.numbers.add(number);
    const measure: Measure = { number, unit: null };
    found.measures.push(measure);
    return measure;
  };
  /** The unit named right after a number at `at`, set on `measure`, and how many words it took (0 when none). */
  const unitAfter = (at: number, measure: Measure | null): number => {
    const two = at + 1 < words.length ? unitOf(words[at]!, words[at + 1]!) : null;
    if (two !== null) {
      found.units.add(two);
      if (measure !== null) measure.unit = two;
      return 2;
    }
    const one = at < words.length ? unitOf(words[at]!) : null;
    if (one !== null) {
      found.units.add(one);
      if (measure !== null) measure.unit = one;
      return 1;
    }
    return 0;
  };
  // e31f: a sign said or written apart from its number ("± 5 %", "menos cinco graus") applies to the next one.
  let pending = '';
  let i = 0;
  while (i < words.length) {
    const sign = pending;
    pending = '';
    let word = words[i]!;
    if (word === '±') {
      pending = '±';
      i += 1;
      continue;
    }
    // "menos cinco": a negative number; "mais ou menos cinco" is "about five", no sign (Coordinator's reading, open to Matheus).
    if (plain(word) === 'menos' && !(i >= 2 && plain(words[i - 1]!) === 'ou' && plain(words[i - 2]!) === 'mais')) {
      pending = '-';
      i += 1;
      continue;
    }
    let own = sign;
    const lead = SIGNED.exec(word);
    if (lead !== null) {
      own = SIGN_OF[lead[1]!]!;
      word = word.slice(lead[1]!.length);
    }
    if (TAG.test(word) && /\d/.test(word)) {
      found.tags.add(word.replace(/[-/.]/g, '').toUpperCase());
      i += 1;
      continue;
    }
    if (DIGITS.test(word)) {
      const number = numberOf(word);
      const measure = number === null ? null : addNumber(signed(own, number));
      i += 1 + unitAfter(i + 1, measure);
      continue;
    }
    const glued = GLUED.exec(word);
    if (glued !== null) {
      const number = numberOf(glued[1]!);
      const measure = number === null ? null : addNumber(signed(own, number));
      const unit = unitOf(glued[2]!);
      if (unit !== null) {
        found.units.add(unit);
        if (measure !== null) measure.unit = unit;
      }
      // A date or a range ("2026-11-26", "10/20"): every digit run is a number.
      else for (const part of glued[2]!.split(/[-/]/)) if (DIGITS.test(part)) addNumber(numberOf(part) ?? part);
      i += 1 + (unit === null ? unitAfter(i + 1, measure) : 0);
      continue;
    }
    // The longest run of words from here (at most twelve) that is one spoken number.
    let end = -1;
    let spoken: string | null = null;
    for (let j = i + 1; j <= Math.min(words.length, i + 12); j++) {
      const run = words.slice(i, j);
      if (run.length === 1 && NOT_ALONE.has(plain(run[0]!))) continue;
      // A hyphen inside a run would read as a space ("-12" as "12"): a signed word is never spoken.
      if (run.some((one) => /[-−±]/.test(one))) break;
      const value = parseSpokenNumberPtBr(run.join(' '));
      if (value === null) continue;
      spoken = value;
      end = j;
    }
    if (spoken !== null) {
      const measure = addNumber(signed(sign, canonicalDecimal(spoken)));
      i = end + unitAfter(end, measure);
      continue;
    }
    i += 1;
  }
  return found;
}

const KINDS: readonly { kind: GuardKind; key: 'numbers' | 'units' | 'tags' | 'results' }[] = [
  { kind: 'number', key: 'numbers' },
  { kind: 'unit', key: 'units' },
  { kind: 'tag', key: 'tags' },
  { kind: 'result', key: 'results' },
];

/** The numbers of some measures in reading order, each once (its first place). */
function firstOrder(measures: readonly Measure[], keep: (number: string) => boolean): string[] {
  const out: string[] = [];
  for (const { number } of measures) if (keep(number) && !out.includes(number)) out.push(number);
  return out;
}

/**
 * e31f: the order and binding checks, run once every value is accounted for. The numbers the heard
 * text holds must come in the written text in the same order (a value swapped between two phases is
 * refused), and a number heard with a unit must be written with that unit, or with none when the
 * next number written carries it ("147 e 150 GΩ").
 */
function orderReasons(said: Found, wrote: Found): GuardReason[] {
  const heardOrder = firstOrder(said.measures, () => true);
  const writtenOrder = firstOrder(wrote.measures, (number) => said.numbers.has(number));
  const moved = heardOrder.findIndex((number, at) => writtenOrder[at] !== number);
  if (moved !== -1) return [{ kind: 'number', value: heardOrder[moved]!, problem: 'reordered' }];
  const effective = wrote.measures.map((measure, at) => measure.unit ?? wrote.measures.slice(at + 1).find((next) => next.unit !== null)?.unit ?? null);
  const reasons: GuardReason[] = [];
  for (const { number, unit } of said.measures) {
    if (unit === null) continue;
    if (wrote.measures.some((measure, at) => measure.number === number && effective[at] === unit)) continue;
    if (!reasons.some((reason) => reason.value === unit)) reasons.push({ kind: 'unit', value: unit, problem: 'reordered' });
  }
  return reasons;
}

/**
 * Fails when `written` holds a number, a unit or a TAG that neither `heard` nor `context` holds, or
 * a result word `heard` does not hold (`added`); drops a number, a unit or a TAG `heard` held
 * (`dropped`); or, every value accounted for, moves a heard number out of its order or away from its
 * unit (`reordered`). The reasons list every added value first, then every dropped one, each by kind
 * (number, unit, TAG, result) in the order the text holds them. A signed number ("-12", "±5") is a
 * value of its own: "menos cinco" is "-5", and a sign added or dropped is a changed number.
 */
export function writtenTextGuard(heard: string, context: string, written: string): GuardVerdict {
  const said = scan(heard);
  const known = scan(context);
  const wrote = scan(written);
  const reasons: GuardReason[] = [];
  for (const { kind, key } of KINDS) {
    // A result word counts only when the heard text carries it: the context naming the picked result is no licence.
    for (const value of wrote[key]) if (!said[key].has(value) && (key === 'results' || !known[key].has(value))) reasons.push({ kind, value, problem: 'added' });
  }
  for (const { kind, key } of KINDS) {
    if (key === 'results') continue;
    for (const value of said[key]) if (!wrote[key].has(value)) reasons.push({ kind, value, problem: 'dropped' });
  }
  if (reasons.length === 0) reasons.push(...orderReasons(said, wrote));
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
