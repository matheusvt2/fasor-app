import { describe, expect, it } from 'vitest';
import { SEED_VERSIONS } from '../seed/definitions.ts';
import { screenLabel } from './screen-label.ts';

/**
 * Every distinct seed label of v1 and v2 that renders on screen (block types, nameplate and
 * cabine fields, checklist items and columns, tests, table titles, connection and value
 * columns, column groups, rows, subtypes) and its screen form. Option values and units are
 * data and never pass through `screenLabel`.
 */
const SCREEN_FORMS: Record<string, string> = {
  // block types (already sentence case in the seed)
  'Cabos de entrada': 'Cabos de entrada',
  'Cabos de saída': 'Cabos de saída',
  'Chave seccionadora': 'Chave seccionadora',
  'Disjuntor MT': 'Disjuntor MT',
  'Para-raio': 'Para-raio',
  TC: 'TC',
  TP: 'TP',
  'Transformador de força': 'Transformador de força',
  // cabine fields (CARACTERÍSTICAS DA SE, AMBIENTE DE ENSAIO)
  ALTITUDE: 'Altitude',
  'POTÊNCIA INSTALADA': 'Potência instalada',
  TEMPERATURA: 'Temperatura',
  'TENSÃO PRIMÁRIA': 'Tensão primária',
  'TENSÃO SECUNDÁRIA': 'Tensão secundária',
  'TIPO DE SE': 'Tipo de SE',
  'UMIDADE RELATIVA DO AR': 'Umidade relativa do ar',
  // nameplate fields
  ACIONAMENTO: 'Acionamento',
  'AJ. BOBINA': 'Aj. bobina',
  'AJ. RELÉ 50/51': 'Aj. relé 50/51',
  'CAPACIDADE INTERRUPTOR': 'Capacidade interruptor',
  'CORRENTE NOMINAL': 'Corrente nominal',
  'DATA DE FABRICAÇÃO': 'Data de fabricação',
  'DATA FABRICAÇÃO': 'Data fabricação',
  EXATIDÃO: 'Exatidão',
  FABRICAÇÃO: 'Fabricação',
  IDENTIFICAÇÃO: 'Identificação',
  'LIGAÇÃO SECUNDÁRIA': 'Ligação secundária',
  'MEIO DE EXTINÇÃO': 'Meio de extinção',
  'Nº SÉRIE': 'Nº série',
  'POTÊNCIA NOMINAL': 'Potência nominal',
  RELAÇÃO: 'Relação',
  TAG: 'TAG',
  'TAP ATUAL': 'TAP atual',
  'TENSÃO DE PLACA': 'Tensão de placa',
  'TENSÃO NOMINAL': 'Tensão nominal',
  'TENSÃO NOMINAL AT': 'Tensão nominal AT',
  'TENSÃO NOMINAL BT': 'Tensão nominal BT',
  TIPO: 'Tipo',
  'TIPO DE ISOLAÇÃO': 'Tipo de isolação',
  'VOL. ÓLEO': 'Vol. óleo',
  // checklist columns
  C: 'C',
  NA: 'NA',
  NC: 'NC',
  OBSERVAÇÕES: 'Observações',
  ÍTEM: 'Ítem',
  // checklist items
  'ABERTURA E FECHAMENTO ELÉTRICO': 'Abertura e fechamento elétrico',
  'ABERTURA E FECHAMENTO ELÉTRICO/REMOTO': 'Abertura e fechamento elétrico/remoto',
  'ABERTURA E FECHAMENTO MANUAL': 'Abertura e fechamento manual',
  'ABERTURA E FECHAMENTO MECÂNICO': 'Abertura e fechamento mecânico',
  ATERRAMENTO: 'Aterramento',
  'ATERRAMENTO CORDOALHAS': 'Aterramento cordoalhas',
  BOBINAS: 'Bobinas',
  'BUCHAS PRIMÁRIA/SECUNDÁRIAS': 'Buchas primária/secundárias',
  'CABOS DE CONTROLE': 'Cabos de controle',
  'CARREGAMENTO MANUAL DE MOLAS': 'Carregamento manual de molas',
  'CONDIÇÃO GERAL DOS MECANISMOS': 'Condição geral dos mecanismos',
  CONEXÕES: 'Conexões',
  'CONTADOR DE OPERAÇÃO': 'Contador de operação',
  CONTATOS: 'Contatos',
  'CONTATOS AUXILIARES': 'Contatos auxiliares',
  'CONTATOS MÓVEL E FIXO': 'Contatos móvel e fixo',
  'CORROSÃO, PINTURA, VIBRAÇÕES': 'Corrosão, pintura, vibrações',
  'CÂMARA DE EXTINÇÃO': 'Câmara de extinção',
  'ELEMENTO SECANTE': 'Elemento secante',
  FIXAÇÃO: 'Fixação',
  FUSÍVEIS: 'Fusíveis',
  'INDICADOR DE POSIÇÃO': 'Indicador de posição',
  'INDICADOR NÍVEL DE ÓLEO': 'Indicador nível de óleo',
  'INTERTRAVAMENTO ELÉTRICO': 'Intertravamento elétrico',
  'INTERTRAVAMENTO MECÂNICO': 'Intertravamento mecânico',
  ISOLADOR: 'Isolador',
  ISOLADORES: 'Isoladores',
  'JUNTAS, VEDAÇÕES E VAZAMENTOS': 'Juntas, vedações e vazamentos',
  LIMPEZA: 'Limpeza',
  'LIMPEZA E LUBRIFICAÇÃO': 'Limpeza e lubrificação',
  'LÂMPADAS DE SINALIZAÇÃO': 'Lâmpadas de sinalização',
  'MECANISMO DE ACIONAMENTO': 'Mecanismo de acionamento',
  MOTOR: 'Motor',
  MUFLA: 'Mufla',
  'PINTURA, CORROSÃO': 'Pintura, corrosão',
  'REGISTROS, RADIADORES': 'Registros, radiadores',
  'RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.': 'Relé de acionamento secundário ou prim.',
  'RELÉ DE GÁS, FUNCIONAMENTO': 'Relé de gás, funcionamento',
  'RELÉ DE TEMPERATURA EXTERNO': 'Relé de temperatura externo',
  SIMULTANEIDADE: 'Simultaneidade',
  TERMÔMETRO: 'Termômetro',
  VENTILADORES: 'Ventiladores',
  'VÁLVULA DE ALÍVIO': 'Válvula de alívio',
  'ÓLEO ISOLANTE/INDICADOR DE NÍVEL': 'Óleo isolante/indicador de nível',
  // Seed v4 (Story 14.3): the sixteenth Disjuntor MT item, as `60-ficha.html` writes it.
  'NO-BREAK DE COMANDO': 'No-break de comando',
  // tests and table titles
  'ENSAIO DE ISOLAÇÃO': 'Ensaio de isolação',
  'ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO': 'Ensaio de relação de transformação',
  'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO': 'Ensaio de resistência ôhmica de contato',
  'DISJUNTOR CONTATO ABERTO': 'Disjuntor contato aberto',
  'DISJUNTOR CONTATO FECHADO': 'Disjuntor contato fechado',
  'SECCIONADORA CONTATO ABERTO': 'Seccionadora contato aberto',
  'SECCIONADORA CONTATO FECHADO': 'Seccionadora contato fechado',
  // connection columns and their group
  GUARD: 'Guard',
  LINHA: 'Linha',
  'TAP Nº': 'TAP nº',
  TERRA: 'Terra',
  "TP's": "TP's",
  TPS: 'TPS',
  'PONTO DE ENSAIO/CONEXÃO': 'Ponto de ensaio/conexão',
  // value columns and their groups
  '1 MINUTO': '1 minuto',
  '30 SEGUNDOS': '30 segundos',
  'A PRIMÁRIO': 'A primário',
  'A SECUNDÁRIO': 'A secundário',
  ABSORÇÃO: 'Absorção',
  CONDIÇÕES: 'Condições',
  'ESTAB./10MIN': 'Estab./10MIN',
  'H1-H2 / X1-X2': 'H1-H2 / X1-X2',
  'H1-H3 / X1-X0': 'H1-H3 / X1-X0',
  'H2-H1 / X2-X0': 'H2-H1 / X2-X0',
  'H3-H2 / X3-X0': 'H3-H2 / X3-X0',
  'P1-P2 / S1-S2': 'P1-P2 / S1-S2',
  POLARIZAÇÃO: 'Polarização',
  'V PRIMÁRIO': 'V primário',
  'V SECUNDÁRIO': 'V secundário',
  'VAL CALCULADO': 'Val calculado',
  VALORES: 'Valores',
  'QUALIDADE ISOLAÇÃO': 'Qualidade isolação',
  // rows
  'FASE A': 'Fase A',
  'FASE B': 'Fase B',
  'FASE C': 'Fase C',
  'FASE R': 'Fase R',
  'FASE RESERVA': 'Fase reserva',
  'FASE S': 'Fase S',
  'FASE T': 'Fase T',
  MASSA: 'Massa',
  'MASSA/BLIND.': 'Massa/blind.',
  PRIMÁRIO: 'Primário',
  SECUNDÁRIO: 'Secundário',
  T1: 'T1',
  'T1-T2': 'T1-T2',
  T2: 'T2',
  T3: 'T3',
  'T3-T4': 'T3-T4',
  T4: 'T4',
  T5: 'T5',
  'T5-T6': 'T5-T6',
  T6: 'T6',
  // subtypes
  EPÓXI: 'Epóxi',
  MANUAL: 'Manual',
  'Á SECO': 'Á seco',
  // Seed v5 (Story 14.5): the Chave de transferência automática. Its labels are written in
  // sentence case (they hold capitals a caps label could not give back) and render as written.
  'Chave de transferência automática': 'Chave de transferência automática',
  Fabricante: 'Fabricante',
  'Série': 'Série',
  'Nº de catálogo': 'Nº de catálogo',
  'Nº de série': 'Nº de série',
  Ano: 'Ano',
  'Tensão nominal': 'Tensão nominal',
  'Corrente nominal': 'Corrente nominal',
  'Frequência': 'Frequência',
  WCR: 'WCR',
  'Proteção a montante': 'Proteção a montante',
  'Controlador e firmware': 'Controlador e firmware',
  'Invólucro': 'Invólucro',
  'Torque dos terminais': 'Torque dos terminais',
  'Placa confere com o projeto': 'Placa confere com o projeto',
  'Invólucro, fixação e continuidade do aterramento do painel': 'Invólucro, fixação e continuidade do aterramento do painel',
  'Tampas e barreiras fixadas, aviso de transferência manual presente': 'Tampas e barreiras fixadas, aviso de transferência manual presente',
  'Limpeza interna, aspirada, sem soprar': 'Limpeza interna, aspirada, sem soprar',
  'Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento': 'Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento',
  'Isoladores e barramentos': 'Isoladores e barramentos',
  'Reaperto da potência ao torque da etiqueta': 'Reaperto da potência ao torque da etiqueta',
  'Reaperto da fiação de controle, chicote e fusíveis de comando': 'Reaperto da fiação de controle, chicote e fusíveis de comando',
  'Lubrificação somente conforme o fabricante, sem óleo': 'Lubrificação somente conforme o fabricante, sem óleo',
  'Operação manual com as fontes desenergizadas': 'Operação manual com as fontes desenergizadas',
  'Intertravamento mecânico e elétrico N/E': 'Intertravamento mecânico e elétrico N/E',
  'Rotação de fases da Emergência igual à da Normal': 'Rotação de fases da Emergência igual à da Normal',
  'Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento': 'Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento',
  'Registro de manobras e contador de transferências revisados': 'Registro de manobras e contador de transferências revisados',
  'Partida do gerador comandada pela chave; exercitador programado': 'Partida do gerador comandada pela chave; exercitador programado',
  'Aquecedor e ventilação, se houver': 'Aquecedor e ventilação, se houver',
  'Gerador deixado em AUTOMÁTICO ao final': 'Gerador deixado em AUTOMÁTICO ao final',
  // Seed v6 (Story 14.9): the Quadro elétrico (QGBT/QD); its type name and SELV mark are authored in sentence case.
  'Quadro elétrico (QGBT/QD)': 'Quadro elétrico (QGBT/QD)',
  FABRICANTE: 'Fabricante',
  'CORRENTE DE CURTO': 'Corrente de curto',
  IP: 'IP',
  'Circuito SELV/PELV': 'Circuito SELV/PELV',
  'LIMPEZA INTERNA E EXTERNA': 'Limpeza interna e externa',
  'PINTURA, CORROSÃO DA CAIXA': 'Pintura, corrosão da caixa',
  'RESISTÊNCIA DE AQUECIMENTO': 'Resistência de aquecimento',
  'ILUMINAÇÃO INTERNA': 'Iluminação interna',
  'RELÉS E CONTATORES': 'Relés e contatores',
  'DISJUNTORES TERMOMAGNÉTICOS': 'Disjuntores termomagnéticos',
  'INSTRUMENTOS DE MEDIÇÃO': 'Instrumentos de medição',
  BARRAMENTOS: 'Barramentos',
  'FIAÇÃO INTERNA': 'Fiação interna',
  'REAPERTO GERAL': 'Reaperto geral',
  'PLACAS DE SINALIZAÇÃO': 'Placas de sinalização',
  'ORGANIZAÇÃO INTERNA': 'Organização interna',
  'IDENTIFICAÇÃO DE CIRCUITOS': 'Identificação de circuitos',
  NEUTRO: 'Neutro',
  // The two hints, shown under their item on the sheet only.
  'FUNCIONAMENTO MECÂNICO (LIGA/DESLIGA/TRIP)': 'Funcionamento mecânico (liga/desliga/trip)',
  'CANALETA, CHICOTE, CABOS...': 'Canaleta, chicote, cabos...',
};

