import {
  BASE_EQUIPMENT_BLOCK_TYPES,
  EQUIPMENT_BLOCK_TYPES,
  equipmentBlockTypeSchema,
  type EquipmentBlockType,
  type ItemKey,
  type SiteItemKey,
  type Subtype,
} from '../schemas/block-config.ts';
import { SEEDED_CRITERIA } from './criteria.ts';
import {
  dateSchema,
  reportTypeSchema,
  seedBundleSchema,
  type BlockDefinition,
  type ReportSeed,
  type RecurringFinding,
  type ReportType,
  type SeedBundle,
  type SiteChecklist,
  type TextBlock,
} from './schema.ts';
import { CABINE_PRIMARIA_V1 } from './v1.ts';
import { CABINE_PRIMARIA_V2 } from './v2.ts';
import { CABINE_PRIMARIA_V3 } from './v3.ts';
import { CABINE_PRIMARIA_V4 } from './v4.ts';
import { CABINE_PRIMARIA_V5 } from './v5.ts';
import { CABINE_PRIMARIA_V6 } from './v6.ts';
import { CABINE_PRIMARIA_V7 } from './v7.ts';
import { CABINE_PRIMARIA_V8 } from './v8.ts';
import { CABINE_PRIMARIA_V9 } from './v9.ts';

/*
 * AD-21, AR-20: seed data is versioned code, resolved and never copied. A Template and a
 * relatório record the `seed_version` they were created with, and every version this
 * bundle ever shipped stays in `SEED_VERSIONS`, so a relatório created under `v1`
 * resolves the same definitions for as long as it exists. A change to a definition is a
 * new version appended here, never an edit of a shipped one (`seed.test.ts` pins v1).
 */

/**
 * The version a new Template is created with. A relatório keeps the version it was created
 * with for as long as it exists. A Template keeps its own until the server's upgrade step
 * moves it (`templateSeedUpgrade`, Story 14.3): every relatório made from it afterwards is
 * born on the newer version, and none already made is touched.
 */
export const SEED_VERSION = 'v9';

/**
 * The named variables section boilerplate may carry, resolved at generation. Seed v8 (UX pass
 * 2026-10-22, F43) adds `itens_resultados`, where its Conclusão text says the results are
 * ("nos itens 4 e 5"); it always resolves and is never offered for insertion.
 */
export const SECTION_VARIABLES = ['empresa_executora', 'cliente', 'obra', 'escopo', 'datas', 'responsavel', 'itens_resultados'] as const;
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
  // The schema's refinement holds that the eight are there, which is what `SeedBundle` types.
  const parsed = seedBundleSchema.parse({ version, report_types: { cabine_primaria: cabinePrimaria } }) as SeedBundle;
  const criterionKeys = new Set(SEEDED_CRITERIA.map((c) => c.key));
  for (const definition of Object.values(parsed.report_types.cabine_primaria.blocks)) {
    for (const test of definition.tests) {
      if (!criterionKeys.has(test.criterion_key)) {
        throw new Error(`seed ${version}: ${definition.block_type}/${test.key} names unknown criterion "${test.criterion_key}"`);
      }
    }
    // Story 14.9 (seed v6): a criterion picked by a nameplate value names its source on every band.
    for (const test of definition.tests) {
      const bands = test.criterion_bands;
      if (bands === undefined) continue;
      for (const band of [...bands.bands, ...(bands.selv === undefined ? [] : [bands.selv])]) {
        if (band.source.name.trim() === '') throw new Error(`seed ${version}: ${definition.block_type}/${test.key} has a criterion band without its source`);
      }
    }
    // Story 14.5: a measurement criterion that reads a seeded one names one that exists.
    for (const test of definition.measurement_tests ?? []) {
      for (const criterion of test.criteria) {
        if (criterion.type === 'absolute' && criterion.seeded !== undefined && !criterionKeys.has(criterion.seeded)) {
          throw new Error(`seed ${version}: ${definition.block_type}/${test.key} names unknown criterion "${criterion.seeded}"`);
        }
      }
    }
  }
  return deepFreeze(parsed);
}

/** Every seed version this bundle shipped, append-only. */
export const SEED_VERSIONS: Readonly<Record<string, SeedBundle>> = deepFreeze({
  v1: bundle('v1', CABINE_PRIMARIA_V1),
  v2: bundle('v2', CABINE_PRIMARIA_V2),
  v3: bundle('v3', CABINE_PRIMARIA_V3),
  v4: bundle('v4', CABINE_PRIMARIA_V4),
  v5: bundle('v5', CABINE_PRIMARIA_V5),
  v6: bundle('v6', CABINE_PRIMARIA_V6),
  v7: bundle('v7', CABINE_PRIMARIA_V7),
  v8: bundle('v8', CABINE_PRIMARIA_V8),
  v9: bundle('v9', CABINE_PRIMARIA_V9),
});

/**
 * Every `not_tested_reasons` key any shipped seed version offers, in first-seen order: the
 * values `block.not_tested.reason` may hold (keys are append-only across versions).
 */
export const NOT_TESTED_REASON_KEYS = [
  ...new Set(
    Object.values(SEED_VERSIONS).flatMap((b) => Object.values(b.report_types).flatMap((seed) => seed.not_tested_reasons.map((r) => r.key))),
  ),
] as [string, ...string[]];

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
 * here: their text resolves through `sectionText`. Story 14.5: a type the version does not
 * ship (the Chave de transferência automática before v5) throws too, naming both.
 */
