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
  return structuredClone(v13);
}

export const CABINE_PRIMARIA_V14: ReportSeed = cabinePrimariaV14();
