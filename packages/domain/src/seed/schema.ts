import { z } from 'zod';
import {
  BASE_EQUIPMENT_BLOCK_TYPES,
  equipmentBlockTypeSchema,
  itemKeySchema,
  siteItemKeySchema,
  subBlockKeySchema,
  subtypeSchema,
  type BaseEquipmentBlockType,
  type BlockTypeKey,
  type EquipmentBlockType,
} from '../schemas/block-config.ts';
import type { CriterionSeed } from './criteria.ts';
import { criterionRowStatusSchema, criterionTableSchema } from './criteria-tables.ts';
import { testHelpSchema, testRecommendationSchema } from './test-help.ts';
import { checkMeasurementDefinition, plateAppliesWhenSchema, configFieldSchema, criterionSourceSchema, isValueCondition, measurementTestSchema, type AppliesWhen, type MeasurementTest } from './measurement.ts';

/*
 * The shape of one seed version (AD-21). Seed data is code, validated once at module
 * load by these schemas and resolved through `getDefinition` / `sectionText`; none of it
 * is ever copied into a row. Labels are the verbatim pt-BR of FO.SERV-03, because they
 * are what prints.
 */

/** AD-11: the six field kinds. */
export const fieldKindSchema = z.enum(['text', 'number', 'date', 'select', 'manufacturer', 'voltage_class']);
export type FieldKind = z.infer<typeof fieldKindSchema>;

const seedKey = z.string().regex(/^[a-z0-9_]+$/);

/** AD-11 field definition: `unit` is fixed by the definition, `options` only on a select. */
export const fieldDefSchema = z
  .object({
    key: seedKey,
    label: z.string().min(1),
    kind: fieldKindSchema,
    unit: z.string().min(1).optional(),
    options: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Seed v2 (journey review D-3): a field of one physical unit (IDENTIFICAÇÃO, Nº SÉRIE,
     * TAG). "Igual à ⟨TAG⟩?" never copies it from another block; "Copiar da última
     * visita" (the same equipment) does.
     */
    per_unit: z.literal(true).optional(),
    /**
     * Seed v6 (Story 14.9): a field an empty cell never makes missing (the QGBT's "Circuito
     * SELV/PELV"). Optional and never defaulted, so v1 to v5 parse to the bytes they shipped with.
     */
    optional: z.literal(true).optional(),
    /*
     * Seed v7 (Story 14.14). Both optional and never defaulted, so v1 to v6 parse to the bytes
     * they shipped with.
     */
    /** A reminder shown under the field on the sheet only; it never prints (the QGBT's SELV/PELV meaning). */
    help: z.string().min(1).optional(),
    /**
     * On a select only: earlier spellings of an option (key, matched ignoring case and accents)
     * and the option each now reads as, for a value copied or read from an older seed version
     * ("ÓLEO (PVO)" reads as "Óleo"). Never offered, never stored as such.
     */
    option_aliases: z.record(z.string().min(1), z.string().min(1)).optional(),
    /*
     * Seed v13 (Story 23.7, decision K). The four keys below are optional and never defaulted, so
     * v1 to v12 parse to the bytes they shipped with; a field without them reads as before.
     */
    /** Seed v13 (Story 23.7): a number field holding the plate's whole list of values, in plate order (the transformer's TAPS). */
    list: z.literal(true).optional(),
    /** Seed v13 (Story 23.7): a number field whose value is picked from the `list` field of this key (TAP ATUAL from TAPS). */
    pick_from: seedKey.optional(),
    /** Seed v13 (Story 23.7): a number field that also takes "N/√3" (the TP's "115/√3"), stored as typed in canonical form. */
    over_sqrt3: z.literal(true).optional(),
    /** Seed v13 (Story 23.7): a text ratio ("200/5") also read written with a dash ("200-5"), the TC's RELAÇÃO. */
    dash_ratio: z.literal(true).optional(),
    /**
     * Seed v13, batch e23t (Story 23.17): a field that exists only while the nameplate select
     * `field` holds one of `in` (TIPO (ANP), only for a MINERAL liquid). Unmet, it is hidden on the
     * sheet, never missing and prints "-"; with `field` empty it is shown
     * (`relatorio/oil-rule.ts` `isFieldHidden`). Optional and never defaulted.
     */
    excused_unless: z.object({ field: seedKey, in: z.array(z.string().min(1)).min(1) }).optional(),
  })
  .refine((f) => (f.kind === 'select') === (f.options !== undefined), {
    message: 'options exist exactly on a select field',
  })
  .refine((f) => f.option_aliases === undefined || (f.kind === 'select' && f.options !== undefined && Object.values(f.option_aliases).every((target) => f.options!.includes(target))), {
    message: 'option_aliases belong to a select and name its options',
  })
  .refine((f) => f.unit === undefined || f.kind === 'number' || f.kind === 'voltage_class', {
    message: 'a unit belongs to a number or voltage_class field',
  })
  .refine((f) => (f.list === undefined && f.pick_from === undefined && f.over_sqrt3 === undefined) || f.kind === 'number', {
    message: 'list, pick_from and over_sqrt3 belong to a number field',
  })
  .refine((f) => f.list === undefined || (f.pick_from === undefined && f.over_sqrt3 === undefined), {
    message: 'a list field is neither picked from a list nor over √3',
  })
  .refine((f) => f.dash_ratio === undefined || f.kind === 'text', {
    message: 'dash_ratio belongs to a text field',
  });
export type FieldDef = z.infer<typeof fieldDefSchema>;

/** One `VERIFICAÇÕES GERAIS` row, with the three or four standard NC phrases of its chips. */
export const checklistItemSchema = z.object({
  key: itemKeySchema,
  label: z.string().min(1),
  nc_phrases: z.array(z.string().min(1)).min(3).max(4),
  /**
   * Seed v6 (Story 14.9, Bruno 2026-10-20 answer 4): a reminder for the technician shown under
   * the item's label on the sheet only; it never prints, neither under the item nor in
   * OBSERVAÇÕES. Optional, so v1 to v5 parse to the bytes they shipped with.
   */
  hint: z.string().min(1).optional(),
});
/**
 * A checklist item as every reader takes it. Story 14.6: on a company type's definition the key is
 * the definition's own `[a-z0-9_]+` string (`asBlockDefinition`); it stays typed as the seeds'
 * `ItemKey` so the seed files keep their types unchanged, and no reader indexes a table by it.
 */
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/**
 * A value column of a measurement table. `capture`: typed on site; `input`: typed, feeds a
 * derived cell (the ratio test's V/A PRIMÁRIO and SECUNDÁRIO); `derived`: computed by the
 * kernel, never typed (VAL CALCULADO, CONDIÇÕES); `print`: printed "-" unless a sub-block
 * captures it (30 SEGUNDOS, ESTAB./10MIN, ABSORÇÃO, POLARIZAÇÃO).
 */
