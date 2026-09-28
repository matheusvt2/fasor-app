import type { CellAddress, EvaluatedRow, EvaluatedTable } from '../relatorio/readings.ts';
import { canonicalDecimal, parseDecimalPtBr } from './pt-br-number.ts';

/*
 * Story 9.4 (FR-40, UX-DR18): what a dictated utterance means. The device's speech engine
 * hands over a pt-BR transcript; this module is the only place that reads it:
 *
 * - `dictatedText` is the transcript as a prose field shows it (a caption, an observation,
 *   a point's text): trimmed, spaces collapsed, the first letter upper-cased;
 * - `parseTableUtterance` reads one Measurement table reading ("Fase A, 147 giga") into the
 *   target cell, its dot-decimal `raw` and its unit, or says it is unparsed (the speech then
 *   goes to the sheet observation as a suggestion);
 * - `tableDictationLabel` is a table's Dictation button name, with an example spoken the
 *   way the table's first row reads.
 *
 * Nothing here decides a verdict: a parsed reading is a Suggestion the engineer confirms.
 */

// --- words ---------------------------------------------------------------------------------

interface Token {
  /** As spoken, accents stripped, case kept (a unit symbol's case matters: MΩ vs mΩ). */
  raw: string;
  /** Lower case, for every other comparison. */
  word: string;
}

/** Punctuation a transcript leaves around a word ("A," "giga."). */
const EDGE_PUNCTUATION = /^[.,;:!?"'()“”‘’«»]+|[.,;:!?"'()“”‘’«»]+$/g;

/** A number written in digits, pt-BR style ("147", "120,1", "3.7", "2.500"). */
const DIGITS = /^\d+(?:[.,]\d+)*$/;

/** Digits glued to a unit ("147G", "145µΩ", "3,7T"). */
const GLUED = /^(\d+(?:[.,]\d+)*)(\p{L}+)$/u;

function stripAccents(text: string): string {
  // µ (U+00B5) and Ω have no decomposition, so they survive.
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

/** The words of a transcript: accents stripped, hyphens and slashes as spaces, edge punctuation gone, "fase" dropped. */
function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const piece of stripAccents(text).replace(/[-‐‑–—/]/g, ' ').split(/\s+/)) {
    const raw = piece.replace(EDGE_PUNCTUATION, '');
    if (raw === '') continue;
    const glued = GLUED.exec(raw);
    const parts = glued === null ? [raw] : [glued[1]!, glued[2]!];
    for (const part of parts) {
      const word = part.toLocaleLowerCase('pt-BR');
      if (word === 'fase') continue;
      out.push({ raw: part, word });
    }
  }
  return out;
}

/** The pt-BR cardinals, accents stripped. */
const CARDINALS: Readonly<Record<string, number>> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezasseis: 16,
  dezessete: 17,
  dezassete: 17,
  dezoito: 18,
  dezenove: 19,
  dezanove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  duzentas: 200,
  trezentos: 300,
  trezentas: 300,
  quatrocentos: 400,
  quatrocentas: 400,
  quinhentos: 500,
  quinhentas: 500,
  seiscentos: 600,
  seiscentas: 600,
  setecentos: 700,
  setecentas: 700,
  oitocentos: 800,
  oitocentas: 800,
  novecentos: 900,
  novecentas: 900,
};

const JOINER = 'e';
const THOUSAND = 'mil';
const DECIMAL_WORDS: ReadonlySet<string> = new Set(['virgula', 'ponto']);

/** A word that starts a number: digits, a cardinal or "mil". */
function startsNumber(word: string): boolean {
  return DIGITS.test(word) || word in CARDINALS || word === THOUSAND;
}

/** A word that can sit inside a spoken number. */
function inNumber(word: string): boolean {
  return startsNumber(word) || word === JOINER || DECIMAL_WORDS.has(word);
}

