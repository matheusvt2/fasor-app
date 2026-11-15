import type { BlockDefinition, ChecklistItem, FieldDef, ReportSeed } from './schema.ts';
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
  story25_18(seed);
  story25_19(seed);
  return seed;
}

/** The item `key` of the definition's checklist, or a seed error. */
function itemOf(definition: BlockDefinition, key: string): ChecklistItem {
  const item = definition.checklist?.find((candidate) => candidate.key === key);
  if (item === undefined) throw new Error(`seed v16: ${definition.block_type} lacks the item ${key}`);
  return item;
}

// --- Story 25.18: The TC asks about its secondary, and the oil transformer's items say what they mean ---

/**
 * The TC's item 7 on v16 (Bruno's answer 11 to B-11 of Epic 24, M22), appended after BUCHAS. The label is
 * Bruno's wording; the three NC phrases are authored from its two parts (the secondary never open, the test
 * terminals in good order), listed for Bruno. The TP does not get it: its rule is the opposite one.
 */
export const STORY_25_18_TC_ITEM: ChecklistItem = {
  key: 'secundario_fechado_ou_curto_circuitado',
  label: 'SECUNDÁRIO FECHADO OU CURTO-CIRCUITADO NOS BORNES (NUNCA ABERTO); BORNES DE AFERIÇÃO EM BOM ESTADO',
  // authored (e25s, Story 25.18, listed for Bruno): the NC phrases of the TC's item 7.
  nc_phrases: ['secundário aberto nos bornes', 'bornes de aferição danificados', 'bornes de aferição oxidados ou com conexão frouxa'],
};

/**
 * The hints of six items of the transformer's list on v16 (M21, the story's wording), by item key: shown under
 * the label on the sheet only, never printed. No label, key or order changes.
 */
export const STORY_25_18_TRANSFORMER_HINTS: Readonly<Record<string, string>> = {
  oleo_isolante_indicador_de_nivel: 'NÍVEL DE ÓLEO',
  juntas_vedacoes_e_vazamentos: 'VAZAMENTOS DE ÓLEO',
  elemento_secante: 'SÍLICA GEL DO SECADOR',
  termometro: 'TERMÔMETRO DE ÓLEO',
  rele_de_gas_funcionamento: 'RELÉ BUCHHOLZ, QUANDO HOUVER',
  valvula_de_alivio: 'VÁLVULA DE ALÍVIO DE PRESSÃO, QUANDO HOUVER',
};

/**
 * Story 25.18: the TC's list gains item 7 (no subtype marks it NA and the oil rule does not name it: it is
 * asked on every TC); the transformer's six items gain their hints. The TP and every printed label are v15's.
 */
function story25_18(seed: ReportSeed): void {
  const tc = seed.blocks.tc;
  if (tc.checklist?.some((item) => item.key === STORY_25_18_TC_ITEM.key)) throw new Error('seed v16: the TC already asks its secondary');
  tc.checklist = [...tc.checklist!, structuredClone(STORY_25_18_TC_ITEM)];
  const transformer = seed.blocks.transformador_forca;
  for (const [key, hint] of Object.entries(STORY_25_18_TRANSFORMER_HINTS)) {
    const item = itemOf(transformer, key);
    if (item.hint !== undefined) throw new Error(`seed v16: the transformer's ${key} already has a hint`);
    item.hint = hint;
  }
}

// --- Story 25.19: One name for the insulating medium, and "A SECO" (the "A SECO" half) ---------------

/** The dry option and subtype label on v16 (M11), and the spelling it replaces, its alias. */
export const STORY_25_19_DRY = 'A SECO';
export const STORY_25_19_DRY_ALIAS = 'Á SECO';
/** The three types whose TIPO DE ISOLAÇÃO and subtype read the dry option. */
export const STORY_25_19_TYPES = ['transformador_forca', 'tp', 'tc'] as const;

/**
 * Story 25.19, the "A SECO" half only (the oil option's name waits for Bruno's answer to B-4): on the three
 * types TIPO DE ISOLAÇÃO's dry option and the dry subtype (key `a_seco`, kept) read "A SECO", in place, and
 * "Á SECO" becomes the field's alias of it, so a value copied from a v1 to v15 sheet, a template moved to v16
 * and a plate reading land on it (`selectOptionFor`). The oil option, its aliases, the oil rule and every
 * condition are v15's.
 */
function story25_19(seed: ReportSeed): void {
  for (const type of STORY_25_19_TYPES) {
    const definition = seed.blocks[type];
    const field: FieldDef | undefined = definition.nameplate.find((candidate) => candidate.key === 'tipo_de_isolacao');
    const at = field?.options?.indexOf(STORY_25_19_DRY_ALIAS) ?? -1;
    if (field === undefined || at < 0) throw new Error(`seed v16: the ${type}'s TIPO DE ISOLAÇÃO lacks ${STORY_25_19_DRY_ALIAS}`);
    field.options![at] = STORY_25_19_DRY;
    field.option_aliases = { ...(field.option_aliases ?? {}), [STORY_25_19_DRY_ALIAS]: STORY_25_19_DRY };
    const subtype = definition.subtypes.find((candidate) => candidate.key === 'a_seco');
    if (subtype === undefined || subtype.label !== STORY_25_19_DRY_ALIAS) throw new Error(`seed v16: the ${type} lacks the subtype ${STORY_25_19_DRY_ALIAS}`);
    subtype.label = STORY_25_19_DRY;
  }
}

export const CABINE_PRIMARIA_V16: ReportSeed = cabinePrimariaV16();
