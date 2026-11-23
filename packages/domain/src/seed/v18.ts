import type { BlockDefinition, FieldDef, ReportSeed } from './schema.ts';
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
  story28_3(seed);
  return seed;
}

/** The nameplate field `key` of the definition, or a seed error. */
function fieldOf(definition: BlockDefinition, key: string): FieldDef {
  const field = definition.nameplate.find((candidate) => candidate.key === key);
  if (field === undefined) throw new Error(`seed v18: ${definition.block_type} lacks the field ${key}`);
  return field;
}

// --- Story 28.3: The oil's names: "A SECO" or "A ÓLEO" on the transformer, "ÓLEO VEGETAL" on the TP and the TC ---

/** The transformer's TIPO DE ISOLAÇÃO on v18 (B-4; Bruno's Q-1: EPÓXI leaves it), its two options in this order. */
export const STORY_28_3_DRY = 'A SECO';
export const STORY_28_3_OIL = 'A ÓLEO';
export const STORY_28_3_TRANSFORMER_OPTIONS: readonly string[] = [STORY_28_3_DRY, STORY_28_3_OIL];
/** The v17 options the transformer's two now read: v6 to v17's oil spellings as "A ÓLEO", EPÓXI and "Á SECO" as "A SECO". */
export const STORY_28_3_TRANSFORMER_ALIASES: Readonly<Record<string, string>> = {
  ÓLEO: STORY_28_3_OIL,
  'ÓLEO MINERAL': STORY_28_3_OIL,
  'Á SECO': STORY_28_3_DRY,
  'ÓLEO ISOLANTE': STORY_28_3_OIL,
  EPÓXI: STORY_28_3_DRY,
};
/** The spelling v13 to v17 gave the oil option, which "A ÓLEO" takes the place of. */
export const STORY_28_3_OIL_BEFORE = 'ÓLEO ISOLANTE';
/** The EPÓXI option v1 to v17 offered on the transformer, now an alias of "A SECO" that implies its CONSTRUÇÃO. */
export const STORY_28_3_EPOXY = 'EPÓXI';

/**
 * The transformer's CONSTRUÇÃO on v18 (Bruno's Q-1, "se der", as in his test base): asked only while TIPO DE ISOLAÇÃO
 * is "A SECO" (shown while it is empty, as NATUREZA DO LÍQUIDO is), never required, a dry field of the oil rule (an oil
 * unit excuses it and prints "-"). Appended to the plate, so in print it takes the empty last pair after CLASSE
 * TÉRMICA and no v17 row moves; on screen it sits right after TIPO DE ISOLAÇÃO (Matheus, 2026-11-23). A unit copied
 * from a sheet that said EPÓXI arrives with "ENCAPSULADO EM RESINA EPÓXI". The helper is the frame's, listed for Bruno.
 */
export const STORY_28_3_CONSTRUCAO: FieldDef = {
  key: 'construcao',
  label: 'CONSTRUÇÃO',
  kind: 'select',
  options: ['ENCAPSULADO EM RESINA EPÓXI', 'IMPREGNADO A VÁCUO (VPI)'],
  optional: true,
  // authored (Story 28.1's frame, listed for Bruno): the helper under CONSTRUÇÃO.
  help: 'Opcional',
  excused_unless: { field: 'tipo_de_isolacao', in: [STORY_28_3_DRY] },
  screen_after: 'tipo_de_isolacao',
  implied_by: { field: 'tipo_de_isolacao', values: { [STORY_28_3_EPOXY]: 'ENCAPSULADO EM RESINA EPÓXI' } },
};

/** The TP's and the TC's TIPO DE ISOLAÇÃO on v18: v17's three and "ÓLEO VEGETAL", both oils of their oil rule. */
export const STORY_28_3_VEGETAL = 'ÓLEO VEGETAL';
export const STORY_28_3_INSTRUMENT_TYPES = ['tp', 'tc'] as const;

