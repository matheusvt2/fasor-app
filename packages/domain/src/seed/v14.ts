import type { MeasurementTest } from './measurement.ts';
import type { BlockDefinition, ChecklistItem, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V13 } from './v13.ts';

/*
 * Seed version 14 (Epic 24, Bruno's answers of 2026-11-10 and Matheus's decisions of the same day):
 * seed v13 plus, batch by batch, the keys that change how a new relatório concludes, lists its
 * checks and prints. Every new behaviour is reached through a v14 definition key or a flag of the
 * seed-level `rules` object (`seedRule`), never through a version number, so v1 to v13 read as
 * before in every reader (AD-21); no relatório migrates its seed.
 *
 * Batch e24a's first commit opens v14 equal to v13 (the version only, no `rules`), so the later
 * batches stack on it, each in its own fenced section.
 *
 * Derived from v13 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V13_HASH`).
 */

const v13 = CABINE_PRIMARIA_V13;

// --- the version -------------------------------------------------------------------------------

function cabinePrimariaV14(): ReportSeed {
  const seed = structuredClone(v13);
  withE24aRules(seed);
  // Batch e24s (Stories 24.10 to 24.12), each section after e24a's flags.
  withE24sTpTc(seed);
  withE24sTransformer(seed);
  withE24sQgbtInspection(seed);
  return seed;
}

// --- batch e24a (Stories 24.3 and 24.4): the conclusion and section 10 rule flags ------------------

/**
 * Batch e24a (Story 24.3): a reading out of its criterion, a failed prerequisite or a defect Não
 * ensaiado makes the ficha Reprovado and nothing else, "Com restrições" is the technician's choice
 * (`conclusion_restriction_by_choice`), and the arrester's prerequisite is read only while its
 * nameplate sub-block is on (`prerequisite_needs_nameplate`). Story 24.4: the parecer's Reprovado
 * sentence names each reproved ficha's findings (`parecer_names_finding`), an NC observation typed in
 * several lines enters the conclusion on one line (`nc_clause_on_one_line`) and the fixed "nos itens 8
 * e 9" of a Conclusão text is replaced across its formatted runs (`results_reference_across_runs`).
 * Every flag is read by `seedRule` (`seed/definitions.ts`); `seed.test.ts` strips them (`withoutE24a`).
 */
function withE24aRules(seed: ReportSeed): void {
  seed.rules = {
    ...seed.rules,
    conclusion_restriction_by_choice: true,
    prerequisite_needs_nameplate: true,
    parecer_names_finding: true,
    nc_clause_on_one_line: true,
    results_reference_across_runs: true,
  };
}

// --- batch e24s (Story 24.10): the TP and the TC with their own checklists -------------------------

// authored (e24s, listed for Bruno): the reminder under the TP's FUSÍVEIS, from Bruno's wording (question 18).
const TP_FUSES_HINT = 'ÍNTEGROS E COM ESPECIFICAÇÃO CORRETA';

/** The definition's checklist item `key`; throws when the list lacks it, so a seed change cannot miss it silently. */
function itemOf(definition: BlockDefinition, key: string): ChecklistItem {
  const item = definition.checklist?.find((candidate) => candidate.key === key);
  if (item === undefined) throw new Error(`seed v14: ${definition.block_type} lacks the item ${key}`);
  return item;
}

/**
 * Batch e24s (Story 24.10, Bruno's question 18): the TP keeps its seven items, FUSÍVEIS with a hint
 * (shown on the sheet only; its label and phrases print as before); the TC asks six, without
 * FUSÍVEIS, in the same order (out of its subtypes' `na_defaults` and its oil rule too, where it is
 * named on neither today). Nothing else of either type changes. `seed.test.ts` strips it (`withoutE24s`).
 */
function withE24sTpTc(seed: ReportSeed): void {
  itemOf(seed.blocks.tp, 'fusiveis').hint = TP_FUSES_HINT;
  const tc = seed.blocks.tc;
  itemOf(tc, 'fusiveis');
  tc.checklist = tc.checklist!.filter((item) => item.key !== 'fusiveis');
  for (const subtype of tc.subtypes) {
    subtype.na_defaults = subtype.na_defaults.filter((key) => key !== 'fusiveis');
    if (subtype.na_defaults.length === 0) throw new Error(`seed v14: the TC's subtype ${subtype.key} named FUSÍVEIS only`);
  }
  if (tc.oil_rule !== undefined) tc.oil_rule.items = tc.oil_rule.items.filter((key) => key !== 'fusiveis');
}

// --- batch e24s (Story 24.11): the transformer's oil items and dry items -------------------------

/** Item 5's label on v14: the forced ventilation, a dry item (its key `ventiladores` and phrases kept). */
const VENTILACAO_FORCADA = 'VENTILAÇÃO FORÇADA';