/**
 * The place of a part inside a group below "mil": hundreds, then tens or a teen, then units.
 * Digits said as a number ("2" in "2 mil") fill the whole group.
 */
type Place = 'hundreds' | 'tens' | 'teen' | 'units' | 'digits';

function placeOf(value: number, digits: boolean): Place {
  if (digits) return 'digits';
  if (value >= 100) return 'hundreds';
  if (value >= 20) return 'tens';
  if (value >= 10) return 'teen';
  return 'units';
}

/** The places a part may take after `previous` in the same group (null: the group's first part). */
function followsPlace(previous: Place | null, next: Place): boolean {
  if (previous === null) return true;
  if (previous === 'hundreds') return next === 'tens' || next === 'teen' || next === 'units';
  if (previous === 'tens') return next === 'units';
  return false;
}

/**
 * A whole number from its words ("cento e quarenta e sete", "dois mil e quinhentos", "2 mil");
 * null when they are no number. Inside a group below "mil" the parts must fall in place order
 * (hundreds, tens or a teen, units), so words said digit by digit ("um quatro sete") are no
 * number rather than their sum.
 */
function parseWhole(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  if (words.length === 1 && DIGITS.test(words[0]!)) {
    const raw = parseDecimalPtBr(words[0]!);
    return raw === null ? null : canonicalDecimal(raw);
  }
  let total = 0;
  let current = 0;
  let previous: 'number' | 'joiner' | null = null;
  let place: Place | null = null;
  for (const word of words) {
    if (word === JOINER) {
      if (previous !== 'number') return null;
      previous = 'joiner';
      continue;
    }
    if (word === THOUSAND) {
      total += (current === 0 ? 1 : current) * 1000;
      current = 0;
      place = null;
    } else if (/^\d+$/.test(word) || word in CARDINALS) {
      const digits = /^\d+$/.test(word);
      const value = digits ? Number(word) : CARDINALS[word]!;
      const next = placeOf(value, digits);
      if (!followsPlace(place, next)) return null;
      place = next;
      current += value;
    } else {
      return null;
    }
    previous = 'number';
  }
  if (previous !== 'number') return null;
  return String(total + current);
}

const SINGLE_DIGIT: Readonly<Record<string, string>> = {
  zero: '0',
  um: '1',
  uma: '1',
  dois: '2',
  duas: '2',
  tres: '3',
  quatro: '4',
  cinco: '5',
  seis: '6',
  sete: '7',
  oito: '8',
  nove: '9',
};

/** The digits after "vírgula": digit by digit ("zero cinco" -> "05"), or a cardinal ("vinte e cinco" -> "25"). */
function parseFraction(words: readonly string[]): string | null {
  if (words.length === 0) return null;
  if (words.length === 1 && /^\d+$/.test(words[0]!)) return words[0]!;
  if (words.length > 1 && words.every((word) => /^\d$/.test(word) || word in SINGLE_DIGIT)) {
    return words.map((word) => SINGLE_DIGIT[word] ?? word).join('');
  }
  const whole = parseWhole(words);
  return whole === null || whole.includes('.') ? null : whole;
}

/** A spoken number from its lower-cased, accent-stripped words; null when they are no number. */
function parseNumberWords(words: readonly string[]): string | null {
  const at = words.findIndex((word) => DECIMAL_WORDS.has(word));
  if (at === -1) return parseWhole(words);
  const whole = parseWhole(words.slice(0, at));
  const fraction = parseFraction(words.slice(at + 1));
  if (whole === null || fraction === null || whole.includes('.')) return null;
  return canonicalDecimal(`${whole}.${fraction}`);
}

/**
 * A number said in pt-BR as its dot-decimal `raw`: digits the Brazilian way ("120,1",
 * "2.500"), cardinals ("cento e quarenta e sete", "dois mil e quinhentos", "duas"), a
 * decimal by "vírgula" or "ponto" read digit by digit or as a cardinal ("um vírgula zero
 * cinco" -> "1.05", "147 vírgula cinco" -> "147.5"). Null when the text is not only a number.
 */
