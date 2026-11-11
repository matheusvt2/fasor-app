import type { MeasurementTest } from './measurement.ts';
import type { BlockDefinition, ChecklistItem, FieldDef, ReportSeed } from './schema.ts';
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
  withE24pRules(seed);
  // Batch e24s (Stories 24.10 to 24.14), each section after the flags of e24a and e24p.
  withE24sTpTc(seed);
  withE24sTransformer(seed);
  withE24sQgbtInspection(seed);
  withE24sNoBreak(seed);
  withE24sSheetFixes(seed);
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

// --- batch e24p (Stories 24.15 to 24.17): the previous visit's date, the history note, the recommendation as action ---

/**
 * Batch e24p (Story 24.15): the MANUT. ANTERIOR header prints the previous visit's date on a second
 * line, and the printed history texts (an insulation drop, a contact rise, a winding variation) name
 * that date (`previous_visit_date`). Story 24.16: one note line under a readings table names the rows
 * a previous-visit rule flagged, with their reasons and values (`history_note`). Story 24.17: a point
 * of attention written from a test holds the test's recommendation in its action, section 8 keeps an
 * action-plan row whole and spaces a photo reference from the text around it
 * (`recommendation_as_action`). Each flag is read by `seedRule`; `seed.test.ts` strips them
 * (`withoutE24p`). The stored service date, the visit order, the "Anterior" helper's date and the
 * create action apply on every seed and read no flag.
 */
