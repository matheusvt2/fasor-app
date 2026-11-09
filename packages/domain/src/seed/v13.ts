import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V12 } from './v12.ts';

/*
 * Seed version 13 (Epic 23, Bruno's test base rev08 and Matheus's decisions of 2026-11-08): seed v12
 * plus, story by story, the keys that make the base what new relatórios are judged by. Every new
 * behaviour is reached through a v13 definition key, so a definition of v1 to v12 reads as before in
 * every reader (AD-21); no relatório migrates its seed.
 *
 * Batch e23a's first commit opens v13 equal to v12 (the version only), so batch e23b stacks on it.
 *
 * Derived from v12 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V12_HASH`).
 */

const v12 = CABINE_PRIMARIA_V12;

function cabinePrimariaV13(): ReportSeed {
  return structuredClone(v12);
}

export const CABINE_PRIMARIA_V13: ReportSeed = cabinePrimariaV13();
