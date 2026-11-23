import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V17 } from './v17.ts';

/*
 * Seed version 18 (Epic 28, Bruno's answers of 2026-11-22; batch e28a opens it): seed v17 plus, story by
 * story, the sheet, plate and fixed-text changes of the epic. Seed v17 was deployed with Epics 26 and 27
 * (886af55e) and is frozen, so the epic's changes to its definitions go to a new version. Every new
 * behaviour is reached through a v18 definition key or a flag of the seed-level `rules` object
 * (`seedRule`), never through a version number, so v1 to v17 read as before in every reader (AD-21); no
 * relatório migrates its seed.
 *
 * The opening commit of batch e28a (Story 28.2) makes v18 equal to v17: the version only, the same content
 * and the same rule flags, so a v18 relatório concludes and prints exactly as a v17 one.
 *
 * Fenced sections: each later story adds one section below, headed by a fence line
 *   // --- Story 28.N: <the story's title> ---------------------------------------------
 * holding one `story28_N(seed: ReportSeed): void` that edits the clone in place (and the exported
 * constants its tests read), and calls it from `cabinePrimariaV18` in story order. Its undo is a
 * `withoutE28<N>` helper in `seed.test.ts`, named in `E28_STRIPS`, so `withoutE28(v18)` stays v17.
 *
 * Derived from v17 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V17_HASH`, frozen since the deploy of 886af55e).
 */

const v17 = CABINE_PRIMARIA_V17;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV18(): ReportSeed {
  const seed = structuredClone(v17);
  return seed;
}

export const CABINE_PRIMARIA_V18: ReportSeed = cabinePrimariaV18();
