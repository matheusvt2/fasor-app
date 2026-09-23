import type { ItemKey } from '../schemas/block-config.ts';
import type {
  BlockDefinition,
  CabineDefinition,
  ChecklistItem,
  ColumnDef,
  FieldDef,
  NotTestedReason,
  ReportSeed,
  SeedWord,
  SubtypeDef,
  TableDef,
  TestDef,
} from './schema.ts';
import { COVER_V1, SECTION_TITLES_V1, SECTIONS_V1 } from './sections-v1.ts';

/*
 * Seed version 1 (AD-21, AR-20): the eight FO.SERV-03 equipment block types, decoded in
 * `addendum.md` §9. FROZEN once merged: `seed.test.ts` pins a content hash of this
 * version, so any edit here fails the suite and has to become `v2.ts` instead, leaving
 * every relatório created under v1 resolving exactly as it did.
 *
 * Labels are verbatim pt-BR from FO.SERV-03 (they are what prints); keys are the ASCII
 * snake_case of the label. The choices made where the sources disagree are recorded in
 * the story spec's "Transcription choices" for the R-009 review.
 */

// --- nameplate fields (addendum §9.1) --------------------------------------

const text = (key: string, label: string): FieldDef => ({ key, label, kind: 'text' });
const number = (key: string, label: string, unit: string): FieldDef => ({ key, label, kind: 'number', unit });
const date = (key: string, label: string): FieldDef => ({ key, label, kind: 'date' });
const select = (key: string, label: string, options: string[]): FieldDef => ({ key, label, kind: 'select', options });

const IDENTIFICACAO = text('identificacao', 'IDENTIFICAÇÃO');
const FABRICACAO: FieldDef = { key: 'fabricacao', label: 'FABRICAÇÃO', kind: 'manufacturer' };
const N_SERIE = text('n_serie', 'Nº SÉRIE');
const TAG = text('tag', 'TAG');
const TIPO = text('tipo', 'TIPO');
const MEIO_DE_EXTINCAO = select('meio_de_extincao', 'MEIO DE EXTINÇÃO', ['AR', 'SF6']);
/** `EPOXI` in some source sheets is normalized to `EPÓXI` (AD-21). */
const TIPO_DE_ISOLACAO = select('tipo_de_isolacao', 'TIPO DE ISOLAÇÃO', ['EPÓXI', 'Á SECO']);
const VOL_OLEO = number('vol_oleo', 'VOL. ÓLEO', 'L');
const TAP_ATUAL = text('tap_atual', 'TAP ATUAL');
const DATA_FABRICACAO = date('data_fabricacao', 'DATA FABRICAÇÃO');
const DATA_DE_FABRICACAO = date('data_de_fabricacao', 'DATA DE FABRICAÇÃO');
const TENSAO_NOMINAL_AT = number('tensao_nominal_at', 'TENSÃO NOMINAL AT', 'kV');
const TENSAO_NOMINAL_BT = number('tensao_nominal_bt', 'TENSÃO NOMINAL BT', 'V');
const LIGACAO_SECUNDARIA = text('ligacao_secundaria', 'LIGAÇÃO SECUNDÁRIA');

const PARA_RAIO_FIELDS: FieldDef[] = [
  FABRICACAO,
  N_SERIE,
  TIPO,
  { key: 'tensao_nominal', label: 'TENSÃO NOMINAL', kind: 'voltage_class', unit: 'kV' },
  number('corrente_nominal', 'CORRENTE NOMINAL', 'kA'),
];

const CHAVE_SECCIONADORA_FIELDS: FieldDef[] = [
  IDENTIFICACAO,
  FABRICACAO,
  N_SERIE,
  TAG,
  TIPO,
  MEIO_DE_EXTINCAO,
  { key: 'tensao_de_placa', label: 'TENSÃO DE PLACA', kind: 'voltage_class', unit: 'kV' },
  number('corrente_nominal', 'CORRENTE NOMINAL', 'A'),
  select('acionamento', 'ACIONAMENTO', ['MANUAL/PUNHO']),
  DATA_DE_FABRICACAO,
];

