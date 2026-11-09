import { z } from 'zod';
import { subBlockKeySchema } from '../schemas/block-config.ts';
import { testHelpSchema, testRecommendationSchema } from './test-help.ts';

/*
 * Story 14.5 (seed v5, AD-21): the measurement-table grammar. The four grammars of FO.SERV-03
 * (`testDefSchema`: insulation, contact resistance, the three ratio variants) hold one typed
 * capture per row judged by one seeded criterion. A library type needs more, and this grammar
 * holds exactly what the Chave de transferência automática uses, nothing else:
 *
 * - fixed named rows and several typed columns, each a number with its unit or a choice;
 * - a row that overrides its columns' kind (the controller settings mix %, s, min and choices);
 * - a fixed cell, drawn as text and never typed;
 * - rows and criteria that exist only under a block configuration (`when`: polos, tensão);
 * - test values beside the table (how the test was run), some shown only under another value;
 * - four criteria: an absolute limit, a limit relative to the lowest of the column, equality
 *   between two columns of a row, and a choice that passes.
 *
 * Every criterion names its source: `criterionSourceSchema` is required on each, so a seed
 * that ships one without it fails at module load (`seed.test.ts`).
 *
 * Addressing is the op log's: a table cell is `sheet/{b}/test/{testKey}/cell/{row}/{col}`,
 * `row` the index in the test's `rows` (a row hidden by the configuration keeps its index)
 * and `col` the index in `columns`; a test value is `sheet/{b}/test/{testKey}/value/{key}`.
 */

const seedKey = z.string().regex(/^[a-z0-9_]+$/);
const label = z.string().min(1);

/** What a cell or a test value holds: a number with its unit, or one option of a closed list. */
export const measurementKindSchema = z.enum(['number', 'choice']);
export type MeasurementKind = z.infer<typeof measurementKindSchema>;

/**
 * One option of a choice. `phrase` is how the option reads inside the test's values line
 * ("tempos por instrumento") where its bare label ("Instrumento") would not say what it is of.
 */
export const measurementOptionSchema = z.object({
  key: seedKey,
  label,
  phrase: z.string().min(1).optional(),
});
export type MeasurementOption = z.infer<typeof measurementOptionSchema>;

const options = z
  .array(measurementOptionSchema)
  .min(2)
  .refine((list) => new Set(list.map((option) => option.key)).size === list.length, { message: 'an option key repeats' });

/** The block configuration a row or a criterion exists under: the config field's value is one of `in`. */
export const whenConfigSchema = z.object({ config: seedKey, in: z.array(seedKey).min(1) });
export type WhenConfig = z.infer<typeof whenConfigSchema>;

/** The test value that skips the table: that value's option equals `equals`. */
export const skipWhenSchema = z.object({ value: seedKey, equals: seedKey });
export type SkipWhen = z.infer<typeof skipWhenSchema>;

/**
 * The test value another value is shown under: that value's option equals `equals`. Seed v13
 * (batch e23t, Story 23.17): or a choice cell of the table (`cell`, its row and column keys)
 * holds the option `equals` (the oil sampling's Motivo, shown under Amostra "Não coletado").
 */
export const whenValueSchema = z.union([skipWhenSchema, z.object({ cell: z.object({ row: seedKey, column: seedKey }), equals: seedKey })]);
export type WhenValue = z.infer<typeof whenValueSchema>;

/*
 * Seed v13, batch e23t (Stories 23.15 to 23.17 and 23.19): the base's status of a criterion row
 * (rev08's STATUS column), data only. Declared here, where the measurement grammar reads it, and
 * re-exported by `criteria-tables.ts` (which imports this module, so the cycle stays one way).
 */
export const CRITERION_ROW_STATUSES = ['CONFIRMADO', 'CONFERIR NA NORMA', 'FABRICANTE', 'PADRÃO FASOR'] as const;
export const criterionRowStatusSchema = z.enum(CRITERION_ROW_STATUSES);
export type CriterionRowStatus = z.infer<typeof criterionRowStatusSchema>;

