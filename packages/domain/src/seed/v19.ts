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
  return seed;
}

export const CABINE_PRIMARIA_V19: ReportSeed = cabinePrimariaV19();