const DISJUNTOR_MT_FIELDS: FieldDef[] = [
  IDENTIFICACAO,
  FABRICACAO,
  N_SERIE,
  TAG,
  TIPO,
  MEIO_DE_EXTINCAO,
  VOL_OLEO,
  number('corrente_nominal', 'CORRENTE NOMINAL', 'A'),
  number('capacidade_interruptor', 'CAPACIDADE INTERRUPTOR', 'kA'),
  DATA_DE_FABRICACAO,
  { key: 'tensao_nominal', label: 'TENSÃO NOMINAL', kind: 'voltage_class', unit: 'kV' },
  text('aj_bobina', 'AJ. BOBINA'),
  text('aj_rele_50_51', 'AJ. RELÉ 50/51'),
];

/** TP, and the base of TC and Transformador de força (addendum §9.1). */
function instrumentTransformerFields(potenciaUnit: string): FieldDef[] {
  return [
    IDENTIFICACAO,
    FABRICACAO,
    N_SERIE,
    TIPO,
    TIPO_DE_ISOLACAO,
    VOL_OLEO,
    number('potencia_nominal', 'POTÊNCIA NOMINAL', potenciaUnit),
    TAP_ATUAL,
    DATA_FABRICACAO,
    TENSAO_NOMINAL_AT,
    TENSAO_NOMINAL_BT,
    LIGACAO_SECUNDARIA,
  ];
}

const TP_FIELDS = instrumentTransformerFields('VA');
const TC_FIELDS: FieldDef[] = [...instrumentTransformerFields('VA'), text('relacao', 'RELAÇÃO'), text('exatidao', 'EXATIDÃO')];
const TRANSFORMADOR_FORCA_FIELDS = instrumentTransformerFields('kVA');

// --- checklists (addendum §9.2), each item with its NC chip phrases ---------------------
// The NC phrases are domain knowledge, not derived from the reference report; they are
// listed for review in `docs/nc-chip-phrases.md` and freeze with this version.

const item = (key: ItemKey, label: string, nc_phrases: string[]): ChecklistItem => ({ key, label, nc_phrases });

const CONEXOES_PHRASES = ['conexão frouxa', 'oxidação nos terminais', 'sinais de aquecimento na conexão'];
const ISOLADORES_PHRASES = ['trinca no isolador', 'lascamento no isolador', 'sujeira acumulada no isolador'];
const ATERRAMENTO_PHRASES = ['aterramento desconectado', 'cordoalha de aterramento danificada', 'oxidação na conexão de terra'];
const LUBRIFICACAO_PHRASES = ['falta de lubrificação', 'graxa ressecada', 'acúmulo de sujeira'];
const CONTATOS_PHRASES = ['sinais de aquecimento', 'oxidação', 'desgaste'];
const OLEO_NIVEL_PHRASES = ['nível de óleo abaixo do mínimo', 'vazamento de óleo', 'indicador de nível ilegível'];

const CABOS_CHECKLIST: ChecklistItem[] = [
  item('limpeza', 'LIMPEZA', ['acúmulo de poeira e sujeira', 'presença de umidade', 'resíduos de óleo ou graxa']),
  item('mufla', 'MUFLA', [
    'sinais de aquecimento na mufla',
    'trinca ou fissura na mufla',
    'sinais de descarga parcial (trilhamento)',
    'mufla mal fixada',
  ]),
  item('conexoes', 'CONEXÕES', CONEXOES_PHRASES),
  item('aterramento_cordoalhas', 'ATERRAMENTO CORDOALHAS', [
    'cordoalha desconectada',
    'cordoalha rompida ou danificada',
    'oxidação na cordoalha',
  ]),
  item('fixacao', 'FIXAÇÃO', ['cabo sem fixação adequada', 'abraçadeira solta ou ausente', 'cabo apoiado em estrutura metálica']),
];