/** `kind` with what it carries: options exactly on a choice, a unit only on a number. */
const typed = {
  kind: measurementKindSchema,
  unit: z.string().min(1).optional(),
  options: options.optional(),
};
const kindRefinements = <T extends { kind?: MeasurementKind | undefined; unit?: string | undefined; options?: readonly MeasurementOption[] | undefined }>(
  value: T,
  ctx: z.RefinementCtx,
): void => {
  if (value.kind === 'choice' && value.options === undefined) ctx.addIssue({ code: 'custom', path: ['options'], message: 'a choice lists its options' });
  if (value.kind !== 'choice' && value.options !== undefined) ctx.addIssue({ code: 'custom', path: ['options'], message: 'options exist only on a choice' });
  if (value.kind === 'choice' && value.unit !== undefined) ctx.addIssue({ code: 'custom', path: ['unit'], message: 'a unit belongs to a number' });
};

/** A column of the table. `optional`: typed when known, never counted as missing (Fábrica, Ajuste, the ΔT columns). */
export const measurementColumnSchema = z
  .object({
    key: seedKey,
    label,
    ...typed,
    optional: z.literal(true).optional(),
  })
  .superRefine(kindRefinements);
export type MeasurementColumn = z.infer<typeof measurementColumnSchema>;

/**
 * A row of the table. `kind`, `unit` and `options` override every column's for this row
 * (given together: a row either follows its columns or names its own kind). `fixed` maps a
 * column key to the text the cell shows instead of a field; `when` hides the row unless the
 * block's configuration matches.
 */
export const measurementRowSchema = z
  .object({
    key: seedKey,
    label,
    kind: measurementKindSchema.optional(),
    unit: z.string().min(1).optional(),
    options: options.optional(),
    fixed: z.record(seedKey, z.string().min(1)).optional(),
    when: whenConfigSchema.optional(),
    /**
     * Seed v13 (batch e23t, Story 23.15): a row typed when known, its cells never counted as
     * missing (the winding table's extreme taps). Optional and never defaulted.
     */
    optional: z.literal(true).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.kind === undefined && (row.unit !== undefined || row.options !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: 'a row that names a unit or options names its kind' });
    }
    kindRefinements(row, ctx);
  });
export type MeasurementRow = z.infer<typeof measurementRowSchema>;

/**
 * A value of the test outside its table (the E5 método, the ambient temperature). `when`
 * shows it only under another value's option; `group` gathers values into one labelled row
 * after the table ("Na Emergência, com carga": V, Hz, A); `optional` as on a column.
 */
export const measurementValueSchema = z
  .object({
    key: seedKey,
    label,
    ...typed,
    optional: z.literal(true).optional(),
    when: whenValueSchema.optional(),
    group: z.string().min(1).optional(),
  })
  .superRefine(kindRefinements);
export type MeasurementValue = z.infer<typeof measurementValueSchema>;

/** Where a criterion comes from. Required on every criterion of this grammar. */
export const criterionSourceSchema = z.object({ name: z.string().min(1), edition: z.string().min(1).nullable() });
export type CriterionSource = z.infer<typeof criterionSourceSchema>;

const criterionBase = {
  source: criterionSourceSchema,
  /** The configuration the criterion applies under; always, when absent. */
  when: whenConfigSchema.optional(),
};
/** The criterion's wording, as the test's caption and the printed ACEITÁVEL line say it. */
const criterionText = z.string().min(1);

/**
 * An absolute limit on number cells: `operator value unit`, on every number cell or only on
 * `rows` and `columns`; or `seeded`, the firm's own seeded criterion of that key
 * (`SEEDED_CRITERIA`), whose value and wording are read from there and never repeated here.
 */
export const absoluteCriterionShape = {
  type: z.literal('absolute'),
  operator: z.enum(['>', '>=', '<', '<=']).optional(),
  value: z.number().optional(),
  unit: z.string().min(1).nullable().optional(),
  seeded: z.enum(['isolacao']).optional(),
  rows: z.array(seedKey).min(1).optional(),
  columns: z.array(seedKey).min(1).optional(),
  text: criterionText.optional(),
  ...criterionBase,
};

