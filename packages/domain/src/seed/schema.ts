import { z } from 'zod';
import {
  equipmentBlockTypeSchema,
  itemKeySchema,
  subBlockKeySchema,
  subtypeSchema,
} from '../schemas/block-config.ts';

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
  })
  .refine((f) => (f.kind === 'select') === (f.options !== undefined), {
    message: 'options exist exactly on a select field',
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
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/**
 * A value column of a measurement table. `capture`: typed on site; `input`: typed, feeds a
 * derived cell (the ratio test's V/A PRIMÁRIO and SECUNDÁRIO); `derived`: computed by the
 * kernel, never typed (VAL CALCULADO, CONDIÇÕES); `print`: printed "-" unless a sub-block
 * captures it (30 SEGUNDOS, ESTAB./10MIN, ABSORÇÃO, POLARIZAÇÃO).
 */
export const columnDefSchema = z.object({
  label: z.string().min(1),
  unit: z.string().min(1).nullable(),
  role: z.enum(['capture', 'input', 'derived', 'print']),
  derived: z.boolean(),
  group: z.string().min(1).optional(),
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
  })
  .refine((t) => t.rows.every((row) => row.length === t.connection_columns.length), {
    message: 'every row has one cell per connection column',
  })
  .refine((t) => t.value_columns.find((c) => c.role === 'capture')?.label === t.capture_column, {
    message: 'capture_column names the first capture column',
  })
  .refine((t) => t.value_columns.every((c) => c.derived === (c.role === 'derived')), {
    message: 'derived is true exactly on a derived column',
  });
export type TableDef = z.infer<typeof tableDefSchema>;

/** A test sub-block, bound by `criterion_key` to one of `SEEDED_CRITERIA` (Story 2.6). */
export const testDefSchema = z.object({
  key: z.enum(['isolacao', 'resistencia_contato', 'relacao_transformacao']),
  label: z.string().min(1),
  criterion_key: z.string().min(1),
  tables: z.array(tableDefSchema).min(1),
});
export type TestDef = z.infer<typeof testDefSchema>;

/** FR-11: a subtype pre-marks these items NA; they stay on the list and editable. */
export const subtypeDefSchema = z.object({
  key: subtypeSchema,
  label: z.string().min(1),
  na_defaults: z.array(itemKeySchema).min(1),
});
export type SubtypeDef = z.infer<typeof subtypeDefSchema>;

export const blockDefinitionSchema = z.object({
  block_type: equipmentBlockTypeSchema,
  label: z.string().min(1),
  nameplate: z.array(fieldDefSchema),
  checklist: z.array(checklistItemSchema).nullable(),
  tests: z.array(testDefSchema),
  sub_blocks: z.array(subBlockKeySchema).min(1),
  subtypes: z.array(subtypeDefSchema),
  /** Every equipment sheet ends in the conclusion block, the transformer's too (FR-22). */
  conclusion: z.literal(true),
});
export type BlockDefinition = z.infer<typeof blockDefinitionSchema>;

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

/** Everything one seed version holds for one report type. */
export const reportSeedSchema = z.object({
  blocks: z.record(equipmentBlockTypeSchema, blockDefinitionSchema),
  checklist_columns: z.array(z.string().min(1)).min(1),
  cabine: cabineDefinitionSchema,
  section_titles: z.record(z.string(), z.string().min(1)),
  sections: z.array(sectionEntrySchema).min(1),
  cover: coverDefinitionSchema,
  not_tested_reasons: z.array(notTestedReasonSchema).min(1),
  atividades: z.array(seedWordSchema).min(1),
  locais: z.array(seedWordSchema).min(1),
  quick_notes: z.array(z.string().min(1)).min(1),
});
export type ReportSeed = z.infer<typeof reportSeedSchema>;

export const seedBundleSchema = z.object({
  version: z.string().min(1),
  report_types: z.record(reportTypeSchema, reportSeedSchema),
});
export type SeedBundle = z.infer<typeof seedBundleSchema>;