const PARA_RAIO_CHECKLIST: ChecklistItem[] = [
  item('limpeza', 'LIMPEZA', ['acúmulo de poeira e sujeira no corpo', 'presença de fuligem ou poluição', 'resíduos de umidade']),
  item('isolador', 'ISOLADOR', ['trinca no isolador', 'lascamento no corpo polimérico', 'sinais de trilhamento elétrico']),
  item('contador_de_operacao', 'CONTADOR DE OPERAÇÃO', ['contador danificado', 'contador ausente', 'visor do contador ilegível']),
  item('aterramento', 'ATERRAMENTO', [
    'cabo de aterramento desconectado',
    'oxidação na conexão de terra',
    'cabo de terra danificado',
  ]),
  item('conexoes', 'CONEXÕES', ['conector frouxo', 'oxidação nos conectores', 'sinais de aquecimento na conexão']),
];

const CHAVE_SECCIONADORA_CHECKLIST: ChecklistItem[] = [
  item('abertura_e_fechamento_manual', 'ABERTURA E FECHAMENTO MANUAL', [
    'esforço excessivo na manobra',
    'manobra incompleta',
    'travamento durante a manobra',
  ]),
  item('abertura_e_fechamento_eletrico', 'ABERTURA E FECHAMENTO ELÉTRICO', [
    'não atua no comando elétrico',
    'atuação intermitente',
    'tempo de manobra elevado',
  ]),
  item('mecanismo_de_acionamento', 'MECANISMO DE ACIONAMENTO', [
    'mecanismo com folga',
    'falta de lubrificação no mecanismo',
    'peças desgastadas no mecanismo',
  ]),
  item('intertravamento_eletrico', 'INTERTRAVAMENTO ELÉTRICO', [
    'intertravamento elétrico inoperante',
    'fim de curso desregulado',
    'fiação do intertravamento danificada',
  ]),
  item('intertravamento_mecanico', 'INTERTRAVAMENTO MECÂNICO', [
    'intertravamento mecânico inoperante',
    'trava mecânica desajustada',
    'peça do intertravamento danificada',
  ]),
  item('isoladores', 'ISOLADORES', ISOLADORES_PHRASES),
  item('conexoes', 'CONEXÕES', CONEXOES_PHRASES),
  item('contatos', 'CONTATOS', CONTATOS_PHRASES),
  item('motor', 'MOTOR', ['motor inoperante', 'ruído anormal no motor', 'aquecimento excessivo do motor']),
  item('fusiveis', 'FUSÍVEIS', ['fusível queimado', 'fusível com dimensionamento incorreto', 'base do fusível danificada']),
  item('aterramento', 'ATERRAMENTO', ATERRAMENTO_PHRASES),
  item('simultaneidade', 'SIMULTANEIDADE', [
    'fases sem simultaneidade na abertura',
    'fases sem simultaneidade no fechamento',
    'necessita ajuste das hastes',
  ]),
  item('pintura_corrosao', 'PINTURA, CORROSÃO', ['pontos de corrosão', 'pintura descascada', 'corrosão avançada na estrutura']),
  item('limpeza_e_lubrificacao', 'LIMPEZA E LUBRIFICAÇÃO', LUBRIFICACAO_PHRASES),
];

