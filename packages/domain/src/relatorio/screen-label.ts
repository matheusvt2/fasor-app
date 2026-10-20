/*
 * Story 12.5 (D-9, DESIGN.md § v0.9 › Label, J-13): seed labels render in sentence case on
 * screen, "TENSÃO PRIMÁRIA" as "Tensão primária", while the stored labels and the generated
 * document keep FO.SERV-03's caps. `screenLabel` is the one place that turns a seed label
 * into its screen form; `apps/web` wraps a seed label with it and never lowercases a label
 * of its own. Option values (`AR`, `SF6`, `SIMPLIFICADA - POSTE`) are data, not labels, and
 * are never passed here.
 */

/**
 * The words kept as written whatever the label's case: acronyms and units of the seed
 * (FO.SERV-03), matched on their upper-case form, so "KV" and "kV" both render "kV".
 */
export const SCREEN_LABEL_ACRONYMS: readonly string[] = [
  'SE', // subestação
  'kV',
  'kVA',
  'kA',
  'TAG',
  'TAP',
  'RBC',
  'AT',
  'BT',
  'MT',
  'TP',
  'TC',
  'TPS',
  'NA',
  'NC',
  'NR',
  'CREA',
  // units a composed header may carry ("Valor (MΩ)")
  'MΩ',
  'GΩ',
  'TΩ',
  'kΩ',
  'VA',
  // Seed v5 (Story 14.5): the withstand and closing rating of a transfer switch, a nameplate field.
  'WCR',
  // Seed v6 (Story 14.9): the degree of protection of a quadro elétrico, a nameplate field.
  'IP',
];

const ACRONYM_BY_UPPER: ReadonlyMap<string, string> = new Map(SCREEN_LABEL_ACRONYMS.map((word) => [word.toUpperCase(), word]));

/**
 * The screen form of a word of `SCREEN_LABEL_ACRONYMS` ("KV" -> "kV", "tp" -> "TP"), or null
 * when the word is none of them. The one acronym rule of every sentence-case helper on screen
 * (`screenLabel` here, the Measurement table's `readingLabelText` and titles), E12-A7.
 */
export function screenAcronym(word: string): string | null {
  return ACRONYM_BY_UPPER.get(word.toUpperCase()) ?? null;
}

/** One word: letters and digits, with an apostrophe suffix kept on it ("TP's"). */
const WORD = /[\p{L}\p{N}]+(?:['’]\p{L}+)?/gu;

/** The one-letter word lowered in a caps label: the conjunction "E". Other single letters name a phase or a unit ("FASE A", "V PRIMÁRIO"). */
const ONE_LETTER_WORDS: ReadonlySet<string> = new Set(['E']);

/**
 * Whether a label is already written in sentence case: it holds a word of two or more
 * letters with a lower-case letter that is not an acronym of the list ("kV" in "TENSÃO (kV)"
 * does not make that label sentence case; "de" in "Nº de catálogo" does). An apostrophe
 * suffix is not the word ("TP's" is a caps word).
 */
function isSentenceCase(label: string): boolean {
  for (const [word] of label.matchAll(WORD)) {
    const stem = word.split(/['’]/)[0]!;
    if ([...stem].length >= 2 && /\p{Ll}/u.test(stem) && screenAcronym(stem) === null) return true;
  }
  return false;
}

/**
 * A seed label's screen form: sentence case, the acronyms of `SCREEN_LABEL_ACRONYMS` kept,
 * a word holding a digit kept ("SF6", "H1-H2", "50/51"), a single phase or unit letter
 * kept, and a word already holding a lower-case letter left as it is ("Cabos de entrada"
 * is unchanged). Only the first word, when this function lowered it, is capitalised.
 *
 * Seed v5 (Story 14.5): a label already written in sentence case is left exactly as written,
 * its capitals included: the library type's labels hold capitals a caps label could not give
 * back ("Intertravamento mecânico e elétrico N/E", "Gerador deixado em AUTOMÁTICO ao final",
 * "Proteção a montante"). The document still prints every label in caps.
 */
export function screenLabel(label: string): string {
  if (isSentenceCase(label)) return label;
  let first = true;
  return label.replace(WORD, (word) => {
    const isFirst = first;
    first = false;
    if (/\p{Ll}/u.test(word)) return word;
    const acronym = screenAcronym(word);
    if (acronym !== null) return acronym;
    if (/\p{N}/u.test(word)) return word;
    if ([...word].length === 1 && !ONE_LETTER_WORDS.has(word)) return word;
    const lower = word.toLocaleLowerCase('pt-BR');
    return isFirst ? lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1) : lower;
  });
}