/** The rule of an absolute criterion: its own limit and text, or a seeded criterion and nothing else (Story 14.6: the company variant shares it). */
export function checkAbsoluteCriterion(
  criterion: { operator?: string | undefined; value?: number | undefined; unit?: string | null | undefined; seeded?: string | undefined; text?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const own = criterion.operator !== undefined || criterion.value !== undefined || criterion.unit !== undefined || criterion.text !== undefined;
  if (criterion.seeded !== undefined) {
    if (own) ctx.addIssue({ code: 'custom', path: ['seeded'], message: 'a seeded criterion carries no limit or text of its own' });
    return;
  }
  if (criterion.operator === undefined || criterion.value === undefined || criterion.unit === undefined || criterion.text === undefined) {
    ctx.addIssue({ code: 'custom', path: ['operator'], message: 'an absolute criterion names its operator, value, unit and text, or a seeded criterion' });
  }
}

export const absoluteCriterionSchema = z.object(absoluteCriterionShape).superRefine(checkAbsoluteCriterion);

/** A limit relative to the lowest measured cell of the same column: at most `max_percent` above it. */
export const relativeToLowestCriterionSchema = z.object({
  type: z.literal('relative_to_lowest'),
  max_percent: z.number().positive(),
  /** The label of the row that shows each column's lowest value ("Menor do lado"). */
  reference_label: label,
  text: criterionText,
  ...criterionBase,
});

/** Equality inside a row: the cell of `column` holds what the cell of `reference` holds. */
export const equalsColumnCriterionSchema = z.object({
  type: z.literal('equals_column'),
  column: seedKey,
  reference: seedKey,
  text: criterionText,
  ...criterionBase,
});

/** A choice that passes: the cell of `column` holds one of `pass`. */
export const choicePassCriterionSchema = z.object({
  type: z.literal('choice_pass'),
  column: seedKey,
  pass: z.array(seedKey).min(1),
  text: criterionText,
  ...criterionBase,
});

/**
 * Seed v13 (batch e23t, Story 23.15; Story 23.19 reuses it): the deviation between phases. Per
 * group (a row's number cells with `across: 'columns'`, a column's with `'rows'`) each measured
 * cell's deviation over the group's lowest measured positive cell, in %, compared in one unit:
 * at most `within_max_pct` is within; with `restricted_max_pct`, at most it is restricted and
 * above it out; without it, above `within_max_pct` is `above`. `medium` makes the criterion judge
 * only while the definition's oil rule reads that medium (an unknown medium judges no deviation).
 * A cell above the instrument's limit is out (an open circuit) whatever the medium and leaves its
 * group; a group with fewer than two measured cells judges no deviation (`measurement-evaluation.ts`).
 */
export const phaseDeviationCriterionSchema = z
  .object({
    type: z.literal('phase_deviation'),
    across: z.enum(['columns', 'rows']),
    within_max_pct: z.number().positive(),
    restricted_max_pct: z.number().positive().optional(),
    above: z.enum(['out', 'restricted']),
    medium: z.enum(['oil', 'dry']).optional(),
    text: criterionText,
    /** The base's status of the rule (data only, never shown). */
    status: criterionRowStatusSchema.optional(),
    ...criterionBase,
  })
  .superRefine((criterion, ctx) => {
    if (criterion.restricted_max_pct === undefined) return;
    if (criterion.restricted_max_pct <= criterion.within_max_pct) ctx.addIssue({ code: 'custom', path: ['restricted_max_pct'], message: 'restricted_max_pct is above within_max_pct' });
    if (criterion.above !== 'out') ctx.addIssue({ code: 'custom', path: ['above'], message: 'above a restricted band is out' });
  });

// --- e23e: Stories 23.13, 23.18, 23.20, 23.21 ---

/** The level a band of a `bands` criterion gives a cell (`measurement-evaluation.ts`). */
export const bandLevelSchema = z.enum(['within', 'restricted', 'out']);
export type BandLevel = z.infer<typeof bandLevelSchema>;

/**
 * Seed v13, batch e23e (Story 23.20; NETA MTS-2023 Table 100.18): a band table over one number
 * column. Each measured cell of `column` takes the first band whose `up_to` (inclusive, in the
 * column's unit) it does not exceed, the last band (and only it) open-ended: `within`, `restricted`
 * (its `class` and `action` the restriction's reason) or `out`. The bands ascend. `status` is the
 * base's status of the rule (data only).
 */
export const bandsCriterionSchema = z
  .object({
    type: z.literal('bands'),
    column: seedKey,
    bands: z
      .array(z.object({ up_to: z.number().optional(), level: bandLevelSchema, class: z.string().min(1), action: z.string().min(1).optional() }))
      .min(2),
    text: criterionText,
    status: criterionRowStatusSchema.optional(),
    ...criterionBase,
  })
  .superRefine((criterion, ctx) => {
    const last = criterion.bands.length - 1;
    criterion.bands.forEach((band, i) => {
      if (i < last && band.up_to === undefined) ctx.addIssue({ code: 'custom', path: ['bands', i, 'up_to'], message: 'every band but the last has an up_to' });
      if (i === last && band.up_to !== undefined) ctx.addIssue({ code: 'custom', path: ['bands', i, 'up_to'], message: 'the last band is open-ended' });
      const previous = i === 0 ? undefined : criterion.bands[i - 1]!.up_to;
      if (band.up_to !== undefined && previous !== undefined && band.up_to <= previous) ctx.addIssue({ code: 'custom', path: ['bands', i, 'up_to'], message: 'bands ascend by up_to' });
    });
  });

/**
 * Seed v13, batch e23e (Story 23.21; Base rev08 AT-01): a maximum read from the plate. Every
 * measured number cell is within at most the nameplate number `field` holds, in `unit`, else at
 * most `default` while the field is empty (the cell's helper then says the default applies); out
 * above. `default_status` is the base's status of the default, `status` the rule's (data only).
 */
export const maxFieldCriterionSchema = z.object({
  type: z.literal('max_field'),
  field: seedKey,
  default: z.number().positive(),
  unit: z.string().min(1),
  text: criterionText,
  default_status: criterionRowStatusSchema,
  status: criterionRowStatusSchema.optional(),
  ...criterionBase,
});

export const measurementCriterionSchema = z.discriminatedUnion('type', [
  absoluteCriterionSchema,
  relativeToLowestCriterionSchema,
  equalsColumnCriterionSchema,
  choicePassCriterionSchema,
  phaseDeviationCriterionSchema,
  // Seed v13, batch e23e (Stories 23.20 and 23.21).
  bandsCriterionSchema,
  maxFieldCriterionSchema,
]);
type SeedMeasurementCriterion = z.infer<typeof measurementCriterionSchema>;

/** The limit a company type's criteria row gives an absolute criterion (`asBlockDefinition`), shaped as the seeded criteria are. */
export interface SeededLimit {
  key: string;
  label: string;
  operator: string;
  value: number;
  value_max?: number;
  unit: string | null;
  type: string;
  source: { name: string; edition: string | null };
  usedBy: string;
}

/**
 * A measurement criterion as every reader takes it. Story 14.6: on a company type, an absolute
 * criterion's `seeded` names a row of the type's own criteria table (any key, not only the seeded
 * `isolacao`), and `asBlockDefinition` carries that row as `seeded_criterion`, which the readers
 * take before `SEEDED_CRITERIA`.
 */
export type MeasurementCriterion =
  | (Omit<Extract<SeedMeasurementCriterion, { type: 'absolute' }>, 'seeded'> & { seeded?: string; seeded_criterion?: SeededLimit })
  | Exclude<SeedMeasurementCriterion, { type: 'absolute' }>;

/*
 * Seed v13 (Story 23.9, decision J): a test's applicability condition over one nameplate field,
 * a small closed grammar the kernel evaluates (`relatorio/applicability.ts`): `in` (a select holds
 * one of `values`), `filled` (the field holds a value), `above` and `below` (a number field
 * holds more, or less, than `value`, in the field's unit). Unmet, the test is not applicable
 * (NA) with its reason, until a per-test override applies it. An empty field applies the test
 * unless `needs_value` says the test needs that value (the conservative reading); an "N/A" on
 * the field is filled and meets no condition. `unmet` is how the reason says the plate's answer
 * ("sem fusíveis"); without it the kernel composes one per operator. Shared by both test
 * grammars; optional and never defaulted, so v1 to v12 parse to the bytes they shipped with.
 */
const appliesWhenBase = {
  field: seedKey,
  needs_value: z.literal(true).optional(),
  unmet: z.string().min(1).optional(),
};

/** Seed v13 (Story 23.9): a condition over one nameplate field (see above). */
export const plateAppliesWhenSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('in'), values: z.array(z.string().min(1)).min(1), ...appliesWhenBase }),
  z.object({ op: z.literal('filled'), ...appliesWhenBase }),
  z.object({ op: z.literal('above'), value: z.number(), ...appliesWhenBase }),
  z.object({ op: z.literal('below'), value: z.number(), ...appliesWhenBase }),
]);
export type PlateAppliesWhen = z.infer<typeof plateAppliesWhenSchema>;