/** Every label of every shipped seed version that renders on screen. */
function seedScreenLabels(): Set<string> {
  const labels = new Set<string>();
  for (const bundle of Object.values(SEED_VERSIONS)) {
    for (const seed of Object.values(bundle.report_types)) {
      for (const definition of Object.values(seed.blocks)) {
        labels.add(definition.label);
        for (const field of definition.nameplate) labels.add(field.label);
        for (const item of definition.checklist ?? []) {
          labels.add(item.label);
          if (item.hint !== undefined) labels.add(item.hint);
        }
        for (const subtype of definition.subtypes) labels.add(subtype.label);
        for (const test of definition.tests) {
          labels.add(test.label);
          for (const table of test.tables) {
            if (table.title !== undefined) labels.add(table.title);
            if (table.connection_group !== undefined) labels.add(table.connection_group);
            for (const column of table.connection_columns) labels.add(column);
            for (const column of table.value_columns) {
              labels.add(column.label);
              if (column.group !== undefined) labels.add(column.group);
            }
            for (const row of table.rows) for (const cell of row) if (cell !== '') labels.add(cell);
          }
        }
      }
      for (const field of [...seed.cabine.se, ...seed.cabine.env]) labels.add(field.label);
      for (const column of seed.checklist_columns) labels.add(column);
    }
  }
  return labels;
}