const DISJUNTOR_MT_CHECKLIST: ChecklistItem[] = [
  item('limpeza_e_lubrificacao', 'LIMPEZA E LUBRIFICAÇÃO', LUBRIFICACAO_PHRASES),
  item('abertura_e_fechamento_eletrico_remoto', 'ABERTURA E FECHAMENTO ELÉTRICO/REMOTO', [
    'não atua no comando remoto',
    'não atua no comando elétrico local',
    'atuação intermitente',
  ]),
  item('abertura_e_fechamento_mecanico', 'ABERTURA E FECHAMENTO MECÂNICO', [
    'não atua no comando mecânico',
    'esforço excessivo no comando mecânico',
    'manobra incompleta',
  ]),
  item('bobinas', 'BOBINAS', [
    'bobina de abertura inoperante',
    'bobina de fechamento inoperante',
    'bobina com sinais de aquecimento',
  ]),
  item('carregamento_manual_de_molas', 'CARREGAMENTO MANUAL DE MOLAS', [
    'mola não carrega manualmente',
    'manivela de carregamento danificada',
    'indicação de mola carregada inoperante',
  ]),
  item('indicador_de_posicao', 'INDICADOR DE POSIÇÃO', [
    'indicador de posição inoperante',
    'indicação divergente do estado real',
    'visor do indicador danificado',
  ]),
  item('camara_de_extincao', 'CÂMARA DE EXTINÇÃO', [
    'sinais de desgaste na câmara',
    'pressão de SF6 abaixo do nominal',
    'sinais de vazamento na câmara',
  ]),
  item('contatos_movel_e_fixo', 'CONTATOS MÓVEL E FIXO', CONTATOS_PHRASES),
  item('isoladores', 'ISOLADORES', ISOLADORES_PHRASES),
  item('cabos_de_controle', 'CABOS DE CONTROLE', [
    'cabo de controle danificado',
    'conexão frouxa no borne',
    'falta de identificação dos cabos',
  ]),
  item('lampadas_de_sinalizacao', 'LÂMPADAS DE SINALIZAÇÃO', [
    'lâmpada queimada',
    'lâmpada ausente',
    'sinalização divergente do estado real',
  ]),
  item('contatos_auxiliares', 'CONTATOS AUXILIARES', [
    'contato auxiliar inoperante',
    'contato auxiliar com mau contato',
    'contato auxiliar desregulado',
  ]),
  item('condicao_geral_dos_mecanismos', 'CONDIÇÃO GERAL DOS MECANISMOS', [
    'mecanismo com folga',
    'peças desgastadas',
    'falta de lubrificação no mecanismo',
  ]),
  item('rele_de_acionamento_secundario_ou_prim', 'RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.', [
    'relé não atua',
    'relé sem ajuste registrado',
    'fiação do relé danificada',
  ]),
  item('oleo_isolante_indicador_de_nivel', 'ÓLEO ISOLANTE/INDICADOR DE NÍVEL', OLEO_NIVEL_PHRASES),
];

/** TP, TC and Transformador de força share this one list (addendum §9.2). */
const TRANSFORMADORES_CHECKLIST: ChecklistItem[] = [
  item('limpeza', 'LIMPEZA', ['acúmulo de poeira e sujeira', 'presença de umidade', 'resíduos de óleo']),
  item('valvula_de_alivio', 'VÁLVULA DE ALÍVIO', [
    'válvula de alívio atuada',
    'vazamento na válvula de alívio',
    'válvula de alívio danificada',
  ]),
  item('elemento_secante', 'ELEMENTO SECANTE', [
    'sílica gel saturada',
    'recipiente do secante danificado',
    'elemento secante ausente',
  ]),
  item('juntas_vedacoes_e_vazamentos', 'JUNTAS, VEDAÇÕES E VAZAMENTOS', [
    'vazamento de óleo pela junta',
    'junta ressecada',
    'vedação danificada',
  ]),
  item('indicador_nivel_de_oleo', 'INDICADOR NÍVEL DE ÓLEO', [
    'nível de óleo abaixo do mínimo',
    'indicador de nível ilegível',
    'indicador de nível danificado',
  ]),
  item('ventiladores', 'VENTILADORES', [
    'ventilador inoperante',
    'ruído anormal no ventilador',
    'ventilador com acúmulo de sujeira',
  ]),
  item('registros_radiadores', 'REGISTROS, RADIADORES', [
    'registro fechado',
    'vazamento no radiador',
    'radiador com amassados ou corrosão',
  ]),
  item('rele_de_gas_funcionamento', 'RELÉ DE GÁS, FUNCIONAMENTO', [
    'relé de gás inoperante',
    'presença de gás no visor do relé',
    'fiação do relé danificada',
  ]),
  item('corrosao_pintura_vibracoes', 'CORROSÃO, PINTURA, VIBRAÇÕES', [
    'pontos de corrosão',
    'pintura descascada',
    'vibração ou ruído anormal',
  ]),
  item('aterramento', 'ATERRAMENTO', ATERRAMENTO_PHRASES),
  item('buchas_primaria_secundarias', 'BUCHAS PRIMÁRIA/SECUNDÁRIAS', [
    'trinca na bucha',
    'lascamento na bucha',
    'sinais de aquecimento na bucha',
  ]),
  item('termometro', 'TERMÔMETRO', [
    'termômetro inoperante',
    'leitura incoerente com a temperatura ambiente',
    'visor do termômetro danificado',
  ]),
  item('oleo_isolante_indicador_de_nivel', 'ÓLEO ISOLANTE/INDICADOR DE NÍVEL', [
    'nível de óleo abaixo do mínimo',
    'óleo com coloração escura',
    'indicador de nível ilegível',
  ]),
  item('conexoes', 'CONEXÕES', CONEXOES_PHRASES),
  item('rele_de_temperatura_externo', 'RELÉ DE TEMPERATURA EXTERNO', [
    'relé de temperatura inoperante',
    'ajuste de alarme ou desligamento ausente',
    'sensor de temperatura danificado',
  ]),
];

