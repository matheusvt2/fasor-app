/*
 * Story 3.7: typed transcription of the delivered FO.SERV-03 ("Porto Seguro" job), read
 * directly from the FO.SERV-03 document under `docs/context/` (gitignored; the delivered
 * file's own name still carries the older document word AGENTS.md retires -- "relatorio" is
 * the only spelling used anywhere in this fixture, per that policy), converted to PNG pages
 * in the `tools` container and read visually -- the 94 section-9 sheets are EMF pictures, not
 * live tables -- and from
 * `_bmad-output/planning-artifacts/prds/prd-fasor-2026-09-19/.working/extract-raw-sources.md`
 * §1-2. Real client data (AGENTS.md waiver R-023): kept only under this fixture's own path.
 *
 * `op-log.ts` zips this data 1:1, in order, against `standardTemplate(...)`'s own equipment
 * blocks (the exact 94-block skeleton/shape this fixture reproduces), so the arrays below are
 * ordered exactly as `standardTemplate` declares its blocks: per cabine, in the cabine's own
 * `blocks` array order (`template.ts`), and per 1° Subsolo column, in that column's
 * `SUBSOLO_COLUMNS[n]` placement order.
 *
 * Two corrections to the planning extract, found by reading the actual DOCX pages (recorded
 * for the R-009-style review, not a deferred-work item — this is the primary source itself):
 *  - `extract-raw-sources.md` §2.1 claims "zero C/NC/NA marks across all 94 sheets"; the
 *    delivered document actually carries real checkmarks throughout (C on every applicable
 *    item, NA on the fixed per-type set below). This fixture reproduces the real marks.
 *  - Section 8 bullet 4 names "algumas seccionadoras específicas" and "o disjuntor TIE" as
 *    not tested, but every one of the 94 sheets (including both "DISJUNTOR DE ACOPLAMENTO"
 *    bus-tie breakers, 1° Subsolo colunas 3 and 16) carries full, real measured values with no
 *    blank sheet anywhere. Since the acceptance criteria require the fixture to carry this
 *    documented not-tested condition (FR-22, FR-68, NFR-17), this fixture designates the
 *    clearest real match for "disjuntor TIE" (1° Subsolo Coluna 3's first "DISJUNTOR DE
 *    ACOPLAMENTO - REDE 1") and two seccionadora instances (1° Subsolo Coluna 1 and Coluna 17,
 *    the two single-quantity end columns, the source giving no more specific identification)
 *    as not_tested, overriding their real sheet data with `not_tested`. Logged in
 *    `_bmad-output/implementation-artifacts/deferred-work.md` for Matheus's review.
 *
 * The checklist mark pattern is uniform per block type across every one of the 94 sheets read
 * (matching Bruno's own words, "os itens de verificação são sempre os mesmos"), so it is
 * computed once in `op-log.ts` from `NA_ITEMS_BY_TYPE` below rather than repeated per instance.
 */

import type { EquipmentBlockType, ItemKey } from '../../src/schemas/block-config.ts';

/** One equipment sheet's real, per-instance data (nameplate values plus test-cell values). */
export interface Instance {
  /** `sheet/nameplate/{field_key}` values, seed field keys verbatim; omit a field the sheet leaves blank ("-"). */
  np?: Record<string, string>;
  /** `equipment/{id}/tag`; falls back to the sheet's own TAG or a generated label when the sheet has none. */
  tag?: string;
  /** Single-table insulation (cabos, para-raio, TP, TC, transformador): the `1 MINUTO` reading per row, in row order; `null` = not measured. */
  isoRows?: readonly (string | null)[];
  /** Contact-form insulation (chave, disjuntor): one GΩ triple, reused for both the aberto and fechado tables (as printed). */
  contact?: readonly [string, string, string];
  /** `ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO`, µΩ triple (chave, disjuntor). */
  rc?: readonly [string, string, string];
  /** `ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO` (TP, TC, transformador). */
  ratio?: { p: string; s: string; cap: readonly string[] };
  /** Free-text `OBSERVAÇÕES`, when the sheet carries one. */
  obs?: string;
  /** `CONCLUSÃO` restriction axis; sheets without this flag print `sem_restricoes`. */
  restr?: 'com_restricoes';
  /** The 8 `TRANSFORMADOR DE FORÇA` sheets are cropped after the ratio table: no OBSERVAÇÕES/CONCLUSÃO in the source. */
  noConcl?: boolean;
  /** Section 8 bullet 4 (see file header): overrides all test/checklist data with `not_tested`. */
  notTested?: boolean;
}

/** FR-11 NA sets, uniform per block type across every one of the 94 real sheets read. */
export const NA_ITEMS_BY_TYPE: Partial<Record<EquipmentBlockType, readonly ItemKey[]>> = {
  chave_seccionadora: ['abertura_e_fechamento_eletrico', 'intertravamento_eletrico', 'motor', 'fusiveis'],
  disjuntor_mt: ['oleo_isolante_indicador_de_nivel'],
  para_raio: ['contador_de_operacao'],
  tp: [
    'valvula_de_alivio',
    'elemento_secante',
    'juntas_vedacoes_e_vazamentos',
    'indicador_nivel_de_oleo',
    'ventiladores',
    'registros_radiadores',
    'rele_de_gas_funcionamento',
    'termometro',
    'oleo_isolante_indicador_de_nivel',
    'rele_de_temperatura_externo',
  ],
  tc: [
    'valvula_de_alivio',
    'elemento_secante',
    'juntas_vedacoes_e_vazamentos',
    'indicador_nivel_de_oleo',
    'ventiladores',
    'registros_radiadores',
    'rele_de_gas_funcionamento',
    'termometro',
    'oleo_isolante_indicador_de_nivel',
    'rele_de_temperatura_externo',
  ],
  transformador_forca: [
    'valvula_de_alivio',
    'elemento_secante',
    'juntas_vedacoes_e_vazamentos',
    'indicador_nivel_de_oleo',
    'ventiladores',
    'registros_radiadores',
    'rele_de_gas_funcionamento',
    'termometro',
    'oleo_isolante_indicador_de_nivel',
    'rele_de_temperatura_externo',
  ],
  cabos_entrada: [],
  cabos_saida: [],
};

// --- Cover / project identity (waiver R-023) --------------------------------------------