describe('12.5-UNIT screenLabel (D-9: sentence case on screen, caps in the document)', () => {
  it('lists every seed label of every shipped version', () => {
    expect([...seedScreenLabels()].filter((label) => !(label in SCREEN_FORMS))).toEqual([]);
  });

  for (const [label, screen] of Object.entries(SCREEN_FORMS)) {
    it(`${label} -> ${screen}`, () => {
      expect(screenLabel(label)).toBe(screen);
    });
  }

  it('keeps acronyms, units and digits', () => {
    expect(screenLabel('TENSÃO PRIMÁRIA')).toBe('Tensão primária');
    expect(screenLabel('TIPO DE SE')).toBe('Tipo de SE');
    expect(screenLabel('TENSÃO NOMINAL AT')).toBe('Tensão nominal AT');
    expect(screenLabel('Nº SÉRIE')).toBe('Nº série');
    expect(screenLabel('TAG')).toBe('TAG');
    expect(screenLabel('MEIO DE EXTINÇÃO')).toBe('Meio de extinção');
    expect(screenLabel('30 SEGUNDOS')).toBe('30 segundos');
    expect(screenLabel('GÁS SF6')).toBe('Gás SF6');
    expect(screenLabel('TENSÃO (KV)')).toBe('Tensão (kV)');
    expect(screenLabel('Tensão (kV)')).toBe('Tensão (kV)');
    expect(screenLabel('CERTIFICADO RBC')).toBe('Certificado RBC');
    expect(screenLabel('VALOR (MΩ)')).toBe('Valor (MΩ)');
    expect(screenLabel('POTÊNCIA (KVA)')).toBe('Potência (kVA)');
    expect(screenLabel('POTÊNCIA (VA)')).toBe('Potência (VA)');
  });

  it('leaves a sentence-case label unchanged', () => {
    expect(screenLabel('Cabos de entrada')).toBe('Cabos de entrada');
    expect(screenLabel('Se houver')).toBe('Se houver');
  });

  it('Story 14.5: a label already in sentence case keeps its capitals, a single letter and a caps word included', () => {
    expect(screenLabel('Intertravamento mecânico e elétrico N/E')).toBe('Intertravamento mecânico e elétrico N/E');
    expect(screenLabel('Gerador deixado em AUTOMÁTICO ao final')).toBe('Gerador deixado em AUTOMÁTICO ao final');
    expect(screenLabel('Proteção a montante')).toBe('Proteção a montante');
    expect(screenLabel('Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento')).toBe(
      'Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento',
    );
    expect(screenLabel('EPI disponível')).toBe('EPI disponível');
    // The same words in a caps label are still turned into sentence case.
    expect(screenLabel('PROTEÇÃO A MONTANTE')).toBe('Proteção A montante');
    expect(screenLabel('GERADOR DEIXADO EM AUTOMÁTICO')).toBe('Gerador deixado em automático');
    // An acronym or a unit with a lower-case letter does not make a caps label sentence case.
    expect(screenLabel('TENSÃO (kV)')).toBe('Tensão (kV)');
    expect(screenLabel('TP\'s E TC\'s')).toBe('TP\'s e TC\'s');
    // A one-word caps label that is an acronym of the list stays as written.
    expect(screenLabel('WCR')).toBe('WCR');
  });

  it('Story 14.5: every label of the measurement tests and the configuration of a library type renders as the seed writes it', () => {
    const labels = new Set<string>();
    for (const bundle of Object.values(SEED_VERSIONS)) {
      for (const definition of Object.values(bundle.report_types.cabine_primaria.blocks)) {
        for (const field of definition.config_fields ?? []) {
          labels.add(field.label);
          for (const option of field.options) labels.add(option.label);
        }
        for (const test of definition.measurement_tests ?? []) {
          labels.add(test.label).add(test.row_header);
          for (const column of test.columns) {
            labels.add(column.label);
            for (const option of column.options ?? []) labels.add(option.label);
          }
          for (const row of test.rows) {
            labels.add(row.label);
            for (const option of row.options ?? []) labels.add(option.label);
          }
          for (const value of test.values ?? []) {
            labels.add(value.label);
            if (value.group !== undefined) labels.add(value.group);
            for (const option of value.options ?? []) labels.add(option.label);
          }
        }
      }
    }
    expect(labels.size).toBeGreaterThan(80);
    for (const label of labels) expect(screenLabel(label), label).toBe(label);
  });
});
