import { companyBlockType } from '../schemas/block-config.ts';
import type { CriterionSeed } from '../seed/criteria.ts';
import type { MeasurementTest } from '../seed/measurement.ts';
import type { BlockDefinition, ChecklistItem, TestDef } from '../seed/schema.ts';
import { companySubBlocksOf, type CompanyTypeDefinition } from './definition.ts';

/*
 * Story 14.6 (AD-21 note of 2026-11-06, item 2): a published version of a company type, adapted
 * to the one definition type every reader takes, so the sheet, the evaluation, the conclusion and
 * the print read a company type exactly as they read a seeded one. It is a library type
 * (`library: true`: offered after the seeded types, printed in "Outros equipamentos"), its
 * sub-blocks are derived from its parts, it has no subtypes, and each test carries the row of the
 * type's own criteria table it names (`criterion`, `seeded_criterion`), which the readers take
 * before `SEEDED_CRITERIA`. A reader that switches on a seeded `block_type` (the transformer ratio,
 * the oil rule, the vector group) sees a `type:` key and takes its generic path.
 */

/** What `asBlockDefinition` reads of a version row. */
export interface VersionRowLike {
  type_id: string;
  version: number;
  definition: CompanyTypeDefinition;
}

const adapted = new WeakMap<object, BlockDefinition>();

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** The criteria rows as the readers take them (`CriterionSeed`), `usedBy` naming the type. */
function criteriaOf(definition: CompanyTypeDefinition): CriterionSeed[] {
  return definition.criteria.map((criterion) => ({
    key: criterion.key,
    label: criterion.label,
    operator: criterion.operator,
    value: criterion.value,
    ...(criterion.value_max === undefined ? {} : { value_max: criterion.value_max }),
    unit: criterion.unit,
    type: criterion.type,
    source: { name: criterion.source.name, edition: criterion.source.edition },
    usedBy: definition.label,
  }));
}

/** One published version as a `BlockDefinition`; the same object for the same row object. */
export function asBlockDefinition(row: VersionRowLike): BlockDefinition {
  const known = adapted.get(row);
  if (known !== undefined) return known;
  const definition = structuredClone(row.definition);
  const criteria = criteriaOf(definition);
  const byKey = new Map(criteria.map((criterion) => [criterion.key, criterion]));
  const tests: TestDef[] = definition.tests.map((test) => {
    const criterion = byKey.get(test.criterion_key);
    return criterion === undefined ? test : { ...test, criterion };
  });
  const measurementTests: MeasurementTest[] | undefined = definition.measurement_tests?.map((test) => ({
    ...test,
    criteria: test.criteria.map((criterion) => {
      if (criterion.type !== 'absolute' || criterion.seeded === undefined) return criterion;
      const seeded = byKey.get(criterion.seeded);
      return seeded === undefined ? criterion : { ...criterion, seeded_criterion: seeded };
    }),
  }));
  const out: BlockDefinition = {
    block_type: companyBlockType(row.type_id),
    label: definition.label,
    nameplate: definition.nameplate,
    // A company item key is the definition's own string, typed as the seeds' (`ChecklistItem`).
    checklist: definition.checklist as ChecklistItem[] | null,
    tests,
    sub_blocks: companySubBlocksOf(definition),
    subtypes: [],
    conclusion: true,
    ...(measurementTests === undefined ? {} : { measurement_tests: measurementTests }),
    ...(definition.config_fields === undefined ? {} : { config_fields: definition.config_fields }),
    library: true,
    ...(definition.print_title === undefined ? {} : { print_title: definition.print_title }),
    criteria,
    tag_prefix: definition.tag_prefix,
    noun: definition.noun,
    type_id: row.type_id,
    type_version: row.version,
  };
  deepFreeze(out);
  adapted.set(row, out);
  return out;
}
