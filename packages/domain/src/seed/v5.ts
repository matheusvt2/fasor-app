import type { ItemKey } from '../schemas/block-config.ts';
import type { ConfigField, CriterionSource, MeasurementOption, MeasurementRow, MeasurementTest } from './measurement.ts';
import type { BlockDefinition, ChecklistItem, FieldDef, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V4 } from './v4.ts';

/*
 * Seed version 5 (AR-20; Story 14.5): seed v4 as it shipped, plus ONE block type, the Chave de
 * transferência automática (CTA), the first library type. Its content is
 * `sprint-change-proposal-2026-10-08.md` § 8.4 (Matheus's draft, adjusted after first use) on
 * the measurement-table grammar of `seed/measurement.ts`. Derived from v4 rather than retyped,
 * so the two differ only by this type (`seed.test.ts` pins the difference). FROZEN once
 * merged, like v1 to v4.
 *
 * Labels are sentence case as § 8.4 and `63-ficha-cta.html` write them (several hold capitals
 * a caps label could not give back: "N/E", "LEDs", "AUTOMÁTICO"); the document prints them in
 * caps. No manufacturer or brand is named anywhere: a source that is a maker's manual reads
 * "manual do fabricante".
 */

// --- configuration (BlockConfig.options) ----------------------------------------------------

const option = (key: string, label: string, phrase?: string): MeasurementOption => (phrase === undefined ? { key, label } : { key, label, phrase });

// authored: the option labels and the defaults (BT, 3 polos, neutro sólido, transição aberta, sem bypass).
const CONFIG_FIELDS: ConfigField[] = [
  { key: 'tensao', label: 'Tensão', options: [option('bt', 'BT'), option('mt', 'MT')], default: 'bt' },
  { key: 'polos', label: 'Polos', options: [option('2', '2'), option('3', '3'), option('4', '4')], default: '3' },
  { key: 'neutro', label: 'Neutro', options: [option('solido', 'Sólido'), option('chaveado', 'Chaveado'), option('sobreposto', 'Sobreposto')], default: 'solido' },
  { key: 'transicao', label: 'Transição', options: [option('aberta', 'Aberta'), option('retardada', 'Retardada'), option('fechada', 'Fechada')], default: 'aberta' },
  { key: 'bypass', label: 'Bypass-isolation', options: [option('sim', 'Sim'), option('nao', 'Não')], default: 'nao' },
];

/** Rows that exist from three poles on (fase C), and only at four (the neutral). */
const FASE_C = { config: 'polos', in: ['3', '4'] };
const NEUTRO = { config: 'polos', in: ['4'] };

// --- DADOS DE PLACA ----------------------------------------------------------------------------

const text = (key: string, label: string): FieldDef => ({ key, label, kind: 'text' });
const number = (key: string, label: string, unit: string): FieldDef => ({ key, label, kind: 'number', unit });

/**
 * The 13 fields of § 8.4 plus the two identity fields the eight carry (IDENTIFICAÇÃO and TAG,
 * as the seccionadora and the disjuntor hold them). The three fields of one physical unit are
 * flagged `per_unit` (seed v2): "Igual à ⟨TAG⟩?" never copies them.
 */
const NAMEPLATE: FieldDef[] = [
  { key: 'identificacao', label: 'IDENTIFICAÇÃO', kind: 'text', per_unit: true },
  { key: 'fabricante', label: 'Fabricante', kind: 'manufacturer' },
  text('serie', 'Série'),
  text('n_de_catalogo', 'Nº de catálogo'),
  { key: 'n_de_serie', label: 'Nº de série', kind: 'text', per_unit: true },
  { key: 'tag', label: 'TAG', kind: 'text', per_unit: true },
  text('ano', 'Ano'),
  number('tensao_nominal', 'Tensão nominal', 'V'),
  number('corrente_nominal', 'Corrente nominal', 'A'),
  number('frequencia', 'Frequência', 'Hz'),
  number('wcr', 'WCR', 'kA'),
  text('protecao_a_montante', 'Proteção a montante'),
  text('controlador_e_firmware', 'Controlador e firmware'),
  text('involucro', 'Invólucro'),
  number('torque_dos_terminais', 'Torque dos terminais', 'N·m'),
];

// --- VERIFICAÇÕES ------------------------------------------------------------------------------

const item = (key: ItemKey, label: string, nc_phrases: string[]): ChecklistItem => ({ key, label, nc_phrases });