export function parseSpokenNumberPtBr(text: string): string | null {
  const words = tokenize(text).map((token) => token.word);
  if (words.length === 0 || !words.every(inNumber)) return null;
  return parseNumberWords(words);
}

// --- units ---------------------------------------------------------------------------------

/** Unit symbols, case-sensitive (mΩ is milliohm, MΩ megaohm). */
const UNIT_SYMBOLS: Readonly<Record<string, string>> = {
  MΩ: 'MΩ',
  GΩ: 'GΩ',
  TΩ: 'TΩ',
  µΩ: 'µΩ',
  μΩ: 'µΩ',
  mΩ: 'mΩ',
  Ω: 'Ω',
  V: 'V',
  kV: 'kV',
  KV: 'kV',
  A: 'A',
};

/** A unit's spoken prefix or name, lower case and accents stripped, "ohm" removed. */
const UNIT_WORDS: Readonly<Record<string, string>> = {
  giga: 'GΩ',
  gigas: 'GΩ',
  g: 'GΩ',
  mega: 'MΩ',
  megas: 'MΩ',
  meg: 'MΩ',
  m: 'MΩ',
  tera: 'TΩ',
  teras: 'TΩ',
  t: 'TΩ',
  micro: 'µΩ',
  micros: 'µΩ',
  'µ': 'µΩ',
  'μ': 'µΩ',
  mili: 'mΩ',
  milli: 'mΩ',
  volt: 'V',
  volts: 'V',
  v: 'V',
  quilovolt: 'kV',
  quilovolts: 'kV',
  kilovolt: 'kV',
  kilovolts: 'kV',
  kv: 'kV',
  ampere: 'A',
  amperes: 'A',
  amper: 'A',
  a: 'A',
};

const OHM_WORD = /^(?:ohms?|ω)$/;
const OHM_SUFFIX = /(?:ohms?|ω)$/;

/**
 * The unit a spoken word (or short phrase) names, when the field accepts it: "giga",
 * "gigaohms", "giga ohm", "G" -> GΩ; "mega" -> MΩ; "tera" -> TΩ; "micro", "micro-ohms",
 * "µΩ" -> µΩ; "mili" -> mΩ; "volts" -> V; "quilovolts" -> kV; "ampères" -> A. Null when
 * no unit word is there, 'invalid' when the unit named is not one of `units`.
 */
export function parseSpokenUnit(word: string, units: readonly string[]): string | null | 'invalid' {
  const text = stripAccents(word).replace(/[-‐‑–—]/g, ' ').replace(EDGE_PUNCTUATION, '').trim();
  if (text === '') return null;
  let unit: string | null = UNIT_SYMBOLS[text.replace(/\s+/g, '')] ?? null;
  if (unit === null) {
    const words = text.toLocaleLowerCase('pt-BR').split(/\s+/);
    let ohm = false;
    const kept = words.filter((w) => {
      if (!OHM_WORD.test(w)) return true;
      ohm = true;
      return false;
    });
    if (kept.length > 1) return null;
    let name = kept[0] ?? '';
    if (name !== '' && OHM_SUFFIX.test(name) && !OHM_WORD.test(name)) {
      name = name.replace(OHM_SUFFIX, '');
      ohm = true;
    }
    if (name === '') unit = ohm ? 'Ω' : null;
    else unit = UNIT_WORDS[name] ?? null;
    // "A" and "V" said with "ohm" make no unit.
    if (unit !== null && ohm && !unit.endsWith('Ω')) unit = null;
  }
  if (unit === null) return null;
  return units.includes(unit) ? unit : 'invalid';
}

// --- a Measurement table reading -----------------------------------------------------------

export type TableDictation = { kind: 'cell'; address: CellAddress; raw: string; unit: string | null } | { kind: 'unparsed'; text: string };

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, i) => word === b[i]);
}

