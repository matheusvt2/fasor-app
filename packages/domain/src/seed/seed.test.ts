import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_BLOCK_TYPES, ITEM_KEYS } from '../schemas/block-config.ts';
import { SEEDED_CRITERIA } from './criteria.ts';
import {
  getDefinition,
  getSeed,
  naDefaultsFor,
  recurringFindings,
  SECTION_VARIABLES,
  sectionText,
  SEED_VERSION,
  SEED_VERSIONS,
} from './definitions.ts';
import { CABINE_PRIMARIA_V1 } from './v1.ts';
import { fieldDefSchema, type BlockDefinition, type TableDef, type TestDef } from './schema.ts';

/*
 * Story 3.1/3.2 seed tests. The golden lists below are written from `addendum.md` §9
 * (the decoded FO.SERV-03), not read back from the seed, so a transcription slip in
 * `v1.ts` fails here.
 */

const def = (type: string): BlockDefinition => getDefinition('v1', 'cabine_primaria', type);
const labels = (type: string) => def(type).nameplate.map((f) => f.label);
const items = (type: string) => def(type).checklist!.map((i) => i.label);
const test = (type: string, key: TestDef['key']): TestDef => def(type).tests.find((t) => t.key === key)!;
const table = (type: string, key: TestDef['key'], tableKey?: string): TableDef => {
  const tables = test(type, key).tables;
  return tableKey === undefined ? tables[0]! : tables.find((t) => t.key === tableKey)!;
};

/** The ASCII snake_case of a label, the rule every seed key follows. */
const snake = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const TP_LABELS = [
  'IDENTIFICAÇÃO',
  'FABRICAÇÃO',
  'Nº SÉRIE',
  'TIPO',
  'TIPO DE ISOLAÇÃO',
  'VOL. ÓLEO',
  'POTÊNCIA NOMINAL',
  'TAP ATUAL',
  'DATA FABRICAÇÃO',
  'TENSÃO NOMINAL AT',
  'TENSÃO NOMINAL BT',
  'LIGAÇÃO SECUNDÁRIA',
];

const TRANSFORMADORES_ITEMS = [
  'LIMPEZA',
  'VÁLVULA DE ALÍVIO',
  'ELEMENTO SECANTE',
  'JUNTAS, VEDAÇÕES E VAZAMENTOS',
  'INDICADOR NÍVEL DE ÓLEO',
  'VENTILADORES',
  'REGISTROS, RADIADORES',
  'RELÉ DE GÁS, FUNCIONAMENTO',
  'CORROSÃO, PINTURA, VIBRAÇÕES',
  'ATERRAMENTO',
  'BUCHAS PRIMÁRIA/SECUNDÁRIAS',
  'TERMÔMETRO',
  'ÓLEO ISOLANTE/INDICADOR DE NÍVEL',
  'CONEXÕES',
  'RELÉ DE TEMPERATURA EXTERNO',
];

const OIL_EIGHT = [
  'valvula_de_alivio',
  'elemento_secante',
  'juntas_vedacoes_e_vazamentos',
  'indicador_nivel_de_oleo',
  'registros_radiadores',
  'rele_de_gas_funcionamento',
  'termometro',
  'oleo_isolante_indicador_de_nivel',
];