// authored: every NC phrase below, pending Bruno's review (`docs/nc-chip-phrases.md`). The
// three of item 3 are the chips `63-ficha-cta.html` draws; the rest follow their wording.
const CHECKLIST: ChecklistItem[] = [
  item('placa_confere_com_o_projeto', 'Placa confere com o projeto', ['Placa divergente do projeto', 'Placa ilegível', 'Placa ausente']),
  item('involucro_fixacao_e_continuidade_do_aterramento_do_painel', 'Invólucro, fixação e continuidade do aterramento do painel', [
    'Invólucro danificado',
    'Fixação solta',
    'Sem continuidade de aterramento',
  ]),
  item('tampas_e_barreiras_fixadas_aviso_de_transferencia_manual_presente', 'Tampas e barreiras fixadas, aviso de transferência manual presente', [
    'Aviso ausente',
    'Barreira solta',
    'Tampa sem parafusos',
  ]),
  item('limpeza_interna_aspirada_sem_soprar', 'Limpeza interna, aspirada, sem soprar', ['Acúmulo de poeira', 'Presença de umidade', 'Resíduos metálicos no interior']),
  item(
    'contatos_principais_de_arco_e_auxiliares_posicao_sem_pites_ou_superaquecimento',
    'Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento',
    ['Pites nos contatos', 'Sinais de superaquecimento', 'Contato auxiliar fora de posição'],
  ),
  item('isoladores_e_barramentos', 'Isoladores e barramentos', ['Trinca no isolador', 'Barramento com sinais de aquecimento', 'Sujeira acumulada no isolador']),
  item('reaperto_da_potencia_ao_torque_da_etiqueta', 'Reaperto da potência ao torque da etiqueta', [
    'Terminal de potência frouxo',
    'Torque abaixo do indicado na etiqueta',
    'Sinais de aquecimento no terminal',
  ]),
  item('reaperto_da_fiacao_de_controle_chicote_e_fusiveis_de_comando', 'Reaperto da fiação de controle, chicote e fusíveis de comando', [
    'Borne de controle frouxo',
    'Chicote mal encaixado',
    'Fusível de comando queimado',
  ]),
  item('lubrificacao_somente_conforme_o_fabricante_sem_oleo', 'Lubrificação somente conforme o fabricante, sem óleo', [
    'Lubrificação ressecada',
    'Lubrificante inadequado',
    'Presença de óleo no mecanismo',
  ]),
  item('operacao_manual_com_as_fontes_desenergizadas', 'Operação manual com as fontes desenergizadas', [
    'Operação manual travada',
    'Mecanismo com esforço excessivo',
    'Manopla de operação ausente',
  ]),
  item('intertravamento_mecanico_e_eletrico_n_e', 'Intertravamento mecânico e elétrico N/E', [
    'Intertravamento mecânico inoperante',
    'Intertravamento elétrico inoperante',
    'Intertravamento desajustado',
  ]),
  item('rotacao_de_fases_da_emergencia_igual_a_da_normal', 'Rotação de fases da Emergência igual à da Normal', [
    'Rotação de fases invertida',
    'Rotação de fases não verificada',
    'Fases sem identificação',
  ]),
  item(
    'indicacao_de_posicao_leds_e_alarmes_leituras_de_v_i_e_f_conferem_com_instrumento',
    'Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento',
    ['LED de posição inoperante', 'Alarme inoperante', 'Leitura divergente do instrumento'],
  ),
  item('registro_de_manobras_e_contador_de_transferencias_revisados', 'Registro de manobras e contador de transferências revisados', [
    'Registro de manobras inacessível',
    'Contador de transferências inoperante',
    'Registro com falhas não tratadas',
  ]),
  item('partida_do_gerador_comandada_pela_chave_exercitador_programado', 'Partida do gerador comandada pela chave; exercitador programado', [
    'Gerador não parte pelo comando da chave',
    'Exercitador não programado',
    'Sinal de partida interrompido',
  ]),
  item('aquecedor_e_ventilacao_se_houver', 'Aquecedor e ventilação, se houver', ['Aquecedor inoperante', 'Ventilação inoperante', 'Termostato desajustado']),
  item('gerador_deixado_em_automatico_ao_final', 'Gerador deixado em AUTOMÁTICO ao final', [
    'Gerador deixado em MANUAL',
    'Gerador deixado em DESLIGADO',
    'Chave seletora sem identificação',
  ]),
];

// --- ENSAIOS (E1 to E6) --------------------------------------------------------------------------

