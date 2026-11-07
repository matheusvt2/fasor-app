import { z } from 'zod';
import { criterionTypeSchema, type CriterionType } from '../seed/criteria.ts';
import {
  absoluteCriterionSchema,
  checkMeasurementDefinition,
  choicePassCriterionSchema,
  configFieldSchema,
  equalsColumnCriterionSchema,
  measurementTestSchema,
  relativeToLowestCriterionSchema,
} from '../seed/measurement.ts';
import { checklistItemSchema, checkSeedV6Definition, fieldDefSchema, testDefSchema } from '../seed/schema.ts';

/*
 * Story 14.6 (contract 33; AD-21 note of 2026-11-06, item 2): the definition of a company
 * equipment type, the data an office user edits (a draft) and publishes (an immutable version).
 * It carries the seed's definition shape (nameplate fields of the six AD-11 kinds, checklist items
 * with their NC phrases, tests of the four seeded grammars and Story 14.5's measurement table),
 * plus what a seed key gives a seeded type for free: a TAG prefix, a noun with its gender for the
 * composed texts, and the type's own criteria table, which every test names (a seeded-grammar
 * test through `criterion_key`, a measurement test's absolute criterion through `seeded`), so the
 * office edits a criterion's value on its type. Keys are `[a-z0-9_]+` strings unique within the
 * definition, never the seeds' closed enums. A company type has no subtypes and no role.
 *
 * Two schemas: `companyTypeDefinitionSchema` is strict (a version's definition, checked by
 * `applyOp` on publish); `companyTypeDraftSchema` is the same object with every key optional and
 * every list item any JSON object, so an incomplete draft still autosaves. `validateTypeDraft`
 * (`types/validate.ts`) reports, in pt-BR, exactly what the strict schema refuses.
 */

const key = z.string().regex(/^[a-z0-9_]+$/);
const notBlank = z.string().refine((text) => text.trim() !== '', { message: 'blank' });

/** A TAG prefix: an uppercase letter, then up to five uppercase letters or digits ("NB", "QD2"). */
export const TAG_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{0,5}$/;

/** The noun a company type's composed texts agree with ("o no-break NB-01", "a fonte FA-01"). */
export const typeNounSchema = z.object({
  singular: notBlank,
  plural: notBlank,
  gender: z.enum(['m', 'f']),
});
export type TypeNoun = z.infer<typeof typeNounSchema>;

/** The seven criterion operators a company criterion takes (`compareCriterion` implements all of them). */
export const COMPANY_CRITERION_OPERATORS = ['>', '<', '>=', '<=', 'between', '±', 'pass_fail'] as const;
export const companyCriterionOperatorSchema = z.enum(COMPANY_CRITERION_OPERATORS);
export type CompanyCriterionOperator = z.infer<typeof companyCriterionOperatorSchema>;

/** The criterion type an operator stands for, the shape `SEEDED_CRITERIA` carries. */
export function criterionTypeOf(operator: CompanyCriterionOperator): CriterionType {
  switch (operator) {
    case '>':
    case '>=':
      return 'absolute_min';
    case '<':
    case '<=':
      return 'absolute_max';
    case 'pass_fail':
      return 'pass_fail';
    default:
      return 'deviation_between';
  }
}

/**
 * One row of a company type's criteria table: `between` holds `value` to `value_max`; `±` the
 * tolerance `value` (a deviation, as the seeded ratio criterion); `pass_fail` passes a reading of
 * 1 (aprovado). Every criterion names its source (`source.name`), as every seeded one does.
 */
export const companyCriterionSchema = z
  .object({
    key,
    label: notBlank,
    operator: companyCriterionOperatorSchema,
    value: z.number(),
    value_max: z.number().optional(),
    unit: z.string().min(1).nullable(),
    type: criterionTypeSchema,
    source: z.object({ name: notBlank, edition: z.string().nullable() }),
  })
  .superRefine((criterion, ctx) => {
    if (criterion.operator === 'between' && criterion.value_max === undefined) ctx.addIssue({ code: 'custom', path: ['value_max'], message: 'between names its maximum' });
    if (criterion.operator !== 'between' && criterion.value_max !== undefined) ctx.addIssue({ code: 'custom', path: ['value_max'], message: 'only between names a maximum' });
    if (criterion.operator === 'between' && criterion.value_max !== undefined && criterion.value_max < criterion.value) {
      ctx.addIssue({ code: 'custom', path: ['value_max'], message: 'the maximum is below the minimum' });
    }
  });
