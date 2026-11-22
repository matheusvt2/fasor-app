import type { ReportSeed, SeedWord } from './schema.ts';
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
  story27_8(seed);
  story27_9(seed);
  return seed;
}

// --- Story 27.8: The form's words, right on screen and in the document -------------------------

/** The first column of VERIFICAÇÕES GERAIS on v17 (F35), and the spelling of v1 to v16 it replaces. */
export const STORY_27_8_CHECKLIST_HEADER = 'ITEM';
export const STORY_27_8_CHECKLIST_HEADER_BEFORE = 'ÍTEM';
/** The surge arrester's block label on v17 (F35), and v1 to v16's. */
export const STORY_27_8_PARA_RAIO_LABEL = 'Para-raios';
export const STORY_27_8_PARA_RAIO_LABEL_BEFORE = 'Para-raio';
/** The caption activity whose participle agrees with the compound (F30): "Detalhe da limpeza e reaperto realizados". */
export const STORY_27_8_ACTIVITY = 'limpeza e reaperto';
export const STORY_27_8_ACTIVITY_PARTICIPLE: NonNullable<SeedWord['participle']> = { gender: 'm', number: 'plural' };

/**
 * Story 27.8 (F30, F35; decision 2 of 2026-11-21): the form's words spelled right on a new relatório. The checklist
 * header reads "ITEM", the surge arrester's label "Para-raios", and the activity "limpeza e reaperto" keeps its article
 * ("da", from its first noun) while its participle agrees with the compound, "realizados". Two rule flags: the caption's
 * equipment word of the surge arrester reads "para-raios" (`caption_para_raios`), and Story 27.3's section 10 sentence
 * names the open fichas with a reading out apart from the reprovadas (`parecer_open_apart`). The standard template's
 * "1º Subsolo" and the group title "TPs e TCs" are code (`seed/template.ts`, `print/group-for-print.ts`).
 */
function story27_8(seed: ReportSeed): void {
  if (seed.checklist_columns[0] !== STORY_27_8_CHECKLIST_HEADER_BEFORE) throw new Error(`seed v17: the checklist's first column is not ${STORY_27_8_CHECKLIST_HEADER_BEFORE}`);
  seed.checklist_columns = [STORY_27_8_CHECKLIST_HEADER, ...seed.checklist_columns.slice(1)];
  if (seed.blocks.para_raio.label !== STORY_27_8_PARA_RAIO_LABEL_BEFORE) throw new Error(`seed v17: the surge arrester is not labelled ${STORY_27_8_PARA_RAIO_LABEL_BEFORE}`);
  seed.blocks.para_raio.label = STORY_27_8_PARA_RAIO_LABEL;
  const activity = seed.atividades.find((word) => word.name === STORY_27_8_ACTIVITY);
  if (activity === undefined || activity.participle !== undefined) throw new Error(`seed v17: the activity ${STORY_27_8_ACTIVITY} is missing or already carries its participle`);
  activity.participle = structuredClone(STORY_27_8_ACTIVITY_PARTICIPLE);
  if (seed.rules?.caption_para_raios !== undefined || seed.rules?.parecer_open_apart !== undefined) throw new Error('seed v17: a Story 27.8 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), caption_para_raios: true, parecer_open_apart: true };
}

// --- Story 27.9: Agreement, one name for each thing, and no internal words on screen ----------------

/**
 * Story 27.9 (F36, F40): the printed half of the wording pass on a new relatório (`wording_pass`): a photo taken on a
 * non-conforming item is born "Não conformidade em ⟨item⟩…", a point started from an NC row ends ", conforme Imagem 1",
 * and section 8 prints a run of photo references as one "Imagens 1 e 2". The screen half reads on every seed.
 */
function story27_9(seed: ReportSeed): void {
  if (seed.rules?.wording_pass !== undefined) throw new Error('seed v17: the Story 27.9 rule flag is already set');
  seed.rules = { ...(seed.rules ?? {}), wording_pass: true };
}

export const CABINE_PRIMARIA_V17: ReportSeed = cabinePrimariaV17();