/** Items 15 to 17 of the v14 transformer, appended in this order. */
const TRANSFORMER_ITEMS_E24S: readonly ChecklistItem[] = [
  // authored (e24s, listed for Bruno): the NC phrases of the three new items (labels from Bruno's question 19).
  { key: 'tanque_e_aletas', label: 'TANQUE E ALETAS', nc_phrases: ['pontos de corrosão no tanque', 'vazamento de óleo no tanque ou nas aletas', 'aletas amassadas ou danificadas'] },
  { key: 'limpeza_das_bobinas', label: 'LIMPEZA DAS BOBINAS', nc_phrases: ['acúmulo de poeira nas bobinas', 'canais de ventilação obstruídos', 'presença de umidade nas bobinas'] },
  { key: 'trincas_na_resina', label: 'TRINCAS NA RESINA', nc_phrases: ['trinca na resina da bobina', 'sinais de descarga parcial na resina', 'resina com sinais de aquecimento'] },
];
/** The transformer's oil item of v14 (`oil_rule.items`), and its dry items (`oil_rule.dry_items`), item 5 first. */
const TRANSFORMER_OIL_ITEM_E24S = 'tanque_e_aletas';
const TRANSFORMER_DRY_ITEMS_E24S = ['ventiladores', 'limpeza_das_bobinas', 'trincas_na_resina'];

/**
 * Batch e24s (Story 24.11, Bruno's question 19): the 14 items keep their keys and order; TANQUE E
 * ALETAS (an oil item), LIMPEZA DAS BOBINAS and TRINCAS NA RESINA (dry items) are appended; item 5
 * reads VENTILAÇÃO FORÇADA and becomes a dry item. The oil rule gains the new oil item and
 * `dry_items`, the mirror of `items` (`relatorio/oil-rule.ts`): an oil unit shows them NA, derived
 * and never written, a stored answer wins, a crossing to oil clears them. The dry subtypes' NA
 * defaults are the eight oil items. The oil sampling stays the v13 test.
 */
function withE24sTransformer(seed: ReportSeed): void {
  const transformer = seed.blocks.transformador_forca;
  itemOf(transformer, 'ventiladores').label = VENTILACAO_FORCADA;
  transformer.checklist = [...transformer.checklist!, ...TRANSFORMER_ITEMS_E24S.map((item) => structuredClone(item))];
  const rule = transformer.oil_rule;
  if (rule === undefined) throw new Error('seed v14: the transformador de força lacks its oil rule');
  rule.items = [...rule.items, TRANSFORMER_OIL_ITEM_E24S];
  rule.dry_items = [...TRANSFORMER_DRY_ITEMS_E24S];
  for (const subtype of transformer.subtypes) subtype.na_defaults = [...subtype.na_defaults, TRANSFORMER_OIL_ITEM_E24S] as typeof subtype.na_defaults;
}

// --- batch e24s (Story 24.12): the Inspeção de QGBT's retightening, function test and thermography ---

// authored (e24s, listed for Bruno): the hints of the two new items and the function test's NC phrases (Bruno's question 22).
const REAPERTO_HINT = 'TORQUE CONFORME O FABRICANTE';
const TESTE_DE_FUNCIONAMENTO: ChecklistItem = {
  key: 'teste_de_funcionamento',
  label: 'TESTE DE FUNCIONAMENTO',
  nc_phrases: ['disjuntor não opera no acionamento manual', 'multimedidor inoperante ou com leitura divergente', 'sinalização incoerente com o estado do circuito', 'DPS com indicação de falha'],
  hint: 'ACIONAMENTO MANUAL DOS DISJUNTORES, MULTIMEDIDOR, SINALIZAÇÃO, DPS',
};

/** v13's thermography (Story 23.20) as the eight types carry it, read from v13's TP (not exported by `v13.ts`). */
function termografiaOf(source: ReportSeed): MeasurementTest {
  const test = source.blocks.tp.measurement_tests?.find((candidate) => candidate.key === 'termografia');
  if (test === undefined) throw new Error('seed v14: v13 lacks the thermography');
  return structuredClone(test);
}

/**
 * Batch e24s (Story 24.12, Bruno's question 22): the ten items keep their keys and order; REAPERTO
 * GERAL (the Quadro elétrico's key and phrases, with a hint) and TESTE DE FUNCIONAMENTO (a new key,
 * one item with a hint naming its four parts) are appended; and the type gains the v13 thermography
 * as the eight carry it (switchable and on, applicable while "Equipamento em carga" reads Sim), its
 * sub-block before OBSERVAÇÕES. The Quadro elétrico does not change.
 */
function withE24sQgbtInspection(seed: ReportSeed): void {
  const inspection = seed.blocks.inspecao_qgbt;
  if (inspection === undefined) throw new Error('seed v14: v13 lacks the Inspeção de QGBT');
  const quadro = seed.blocks.quadro_eletrico;
  if (quadro === undefined) throw new Error('seed v14: v13 lacks the Quadro elétrico');
  const reaperto = { ...structuredClone(itemOf(quadro, 'reaperto_geral')), hint: REAPERTO_HINT };
  inspection.checklist = [...inspection.checklist!, reaperto, structuredClone(TESTE_DE_FUNCIONAMENTO)];
  const termografia = termografiaOf(v13);
  const before = inspection.sub_blocks.indexOf('observations');
  if (before < 0) throw new Error('seed v14: the Inspeção de QGBT lacks observations');
  inspection.sub_blocks = [...inspection.sub_blocks.slice(0, before), termografia.key, ...inspection.sub_blocks.slice(before)];
  inspection.measurement_tests = [...(inspection.measurement_tests ?? []), termografia];
}

export const CABINE_PRIMARIA_V14: ReportSeed = cabinePrimariaV14();