export const COVER = {
  cliente: 'Porto Seguro Companhia de Seguros Gerais',
  /** No CNPJ is printed anywhere in the delivered document (cover checked directly; not a
   *  transcription miss) — logged in deferred-work.md; kept null rather than invented. */
  cnpj: null as string | null,
  obra: 'São Paulo/SP',
  datas: '06, 07 e 08 de setembro de 2026',
  escopo: 'Manutenção Preventiva nas Cabines Primárias',
  responsavel: 'Rafael Lamonde',
  responsavelCompleto: 'Rafael Lamonde Mendes',
  crea: 'SP Nº: 5063583141',
  empresaExecutora: 'Fasor Engenharia',
  art: 'ART_2620262602583',
};

// --- Instrument registry (Code Map: Bruno's own verbal codes) ---------------------------

export const INSTRUMENTS = {
  megohmetro: {
    code: '2E',
    name: 'Megôhmetro Digital',
    manufacturer: 'Instrument',
    model: 'DMG10Ki',
    serial: 'IN919021-25945',
    certNumber: '37428/26',
    testParameter: 'Resistência de isolação',
    defaultRaw: '10',
    defaultUnit: 'kV',
  },
  microhmetro: {
    code: '3M',
    name: 'Micro-Ohmmeter',
    manufacturer: 'Hi-Tech',
    model: 'HTMO-10',
    serial: 'G282926',
    certNumber: '37276/26',
    testParameter: 'Resistência ôhmica de contato',
    defaultRaw: '10',
    defaultUnit: 'A',
  },
  ratiometro: {
    code: '1T',
    name: 'Transformer Ratiometer',
    manufacturer: 'Hi-Tech',
    model: 'HTRT-8K',
    serial: 'F277226',
    certNumber: '37274/26',
    testParameter: 'Relação de transformação',
    defaultRaw: null as string | null,
    defaultUnit: null as string | null,
  },
} as const;

// --- Section 8 (verbatim bullets 1, 2, 3, 5; bullet 4 drives the not-tested wiring) ------

export const SECTION_8_POINTS = [
  'As duas cabines (Primária e Transformação) deverão passar por processo de identificação via plaquetas de segurança: Função da Cabine, Tensão, Potência, Função dos Transformadores, etc.',
  'Emoldurar e pendurar nas cabines primária e de transformação diagrama unifilar atualizado (faz parte do PIE).',
  'Recomenda-se o acompanhamento nas próximas manutenções preventivas os resultados dos ensaios de resistência de isolação dos cabos de alimentação e dos para-raios, uma vez que ambos apresentaram valores inferiores ao valor de referência de 400 MΩ. Ressalta-se que os ensaios foram realizados em condições climáticas de chuva e elevada umidade, fatores que podem influenciar negativamente os resultados dos ensaios de resistência de isolamento.',
  'Conforme orientação do cliente, não foram realizados os serviços de reaperto das conexões e limpeza interna nos QGBT’s das Torres A e B, em razão da impossibilidade de desenergização dos equipamentos e da necessidade de continuidade operacional da edificação. Ressalta-se que, conforme informado pelo cliente, os QGBT’s foram submetidos previamente à inspeção termográfica por empresa terceira, não tendo sido identificados pontos de anomalia térmica.',
] as const;

export const NOT_TESTED_REASON = 'Solicitação do cliente';
const NOT_TESTED_BULLET =
  'Não foi possível realizar os ensaios elétricos em algumas seccionadoras específicas e no disjuntor TIE, responsável pela interligação dos barramentos de média tensão, devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações, conforme solicitação do cliente. Recomenda-se que os ensaios pendentes sejam programados e realizados na próxima intervenção.';

export const notTestedText = (subject: string): string =>
  `Não foi possível realizar os ensaios elétricos n${subject} devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações, conforme solicitação do cliente. Recomenda-se que os ensaios pendentes sejam programados e realizados na próxima intervenção.`;

export const NOT_TESTED_BULLET_FULL = NOT_TESTED_BULLET;

/** The standard rain/humidity note (`seed/v1.ts` `QUICK_NOTES[0]`), verbatim on the sheets that carry it. */
export const QUICK_NOTE =
  'Recomenda-se acompanhar, nas próximas manutenções preventivas, os resultados dos ensaios de resistência de isolamento, a fim de verificar a evolução dos valores obtidos e identificar possíveis anomalias no trecho de alimentação geral da edificação. Ressalta-se que, na data dos ensaios, foram observadas condições climáticas de elevada umidade e ocorrência de chuva, fatores que podem influenciar os resultados das medições.';

// --- Location (cabine) data --------------------------------------------------------------

export interface CabineData {
  type: string;
  primaryKv: string;
  secondaryKv: string | null;
  installedKva: string;
  altitude: string;
  temperature: string;
  humidity: string;
}

export const CABINE_DATA: Record<string, CabineData> = {
  enel: { type: 'BLINDADA', primaryKv: '13.8', secondaryKv: null, installedKva: '10', altitude: '<1000', temperature: '19', humidity: '67' },
  oxigenio: {
    type: 'ALVENARIA - CONVENCIONAL',
    primaryKv: '13.8',
    secondaryKv: '380/220',
    installedKva: '300',
    altitude: '<1000',
    temperature: '19',
    humidity: '67',
  },
  'cobertura-a': {
    type: 'ALVENARIA - CONVENCIONAL',
    primaryKv: '13.8',
    secondaryKv: '380/220',
    installedKva: '1250',
    altitude: '<1000',
    temperature: '19',
    humidity: '67',
  },
  'cobertura-b': {
    type: 'ALVENARIA - CONVENCIONAL',
    primaryKv: '13.8',
    secondaryKv: '380/220',
    installedKva: '1250',
    altitude: '<1000',
    temperature: '19',
    humidity: '67',
  },
};

// --- 9.1 Cubículo Enel (9 blocks, `template.ts` CABINES[0].blocks order) ----------------

