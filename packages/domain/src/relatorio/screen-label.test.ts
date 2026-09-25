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
};

/** Every label of every shipped seed version that renders on screen. */
function seedScreenLabels(): Set<string> {
  const labels = new Set<string>();
  for (const bundle of Object.values(SEED_VERSIONS)) {
    for (const seed of Object.values(bundle.report_types)) {
      for (const definition of Object.values(seed.blocks)) {
        labels.add(definition.label);
        for (const field of definition.nameplate) labels.add(field.label);
        for (const item of definition.checklist ?? []) labels.add(item.label);
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
  it('lists every seed label of v1 and v2', () => {
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
});