function withE24pRules(seed: ReportSeed): void {
  seed.rules = {
    ...seed.rules,
    previous_visit_date: true,
    history_note: true,
    recommendation_as_action: true,
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

// --- batch e24s (Story 24.13): a new library type, the No-break de comando --------------------------

// authored (e24s, listed for Bruno): the plate's labels from Bruno's list (question 34); the battery bank's fields carry
// "BATERIAS:" in their labels, since a plate has no group of its own.
const NO_BREAK_NAMEPLATE: readonly FieldDef[] = [
  { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
  { key: 'modelo', label: 'MODELO', kind: 'text' },
  { key: 'n_serie', label: 'Nº SÉRIE', kind: 'text', per_unit: true },
  { key: 'potencia_nominal', label: 'POTÊNCIA NOMINAL', kind: 'number', unit: 'VA' },
  { key: 'potencia_ativa', label: 'POTÊNCIA ATIVA', kind: 'number', unit: 'W', optional: true },
  { key: 'tensao_de_entrada', label: 'TENSÃO DE ENTRADA', kind: 'number', unit: 'V' },
  { key: 'tipo_de_entrada', label: 'TIPO DE ENTRADA', kind: 'select', options: ['Vca', 'Vcc'] },
  { key: 'tensao_de_saida', label: 'TENSÃO DE SAÍDA', kind: 'number', unit: 'V' },
  { key: 'tipo_de_saida', label: 'TIPO DE SAÍDA', kind: 'select', options: ['Vca', 'Vcc'] },
  { key: 'frequencia', label: 'FREQUÊNCIA', kind: 'number', unit: 'Hz' },
  { key: 'autonomia_nominal', label: 'AUTONOMIA NOMINAL', kind: 'number', unit: 'min' },
  { key: 'baterias_fabricante', label: 'BATERIAS: FABRICANTE', kind: 'text' },
  { key: 'baterias_modelo', label: 'BATERIAS: MODELO', kind: 'text' },
  { key: 'baterias_tipo', label: 'BATERIAS: TIPO', kind: 'text' },
  { key: 'baterias_quantidade', label: 'BATERIAS: QUANTIDADE', kind: 'number' },
  { key: 'baterias_tensao_por_unidade', label: 'BATERIAS: TENSÃO POR UNIDADE', kind: 'number', unit: 'V' },
  { key: 'baterias_capacidade', label: 'BATERIAS: CAPACIDADE', kind: 'number', unit: 'Ah' },
  { key: 'baterias_data_de_fabricacao_ou_instalacao', label: 'BATERIAS: DATA DE FABRICAÇÃO OU INSTALAÇÃO', kind: 'date' },
];

// authored (e24s, listed for Bruno): the six items (one per group of Bruno's list), their hints and NC phrases.
const NO_BREAK_CHECKLIST: readonly ChecklistItem[] = [
  {
    key: 'limpeza_ventilacao_e_ventiladores',
    label: 'LIMPEZA, VENTILAÇÃO E VENTILADORES',
    nc_phrases: ['acúmulo de poeira no gabinete', 'ventilação obstruída', 'ventilador inoperante ou com ruído anormal'],
  },
  { key: 'display_alarmes_e_leds', label: 'DISPLAY, ALARMES E LEDS', nc_phrases: ['display apagado ou ilegível', 'alarme ativo no painel', 'LED de status indicando falha'] },
  { key: 'reaperto_das_conexoes', label: 'REAPERTO DAS CONEXÕES', nc_phrases: ['conexão frouxa encontrada', 'sinais de aquecimento na conexão', 'terminal oxidado'] },
  {
    key: 'baterias',
    label: 'BATERIAS',
    nc_phrases: ['bateria estufada', 'vazamento de eletrólito', 'oxidação nos bornes da bateria', 'bateria com vida útil vencida'],
    hint: 'ESTUFAMENTO, VAZAMENTO, OXIDAÇÃO NOS BORNES, VIDA ÚTIL',
  },
  { key: 'aterramento_bypass_e_identificacao', label: 'ATERRAMENTO, BYPASS E IDENTIFICAÇÃO', nc_phrases: ['aterramento desconectado', 'chave de bypass inoperante', 'no-break sem identificação'] },
  {
    key: 'cargas_alimentadas_identificadas',
    label: 'CARGAS ALIMENTADAS IDENTIFICADAS',
    nc_phrases: ['cargas alimentadas sem identificação', 'relé sem alimentação do no-break', 'bobina de abertura sem alimentação do no-break'],
    hint: 'RELÉS, BOBINAS DE ABERTURA',
  },
];

/**
 * Batch e24s (Story 24.13, Bruno's question 34): the No-break de comando, a library type offered at a
 * local and printed under "Outros equipamentos" (after the run's other library types, before the Malha):
 * its plate (the unit and its battery bank), six checklist items, OBSERVAÇÕES and the conclusion; no test
 * (Bruno: a later module) and no subtype. The Disjuntor MT's item NO-BREAK DE COMANDO stays.
 */
const NO_BREAK_COMANDO: BlockDefinition = {
  block_type: 'no_break_comando',
  // authored (e24s, listed for Bruno): the type's name on screen and its print title.
  label: 'No-break de comando',
  nameplate: NO_BREAK_NAMEPLATE.map((field) => structuredClone(field)),
  checklist: NO_BREAK_CHECKLIST.map((item) => structuredClone(item)),
  tests: [],
  sub_blocks: ['nameplate', 'checklist', 'observations', 'conclusion'],
  subtypes: [],
  conclusion: true,
  library: true,
  print_title: 'NO-BREAK DE COMANDO',
};

function withE24sNoBreak(seed: ReportSeed): void {
  seed.blocks = { ...seed.blocks, no_break_comando: structuredClone(NO_BREAK_COMANDO) };
}

// --- batch e24s (Story 24.14): the oil sampling's "Outro" text and the ground grid's plate block ---------

/**
 * The oil sampling's text value (a measurement value of kind `text`), shown while Motivo reads "Outro";
 * required while shown, as Motivo is.
 */
const MOTIVO_TEXTO = {
  key: 'motivo_texto',
  // authored (e24s, listed for Bruno).
  label: 'Descreva o motivo',
  kind: 'text' as const,
  when: { value: 'motivo', equals: 'outro' },
};

/**
 * Batch e24s (Story 24.14; the behaviour pass's F10 and F18): `coleta_oleo` of the transformer and of the
 * Disjuntor MT gains the text "Descreva o motivo" under the reason "Outro", printed after the word
 * ("MOTIVO: OUTRO, <texto>"); the Malha de aterramento's first block reads "Dados da malha" and offers no
 * plate photo (`nameplate_title`, `nameplate_photo: false`). Its fields, chips, verdict and print stay.
 */
function withE24sSheetFixes(seed: ReportSeed): void {
  for (const type of ['transformador_forca', 'disjuntor_mt'] as const) {
    const sampling = seed.blocks[type].measurement_tests?.find((test) => test.key === 'coleta_oleo');
    if (sampling === undefined || !(sampling.values ?? []).some((value) => value.key === 'motivo')) throw new Error(`seed v14: ${type} lacks the oil sampling's Motivo`);
    sampling.values = [...sampling.values!, structuredClone(MOTIVO_TEXTO)];
  }
  const malha = seed.blocks.malha_aterramento;
  if (malha === undefined) throw new Error('seed v14: v13 lacks the Malha de aterramento');
  // authored (e24s, listed for Bruno): the title of the grid's first block.
  malha.nameplate_title = 'Dados da malha';
  malha.nameplate_photo = false;
}

export const CABINE_PRIMARIA_V14: ReportSeed = cabinePrimariaV14();
