import type { ItemKey } from '../schemas/block-config.ts';
import type { BandCriterion, BlockDefinition, ChecklistItem, CriterionBands, FieldDef, OilRule, ReportSeed, TestDef } from './schema.ts';
import { CABINE_PRIMARIA_V5 } from './v5.ts';

/*
 * Seed version 6 (AR-20; Stories 14.9 and 14.11, one version for both, contract 21): seed v5 as
 * it shipped, plus
 *
 * - ONE library type, the Quadro elétrico (QGBT/QD), the "Quadros Elétricos" sheet of the
 *   FO.SERV-03 complement Bruno sent (`docs/context/FO.SERV-03 Relatórios-Complemento.xlsx`,
 *   git-ignored; labels verbatim as they print), on the seeded nameplate, checklist and
 *   single-table insulation grammars, its criterion picked from its TENSÃO NOMINAL by the NBR
 *   5410 bands (Bruno 2026-10-20);
 * - ÓLEO in TIPO DE ISOLAÇÃO on Transformador de força, TP and TC, and VÁCUO, ÓLEO (PVO) and
 *   ÓLEO (GVO) in the Disjuntor MT's MEIO DE EXTINÇÃO (the seccionadora keeps AR and SF6);
 * - the oil rule on those four types (`relatorio/oil-rule.ts`).
 *
 * Derived from v5 rather than retyped, so the two differ only by these (`seed.test.ts` pins the
 * difference). It freezes at the first production deploy after both stories merged; a later
 * change is a new version.
 */

const v5 = CABINE_PRIMARIA_V5;

// --- Story 14.11: the option lists and the oil rule ------------------------------------------

/** TIPO DE ISOLAÇÃO on the three transformers (Bruno 2026-10-20 answer 3): the v1 order, then ÓLEO. */
const TIPO_DE_ISOLACAO_OPTIONS = ['EPÓXI', 'Á SECO', 'ÓLEO'];
/** The value of TIPO DE ISOLAÇÃO that is oil. */
const INSULATION_OIL = ['ÓLEO'];

// authored: VÁCUO, ÓLEO (PVO) and ÓLEO (GVO) (Bruno 2026-10-20 answer 2 and follow-up 5). AR stays
// because v1 to v5 values hold it.
/** The Disjuntor MT's MEIO DE EXTINÇÃO on v6. */
const MEIO_DE_EXTINCAO_DISJUNTOR = ['AR', 'SF6', 'VÁCUO', 'ÓLEO (PVO)', 'ÓLEO (GVO)'];
/** Both ÓLEO values are oil. */
const MEDIUM_OIL = ['ÓLEO (PVO)', 'ÓLEO (GVO)'];

/** VOL. ÓLEO: the one oil field, on the three transformers and the disjuntor. */
const OIL_FIELDS = ['vol_oleo'];

/** The definition with one select field's options replaced. */
function withOptions(definition: BlockDefinition, fieldKey: string, options: string[]): BlockDefinition {
  return { ...definition, nameplate: definition.nameplate.map((field) => (field.key === fieldKey ? { ...field, options } : field)) };
}

/**
 * The oil items of a transformer: its dry subtype's NA defaults (the eight oil-related items of
 * v1, `OIL_RELATED_ITEMS`), in checklist order, so the rule names no second list.
 */
function transformerOilItems(definition: BlockDefinition): ItemKey[] {
  const dry = new Set<string>(definition.subtypes.find((subtype) => subtype.key === 'epoxi')!.na_defaults);
  return definition.checklist!.filter((item) => dry.has(item.key)).map((item) => item.key);
}

function oilTransformer(definition: BlockDefinition): BlockDefinition {
  const oil_rule: OilRule = { field: 'tipo_de_isolacao', oil_values: INSULATION_OIL, items: transformerOilItems(definition), fields: OIL_FIELDS };
  return { ...withOptions(definition, 'tipo_de_isolacao', TIPO_DE_ISOLACAO_OPTIONS), oil_rule };
}

function oilDisjuntor(definition: BlockDefinition): BlockDefinition {
  const oil_rule: OilRule = { field: 'meio_de_extincao', oil_values: MEDIUM_OIL, items: ['oleo_isolante_indicador_de_nivel'], fields: OIL_FIELDS };
  return { ...withOptions(definition, 'meio_de_extincao', MEIO_DE_EXTINCAO_DISJUNTOR), oil_rule };
}

