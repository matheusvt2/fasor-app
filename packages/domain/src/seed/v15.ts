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

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV15(): ReportSeed {
  const seed = structuredClone(v14);
  story25_6(seed);
  story25_7(seed);
  return seed;
}

export const CABINE_PRIMARIA_V15: ReportSeed = cabinePrimariaV15();