describe('seed v1: nameplate fields (addendum §9.1)', () => {
  it('has the decoded field counts', () => {
    const counts = Object.fromEntries(EQUIPMENT_BLOCK_TYPES.map((t) => [t, def(t).nameplate.length]));
    expect(counts).toEqual({
      cabos_entrada: 0,
      para_raio: 5,
      chave_seccionadora: 10,
      disjuntor_mt: 13,
      tp: 12,
      tc: 14,
      cabos_saida: 0,
      transformador_forca: 12,
    });
  });

  it('has the verbatim labels in order', () => {
    expect(labels('para_raio')).toEqual(['FABRICAÇÃO', 'Nº SÉRIE', 'TIPO', 'TENSÃO NOMINAL', 'CORRENTE NOMINAL']);
    expect(labels('chave_seccionadora')).toEqual([
      'IDENTIFICAÇÃO',
      'FABRICAÇÃO',
      'Nº SÉRIE',
      'TAG',
      'TIPO',
      'MEIO DE EXTINÇÃO',
      'TENSÃO DE PLACA',
      'CORRENTE NOMINAL',
      'ACIONAMENTO',
      'DATA DE FABRICAÇÃO',
    ]);
    expect(labels('disjuntor_mt')).toEqual([
      'IDENTIFICAÇÃO',
      'FABRICAÇÃO',
      'Nº SÉRIE',
      'TAG',
      'TIPO',
      'MEIO DE EXTINÇÃO',
      'VOL. ÓLEO',
      'CORRENTE NOMINAL',
      'CAPACIDADE INTERRUPTOR',
      'DATA DE FABRICAÇÃO',
      'TENSÃO NOMINAL',
      'AJ. BOBINA',
      'AJ. RELÉ 50/51',
    ]);
    expect(labels('tp')).toEqual(TP_LABELS);
    expect(labels('tc')).toEqual([...TP_LABELS, 'RELAÇÃO', 'EXATIDÃO']);
    expect(labels('transformador_forca')).toEqual(TP_LABELS);
  });

  it('gives every field one of the six AD-11 kinds, a unit only on number or voltage_class, options only on select', () => {
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const field of def(type).nameplate) {
        expect(['text', 'number', 'date', 'select', 'manufacturer', 'voltage_class']).toContain(field.kind);
        expect(fieldDefSchema.safeParse(field).success).toBe(true);
        expect(field.key).toBe(snake(field.label));
      }
    }
  });

  it('types the fields per the Design Notes', () => {
    const kindOf = (type: string, label: string) => def(type).nameplate.find((f) => f.label === label);
    expect(kindOf('chave_seccionadora', 'FABRICAÇÃO')).toMatchObject({ kind: 'manufacturer' });
    expect(kindOf('chave_seccionadora', 'TENSÃO DE PLACA')).toMatchObject({ kind: 'voltage_class', unit: 'kV' });
    expect(kindOf('para_raio', 'TENSÃO NOMINAL')).toMatchObject({ kind: 'voltage_class' });
    expect(kindOf('disjuntor_mt', 'TENSÃO NOMINAL')).toMatchObject({ kind: 'voltage_class' });
    expect(kindOf('para_raio', 'CORRENTE NOMINAL')).toMatchObject({ kind: 'number', unit: 'kA' });
    expect(kindOf('chave_seccionadora', 'CORRENTE NOMINAL')).toMatchObject({ kind: 'number', unit: 'A' });
    expect(kindOf('disjuntor_mt', 'CAPACIDADE INTERRUPTOR')).toMatchObject({ kind: 'number', unit: 'kA' });
    expect(kindOf('disjuntor_mt', 'VOL. ÓLEO')).toMatchObject({ kind: 'number', unit: 'L' });
    expect(kindOf('disjuntor_mt', 'DATA DE FABRICAÇÃO')).toMatchObject({ kind: 'date' });
    expect(kindOf('tp', 'DATA FABRICAÇÃO')).toMatchObject({ kind: 'date' });
    expect(kindOf('tp', 'POTÊNCIA NOMINAL')).toMatchObject({ kind: 'number', unit: 'VA' });
    expect(kindOf('tc', 'POTÊNCIA NOMINAL')).toMatchObject({ kind: 'number', unit: 'VA' });
    expect(kindOf('transformador_forca', 'POTÊNCIA NOMINAL')).toMatchObject({ kind: 'number', unit: 'kVA' });
    expect(kindOf('tp', 'TENSÃO NOMINAL AT')).toMatchObject({ kind: 'number', unit: 'kV' });
    expect(kindOf('tp', 'TENSÃO NOMINAL BT')).toMatchObject({ kind: 'number', unit: 'V' });
    expect(kindOf('tp', 'TAP ATUAL')).toMatchObject({ kind: 'text' });
  });
});