// authored: the wording of every criterion `text`, of the two off notes (the mock's) and of
// every option label and phrase. The sources are § 8.4's; "fonte secundária" says the firm
// read the standard second hand, and a maker's manual is named as such, never by brand.
const source = (name: string): CriterionSource => ({ name, edition: null });
const NETA_7_22_3 = source('NETA 7.22.3 (fonte secundária)');

const OFF_NOTE_DEENERGIZE = 'Desligado — marque NA quando a chave não pode ser desenergizada.';
const OFF_NOTE_NO_LOAD = 'Desligado — marque NA quando não há carga para a termografia.';

const row = (key: string, label: string, extra: Partial<MeasurementRow> = {}): MeasurementRow => ({ key, label, ...extra });

const E1_RESISTENCIA_CONTATO: MeasurementTest = {
  key: 'cta_resistencia_contato',
  label: 'Resistência de contato',
  instrument_of: 'resistencia_contato',
  switchable: { off_note: OFF_NOTE_DEENERGIZE },
  row_header: 'Polo',
  columns: [
    { key: 'lado_normal', label: 'Lado Normal', kind: 'number', unit: 'µΩ' },
    { key: 'lado_emergencia', label: 'Lado Emergência', kind: 'number', unit: 'µΩ' },
  ],
  rows: [row('polo_a', 'Polo A'), row('polo_b', 'Polo B'), row('polo_c', 'Polo C', { when: FASE_C }), row('polo_n', 'Polo N', { when: NEUTRO })],
  criteria: [
    {
      type: 'relative_to_lowest',
      max_percent: 50,
      reference_label: 'Menor do lado',
      text: '≤ 50 % acima do menor do mesmo lado',
      source: NETA_7_22_3,
    },
  ],
};

const E2_ISOLAMENTO_PRINCIPAL: MeasurementTest = {
  key: 'cta_isolamento_principal',
  label: 'Isolamento principal',
  instrument_of: 'isolacao',
  switchable: { off_note: OFF_NOTE_DEENERGIZE },
  row_header: 'Medição',
  columns: [
    { key: 'normal_fechada', label: 'Normal fechada', kind: 'number', unit: 'MΩ' },
    { key: 'emergencia_fechada', label: 'Emergência fechada', kind: 'number', unit: 'MΩ' },
    { key: 'aberta', label: 'Aberta', kind: 'number', unit: 'MΩ' },
  ],
  rows: [
    row('a_t', 'A-T'),
    row('b_t', 'B-T'),
    row('c_t', 'C-T', { when: FASE_C }),
    // Open question (Bruno): N-T is the mock's row; § 8.4 lists seven without it.
    row('n_t', 'N-T', { when: NEUTRO }),
    row('a_b', 'A-B'),
    row('b_c', 'B-C', { when: FASE_C }),
    row('c_a', 'C-A', { when: FASE_C }),
    // Line to load is measured with the switch open only.
    row('linha_carga', 'Linha-carga', { fixed: { normal_fechada: '—', emergencia_fechada: '—' } }),
  ],
  criteria: [
    {
      type: 'absolute',
      operator: '>=',
      value: 100,
      unit: 'MΩ',
      text: '1.000 Vcc · ≥ 100 MΩ',
      source: source('NETA tabela 100.1 (fonte secundária)'),
      when: { config: 'tensao', in: ['bt'] },
    },
    // In MT the firm's own seeded criterion stands, so one relatório judges all its MV equipment alike.
    { type: 'absolute', seeded: 'isolacao', source: source('aceitável na ficha'), when: { config: 'tensao', in: ['mt'] } },
  ],
};

const E3_ISOLAMENTO_CONTROLE: MeasurementTest = {
  key: 'cta_isolamento_controle',
  label: 'Isolamento do controle',
  instrument_of: 'isolacao',
  switchable: { off_note: OFF_NOTE_DEENERGIZE },
  row_header: 'Medição',
  columns: [{ key: 'valor', label: 'Valor', kind: 'number', unit: 'MΩ' }],
  rows: [row('fiacao_terra', 'Fiação × terra')],
  criteria: [
    {
      type: 'absolute',
      operator: '>=',
      value: 2,
      unit: 'MΩ',
      text: '500 Vcc (fiação de 300 V) ou 1.000 Vcc (600 V) · ≥ 2 MΩ, com o chicote do controlador desconectado',
      source: source('NETA 7.22.3 (fonte secundária); manual do fabricante'),
    },
  ],
};

