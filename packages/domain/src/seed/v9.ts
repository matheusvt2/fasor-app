import type { ItemKey } from '../schemas/block-config.ts';
import type { BlockDefinition, ChecklistItem, ReportSeed, SiteChecklist, SiteItemDef, TestDef } from './schema.ts';
import { CABINE_PRIMARIA_V8 } from './v8.ts';

/*
 * Seed version 9 (Epic 15, Bruno's "Melhorias produto" of 2026-10-22; contract 25): seed v8 plus
 *
 * - Story 15.3: the checklist TP, TC and Transformador de força share asks about the oil level
 *   once. Item 5 `indicador_nivel_de_oleo` (INDICADOR NÍVEL DE ÓLEO) leaves it; item 13
 *   `oleo_isolante_indicador_de_nivel` (ÓLEO ISOLANTE/INDICADOR DE NÍVEL) stays and absorbs item
 *   5's chip "indicador de nível danificado". The dry subtypes' NA defaults and the oil rule's
 *   items drop the key with it, so they hold seven items. The TC's nameplate loses POTÊNCIA
 *   NOMINAL (a TC has none; TP and Transformador de força keep theirs). The local's "Verificações
 *   do local" gains two items at the end of Ambiente, "Grades e portas: estado e fixação" and
 *   "Pintura e corrosão" (items 20 and 21).
 * - Story 15.6: the transformador de força's ratio table computes VAL CALCULADO as U1 · √3 / U2
 *   (`ratio_factor: 'sqrt3'`), fixed, whatever its LIGAÇÃO SECUNDÁRIA; TP and TC keep U1/U2.
 *
 * Derived from v8 rather than retyped, so the two differ only by these (`seed.test.ts` pins the
 * difference). Relatórios on v1 to v8 keep their lists, fields and ratio.
 */

const v8 = CABINE_PRIMARIA_V8;

// --- Story 15.3: one oil-level item on the three transformers -----------------------------------

/** The item that leaves the shared transformer checklist. */
const DROPPED_ITEM: ItemKey = 'indicador_nivel_de_oleo';
/** The item that stays and asks about the oil level. */
const OIL_LEVEL_ITEM: ItemKey = 'oleo_isolante_indicador_de_nivel';
/** The dropped item's one chip the kept item did not carry (it has the other two). */
const ABSORBED_PHRASE = 'indicador de nível danificado';

/** The nameplate field that leaves the TC. */
const TC_DROPPED_FIELD = 'potencia_nominal';

function transformerChecklist(checklist: ChecklistItem[]): ChecklistItem[] {
  return checklist
    .filter((item) => item.key !== DROPPED_ITEM)
    .map((item) => (item.key === OIL_LEVEL_ITEM ? { ...item, nc_phrases: [...item.nc_phrases, ABSORBED_PHRASE] } : item));
}

/** The oil items: the epoxi subtype's NA defaults in checklist order (v6's derivation). */
function oilItems(definition: BlockDefinition): ItemKey[] {
  const dry = new Set<string>(definition.subtypes.find((subtype) => subtype.key === 'epoxi')!.na_defaults);
  return definition.checklist!.filter((item) => dry.has(item.key)).map((item) => item.key);
}

function transformerV9(definition: BlockDefinition): BlockDefinition {
  const shaped: BlockDefinition = {
    ...definition,
    checklist: transformerChecklist(definition.checklist!),
    subtypes: definition.subtypes.map((subtype) => ({ ...subtype, na_defaults: subtype.na_defaults.filter((key) => key !== DROPPED_ITEM) })),
  };
  return { ...shaped, oil_rule: { ...definition.oil_rule!, items: oilItems(shaped) } };
}

function tcV9(definition: BlockDefinition): BlockDefinition {
  const transformer = transformerV9(definition);
  return { ...transformer, nameplate: transformer.nameplate.filter((field) => field.key !== TC_DROPPED_FIELD) };
}

// --- Story 15.6: the transformer ratio with √3 --------------------------------------------------

function transformadorForcaV9(definition: BlockDefinition): BlockDefinition {
  const transformer = transformerV9(definition);
  const tests = transformer.tests.map((test): TestDef =>
    test.key === 'relacao_transformacao' ? { ...test, tables: test.tables.map((table) => ({ ...table, ratio_factor: 'sqrt3' as const })) } : test,
  );
  return { ...transformer, tests };
}

// --- Story 15.3: two site items at the end of Ambiente ------------------------------------------

const site = (key: SiteItemDef['key'], label: string, nc_phrases: string[]): SiteItemDef => ({ key, label, nc_phrases });

// authored: both labels and their phrases, pending Bruno's review (2026-10-22 defaults, Epic 15).
const SITE_ITEMS_V9: SiteItemDef[] = [
  site('grades_e_portas_estado_e_fixacao', 'Grades e portas: estado e fixação', [
    'Grade ou porta danificada',
    'Grade ou porta solta ou mal fixada',
    'Dobradiças, trincos ou fechos corroídos',
  ]),
  site('pintura_e_corrosao', 'Pintura e corrosão', [
    'Pintura descascada ou desgastada',
    'Pontos de corrosão em estruturas metálicas',
    'Corrosão em suportes ou ferragens',
  ]),
];

function siteChecklistV9(checklist: SiteChecklist): SiteChecklist {
  return { groups: checklist.groups.map((group) => (group.key === 'ambiente' ? { ...group, items: [...group.items, ...SITE_ITEMS_V9] } : group)) };
}

function cabinePrimariaV9(): ReportSeed {
  const seed = structuredClone(v8);
  const blocks = seed.blocks;
  return {
    ...seed,
    blocks: {
      ...blocks,
      tp: transformerV9(blocks.tp),
      tc: tcV9(blocks.tc),
      transformador_forca: transformadorForcaV9(blocks.transformador_forca),
    },
    site_checklist: siteChecklistV9(seed.site_checklist!),
  };
}

export const CABINE_PRIMARIA_V9: ReportSeed = cabinePrimariaV9();
