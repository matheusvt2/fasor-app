import type { ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V15 } from './v15.ts';

/*
 * Seed version 16 (Epic 25 wave 3, batch e25s): seed v15 plus, story by story, the keys and rule
 * flags of the wave that change what a new relatório's sheets ask (items, test rows, options) and
 * how it concludes and prints. Seed v15 was deployed with waves 1, 2, 4 and 5 (8d5e9e2e) and is
 * frozen, so the wave's changes to its sheet definitions go to a new version. Every new behaviour is
 * reached through a v16 definition key or a flag of the seed-level `rules` object (`seedRule`),
 * never through a version number, so v1 to v15 read as before in every reader (AD-21); no relatório
 * migrates its seed.
 *
 * The opening commit of batch e25s makes v16 equal to v15: the version only, the same content and
 * the same rule flags, so a v16 relatório concludes and prints exactly as a v15 one.
 *
 * Fenced sections: each later story adds one section below, headed by a fence line
 *   // --- Story 25.N: <the story's title> ---------------------------------------------
 * holding one `story25_N(seed: ReportSeed): void` that edits the clone in place (and the exported
 * constants its tests read), and calls it from `cabinePrimariaV16` in story order. Its undo is a
 * `withoutE25s<N>` helper in `seed.test.ts`, named in `E25S_STRIPS`, so `withoutE25s(v16)` stays v15.
 *
 * Derived from v15 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V15_HASH`, frozen since the deploy of 8d5e9e2e).
 */

const v15 = CABINE_PRIMARIA_V15;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV16(): ReportSeed {
  const seed = structuredClone(v15);
  return seed;
}

export const CABINE_PRIMARIA_V16: ReportSeed = cabinePrimariaV16();