/**
 * Seed v13, batch e23e (Story 23.20; Base rev08 GE-01 "Aplica-se: Equipamento em carga"): a
 * condition over one choice value of the measurement test itself (`value`, a key of its `values`):
 * met while the value holds one of the option keys `values`. Empty, it applies the test unless
 * `needs_value`, and then its reason says `empty`; unmet, `unmet` (own wordings, never a plate's).
 * Only a measurement test carries it (`checkMeasurementTest`); the NA band keeps the value's control.
 */
export const valueAppliesWhenSchema = z.object({
  op: z.literal('in'),
  value: seedKey,
  values: z.array(seedKey).min(1),
  needs_value: z.literal(true).optional(),
  unmet: z.string().min(1),
  empty: z.string().min(1).optional(),
});
export type ValueAppliesWhen = z.infer<typeof valueAppliesWhenSchema>;

/** Seed v13 (Story 23.9): the condition a test applies under (see above); batch e23e: over a plate field or (Story 23.20) a test value. */
export const appliesWhenSchema = z.union([plateAppliesWhenSchema, valueAppliesWhenSchema]);
export type AppliesWhen = z.infer<typeof appliesWhenSchema>;

/** Batch e23e (Story 23.20): whether a condition reads a value of the test rather than a plate field. */
export function isValueCondition(condition: AppliesWhen): condition is ValueAppliesWhen {
  return 'value' in condition && typeof condition.value === 'string';
}

