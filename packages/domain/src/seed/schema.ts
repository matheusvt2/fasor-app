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
import { checkMeasurementDefinition, configFieldSchema, criterionSourceSchema, measurementTestSchema, type MeasurementTest } from './measurement.ts';

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
  })
  .refine((f) => (f.kind === 'select') === (f.options !== undefined), {
    message: 'options exist exactly on a select field',
  })
  .refine((f) => f.option_aliases === undefined || (f.kind === 'select' && f.options !== undefined && Object.values(f.option_aliases).every((target) => f.options!.includes(target))), {
    message: 'option_aliases belong to a select and name its options',
  })
  .refine((f) => f.unit === undefined || f.kind === 'number' || f.kind === 'voltage_class', {
    message: 'a unit belongs to a number or voltage_class field',
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
     */
    role: z.enum(['capture', 'input', 'derived', 'print', 'voltage']),
    derived: z.boolean(),
    group: z.string().min(1).optional(),
    /**
     * Seed v12 (Story 22.8): on a `voltage` column only, the pt-BR texts of its select ("0,5", "10").
     * Optional and never defaulted, so v1 to v11 parse to the bytes they shipped with.
     */
    options: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((c) => (c.role === 'voltage') === (c.options !== undefined), { message: 'options exist exactly on a voltage column' });
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
   * (`relatorio/accuracy-class.ts`): ± the class % for a measurement class, ± 3 % for 5P and 10P,
   * the seeded criterion while the field is empty. Optional and never defaulted, so v1 to v11
   * parse to the bytes they shipped with.
   */
  criterion_class_field: seedKey.optional(),
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
  })
  .refine((rule) => rule.full_values === undefined || rule.full_values.every((value) => !rule.oil_values.includes(value)), {
    message: 'full_values and oil_values are disjoint',
  });
export type OilRule = Omit<z.infer<typeof oilRuleSchema>, 'items'> & { items: string[] };

/**
 * Seed v6: what the oil rule and the band criterion name exists on the definition. Story 14.6:
 * exported, so a company type's definition (`companyTypeDefinitionSchema`, which has no oil rule)
 * meets the same reference checks on its tests.
 */
export function checkSeedV6Definition(
  definition: {
    nameplate: readonly FieldDef[];
    checklist: readonly { key: string }[] | null;
    tests: readonly TestDef[];
    oil_rule?: OilRule | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const field = (key: string) => definition.nameplate.find((candidate) => candidate.key === key);
  const rule = definition.oil_rule;
  if (rule !== undefined) {
    const select = field(rule.field);
    if (select === undefined || select.kind !== 'select') ctx.addIssue({ code: 'custom', message: `oil_rule.field "${rule.field}" is not a select of the nameplate` });
    else if (!rule.oil_values.every((value) => select.options!.includes(value))) ctx.addIssue({ code: 'custom', message: 'an oil value is not an option of its field' });
    else if (!(rule.full_values ?? []).every((value) => select.options!.includes(value))) ctx.addIssue({ code: 'custom', message: 'a full value is not an option of its field' });
    const items = new Set((definition.checklist ?? []).map((item) => item.key));
    if (!rule.items.every((key) => items.has(key))) ctx.addIssue({ code: 'custom', message: 'an oil item is not on the checklist' });
    if (!rule.fields.every((key) => field(key) !== undefined)) ctx.addIssue({ code: 'custom', message: 'an oil field is not on the nameplate' });
  }
  // Seed v12 (Stories 22.8 and 22.9): a row's winding is a number field, a class field a select.
  for (const test of definition.tests) {
    if (test.criterion_class_field !== undefined && field(test.criterion_class_field)?.kind !== 'select') {
      ctx.addIssue({ code: 'custom', message: `criterion_class_field "${test.criterion_class_field}" is not a select of the nameplate` });
    }
    for (const table of test.tables) {
      for (const entry of table.voltage_rows ?? []) {
        if (entry.winding !== null && field(entry.winding)?.kind !== 'number') ctx.addIssue({ code: 'custom', message: `voltage_rows winding "${entry.winding}" is not a number field of the nameplate` });
      }
    }
  }
  for (const test of definition.tests) {
    const bands = test.criterion_bands;
    if (bands === undefined) continue;
    const voltage = field(bands.field);
    if (voltage === undefined || voltage.kind !== 'number' || voltage.unit !== 'V') ctx.addIssue({ code: 'custom', message: `criterion_bands.field "${bands.field}" is not a number field in V` });
    if (bands.selv_field !== undefined) {
      const selv = field(bands.selv_field);
      if (selv === undefined || selv.kind !== 'select' || !selv.options!.includes(SELV_YES)) ctx.addIssue({ code: 'custom', message: `criterion_bands.selv_field "${bands.selv_field}" is not a SIM/NÃO select` });
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
  /** The company type's id and the published version this definition is. */
  type_id?: string;
  type_version?: number;
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
});
export type ReportSeed = Omit<z.infer<typeof reportSeedSchema>, 'blocks'> & { blocks: SeedBlocks };

export const seedBundleSchema = z.object({
  version: z.string().min(1),
  report_types: z.record(reportTypeSchema, reportSeedSchema),
});
export type SeedBundle = Omit<z.infer<typeof seedBundleSchema>, 'report_types'> & { report_types: Record<ReportType, ReportSeed> };