// --- subtypes (FR-11) ------------------------------------------------------

/**
 * The oil-related items a dry-type unit marks NA. No source enumerates them; the eight
 * are flagged for the R-009 review.
 */
const OIL_RELATED_ITEMS: ItemKey[] = [
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'termometro',
  'oleo_isolante_indicador_de_nivel',
];

const MANUAL_SUBTYPE: SubtypeDef = { key: 'manual', label: 'MANUAL', na_defaults: ['motor', 'fusiveis'] };
const DRY_SUBTYPES: SubtypeDef[] = [
  { key: 'epoxi', label: 'EPÓXI', na_defaults: OIL_RELATED_ITEMS },
  { key: 'a_seco', label: 'Á SECO', na_defaults: OIL_RELATED_ITEMS },
];

// --- test grammars (addendum §9.3) -----------------------------------------

const column = (label: string, unit: string | null, role: ColumnDef['role'], group?: string): ColumnDef => ({
  label,
  unit,
  role,
  derived: role === 'derived',
  ...(group === undefined ? {} : { group }),
});

const LINHA_TERRA_GUARD = ['LINHA', 'TERRA', 'GUARD'];

/** Single-table insulation: only `1 MINUTO` is captured; the rest print "-" (source-deltas). */
function singleInsulation(rows: string[][], unit: string): TestDef {
  const table: TableDef = {
    key: 'isolacao',
    connection_group: 'PONTO DE ENSAIO/CONEXÃO',
    connection_columns: LINHA_TERRA_GUARD,
    connection_typed: false,
    value_columns: [
      column('30 SEGUNDOS', unit, 'print', 'VALORES'),
      column('1 MINUTO', unit, 'capture', 'VALORES'),
      column('ESTAB./10MIN', unit, 'print', 'VALORES'),
      column('ABSORÇÃO', null, 'print', 'QUALIDADE ISOLAÇÃO'),
      column('POLARIZAÇÃO', null, 'print', 'QUALIDADE ISOLAÇÃO'),
    ],
    capture_column: '1 MINUTO',
    rows,
  };
  return { key: 'isolacao', label: 'ENSAIO DE ISOLAÇÃO', criterion_key: 'isolacao', tables: [table] };
}

const phaseRows = (phases: string[], terra: string): string[][] => phases.map((phase) => [phase, terra, '']);

const CABOS_ROWS = phaseRows(['FASE A', 'FASE B', 'FASE C', 'FASE RESERVA'], 'MASSA/BLIND.');
const PARA_RAIO_ROWS = phaseRows(['FASE A', 'FASE B', 'FASE C', 'FASE RESERVA'], 'MASSA');
const TP_TC_ROWS = phaseRows(['FASE R', 'FASE S', 'FASE T'], 'MASSA');
const TRANSFORMADOR_ROWS = [
  ['PRIMÁRIO', 'MASSA', 'SECUNDÁRIO'],
  ['PRIMÁRIO', 'SECUNDÁRIO', 'MASSA'],
  ['SECUNDÁRIO', 'MASSA', 'PRIMÁRIO'],
];