describe('seed v1: selects and subtypes (FR-11)', () => {
  it('offers the verbatim select options, with EPÓXI the only spelling', () => {
    const options = (type: string, label: string) => def(type).nameplate.find((f) => f.label === label)?.options;
    expect(options('chave_seccionadora', 'MEIO DE EXTINÇÃO')).toEqual(['AR', 'SF6']);
    expect(options('disjuntor_mt', 'MEIO DE EXTINÇÃO')).toEqual(['AR', 'SF6']);
    expect(options('chave_seccionadora', 'ACIONAMENTO')).toEqual(['MANUAL/PUNHO']);
    for (const type of ['tp', 'tc', 'transformador_forca']) {
      expect(options(type, 'TIPO DE ISOLAÇÃO')).toEqual(['EPÓXI', 'Á SECO']);
    }
    const seed = getSeed('v1', 'cabine_primaria');
    expect(seed.cabine.se.find((f) => f.label === 'TIPO DE SE')?.options).toEqual([
      'SIMPLIFICADA - POSTE',
      'ALVENARIA - CONVENCIONAL',
      'BLINDADA',
    ]);
    expect(JSON.stringify(SEED_VERSIONS.v1)).not.toContain('EPOXI');
  });

  it('pre-marks MOTOR and FUSÍVEIS on a manual seccionadora and the oil-related eight on dry tp, tc and transformer', () => {
    expect(naDefaultsFor('v1', 'chave_seccionadora', 'manual')).toEqual(['motor', 'fusiveis']);
    for (const type of ['tp', 'tc', 'transformador_forca']) {
      expect(naDefaultsFor('v1', type, 'epoxi')).toEqual(OIL_EIGHT);
      expect(naDefaultsFor('v1', type, 'a_seco')).toEqual(OIL_EIGHT);
    }
    expect(naDefaultsFor('v1', 'disjuntor_mt', undefined)).toEqual([]);
    expect(() => naDefaultsFor('v1', 'disjuntor_mt', 'manual')).toThrow(/no subtype "manual"/);
  });

  it('never removes an item: every NA default is an item of the block type checklist', () => {
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      const keys = def(type).checklist!.map((i) => i.key);
      for (const subtype of def(type).subtypes) for (const na of subtype.na_defaults) expect(keys).toContain(na);
    }
  });
});

describe('seed v1: checklists (addendum §9.2)', () => {
  it('resolves the five verbatim lists', () => {
    expect(items('cabos_entrada')).toEqual(['LIMPEZA', 'MUFLA', 'CONEXÕES', 'ATERRAMENTO CORDOALHAS', 'FIXAÇÃO']);
    expect(items('cabos_saida')).toEqual(items('cabos_entrada'));
    expect(items('para_raio')).toEqual(['LIMPEZA', 'ISOLADOR', 'CONTADOR DE OPERAÇÃO', 'ATERRAMENTO', 'CONEXÕES']);
    expect(items('chave_seccionadora')).toEqual([
      'ABERTURA E FECHAMENTO MANUAL',
      'ABERTURA E FECHAMENTO ELÉTRICO',
      'MECANISMO DE ACIONAMENTO',
      'INTERTRAVAMENTO ELÉTRICO',
      'INTERTRAVAMENTO MECÂNICO',
      'ISOLADORES',
      'CONEXÕES',
      'CONTATOS',
      'MOTOR',
      'FUSÍVEIS',
      'ATERRAMENTO',
      'SIMULTANEIDADE',
      'PINTURA, CORROSÃO',
      'LIMPEZA E LUBRIFICAÇÃO',
    ]);
    expect(items('disjuntor_mt')).toEqual([
      'LIMPEZA E LUBRIFICAÇÃO',
      'ABERTURA E FECHAMENTO ELÉTRICO/REMOTO',
      'ABERTURA E FECHAMENTO MECÂNICO',
      'BOBINAS',
      'CARREGAMENTO MANUAL DE MOLAS',
      'INDICADOR DE POSIÇÃO',
      'CÂMARA DE EXTINÇÃO',
      'CONTATOS MÓVEL E FIXO',
      'ISOLADORES',
      'CABOS DE CONTROLE',
      'LÂMPADAS DE SINALIZAÇÃO',
      'CONTATOS AUXILIARES',
      'CONDIÇÃO GERAL DOS MECANISMOS',
      'RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM.',
      'ÓLEO ISOLANTE/INDICADOR DE NÍVEL',
    ]);
    for (const type of ['tp', 'tc', 'transformador_forca']) expect(items(type)).toEqual(TRANSFORMADORES_ITEMS);
  });

  it('shares one constant between tp, tc and the transformer', () => {
    const blocks = CABINE_PRIMARIA_V1.blocks;
    expect(blocks.tp.checklist).toBe(blocks.tc.checklist);
    expect(blocks.tc.checklist).toBe(blocks.transformador_forca.checklist);
    expect(def('tc').checklist).toEqual(def('tp').checklist);
  });

  it('normalizes to the one column order ÍTEM | C | NC | NA | OBSERVAÇÕES', () => {
    expect(getSeed('v1', 'cabine_primaria').checklist_columns).toEqual(['ÍTEM', 'C', 'NC', 'NA', 'OBSERVAÇÕES']);
  });

  it('keys every item by the snake_case of its label, and the item enum is exactly their union', () => {
    const all = new Set<string>();
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const it of def(type).checklist!) {
        expect(it.key).toBe(snake(it.label));
        all.add(it.key);
      }
    }
    expect([...all].sort()).toEqual([...ITEM_KEYS].sort());
  });

  it('gives every item of every list three or four NC chip phrases', () => {
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const it of def(type).checklist!) {
        expect(it.nc_phrases.length, `${type}/${it.key}`).toBeGreaterThanOrEqual(3);
        expect(it.nc_phrases.length, `${type}/${it.key}`).toBeLessThanOrEqual(4);
        expect(new Set(it.nc_phrases).size).toBe(it.nc_phrases.length);
      }
    }
  });
});

