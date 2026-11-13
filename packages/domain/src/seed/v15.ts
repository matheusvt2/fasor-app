import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V14 } from './v14.ts';

/*
 * Seed version 15 (Epic 25, Bruno's feedback of 2026-11-11 and Matheus's decisions M-1 to M-10):
 * seed v14 plus, story by story, the keys and rule flags that change how a new relatório
 * concludes, what its sheets ask and how it prints. Every new behaviour is reached through a v15
 * definition key or a flag of the seed-level `rules` object (`seedRule`), never through a version
 * number, so v1 to v14 read as before in every reader (AD-21); no relatório migrates its seed.
 *
 * Story 25.5 (batch e25c) opens v15 equal to v14: the version only, the same content and the same
 * rule flags, so a v15 relatório concludes and prints exactly as a v14 one. The later stories stack
 * on it, each in its own fenced section below, called from `cabinePrimariaV15` in story order.
 *
 * Derived from v14 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V14_HASH`, frozen since the Epic 24 deploy 2009fa30).
 */

const v14 = CABINE_PRIMARIA_V14;

// --- Story 25.6: a sheet with no measurement does not accept Aprovado ---------------------------

/**
 * Story 25.6 (M07, decision 6): the flag `no_measurement_refuses_aprovado`. A sheet whose live tests
 * hold no measured reading and at least one "Não medido" neither offers nor accepts Aprovado
 * (`noMeasurementRefusesAprovado`, `relatorio/conclusion.ts`); no definition key changes.
 */
function story25_6(seed: ReportSeed): void {
  seed.rules = { ...seed.rules, no_measurement_refuses_aprovado: true };
}

// --- Story 25.7: the conclusion text names a Reprovado by hand and the tests left unmeasured ------

/**
 * Story 25.7 (M20, decision 7; F12 by M-7): the flag `conclusion_names_choice_and_unmeasured`. The composed
 * conclusion paragraph (`composeConclusion`, `relatorio/conclusion.ts`) names each live test left "Não medido", says
 * that the responsible reproved a ficha whose floor does not reprove it, or restricted one whose paragraph indicates
 * no point, and recommends correcting "os pontos indicados" only when it indicates one; no definition key changes.
 */
function story25_7(seed: ReportSeed): void {
  seed.rules = { ...seed.rules, conclusion_names_choice_and_unmeasured: true };
}

// --- Story 25.8: a contact rise of exactly 50 % is "com restrição" ------------------------------

/** Story 25.8's tests: the contact resistance of the breaker and of the switch, the two carrying `history_rise_out_pct`. */
export const STORY_25_8_TESTS = [
  ['disjuntor_mt', 'resistencia_contato'],
  ['chave_seccionadora', 'resistencia_contato'],
] as const;

/**
 * Story 25.8 (Bruno's answer 1 of 2026-11-11): the definition key `restriction.history_rise_at_limit_restricted`
 * on the contact test of the breaker and the switch. A pole whose rise since the previous visit equals
 * `history_rise_out_pct` (50) is restricted (`riseAtLimitOf`, `relatorio/restriction.ts`); above it stays out.
 */
function story25_8(seed: ReportSeed): void {
  for (const [type, testKey] of STORY_25_8_TESTS) {
    const test = seed.blocks[type].tests.find((candidate) => candidate.key === testKey);
    if (test?.restriction?.history_rise_out_pct === undefined) throw new Error(`seed v15: ${type}.${testKey} lacks history_rise_out_pct`);
    test.restriction.history_rise_at_limit_restricted = true;
  }
}

// --- Story 25.9: N/A on a reading cell and on a row ----------------------------------------------

/**
 * Story 25.9 (M05, M-5): the flag `reading_not_applicable`. A reading cell of a seeded test and a number cell
 * of a measurement test take "Não se aplica" from the cell's menu, and a row's action marks every reading of
 * the row (`relatorio/reading-not-applicable.ts`): filled, never judged, left out of every comparison and of
 * the previous visit's rules, printed "N/A"; no definition key changes.
 */
function story25_9(seed: ReportSeed): void {
  seed.rules = { ...seed.rules, reading_not_applicable: true };
}

// --- Story 25.10: a point created from a test names every reading out of its criterion ----------

/**
 * Story 25.10 (M14; M-6): the flag `names_every_reading_out`. The text a point starts with when it is created
 * from a test (`sheetPointFindings`, `points/derived.ts`) names each reading of the test out of its criterion in
 * row order, with its value, and the criterion once, within the point text's cap; the conclusion paragraph and
 * the parecer's Reprovado sentence (`findingClauses`, `relatorio/conclusion.ts`) name each of them too, not only
 * the worst one. No definition key changes.
 */
function story25_10(seed: ReportSeed): void {
  seed.rules = { ...seed.rules, names_every_reading_out: true };
}

// --- Story 25.20: the criterion and the result print on each row, and the corrected columns say so ---