export const columnDefSchema = z
  .object({
    label: z.string().min(1),
    unit: z.string().min(1).nullable(),
    /**
     * Seed v12 (Story 22.8): `voltage` is the per-row test voltage of an insulation table, a select
     * typed on site (`relatorio/row-voltage.ts`), never missing and never judged; it is appended
     * after the other value columns so their stored indices stay v11's, and screen and print draw
     * it right after the connection columns.
     *
     * Seed v13, batch e23t (Story 23.16): `index` is a typed unitless number that is never the
     * capture column, the transformer insulation table's ABSORÇÃO and POLARIZAÇÃO (the IP is
     * judged by the test's `polarization_index`, the DAR is captured and never judged).
     */
    role: z.enum(['capture', 'input', 'derived', 'print', 'voltage', 'index', 'choice']),
    derived: z.boolean(),
    group: z.string().min(1).optional(),
    /**
     * Seed v12 (Story 22.8): on a `voltage` column only, the pt-BR texts of its select ("0,5", "10").
     * Optional and never defaulted, so v1 to v11 parse to the bytes they shipped with.
     *
     * Seed v13, batch e23e (Story 23.18): on a `choice` column too, its closed options as stored and
     * printed ("OK", "INVERTIDA").
     */
    options: z.array(z.string().min(1)).min(1).optional(),
    /*
     * Seed v13, batch e23e (Story 23.18): `choice` is a per-row closed answer typed on site (the TC's
     * and TP's POLARIDADE beside the ratio), stored as `{raw: option, unit: null, state: 'measured'}`,
     * never a number to any reader of the captures. It is missing while empty; an option of
     * `fails_on` puts it and its row out (`relatorio/reading-evaluation.ts`). Appended after every
     * other value column, so the stored indices of the others hold; screen and print draw it right
     * before CONDIÇÕES.
     */
    /** Seed v13 (Story 23.18): on a `choice` column only, the options that fail the row. Optional and never defaulted. */
    fails_on: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((c) => (c.role === 'voltage' || c.role === 'choice') === (c.options !== undefined), { message: 'options exist exactly on a voltage or a choice column' })
  .refine((c) => c.fails_on === undefined || (c.role === 'choice' && c.options !== undefined && c.fails_on.every((option) => c.options!.includes(option))), {
    message: 'fails_on belongs to a choice column and names its options',
  });
export type ColumnDef = z.infer<typeof columnDefSchema>;

/**
 * One table of a test grammar (addendum §9.3). `rows` holds the connection cells of each
 * row, one per `connection_columns` entry, `''` for a cell the form leaves blank; when
 * `connection_typed` is true the row's connection cell is typed on site (the transformer
 * ratio's `TAP Nº`). `capture_column` is the label of the first `capture` column -- the
 * only one, for every table but the transformer ratio, which captures three connections.
 */
export const tableDefSchema = z
  .object({
    key: seedKey,
    title: z.string().min(1).optional(),
    connection_group: z.string().min(1).optional(),
    connection_columns: z.array(z.string().min(1)).min(1),
    connection_typed: z.boolean(),
    value_columns: z.array(columnDefSchema).min(1),
    capture_column: z.string().min(1),
    rows: z.array(z.array(z.string())).min(1),
    /**
     * Seed v9 (Story 15.6, Bruno 2026-10-22): the factor the ratio test's VAL CALCULADO applies to
     * U1/U2. `sqrt3` makes it U1 · √3 / U2 (the transformador de força: the primary is line-to-line,
     * the captures phase-to-neutral). Optional and never defaulted, so v1 to v8 parse to the bytes
     * they shipped with.
     *
     * Seed v11 (Story 21.1, Bruno 2026-11-05): `vector_group` makes the factor, the capture pairs and
     * the shorts follow the vector group the block's LIGAÇÃO SECUNDÁRIA names (`relatorio/vector-group.ts`);
     * with no group there is no VAL CALCULADO. On `sqrt3` (v9, v10) a LIGAÇÃO SECUNDÁRIA that names a
     * group applies it too, and one that names none keeps √3 and the Dyn1 pairs.
     */
    ratio_factor: z.enum(['sqrt3', 'vector_group']).optional(),
    /**
     * Seed v12 (Story 22.8): one entry per row of a table with a `voltage` column: the row's own
     * default in kV (`'1'` on a low-voltage winding; null takes the instrument's TENSÃO ENSAIO) and
     * the nameplate number field of the winding the row tests (null: no winding, no notice).
     * Optional and never defaulted, so v1 to v11 parse to the bytes they shipped with.
     */
    voltage_rows: z.array(z.object({ default_kv: z.string().min(1).nullable(), winding: seedKey.nullable() })).optional(),
    /**
     * Seed v13 (Story 23.8, decision K): the `list` field of the nameplate whose values are the
     * table's rows (the transformer's TTR, one row per tap of TAPS, `relatorio/tap-rows.ts`), each
     * row keyed by its tap in whole V; with the list empty the seeded `rows` stand. Only on a
     * test's single table with `connection_typed`, one connection column (the tap) and one seeded
     * row (the typed one of v12; with more, a stored row 1 or 2 would read as a tap of 1 V or 2 V).
     * Optional and never defaulted, so v1 to v12 parse to the bytes they shipped with.
     */
    rows_from: seedKey.optional(),
    /**
     * Seed v13, batch e23e (Story 23.13, decision D): the default test voltage of the table's rows
     * from the plate, after a row's own default and its winding's (`relatorio/row-voltage.ts`):
     * `rating` reads the field (a number in V or kV, a voltage class, or a select of "U0/U kV"
     * options read by U) and gives 1 kV up to 600 V, 2,5 kV up to 5000 V and 5 kV above; `mcov`
     * reads a number field in kV and gives 2,5 kV under 5 kV and 5 kV from it. With the field
     * empty or unreadable the instrument's TENSÃO ENSAIO applies, as before. Only on a table with a
     * voltage column. Optional and never defaulted, so v1 to v12 parse to the bytes they shipped with.
     */
    voltage_default: z.object({ field: seedKey, rule: z.enum(['rating', 'mcov']) }).optional(),
  })
  .refine((t) => t.voltage_default === undefined || t.value_columns.some((c) => c.role === 'voltage'), {
    message: 'voltage_default belongs to a table with a voltage column',
    path: ['voltage_default'],
  })
  .refine((t) => t.value_columns.filter((c) => c.role === 'choice').length <= 1, { message: 'a table has at most one choice column' })
  .refine((t) => t.rows_from === undefined || t.connection_typed, { message: 'rows_from belongs to a table whose connection is typed', path: ['rows_from'] })
  .refine((t) => t.rows_from === undefined || (t.rows.length === 1 && t.connection_columns.length === 1), {
    message: 'rows_from belongs to a table of one seeded row and one connection column',
    path: ['rows_from'],
  })
  .refine((t) => t.rows.every((row) => row.length === t.connection_columns.length), {
    message: 'every row has one cell per connection column',
  })
  .refine((t) => t.value_columns.find((c) => c.role === 'capture')?.label === t.capture_column, {
    message: 'capture_column names the first capture column',
  })
  .refine((t) => t.value_columns.every((c) => c.derived === (c.role === 'derived')), {
    message: 'derived is true exactly on a derived column',
  })
  .refine((t) => t.value_columns.filter((c) => c.role === 'voltage').length <= 1, { message: 'a table has at most one voltage column' })
  .refine((t) => (t.voltage_rows !== undefined) === t.value_columns.some((c) => c.role === 'voltage'), {
    message: 'voltage_rows exist exactly on a table with a voltage column',
  })
  .refine((t) => t.voltage_rows === undefined || t.voltage_rows.length === t.rows.length, { message: 'voltage_rows has one entry per row' });
export type TableDef = z.infer<typeof tableDefSchema>;

/**
 * Seed v6 (Story 14.9): one band of a criterion picked by a nameplate value, a minimum the
 * readings must reach, with its source (every criterion names one).
 */
export const bandCriterionSchema = z.object({
  operator: z.enum(['>', '>=']),
  value: z.number().positive(),
  unit: z.string().min(1),
  source: criterionSourceSchema,
  /**
   * Seed v7 (Story 14.14, Bruno 2026-10-21 answer 3): the band's test voltage in V, compared with
   * the instrument header's TENSÃO ENSAIO when a display shot of the test exists
   * (`relatorio/test-voltage.ts`); never printed. Optional, so v6 parses as it shipped.
   */
  test_voltage: z.number().positive().optional(),
});
export type BandCriterion = z.infer<typeof bandCriterionSchema>;

/**
 * Seed v6 (Story 14.9, Bruno 2026-10-20, NBR 5410): a test's criterion derived from the board's
 * own plate. `field` is a number field of the nameplate in V; each band applies up to its
 * `up_to` (inclusive), in ascending order; above the last band, or with the field empty or not
 * a positive number, there is no criterion (no verdict). `selv_field` is a SIM/NÃO select of the
 * nameplate: SIM picks `selv` whatever the voltage.
 */
export const criterionBandsSchema = z
  .object({
    field: seedKey,
    selv_field: seedKey.optional(),
    selv: bandCriterionSchema.optional(),
    bands: z.array(bandCriterionSchema.extend({ up_to: z.number().positive() })).min(1),
    /**
     * Seed v7 (Story 14.14, Bruno 2026-10-21 answer 1): the TENSÃO NOMINAL in V above which a SIM
     * mark disagrees with the plate (a non-blocking notice, `selvVoltageNoticeText`). Optional.
     */
    selv_max_voltage: z.number().positive().optional(),
  })
  .refine((c) => (c.selv_field === undefined) === (c.selv === undefined), { message: 'selv_field and selv go together' })
  .refine((c) => c.selv_max_voltage === undefined || c.selv_field !== undefined, { message: 'selv_max_voltage needs a selv_field' })
  .refine((c) => c.bands.every((band, i) => i === 0 || band.up_to > c.bands[i - 1]!.up_to), { message: 'bands ascend by up_to' })
  .refine((c) => c.bands.every((band) => band.unit === c.bands[0]!.unit) && (c.selv === undefined || c.selv.unit === c.bands[0]!.unit), {
    message: 'every band shares one unit',
  });
export type CriterionBands = z.infer<typeof criterionBandsSchema>;

/** Seed v13 (Story 23.5): a test's temperature correction (see `testDefSchema.temperature_correction`). */
export const temperatureCorrectionSchema = z
  .object({
    to_c: z.literal(20),
    medium: z.enum(['oil_rule', 'solid']),
    oil_field: seedKey.optional(),
    dry_field: seedKey.optional(),
  })
  .refine((c) => c.medium === 'oil_rule' || c.oil_field === undefined, { message: 'oil_field belongs to a correction read by the oil rule', path: ['oil_field'] });
export type TemperatureCorrection = z.infer<typeof temperatureCorrectionSchema>;

/** A restriction rule's share, in (0, 100) percent. */
const restrictionPct = z.number().gt(0).lt(100);

/** Seed v13 (Stories 23.6 and 23.14): a test's restriction rules (see `testDefSchema.restriction`). */
export const restrictionSchema = z
  .object({
    history_drop_pct: restrictionPct.optional(),
    below_largest_pct: restrictionPct.optional(),
    pole_deviation_pct: restrictionPct.optional(),
    // Fix batch e23w (B-6): see `testDefSchema.restriction`.
    history_rise_out_pct: restrictionPct.optional(),
    prerequisite: z.object({ field: seedKey, fails_on: z.array(z.string().min(1)).min(1) }).optional(),
    status: criterionRowStatusSchema,
  })
  .refine((r) => r.history_drop_pct !== undefined || r.below_largest_pct !== undefined || r.pole_deviation_pct !== undefined || r.history_rise_out_pct !== undefined || r.prerequisite !== undefined, {
    message: 'a restriction names at least one rule',
  });
export type RestrictionRules = z.infer<typeof restrictionSchema>;

/**
 * Seed v13, batch e23t (Story 23.16; Base rev08 TR-OL-03, TR-SE-03, table IP_CLASSIFICACAO): the
 * polarization index typed in the table's `index` column `column`, judged by class: below `min` out,
 * from `min` to below `restricted_below` restricted, from it on within; required on a unit of the
 * medium `required_on` (optional on the other or an unknown one); `dar_column` the absorption
 * index beside it (captured, never judged nor required). On a row whose capture is above the
 * instrument's limit the IP is N/A (Story 23.4). `status` is the base's (data only).
 */
export const polarizationIndexSchema = z
  .object({
    column: z.string().min(1),
    min: z.number().positive(),
    restricted_below: z.number().positive(),
    required_on: z.enum(['dry']),
    dar_column: z.string().min(1).optional(),
    status: criterionRowStatusSchema,
  })
  .refine((rule) => rule.restricted_below > rule.min, { message: 'restricted_below is above min', path: ['restricted_below'] });
export type PolarizationIndexRule = z.infer<typeof polarizationIndexSchema>;

/** A test sub-block, bound by `criterion_key` to one of `SEEDED_CRITERIA` (Story 2.6). */
export const testDefSchema = z.object({
  key: z.enum(['isolacao', 'resistencia_contato', 'relacao_transformacao']),
  label: z.string().min(1),
  criterion_key: z.string().min(1),
  tables: z.array(tableDefSchema).min(1),
  /**
   * Seed v6 (Story 14.9): the criterion is picked from the nameplate by these bands instead of
   * the seeded one `criterion_key` names (which stays, for the schema). Optional and never
   * defaulted, so v1 to v5 parse to the bytes they shipped with.
   */
  criterion_bands: criterionBandsSchema.optional(),
  /**
   * Seed v12 (Story 22.9): the nameplate select whose accuracy class gives the ratio criterion
   * (`relatorio/accuracy-class.ts`): ± the class % for a measurement class, ± 1 % for 5P, ± 3 % for 10P and 3P, ± 6 % for 6P (e22g, Bruno's test base rev03),
   * the seeded criterion while the field is empty. Optional and never defaulted, so v1 to v11
   * parse to the bytes they shipped with.
   */
  criterion_class_field: seedKey.optional(),
  /**
   * Seed v13 (Story 23.9, decision J): the nameplate condition the test applies under
   * (`relatorio/applicability.ts`); always, when absent. Optional and never defaulted, so v1 to
   * v12 parse to the bytes they shipped with.
   */
  applies_when: plateAppliesWhenSchema.optional(),
  /** Seed v13 (Story 23.9): the test starts switched off in a new block's config (the base's "Opcional"); the template switch still removes it (FR-11). */
  initial_off: z.literal(true).optional(),
  /*
   * Seed v13, batch e23a (Stories 23.2 and 23.4). Both optional and never defaulted, so v1 to v12
   * parse to the bytes they shipped with.
   */
  /**
   * Story 23.2: each row's criterion is picked from a NETA table (`seed/criteria-tables.ts`, the rows
   * copied in, so the seed hash covers them) by a rated voltage of the plate: `'winding'` reads the
   * nameplate number field each row's `voltage_rows[r].winding` names, `{field}` one nameplate field
   * (a number in V or kV, or a voltage class) for every row; `medium: 'oil_rule'` picks the table's
   * oil or dry column by the definition's oil rule field. With the rating (or the medium) unreadable
   * the row keeps the seeded criterion (`relatorio/reading-evaluation.ts` `rowCriterion`).
   */
  criterion_table: z
    .object({
      table: criterionTableSchema,
      voltage: z.union([z.literal('winding'), z.object({ field: seedKey })]),
      medium: z.literal('oil_rule').optional(),
    })
    .refine((c) => (c.medium === undefined ? c.table.rows.every((row) => row.min !== undefined) : c.table.rows.every((row) => row.oil !== undefined && row.dry !== undefined)), {
      message: 'a medium reads a table with oil and dry columns, no medium one with a minimum',
    })
    .optional(),
  /**
   * Story 23.4: a reading above the instrument's limit that meets the criterion prints the standard
   * observation under the table, and its row's POLARIZAÇÃO prints N/A.
   */
  instrument_limit_note: z.literal(true).optional(),
  /*
   * Seed v13, batch e23v (Stories 23.5, 23.6 and 23.14). The three keys below are optional and never
   * defaulted, so v1 to v12 parse to the bytes they shipped with; a test without them is judged raw
   * and on two levels, as before.
   */
  /**
   * Seed v13 (Story 23.5, decision B; Base rev08 TR-OL-02, TR-SE-02, DJ-02, SC-02, table
   * CORRECAO_TEMPERATURA): the test's readings are judged corrected to `to_c`
   * (`relatorio/temperature-correction.ts`). `medium: 'oil_rule'` takes the oil or the solid factor
   * by the definition's oil rule (a medium the plate leaves unknown corrects nothing), `'solid'`
   * always the solid one; `oil_field` and `dry_field` are the plate's number fields in °C an oil or
   * a dry unit reads its temperature from (`oil_field` only under the oil rule), the cabine's ambient
   * standing in while empty or where none is named.
   */
  temperature_correction: temperatureCorrectionSchema.optional(),
  /**
   * Seed v13 (Story 23.6, decision C; Story 23.14, decision L): the rules that restrict a reading
   * already within its criterion (`relatorio/restriction.ts`), each a percentage in (0, 100):
   * `history_drop_pct` a corrected reading that fell more than it since the previous visit's
   * corrected one (Base rev08 TR-OL-02, needs `temperature_correction`); `below_largest_pct` one
   * below that share of the largest other row of its table and column (CB-02 between phases, PR-02
   * against the largest unit); `pole_deviation_pct` one above the lowest row of its table and
   * column by more than it (DJ-03, SC-03, NETA MTS-2023 7.6.3 and 7.5.1); `prerequisite` a select of
   * the plate whose `fails_on` values fail the test whatever its readings (PR-02's disconnector);
   * fix batch e23w (Bruno's answer B-6, DJ-03, SC-03): `history_rise_out_pct` puts out a measured
   * reading more than that share above the same cell's previous measured value (the previous
   * visit on seed v13 or later), the one rule here that sets out rather than restricted.
   * `status` is the base's status of the rule (`CRITERION_ROW_STATUSES`, data only).
   */
  restriction: restrictionSchema.optional(),
  /** Seed v13 (Story 23.14; Base rev08 DJ-03, SC-03): the base's status of the test's seeded criterion row (data only, never shown). */
  criterion_status: criterionRowStatusSchema.optional(),
  /*
   * Batch e23h (Stories 23.10 and 23.11, contract 37), `seed/test-help.ts`: "Como ensaiar" (eight
   * optional texts, shown on the sheet, never printed) and the recommendation a `reading` derived
   * point starts with. Optional and never defaulted (no seed carries them), so v1 to v13 parse to
   * the bytes they shipped with.
   */
  help: testHelpSchema.optional(),
  recommendation: testRecommendationSchema.optional(),
  /**
   * Fix batch e23z (W3-7): the recommendation a `reading` derived point starts with when the test's
   * polarization index fails (the base's IP row, TR-OL-03 and TR-SE-03, filled only by the base
   * import on a company copy; never shown in the editor). Optional and never defaulted (no seed
   * carries it), the same cap as `recommendation`.
   */
  index_recommendation: testRecommendationSchema.optional(),
  /*
   * Seed v13, batch e23t (Story 23.16). Optional and never defaulted, so v1 to v12 parse to the
   * bytes they shipped with; a test without it judges no index.
   */
  /** Story 23.16: the polarization index judged in the table's `index` columns (`polarizationIndexSchema`). */
  polarization_index: polarizationIndexSchema.optional(),
  /*
   * Seed v13, batch e23e (Story 23.18). Both optional and never defaulted, so v1 to v12 parse to the
   * bytes they shipped with.
   */
  /**
   * Story 23.18: a notice the sheet shows under the test while the nameplate select `field` holds
   * one of `values` (the TC's FUNÇÃO DO TC FATURAMENTO); on the screen only, never printed, never
   * blocking: the test is still filled and judged as any.
   */
  notice_when: z.object({ field: seedKey, values: z.array(z.string().min(1)).min(1), text: z.string().min(1) }).optional(),
  /** Story 23.18: a sentence printed under the test's last table (the TC's and TP's ratio check is not an accuracy test). */
  print_note: z.string().min(1).optional(),
});
/**
 * A test as every reader takes it. Story 14.6: on a company type's definition (`asBlockDefinition`)
 * the test carries `criterion`, the row of the type's own criteria table its `criterion_key` names,
 * which the readers take before `SEEDED_CRITERIA`; a seeded test never carries one.
 */
export type TestDef = z.infer<typeof testDefSchema> & { criterion?: CriterionSeed };

/** FR-11: a subtype pre-marks these items NA; they stay on the list and editable. */
export const subtypeDefSchema = z.object({
  key: subtypeSchema,
  label: z.string().min(1),
  na_defaults: z.array(itemKeySchema).min(1),
});
export type SubtypeDef = z.infer<typeof subtypeDefSchema>;

/**
 * Seed v6 (Story 14.11, Bruno 2026-10-20): which nameplate value makes the unit an oil unit, and
 * what an oil unit has that a non-oil one does not. `field` is a select of the nameplate (TIPO DE
 * ISOLAÇÃO, MEIO DE EXTINÇÃO); `oil_values` the options that are oil; `items` the checklist items
 * a non-oil unit shows NA; `fields` the nameplate fields it shows excused and prints "-".
 */
export const oilRuleSchema = z
  .object({
    field: seedKey,
    oil_values: z.array(z.string().min(1)).min(1),
    items: z.array(itemKeySchema).min(1),
    fields: z.array(seedKey),
    /**
     * Seed v7 (Story 14.14, Bruno 2026-10-21 answer 4): options that are not oil but show the oil
     * items and fields in full, as an oil unit does (the disjuntor's "Outro"). Optional, so v6
     * parses as it shipped.
     */
    full_values: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Seed v13 (Story 23.7, decision K): the nameplate fields an oil unit shows excused and prints
     * "-" (the transformer's TEMPERATURA DO ENROLAMENTO and CLASSE TÉRMICA, a dry unit's), the
     * mirror of `fields`. Optional and never defaulted, so v6 to v12 parse as they shipped.
     */
    dry_fields: z.array(seedKey).min(1).optional(),
  })
  .refine((rule) => rule.full_values === undefined || rule.full_values.every((value) => !rule.oil_values.includes(value)), {
    message: 'full_values and oil_values are disjoint',
  })
  .refine((rule) => rule.dry_fields === undefined || rule.dry_fields.every((key) => !rule.fields.includes(key)), {
    message: 'dry_fields and fields are disjoint',
  });
export type OilRule = Omit<z.infer<typeof oilRuleSchema>, 'items'> & { items: string[] };

/**
 * Seed v6: what the oil rule and the band criterion name exists on the definition. Story 14.6:
 * exported, so a company type's definition (`companyTypeDefinitionSchema`) meets the same
 * reference checks on its tests and, fix batch e22h (S1), on the oil rule a copy carries. Each
 * issue names its path (`oil_rule`, `tests.{i}.criterion_class_field`, `tests.{i}.criterion_bands`,
 * `tests.{i}.tables`), so `validateTypeDraft` says it in pt-BR beside its part.
 */
export function checkSeedV6Definition(
  definition: {
    nameplate: readonly FieldDef[];
    checklist: readonly { key: string }[] | null;
    tests: readonly TestDef[];
    oil_rule?: OilRule | undefined;
    /** Seed v13 (Story 23.9): read for their `applies_when`; batch e23t: their `winding_correction` and criteria's `medium`. */
    measurement_tests?: readonly MeasurementTestRefs[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  checkSeedV13Definition(definition, ctx);
  const field = (key: string) => definition.nameplate.find((candidate) => candidate.key === key);
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const rule = definition.oil_rule;
  if (rule !== undefined) {
    const select = field(rule.field);
    if (select === undefined || select.kind !== 'select') issue(['oil_rule', 'field'], `oil_rule.field "${rule.field}" is not a select of the nameplate`);
    else if (!rule.oil_values.every((value) => select.options!.includes(value))) issue(['oil_rule', 'oil_values'], 'an oil value is not an option of its field');
    else if (!(rule.full_values ?? []).every((value) => select.options!.includes(value))) issue(['oil_rule', 'full_values'], 'a full value is not an option of its field');
    const items = new Set((definition.checklist ?? []).map((item) => item.key));
    if (!rule.items.every((key) => items.has(key))) issue(['oil_rule', 'items'], 'an oil item is not on the checklist');
    if (!rule.fields.every((key) => field(key) !== undefined)) issue(['oil_rule', 'fields'], 'an oil field is not on the nameplate');
  }
  // Seed v12 (Stories 22.8 and 22.9): a row's winding is a number field, a class field a select.
  definition.tests.forEach((test, t) => {
    if (test.criterion_class_field !== undefined && field(test.criterion_class_field)?.kind !== 'select') {
      issue(['tests', t, 'criterion_class_field'], `criterion_class_field "${test.criterion_class_field}" is not a select of the nameplate`);
    }
    test.tables.forEach((table, b) => {
      for (const entry of table.voltage_rows ?? []) {
        if (entry.winding !== null && field(entry.winding)?.kind !== 'number') issue(['tests', t, 'tables', b, 'voltage_rows'], `voltage_rows winding "${entry.winding}" is not a number field of the nameplate`);
      }
    });
  });
  // Seed v13, batch e23a (Story 23.2): what a criterion table reads exists on the definition.
  definition.tests.forEach((test, t) => {
    const table = test.criterion_table;
    if (table === undefined) return;
    const at = ['tests', t, 'criterion_table'];
    if (table.voltage === 'winding') {
      if (!test.tables.every((one) => one.voltage_rows !== undefined)) issue([...at, 'voltage'], 'a criterion table read by winding needs voltage_rows on every table');
    } else {
      const rated = field(table.voltage.field);
      const readable = rated !== undefined && (rated.kind === 'voltage_class' || (rated.kind === 'number' && (rated.unit === 'V' || rated.unit === 'kV')));
      if (!readable) issue([...at, 'voltage'], `criterion_table.voltage.field "${table.voltage.field}" is not a number field in V or kV nor a voltage class`);
    }
    if (table.medium === 'oil_rule' && definition.oil_rule === undefined) issue([...at, 'medium'], 'a criterion table read by medium needs an oil_rule');
  });
  definition.tests.forEach((test, t) => {
    const bands = test.criterion_bands;
    if (bands === undefined) return;
    const voltage = field(bands.field);
    if (voltage === undefined || voltage.kind !== 'number' || voltage.unit !== 'V') issue(['tests', t, 'criterion_bands', 'field'], `criterion_bands.field "${bands.field}" is not a number field in V`);
    if (bands.selv_field !== undefined) {
      const selv = field(bands.selv_field);
      if (selv === undefined || selv.kind !== 'select' || !selv.options!.includes(SELV_YES)) issue(['tests', t, 'criterion_bands', 'selv_field'], `criterion_bands.selv_field "${bands.selv_field}" is not a SIM/NÃO select`);
    }
  });
}

/** The units a `list` field a table's rows come from may carry: its rows are keyed in whole V (Story 23.8). */
const ROW_LIST_UNITS: ReadonlySet<string> = new Set(['V', 'kV']);

/**
 * Seed v13 (Stories 23.7 to 23.9): what the nameplate keys, the tap rows and the applicability
 * conditions name exists on the definition, each issue at its path, as `checkSeedV6Definition`'s
 * are (so a company type's draft names it beside its part):
 * - a field's `pick_from` names another `list` field of the nameplate, in the same unit;
 * - the oil rule's `dry_fields` are on the nameplate;
 * - a table's `rows_from` names a `list` field in V or kV, on the test's single table;
 * - an `applies_when` (either grammar) names a field of the nameplate; `in` a select and only its
 *   options; `above` and `below` a number field of one value (never a `list`).
 */
function checkSeedV13Definition(
  definition: {
    nameplate: readonly FieldDef[];
    tests: readonly TestDef[];
    oil_rule?: OilRule | undefined;
    measurement_tests?: readonly MeasurementTestRefs[] | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const field = (key: string) => definition.nameplate.find((candidate) => candidate.key === key);
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  definition.nameplate.forEach((candidate, f) => {
    if (candidate.pick_from === undefined) return;
    const list = field(candidate.pick_from);
    if (list === undefined || list.list !== true || list.key === candidate.key || list.unit !== candidate.unit) {
      issue(['nameplate', f, 'pick_from'], `pick_from "${candidate.pick_from}" is not a list field of the nameplate in ${candidate.unit ?? 'no unit'}`);
    }
  });
  for (const key of definition.oil_rule?.dry_fields ?? []) {
    if (field(key) === undefined) issue(['oil_rule', 'dry_fields'], `a dry field "${key}" is not on the nameplate`);
  }
  const checkCondition = (condition: AppliesWhen | undefined, path: (string | number)[]) => {
    // Batch e23e (Story 23.20): a condition over a value of the test is the test's own to check (`checkMeasurementTest`).
    if (condition === undefined || isValueCondition(condition)) return;
    const target = field(condition.field);
    if (target === undefined) issue([...path, 'field'], `applies_when.field "${condition.field}" is not a field of the nameplate`);
    else if (condition.op === 'in' && (target.kind !== 'select' || !condition.values.every((value) => target.options!.includes(value)))) {
      issue([...path, 'values'], `applies_when "in" names a select of the nameplate and only its options ("${condition.field}")`);
    } else if ((condition.op === 'above' || condition.op === 'below') && (target.kind !== 'number' || target.list === true)) {
      issue([...path, 'field'], `applies_when "${condition.op}" names a number field of one value ("${condition.field}" is ${target.list === true ? 'a list' : target.kind})`);
    }
  };
  definition.tests.forEach((test, t) => {
    test.tables.forEach((table, b) => {
      if (table.rows_from === undefined) return;
      const list = field(table.rows_from);
      if (list === undefined || list.list !== true || list.unit === undefined || !ROW_LIST_UNITS.has(list.unit)) {
        issue(['tests', t, 'tables', b, 'rows_from'], `rows_from "${table.rows_from}" is not a list field of the nameplate in V or kV`);
      }
      if (test.tables.length !== 1) issue(['tests', t, 'tables', b, 'rows_from'], 'rows_from belongs to a test with a single table');
    });
    checkCondition(test.applies_when, ['tests', t, 'applies_when']);
  });
  (definition.measurement_tests ?? []).forEach((test, t) => checkCondition(test.applies_when, ['measurement_tests', t, 'applies_when']));
  // --- e23v: Stories 23.5, 23.6, 23.14 ---
  definition.tests.forEach((test, t) => checkE23vTest(definition, test, ['tests', t], field, issue));
  // --- e23t: Stories 23.15 to 23.17 and 23.19 ---
  checkE23tDefinition(definition, field, issue);
  // --- e23e: Stories 23.13, 23.18, 23.20, 23.21 ---
  checkE23eDefinition(definition, field, issue);
}

/** Seed v13, batch e23e (Story 23.13): a "U0/U kV" option of a cable's CLASSE U0/U ("8,7/15 kV"); its U in kV, or null. */
export function classU0UKv(option: string): string | null {
  const match = /^\s*(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)\s*kV\s*$/i.exec(option);
  return match === null ? null : match[2]!.replace(',', '.');
}

/**
 * Seed v13, batch e23e (Stories 23.13, 23.18, 23.20 and 23.21): what the new keys name exists on the
 * definition, each issue at its path:
 * - a table's `voltage_default` read by `rating` names a number field in V or kV, a voltage class or
 *   a select whose every option reads "U0/U kV"; by `mcov` a number field in kV (never a `list`);
 * - a test's `notice_when` names a select of the nameplate and only its options;
 * - a measurement criterion `max_field` names a number field of the nameplate (never a `list`).
 */
function checkE23eDefinition(
  definition: { tests: readonly TestDef[]; measurement_tests?: readonly MeasurementTestRefs[] | undefined },
  field: (key: string) => FieldDef | undefined,
  issue: (path: (string | number)[], message: string) => void,
): void {
  definition.tests.forEach((test, t) => {
    test.tables.forEach((table, b) => {
      const pick = table.voltage_default;
      if (pick === undefined) return;
      const target = field(pick.field);
      const number = target !== undefined && target.kind === 'number' && target.list !== true;
      const readable =
        pick.rule === 'mcov'
          ? number && target.unit === 'kV'
          : target !== undefined &&
            (target.kind === 'voltage_class' ||
              (number && (target.unit === 'V' || target.unit === 'kV')) ||
              (target.kind === 'select' && (target.options ?? []).every((option) => classU0UKv(option) !== null)));
      if (!readable) issue(['tests', t, 'tables', b, 'voltage_default', 'field'], `voltage_default.field "${pick.field}" is not a field the "${pick.rule}" rule reads`);
    });
    const notice = test.notice_when;
    if (notice !== undefined) {
      const target = field(notice.field);
      if (target === undefined || target.kind !== 'select' || !notice.values.every((value) => (target.options ?? []).includes(value))) {
        issue(['tests', t, 'notice_when'], `notice_when names a select of the nameplate and only its options ("${notice.field}")`);
      }
    }
  });
  (definition.measurement_tests ?? []).forEach((test, t) => {
    (test.criteria ?? []).forEach((criterion, c) => {
      if (criterion.type !== 'max_field' || criterion.field === undefined) return;
      const target = field(criterion.field);
      if (target === undefined || target.kind !== 'number' || target.list === true) {
        issue(['measurement_tests', t, 'criteria', c, 'field'], `max_field.field "${criterion.field}" is not a number field of the nameplate`);
      }
    });
  });
}

/** What `checkSeedV13Definition` reads of a measurement test (either a seed's or a company type's). */
interface MeasurementTestRefs {
  applies_when?: AppliesWhen | undefined;
  winding_correction?: { material_field: string; oil_field?: string | undefined; dry_field?: string | undefined } | undefined;
  criteria?: readonly { type: string; medium?: 'oil' | 'dry' | undefined; field?: string | undefined }[] | undefined;
}

/**
 * Seed v13, batch e23t (Stories 23.15 to 23.17 and 23.19): what the new keys name exists on the
 * definition, each issue at its path:
 * - a measurement test's `winding_correction` names a Cu/Al select (`material_field`) and number
 *   fields in °C of one value (`oil_field`, `dry_field`);
 * - a `phase_deviation` criterion read by `medium` needs the definition's oil rule;
 * - a test's `polarization_index` names `index` columns of each of its tables (`column`, `dar_column`);
 * - a field's `excused_unless` names another select of the nameplate and only its options.
 */
function checkE23tDefinition(
  definition: { nameplate: readonly FieldDef[]; tests: readonly TestDef[]; oil_rule?: OilRule | undefined; measurement_tests?: readonly MeasurementTestRefs[] | undefined },
  field: (key: string) => FieldDef | undefined,
  issue: (path: (string | number)[], message: string) => void,
): void {
  (definition.measurement_tests ?? []).forEach((test, t) => {
    const correction = test.winding_correction;
    if (correction !== undefined) {
      const material = field(correction.material_field);
      if (material === undefined || material.kind !== 'select' || !(material.options ?? []).some((option) => WINDING_MATERIALS.includes(option))) {
        issue(['measurement_tests', t, 'winding_correction', 'material_field'], `winding_correction.material_field "${correction.material_field}" is not a Cu/Al select of the nameplate`);
      }
      for (const key of ['oil_field', 'dry_field'] as const) {
        const name = correction[key];
        if (name === undefined) continue;
        const target = field(name);
        if (target === undefined || target.kind !== 'number' || target.unit !== '°C' || target.list === true) {
          issue(['measurement_tests', t, 'winding_correction', key], `winding_correction.${key} "${name}" is not a number field of the nameplate in °C`);
        }
      }
    }
    (test.criteria ?? []).forEach((criterion, c) => {
      if (criterion.type === 'phase_deviation' && criterion.medium !== undefined && definition.oil_rule === undefined) {
        issue(['measurement_tests', t, 'criteria', c, 'medium'], 'a phase deviation read by medium needs an oil_rule');
      }
    });
  });
  definition.tests.forEach((test, t) => {
    const rule = test.polarization_index;
    if (rule === undefined) return;
    for (const key of ['column', 'dar_column'] as const) {
      const label = rule[key];
      if (label === undefined) continue;
      if (!test.tables.every((table) => table.value_columns.some((column) => column.role === 'index' && column.label === label))) {
        issue(['tests', t, 'polarization_index', key], `polarization_index.${key} "${label}" is not an index column of every table of the test`);
      }
    }
  });
  definition.nameplate.forEach((candidate, f) => {
    const condition = candidate.excused_unless;
    if (condition === undefined) return;
    const target = field(condition.field);
    if (target === undefined || target.key === candidate.key || target.kind !== 'select' || !condition.in.every((value) => (target.options ?? []).includes(value))) {
      issue(['nameplate', f, 'excused_unless'], `excused_unless names another select of the nameplate and only its options ("${condition.field}")`);
    }
  });
}

/** The winding materials a `winding_correction` reads (`windingResistanceTo75`). */
export const WINDING_MATERIALS: readonly string[] = ['Cu', 'Al'];

/**
 * Seed v13, batch e23v (Stories 23.5, 23.6 and 23.14): what a test's temperature correction and
 * restriction rules name exists on the definition, each issue at its path (so a company type's
 * draft names it beside its part, `types/validate.ts`):
 * - a correction read by the oil rule needs the definition's oil rule;
 * - its `oil_field` and `dry_field` are number fields of the nameplate in °C, of one value;
 * - a history rule needs the test's temperature correction (it compares corrected readings);
 * - a prerequisite names a select of the nameplate and only its options.
 */
function checkE23vTest(
  definition: { oil_rule?: OilRule | undefined },
  test: TestDef,
  at: (string | number)[],
  field: (key: string) => FieldDef | undefined,
  issue: (path: (string | number)[], message: string) => void,
): void {
  const correction = test.temperature_correction;
  if (correction !== undefined) {
    if (correction.medium === 'oil_rule' && definition.oil_rule === undefined) issue([...at, 'temperature_correction', 'medium'], 'a temperature correction read by the oil rule needs an oil_rule');
    for (const key of ['oil_field', 'dry_field'] as const) {
      const name = correction[key];
      if (name === undefined) continue;
      const target = field(name);
      if (target === undefined || target.kind !== 'number' || target.unit !== '°C' || target.list === true) {
        issue([...at, 'temperature_correction', key], `temperature_correction.${key} "${name}" is not a number field of the nameplate in °C`);
      }
    }
  }
  const restriction = test.restriction;
  if (restriction === undefined) return;
  if (restriction.history_drop_pct !== undefined && correction === undefined) issue([...at, 'restriction', 'history_drop_pct'], 'a history rule needs the test\'s temperature_correction');
  const prerequisite = restriction.prerequisite;
  if (prerequisite !== undefined) {
    const target = field(prerequisite.field);
    if (target === undefined || target.kind !== 'select' || !prerequisite.fails_on.every((value) => target.options!.includes(value))) {
      issue([...at, 'restriction', 'prerequisite'], `restriction.prerequisite names a select of the nameplate and only its options ("${prerequisite.field}")`);
    }
  }
}

/** The option of a SELV/PELV select that picks the SELV criterion. */
export const SELV_YES = 'SIM';

export const blockDefinitionSchema = z
  .object({
    block_type: equipmentBlockTypeSchema,
    label: z.string().min(1),
    nameplate: z.array(fieldDefSchema),
    checklist: z.array(checklistItemSchema).nullable(),
    tests: z.array(testDefSchema),
    sub_blocks: z.array(subBlockKeySchema).min(1),
    subtypes: z.array(subtypeDefSchema),
    /** Every equipment sheet ends in the conclusion block, the transformer's too (FR-22). */
    conclusion: z.literal(true),
    /*
     * Story 14.5 (seed v5). The three keys below are optional and never defaulted, so the
     * definitions of v1 to v4 parse to the bytes they shipped with (`seed.test.ts` pins their
     * hashes); a definition without them has no measurement test, no configuration and is not
     * a library type.
     */
    /** The tests of the measurement-table grammar (`seed/measurement.ts`), in sheet and print order. */
    measurement_tests: z.array(measurementTestSchema).min(1).optional(),
    /** The block's own configuration fields, stored in `BlockConfig.options`. */
    config_fields: z.array(configFieldSchema).min(1).optional(),
    /** A library type: offered after the eight under "Outros equipamentos" and printed in that group. */
    library: z.literal(true).optional(),
    /*
     * Seeds v6 (Stories 14.9 and 14.11). Optional and never defaulted, like the three above.
     */
    /** The title the document prints for the sheet instead of the label (the QGBT's `QGBT/QD's`). */
    print_title: z.string().min(1).optional(),
    /** The oil rule (`relatorio/oil-rule.ts`): a non-oil unit shows its oil items NA and its oil fields excused. */
    oil_rule: oilRuleSchema.optional(),
  })
  .superRefine(checkMeasurementDefinition)
  .superRefine(checkSeedV6Definition);

/** A seeded definition as `blockDefinitionSchema` parses it: the closed enums of the seeds. */
export type SeedBlockDefinition = z.infer<typeof blockDefinitionSchema>;

/**
 * Story 14.6 (AD-21 note of 2026-11-06, item 2): the one definition type every reader takes, a
 * seeded type's or a company type's (`asBlockDefinition`). Its keys widen to `string` and its
 * `block_type` to `BlockTypeKey`, so a seeded definition is one of these as it is; the seeds keep
 * parsing with `blockDefinitionSchema` and its closed enums, byte-equal under the hash pins. The
 * last five keys exist only on a company type's definition. A company type's checklist item keys
 * are its own strings, typed as `ChecklistItem` (see there).
 */
export type BlockDefinition = Omit<SeedBlockDefinition, 'block_type' | 'checklist' | 'tests' | 'sub_blocks' | 'measurement_tests' | 'oil_rule'> & {
  block_type: BlockTypeKey;
  checklist: ChecklistItem[] | null;
  tests: TestDef[];
  sub_blocks: string[];
  measurement_tests?: MeasurementTest[];
  oil_rule?: OilRule;
  /** A company type's own criteria table, which its tests name (absent on a seeded type). */
  criteria?: CriterionSeed[];
  /** A company type's TAG prefix (a seeded type's is `TAG_PREFIX`). */
  tag_prefix?: string;
  /** A company type's noun, for the composed texts (a seeded type's are the kernel's tables). */
  noun?: { singular: string; plural: string; gender: 'm' | 'f' };
  /**
   * Fix batch e23z (W3-3): the seeded type a company copy was duplicated from (Duplicar or the base
   * import), what it prints as (`printBlockTypeOf`) and numbers its measurement tests by; absent on a
   * seeded type, on a new type and on a copy published before the key.
   */
  base_block_type?: EquipmentBlockType;
  /** The company type's id and the published version this definition is. */
  type_id?: string;
  type_version?: number;
  /** e22h S2: the id of the version row this definition is (what a block's config names beside `type_version`). */
  type_version_id?: string;
};

/** `CARACTERÍSTICAS DA SE` and `AMBIENTE DE ENSAIO`: the cabine's own fields (AD-6). */
export const cabineDefinitionSchema = z.object({
  se: z.array(fieldDefSchema).min(1),
  env: z.array(fieldDefSchema).min(1),
});
export type CabineDefinition = z.infer<typeof cabineDefinitionSchema>;

/** A plain text block of boilerplate; `{name}` is a variable resolved at generation. */
export const textBlockSchema = z.object({
  kind: z.enum(['heading', 'paragraph', 'item']),
  text: z.string().min(1),
});
export type TextBlock = z.infer<typeof textBlockSchema>;

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Boilerplate keyed by `(section, effective_from)`: the text in force from that date on.
 * `blocks: null` is an empty slot (the NR-10 text effective 2027-06-01 is not seeded yet)
 * and never resolves.
 */
export const sectionEntrySchema = z.object({
  section: z.number().int().min(1).max(11),
  effective_from: dateSchema,
  blocks: z.array(textBlockSchema).min(1).nullable(),
});
export type SectionEntry = z.infer<typeof sectionEntrySchema>;

/** The cover's `DADOS DO CLIENTE` table: one row per label, its value a variable. */
export const coverDefinitionSchema = z.object({
  title: z.string().min(1),
  rows: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).min(1),
});
export type CoverDefinition = z.infer<typeof coverDefinitionSchema>;

/** FR-31: a reason chip and the justification text it prints (`null`: typed by the engineer). */
export const notTestedReasonSchema = z.object({
  key: seedKey,
  label: z.string().min(1),
  justification: z.string().min(1).nullable(),
  /**
   * Story 22.4: the reason names a defect found on the equipment, so a sheet marked Não
   * ensaiado for it concludes Reprovado · Com restrições (`conclusionFloor`). Optional and
   * never defaulted, so v1 to v11 parse to the bytes they shipped with; absent reads false
   * (`isDefectReason`). Seed v12 (Story 22.7) sets it on "Defeito no equipamento", the first.
   */
  defect: z.boolean().optional(),
});
export type NotTestedReason = z.infer<typeof notTestedReasonSchema>;

/** A seeded pick-list word with the gender and number caption agreement needs (AD-19). */
export const seedWordSchema = z.object({
  name: z.string().min(1),
  gender: z.enum(['m', 'f']),
  number: z.enum(['singular', 'plural']),
});
export type SeedWord = z.infer<typeof seedWordSchema>;

export const reportTypeSchema = z.enum(['cabine_primaria']);
export type ReportType = z.infer<typeof reportTypeSchema>;

/** Story 6.6: a recurring-finding chip of the point editor and the plain text it inserts. */
export const recurringFindingSchema = z.object({
  label: z.string().min(1),
  text: z.string().min(1),
});
export type RecurringFinding = z.infer<typeof recurringFindingSchema>;

/** Story 14.3 (seed v4): one item of a local's site checklist, with the NC phrases of its chips. */
export const siteItemDefSchema = z.object({
  key: siteItemKeySchema,
  label: z.string().min(1),
  nc_phrases: z.array(z.string().min(1)).min(3).max(4),
});
export type SiteItemDef = z.infer<typeof siteItemDefSchema>;

/** A group of site items: a heading on the capture surface and a shaded row in the printed table. */
export const siteGroupSchema = z.object({
  key: seedKey,
  label: z.string().min(1),
  items: z.array(siteItemDefSchema).min(1),
});
export type SiteGroup = z.infer<typeof siteGroupSchema>;

/**
 * Story 14.3 (seed v4): "Verificações do local", answered once per local (the root `cabine`
 * row) and printed once in section 9. Labels are sentence case as approved; the printed table
 * upper-cases them.
 */
export const siteChecklistSchema = z
  .object({ groups: z.array(siteGroupSchema).min(1) })
  .refine((list) => new Set(list.groups.map((group) => group.key)).size === list.groups.length, { message: 'a site group key repeats' })
  .refine(
    (list) => {
      const keys = list.groups.flatMap((group) => group.items.map((item) => item.key));
      return new Set(keys).size === keys.length;
    },
    { message: 'a site item key repeats' },
  );
export type SiteChecklist = z.infer<typeof siteChecklistSchema>;

/**
 * The block definitions of one seed version, keyed by type. Story 14.5: a partial record over
 * the closed type list, since a type may ship in a later version only (the CTA from v5); the
 * eight FO.SERV-03 types are in every version, which the refinement holds. Keys parse in the
 * order they are written, so v1 to v4 keep their bytes.
 */
const blocksSchema = z
  .partialRecord(equipmentBlockTypeSchema, blockDefinitionSchema)
  .refine((blocks) => BASE_EQUIPMENT_BLOCK_TYPES.every((type) => blocks[type] !== undefined), { message: 'a seed version ships the eight FO.SERV-03 block types' })
  .refine((blocks) => Object.entries(blocks).every(([type, definition]) => definition === undefined || definition.block_type === type), {
    message: 'a block definition is keyed by its own block_type',
  });

/** `blocks` as every reader takes it: the eight always there, any other type only where its version ships it. */
export type SeedBlocks = Record<BaseEquipmentBlockType, BlockDefinition> & Partial<Record<Exclude<EquipmentBlockType, BaseEquipmentBlockType>, BlockDefinition>>;

/**
 * Batch e24a (Story 24.2, seed v14): the rule flags a seed version may carry. A rule that changes a
 * verdict or a printed page on a newer seed is reached through one of these flags, read by
 * `seedRule`, never through a comparison of version numbers (AD-21). Each flag is `true` or
 * absent, so a seed that never names one reads it as off; the object is strict, so a misspelt flag
 * fails the seed's first import instead of being silently off.
 */
export const seedRulesSchema = z
  .object({
    /** Story 24.3: a failure floors Reprovado with no restriction; "Com restrições" is the technician's choice. */
    conclusion_restriction_by_choice: z.literal(true).optional(),
    /** Story 24.3: the arrester's prerequisite is read only while its nameplate sub-block is on. */
    prerequisite_needs_nameplate: z.literal(true).optional(),
    /** Story 24.4: the parecer's Reprovado sentence names each reproved ficha's finding. */
    parecer_names_finding: z.literal(true).optional(),
    /** Story 24.4: the lines of an NC observation are joined on one line in the conclusion. */
    nc_clause_on_one_line: z.literal(true).optional(),
    /** Story 24.4: the fixed results reference of a Conclusão text is replaced across its formatted runs. */
    results_reference_across_runs: z.literal(true).optional(),
    /** Story 24.15: the MANUT. ANTERIOR header prints the previous visit's date, and the history texts name it. */
    previous_visit_date: z.literal(true).optional(),
    /** Story 24.16: one note line under a readings table names the rows a previous-visit rule flagged. */
    history_note: z.literal(true).optional(),
    /** Story 24.17: a point written from a test holds its recommendation as the action; action-plan rows kept whole; spaced photo references in section 8. */
    recommendation_as_action: z.literal(true).optional(),
  })
  .strict();
export type SeedRules = z.infer<typeof seedRulesSchema>;
export type SeedRuleFlag = keyof SeedRules;

/** Everything one seed version holds for one report type. */
export const reportSeedSchema = z.object({
  blocks: blocksSchema,
  checklist_columns: z.array(z.string().min(1)).min(1),
  cabine: cabineDefinitionSchema,
  section_titles: z.record(z.string(), z.string().min(1)),
  sections: z.array(sectionEntrySchema).min(1),
  cover: coverDefinitionSchema,
  not_tested_reasons: z.array(notTestedReasonSchema).min(1),
  atividades: z.array(seedWordSchema).min(1),
  locais: z.array(seedWordSchema).min(1),
  quick_notes: z.array(z.string().min(1)).min(1),
  /**
   * Story 6.6 (seed v3): the recurring-finding chips. Optional rather than defaulted, so
   * parsing v1 and v2 adds nothing to them and their content hashes stay as shipped;
   * `recurringFindings` reads an absent list as none.
   */
  recurring_findings: z.array(recurringFindingSchema).min(1).optional(),
  /**
   * Story 14.3 (seed v4): the site checklist of a local. Optional like `recurring_findings`,
   * so v1 to v3 parse to the bytes they shipped with; a version without it has no site
   * checklist at all (`siteChecklistOf` answers null: nothing shown, counted or printed).
   */
  site_checklist: siteChecklistSchema.optional(),
  /**
   * Batch e24a (Story 24.2, seed v14): the seed's rule flags (`seedRulesSchema`). Optional like
   * `recurring_findings`, so v1 to v13 parse to the bytes they shipped with and their content
   * hashes hold; a version without it has every rule off (`seedRule` answers false).
   */
  rules: seedRulesSchema.optional(),
});
export type ReportSeed = Omit<z.infer<typeof reportSeedSchema>, 'blocks'> & { blocks: SeedBlocks };

export const seedBundleSchema = z.object({
  version: z.string().min(1),
  report_types: z.record(reportTypeSchema, reportSeedSchema),
});
export type SeedBundle = Omit<z.infer<typeof seedBundleSchema>, 'report_types'> & { report_types: Record<ReportType, ReportSeed> };