describe('seed v1: test grammars (addendum §9.3)', () => {
  const PRINT_GRID = ['30 SEGUNDOS', '1 MINUTO', 'ESTAB./10MIN', 'ABSORÇÃO', 'POLARIZAÇÃO'];
  const valueLabels = (t: TableDef) => t.value_columns.map((c) => c.label);

  it('gives the five single-table types one insulation table captured at 1 MINUTO, with the print grid', () => {
    const rows = {
      cabos_entrada: [
        ['FASE A', 'MASSA/BLIND.', ''],
        ['FASE B', 'MASSA/BLIND.', ''],
        ['FASE C', 'MASSA/BLIND.', ''],
        ['FASE RESERVA', 'MASSA/BLIND.', ''],
      ],
      para_raio: [
        ['FASE A', 'MASSA', ''],
        ['FASE B', 'MASSA', ''],
        ['FASE C', 'MASSA', ''],
        ['FASE RESERVA', 'MASSA', ''],
      ],
      tp: [
        ['FASE R', 'MASSA', ''],
        ['FASE S', 'MASSA', ''],
        ['FASE T', 'MASSA', ''],
      ],
      transformador_forca: [
        ['PRIMÁRIO', 'MASSA', 'SECUNDÁRIO'],
        ['PRIMÁRIO', 'SECUNDÁRIO', 'MASSA'],
        ['SECUNDÁRIO', 'MASSA', 'PRIMÁRIO'],
      ],
    };
    const expected: Record<string, string[][]> = { ...rows, cabos_saida: rows.cabos_entrada, tc: rows.tp };
    for (const [type, typeRows] of Object.entries(expected)) {
      const tables = test(type, 'isolacao').tables;
      expect(tables).toHaveLength(1);
      const t = tables[0]!;
      expect(t.connection_columns).toEqual(['LINHA', 'TERRA', 'GUARD']);
      expect(valueLabels(t)).toEqual(PRINT_GRID);
      expect(t.capture_column).toBe('1 MINUTO');
      expect(t.value_columns.filter((c) => c.role === 'capture').map((c) => c.label)).toEqual(['1 MINUTO']);
      expect(t.rows).toEqual(typeRows);
    }
  });

  it('gives seccionadoras and disjuntores open and closed contact tables of VALORES', () => {
    for (const [type, equipment] of [
      ['chave_seccionadora', 'SECCIONADORA'],
      ['disjuntor_mt', 'DISJUNTOR'],
    ] as const) {
      const open = table(type, 'isolacao', 'contato_aberto');
      const closed = table(type, 'isolacao', 'contato_fechado');
      expect(open.title).toBe(`${equipment} CONTATO ABERTO`);
      expect(closed.title).toBe(`${equipment} CONTATO FECHADO`);
      expect(open.rows.map((r) => r.slice(0, 2).join('/'))).toEqual(['T1/T2', 'T3/T4', 'T5/T6']);
      expect(closed.rows.map((r) => r[0])).toEqual(['FASE A', 'FASE B', 'FASE C']);
      for (const t of [open, closed]) {
        expect(valueLabels(t)).toEqual(['VALORES']);
        expect(t.capture_column).toBe('VALORES');
        expect(t.value_columns[0]!.unit).toBe('GΩ');
      }
    }
  });

  it('gives seccionadoras and disjuntores the contact resistance table in µΩ', () => {
    for (const type of ['chave_seccionadora', 'disjuntor_mt']) {
      const t = table(type, 'resistencia_contato');
      expect(t.rows).toEqual([
        ['T1-T2', 'FASE A', 'MASSA'],
        ['T3-T4', 'FASE B', 'MASSA'],
        ['T5-T6', 'FASE C', 'MASSA'],
      ]);
      expect(t.value_columns).toEqual([{ label: 'VALORES', unit: 'µΩ', role: 'capture', derived: false }]);
    }
    for (const type of ['cabos_entrada', 'para_raio', 'tp', 'tc', 'cabos_saida', 'transformador_forca']) {
      expect(def(type).tests.some((t) => t.key === 'resistencia_contato')).toBe(false);
    }
  });

  it('gives the three ratio variants, VAL CALCULADO and CONDIÇÕES derived', () => {
    const tp = table('tp', 'relacao_transformacao');
    expect([...tp.connection_columns, ...valueLabels(tp)]).toEqual([
      "TP's",
      'V PRIMÁRIO',
      'V SECUNDÁRIO',
      'VAL CALCULADO',
      'H1-H2 / X1-X2',
      'CONDIÇÕES',
    ]);
    expect(tp.rows).toEqual([['FASE R'], ['FASE S'], ['FASE T']]);
    expect(tp.capture_column).toBe('H1-H2 / X1-X2');

    const tc = table('tc', 'relacao_transformacao');
    expect([...tc.connection_columns, ...valueLabels(tc)]).toEqual([
      'TPS',
      'A PRIMÁRIO',
      'A SECUNDÁRIO',
      'VAL CALCULADO',
      'P1-P2 / S1-S2',
      'CONDIÇÕES',
    ]);
    expect(tc.rows).toEqual([['FASE R'], ['FASE S'], ['FASE T']]);

    const tr = table('transformador_forca', 'relacao_transformacao');
    expect([...tr.connection_columns, ...valueLabels(tr)]).toEqual([
      'TAP Nº',
      'V PRIMÁRIO',
      'V SECUNDÁRIO',
      'VAL CALCULADO',
      'H1-H3 / X1-X0',
      'H2-H1 / X2-X0',
      'H3-H2 / X3-X0',
      'CONDIÇÕES',
    ]);
    expect(tr.rows).toEqual([['']]);
    expect(tr.connection_typed).toBe(true);
    expect(tr.value_columns.filter((c) => c.role === 'capture').map((c) => c.label)).toEqual([
      'H1-H3 / X1-X0',
      'H2-H1 / X2-X0',
      'H3-H2 / X3-X0',
    ]);

    for (const t of [tp, tc, tr]) {
      const derived = t.value_columns.filter((c) => c.derived).map((c) => c.label);
      expect(derived).toEqual(['VAL CALCULADO', 'CONDIÇÕES']);
    }
    for (const type of ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'cabos_saida']) {
      expect(def(type).tests.some((t) => t.key === 'relacao_transformacao')).toBe(false);
    }
  });

  it('binds every test to a criterion seeded by Story 2.6', () => {
    const keys = SEEDED_CRITERIA.map((c) => c.key);
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const t of def(type).tests) {
        expect(keys).toContain(t.criterion_key);
        expect(t.criterion_key).toBe(t.key);
      }
    }
  });
});