// --- Story 14.9: the Quadro elétrico (QGBT/QD) -----------------------------------------------

const text = (key: string, label: string): FieldDef => ({ key, label, kind: 'text' });
const number = (key: string, label: string, unit: string): FieldDef => ({ key, label, kind: 'number', unit });

// authored: the IP codes, from IEC 60529's common values (Bruno 2026-10-20 answer 3, accepted in follow-up 2).
const IP_CODES = ['IP20', 'IP30', 'IP31', 'IP40', 'IP41', 'IP42', 'IP43', 'IP44', 'IP54', 'IP55', 'IP65', 'IP66'];

/** The SELV/PELV mark's options: SIM picks the SELV criterion. */
const SIM_NAO = ['SIM', 'NÃO'];

/**
 * DADOS DO EQUIPAMENTO: the 9 fields of the original sheet, in its order (FABRICANTE the maker's
 * name, kind `manufacturer`, Bruno follow-up 4), then the SELV/PELV mark. The identity fields of
 * one physical unit are the seccionadora's own definitions, as seed v2 flagged them.
 */
function quadroNameplate(): FieldDef[] {
  const seccionadora = v5.blocks.chave_seccionadora.nameplate;
  const same = (key: string): FieldDef => structuredClone(seccionadora.find((field) => field.key === key)!);
  return [
    same('identificacao'),
    { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
    same('n_serie'),
    text('tipo', 'TIPO'),
    text('tipo_de_isolacao', 'TIPO DE ISOLAÇÃO'),
    same('data_de_fabricacao'),
    number('corrente_de_curto', 'CORRENTE DE CURTO', 'kA'),
    number('tensao_nominal', 'TENSÃO NOMINAL', 'V'),
    { key: 'ip', label: 'IP', kind: 'select', options: IP_CODES },
    // authored: the mark of a SELV or PELV circuit (the spec's conservative reading of Matheus's open question).
    { key: 'circuito_selv_pelv', label: 'Circuito SELV/PELV', kind: 'select', options: SIM_NAO, optional: true },
  ];
}

const item = (key: ItemKey, label: string, nc_phrases: string[], hint?: string): ChecklistItem =>
  hint === undefined ? { key, label, nc_phrases } : { key, label, nc_phrases, hint };

// The NC phrases are the reviewed list of `docs/nc-chip-phrases.md`, "Quadros elétricos"
// (authored, accepted by Bruno 2026-10-20). The hints of items 8 and 16 are the original's own.
const QUADRO_CHECKLIST: ChecklistItem[] = [
  item('limpeza_interna_e_externa', 'LIMPEZA INTERNA E EXTERNA', ['acúmulo de poeira e sujeira', 'presença de umidade', 'resíduos no interior do quadro']),
  item('pintura_corrosao_da_caixa', 'PINTURA, CORROSÃO DA CAIXA', ['pontos de corrosão na caixa', 'pintura descascada', 'caixa amassada ou danificada']),
  item('resistencia_de_aquecimento', 'RESISTÊNCIA DE AQUECIMENTO', ['resistência de aquecimento inoperante', 'termostato desajustado', 'resistência ausente']),
  item('iluminacao_interna', 'ILUMINAÇÃO INTERNA', ['iluminação interna inoperante', 'lâmpada queimada', 'interruptor de porta danificado']),
  item('lampadas_de_sinalizacao', 'LÂMPADAS DE SINALIZAÇÃO', [
    'lâmpada de sinalização queimada',
    'sinalização incoerente com o estado do circuito',
    'lente danificada ou ausente',
  ]),
  item('reles_e_contatores', 'RELÉS E CONTATORES', ['relé ou contator inoperante', 'contatos com sinais de desgaste', 'ruído anormal no contator']),
  item('fusiveis', 'FUSÍVEIS', ['fusível queimado', 'fusível com capacidade divergente', 'porta-fusível danificado']),
  item(
    'disjuntores_termomagneticos',
    'DISJUNTORES TERMOMAGNÉTICOS',
    ['disjuntor não liga ou não desliga', 'disjuntor não atua no trip', 'sinais de aquecimento no disjuntor'],
    'FUNCIONAMENTO MECÂNICO (LIGA/DESLIGA/TRIP)',
  ),
  item('aterramento', 'ATERRAMENTO', ['aterramento desconectado', 'cordoalha de aterramento danificada', 'oxidação na conexão de terra']),
  item('instrumentos_de_medicao', 'INSTRUMENTOS DE MEDIÇÃO', [
    'instrumento inoperante',
    'leitura divergente do instrumento de referência',
    'visor do instrumento danificado',
  ]),
  item('barramentos', 'BARRAMENTOS', ['sinais de aquecimento no barramento', 'oxidação no barramento', 'barramento sem proteção contra contato']),
  item('isoladores', 'ISOLADORES', ['trinca no isolador', 'sujeira acumulada no isolador', 'sinais de descarga no isolador']),
  item('fiacao_interna', 'FIAÇÃO INTERNA', ['isolação da fiação danificada', 'sinais de aquecimento na fiação', 'fiação sem fixação adequada']),
  item('reaperto_geral', 'REAPERTO GERAL', ['conexão frouxa encontrada', 'sinais de aquecimento na conexão', 'terminal oxidado']),
  item('placas_de_sinalizacao', 'PLACAS DE SINALIZAÇÃO', ['placa de sinalização ausente', 'placa ilegível', 'placa sem advertência de risco elétrico']),
  item('organizacao_interna', 'ORGANIZAÇÃO INTERNA', ['cabos fora da canaleta', 'canaleta sem tampa', 'chicote desorganizado'], 'CANALETA, CHICOTE, CABOS...'),
  item('identificacao_de_circuitos', 'IDENTIFICAÇÃO DE CIRCUITOS', ['circuitos sem identificação', 'identificação ilegível', 'identificação divergente do diagrama']),
];

/** NBR 5410's minimum insulation by the circuit's nominal voltage (Bruno 2026-10-20, follow-up 3). */
const NBR_5410 = { name: 'NBR 5410', edition: null };
const minimum = (value: number): BandCriterion => ({ operator: '>=', value, unit: 'MΩ', source: NBR_5410 });

const QUADRO_BANDS: CriterionBands = {
  field: 'tensao_nominal',
  selv_field: 'circuito_selv_pelv',
  selv: minimum(0.25),
  bands: [
    { up_to: 500, ...minimum(0.5) },
    { up_to: 1000, ...minimum(1.0) },
  ],
};

/**
 * ENSAIO DE ISOLAÇÃO: the para-raio's single-table insulation (LINHA · TERRA · GUARD, MΩ, only
 * 1 MINUTO captured) with one row per phase and the neutral against MASSA (Bruno follow-up 1;
 * the label NEUTRO authored), judged by the bands.
 */
function quadroInsulation(): TestDef {
  const base = structuredClone(v5.blocks.para_raio.tests.find((test) => test.key === 'isolacao')!);
  const rows = ['FASE A', 'FASE B', 'FASE C', 'NEUTRO'].map((phase) => [phase, 'MASSA', '']);
  return { ...base, tables: base.tables.map((table) => ({ ...table, rows })), criterion_bands: QUADRO_BANDS };
}

/** The Quadro elétrico (QGBT/QD): a library type on the seeded grammars, one sheet per board. */
const QUADRO_ELETRICO: BlockDefinition = {
  block_type: 'quadro_eletrico',
  // authored: the type's name on screen (Bruno 2026-10-20 answer 5).
  label: 'Quadro elétrico (QGBT/QD)',
  nameplate: quadroNameplate(),
  checklist: QUADRO_CHECKLIST,
  tests: [quadroInsulation()],
  sub_blocks: ['nameplate', 'checklist', 'isolacao', 'ia_ip_display', 'observations', 'conclusion'],
  subtypes: [],
  conclusion: true,
  library: true,
  print_title: "QGBT/QD's",
};

function cabinePrimariaV6(): ReportSeed {
  const seed = structuredClone(v5);
  const blocks = seed.blocks;
  return {
    ...seed,
    blocks: {
      ...blocks,
      disjuntor_mt: oilDisjuntor(blocks.disjuntor_mt),
      tp: oilTransformer(blocks.tp),
      tc: oilTransformer(blocks.tc),
      transformador_forca: oilTransformer(blocks.transformador_forca),
      quadro_eletrico: QUADRO_ELETRICO,
    },
  };
}

export const CABINE_PRIMARIA_V6: ReportSeed = cabinePrimariaV6();