/** The seeded test kinds whose registry instruments a measurement test's picker offers. */
export const instrumentOfSchema = z.enum(['isolacao', 'resistencia_contato']);
export type InstrumentOf = z.infer<typeof instrumentOfSchema>;

const unique = (keys: readonly string[]): boolean => new Set(keys).size === keys.length;

/**
 * One measurement test of a block type. Its `key` is a sub-block key: `switchable` tests are
 * switched on the sheet through the block's config (`sub_blocks[key].enabled`), with
 * `off_note` shown while off; a test without it is always on. `skip_when` names the value
 * that says the test was not run: its table is then neither required nor printed.
 */
export const measurementTestShape = {
  key: subBlockKeySchema,
  label,
  instrument_of: instrumentOfSchema.optional(),
  switchable: z.object({ off_note: z.string().min(1) }).optional(),
  row_header: label,
  columns: z.array(measurementColumnSchema).min(1),
  rows: z.array(measurementRowSchema).min(1),
  values: z.array(measurementValueSchema).min(1).optional(),
  skip_when: skipWhenSchema.optional(),
  criteria: z.array(measurementCriterionSchema).min(1),
  /** Seed v13 (Story 23.9): the nameplate condition the test applies under; always, when absent. */
  applies_when: appliesWhenSchema.optional(),
  /** Seed v13 (Story 23.9): the test starts switched off in a new block's config (the base's "Opcional"); only on a `switchable` test. */
  initial_off: z.literal(true).optional(),
  /** Batch e23h (Stories 23.10 and 23.11): "Como ensaiar" and the recommendation, as on `testDefSchema` (`seed/test-help.ts`). */
  help: testHelpSchema.optional(),
  recommendation: testRecommendationSchema.optional(),
  /*
   * Seed v13, batch e23t (Story 23.15). Both optional and never defaulted, so v5 to v12 parse to
   * the bytes they shipped with.
   */
  /**
   * Story 23.15 (Base rev08 TR-OL-05, TR-SE-05; IEC 60076-1 / NBR 5356-1): every number cell is
   * also shown corrected to `to_c` (`windingResistanceTo75`), by the plate's winding material (a
   * Cu/Al select, `material_field`) and its temperature: `oil_field` on an oil unit, `dry_field`
   * on a dry one (the definition's oil rule decides), the cabine's ambient while that is empty or
   * the medium unknown.
   */
  winding_correction: z.object({ to_c: z.literal(75), material_field: seedKey, oil_field: seedKey.optional(), dry_field: seedKey.optional() }).optional(),
  /**
   * Story 23.15 (TR-OL-05 history): a corrected cell that moved more than this share, in %,
   * from the previous visit's corrected value of the same cell is restricted (both visits on v13,
   * both corrected). Needs `winding_correction`.
   */
  history_deviation_pct: z.number().gt(0).lt(100).optional(),
};