const percent = (key: string, label: string): MeasurementRow => row(key, label, { kind: 'number', unit: '%' });
const seconds = (key: string, label: string): MeasurementRow => row(key, label, { kind: 'number', unit: 's' });
const minutes = (key: string, label: string): MeasurementRow => row(key, label, { kind: 'number', unit: 'min' });

const E4_AJUSTES_CONTROLADOR: MeasurementTest = {
  key: 'cta_ajustes_controlador',
  label: 'Ajustes do controlador',
  row_header: 'Ajuste',
  columns: [
    { key: 'fabrica', label: 'Fábrica', kind: 'number', optional: true },
    { key: 'projeto', label: 'Projeto', kind: 'number' },
    { key: 'encontrado', label: 'Encontrado', kind: 'number' },
    { key: 'deixado', label: 'Deixado', kind: 'number' },
  ],
  // Open question (Bruno): the eight sensor rows are § 8.4's; the mock draws five of them.
  rows: [
    percent('normal_pickup_de_tensao', 'Normal · pickup de tensão'),
    percent('normal_dropout_de_tensao', 'Normal · dropout de tensão'),
    percent('normal_pickup_de_frequencia', 'Normal · pickup de frequência'),
    percent('normal_dropout_de_frequencia', 'Normal · dropout de frequência'),
    percent('emergencia_pickup_de_tensao', 'Emergência · pickup de tensão'),
    percent('emergencia_dropout_de_tensao', 'Emergência · dropout de tensão'),
    percent('emergencia_pickup_de_frequencia', 'Emergência · pickup de frequência'),
    percent('emergencia_dropout_de_frequencia', 'Emergência · dropout de frequência'),
    row('falta_de_fase', 'Falta de fase', { kind: 'choice', options: [option('ligado', 'Ligado'), option('desligado', 'Desligado')] }),
    seconds('td_1c', 'TD 1C · retardo de partida'),
    seconds('td_2b', 'TD 2B · transferência'),
    minutes('td_3a', 'TD 3A · retransferência'),
    minutes('td_2e', 'TD 2E · resfriamento'),
    row('exercitador', 'Exercitador', {
      kind: 'choice',
      options: [option('desligado', 'Desligado'), option('semanal', 'Semanal'), option('quinzenal', 'Quinzenal'), option('mensal', 'Mensal')],
    }),
  ],
  criteria: [
    {
      type: 'equals_column',
      column: 'deixado',
      reference: 'projeto',
      text: 'Deixado = projeto',
      source: source('manual do fabricante do controlador; ficha DTAC (RJ)'),
    },
  ],
};

const COM_CARGA = { value: 'carga', equals: 'com_carga' };
const LOAD_GROUP = 'Na Emergência, com carga';

const E5_TRANSFERENCIA: MeasurementTest = {
  key: 'cta_transferencia',
  label: 'Transferência',
  row_header: 'Etapa',
  columns: [
    // Typed, not echoed from E4 (a narrowing recorded in `deferred-work.md`).
    { key: 'ajuste', label: 'Ajuste', kind: 'number', optional: true },
    { key: 'medido', label: 'Medido', kind: 'number' },
  ],
  rows: [
    seconds('falha_da_normal_ate_partida', 'Falha da Normal até partida'),
    row('ate_carga_na_emergencia', 'Até carga na Emergência', { kind: 'number', unit: 's', fixed: { ajuste: 'limite 10 s' } }),
    minutes('retransferencia', 'Retransferência'),
    minutes('resfriamento', 'Resfriamento'),
    row('falha_da_emergencia', 'Falha da Emergência', { kind: 'number', unit: 's', fixed: { ajuste: '—' } }),
  ],
  values: [
    {
      key: 'metodo',
      label: 'Método',
      kind: 'choice',
      options: [
        option('falta_real', 'Falta real por abertura do disjuntor'),
        // A test started from the controller skips the engine-start delay, so the line says it.
        option('botao_teste', 'Botão de teste do controlador', 'Botão de teste do controlador (sem TD 1C)'),
        option('nao_realizado', 'Não realizado'),
      ],
    },
    { key: 'carga', label: 'Carga', kind: 'choice', options: [option('sem_carga', 'Sem carga'), option('com_carga', 'Com carga')] },
    { key: 'carga_percentual', label: 'Carga no ensaio', kind: 'number', unit: '%', when: COM_CARGA },
    {
      key: 'fonte_tempos',
      label: 'Fonte dos tempos',
      kind: 'choice',
      options: [option('instrumento', 'Instrumento'), option('registro_controlador', 'Registro do controlador')],
    },
    { key: 'tensao', label: 'Tensão', kind: 'number', unit: 'V', optional: true, when: COM_CARGA, group: LOAD_GROUP },
    { key: 'frequencia', label: 'Frequência', kind: 'number', unit: 'Hz', optional: true, when: COM_CARGA, group: LOAD_GROUP },
    { key: 'corrente', label: 'Corrente', kind: 'number', unit: 'A', optional: true, when: COM_CARGA, group: LOAD_GROUP },
  ],
  skip_when: { value: 'metodo', equals: 'nao_realizado' },
  criteria: [
    {
      type: 'absolute',
      operator: '<=',
      value: 10,
      unit: 's',
      rows: ['ate_carga_na_emergencia'],
      columns: ['medido'],
      text: 'Assumir a carga ≤ 10 s',
      source: source('NFPA 110 nível 1; OVG, SEDI Goiás, BCB e NFPA 70B A.39.2'),
    },
  ],
};