export const ENEL: readonly Instance[] = [
  // cabos_entrada (entrada)
  { isoRows: ['330', '3700', '230', '220'], obs: QUICK_NOTE, restr: 'com_restricoes', tag: 'CE-ENEL' },
  // para_raio (entrada)
  {
    np: { tipo: 'POLIMÉRICO', tensao_nominal: '12', corrente_nominal: '10' },
    isoRows: ['330', '3700', '230', null],
    obs: QUICK_NOTE,
    restr: 'com_restricoes',
    tag: 'PR-ENEL-ENT',
  },
  // chave_seccionadora (entrada)
  {
    np: {
      identificacao: 'CUBÍCULO ENEL',
      fabricacao: 'CELLTA',
      n_serie: '7.620B',
      tipo: 'MANUAL',
      meio_de_extincao: 'AR',
      tensao_de_placa: '15',
      corrente_nominal: '400',
      acionamento: 'MANUAL/PUNHO',
      data_de_fabricacao: '07/2012',
    },
    contact: ['25', '21', '5.3'],
    rc: ['251', '297', '199'],
    tag: 'SEC-ENEL-ENT',
  },
  // chave_seccionadora (saida)
  {
    np: {
      identificacao: 'CUBÍCULO ENEL',
      fabricacao: 'SENNER',
      n_serie: '10.888',
      tipo: 'MANUAL',
      meio_de_extincao: 'AR',
      tensao_de_placa: '15',
      corrente_nominal: '400',
      acionamento: 'MANUAL/PUNHO',
      data_de_fabricacao: '09/2013',
    },
    contact: ['5.7', '5.9', '6.3'],
    rc: ['379', '353', '368'],
    tag: 'SEC-ENEL-SAI',
  },
  // tp
  {
    np: {
      identificacao: 'CUBÍCULO ENEL',
      fabricacao: 'ZILMER',
      n_serie: '181.114',
      tipo: 'IPSB',
      tipo_de_isolacao: 'EPÓXI',
      potencia_nominal: '500',
      data_fabricacao: '2012',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '220',
    },
    isoRows: ['5.7', '5.9', '6.3'],
    ratio: { p: '13800', s: '220', cap: ['62.832', '62.827', '62.799'] },
    tag: 'TP-ENEL',
  },
  // tc
  {
    np: {
      identificacao: 'CUBÍCULO ENEL',
      fabricacao: 'ZILMER',
      n_serie: '37.321',
      tipo: 'ICSG',
      tipo_de_isolacao: 'EPÓXI',
      data_fabricacao: '2017',
      relacao: '500/5',
      exatidao: '10P20',
    },
    isoRows: ['5.7', '5.9', '6.3'],
    ratio: { p: '500', s: '5', cap: ['100.20', '100.15', '100.18'] },
    tag: 'TC-ENEL',
  },
  // disjuntor_mt
  {
    np: {
      identificacao: 'CUBÍCULO ENEL',
      fabricacao: 'SCHNEIDER',
      n_serie: 'SU2012W3330013',
      tipo: 'SF1',
      meio_de_extincao: 'SF6',
      corrente_nominal: '630',
      capacidade_interruptor: '20',
      tensao_nominal: '17.5',
      aj_bobina: '220 VCA',
    },
    contact: ['5.7', '5.9', '6.3'],
    rc: ['281', '279', '303'],
    tag: 'DJ-ENEL',
  },
  // para_raio (saida)
  {
    np: { tipo: 'POLIMÉRICO', tensao_nominal: '12', corrente_nominal: '10' },
    isoRows: ['5.7', '5.9', '6.3', null],
    tag: 'PR-ENEL-SAI',
  },
  // cabos_saida (saida)
  { isoRows: ['2.8', '2.8', '2.8', null], tag: 'CS-ENEL' },
];

// --- 1° Subsolo: the cabine's own blocks (5 transformador_forca then 5 cabos_saida) -----

export const SUBSOLO_TRANSFORMERS: readonly Instance[] = [
  {
    np: {
      identificacao: 'SUBSTAÇÃO',
      fabricacao: 'SCHNEIDER',
      n_serie: '312484/14',
      tipo: 'TRICAST',
      tipo_de_isolacao: 'Á SECO',
      tap_atual: '13200',
      data_fabricacao: '04/2014',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '380/220',
      ligacao_secundaria: 'DYN1',
      potencia_nominal: '1000',
    },
    isoRows: ['2T', '2T', '160'],
    ratio: { p: '13200', s: '380/220', cap: ['60.345', '60.311', '60.325'] },
    noConcl: true,
    tag: 'TR-1',
  },
  {
    np: {
      identificacao: 'SUBSTAÇÃO',
      fabricacao: 'SIEMENS',
      n_serie: '10100040979002',
      tipo: 'GEAFOL',
      tipo_de_isolacao: 'Á SECO',
      tap_atual: '13200',
      data_fabricacao: '07/2025',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '220/127',
      ligacao_secundaria: 'DYN1',
      potencia_nominal: '750',
    },
    isoRows: ['2T', '1610', '1.6'],
    ratio: { p: '13200', s: '220/127', cap: ['104.33', '104.32', '104.29'] },
    noConcl: true,
    tag: 'TR-2',
  },
  {
    np: {
      identificacao: 'SUBSTAÇÃO',
      fabricacao: 'SCHNEIDER',
      n_serie: '264487/12',
      tipo: 'TRH',
      tipo_de_isolacao: 'Á SECO',
      tap_atual: '13200',
      data_fabricacao: '10/2012',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '380/220',
      ligacao_secundaria: 'DYN1',
      potencia_nominal: '1500',
    },
    isoRows: ['1020', '1870', '340'],
    ratio: { p: '13200', s: '380/220', cap: ['60.303', '60.346', '60.321'] },
    noConcl: true,
    tag: 'TR-3',
  },
  {
    // Real duplicate in the source: same serial and TAP data as TR-2 (SIEMENS GEAFOL 750 kVA).
    np: {
      identificacao: 'SUBSTAÇÃO',
      fabricacao: 'SIEMENS',
      n_serie: '10100040979002',
      tipo: 'GEAFOL',
      tipo_de_isolacao: 'Á SECO',
      tap_atual: '13200',
      data_fabricacao: '07/2025',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '220/127',
      ligacao_secundaria: 'DYN1',
      potencia_nominal: '750',
    },
    isoRows: ['1280', '2T', '94'],
    ratio: { p: '13200', s: '220/127', cap: ['104.33', '104.33', '104.34'] },
    noConcl: true,
    tag: 'TR-4',
  },
  {
    np: {
      identificacao: 'SUBSTAÇÃO',
      fabricacao: 'SCHNEIDER',
      n_serie: '284486/12',
      tipo: 'TRH',
      tipo_de_isolacao: 'Á SECO',
      tap_atual: '13200',
      data_fabricacao: '10/2012',
      tensao_nominal_at: '13.8',
      tensao_nominal_bt: '380/220',
      ligacao_secundaria: 'DYN1',
      potencia_nominal: '1500',
    },
    isoRows: ['1440', '910', '200'],
    ratio: { p: '13200', s: '380/220', cap: ['60.361', '60.361', '60.386'] },
    noConcl: true,
    tag: 'TR-5',
  },
];