/**
 * Story 28.3 (B-4, the oil half of Story 25.19, with Bruno's Q-1 and Matheus's Q-2 and his decision on the frames):
 * - the transformer's TIPO DE ISOLAÇÃO offers "A SECO" and "A ÓLEO" only; v17's ÓLEO ISOLANTE (and its own aliases ÓLEO
 *   and ÓLEO MINERAL) read "A ÓLEO", EPÓXI and "Á SECO" read "A SECO"; the oil rule's `oil_values` and the oil
 *   sampling's condition read "A ÓLEO";
 * - NATUREZA DO LÍQUIDO is not drawn while TIPO DE ISOLAÇÃO holds a value other than "A ÓLEO" (its `excused_unless`),
 *   and TIPO (ANP), which hangs on it, with it; the printed plate keeps both rows, "-" on a dry unit (Q-2, "como hoje");
 * - CONSTRUÇÃO joins the plate (above);
 * - the TP and the TC offer EPÓXI, A SECO, ÓLEO MINERAL and ÓLEO VEGETAL, both oils in their `oil_values`.
 * The subtypes (template config keys `epoxi` and `a_seco`) stay as v17's: a stored template keeps validating.
 */
function story28_3(seed: ReportSeed): void {
  const transformer = seed.blocks.transformador_forca;
  const insulation = fieldOf(transformer, 'tipo_de_isolacao');
  if (JSON.stringify(insulation.options) !== JSON.stringify([STORY_28_3_EPOXY, STORY_28_3_DRY, STORY_28_3_OIL_BEFORE])) throw new Error('seed v18: the transformer\'s TIPO DE ISOLAÇÃO is not v17\'s');
  insulation.options = [...STORY_28_3_TRANSFORMER_OPTIONS];
  insulation.option_aliases = { ...STORY_28_3_TRANSFORMER_ALIASES };
  const liquid = fieldOf(transformer, 'natureza_liquido');
  if (liquid.excused_unless !== undefined) throw new Error('seed v18: NATUREZA DO LÍQUIDO already hangs on a field');
  liquid.excused_unless = { field: 'tipo_de_isolacao', in: [STORY_28_3_OIL] };
  if (transformer.nameplate.some((field) => field.key === STORY_28_3_CONSTRUCAO.key)) throw new Error('seed v18: the transformer already asks CONSTRUÇÃO');
  transformer.nameplate = [...transformer.nameplate, structuredClone(STORY_28_3_CONSTRUCAO)];
  const rule = transformer.oil_rule!;
  if (JSON.stringify(rule.oil_values) !== JSON.stringify([STORY_28_3_OIL_BEFORE])) throw new Error('seed v18: the transformer\'s oil rule is not v17\'s');
  rule.oil_values = [STORY_28_3_OIL];
  rule.dry_fields = [...(rule.dry_fields ?? []), STORY_28_3_CONSTRUCAO.key];
  const sampling = transformer.measurement_tests?.find((test) => test.key === 'coleta_oleo');
  const condition = sampling?.applies_when;
  if (condition === undefined || !('field' in condition) || condition.op !== 'in' || condition.field !== 'tipo_de_isolacao' || JSON.stringify(condition.values) !== JSON.stringify([STORY_28_3_OIL_BEFORE])) {
    throw new Error('seed v18: the transformer\'s oil sampling does not apply on v17\'s oil option');
  }
  condition.values = [STORY_28_3_OIL];

  for (const type of STORY_28_3_INSTRUMENT_TYPES) {
    const definition = seed.blocks[type];
    const field = fieldOf(definition, 'tipo_de_isolacao');
    if (field.options?.includes(STORY_28_3_VEGETAL) || JSON.stringify(definition.oil_rule?.oil_values) !== JSON.stringify(['ÓLEO MINERAL'])) throw new Error(`seed v18: the ${type}'s insulation is not v17's`);
    field.options = [...field.options!, STORY_28_3_VEGETAL];
    definition.oil_rule!.oil_values = [...definition.oil_rule!.oil_values, STORY_28_3_VEGETAL];
  }
}

export const CABINE_PRIMARIA_V18: ReportSeed = cabinePrimariaV18();