describe('seed v1: sub-blocks and the conclusion', () => {
  it('lists the sub-blocks per type', () => {
    const subBlocks = Object.fromEntries(EQUIPMENT_BLOCK_TYPES.map((t) => [t, def(t).sub_blocks]));
    const single = ['checklist', 'isolacao', 'ia_ip_display'];
    const contact = ['nameplate', 'checklist', 'isolacao', 'resistencia_contato', 'observations', 'conclusion'];
    const withRatio = ['nameplate', ...single, 'relacao_transformacao', 'observations', 'conclusion'];
    expect(subBlocks).toEqual({
      cabos_entrada: [...single, 'observations', 'conclusion'],
      para_raio: ['nameplate', ...single, 'observations', 'conclusion'],
      chave_seccionadora: contact,
      disjuntor_mt: contact,
      tp: withRatio,
      tc: withRatio,
      cabos_saida: [...single, 'observations', 'conclusion'],
      transformador_forca: withRatio,
    });
  });

  it('ends every sheet in the conclusion, the transformer included', () => {
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      expect(def(type).conclusion).toBe(true);
      expect(def(type).sub_blocks).toContain('conclusion');
    }
  });
});

describe('seed v1: the rest of the seed', () => {
  const seed = getSeed('v1', 'cabine_primaria');

  it('has exactly the three not-tested reasons with their section 8 justification', () => {
    expect(seed.not_tested_reasons.map((r) => r.label)).toEqual([
      'Impossibilidade de desligamento',
      'Solicitação do cliente',
      'Outro',
    ]);
    expect(seed.not_tested_reasons[0]!.justification).toBe(
      'Não foi possível realizar os ensaios elétricos devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações.',
    );
    expect(seed.not_tested_reasons[1]!.justification).toBe('Os ensaios não foram realizados conforme solicitação do cliente.');
    expect(seed.not_tested_reasons[2]!.justification).toBeNull();
  });

  it('holds about ten activities and eight locations for the caption chips', () => {
    expect(seed.atividades.length).toBeGreaterThanOrEqual(9);
    expect(seed.atividades.length).toBeLessThanOrEqual(11);
    expect(seed.locais.length).toBeGreaterThanOrEqual(7);
    expect(seed.locais.length).toBeLessThanOrEqual(9);
    for (const word of [...seed.atividades, ...seed.locais]) {
      expect(['m', 'f']).toContain(word.gender);
      expect(['singular', 'plural']).toContain(word.number);
    }
  });

  it('includes the standard rain and humidity note in the quick notes', () => {
    expect(seed.quick_notes.some((note) => note.includes('chuva') && note.includes('umidade'))).toBe(true);
  });
});

