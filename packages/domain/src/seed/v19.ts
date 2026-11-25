import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V18 } from './v18.ts';

/*
 * Seed version 19 (Epic 30, the open-work audit of 2026-11-24; batch e30b opens it, Story 30.3): seed v18 plus
 * three printed texts that follow Bruno. Seed v18 was deployed with Epic 28 (de79700b, 2026-11-24) and is frozen,
 * so the changes go to a new version. Every new behaviour is reached through a flag of the seed-level `rules`
 * object (`seedRule`), never through a version number, so v1 to v18 read as before in every reader (AD-21); no
 * relatório migrates its seed.
 *
 * The opening commit of batch e30b makes v19 equal to v18: the version only, the same content and the same rule
 * flags, so a v19 relatório concludes and prints exactly as a v18 one.
 *
 * Fenced sections: each delta of Story 30.3 adds one section below, headed by a fence line
 *   // --- Story 30.3 (x): <what it changes> ---------------------------------------------
 * holding one `story30_3x(seed: ReportSeed): void` that edits the clone in place, called from
 * `cabinePrimariaV19` in order. Its undo is a `withoutE30b<x>` helper in `seed.test.ts`, named in `E30B_STRIPS`,
 * so `withoutE30b(v19)` stays v18.
 *
 * Derived from v18 rather than retyped, so the two differ only by what each delta adds (`seed.test.ts` pins the
 * difference and `V18_HASH`, frozen since the deploy of de79700b).
 */

const v18 = CABINE_PRIMARIA_V18;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV19(): ReportSeed {
  const seed = structuredClone(v18);
  story30_3a(seed);
  story30_3b(seed);
  story30_3c(seed);
  return seed;
}

// --- Story 30.3 (a): the seeded criteria written as Bruno writes them ---------------------------

/**
 * Story 30.3 (a) (L3106, L3160 (N10), L3944; Bruno's answer of 2026-11-11, item 9): one rule flag, `criterion_symbols`,
 * read by `criterionSymbols` (`seed/definitions.ts`) for `formatCriterionValue`: a criterion with no text of its own
 * reads "≥ 5 GΩ", "≤ 0,5 Ω", "> 400 MΩ", "< 250 µΩ" and "± 0,5 %", on the sheet and in section 9 alike. No criterion of
 * the seed changes: the operators stay as typed (`>=`, `±`), and a criterion with its own text reads as it stands.
 */
function story30_3a(seed: ReportSeed): void {
  if (seed.rules?.criterion_symbols !== undefined) throw new Error('seed v19: the Story 30.3 (a) rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), criterion_symbols: true };
}

// --- Story 30.3 (b): the conclusion of a type with no checklist ---------------------------------

/**
 * Story 30.3 (b) (L4011-G8): one rule flag, `conclusion_no_checklist_clause`, read by `composeConclusion`
 * (`relatorio/conclusion.ts`): a sheet with readings whose type has no checklist (the Malha de aterramento) concludes
 * "{verbo} {leituras}", with no ", sem itens verificados registrados".
 */
function story30_3b(seed: ReportSeed): void {
  if (seed.rules?.conclusion_no_checklist_clause !== undefined) throw new Error('seed v19: the Story 30.3 (b) rule flag is already set');
  if (seed.blocks.malha_aterramento?.checklist !== null) throw new Error('seed v19: the Malha de aterramento is expected to have no checklist');
  seed.rules = { ...(seed.rules ?? {}), conclusion_no_checklist_clause: true };
}

// --- Story 30.3 (c): the Malha's helper names the block its field is in -------------------------

/**
 * Story 30.3 (c) (L4011-G7): one rule flag, `helper_names_plate_block`, read where a `max_field` criterion says its
 * default (`relatorio/measurement-evaluation.ts`, `maxFieldDefaultText`): on a type that renames its plate block
 * (`nameplate_title`, the Malha's "Dados da malha" since v14) the helper reads "Sem VALOR DE PROJETO em Dados da malha,
 * vale ≤ 5 Ω."; a type that keeps the plate's name reads "na placa". Screen only: the note is not printed.
 */
function story30_3c(seed: ReportSeed): void {
  if (seed.rules?.helper_names_plate_block !== undefined) throw new Error('seed v19: the Story 30.3 (c) rule flag is already set');
  if (seed.blocks.malha_aterramento?.nameplate_title === undefined) throw new Error('seed v19: the Malha de aterramento is expected to rename its plate block');
  seed.rules = { ...(seed.rules ?? {}), helper_names_plate_block: true };
}

export const CABINE_PRIMARIA_V19: ReportSeed = cabinePrimariaV19();