function isPrefix(head: readonly string[], words: readonly string[]): boolean {
  return head.length <= words.length && head.every((word, i) => word === words[i]);
}

/** The rows a spoken head names (see `parseTableUtterance`). */
function rowsNamed(head: readonly string[], table: EvaluatedTable): EvaluatedRow[] {
  return table.rows.filter((row) => {
    if (head.length === 0) return table.rows.length === 1;
    const cells = row.connection.map((text) => tokenize(text).map((token) => token.word)).filter((cell) => cell.length > 0);
    return isPrefix(head, cells.flat()) || cells.some((cell) => sameWords(cell, head));
  });
}

/**
 * A dictated reading on one Measurement table: the words before the first number name the
 * row, the number is the value, what follows it the unit. A row matches when the head is a
 * word prefix of its connection cells read together ("T1 T2" on "T1-T2 · Fase A · Massa")
 * or equals one of them ("A" on the same row, "fase" being dropped). Exactly one row must
 * match; an empty head is accepted only on a one-row table. The target is the row's first
 * capture cell still empty; with no unit spoken it takes the unit that cell shows.
 * Anything else -- no number, no row or two rows, a unit the cell does not take, words
 * after the unit, a row with no empty capture cell -- is `unparsed`, with the transcript
 * as a prose field shows it.
 */
export function parseTableUtterance(transcript: string, table: EvaluatedTable): TableDictation {
  const unparsed: TableDictation = { kind: 'unparsed', text: dictatedText(transcript) };
  const tokens = tokenize(transcript);
  const words = tokens.map((token) => token.word);
  const first = words.findIndex(startsNumber);
  if (first === -1) return unparsed;
  let end = first;
  while (end < words.length && inNumber(words[end]!)) end++;
  const raw = parseNumberWords(words.slice(first, end));
  if (raw === null) return unparsed;
  const head = words.slice(0, first);

  const matches = rowsNamed(head, table);
  if (matches.length !== 1) return unparsed;
  const target = matches[0]!.cells.find((cell) => cell.role === 'capture' && cell.state === 'empty');
  if (target === undefined) return unparsed;

  const tail = tokens.slice(end).map((token) => token.raw);
  let unit = target.unit;
  if (tail.length > 0) {
    const spoken = parseSpokenUnit(tail.join(' '), target.units);
    if (spoken === null || spoken === 'invalid') return unparsed;
    unit = spoken;
  }
  return { kind: 'cell', address: target.address, raw, unit };
}

// --- texts ---------------------------------------------------------------------------------

/** A transcript as a prose field shows it: trimmed, spaces collapsed, the first letter upper-cased. */
export function dictatedText(transcript: string): string {
  const text = transcript.trim().replace(/\s+/g, ' ');
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);
}

/** How the example reading is said for a unit (the unit family of the table's first capture cell). */
function sampleReading(unit: string | null): string {
  switch (unit) {
    case 'GΩ':
      return '147 giga';
    case 'MΩ':
      return '147 mega';
    case 'TΩ':
      return '3 tera';
    case 'µΩ':
      return '145 micro';
    default:
      return '120 vírgula 1';
  }
}

/**
 * A Measurement table's Dictation button name: "Ditar leitura — ex.: “Fase A, 147 giga”". The
 * example names the first row whose label alone names only that row (the parser would refuse
 * an ambiguous one, as "Primário" on the transformer insulation); with none, the sample alone.
 */
export function tableDictationLabel(table: EvaluatedTable): string {
  const cell = table.rows[0]?.cells.find((c) => c.role === 'capture');
  const sample = sampleReading(cell?.unit ?? null);
  const named = table.rows.find((row) => {
    const head = tokenize(row.label).map((token) => token.word);
    return head.length > 0 && rowsNamed(head, table).length === 1;
  });
  return `Ditar leitura — ex.: “${named === undefined ? sample : `${named.label}, ${sample}`}”`;
}
