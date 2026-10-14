import { z } from 'zod';
import { subBlockKeySchema } from '../schemas/block-config.ts';

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

/** The test value another value is shown under, or that skips the table: that value's option equals `equals`. */
export const whenValueSchema = z.object({ value: seedKey, equals: seedKey });
export type WhenValue = z.infer<typeof whenValueSchema>;

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
export const absoluteCriterionSchema = z
  .object({
    type: z.literal('absolute'),
    operator: z.enum(['>', '>=', '<', '<=']).optional(),
    value: z.number().optional(),
    unit: z.string().min(1).nullable().optional(),
    seeded: z.enum(['isolacao']).optional(),
    rows: z.array(seedKey).min(1).optional(),
    columns: z.array(seedKey).min(1).optional(),
    text: criterionText.optional(),
    ...criterionBase,
  })
  .superRefine((criterion, ctx) => {
    const own = criterion.operator !== undefined || criterion.value !== undefined || criterion.unit !== undefined || criterion.text !== undefined;
    if (criterion.seeded !== undefined) {
      if (own) ctx.addIssue({ code: 'custom', path: ['seeded'], message: 'a seeded criterion carries no limit or text of its own' });
      return;
    }
    if (criterion.operator === undefined || criterion.value === undefined || criterion.unit === undefined || criterion.text === undefined) {
      ctx.addIssue({ code: 'custom', path: ['operator'], message: 'an absolute criterion names its operator, value, unit and text, or a seeded criterion' });
    }
  });

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

export const measurementCriterionSchema = z.discriminatedUnion('type', [
  absoluteCriterionSchema,
  relativeToLowestCriterionSchema,
  equalsColumnCriterionSchema,
  choicePassCriterionSchema,
]);
export type MeasurementCriterion = z.infer<typeof measurementCriterionSchema>;

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
export const measurementTestSchema = z
  .object({
    key: subBlockKeySchema,
    label,
    instrument_of: instrumentOfSchema.optional(),
    switchable: z.object({ off_note: z.string().min(1) }).optional(),
    row_header: label,
    columns: z.array(measurementColumnSchema).min(1),
    rows: z.array(measurementRowSchema).min(1),
    values: z.array(measurementValueSchema).min(1).optional(),
    skip_when: whenValueSchema.optional(),
    criteria: z.array(measurementCriterionSchema).min(1),
  })
  .superRefine((test, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const columns = new Map(test.columns.map((column) => [column.key, column]));
    const rows = new Set(test.rows.map((row) => row.key));
    const values = new Map((test.values ?? []).map((value) => [value.key, value]));
    if (!unique(test.columns.map((column) => column.key))) issue(['columns'], 'a column key repeats');
    if (!unique(test.rows.map((row) => row.key))) issue(['rows'], 'a row key repeats');
    if (!unique((test.values ?? []).map((value) => value.key))) issue(['values'], 'a value key repeats');

    test.rows.forEach((row, r) => {
      for (const column of Object.keys(row.fixed ?? {})) if (!columns.has(column)) issue(['rows', r, 'fixed', column], `"${column}" is not a column`);
    });

    const optionOf = (when: WhenValue, path: (string | number)[]) => {
      const target = values.get(when.value);
      if (target === undefined) issue(path, `"${when.value}" is not a value of the test`);
      else if (!(target.options ?? []).some((option) => option.key === when.equals)) issue(path, `"${when.equals}" is not an option of "${when.value}"`);
    };
    (test.values ?? []).forEach((value, v) => {
      if (value.when === undefined) return;
      if (value.when.value === value.key) issue(['values', v, 'when'], 'a value cannot depend on itself');
      else optionOf(value.when, ['values', v, 'when']);
    });
    if (test.skip_when !== undefined) optionOf(test.skip_when, ['skip_when']);

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
      }
    });
  });
export type MeasurementTest = z.infer<typeof measurementTestSchema>;
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
  definition: { sub_blocks: readonly string[]; measurement_tests?: readonly MeasurementTest[] | undefined; config_fields?: readonly ConfigField[] | undefined },
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