export type CompanyCriterion = z.infer<typeof companyCriterionSchema>;

/** A checklist item of a company type: the seed's item with a free key. */
export const companyChecklistItemSchema = checklistItemSchema.extend({ key });
export type CompanyChecklistItem = z.infer<typeof companyChecklistItemSchema>;

/** A measurement absolute criterion of a company type: `seeded` names a row of the type's own criteria table. */
const companyAbsoluteCriterionSchema = absoluteCriterionSchema.extend({ seeded: key.optional() });

export const companyMeasurementCriterionSchema = z.discriminatedUnion('type', [
  companyAbsoluteCriterionSchema,
  relativeToLowestCriterionSchema,
  equalsColumnCriterionSchema,
  choicePassCriterionSchema,
]);

/** A measurement test of a company type: Story 14.5's grammar with a free key. */
export const companyMeasurementTestSchema = measurementTestSchema.extend({
  key,
  criteria: z.array(companyMeasurementCriterionSchema).min(1),
});
export type CompanyMeasurementTest = z.infer<typeof companyMeasurementTestSchema>;

/** The sub-block names a measurement test of a company type may not take (they are the sheet's own parts). */
const RESERVED_TEST_KEYS: ReadonlySet<string> = new Set(['nameplate', 'checklist', 'observations', 'conclusion', 'ia_ip_display', 'isolacao', 'resistencia_contato', 'relacao_transformacao']);

/** The two grid columns whose presence on an insulation table makes the "IA e IP lidos do visor" sub-block. */
const IA_IP_COLUMNS: ReadonlySet<string> = new Set(['ABSORÇÃO', 'POLARIZAÇÃO']);

/** What `companySubBlocksOf` reads of a definition (a draft's parts may be absent). */
interface PartsOf {
  nameplate?: readonly unknown[] | undefined;
  checklist?: readonly unknown[] | null | undefined;
  tests?: readonly { key?: unknown; tables?: readonly { value_columns?: readonly { label?: unknown; role?: unknown }[] }[] }[] | undefined;
  measurement_tests?: readonly { key?: unknown }[] | undefined;
}

/**
 * The sub-blocks of a company definition, derived from its parts in the seeds' order: the
 * nameplate when it has a field, the checklist when it has a list, each test (the insulation
 * test followed by `ia_ip_display` when its table prints ABSORÇÃO or POLARIZAÇÃO, as the seeded
 * single-table insulation does), each measurement test, then observations and the conclusion.
 */
export function companySubBlocksOf(definition: PartsOf): string[] {
  const out: string[] = [];
  if ((definition.nameplate ?? []).length > 0) out.push('nameplate');
  if (definition.checklist !== null && definition.checklist !== undefined) out.push('checklist');
  for (const test of definition.tests ?? []) {
    if (typeof test.key !== 'string') continue;
    out.push(test.key);
    const printsIaIp = (test.tables ?? []).some((table) => (table.value_columns ?? []).some((column) => column.role === 'print' && typeof column.label === 'string' && IA_IP_COLUMNS.has(column.label)));
    if (test.key === 'isolacao' && printsIaIp) out.push('ia_ip_display');
  }
  for (const test of definition.measurement_tests ?? []) if (typeof test.key === 'string') out.push(test.key);
  out.push('observations', 'conclusion');
  return out;
}

const repeats = (keys: readonly string[]): string[] => keys.filter((k, i) => keys.indexOf(k) !== i);