export const SUBSOLO_CABLES: readonly Instance[] = [
  { isoRows: ['70', '70', '70', null], tag: 'CB-TR1' },
  { isoRows: ['150', '150', '150', null], tag: 'CB-TR2' },
  { isoRows: ['9.6', '9.6', '9.6', null], tag: 'CB-TR3' },
  { isoRows: ['90', '90', '90', null], tag: 'CB-TR4' },
  { isoRows: ['107', '107', '107', null], tag: 'CB-TR5' },
];

/** `template.ts` `SUBSOLO_COLUMNS`: per-column placement order (chave, then disjuntor, then tp, then tc). */
export const SUBSOLO_COLUMNS: Record<number, readonly Instance[]> = {
  1: [
    // chave_seccionadora -- designated not_tested (file header note).
    { np: { identificacao: 'COLUNA 1 - ENTRADA/MODULO IM', n_serie: 'BL2014W4910004', tipo: 'MANUAL' }, notTested: true, tag: 'SEC-C1' },
  ],
  2: [
    {
      np: {
        identificacao: "COLUNA 2 - PTMT/TP's DE BARRA",
        fabricacao: 'SCHNEIDER',
        n_serie: 'SU1241025',
        tipo: 'MANUAL',
        meio_de_extincao: 'SF6',
        tensao_de_placa: '17.5',
        corrente_nominal: '630',
        acionamento: 'MANUAL/PUNHO',
        data_de_fabricacao: '2012',
      },
      contact: ['1250', '1650', '1530'],
      rc: ['157', '158', '173'],
      tag: 'S1',
    },
    {
      np: {
        identificacao: 'COLUNA 2 - IM/ALIMENTADOR TRAFO CENTRO CULTURAL - 300KVA',
        n_serie: 'BL2014W4910011',
        tipo: 'MANUAL',
      },
      contact: ['173', '720', '860'],
      rc: ['139', '153', '195'],
      tag: 'SEC-C2-2',
    },
    {
      np: {
        identificacao: 'COLUNA 2 - IM/ALIMENTADOR TRAFO CENTRO CULTURAL - 300KVA',
        fabricacao: 'SCHNEIDER',
        n_serie: 'CA2014W3640046',
        tipo: 'SF1',
        meio_de_extincao: 'SF6',
        corrente_nominal: '630',
        capacidade_interruptor: '20',
        tensao_nominal: '17.5',
      },
      contact: ['173', '720', '860'],
      rc: ['132', '157', '183'],
      tag: 'DJ-C2',
    },
    {
      np: { identificacao: 'COLUNA 2 - IM/ALIMENTADOR TRAFO CENTRO CULTURAL - 300KVA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '115' },
      isoRows: ['173', '720', '860'],
      ratio: { p: '13800', s: '115', cap: ['120.135', '120.128', '120.201'] },
      tag: 'TP-C2',
    },
    {
      np: { identificacao: 'COLUNA 2 - IM/ALIMENTADOR TRAFO CENTRO CULTURAL - 300KVA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '200/5' },
      isoRows: ['173', '720', '860'],
      ratio: { p: '200', s: '5', cap: ['40.123', '40.095', '40.073'] },
      tag: 'TC-C2',
    },
  ],
  3: [
    // chave_seccionadora -- every nameplate field blank on this sheet in the source.
    { np: { identificacao: 'COLUNA 3 - IM/ALIMENTADOR TRAFO B1B - 1500KVA' }, contact: ['173', '720', '860'], rc: ['159', '178', '127'], tag: 'SEC-C3' },
    {
      // disjuntor_mt #1 -- the "DISJUNTOR DE ACOPLAMENTO - REDE 1" bus-tie: designated not_tested.
      np: {
        identificacao: 'COLUNA 3 - PTMT/DISJUNTOR DE ACOPLAMENTO - REDE 1 (REDE)',
        fabricacao: 'SCHNEIDER',
        n_serie: 'SU2012W4050029',
        tipo: 'SF1',
        meio_de_extincao: 'SF6',
        corrente_nominal: '630',
        capacidade_interruptor: '20',
        tensao_nominal: '17.5',
        aj_bobina: '220 VCA',
      },
      notTested: true,
      tag: 'DJ-TIE-1',
    },
    {
      np: { identificacao: 'COLUNA 3 - IM/ALIMENTADOR TRAFO B1B - 1500KVA', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050030', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['173', '720', '860'],
      rc: ['190', '173', '138'],
      tag: 'DJ-C3-2',
    },
    {
      np: {
        identificacao: 'COLUNA 3 - PTMT/DISJUNTOR ACOPLAMENTO - REDE 1 (REDE)',
        fabricacao: 'ISOLET',
        tipo_de_isolacao: 'EPÓXI',
        potencia_nominal: '500',
        tensao_nominal_at: '13.2',
        tensao_nominal_bt: '115',
      },
      isoRows: ['1250', '1650', '1530'],
      ratio: { p: '13200', s: '115', cap: ['114.451', '114.498', '114.432'] },
      tag: 'TP-C3-1',
    },
    {
      np: { identificacao: 'COLUNA 3 - IM/ALIMENTADOR TRAFO B1B - 1500KVA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', tensao_nominal_at: '13.8', tensao_nominal_bt: '115' },
      isoRows: ['173', '720', '860'],
      ratio: { p: '13800', s: '115', cap: ['120.013', '120.028', '120.101'] },
      tag: 'TP-C3-2',
    },
    {
      np: { identificacao: 'COLUNA 3 - PTMT/DISJUNTOR ACOPLAMENTO - REDE 1 (REDE)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '400/5' },
      isoRows: ['1250', '1650', '1530'],
      ratio: { p: '400', s: '5', cap: ['80.251', '80.198', '80.109'] },
      tag: 'TC-C3-1',
    },
    {
      np: { identificacao: 'COLUNA 3 - IM/ALIMENTADOR TRAFO B1B - 1500KVA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '300/5' },
      isoRows: ['173', '720', '860'],
      ratio: { p: '300', s: '5', cap: ['60.123', '60.195', '60.173'] },
      tag: 'TC-C3-2',
    },
  ],
  4: [
    {
      np: {
        identificacao: 'COLUNA 4 - PTMT/ENTRADA ACOPLAMENTO - REDE 1 (GERADOR)',
        fabricacao: 'SCHNEIDER',
        n_serie: 'SU2012W4030016',
        tipo: 'SF1',
        meio_de_extincao: 'SF6',
        corrente_nominal: '630',
        capacidade_interruptor: '20',
        tensao_nominal: '17.5',
      },
      contact: ['1250', '1650', '1530'],
      rc: ['143', '147', '140'],
      tag: 'DJ-C4',
    },
    {
      np: { identificacao: 'COLUNA 4 - ENTRADA ACOPLAMENTO - REDE 1 (GERADOR)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '115' },
      isoRows: ['1250', '1650', '1530'],
      ratio: { p: '13800', s: '115', cap: ['120.127', '120.217', '120.099'] },
      tag: 'TP-C4',
    },
    {
      np: { identificacao: 'COLUNA 4 - ENTRADA ACOPLAMENTO - REDE 1 (GERADOR)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '400/5' },
      isoRows: ['1250', '1650', '1530'],
      ratio: { p: '400', s: '5', cap: ['80.152', '80.189', '80.191'] },
      tag: 'TC-C4',
    },
  ],
  5: [
    {
      np: {
        identificacao: 'COLUNA 5 - PTMT/ALIMENTADOR TRAFO A1 - 750KVA (QGBT-A)',
        fabricacao: 'SCHNEIDER',
        n_serie: 'SU1241036',
        tipo: 'MANUAL',
        meio_de_extincao: 'SF6',
        tensao_de_placa: '17.5',
        corrente_nominal: '630',
        acionamento: 'MANUAL/PUNHO',
        data_de_fabricacao: '2012',
      },
      contact: ['1250', '1650', '1530'],
      rc: ['157', '178', '127'],
      tag: 'SEC-C5',
    },
    {
      np: { identificacao: 'COLUNA 5 - PTMT/ALIMENTADOR TRAFO A1 - 750KVA (QGBT-A)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050025', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['1250', '1650', '1530'],
      rc: ['170', '154', '148'],
      tag: 'QM5',
    },
  ],
  6: [
    {
      np: { identificacao: 'COLUNA 6 - PTMT/ALIMENTADOR MODULO-IM (QGBT-B1)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241037', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['1250', '1650', '1530'],
      rc: ['128', '130', '185'],
      tag: 'SEC-C6',
    },
    {
      np: { identificacao: 'COLUNA 6 - PTMT/ALIMENTADOR MODULO-IM (QGBT-B1)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050028', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['1250', '1650', '1530'],
      rc: ['155', '162', '167'],
      tag: 'QM3',
    },
  ],
  7: [
    {
      np: { identificacao: 'COLUNA 7 - PTMT/ALIMENTADOR TRAFO B2B - 1000KVA (COBERTURA TORRE B - LADO B)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241038', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['1250', '1650', '1530'],
      rc: ['157', '130', '189'],
      tag: 'SEC-C7',
    },
    {
      np: { identificacao: 'COLUNA 7 - PTMT/ALIMENTADOR TRAFO B2B - 1000KVA (COBERTURA TORRE B - LADO B)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050026', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['1250', '1650', '1530'],
      rc: ['138', '139', '149'],
      tag: 'QM4',
    },
  ],
  8: [
    {
      np: { identificacao: 'COLUNA 8 - PTMT/ALIMENTADOR TRAFO T (TEATRO)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241039', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['1250', '1650', '1530'],
      rc: ['175', '103', '198'],
      tag: 'SEC-C8',
    },
    {
      np: { identificacao: 'COLUNA 8 - PTMT/ALIMENTADOR TRAFO T (TEATRO)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050027', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['1250', '1650', '1530'],
      rc: ['169', '113', '141'],
      tag: 'QM6',
    },
  ],
  10: [
    {
      np: { identificacao: 'COLUNA 10 - PTMT/ALIMENTADOR CAG - 750KVA (CAG TORRE A)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241041', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['147', '168', '179'],
      rc: ['132', '149', '186'],
      tag: 'SEC-C10',
    },
    {
      np: { identificacao: 'COLUNA 10 - PTMT/ALIMENTADOR CAG - 750KVA (CAG TORRE A)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050024', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['147', '168', '179'],
      rc: ['175', '163', '185'],
      tag: 'QM8',
    },
  ],
  11: [
    {
      np: { identificacao: 'COLUNA 11 - PTMT/ALIMENTADOR TRAFO B2A - 1000KVA (COBERTURA TORRE B - LADO A)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241042', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['147', '168', '179'],
      rc: ['182', '125', '241'],
      tag: 'SEC-C11',
    },
    {
      np: { identificacao: 'COLUNA 11 - PTMT/ALIMENTADOR TRAFO B2A - 1000KVA (COBERTURA TORRE B - LADO A)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4050022', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['147', '168', '179'],
      rc: ['163', '173', '181'],
      tag: 'QM9',
    },
  ],
  12: [
    {
      np: { identificacao: 'COLUNA 12 - PTMT/ALIMENTADOR TRAFO B1A - 1500KVA (QGBT-B1)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241043', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['147', '168', '179'],
      rc: ['222', '245', '199'],
      tag: 'SEC-C12',
    },
    {
      np: { identificacao: 'COLUNA 12 - PTMT/ALIMENTADOR TRAFO B1A - 1500KVA (QGBT-B1)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4060042', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['147', '168', '179'],
      rc: ['169', '187', '141'],
      tag: 'QM10',
    },
  ],
  13: [
    {
      np: { identificacao: 'COLUNA 13 - PTMT/ALIMENTADOR TRAFO A2 - 750KVA (QGBT-A)', fabricacao: 'SCHNEIDER', n_serie: 'SU1241044', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      contact: ['147', '168', '179'],
      rc: ['145', '198', '182'],
      tag: 'SEC-C13',
    },
    {
      np: { identificacao: 'COLUNA 13 - PTMT/ALIMENTADOR TRAFO A2 - 750KVA (QGBT-A)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4060040', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['147', '168', '179'],
      rc: ['138', '195', '153'],
      tag: 'QM11',
    },
  ],
  14: [
    {
      np: { identificacao: 'COLUNA 14 - PTMT/ENTRADA ACOPLAMENTO - GERADOR 2/3/4 (GERADOR)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4060039', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['147', '168', '179'],
      rc: ['220', '201', '183'],
      tag: 'QM12',
    },
    {
      np: { identificacao: 'COLUNA 14 - ENTRADA ACOPLAMENTO - GERADOR 2/3/4 (GERADOR)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.8', tensao_nominal_bt: '115' },
      isoRows: ['147', '168', '179'],
      ratio: { p: '13800', s: '115', cap: ['120.098', '120.088', '120.092'] },
      tag: 'TP-C14',
    },
    {
      np: { identificacao: 'COLUNA 14 - ENTRADA ACOPLAMENTO - GERADOR 2/3/4 (GERADOR)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '400/5' },
      isoRows: ['147', '168', '179'],
      ratio: { p: '400', s: '5', cap: ['80.165', '80.129', '80.197'] },
      tag: 'TC-C14',
    },
  ],
  16: [
    {
      np: { identificacao: 'COLUNA 16 - PTMT/DISJUNTOR DE ACOPLAMENTO REDE 2 (REDE)', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4060041', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5' },
      contact: ['3.7', '4', '5.2'],
      rc: ['128', '168', '172'],
      tag: 'QM13',
    },
    {
      np: { identificacao: 'COLUNA 16 - DISJUNTOR ACOPLAMENTO REDE 2 (REDE)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.2', tensao_nominal_bt: '115' },
      isoRows: ['3.7', '4', '5.2'],
      ratio: { p: '13200', s: '115', cap: ['114.325', '114.125', '114.091'] },
      tag: 'TP-C16',
    },
    {
      np: { identificacao: 'COLUNA 16 - DISJUNTOR ACOPLAMENTO REDE 2 (REDE)', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '400/5' },
      isoRows: ['3.7', '4', '5.2'],
      ratio: { p: '400', s: '5', cap: ['80.125', '80.098', '80.111'] },
      tag: 'TC-C16',
    },
  ],
  17: [
    // chave_seccionadora -- designated not_tested (file header note).
    {
      np: { identificacao: "COLUNA 17 - PTMT/TP's DE BARRA", fabricacao: 'SCHNEIDER', n_serie: 'SU1241048', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' },
      notTested: true,
      tag: 'SEC-C17',
    },
  ],
};

// --- 9.6 Oxigênio (5 blocks) --------------------------------------------------------------

export const OXIGENIO: readonly Instance[] = [
  { isoRows: ['27', '38', '40', null], tag: 'CE-OXI' },
  {
    np: { identificacao: 'OXIGÊNIO', fabricacao: 'SELLUX', n_serie: '752', tipo: 'MANUAL', meio_de_extincao: 'AR', tensao_de_placa: '17.5', corrente_nominal: '400', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '03/2015' },
    contact: ['5.6', '5.6', '5.6'],
    rc: ['310', '162', '111'],
    tag: 'SEC-OXI',
  },
  { np: { tipo: 'POLIMÉRICO', tensao_nominal: '12', corrente_nominal: '10' }, isoRows: ['5.6', '5.6', '5.6', null], tag: 'PR-OXI' },
  { isoRows: ['5.6', '5.6', '5.6', null], tag: 'CS-OXI' },
  {
    np: { identificacao: 'OXIGÊNIO', fabricacao: 'BLUTRAFOS', n_serie: '11.631.601', tipo: 'TTR', tipo_de_isolacao: 'Á SECO', tap_atual: '13200', data_fabricacao: '02/2015', tensao_nominal_at: '13.8', tensao_nominal_bt: '380/220', ligacao_secundaria: 'DYN1', potencia_nominal: '300' },
    isoRows: ['197', '100', '57'],
    ratio: { p: '13200', s: '380/220', cap: ['60.364', '60.376', '60.358'] },
    noConcl: true,
    tag: 'TR-OXI',
  },
];

// --- 9.7 / 9.8 Cobertura Lado A / B (6 blocks each) ---------------------------------------

/** Drops keys whose value is `undefined` (a real gap in the source, e.g. a blank "-" field) so
 *  the fixture never writes a `sheet/nameplate/*` put for a field the sheet leaves unfilled. */
function clean(fields: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) out[key] = value;
  return out;
}

function cobertura(suffix: 'A' | 'B', secSerie: string, djSerie: string | undefined, trSerie: string | undefined, trDataFabricacao: string | undefined): readonly Instance[] {
  return [
    { isoRows: suffix === 'A' ? ['106', '66', '88', null] : ['194', '66', '78', null], tag: `CE-COB${suffix}` },
    { np: { tipo: 'POLIMÉRICO', tensao_nominal: '12', corrente_nominal: '10' }, isoRows: suffix === 'A' ? ['106', '66', '88', null] : ['37', '37', '36', null], tag: `PR-COB${suffix}` },
    {
      np: clean({ identificacao: `COLUNA 2 - PMT-B2${suffix}`, fabricacao: 'SCHNEIDER', n_serie: secSerie, tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }),
      contact: suffix === 'A' ? ['12', '18.1', '7.9'] : ['37', '37', '36'],
      rc: suffix === 'A' ? ['234', '241', '210'] : ['193', '219', '199'],
      tag: `SEC-COB${suffix}`,
    },
    {
      np: clean({ identificacao: `COLUNA 2 - PMT-B2${suffix}`, fabricacao: 'SCHNEIDER', n_serie: djSerie, tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5', aj_bobina: '220 VCA' }),
      contact: suffix === 'A' ? ['12', '18.1', '7.9'] : ['37', '37', '36'],
      rc: suffix === 'A' ? ['134', '141', '110'] : ['269', '313', '241'],
      tag: `DJ-COB${suffix}`,
    },
    { isoRows: suffix === 'A' ? ['189', '189', '189', null] : ['230', '230', '230', null], tag: `CS-COB${suffix}` },
    {
      np: clean({
        identificacao: `COLUNA 2 - PMT-B2${suffix}`,
        fabricacao: 'SCHNEIDER',
        n_serie: trSerie,
        tipo: 'TRH',
        tipo_de_isolacao: 'Á SECO',
        tap_atual: '13200',
        data_fabricacao: trDataFabricacao,
        tensao_nominal_at: '13.8',
        tensao_nominal_bt: '380/220',
        ligacao_secundaria: 'DYN1',
        potencia_nominal: '1000',
      }),
      isoRows: suffix === 'A' ? ['660', '189', '2T'] : ['230', '650', '2T'],
      ratio: { p: '13200', s: '380/220', cap: suffix === 'A' ? ['60.305', '60.297', '60.301'] : ['60.334', '60.330', '60.328'] },
      noConcl: true,
      tag: `TR-COB${suffix}`,
    },
  ];
}

export const COBERTURA_A: readonly Instance[] = cobertura('A', 'SU1242021', 'SU2012W4030014', '264484/12', '10/2012');
// The disjuntor's own Nº SÉRIE and the transformer's Nº SÉRIE/DATA FABRICAÇÃO are blank ("-")
// on the cobertura lado B sheets in the source.
export const COBERTURA_B: readonly Instance[] = cobertura('B', 'SU1242023', undefined, undefined, undefined);

// --- 9.9 / 9.10 / 9.11 Geradores ----------------------------------------------------------

export const GERADORES_SECCIONADORAS: readonly Instance[] = [
  { np: { identificacao: 'COLUNA 1 - PTMG/ENTRADA GERADOR 4/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU1242013', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['175', '185', '137'], tag: 'SEC-GER1' },
  { np: { identificacao: 'COLUNA 2 - PTMG/ENTRADA GERADOR 3/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU1242014', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['157', '158', '173'], tag: 'SEC-GER2' },
  { np: { identificacao: 'COLUNA 3 - PTMG/ENTRADA GERADOR 2/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU1242015', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['220', '261', '231'], tag: 'SEC-GER3' },
  { np: { identificacao: 'COLUNA 4 - PTMG/ALIMENTADOR PTMT (LADO A)', fabricacao: 'SCHNEIDER', n_serie: 'SU1242016', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['185', '145', '156'], tag: 'SEC-GER4' },
  { np: { identificacao: 'COLUNA 5 - PTMG/ALIMENTADOR PTMT (LADO B)', fabricacao: 'SCHNEIDER', n_serie: 'SU1242017', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['125', '178', '159'], tag: 'SEC-GER5' },
  { np: { identificacao: 'COLUNA 6 - PTMG/ENTRADA GERADOR 1/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU1242018', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['248', '211', '198'], tag: 'SEC-GER6' },
  { np: { identificacao: "COLUNA 7 - PTMG/TP's DE BARRA", fabricacao: 'SCHNEIDER', n_serie: 'BL2015W1650034', tipo: 'MANUAL', meio_de_extincao: 'SF6', tensao_de_placa: '17.5', corrente_nominal: '630', acionamento: 'MANUAL/PUNHO', data_de_fabricacao: '2012' }, contact: ['27', '30', '40'], rc: ['135', '189', '164'], tag: 'SEC-GER7' },
];

export const GERADORES_DISJUNTORES: readonly Instance[] = [
  { np: { identificacao: 'COLUNA 1 - PTMG/ENTRADA GERADOR 4/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4030013', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5', aj_bobina: '220 VCA' }, contact: ['27', '30', '40'], rc: ['186', '219', '158'], tag: 'DJ-GER1' },
  { np: { identificacao: 'COLUNA 2 - PTMG/ENTRADA GERADOR 3/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4030011', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5', aj_bobina: '220 VCA' }, contact: ['27', '30', '40'], rc: ['142', '169', '141'], tag: 'DJ-GER2' },
  { np: { identificacao: 'COLUNA 3 - PTMG/ENTRADA GERADOR 2/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4030012', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5', aj_bobina: '220 VCA' }, contact: ['27', '30', '40'], rc: ['124', '196', '114'], tag: 'DJ-GER3' },
  { np: { identificacao: 'COLUNA 6 - PTMG/ENTRADA GERADOR 1/13,2KV - 630A - 20KA', fabricacao: 'SCHNEIDER', n_serie: 'SU2012W4030010', tipo: 'SF1', meio_de_extincao: 'SF6', corrente_nominal: '630', capacidade_interruptor: '20', tensao_nominal: '17.5', aj_bobina: '220 VCA' }, contact: ['27', '30', '40'], rc: ['161', '149', '162'], tag: 'DJ-GER6' },
];

export const GERADORES_TPS: readonly Instance[] = [
  { np: { identificacao: 'COLUNA 1 - PTMG/ENTRADA GERADOR 4/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.2', tensao_nominal_bt: '115' }, isoRows: ['27', '30', '40'], ratio: { p: '13200', s: '115', cap: ['114.541', '114.894', '114.342'] }, tag: 'TP-GER1' },
  { np: { identificacao: 'COLUNA 2 - PTMG/ENTRADA GERADOR 3/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.2', tensao_nominal_bt: '115' }, isoRows: ['27', '30', '40'], ratio: { p: '13200', s: '115', cap: ['114.652', '114.723', '114.801'] }, tag: 'TP-GER2' },
  { np: { identificacao: 'COLUNA 3 - PTMG/ENTRADA GERADOR 2/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.2', tensao_nominal_bt: '115' }, isoRows: ['27', '30', '40'], ratio: { p: '13200', s: '115', cap: ['114.528', '114.689', '114.798'] }, tag: 'TP-GER3' },
  { np: { identificacao: 'COLUNA 6 - PTMG/ENTRADA GERADOR 1/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', potencia_nominal: '500', tensao_nominal_at: '13.2', tensao_nominal_bt: '115' }, isoRows: ['27', '30', '40'], ratio: { p: '13200', s: '115', cap: ['114.825', '114.896', '114.832'] }, tag: 'TP-GER6' },
];

export const GERADORES_TCS: readonly Instance[] = [
  { np: { identificacao: 'COLUNA 1 - PTMG/ENTRADA GERADOR 4/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '150/5' }, isoRows: ['27', '30', '40'], ratio: { p: '150', s: '5', cap: ['30.251', '30.198', '30.109'] }, tag: 'TC-GER1' },
  { np: { identificacao: 'COLUNA 2 - PTMG/ENTRADA GERADOR 3/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '150/5' }, isoRows: ['27', '30', '40'], ratio: { p: '150', s: '5', cap: ['30.121', '30.149', '30.187'] }, tag: 'TC-GER2' },
  { np: { identificacao: 'COLUNA 3 - PTMG/ENTRADA GERADOR 2/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '150/5' }, isoRows: ['27', '30', '40'], ratio: { p: '150', s: '5', cap: ['30.098', '30.081', '30.045'] }, tag: 'TC-GER3' },
  { np: { identificacao: 'COLUNA 6 - PTMG/ENTRADA GERADOR 1/13,2KV - 630A - 20KA', fabricacao: 'ISOLET', tipo_de_isolacao: 'EPÓXI', relacao: '150/5' }, isoRows: ['27', '30', '40'], ratio: { p: '150', s: '5', cap: ['30.098', '30.081', '30.045'] }, tag: 'TC-GER6' },
];

// --- Section 7 photos: 82 entries (numbers 1-74 once, 75/76 four times each, source defect) --

export interface PhotoEntry {
  number: number;
  caption: string;
}

const GERACAO_CAPTION = 'Detalhe dos serviços e ensaios realizados nos cubículos de geração.';
const QGBT_CAPTION = 'Detalhe das verificações e limpeza realizados no QGBT.';

const CAPTIONS_1_TO_74 = [
  'Detalhe da equipe da Enel no local para desligamento e religamento da energia.',
  'Detalhe da verificação da ausência de tensão para instalação do aterramento temporário.',
  'Detalhe da instalação do aterramento temporário para execução das atividades.',
  'Detalhe da instalação de bloqueio loto para a execução dos serviços.',
  'Detalhe dos ensaios de resistência de isolação realizados no transformador da cobertura lado B.',
  'Detalhe dos ensaios de relação de transformação realizados no transformador da cobertura lado B.',
  'Detalhe dos ensaios de resistência de isolação realizados no cubículo de Média Tensão da cobertura lado B.',
  'Detalhe dos ensaios de resistência de isolação realizados no cubículo de Média Tensão da cobertura lado B.',
  'Detalhe dos ensaios de resistência de contato realizados no cubículo de Média Tensão da cobertura lado B.',
  'Detalhe dos ensaios de resistência de contato realizados no cubículo de Média Tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe da limpeza e reaperto realizados nos painéis de baixa e média tensão da cobertura lado B.',
  'Detalhe dos ensaios de resistência de isolação realizado no transformador do Oxigênio.',
  'Detalhe dos ensaios de resistência de isolação realizados no cubículo de alimentação do Oxigênio.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cabos de alimentação do Oxigênio.',
  'Detalhe dos ensaios de relação de transformação realizados no transformador do Oxigênio.',
  'Detalhe dos ensaios de resistência de contato realizados no cubículo de alimentação do Oxigênio.',
  'Detalhe dos ensaios de resistência de contato realizados no cubículo de alimentação do Oxigênio.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cabos de alimentação da Enel.',
  'Detalhe dos ensaios de resistência de contato realizados na seccionadora do cubículo de entrada da Enel.',
  'Detalhe dos ensaios de resistência de isolação realizados na seccionadora do cubículo de entrada da Enel.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cabos de saída do cubículo da Enel.',
  'Detalhe dos ensaios de resistência de isolação realizados nos componentes de saída do cubículo da Enel.',
  'Detalhe dos ensaios de resistência de isolação realizados nos componentes de saída do cubículo da Enel.',
  'Detalhe dos ensaios de resistência de contato realizados na seccionadora de saída do cubículo da Enel.',
  "Detalhe dos ensaios de resistência de contato realizados na seccionadora de saída do cubículo da Enel.",
  "Detalhe dos ensaios de relação de transformação realizados nos TC's do cubículo da Enel.",
  "Detalhe dos ensaios de relação de transformação realizados nos TC's do cubículo da Enel.",
  "Detalhe dos ensaios de relação de transformação realizados nos TP's do cubículo da Enel.",
  "Detalhe dos ensaios de relação de transformação realizados nos TP's do cubículo da Enel.",
  'Detalhe dos ensaios de resistência de isolação realizados no transformador da cobertura lado A.',
  'Detalhe dos ensaios de resistência de isolação realizados no transformador da cobertura lado A.',
  'Detalhe dos ensaios de relação de transformação realizados no transformador da cobertura lado A.',
  'Detalhe dos ensaios de relação de transformação realizados no transformador da cobertura lado A.',
  'Detalhe dos ensaios de resistência de isolação realizados no cubículo de Média Tensão da cobertura lado A.',
  'Detalhe dos ensaios de resistência de isolação realizados no cubículo de Média Tensão da cobertura lado A.',
  'Detalhe dos ensaios de resistência de contato realizados na seccionadora e no disjuntor do cubículo de Média Tensão da cobertura lado A.',
  'Detalhe dos ensaios de resistência de contato realizados na seccionadora e no disjuntor do cubículo de Média Tensão da cobertura lado A.',
  'Detalhe da limpeza e reaperto realizado nos painéis de baixa e média tensão da cobertura lado A.',
  'Detalhe da limpeza e reaperto realizado nos painéis de baixa e média tensão da cobertura lado A.',
  'Detalhe da limpeza e reaperto realizado nos painéis de baixa e média tensão da cobertura lado A.',
  'Detalhe da limpeza e reaperto realizado nos painéis de baixa e média tensão da cobertura lado A.',
  'Detalhe dos serviços realizados nos cubículos de Média Tensão no subsolo.',
  'Detalhe dos serviços realizados nos cubículos de Média Tensão no subsolo.',
  'Detalhe dos ensaios de resistência de contato realizados nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de contato realizados nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de contato realizados nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de contato realizados nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cubículos de Média Tensão.',
  "Detalhe dos ensaios de relação de transformação realizados nos TP's e TC's dos cubículos de Média Tensão.",
  "Detalhe dos ensaios de relação de transformação realizados nos TP's e TC's dos cubículos de Média Tensão.",
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe da limpeza e reaperto realizado nos cubículos de Média Tensão.',
  'Detalhe dos ensaios de resistência de isolação realizados nos transformadores do subsolo.',
  'Detalhe dos ensaios de resistência de isolação realizados nos transformadores do subsolo.',
  'Detalhe dos ensaios de relação de transformação realizados nos transformadores do subsolo.',
  'Detalhe dos ensaios de relação de transformação realizados nos transformadores do subsolo.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cabos de alimentação dos transformadores do subsolo.',
  'Detalhe dos ensaios de resistência de isolação realizados nos cabos de alimentação dos transformadores do subsolo.',
  GERACAO_CAPTION,
  GERACAO_CAPTION,
  GERACAO_CAPTION,
  GERACAO_CAPTION,
] as const;

/** 74 unique numbers, then the source's own 75/76-repeated-4x defect (§1.10): reproduced, not fixed. */
export const SECTION_7_PHOTOS: readonly PhotoEntry[] = [
  ...CAPTIONS_1_TO_74.map((caption, index): PhotoEntry => ({ number: index + 1, caption })),
  { number: 75, caption: GERACAO_CAPTION },
  { number: 76, caption: GERACAO_CAPTION },
  { number: 75, caption: QGBT_CAPTION },
  { number: 76, caption: QGBT_CAPTION },
  { number: 75, caption: QGBT_CAPTION },
  { number: 76, caption: QGBT_CAPTION },
  { number: 75, caption: QGBT_CAPTION },
  { number: 76, caption: QGBT_CAPTION },
];
