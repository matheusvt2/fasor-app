import type { ItemKey } from '../schemas/block-config.ts';
import type { BlockDefinition, ChecklistItem, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V9 } from './v9.ts';

/*
 * Seed version 10 (Epic 17 wave B; contract 27): seed v9 plus
 *
 * - Story 15.7: the TC leaves the checklist it shared with TP and Transformador de força and
 *   asks its own seven items, Bruno's list (his spreadsheet of 2026-10-15 in `docs/context/`,
 *   never copied here; his answer 8 of 2026-10-27). "VASAMENTO" keeps the spreadsheet's
 *   spelling (Epic 17 confirmation 4) and is the TC's only oil item: the `epoxi` and `a_seco`
 *   subtypes mark it NA by default and the oil rule names it alone. The TC's nameplate,
 *   insulation and ratio tables are v9's.
 *
 * Derived from v9 rather than retyped, so the two differ only by this (`seed.test.ts` pins the
 * difference). Relatórios on v1 to v9 keep their lists.
 */

const v9 = CABINE_PRIMARIA_V9;

/** The TC's one oil item in v10. */
const OIL_ITEM: ItemKey = 'vasamento';

const item = (key: ItemKey, label: string, nc_phrases: string[]): ChecklistItem => ({ key, label, nc_phrases });

/** A v9 item's chips, read by key so the TC offers the phrases the other sheets offer. */
function phrasesOf(checklist: readonly ChecklistItem[] | null, key: ItemKey): string[] {
  const found = (checklist ?? []).find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`seed v10: v9 has no checklist item "${key}"`);
  return [...found.nc_phrases];
}

/** `fusiveis` from the first v9 block whose checklist holds it. */
function firstPhrasesOf(key: ItemKey): string[] {
  const holder = Object.values(v9.blocks).find((definition) => (definition.checklist ?? []).some((candidate) => candidate.key === key));
  return phrasesOf(holder?.checklist ?? null, key);
}

const TC_CHECKLIST_V10: ChecklistItem[] = [
  // authored (Story 15.7, open for Bruno): the phrases of items 1, 2, 6 and 7.
  item('limpeza_pintura_e_corrosao', 'LIMPEZA, PINTURA E CORROSÃO', ['acúmulo de poeira e sujeira', 'pintura descascada', 'pontos de corrosão']),
  item('vasamento', 'VASAMENTO', ['vazamento de óleo pela junta', 'vazamento de óleo pela bucha', 'resíduos de óleo na base']),
  item('fusiveis', 'FUSÍVEIS', firstPhrasesOf('fusiveis')),
  item('aterramento', 'ATERRAMENTO', phrasesOf(v9.blocks.tc.checklist, 'aterramento')),
  item('conexoes', 'CONEXÕES', phrasesOf(v9.blocks.tc.checklist, 'conexoes')),
  // authored (Story 15.7, open for Bruno)
  item('fiacao_secundaria', 'FIAÇÃO SECUNDÁRIA', ['fiação secundária danificada', 'terminal secundário frouxo', 'fiação secundária sem identificação']),
  // authored (Story 15.7, open for Bruno)
  item('buchas', 'BUCHAS', ['trinca na bucha', 'lascamento na bucha', 'sinais de aquecimento na bucha']),
];

function tcV10(definition: BlockDefinition): BlockDefinition {
  return {
    ...definition,
    checklist: TC_CHECKLIST_V10,
    subtypes: definition.subtypes.map((subtype) => ({ ...subtype, na_defaults: [OIL_ITEM] })),
    oil_rule: { ...definition.oil_rule!, items: [OIL_ITEM] },
  };
}

function cabinePrimariaV10(): ReportSeed {
  const seed = structuredClone(v9);
  return { ...seed, blocks: { ...seed.blocks, tc: tcV10(seed.blocks.tc) } };
}

export const CABINE_PRIMARIA_V10: ReportSeed = cabinePrimariaV10();