/** What `checkMeasurementTest` reads of a test: the seed's shape, its key and criteria any (Story 14.6: the company variant shares the rule). */
type MeasurementTestLike = Omit<z.infer<z.ZodObject<typeof measurementTestShape>>, 'key' | 'criteria'> & {
  key: string;
  criteria: readonly (
    | { type: 'absolute'; rows?: readonly string[] | undefined; columns?: readonly string[] | undefined }
    | { type: 'relative_to_lowest' }
    | { type: 'equals_column'; column: string; reference: string }
    | { type: 'choice_pass'; column: string; pass: readonly string[] }
    | { type: 'phase_deviation' }
    | { type: 'bands'; column: string }
    | { type: 'max_field' }
  )[];
};

/** The cross-part rules of one measurement test: unique keys, and every row, column, value and option a part names exists. */
export function checkMeasurementTest(test: MeasurementTestLike, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const columns = new Map(test.columns.map((column) => [column.key, column]));
  const rows = new Set(test.rows.map((row) => row.key));
  const values = new Map((test.values ?? []).map((value) => [value.key, value]));
  if (!unique(test.columns.map((column) => column.key))) issue(['columns'], 'a column key repeats');
  if (!unique(test.rows.map((row) => row.key))) issue(['rows'], 'a row key repeats');
  if (!unique((test.values ?? []).map((value) => value.key))) issue(['values'], 'a value key repeats');
  // Seed v13 (Story 23.9): only a test the sheet can switch off starts off.
  if (test.initial_off === true && test.switchable === undefined) issue(['initial_off'], 'initial_off belongs to a switchable test');

  test.rows.forEach((row, r) => {
    for (const column of Object.keys(row.fixed ?? {})) if (!columns.has(column)) issue(['rows', r, 'fixed', column], `"${column}" is not a column`);
  });

  const optionOf = (when: SkipWhen, path: (string | number)[]) => {
    const target = values.get(when.value);
    if (target === undefined) issue(path, `"${when.value}" is not a value of the test`);
    else if (!(target.options ?? []).some((option) => option.key === when.equals)) issue(path, `"${when.equals}" is not an option of "${when.value}"`);
  };
  // Seed v13 (batch e23t, Story 23.17): a value shown under a choice cell of the table names a row, a choice column of it and one of its options.
  const cellOptionOf = (when: { cell: { row: string; column: string }; equals: string }, path: (string | number)[]) => {
    const row = test.rows.find((candidate) => candidate.key === when.cell.row);
    const column = columns.get(when.cell.column);
    if (row === undefined) issue(path, `"${when.cell.row}" is not a row`);
    else if (column === undefined) issue(path, `"${when.cell.column}" is not a column`);
    else {
      const kind = row.kind ?? column.kind;
      const choices = (row.kind === undefined ? column.options : row.options) ?? [];
      if (kind !== 'choice' || row.fixed?.[column.key] !== undefined) issue(path, `the cell "${when.cell.row}" × "${when.cell.column}" is not a choice`);
      else if (!choices.some((option) => option.key === when.equals)) issue(path, `"${when.equals}" is not an option of the cell "${when.cell.row}" × "${when.cell.column}"`);
    }
  };
  (test.values ?? []).forEach((value, v) => {
    if (value.when === undefined) return;
    if ('cell' in value.when) cellOptionOf(value.when, ['values', v, 'when']);
    else if (value.when.value === value.key) issue(['values', v, 'when'], 'a value cannot depend on itself');
    else optionOf(value.when, ['values', v, 'when']);
  });
  if (test.skip_when !== undefined) optionOf(test.skip_when, ['skip_when']);
  // Seed v13, batch e23e (Story 23.20): a condition over a value of the test names a choice value of it and only its options.
  const condition = test.applies_when;
  if (condition !== undefined && isValueCondition(condition)) {
    const target = values.get(condition.value);
    if (target === undefined || target.kind !== 'choice') issue(['applies_when', 'value'], `"${condition.value}" is not a choice value of the test`);
    else for (const key of condition.values) if (!(target.options ?? []).some((option) => option.key === key)) issue(['applies_when', 'values'], `"${key}" is not an option of "${condition.value}"`);
    if (target?.when !== undefined) issue(['applies_when', 'value'], 'the value a test applies by is always shown');
  }
  // Seed v13 (batch e23t, Story 23.15): the history rule compares corrected values.
  if (test.history_deviation_pct !== undefined && test.winding_correction === undefined) issue(['history_deviation_pct'], 'a history rule needs the test\'s winding_correction');

  test.criteria.forEach((criterion, c) => {
    const at = (key: string) => ['criteria', c, key];
    if (criterion.type === 'absolute') {
      for (const row of criterion.rows ?? []) if (!rows.has(row)) issue(at('rows'), `"${row}" is not a row`);
      for (const column of criterion.columns ?? []) if (!columns.has(column)) issue(at('columns'), `"${column}" is not a column`);
    } else if (criterion.type === 'equals_column') {
      if (!columns.has(criterion.column)) issue(at('column'), `"${criterion.column}" is not a column`);
      if (!columns.has(criterion.reference)) issue(at('reference'), `"${criterion.reference}" is not a column`);
      if (criterion.column === criterion.reference) issue(at('reference'), 'a column cannot equal itself');
    } else if (criterion.type === 'choice_pass') {
      const column = columns.get(criterion.column);
      if (column === undefined) issue(at('column'), `"${criterion.column}" is not a column`);
      else {
        const known = new Set((column.options ?? []).map((option) => option.key));
        for (const key of criterion.pass) if (!known.has(key)) issue(at('pass'), `"${key}" is not an option of "${criterion.column}"`);
      }
    } else if (criterion.type === 'bands') {
      // Seed v13, batch e23e (Story 23.20): a band table reads a number column.
      const column = columns.get(criterion.column);
      if (column === undefined || column.kind !== 'number') issue(at('column'), `"${criterion.column}" is not a number column`);
    }
  });
}

