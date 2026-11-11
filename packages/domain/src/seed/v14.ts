import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V13 } from './v13.ts';

/*
 * Seed version 14 (Epic 24, Bruno's answers of 2026-11-10 and Matheus's decisions of the same day):
 * seed v13 plus, batch by batch, the keys that change how a new relatório concludes, lists its
 * checks and prints. Every new behaviour is reached through a v14 definition key or a flag of the
 * seed-level `rules` object (`seedRule`), never through a version number, so v1 to v13 read as
 * before in every reader (AD-21); no relatório migrates its seed.
 *
 * Batch e24a's first commit opens v14 equal to v13 (the version only, no `rules`), so the later
 * batches stack on it, each in its own fenced section.
 *
 * Derived from v13 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V13_HASH`).
 */

const v13 = CABINE_PRIMARIA_V13;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV14(): ReportSeed {
  const seed = structuredClone(v13);
  withE24aRules(seed);
  return seed;
}

// --- batch e24a (Stories 24.3 and 24.4): the conclusion and section 10 rule flags ------------------

/**
 * Batch e24a (Story 24.3): a reading out of its criterion, a failed prerequisite or a defect Não
 * ensaiado makes the ficha Reprovado and nothing else, "Com restrições" is the technician's choice
 * (`conclusion_restriction_by_choice`), and the arrester's prerequisite is read only while its
 * nameplate sub-block is on (`prerequisite_needs_nameplate`). Story 24.4: the parecer's Reprovado
 * sentence names each reproved ficha's findings (`parecer_names_finding`), an NC observation typed in
 * several lines enters the conclusion on one line (`nc_clause_on_one_line`) and the fixed "nos itens 8
 * e 9" of a Conclusão text is replaced across its formatted runs (`results_reference_across_runs`).
 * Every flag is read by `seedRule` (`seed/definitions.ts`); `seed.test.ts` strips them (`withoutE24a`).
 */
function withE24aRules(seed: ReportSeed): void {
  seed.rules = {
    ...seed.rules,
    conclusion_restriction_by_choice: true,
    prerequisite_needs_nameplate: true,
    parecer_names_finding: true,
    nc_clause_on_one_line: true,
    results_reference_across_runs: true,
  };
}

export const CABINE_PRIMARIA_V14: ReportSeed = cabinePrimariaV14();
