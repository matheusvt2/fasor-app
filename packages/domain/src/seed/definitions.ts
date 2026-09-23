import { equipmentBlockTypeSchema, type EquipmentBlockType, type ItemKey, type Subtype } from '../schemas/block-config.ts';
import { SEEDED_CRITERIA } from './criteria.ts';
import {
  dateSchema,
  reportTypeSchema,
  seedBundleSchema,
  type BlockDefinition,
  type ReportSeed,
  type ReportType,
  type SeedBundle,
  type TextBlock,
} from './schema.ts';
import { CABINE_PRIMARIA_V1 } from './v1.ts';

/*
 * AD-21, AR-20: seed data is versioned code, resolved and never copied. A Template and a
 * relatório record the `seed_version` they were created with, and every version this
 * bundle ever shipped stays in `SEED_VERSIONS`, so a relatório created under `v1`
 * resolves the same definitions for as long as it exists. A change to a definition is a
 * new version appended here, never an edit of a shipped one (`seed.test.ts` pins v1).
 */

/** The version a new Template is created with. */
export const SEED_VERSION = 'v1';

/** The named variables section boilerplate may carry, resolved at generation. */
export const SECTION_VARIABLES = ['empresa_executora', 'cliente', 'obra', 'escopo', 'datas', 'responsavel'] as const;
export type SectionVariable = (typeof SECTION_VARIABLES)[number];

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Validated once, at module load: a malformed seed fails every consumer's first import. */
function bundle(version: string, cabinePrimaria: ReportSeed): SeedBundle {
  const parsed = seedBundleSchema.parse({ version, report_types: { cabine_primaria: cabinePrimaria } });
  const criterionKeys = new Set(SEEDED_CRITERIA.map((c) => c.key));
  for (const definition of Object.values(parsed.report_types.cabine_primaria.blocks)) {
    for (const test of definition.tests) {
      if (!criterionKeys.has(test.criterion_key)) {
        throw new Error(`seed ${version}: ${definition.block_type}/${test.key} names unknown criterion "${test.criterion_key}"`);
      }
    }
  }
  return deepFreeze(parsed);
}

/** Every seed version this bundle shipped, append-only. */
export const SEED_VERSIONS: Readonly<Record<string, SeedBundle>> = deepFreeze({
  v1: bundle('v1', CABINE_PRIMARIA_V1),
});

/** One version's seed for one report type; throws naming the argument a caller got wrong. */
export function getSeed(seedVersion: string, reportType: string): ReportSeed {
  const seed = Object.hasOwn(SEED_VERSIONS, seedVersion) ? SEED_VERSIONS[seedVersion] : undefined;
  if (seed === undefined) throw new Error(`getDefinition: unknown seed_version "${seedVersion}"`);
  const type = reportTypeSchema.safeParse(reportType);
  if (!type.success) throw new Error(`getDefinition: unknown report_type "${reportType}"`);
  return seed.report_types[type.data as ReportType];
}

/**
 * The definition of one equipment block type (fields, checklist, test grammars, sub-blocks,
 * subtypes) as the given seed version shipped it. Section block types have no definition
 * here: their text resolves through `sectionText`.
 */
export function getDefinition(seedVersion: string, reportType: string, blockType: string): BlockDefinition {
  const seed = getSeed(seedVersion, reportType);
  const type = equipmentBlockTypeSchema.safeParse(blockType);
  if (!type.success) throw new Error(`getDefinition: unknown block_type "${blockType}"`);
  return seed.blocks[type.data as EquipmentBlockType];
}

/** FR-11: the item keys a subtype pre-marks NA, or none without a subtype. */
export function naDefaultsFor(seedVersion: string, blockType: string, subtype: Subtype | undefined): ItemKey[] {
  if (subtype === undefined) return [];
  const definition = getDefinition(seedVersion, 'cabine_primaria', blockType);
  const found = definition.subtypes.find((s) => s.key === subtype);
  if (found === undefined) throw new Error(`naDefaultsFor: ${blockType} has no subtype "${subtype}"`);
  return [...found.na_defaults];
}

/**
 * The boilerplate of one section in force on `date` (`YYYY-MM-DD`): the entry with the
 * latest `effective_from` on or before it that holds text. An empty slot (the
 * 2027-06-01 NR-10 revision, not seeded yet) is skipped, so the current text keeps
 * resolving after that date until a later seed version fills the slot.
 */
export function sectionText(seedVersion: string, section: number, date: string): readonly TextBlock[] {
  // `effective_from` is compared as text, which orders only a `YYYY-MM-DD` date correctly.
  if (!dateSchema.safeParse(date).success) throw new Error(`sectionText: date must be YYYY-MM-DD, got "${date}"`);
  const seed = getSeed(seedVersion, 'cabine_primaria');
  const entries = seed.sections
    .filter((entry) => entry.section === section && entry.effective_from <= date && entry.blocks !== null)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  const blocks = entries[0]?.blocks;
  if (blocks === undefined || blocks === null) {
    throw new Error(`sectionText: section ${section} has no boilerplate in force on ${date} (seed ${seedVersion})`);
  }
  return blocks;
}