/** Seccionadoras and disjuntores: open and closed contact, side by side, in GΩ. */
function contactInsulation(equipment: 'SECCIONADORA' | 'DISJUNTOR'): TestDef {
  const valores = [column('VALORES', 'GΩ', 'capture')];
  return {
    key: 'isolacao',
    label: 'ENSAIO DE ISOLAÇÃO',
    criterion_key: 'isolacao',
    tables: [
      {
        key: 'contato_aberto',
        title: `${equipment} CONTATO ABERTO`,
        connection_columns: LINHA_TERRA_GUARD,
        connection_typed: false,
        value_columns: valores,
        capture_column: 'VALORES',
        rows: [
          ['T1', 'T2', 'MASSA'],
          ['T3', 'T4', 'MASSA'],
          ['T5', 'T6', 'MASSA'],
        ],
      },
      {
        key: 'contato_fechado',
        title: `${equipment} CONTATO FECHADO`,
        connection_columns: LINHA_TERRA_GUARD,
        connection_typed: false,
        value_columns: valores,
        capture_column: 'VALORES',
        rows: phaseRows(['FASE A', 'FASE B', 'FASE C'], 'MASSA'),
      },
    ],
  };
}

const CONTACT_RESISTANCE: TestDef = {
  key: 'resistencia_contato',
  label: 'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO',
  criterion_key: 'resistencia_contato',
  tables: [
    {
      key: 'resistencia_contato',
      connection_columns: LINHA_TERRA_GUARD,
      connection_typed: false,
      value_columns: [column('VALORES', 'µΩ', 'capture')],
      capture_column: 'VALORES',
      rows: [
        ['T1-T2', 'FASE A', 'MASSA'],
        ['T3-T4', 'FASE B', 'MASSA'],
        ['T5-T6', 'FASE C', 'MASSA'],
      ],
    },
  ],
};

function ratio(table: Omit<TableDef, 'key' | 'connection_typed'> & { connection_typed?: boolean }): TestDef {
  return {
    key: 'relacao_transformacao',
    label: 'ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO',
    criterion_key: 'relacao_transformacao',
    tables: [{ key: 'relacao_transformacao', connection_typed: false, ...table }],
  };
}

const RST = [['FASE R'], ['FASE S'], ['FASE T']];

const TP_RATIO = ratio({
  connection_columns: ["TP's"],
  value_columns: [
    column('V PRIMÁRIO', 'V', 'input'),
    column('V SECUNDÁRIO', 'V', 'input'),
    column('VAL CALCULADO', null, 'derived'),
    column('H1-H2 / X1-X2', null, 'capture'),
    column('CONDIÇÕES', null, 'derived'),
  ],
  capture_column: 'H1-H2 / X1-X2',
  rows: RST,
});

/** `TPS` is the source's own label on the TC sheet (a copy of the TP sheet), kept verbatim. */
const TC_RATIO = ratio({
  connection_columns: ['TPS'],
  value_columns: [
    column('A PRIMÁRIO', 'A', 'input'),
    column('A SECUNDÁRIO', 'A', 'input'),
    column('VAL CALCULADO', null, 'derived'),
    column('P1-P2 / S1-S2', null, 'capture'),
    column('CONDIÇÕES', null, 'derived'),
  ],
  capture_column: 'P1-P2 / S1-S2',
  rows: RST,
});

/** One default TAP row whose `TAP Nº` is typed; three connections captured per TAP. */
const TRANSFORMADOR_RATIO = ratio({
  connection_columns: ['TAP Nº'],
  connection_typed: true,
  value_columns: [
    column('V PRIMÁRIO', 'kV', 'input'),
    column('V SECUNDÁRIO', 'V', 'input'),
    column('VAL CALCULADO', null, 'derived'),
    column('H1-H3 / X1-X0', null, 'capture'),
    column('H2-H1 / X2-X0', null, 'capture'),
    column('H3-H2 / X3-X0', null, 'capture'),
    column('CONDIÇÕES', null, 'derived'),
  ],
  capture_column: 'H1-H3 / X1-X0',
  rows: [['']],
});

// --- the eight block definitions -------------------------------------------

const SINGLE_TABLE_TAIL = ['checklist', 'isolacao', 'ia_ip_display'] as const;

