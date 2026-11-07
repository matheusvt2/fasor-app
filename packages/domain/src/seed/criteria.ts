import { z } from 'zod';

/*
 * Story 2.6, NFR-14: "No criterion number may exist outside the seed module." Every
 * acceptance criterion FO.SERV-03 sources comes from `SEEDED_CRITERIA` below and nowhere
 * else — the Critérios de aceitação tab renders these constants directly (no Dexie query,
 * no `registry/criterion` op), and any later comparison against a measured value goes
 * through `compareCriterion`, including its unit scaling (e.g. GΩ vs MΩ).
 *
 * `registryRowSchemas.criterion` in `schemas/entities.ts` is a different, unused-by-this-story
 * kind (Boundaries & Constraints): an op-reachable per-company override shape reserved for a
 * later story, never read by this module.
 */

export const criterionTypeSchema = z.enum([
  'absolute_min',
  'absolute_max',
  'deviation_between',
  'deviation_vs_calculated',
  'pass_fail',
]);
export type CriterionType = z.infer<typeof criterionTypeSchema>;

export const criterionSeedSchema = z.object({
  /** Stable identifier, stored nowhere but this module (not an entity id). */
  key: z.string().min(1),
  /** The test sub-block this criterion governs, e.g. "Ensaio de isolação". */
  label: z.string().min(1),
  /**
   * `>`, `<`, `>=`, `<=`, or `±` for a symmetric deviation (Code Map, `compareCriterion`). Story
   * 14.6: a company type's criterion may also say `between` (with `value_max`) or `pass_fail`.
   */
  operator: z.string().min(1),
  value: z.number(),
  /** Story 14.6: the upper bound of a `between` criterion (a company type's only; no seeded one has it). */
  value_max: z.number().optional(),
  unit: z.string().nullable(),
  type: criterionTypeSchema,
  source: z.object({ name: z.string().min(1), edition: z.string().nullable() }),
  /** Design Notes: no block/sheet data exists before Epic 5, so this is static seed-authored prose, never derived. */
  usedBy: z.string().min(1),
});
export type CriterionSeed = z.infer<typeof criterionSeedSchema>;

const SOURCE = { name: 'aceitável na ficha', edition: null } as const;

/** FO.SERV-03's three sourced acceptance criteria (Story 2.6 AC1). */
export const SEEDED_CRITERIA: readonly CriterionSeed[] = [
  criterionSeedSchema.parse({
    key: 'isolacao',
    label: 'Ensaio de isolação',
    operator: '>',
    value: 400,
    unit: 'MΩ',
    type: 'absolute_min',
    source: SOURCE,
    usedBy: 'Cabos de entrada e saída, para-raios, seccionadoras, disjuntores, TP, TC, transformadores',
  }),
  criterionSeedSchema.parse({
    key: 'resistencia_contato',
    label: 'Resistência ôhmica de contato',
    operator: '<',
    value: 250,
    unit: 'µΩ',
    type: 'absolute_max',
    source: SOURCE,
    usedBy: 'Seccionadoras, disjuntores',
  }),
  criterionSeedSchema.parse({
    key: 'relacao_transformacao',
    label: 'Relação de transformação',
    operator: '±',
    value: 0.5,
    unit: '%',
    type: 'deviation_between',
    source: SOURCE,
    usedBy: 'TP, TC, transformadores de força (por TAP)',
  }),
];

/** Ω-unit scale table, relative to Ω = 1 (Code Map: µΩ/mΩ/Ω/kΩ/MΩ/GΩ, TΩ since Story 5.5). */
const OHM_SCALE: Readonly<Record<string, number>> = {
  'µΩ': 1e-6,
  mΩ: 1e-3,
  Ω: 1,
  kΩ: 1e3,
  MΩ: 1e6,
  GΩ: 1e9,
  TΩ: 1e12,
};

/** The units of the Ω scale table, smallest first ("µΩ" with U+00B5, the micro sign). */
export const OHM_UNITS: readonly string[] = Object.keys(OHM_SCALE);