describe('seed v1: section boilerplate (Story 3.2)', () => {
  const seed = getSeed('v1', 'cabine_primaria');
  const current = (section: number) => sectionText('v1', section, '2026-09-22');
  const kinds = (section: number) => {
    const count = { heading: 0, paragraph: 0, item: 0 };
    for (const block of current(section)) count[block.kind]++;
    return count;
  };
  const headings = (section: number) => current(section).filter((b) => b.kind === 'heading').map((b) => b.text);

  it('resolves sections 1-6 and 10 with the counts of the source', () => {
    expect(kinds(1)).toEqual({ heading: 0, paragraph: 2, item: 0 });
    // Six definitions, the Obs and the NR-10/PIE line.
    expect(kinds(2)).toEqual({ heading: 0, paragraph: 8, item: 0 });
    expect(current(2)[6]!.text.startsWith('Obs:')).toBe(true);
    expect(current(2)[7]!.text).toContain('NR-10');
    expect(kinds(3)).toEqual({ heading: 0, paragraph: 2, item: 3 });
    expect(current(3)[1]!.text).toBe('Exclusões:');
    expect(headings(4)).toEqual(['Documentação', 'EPC’s', 'EPI’s', 'Equipamentos de Ensaio', 'Ferramentas e Materiais']);
    expect(kinds(4)).toEqual({ heading: 5, paragraph: 0, item: 5 + 7 + 7 + 6 + 4 });
    expect(headings(6)).toEqual([
      'Cabos de Alimentação',
      'Para-Raios',
      'Chaves Seccionadoras',
      'Transformador de Potencial e Transformador de Corrente',
      'Disjuntor de MT',
      'Relé de Proteção',
      'Transformador de Força (à seco)',
      'Cubículos, QGBT’s e Quadros de Distribuição',
    ]);
    expect(kinds(6)).toEqual({ heading: 8, paragraph: 0, item: 2 + 4 + 7 + 3 + 5 + 3 + 6 + 5 });
    expect(kinds(10)).toEqual({ heading: 0, paragraph: 0, item: 3 });
  });

  it('carries section 5 with the six-step 10.5.1 sequence and the nine re-energization items', () => {
    const blocks = current(5);
    const steps = blocks.filter((b) => /^[a-f]-\)/.test(b.text));
    expect(steps.map((b) => b.text.slice(0, 3))).toEqual(['a-)', 'b-)', 'c-)', 'd-)', 'e-)', 'f-)']);
    for (const step of steps) expect(step.kind).toBe('item');
    const lead = blocks.findIndex((b) => b.text.startsWith('O estado da instalação desenergizada'));
    const after = blocks.slice(lead + 1);
    expect(after).toHaveLength(9);
    for (const block of after) expect(block.kind).toBe('item');
    expect(after.at(-1)!.text).toBe('Manobra de religamento feita de forma inversa ao desligamento (itens “a” à “f”).');
  });

  it('uses only the six named variables, and section 1 carries three of them', () => {
    const variables = new Set<string>();
    const collect = (text: string) => {
      for (const match of text.matchAll(/\{([^}]*)\}/g)) variables.add(match[1]!);
    };
    for (const entry of seed.sections) for (const block of entry.blocks ?? []) collect(block.text);
    for (const row of seed.cover.rows) collect(row.value);
    expect([...variables].sort()).toEqual([...SECTION_VARIABLES].sort());
    expect(current(1)[0]!.text).toBe(
      'O presente relatório tem por objetivo apresentar, de forma clara e objetiva, as atividades realizadas pela {empresa_executora}, referentes à manutenção preventiva e à execução de ensaios dielétricos nas Cabines Primárias de Proteção, Distribuição e Transformação de {obra} da {cliente}.',
    );
  });

  it('has the cover DADOS DO CLIENTE rows', () => {
    expect(seed.cover.title).toBe('DADOS DO CLIENTE');
    expect(seed.cover.rows).toEqual([
      { label: 'Cliente', value: '{cliente}' },
      { label: 'Cidade/local', value: '{obra}' },
      { label: 'Data da execução do serviço', value: '{datas}' },
      { label: 'Informações adicionais', value: '{escopo}' },
      { label: 'Responsável', value: '{responsavel}' },
    ]);
  });

  it('keeps an empty 2027-06-01 slot for section 5 and resolves the current text past it', () => {
    const slot = seed.sections.find((e) => e.section === 5 && e.effective_from === '2027-06-01');
    expect(slot).toEqual({ section: 5, effective_from: '2027-06-01', blocks: null });
    expect(sectionText('v1', 5, '2027-07-01')).toBe(sectionText('v1', 5, '2026-09-22'));
  });

  it('refuses a section without boilerplate', () => {
    expect(() => sectionText('v1', 7, '2026-09-22')).toThrow(/section 7/);
    expect(() => sectionText('v9', 1, '2026-09-22')).toThrow(/v9/);
  });

  it('refuses a date that is not YYYY-MM-DD, which would compare wrongly as text', () => {
    for (const date of ['2027-7-1', '22/09/2026', '2026-09-22T10:00:00Z', '']) {
      expect(() => sectionText('v1', 5, date), date).toThrow(/date must be YYYY-MM-DD/);
    }
  });
});

