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

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV15(): ReportSeed {
  const seed = structuredClone(v14);
  return seed;
}

export const CABINE_PRIMARIA_V15: ReportSeed = cabinePrimariaV15();