/**
 * A value in `from` expressed in `to`, through the same Ω table `compareCriterion` scales
 * with; the value itself when the units are equal, null when they cannot be compared. Not
 * a comparison: the outlier check (`relatorio/readings.ts`) puts a table's readings in one
 * unit with it before measuring how far apart they are.
 */
export function scaleToUnit(value: number, from: string | null, to: string | null): number | null {
  if (from === to) return value;
  if (from === null || to === null || !(from in OHM_SCALE) || !(to in OHM_SCALE)) return null;
  return (value * OHM_SCALE[from]!) / OHM_SCALE[to]!;
}

export interface MeasuredValue {
  value: number;
  unit: string | null;
}

/**
 * AGENTS.md "derived text goes in `packages/domain`": the Critérios de aceitação table's
 * `.cell-crit` text, e.g. `>400 MΩ` or `±0,5 %` (pt-BR decimal comma, a space before the unit).
 */
export function formatCriterionValue(criterion: Pick<CriterionSeed, 'operator' | 'value' | 'value_max' | 'unit'>): string {
  const value = String(criterion.value).replace('.', ',');
  const withUnit = (text: string) => (criterion.unit === null ? text : `${text} ${criterion.unit}`);
  // authored (Story 14.6): a company type's two operators the seeds never use, as the editor's mock words them.
  if (criterion.operator === 'between' && criterion.value_max !== undefined) return withUnit(`entre ${value} e ${String(criterion.value_max).replace('.', ',')}`);
  if (criterion.operator === 'pass_fail') return 'aprovado ou reprovado';
  return withUnit(`${criterion.operator}${value}`);
}

/**
 * True when a measured value satisfies a seeded criterion (Story 14.6: or a company type's, which
 * adds `between`, both bounds inclusive and scaled as `>=`/`<=`, and `pass_fail`). `>`/`<`/`>=`/`<=` scale the
 * measured value into the criterion's unit first, through the Ω table, when both units are
 * known Ω units and differ (e.g. 147 GΩ compares against `>400 MΩ` as 147000 MΩ > 400 MΩ).
 * `±` never scales — it checks `|measured.value| <= criterion.value` directly, the shape a
 * percent deviation (relação de transformação) already arrives in.
 *
 * When the units differ and are not both known Ω-scale units (e.g. one is `null`, or either
 * is outside `OHM_SCALE`), this throws instead of silently comparing raw, unscaled numbers
 * under two different units — a comparison that would be meaningless, not merely imprecise.
 */
export function compareCriterion(measured: MeasuredValue, criterion: Pick<CriterionSeed, 'operator' | 'value' | 'value_max' | 'unit'>): boolean {
  if (criterion.operator === '±') {
    return Math.abs(measured.value) <= criterion.value;
  }
  // Story 14.6: a pass/fail reading is a verdict, 1 for aprovado and 0 for reprovado; no unit to scale.
  if (criterion.operator === 'pass_fail') return measured.value === 1;

  let value = measured.value;
  if (measured.unit !== criterion.unit) {
    if (measured.unit === null || criterion.unit === null || !(measured.unit in OHM_SCALE) || !(criterion.unit in OHM_SCALE)) {
      throw new Error(`compareCriterion: incompatible units "${measured.unit ?? 'unitless'}" vs "${criterion.unit ?? 'unitless'}"`);
    }
    value = (measured.value * OHM_SCALE[measured.unit]!) / OHM_SCALE[criterion.unit]!;
  }

  switch (criterion.operator) {
    case '>':
      return value > criterion.value;
    case '<':
      return value < criterion.value;
    case '>=':
      return value >= criterion.value;
    case '<=':
      return value <= criterion.value;
    // Story 14.6: both bounds inclusive ("entre 198 e 242 Vca" passes 198 and 242).
    case 'between':
      if (criterion.value_max === undefined) throw new Error('compareCriterion: between names no value_max');
      return value >= criterion.value && value <= criterion.value_max;
    default:
      throw new Error(`compareCriterion: unknown operator "${criterion.operator}"`);
  }
}