export const measurementTestSchema = z.object(measurementTestShape).superRefine(checkMeasurementTest);
type SeedMeasurementTest = z.infer<typeof measurementTestSchema>;
/** A measurement test as every reader takes it. Story 14.6: a company type's test key is its own string. */
export type MeasurementTest = Omit<SeedMeasurementTest, 'key' | 'criteria'> & { key: string; criteria: MeasurementCriterion[] };
export type MeasurementTestKey = MeasurementTest['key'];

/**
 * One configuration field of a block type (the CTA's tensão, polos, neutro, transição,
 * bypass): a closed choice stored in `BlockConfig.options[key]`, `default` when the config
 * holds none.
 */
export const configFieldSchema = z
  .object({
    key: seedKey,
    label,
    options,
    default: seedKey,
  })
  .refine((field) => field.options.some((option) => option.key === field.default), { message: 'the default is one of the options' });
export type ConfigField = z.infer<typeof configFieldSchema>;

/**
 * The rules that tie a block definition's measurement tests to its configuration fields and
 * sub-blocks, checked by `blockDefinitionSchema`: every `when.config` names a config field
 * and its options, test keys are unique and each is one of the definition's sub-blocks.
 */
export function checkMeasurementDefinition(
  definition: { sub_blocks: readonly string[]; measurement_tests?: readonly { key: string; rows: readonly { when?: WhenConfig | undefined }[]; criteria: readonly { when?: WhenConfig | undefined }[] }[] | undefined; config_fields?: readonly ConfigField[] | undefined },
  ctx: z.RefinementCtx,
): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const fields = new Map((definition.config_fields ?? []).map((field) => [field.key, field]));
  if (!unique((definition.config_fields ?? []).map((field) => field.key))) issue(['config_fields'], 'a config field key repeats');
  const tests = definition.measurement_tests ?? [];
  if (!unique(tests.map((test) => test.key))) issue(['measurement_tests'], 'a measurement test key repeats');
  const checkWhen = (when: WhenConfig | undefined, path: (string | number)[]) => {
    if (when === undefined) return;
    const field = fields.get(when.config);
    if (field === undefined) {
      issue(path, `"${when.config}" is not a config field`);
      return;
    }
    for (const key of when.in) if (!field.options.some((option) => option.key === key)) issue(path, `"${key}" is not an option of "${when.config}"`);
  };
  tests.forEach((test, t) => {
    if (!definition.sub_blocks.includes(test.key)) issue(['measurement_tests', t, 'key'], `"${test.key}" is not a sub-block of the definition`);
    test.rows.forEach((row, r) => checkWhen(row.when, ['measurement_tests', t, 'rows', r, 'when']));
    test.criteria.forEach((criterion, c) => checkWhen(criterion.when, ['measurement_tests', t, 'criteria', c, 'when']));
  });
}