export function getDefinition(seedVersion: string, reportType: string, blockType: string): BlockDefinition {
  const seed = getSeed(seedVersion, reportType);
  const type = equipmentBlockTypeSchema.safeParse(blockType);
  if (!type.success) throw new Error(`getDefinition: unknown block_type "${blockType}"`);
  const definition = seed.blocks[type.data as EquipmentBlockType];
  if (definition === undefined) throw new Error(`getDefinition: block_type "${blockType}" is not in seed_version "${seedVersion}"`);
  return definition;
}

/**
 * Story 14.5: the equipment block types a seed version ships, in `EQUIPMENT_BLOCK_TYPES`
 * order: the eight on v1 to v4, the eight then the Chave de transferência automática on v5,
 * and on v6 and v7 the Quadro elétrico (QGBT/QD) after it.
 * Every list of types a surface offers reads this, so a relatório or a template never offers
 * a type its own version has no definition of. A version this bundle does not ship answers
 * the eight, which every version holds.
 */
export function equipmentTypesOf(seedVersion: string): readonly EquipmentBlockType[] {
  const known = typesCache.get(seedVersion);
  if (known !== undefined) return known;
  const seed = Object.hasOwn(SEED_VERSIONS, seedVersion) ? SEED_VERSIONS[seedVersion]!.report_types.cabine_primaria : undefined;
  if (seed === undefined) return BASE_EQUIPMENT_BLOCK_TYPES;
  const types = Object.freeze(EQUIPMENT_BLOCK_TYPES.filter((type) => seed.blocks[type] !== undefined));
  typesCache.set(seedVersion, types);
  return types;
}

const typesCache = new Map<string, readonly EquipmentBlockType[]>();

/** Story 14.5: whether `blockType` is a library type of the seed version (offered and printed under "Outros equipamentos"). */
export function isLibraryType(seedVersion: string, blockType: string): boolean {
  return findDefinition(seedVersion, blockType)?.library === true;
}

/**
 * K-20 (full review 2026-09-30): the one non-throwing lookup of a cabine_primaria seed, for
 * the callers that treat a seed version this bundle does not ship as "no seed". Null when the
 * version is unknown.
 */
export function findSeed(seedVersion: string): ReportSeed | null {
  try {
    return getSeed(seedVersion, 'cabine_primaria');
  } catch {
    return null;
  }
}

/**
 * K-20: the one non-throwing `getDefinition` of a cabine_primaria block, for every caller that
 * reads "no definition" as a fallback (a section block, an unknown type or seed version).
 */
export function findDefinition(seedVersion: string, blockType: string): BlockDefinition | null {
  const key = `${seedVersion}\u0000${blockType}`;
  const known = definitionCache.get(key);
  if (known !== undefined) return known;
  try {
    const definition = getDefinition(seedVersion, 'cabine_primaria', blockType);
    // Only a resolved pair is kept: the seeds are frozen and finite, so the cache is bounded.
    definitionCache.set(key, definition);
    return definition;
  } catch {
    return null;
  }
}

const definitionCache = new Map<string, BlockDefinition>();

/**
 * Story 6.6: the recurring-finding chips ("Textos rápidos") of a relatório's seed version.
 * A version that ships none (v1, v2) or is unknown falls back to the current
 * `SEED_VERSION`'s list, so a relatório created before v3 still offers the chips.
 */
export function recurringFindings(seedVersion: string): readonly RecurringFinding[] {
  const own = Object.hasOwn(SEED_VERSIONS, seedVersion) ? SEED_VERSIONS[seedVersion]!.report_types.cabine_primaria.recurring_findings : undefined;
  return own ?? SEED_VERSIONS[SEED_VERSION]!.report_types.cabine_primaria.recurring_findings ?? [];
}

/**
 * Story 14.3: the site checklist ("Verificações do local") of a seed version, or null when the
 * version ships none (v1 to v3) or is unknown. Null means the relatório has no site checklist
 * at all: nothing is shown, counted or printed, and the fold refuses a site item put.
 */
export function siteChecklistOf(seedVersion: string): SiteChecklist | null {
  return findSeed(seedVersion)?.site_checklist ?? null;
}

/** One site item as every reader takes it: flat, with its group and its running number. */
export interface SiteItem {
  key: SiteItemKey;
  label: string;
  /** The key of the group the item sits in (`SiteChecklist.groups[].key`). */
  groupKey: string;
  /** 1-based, running across the groups: the number the surface and the printed table show. */
  number: number;
  nc_phrases: readonly string[];
}

const NO_SITE_ITEMS: readonly SiteItem[] = Object.freeze([]);
const siteItemsCache = new Map<string, readonly SiteItem[]>();

/** The site items of a seed version in order, numbered 1 to N across the groups; none when the version ships no list. */
export function siteItems(seedVersion: string): readonly SiteItem[] {
  const known = siteItemsCache.get(seedVersion);
  if (known !== undefined) return known;
  const list = siteChecklistOf(seedVersion);
  if (list === null) return NO_SITE_ITEMS;
  const items: SiteItem[] = [];
  for (const group of list.groups) {
    for (const item of group.items) items.push({ key: item.key, label: item.label, groupKey: group.key, number: items.length + 1, nc_phrases: item.nc_phrases });
  }
  // Only a resolved version is kept: the seeds are frozen and finite, so the cache is bounded.
  const frozen = deepFreeze(items);
  siteItemsCache.set(seedVersion, frozen);
  return frozen;
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