/**
 * Story 25.20 (M24; Bruno's answers 2, 3 and 5; Matheus's decision 5): two flags, print only.
 * `criterion_result_per_row`: every table `measurementTestPart` prints (`print/section-9.ts`) but a choice
 * test gains CRITÉRIO and RESULTADO on each row (`measurementRowJudgements`), fitted whole with each value
 * kept with its unit. `corrected_headers_corrigido`: the corrected columns read "20 °C (corrigido)" and
 * "75 °C (corrigido)" (`correctedPrintHeader`). No definition key changes.
 */
function story25_20(seed: ReportSeed): void {
  seed.rules = { ...seed.rules, criterion_result_per_row: true, corrected_headers_corrigido: true };
}

// --- Story 25.22: the fixed texts, the cover and the headers --------------------------------------

/**
 * Story 25.22's edits of the seed's fixed texts (M09, M10, M12, M13; Matheus's decision 11): each replaces exactly
 * one occurrence in its section's text in force since the base date, so a text that moved fails the seed's import.
 */
export const STORY_25_22_TEXT_EDITS: readonly { section: number; from: string; to: string }[] = [
  { section: 1, from: 'Transformação de {obra} da {cliente}.', to: 'Transformação da {cliente}, unidade {obra}.' },
  { section: 2, from: 'falhas eminentes', to: 'falhas iminentes' },
  { section: 4, from: 'EPC’s', to: 'EPCs' },
  { section: 4, from: 'EPI’s', to: 'EPIs' },
  { section: 5, from: 'dos EPI’s e EPC’s', to: 'dos EPIs e EPCs' },
  { section: 5, from: 'Conforme NR-10, capítulo 5.1, item 10.5.1:', to: 'Conforme NR-10, item 10.5.1:' },
  { section: 6, from: 'Transformador de Força (à seco)', to: 'Transformador de Força (a seco)' },
  { section: 6, from: 'QGBT’s', to: 'QGBTs' },
];

/** Story 25.22: the start of section 2's paragraph on earth resistance, which v15 removes. */
export const STORY_25_22_REMOVED_PARAGRAPH = 'Resistência Ôhmica de Aterramento:';

/** Story 25.22: the ratio tables' first column on v15, by type (v1 to v14: "TP's" on the TP, the source's "TPS" on the TC). */
export const STORY_25_22_RATIO_HEADERS = { tp: 'TPs', tc: 'TCs' } as const;

/**
 * Story 25.22: v15's own section texts (the edits above, section 2 without its paragraph on earth resistance) and
 * its ratio headers; the flags `obra_reads_site`, `relay_clause_by_exclusions` and `validity_line_without_number`
 * reach the kernel texts (`relatorio/section-variables.ts`, `print/section-10.ts`). The cover's rows are v14's: its
 * "Cidade/local" changes through `{obra}`. A template's or a relatório's own section text is never rewritten.
 */
function story25_22(seed: ReportSeed): void {
  const BASE = '2000-01-01';
  const edited = seed.sections.map((entry) => {
    if (entry.effective_from !== BASE || entry.blocks === null) return entry;
    let blocks = entry.blocks.map((block) => ({ ...block }));
    if (entry.section === 2) blocks = blocks.filter((block) => !block.text.startsWith(STORY_25_22_REMOVED_PARAGRAPH));
    for (const edit of STORY_25_22_TEXT_EDITS.filter((one) => one.section === entry.section)) {
      const hits = blocks.filter((block) => block.text.includes(edit.from));
      if (hits.length !== 1 || hits[0]!.text.split(edit.from).length !== 2) throw new Error(`seed v15: section ${edit.section} holds "${edit.from}" ${hits.length} times`);
      hits[0]!.text = hits[0]!.text.replace(edit.from, edit.to);
    }
    return { ...entry, blocks };
  });
  if (edited.find((entry) => entry.section === 2)!.blocks!.length !== seed.sections.find((entry) => entry.section === 2)!.blocks!.length - 1) {
    throw new Error('seed v15: section 2 lacks its paragraph on earth resistance');
  }
  seed.sections = edited;
  for (const type of ['tp', 'tc'] as const) {
    const table = seed.blocks[type].tests.find((test) => test.key === 'relacao_transformacao')?.tables?.[0];
    if (table?.connection_columns.length !== 1) throw new Error(`seed v15: ${type} lacks its ratio table`);
    table.connection_columns = [STORY_25_22_RATIO_HEADERS[type]];
  }
  seed.rules = { ...seed.rules, obra_reads_site: true, relay_clause_by_exclusions: true, validity_line_without_number: true };
}

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV15(): ReportSeed {
  const seed = structuredClone(v14);
  story25_6(seed);
  story25_7(seed);
  story25_8(seed);
  story25_9(seed);
  story25_10(seed);
  story25_20(seed);
  story25_22(seed);
  return seed;
}

export const CABINE_PRIMARIA_V15: ReportSeed = cabinePrimariaV15();