/** The cross-part rules of a definition: unique keys, and every criterion a test names exists. */
function checkCompanyDefinition(
  definition: {
    nameplate: readonly z.infer<typeof fieldDefSchema>[];
    checklist: readonly CompanyChecklistItem[] | null;
    tests: readonly z.infer<typeof testDefSchema>[];
    measurement_tests?: readonly CompanyMeasurementTest[] | undefined;
    config_fields?: readonly z.infer<typeof configFieldSchema>[] | undefined;
    criteria: readonly CompanyCriterion[];
  },
  ctx: z.RefinementCtx,
): void {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  for (const k of repeats(definition.nameplate.map((field) => field.key))) issue(['nameplate'], `the field key "${k}" repeats`);
  for (const k of repeats((definition.checklist ?? []).map((item) => item.key))) issue(['checklist'], `the item key "${k}" repeats`);
  for (const k of repeats(definition.tests.map((test) => test.key))) issue(['tests'], `the grammar "${k}" holds more than one test`);
  for (const k of repeats(definition.criteria.map((criterion) => criterion.key))) issue(['criteria'], `the criterion key "${k}" repeats`);
  for (const k of repeats((definition.config_fields ?? []).map((field) => field.key))) issue(['config_fields'], `the config key "${k}" repeats`);
  const criteria = new Set(definition.criteria.map((criterion) => criterion.key));
  definition.tests.forEach((test, t) => {
    if (!criteria.has(test.criterion_key)) issue(['tests', t, 'criterion_key'], `"${test.criterion_key}" is not a criterion of the type`);
  });
  (definition.measurement_tests ?? []).forEach((test, t) => {
    if (RESERVED_TEST_KEYS.has(test.key)) issue(['measurement_tests', t, 'key'], `"${test.key}" is a part of the sheet, not a test key`);
    test.criteria.forEach((criterion, c) => {
      if (criterion.type === 'absolute' && criterion.seeded !== undefined && !criteria.has(criterion.seeded)) {
        issue(['measurement_tests', t, 'criteria', c, 'seeded'], `"${criterion.seeded}" is not a criterion of the type`);
      }
    });
  });
  checkSeedV6Definition(definition, ctx);
  checkMeasurementDefinition({ sub_blocks: companySubBlocksOf(definition), measurement_tests: definition.measurement_tests, config_fields: definition.config_fields }, ctx);
}

/** A version's definition: strict (AD-21 item 2). */
export const companyTypeDefinitionSchema = z
  .object({
    label: notBlank,
    print_title: notBlank.optional(),
    tag_prefix: z.string().regex(TAG_PREFIX_PATTERN),
    noun: typeNounSchema,
    nameplate: z.array(fieldDefSchema),
    checklist: z.array(companyChecklistItemSchema).nullable(),
    tests: z.array(testDefSchema),
    measurement_tests: z.array(companyMeasurementTestSchema).min(1).optional(),
    config_fields: z.array(configFieldSchema).min(1).optional(),
    criteria: z.array(companyCriterionSchema),
  })
  .superRefine(checkCompanyDefinition);
export type CompanyTypeDefinition = z.infer<typeof companyTypeDefinitionSchema>;

type DeepPartial<T> = T extends readonly (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** A draft: the definition with every key optional, at every depth (an incomplete draft still saves). */
export type CompanyTypeDraft = DeepPartial<CompanyTypeDefinition>;

const looseItems = z.array(z.record(z.string(), z.json()));

/**
 * The draft's schema (AD-21 item 2): the definition's keys, each optional; list items are any JSON
 * object, so a field typed halfway, an item with two NC phrases or a criterion with no source yet
 * all save. Nothing here is trimmed or defaulted: a draft parses to the bytes it was written with.
 */
export const companyTypeDraftSchema = z.object({
  label: z.string().optional(),
  print_title: z.string().optional(),
  tag_prefix: z.string().optional(),
  noun: z.object({ singular: z.string().optional(), plural: z.string().optional(), gender: z.enum(['m', 'f']).optional() }).optional(),
  nameplate: looseItems.optional(),
  checklist: looseItems.nullable().optional(),
  tests: looseItems.optional(),
  measurement_tests: looseItems.optional(),
  config_fields: looseItems.optional(),
  criteria: looseItems.optional(),
}) as unknown as z.ZodType<CompanyTypeDraft>;