const BLOCKS: Record<BlockDefinition['block_type'], BlockDefinition> = {
  cabos_entrada: {
    block_type: 'cabos_entrada',
    label: 'Cabos de entrada',
    nameplate: [],
    checklist: CABOS_CHECKLIST,
    tests: [singleInsulation(CABOS_ROWS, 'MΩ')],
    sub_blocks: [...SINGLE_TABLE_TAIL, 'observations', 'conclusion'],
    subtypes: [],
    conclusion: true,
  },
  para_raio: {
    block_type: 'para_raio',
    label: 'Para-raio',
    nameplate: PARA_RAIO_FIELDS,
    checklist: PARA_RAIO_CHECKLIST,
    tests: [singleInsulation(PARA_RAIO_ROWS, 'MΩ')],
    sub_blocks: ['nameplate', ...SINGLE_TABLE_TAIL, 'observations', 'conclusion'],
    subtypes: [],
    conclusion: true,
  },
  chave_seccionadora: {
    block_type: 'chave_seccionadora',
    label: 'Chave seccionadora',
    nameplate: CHAVE_SECCIONADORA_FIELDS,
    checklist: CHAVE_SECCIONADORA_CHECKLIST,
    tests: [contactInsulation('SECCIONADORA'), CONTACT_RESISTANCE],
    sub_blocks: ['nameplate', 'checklist', 'isolacao', 'resistencia_contato', 'observations', 'conclusion'],
    subtypes: [MANUAL_SUBTYPE],
    conclusion: true,
  },
  disjuntor_mt: {
    block_type: 'disjuntor_mt',
    label: 'Disjuntor MT',
    nameplate: DISJUNTOR_MT_FIELDS,
    checklist: DISJUNTOR_MT_CHECKLIST,
    tests: [contactInsulation('DISJUNTOR'), CONTACT_RESISTANCE],
    sub_blocks: ['nameplate', 'checklist', 'isolacao', 'resistencia_contato', 'observations', 'conclusion'],
    subtypes: [],
    conclusion: true,
  },
  tp: {
    block_type: 'tp',
    label: 'TP',
    nameplate: TP_FIELDS,
    checklist: TRANSFORMADORES_CHECKLIST,
    tests: [singleInsulation(TP_TC_ROWS, 'GΩ'), TP_RATIO],
    sub_blocks: ['nameplate', ...SINGLE_TABLE_TAIL, 'relacao_transformacao', 'observations', 'conclusion'],
    subtypes: DRY_SUBTYPES,
    conclusion: true,
  },
  tc: {
    block_type: 'tc',
    label: 'TC',
    nameplate: TC_FIELDS,
    checklist: TRANSFORMADORES_CHECKLIST,
    tests: [singleInsulation(TP_TC_ROWS, 'GΩ'), TC_RATIO],
    sub_blocks: ['nameplate', ...SINGLE_TABLE_TAIL, 'relacao_transformacao', 'observations', 'conclusion'],
    subtypes: DRY_SUBTYPES,
    conclusion: true,
  },
  cabos_saida: {
    block_type: 'cabos_saida',
    label: 'Cabos de saída',
    nameplate: [],
    checklist: CABOS_CHECKLIST,
    tests: [singleInsulation(CABOS_ROWS, 'GΩ')],
    sub_blocks: [...SINGLE_TABLE_TAIL, 'observations', 'conclusion'],
    subtypes: [],
    conclusion: true,
  },
  transformador_forca: {
    block_type: 'transformador_forca',
    label: 'Transformador de força',
    nameplate: TRANSFORMADOR_FORCA_FIELDS,
    checklist: TRANSFORMADORES_CHECKLIST,
    tests: [singleInsulation(TRANSFORMADOR_ROWS, 'GΩ'), TRANSFORMADOR_RATIO],
    sub_blocks: ['nameplate', ...SINGLE_TABLE_TAIL, 'relacao_transformacao', 'observations', 'conclusion'],
    subtypes: DRY_SUBTYPES,
    conclusion: true,
  },
};

// --- the cabine block (`CARACTERÍSTICAS DA SE`, `AMBIENTE DE ENSAIO`) -------------------
// Keys are the location row's own (`location/{id}/se/*`, `location/{id}/env/*`).