describe('getDefinition', () => {
  it('resolves every block type of every shipped version', () => {
    for (const version of Object.keys(SEED_VERSIONS)) {
      for (const type of EQUIPMENT_BLOCK_TYPES) {
        expect(getDefinition(version, 'cabine_primaria', type).block_type).toBe(type);
      }
    }
    expect(Object.keys(SEED_VERSIONS)).toContain(SEED_VERSION);
  });

  it('resolves the disjuntor_mt row of the I/O matrix', () => {
    const d = def('disjuntor_mt');
    expect(d.nameplate).toHaveLength(13);
    expect(d.checklist).toHaveLength(15);
    expect(d.tests.map((t) => t.key)).toEqual(['isolacao', 'resistencia_contato']);
    expect(d.tests[0]!.tables.map((t) => t.key)).toEqual(['contato_aberto', 'contato_fechado']);
    expect(d.conclusion).toBe(true);
  });

  it('throws naming the bad argument', () => {
    expect(() => getDefinition('v9', 'cabine_primaria', 'tp')).toThrow(/seed_version "v9"/);
    expect(() => getDefinition('v1', 'x', 'tp')).toThrow(/report_type "x"/);
    expect(() => getDefinition('v1', 'cabine_primaria', 'foo')).toThrow(/block_type "foo"/);
    expect(() => getDefinition('v1', 'cabine_primaria', 'section_1')).toThrow(/block_type "section_1"/);
    expect(() => getDefinition('toString', 'cabine_primaria', 'tp')).toThrow(/seed_version "toString"/);
  });

  it('hands out frozen definitions, so no consumer can edit the seed', () => {
    expect(Object.isFrozen(def('tp').nameplate)).toBe(true);
    expect(Object.isFrozen(def('tp').tests[0]!.tables[0]!.rows[0])).toBe(true);
  });
});

/** The content hash of seed v1 as merged; never updated after the merge. */
const V1_HASH = '4d7dd2b59829ad95d36150e263c48d9e50241c83291a9ba1c170fff56bf38051';

describe('seed v1 is frozen (AR-20)', () => {
  it('matches its pinned content hash; an edit must become v2', () => {
    // A relatório created under v1 must keep resolving exactly what it was created with.
    // If this fails, revert the v1 edit and add the change as `v2.ts` in `SEED_VERSIONS`.
    const hash = createHash('sha256').update(JSON.stringify(SEED_VERSIONS.v1)).digest('hex');
    expect(hash, 'seed v1 changed after it shipped: add a v2 instead').toBe(V1_HASH);
  });
});

