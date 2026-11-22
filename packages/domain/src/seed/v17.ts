import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V16 } from './v16.ts';

/*
 * Seed version 17 (Epic 27 wave 2, batch e27b; the manual pass of 2026-11-21, decision 2): seed v16 plus,
 * story by story, the words of the form a new relatório prints spelled right and the rule flags that turn
 * the wave's printed changes on. Seed v16 was deployed with Epic 25 wave 3 (4ecc3009) and is frozen, so the
 * wave's changes to its definitions go to a new version. Every new behaviour is reached through a v17
 * definition key or a flag of the seed-level `rules` object (`seedRule`), never through a version number,
 * so v1 to v16 read as before in every reader (AD-21); no relatório migrates its seed.
 *
 * The opening commit of batch e27b makes v17 equal to v16: the version only, the same content and the same
 * rule flags, so a v17 relatório concludes and prints exactly as a v16 one.
 *
 * Fenced sections: each later story adds one section below, headed by a fence line
 *   // --- Story 27.N: <the story's title> ---------------------------------------------
 * holding one `story27_N(seed: ReportSeed): void` that edits the clone in place (and the exported
 * constants its tests read), and calls it from `cabinePrimariaV17` in story order. Its undo is a
 * `withoutE27b<N>` helper in `seed.test.ts`, named in `E27B_STRIPS`, so `withoutE27b(v17)` stays v16.
 *
 * Derived from v16 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V16_HASH`, frozen since the deploy of 4ecc3009).
 */

const v16 = CABINE_PRIMARIA_V16;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV17(): ReportSeed {
  const seed = structuredClone(v16);
  return seed;
}

export const CABINE_PRIMARIA_V17: ReportSeed = cabinePrimariaV17();