const CABINE: CabineDefinition = {
  se: [
    select('type', 'TIPO DE SE', ['SIMPLIFICADA - POSTE', 'ALVENARIA - CONVENCIONAL', 'BLINDADA']),
    number('primary_kv', 'TENSÃO PRIMÁRIA', 'kV'),
    number('secondary_kv', 'TENSÃO SECUNDÁRIA', 'V'),
    number('installed_kva', 'POTÊNCIA INSTALADA', 'kVA'),
  ],
  env: [
    number('altitude_m', 'ALTITUDE', 'm'),
    number('temperature_c', 'TEMPERATURA', '°C'),
    number('humidity_pct', 'UMIDADE RELATIVA DO AR', '%'),
  ],
};

// --- the rest of the seed --------------------------------------------------

/** FR-31: justification text derived from section 8 of the reference report. */
const NOT_TESTED_REASONS: NotTestedReason[] = [
  {
    key: 'impossibilidade_desligamento',
    label: 'Impossibilidade de desligamento',
    justification:
      'Não foi possível realizar os ensaios elétricos devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações.',
  },
  {
    key: 'solicitacao_cliente',
    label: 'Solicitação do cliente',
    justification: 'Os ensaios não foram realizados conforme solicitação do cliente.',
  },
  { key: 'outro', label: 'Outro', justification: null },
];

const word = (name: string, gender: SeedWord['gender'], number: SeedWord['number']): SeedWord => ({ name, gender, number });

/** The activities of the section 7 captions ("Detalhe d⟨o/a⟩ ⟨atividade⟩ realizad⟨o/a⟩(s) ..."). */
const ATIVIDADES: SeedWord[] = [
  word('desligamento e religamento da energia', 'm', 'singular'),
  word('verificação da ausência de tensão', 'f', 'singular'),
  word('instalação do aterramento temporário', 'f', 'singular'),
  word('instalação de bloqueio loto', 'f', 'singular'),
  word('ensaios de resistência de isolação', 'm', 'plural'),
  word('ensaios de relação de transformação', 'm', 'plural'),
  word('ensaios de resistência de contato', 'm', 'plural'),
  word('limpeza e reaperto', 'f', 'singular'),
  word('verificações e limpeza', 'f', 'plural'),
  word('serviços e ensaios', 'm', 'plural'),
];

/** The locations of the section 7 captions ("... n⟨o/a⟩ ⟨equipamento⟩ d⟨o/a⟩ ⟨local⟩"). */
const LOCAIS: SeedWord[] = [
  word('cubículo da Enel', 'm', 'singular'),
  word('subsolo', 'm', 'singular'),
  word('cubículos de Média Tensão', 'm', 'plural'),
  word('Oxigênio', 'm', 'singular'),
  word('cobertura lado A', 'f', 'singular'),
  word('cobertura lado B', 'f', 'singular'),
  word('cubículos de geração', 'm', 'plural'),
  word('QGBT', 'm', 'singular'),
];

/** Sheet-level "Observações rápidas": the standard rain/humidity note of the source sheets. */
const QUICK_NOTES: string[] = [
  'Recomenda-se acompanhar, nas próximas manutenções preventivas, os resultados dos ensaios de resistência de isolamento, a fim de verificar a evolução dos valores obtidos e identificar possíveis anomalias no trecho de alimentação geral da edificação. Ressalta-se que, na data dos ensaios, foram observadas condições climáticas de elevada umidade e ocorrência de chuva, fatores que podem influenciar os resultados das medições.',
];

export const CABINE_PRIMARIA_V1: ReportSeed = {
  blocks: BLOCKS,
  /** The one normalized column order of `VERIFICAÇÕES GERAIS` (addendum §9.2). */
  checklist_columns: ['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES'],
  cabine: CABINE,
  section_titles: SECTION_TITLES_V1,
  sections: SECTIONS_V1,
  cover: COVER_V1,
  not_tested_reasons: NOT_TESTED_REASONS,
  atividades: ATIVIDADES,
  locais: LOCAIS,
  quick_notes: QUICK_NOTES,
};