describe('seed v2 (Stories 12.3, 12.4): v1 plus the per-unit flags and the third Não ensaiado reason', () => {
  const v1 = getSeed('v1', 'cabine_primaria');
  const v2 = getSeed('v2', 'cabine_primaria');

  it('stays in the bundle once v3 is current (AR-20: append-only)', () => {
    expect(SEED_VERSIONS.v2!.version).toBe('v2');
  });

  it('differs from v1 by exactly the per-unit flags and the reason', () => {
    // Strip the two changes from v2: what is left is v1, byte for byte.
    const stripped = structuredClone(v2) as typeof v2;
    for (const definition of Object.values(stripped.blocks)) {
      for (const field of definition.nameplate) delete (field as { per_unit?: true }).per_unit;
    }
    stripped.not_tested_reasons = stripped.not_tested_reasons.filter((reason) => reason.key !== 'equipamento_inacessivel');
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v1));
  });

  it('flags IDENTIFICAÇÃO, Nº SÉRIE and TAG per unit on every block type that carries them, and nothing else', () => {
    for (const type of EQUIPMENT_BLOCK_TYPES) {
      for (const field of v2.blocks[type].nameplate) {
        expect(field.per_unit === true, `${type}/${field.key}`).toBe(['identificacao', 'n_serie', 'tag'].includes(field.key));
      }
    }
    // Every type with a plate (the cables have none) carries Nº SÉRIE; the seccionadora carries all three.
    const withPlate = EQUIPMENT_BLOCK_TYPES.filter((type) => v2.blocks[type].nameplate.length > 0);
    expect(withPlate).toHaveLength(6);
    expect(withPlate.every((type) => v2.blocks[type].nameplate.some((field) => field.key === 'n_serie' && field.per_unit === true))).toBe(true);
    expect(v2.blocks.chave_seccionadora.nameplate.filter((field) => field.per_unit === true).map((field) => field.label)).toEqual(['IDENTIFICAÇÃO', 'Nº SÉRIE', 'TAG']);
  });

  it('offers three standard reasons plus "Outro" last, the third with its authored justification', () => {
    expect(v2.not_tested_reasons.map((r) => [r.key, r.label])).toEqual([
      ['impossibilidade_desligamento', 'Impossibilidade de desligamento'],
      ['solicitacao_cliente', 'Solicitação do cliente'],
      ['equipamento_inacessivel', 'Equipamento inacessível'],
      ['outro', 'Outro'],
    ]);
    expect(v2.not_tested_reasons[2]!.justification).toBe('Os ensaios não foram realizados devido à impossibilidade de acesso ao equipamento.');
    expect(v2.not_tested_reasons[3]!.justification).toBeNull();
    // v1 relatórios keep their three reasons (AR-20).
    expect(v1.not_tested_reasons.map((r) => r.key)).toEqual(['impossibilidade_desligamento', 'solicitacao_cliente', 'outro']);
  });
});

/** The content hash of seed v2 as merged (Stories 12.3, 12.4), pinned when v3 shipped; never updated after. */
const V2_HASH = '901b91b9e19257553e40b1eb8421fe8f6889d7a69154ff6b93b91f1b364c24ca';

describe('seed v3 (Story 6.6): v2 plus the recurring-finding chips', () => {
  const v2 = getSeed('v2', 'cabine_primaria');
  const v3 = getSeed('v3', 'cabine_primaria');

  it('is the version a new Template is created with', () => {
    expect(SEED_VERSION).toBe('v3');
    expect(SEED_VERSIONS.v3!.version).toBe('v3');
  });

  it('differs from v2 by exactly `recurring_findings`, and v1 and v2 carry none', () => {
    const stripped = structuredClone(v3) as typeof v3;
    delete stripped.recurring_findings;
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v2));
    expect('recurring_findings' in v2).toBe(false);
    expect('recurring_findings' in getSeed('v1', 'cabine_primaria')).toBe(false);
    // v2 still hashes as before this story (nothing parsed into it).
    expect(createHash('sha256').update(JSON.stringify(SEED_VERSIONS.v2)).digest('hex')).toBe(V2_HASH);
  });

  it('offers the four chips with the mock\'s texts', () => {
    expect(v3.recurring_findings!.map((finding) => finding.label)).toEqual([
      'Ausência de placas de sinalização de segurança',
      'Diagrama unifilar desatualizado',
      'Chuva e umidade elevada',
      'Ensaios pendentes',
    ]);
    expect(v3.recurring_findings![1]!.text).toBe('Emoldurar e pendurar nas cabines o diagrama unifilar atualizado (faz parte do PIE).');
  });

  it('recurringFindings: a version with none (v1, v2) or unknown falls back to the current seed\'s list', () => {
    expect(recurringFindings('v3')).toEqual(v3.recurring_findings);
    expect(recurringFindings('v1')).toEqual(v3.recurring_findings);
    expect(recurringFindings('v2')).toEqual(v3.recurring_findings);
    expect(recurringFindings('v99')).toEqual(v3.recurring_findings);
  });
});