const termografia = (terminal: string, label: string): MeasurementRow[] => [
  row(`${terminal}_a`, `${label} · A`),
  row(`${terminal}_b`, `${label} · B`),
  row(`${terminal}_c`, `${label} · C`, { when: FASE_C }),
];

const E6_TERMOGRAFIA: MeasurementTest = {
  key: 'cta_termografia',
  label: 'Termografia sob carga',
  switchable: { off_note: OFF_NOTE_NO_LOAD },
  row_header: 'Terminal × fase',
  columns: [
    { key: 'temperatura', label: 'Temperatura', kind: 'number', unit: '°C' },
    // Typed, not computed (a narrowing recorded in `deferred-work.md`): the grammar has no derived column.
    { key: 'delta_t_similares', label: 'ΔT similares', kind: 'number', unit: '°C', optional: true },
    { key: 'delta_t_ambiente', label: 'ΔT ambiente', kind: 'number', unit: '°C', optional: true },
    {
      key: 'classe',
      label: 'Classe',
      kind: 'choice',
      options: [
        option('normal', 'Normal'),
        option('possivel_deficiencia', 'Possível deficiência'),
        option('provavel_deficiencia', 'Provável deficiência'),
        option('grave', 'Grave'),
      ],
    },
  ],
  rows: [...termografia('normal', 'Normal'), ...termografia('emergencia', 'Emergência'), ...termografia('carga', 'Carga')],
  values: [{ key: 'temperatura_ambiente', label: 'Temperatura ambiente', kind: 'number', unit: '°C' }],
  criteria: [
    {
      type: 'choice_pass',
      column: 'classe',
      pass: ['normal'],
      text: 'Classe Normal (ΔT entre similares: 1 a 3 °C possível deficiência, 4 a 15 °C provável, acima de 15 °C grave)',
      source: source('NETA tabela 100.18 (fonte secundária)'),
    },
  ],
};

const MEASUREMENT_TESTS: MeasurementTest[] = [E1_RESISTENCIA_CONTATO, E2_ISOLAMENTO_PRINCIPAL, E3_ISOLAMENTO_CONTROLE, E4_AJUSTES_CONTROLADOR, E5_TRANSFERENCIA, E6_TERMOGRAFIA];

/** The Chave de transferência automática: a library type on the measurement-table grammar, with no test of the seeded grammars. */
const CHAVE_TRANSFERENCIA_AUTOMATICA: BlockDefinition = {
  block_type: 'chave_transferencia_automatica',
  label: 'Chave de transferência automática',
  nameplate: NAMEPLATE,
  checklist: CHECKLIST,
  tests: [],
  sub_blocks: ['nameplate', 'checklist', ...MEASUREMENT_TESTS.map((test) => test.key), 'observations', 'conclusion'],
  subtypes: [],
  conclusion: true,
  measurement_tests: MEASUREMENT_TESTS,
  config_fields: CONFIG_FIELDS,
  library: true,
};

function cabinePrimariaV5(): ReportSeed {
  const seed = structuredClone(CABINE_PRIMARIA_V4);
  return { ...seed, blocks: { ...seed.blocks, chave_transferencia_automatica: CHAVE_TRANSFERENCIA_AUTOMATICA } };
}

export const CABINE_PRIMARIA_V5: ReportSeed = cabinePrimariaV5();
