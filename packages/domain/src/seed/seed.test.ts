import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BASE_EQUIPMENT_BLOCK_TYPES, EQUIPMENT_BLOCK_TYPES, ITEM_KEYS, SITE_ITEM_KEYS, SUB_BLOCK_KEYS } from '../schemas/block-config.ts';
import { SEEDED_CRITERIA } from './criteria.ts';
import { CRITERION_ROW_STATUSES, NETA_100_1, NETA_100_5 } from './criteria-tables.ts';
import {
  equipmentTypesOf,
  findDefinition,
  findSeed,
  getDefinition,
  getSeed,
  isLibraryType,
  naDefaultsFor,
  recurringFindings,
  SECTION_VARIABLES,
  sectionText,
  SEED_VERSION,
  SEED_VERSIONS,
  siteChecklistOf,
  siteItems,
} from './definitions.ts';
import { VECTOR_GROUP_CODES } from '../relatorio/vector-group.ts';
import { LEGACY_OPTION_VERSIONS, withLegacyOptions } from './legacy-options.ts';
import { CABINE_PRIMARIA_V1 } from './v1.ts';
import { CABINE_PRIMARIA_V2 } from './v2.ts';
import { CABINE_PRIMARIA_V3 } from './v3.ts';
import { CABINE_PRIMARIA_V4 } from './v4.ts';
import { CABINE_PRIMARIA_V5 } from './v5.ts';
import { measurementCriterionSchema, measurementTestSchema, type MeasurementTest } from './measurement.ts';
import { blockDefinitionSchema, fieldDefSchema, reportSeedSchema, seedBundleSchema, type BlockDefinition, type FieldDef, type ReportSeed, type TableDef, type TestDef } from './schema.ts';

/** v1 to v5 as merged, before the 2026-11-04 option amendment (`legacy-options.ts`). */
const AS_SHIPPED: Readonly<Record<string, ReportSeed>> = { v1: CABINE_PRIMARIA_V1, v2: CABINE_PRIMARIA_V2, v3: CABINE_PRIMARIA_V3, v4: CABINE_PRIMARIA_V4, v5: CABINE_PRIMARIA_V5 };

/**
 * A version's bundle as it shipped: v1 to v5 without the 2026-11-04 options, parsed as
 * `definitions.ts` parses them; every later version as served. The content hashes pin this.
 */
function shipped(version: string): unknown {
  const raw = AS_SHIPPED[version];
  return raw === undefined ? SEED_VERSIONS[version] : seedBundleSchema.parse({ version, report_types: { cabine_primaria: raw } });
}

/*
 * Story 3.1/3.2 seed tests. The golden lists below are written from `addendum.md` §9
 * (the decoded FO.SERV-03), not read back from the seed, so a transcription slip in
 * `v1.ts` fails here.
 */

/** The eight FO.SERV-03 types: what v1 to v4 ship. `EQUIPMENT_BLOCK_TYPES` holds a ninth since seed v5 (Story 14.5). */
const EIGHT = BASE_EQUIPMENT_BLOCK_TYPES;

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
    const counts = Object.fromEntries(EIGHT.map((t) => [t, def(t).nameplate.length]));
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
    for (const type of EIGHT) {
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
    // 2026-11-04 (Matheus): VÁCUO and ÓLEO appended on the disjuntor, ÓLEO on the transformador de força (`legacy-options.ts`).
    expect(options('disjuntor_mt', 'MEIO DE EXTINÇÃO')).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO']);
    expect(options('chave_seccionadora', 'MEIO DE EXTINÇÃO')).toEqual(['AR', 'SF6']);
    expect(options('chave_seccionadora', 'ACIONAMENTO')).toEqual(['MANUAL/PUNHO']);
    for (const type of ['tp', 'tc']) {
      expect(options(type, 'TIPO DE ISOLAÇÃO')).toEqual(['EPÓXI', 'Á SECO']);
    }
    expect(options('transformador_forca', 'TIPO DE ISOLAÇÃO')).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
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
    for (const type of EIGHT) {
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

  it('keys every item by the snake_case of its label, and the item enum is exactly their union plus what later versions appended', () => {
    const all = new Set<string>();
    for (const type of EIGHT) {
      for (const it of def(type).checklist!) {
        expect(it.key).toBe(snake(it.label));
        all.add(it.key);
      }
    }
    // Seed v4 (Story 14.3) appended one key to the enum, seed v5 (Story 14.5) seventeen and seed
    // v6 (Story 14.9) thirteen and seed v10 (Story 15.7) four; v1 itself lists what it always did.
    expect([...all].sort()).toEqual(ITEM_KEYS.slice(0, 44).sort());
    expect(all.size).toBe(44);
    expect(ITEM_KEYS[44]).toBe('no_break_de_comando');
    expect(ITEM_KEYS).toHaveLength(79);
  });

  it('gives every item of every list three or four NC chip phrases', () => {
    for (const type of EIGHT) {
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
    for (const type of EIGHT) {
      for (const t of def(type).tests) {
        expect(keys).toContain(t.criterion_key);
        expect(t.criterion_key).toBe(t.key);
      }
    }
  });
});

describe('seed v1: sub-blocks and the conclusion', () => {
  it('lists the sub-blocks per type', () => {
    const subBlocks = Object.fromEntries(EIGHT.map((t) => [t, def(t).sub_blocks]));
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
    for (const type of EIGHT) {
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

  it('uses only the six named variables of v1 (seed v8 adds two, pinned there), and section 1 carries three of them', () => {
    const variables = new Set<string>();
    const collect = (text: string) => {
      for (const match of text.matchAll(/\{([^}]*)\}/g)) variables.add(match[1]!);
    };
    for (const entry of seed.sections) for (const block of entry.blocks ?? []) collect(block.text);
    for (const row of seed.cover.rows) collect(row.value);
    expect([...variables].sort()).toEqual(SECTION_VARIABLES.filter((name) => name !== 'itens_resultados').sort());
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
    expect(() => sectionText('v99', 1, '2026-09-22')).toThrow(/v99/);
  });

  it('refuses a date that is not YYYY-MM-DD, which would compare wrongly as text', () => {
    for (const date of ['2027-7-1', '22/09/2026', '2026-09-22T10:00:00Z', '']) {
      expect(() => sectionText('v1', 5, date), date).toThrow(/date must be YYYY-MM-DD/);
    }
  });
});

describe('getDefinition', () => {
  it('resolves every block type each shipped version holds: the eight on all of them', () => {
    for (const version of Object.keys(SEED_VERSIONS)) {
      for (const type of EIGHT) {
        expect(getDefinition(version, 'cabine_primaria', type).block_type).toBe(type);
      }
      for (const type of equipmentTypesOf(version)) expect(getDefinition(version, 'cabine_primaria', type).block_type).toBe(type);
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
    expect(() => getDefinition('v99', 'cabine_primaria', 'tp')).toThrow(/seed_version "v99"/);
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
    const hash = createHash('sha256').update(JSON.stringify(shipped('v1'))).digest('hex');
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
    for (const type of EIGHT) {
      for (const field of v2.blocks[type].nameplate) {
        expect(field.per_unit === true, `${type}/${field.key}`).toBe(['identificacao', 'n_serie', 'tag'].includes(field.key));
      }
    }
    // Every type with a plate (the cables have none) carries Nº SÉRIE; the seccionadora carries all three.
    const withPlate = EIGHT.filter((type) => v2.blocks[type].nameplate.length > 0);
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

  it('stays in the bundle once v4 is current (AR-20: append-only)', () => {
    expect(SEED_VERSIONS.v3!.version).toBe('v3');
  });

  it('differs from v2 by exactly `recurring_findings`, and v1 and v2 carry none', () => {
    const stripped = structuredClone(v3) as typeof v3;
    delete stripped.recurring_findings;
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v2));
    expect('recurring_findings' in v2).toBe(false);
    expect('recurring_findings' in getSeed('v1', 'cabine_primaria')).toBe(false);
    // v2 still hashes as before this story (nothing parsed into it).
    expect(createHash('sha256').update(JSON.stringify(shipped('v2'))).digest('hex')).toBe(V2_HASH);
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
    // v4 carries v3's chips unchanged, so the fallback reads the same list.
    expect(recurringFindings(SEED_VERSION)).toEqual(v3.recurring_findings);
  });
});

/** The content hash of seed v3 as merged (Story 6.6), pinned when v4 shipped; never updated after. */
const V3_HASH = '9c0ba05dcdd1652629ba794d4762c5ec7adfd585bf5c2e853d3310425b67e4dc';

describe('seed v4 (Story 14.3): v3 plus the site checklist and the NO-BREAK DE COMANDO item', () => {
  const v3 = getSeed('v3', 'cabine_primaria');
  const v4 = getSeed('v4', 'cabine_primaria');

  /** The 19 site items in their six groups, written from `sprint-change-proposal-2026-10-08.md` § 4.1, not read back from the seed. */
  const SITE_GROUPS: [string, string, [string, string][]][] = [
    [
      'seguranca_e_epc_no_local',
      'Segurança e EPC no local',
      [
        ['luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido', 'Luvas isolantes compatíveis com a tensão, com ensaio dielétrico válido'],
        ['tapete_ou_estrado_isolante', 'Tapete ou estrado isolante'],
        ['vara_de_manobra_com_ensaio_dieletrico_valido', 'Vara de manobra com ensaio dielétrico válido'],
        ['detector_de_tensao', 'Detector de tensão'],
        ['conjunto_de_aterramento_temporario', 'Conjunto de aterramento temporário'],
        ['epi_disponivel', 'EPI disponível'],
        ['dispositivos_de_bloqueio_e_cartoes_de_impedimento', 'Dispositivos de bloqueio e cartões de impedimento'],
      ],
    ],
    [
      'combate_a_incendio',
      'Combate a incêndio',
      [
        [
          'extintor_de_incendio_carregado_lacrado_dentro_da_validade_sinalizado_e_desobstruido',
          'Extintor de incêndio carregado, lacrado, dentro da validade, sinalizado e desobstruído',
        ],
        ['bacia_de_contencao_de_oleo', 'Bacia de contenção de óleo'],
      ],
    ],
    [
      'iluminacao',
      'Iluminação',
      [
        ['iluminacao_normal', 'Iluminação normal'],
        ['iluminacao_de_emergencia_autonomia_minima_de_2_h', 'Iluminação de emergência (autonomia mínima de 2 h)'],
      ],
    ],
    [
      'aterramento',
      'Aterramento',
      [
        ['portas_telas_e_grades_aterradas', 'Portas, telas e grades aterradas'],
        ['pontos_para_aterramento_temporario', 'Pontos para aterramento temporário'],
      ],
    ],
    [
      'sinalizacao_e_documentacao',
      'Sinalização e documentação',
      [
        ['placas_de_advertencia_na_porta_e_nas_grades', 'Placas de advertência na porta e nas grades'],
        ['diagrama_unifilar_atualizado_no_local', 'Diagrama unifilar atualizado no local'],
        ['circuitos_e_equipamentos_identificados', 'Circuitos e equipamentos identificados'],
      ],
    ],
    [
      'ambiente',
      'Ambiente',
      [
        ['porta_abrindo_para_fora_com_fechadura', 'Porta abrindo para fora, com fechadura'],
        ['ventilacao', 'Ventilação'],
        ['limpeza_e_ausencia_de_infiltracao', 'Limpeza e ausência de infiltração'],
      ],
    ],
  ];

  it('stays in the bundle once v5 is current (AR-20: append-only)', () => {
    expect(SEED_VERSIONS.v4!.version).toBe('v4');
    expect(Object.keys(SEED_VERSIONS).slice(0, 4)).toEqual(['v1', 'v2', 'v3', 'v4']);
  });

  it('differs from v3 by exactly `site_checklist` and the sixteenth Disjuntor MT item, and v1 to v3 hash as they shipped', () => {
    // Strip the two additions from v4: what is left is v3, byte for byte.
    const stripped = structuredClone(v4) as typeof v4;
    delete stripped.site_checklist;
    stripped.blocks.disjuntor_mt.checklist = stripped.blocks.disjuntor_mt.checklist!.filter((item) => item.key !== 'no_break_de_comando');
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v3));
    for (const version of ['v1', 'v2', 'v3']) expect('site_checklist' in getSeed(version, 'cabine_primaria'), version).toBe(false);
    const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3'), 'seed v3 changed after it shipped: add a new version instead').toBe(V3_HASH);
  });

  it('appends NO-BREAK DE COMANDO as the sixteenth Disjuntor MT item with the mock\'s three chips, on no other list and no earlier version', () => {
    const list = v4.blocks.disjuntor_mt.checklist!;
    expect(list).toHaveLength(16);
    expect(list.slice(0, 15)).toEqual(v3.blocks.disjuntor_mt.checklist);
    expect(list[15]).toEqual({
      key: 'no_break_de_comando',
      label: 'NO-BREAK DE COMANDO',
      nc_phrases: ['No-break inoperante', 'Bateria vencida ou estufada', 'Sem autonomia para o relé'],
    });
    expect(list[15]!.key).toBe(snake(list[15]!.label));
    for (const type of EIGHT) {
      const has = v4.blocks[type].checklist!.some((item) => item.key === 'no_break_de_comando');
      expect(has, type).toBe(type === 'disjuntor_mt');
    }
    for (const version of ['v1', 'v2', 'v3']) {
      const earlier = getSeed(version, 'cabine_primaria').blocks.disjuntor_mt.checklist!;
      expect(earlier, version).toHaveLength(15);
      expect(earlier.some((item) => item.key === 'no_break_de_comando'), version).toBe(false);
    }
    // The item enum of every seeded list is exactly the union across the shipped versions.
    const all = new Set<string>();
    for (const bundle of Object.values(SEED_VERSIONS)) {
      for (const definition of Object.values(bundle.report_types.cabine_primaria.blocks)) for (const item of definition.checklist ?? []) all.add(item.key);
    }
    expect([...all].sort()).toEqual([...ITEM_KEYS].sort());
    // No subtype pre-marks the new item NA: it is answered on site (NA when the breaker has no no-break).
    expect(v4.blocks.disjuntor_mt.subtypes.flatMap((subtype) => subtype.na_defaults)).not.toContain('no_break_de_comando');
  });

  it('ships the 19 site items in six groups of 7, 2, 2, 2, 3 and 3, by name and in order', () => {
    const list = v4.site_checklist!;
    expect(list.groups.map((group) => [group.key, group.label, group.items.map((item) => [item.key, item.label])])).toEqual(SITE_GROUPS);
    expect(list.groups.map((group) => group.items.length)).toEqual([7, 2, 2, 2, 3, 3]);
    const keys = list.groups.flatMap((group) => group.items.map((item) => item.key));
    // Seed v9 (Story 15.3) appends two keys: v4 offers the first 19.
    expect(keys).toEqual(SITE_ITEM_KEYS.slice(0, 19));
    expect(keys).toHaveLength(19);
    for (const group of list.groups) {
      expect(group.key).toBe(snake(group.label));
      for (const item of group.items) expect(item.key, item.label).toBe(snake(item.label));
    }
  });

  it('gives every site item three or four distinct NC phrases, the emergency lighting item the mock\'s three', () => {
    for (const item of v4.site_checklist!.groups.flatMap((group) => group.items)) {
      expect(item.nc_phrases.length, item.key).toBeGreaterThanOrEqual(3);
      expect(item.nc_phrases.length, item.key).toBeLessThanOrEqual(4);
      expect(new Set(item.nc_phrases).size, item.key).toBe(item.nc_phrases.length);
    }
    const emergencia = v4.site_checklist!.groups[2]!.items[1]!;
    expect(emergencia.nc_phrases).toEqual(['Luminária de emergência inoperante', 'Autonomia abaixo de 2 h', 'Sem iluminação de emergência']);
  });

  it('siteChecklistOf: the list on v4, null on v1 to v3 and on an unknown version', () => {
    expect(siteChecklistOf('v4')).toBe(v4.site_checklist);
    for (const version of ['v1', 'v2', 'v3', 'v99', 'toString', '']) expect(siteChecklistOf(version), version).toBeNull();
  });

  it('siteItems: flat, numbered 1 to 19 across the groups, each with its group and phrases; none where there is no list', () => {
    const items = siteItems('v4');
    expect(items.map((item) => item.number)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(items.map((item) => item.key)).toEqual(SITE_ITEM_KEYS.slice(0, 19));
    expect(items[0]).toEqual({
      key: 'luvas_isolantes_compativeis_com_a_tensao_com_ensaio_dieletrico_valido',
      label: 'Luvas isolantes compatíveis com a tensão, com ensaio dielétrico válido',
      groupKey: 'seguranca_e_epc_no_local',
      number: 1,
      nc_phrases: ['Luvas isolantes ausentes', 'Ensaio dielétrico das luvas vencido', 'Classe das luvas incompatível com a tensão', 'Luvas com furos ou ressecadas'],
    });
    expect(items[10]).toMatchObject({ key: 'iluminacao_de_emergencia_autonomia_minima_de_2_h', groupKey: 'iluminacao', number: 11 });
    expect(items[18]).toMatchObject({ key: 'limpeza_e_ausencia_de_infiltracao', groupKey: 'ambiente', number: 19 });
    expect(items.filter((item) => item.groupKey === 'seguranca_e_epc_no_local')).toHaveLength(7);
    // The same frozen list every call, so a reader can hold it.
    expect(siteItems('v4')).toBe(items);
    expect(Object.isFrozen(items)).toBe(true);
    expect(Object.isFrozen(items[0])).toBe(true);
    for (const version of ['v1', 'v2', 'v3', 'v99']) expect(siteItems(version), version).toEqual([]);
  });
});

/** The content hash of seed v4 as merged (Story 14.3), pinned from the untouched tree before Story 14.5 touched a schema; never updated after. */
const V4_HASH = '1dff2361abf1e04467d3e3fcc2e3857fe0bda55d11776bc97030f429255cfd69';

describe('seed v5 (Story 14.5): v4 plus one block type, the Chave de transferência automática', () => {
  const v4 = getSeed('v4', 'cabine_primaria');
  const v5 = getSeed('v5', 'cabine_primaria');
  const CTA = 'chave_transferencia_automatica';
  const cta = getDefinition('v5', 'cabine_primaria', CTA);
  const tests = cta.measurement_tests!;
  const test = (key: string): MeasurementTest => tests.find((candidate) => candidate.key === key)!;
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');

  /** The 17 checks, written from `sprint-change-proposal-2026-10-08.md` § 8.4, not read back from the seed. */
  const ITEMS = [
    'Placa confere com o projeto',
    'Invólucro, fixação e continuidade do aterramento do painel',
    'Tampas e barreiras fixadas, aviso de transferência manual presente',
    'Limpeza interna, aspirada, sem soprar',
    'Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento',
    'Isoladores e barramentos',
    'Reaperto da potência ao torque da etiqueta',
    'Reaperto da fiação de controle, chicote e fusíveis de comando',
    'Lubrificação somente conforme o fabricante, sem óleo',
    'Operação manual com as fontes desenergizadas',
    'Intertravamento mecânico e elétrico N/E',
    'Rotação de fases da Emergência igual à da Normal',
    'Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento',
    'Registro de manobras e contador de transferências revisados',
    'Partida do gerador comandada pela chave; exercitador programado',
    'Aquecedor e ventilação, se houver',
    'Gerador deixado em AUTOMÁTICO ao final',
  ];

  /** The 13 plate fields of § 8.4 with their units. */
  const PLATE: [string, string, string | null][] = [
    ['Fabricante', 'manufacturer', null],
    ['Série', 'text', null],
    ['Nº de catálogo', 'text', null],
    ['Nº de série', 'text', null],
    ['Ano', 'text', null],
    ['Tensão nominal', 'number', 'V'],
    ['Corrente nominal', 'number', 'A'],
    ['Frequência', 'number', 'Hz'],
    ['WCR', 'number', 'kA'],
    ['Proteção a montante', 'text', null],
    ['Controlador e firmware', 'text', null],
    ['Invólucro', 'text', null],
    ['Torque dos terminais', 'number', 'N·m'],
  ];

  it('was the version a new Template is created with until seed v6 (Stories 14.9 and 14.11), and stays resolvable', () => {
    expect(SEED_VERSIONS.v5!.version).toBe('v5');
    expect(Object.keys(SEED_VERSIONS).slice(0, 5)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
  });

  it('differs from v4 by exactly the CTA block type, and v1 to v4 hash as they shipped', () => {
    // Strip the one addition from v5: what is left is v4, byte for byte.
    const stripped = structuredClone(v5) as typeof v5;
    delete stripped.blocks.chave_transferencia_automatica;
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v4));
    expect(Object.keys(v5.blocks)).toEqual([...EIGHT, CTA]);
    expect(Object.keys(v5.blocks)).toEqual(EQUIPMENT_BLOCK_TYPES.slice(0, 9));
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      const seed = getSeed(version, 'cabine_primaria');
      expect(Object.keys(seed.blocks), version).toEqual([...EIGHT]);
      // None of the eight gained a key of the new grammar: nothing was parsed into them.
      for (const definition of Object.values(seed.blocks)) {
        for (const key of ['measurement_tests', 'config_fields', 'library']) expect(key in definition, `${version}/${definition.block_type}/${key}`).toBe(false);
      }
    }
    for (const type of EIGHT) expect(JSON.stringify(v5.blocks[type]), type).toBe(JSON.stringify(v4.blocks[type]));
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4'), 'seed v4 changed after it shipped: add a new version instead').toBe(V4_HASH);
  });

  it('the type exists on v5 only: getDefinition throws naming both on v1 to v4, findDefinition answers null', () => {
    expect(cta.block_type).toBe(CTA);
    expect(cta.label).toBe('Chave de transferência automática');
    expect(cta.library).toBe(true);
    expect(cta.conclusion).toBe(true);
    expect(cta.tests).toEqual([]);
    expect(cta.subtypes).toEqual([]);
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      expect(() => getDefinition(version, 'cabine_primaria', CTA), version).toThrow(new RegExp(`block_type "${CTA}" is not in seed_version "${version}"`));
      expect(findDefinition(version, CTA), version).toBeNull();
      expect(isLibraryType(version, CTA), version).toBe(false);
      expect(() => naDefaultsFor(version, CTA, undefined), version).not.toThrow();
    }
    expect(findDefinition('v5', CTA)).toBe(cta);
    expect(isLibraryType('v5', CTA)).toBe(true);
    for (const type of EIGHT) expect(isLibraryType('v5', type), type).toBe(false);
  });

  it('equipmentTypesOf: the eight on v1 to v4, the eight then the CTA on v5, the eight for a version this bundle does not ship', () => {
    for (const version of ['v1', 'v2', 'v3', 'v4']) expect(equipmentTypesOf(version), version).toEqual([...EIGHT]);
    expect(equipmentTypesOf('v5')).toEqual([...EIGHT, CTA]);
    expect(equipmentTypesOf('v5')).toBe(equipmentTypesOf('v5'));
    for (const version of ['v99', 'toString', '']) expect(equipmentTypesOf(version), version).toEqual([...EIGHT]);
  });

  it('carries the 17 checks of § 8.4 by name and in order, each keyed by the snake_case of its label and with three or four distinct NC phrases', () => {
    const list = cta.checklist!;
    expect(list.map((item) => item.label)).toEqual(ITEMS);
    expect(list).toHaveLength(17);
    for (const item of list) {
      expect(item.key, item.label).toBe(snake(item.label));
      expect(item.nc_phrases.length, item.key).toBeGreaterThanOrEqual(3);
      expect(item.nc_phrases.length, item.key).toBeLessThanOrEqual(4);
      expect(new Set(item.nc_phrases).size, item.key).toBe(item.nc_phrases.length);
    }
    // The 17 keys are the tail of the closed item enum, in the same order.
    expect(list.map((item) => item.key)).toEqual(ITEM_KEYS.slice(45, 62));
    // The chips `63-ficha-cta.html` draws on item 3.
    expect(list[2]!.nc_phrases).toEqual(['Aviso ausente', 'Barreira solta', 'Tampa sem parafusos']);
    // None of the eight shares an item with it.
    for (const type of EIGHT) {
      const keys = new Set(v5.blocks[type].checklist!.map((item) => item.key));
      expect(list.filter((item) => keys.has(item.key)), type).toEqual([]);
    }
  });

  it('carries the 13 plate fields of § 8.4 plus the identity fields the eight carry (IDENTIFICAÇÃO and TAG)', () => {
    const own = cta.nameplate.filter((field) => field.key !== 'identificacao' && field.key !== 'tag');
    expect(own.map((field) => [field.label, field.kind, field.unit ?? null])).toEqual(PLATE);
    expect(cta.nameplate).toHaveLength(15);
    expect(cta.nameplate[0]).toEqual({ key: 'identificacao', label: 'IDENTIFICAÇÃO', kind: 'text', per_unit: true });
    // The two identity fields are the seccionadora's own definitions, as seed v2 flagged them.
    const seccionadora = v5.blocks.chave_seccionadora.nameplate;
    expect(cta.nameplate.find((field) => field.key === 'identificacao')).toEqual(seccionadora.find((field) => field.key === 'identificacao'));
    expect(cta.nameplate.find((field) => field.key === 'tag')).toEqual(seccionadora.find((field) => field.key === 'tag'));
    for (const field of cta.nameplate) {
      expect(field.key, field.label).toBe(snake(field.label));
      expect(fieldDefSchema.safeParse(field).success, field.key).toBe(true);
    }
    // The fields of one physical unit are never copied by "Igual à ⟨TAG⟩?".
    expect(cta.nameplate.filter((field) => field.per_unit === true).map((field) => field.key)).toEqual(['identificacao', 'n_de_serie', 'tag']);
    expect(new Set(cta.nameplate.map((field) => field.key)).size).toBe(15);
  });

  it('configures tensão, polos, neutro, transição and bypass, with the defaults BT, 3, sólido, aberta, não', () => {
    expect(cta.config_fields!.map((field) => [field.key, field.label, field.options.map((option) => option.key), field.default])).toEqual([
      ['tensao', 'Tensão', ['bt', 'mt'], 'bt'],
      ['polos', 'Polos', ['2', '3', '4'], '3'],
      ['neutro', 'Neutro', ['solido', 'chaveado', 'sobreposto'], 'solido'],
      ['transicao', 'Transição', ['aberta', 'retardada', 'fechada'], 'aberta'],
      ['bypass', 'Bypass-isolation', ['sim', 'nao'], 'nao'],
    ]);
  });

  it('holds six measurement tests, E1 to E6, each a sub-block; E4 and E5 cannot be switched off, E1 to E3 offer an instrument', () => {
    const keys = ['cta_resistencia_contato', 'cta_isolamento_principal', 'cta_isolamento_controle', 'cta_ajustes_controlador', 'cta_transferencia', 'cta_termografia'];
    expect(tests.map((candidate) => candidate.key)).toEqual(keys);
    expect(tests.map((candidate) => candidate.label)).toEqual([
      'Resistência de contato',
      'Isolamento principal',
      'Isolamento do controle',
      'Ajustes do controlador',
      'Transferência',
      'Termografia sob carga',
    ]);
    expect(cta.sub_blocks).toEqual(['nameplate', 'checklist', ...keys, 'observations', 'conclusion']);
    // Batch e23t appends after them (seed v13): the six stay contiguous where Story 14.5 appended them.
    expect(SUB_BLOCK_KEYS.slice(SUB_BLOCK_KEYS.indexOf('cta_resistencia_contato'), SUB_BLOCK_KEYS.indexOf('cta_resistencia_contato') + 6)).toEqual(keys);
    expect(tests.map((candidate) => candidate.switchable !== undefined)).toEqual([true, true, true, false, false, true]);
    expect(tests.map((candidate) => candidate.instrument_of ?? null)).toEqual(['resistencia_contato', 'isolacao', 'isolacao', null, null, null]);
    for (const candidate of tests) expect(measurementTestSchema.safeParse(candidate).success, candidate.key).toBe(true);
  });

  it('E1 to E3: the rows, columns and units of § 8.4, the pole rows by configuration, Linha-carga fixed under the two closed columns', () => {
    const e1 = test('cta_resistencia_contato');
    expect(e1.row_header).toBe('Polo');
    expect(e1.columns.map((column) => [column.key, column.label, column.kind, column.unit])).toEqual([
      ['lado_normal', 'Lado Normal', 'number', 'µΩ'],
      ['lado_emergencia', 'Lado Emergência', 'number', 'µΩ'],
    ]);
    expect(e1.rows.map((row) => [row.label, row.when?.in ?? null])).toEqual([
      ['Polo A', null],
      ['Polo B', null],
      ['Polo C', ['3', '4']],
      ['Polo N', ['4']],
    ]);
    // 2026-10-14 (Bruno): E1 records its test current, required as E6's ambient temperature.
    expect(e1.values!.map((value) => [value.key, value.label, value.kind, value.unit, value.optional ?? false])).toEqual([['corrente_ensaio', 'Corrente de ensaio', 'number', 'A', false]]);
    const e2 = test('cta_isolamento_principal');
    expect(e2.columns.map((column) => [column.label, column.unit])).toEqual([
      ['Normal fechada', 'MΩ'],
      ['Emergência fechada', 'MΩ'],
      ['Aberta', 'MΩ'],
    ]);
    expect(e2.rows.map((row) => [row.label, row.when?.in ?? null])).toEqual([
      ['A-T', null],
      ['B-T', null],
      ['C-T', ['3', '4']],
      // 2026-10-14 (Bruno): no N-T row; § 8.4's seven.
      ['A-B', null],
      ['B-C', ['3', '4']],
      ['C-A', ['3', '4']],
      ['Linha-carga', null],
    ]);
    expect(e2.rows.some((row) => row.key === 'n_t' || row.label === 'N-T')).toBe(false);
    expect(e2.rows[6]!.fixed).toEqual({ normal_fechada: '—', emergencia_fechada: '—' });
    for (const row of [...e1.rows, ...e2.rows]) if (row.when !== undefined) expect(row.when.config).toBe('polos');
    const e3 = test('cta_isolamento_controle');
    expect(e3.rows.map((row) => row.label)).toEqual(['Fiação × terra']);
    expect(e3.columns.map((column) => [column.label, column.unit])).toEqual([['Valor', 'MΩ']]);
  });

  it('E4: pickup and dropout of tensão and frequência for Normal and Emergência, falta de fase, the four delays and the exercitador, across Fábrica (optional), Projeto, Encontrado and Deixado', () => {
    const e4 = test('cta_ajustes_controlador');
    expect(e4.columns.map((column) => [column.key, column.label, column.optional ?? false])).toEqual([
      ['fabrica', 'Fábrica', true],
      ['projeto', 'Projeto', false],
      ['encontrado', 'Encontrado', false],
      ['deixado', 'Deixado', false],
    ]);
    expect(e4.rows.map((row) => [row.label, row.kind, row.unit ?? row.options!.map((option) => option.label)])).toEqual([
      ['Normal · pickup de tensão', 'number', '%'],
      ['Normal · dropout de tensão', 'number', '%'],
      ['Normal · pickup de frequência', 'number', '%'],
      ['Normal · dropout de frequência', 'number', '%'],
      ['Emergência · pickup de tensão', 'number', '%'],
      ['Emergência · dropout de tensão', 'number', '%'],
      ['Emergência · pickup de frequência', 'number', '%'],
      ['Emergência · dropout de frequência', 'number', '%'],
      ['Falta de fase', 'choice', ['Ligado', 'Desligado']],
      ['TD 1C · retardo de partida', 'number', 's'],
      ['TD 2B · transferência', 'number', 's'],
      ['TD 3A · retransferência', 'number', 'min'],
      ['TD 2E · resfriamento', 'number', 'min'],
      ['Exercitador', 'choice', ['Desligado', 'Semanal', 'Quinzenal', 'Mensal']],
    ]);
    expect(e4.criteria).toHaveLength(1);
    expect(e4.criteria[0]).toMatchObject({ type: 'equals_column', column: 'deixado', reference: 'projeto' });
  });

  it('E5: the five steps across Ajuste (optional, fixed on two rows) and Medido, the options as test values, "não realizado" skipping the table', () => {
    const e5 = test('cta_transferencia');
    expect(e5.columns.map((column) => [column.key, column.optional ?? false])).toEqual([
      ['ajuste', true],
      ['medido', false],
    ]);
    expect(e5.rows.map((row) => [row.label, row.unit, row.fixed ?? null])).toEqual([
      ['Falha da Normal até partida', 's', null],
      ['Até carga na Emergência', 's', { ajuste: 'limite 10 s' }],
      ['Retransferência', 'min', null],
      ['Resfriamento', 'min', null],
      ['Falha da Emergência', 's', { ajuste: '—' }],
    ]);
    expect(e5.values!.map((value) => [value.key, value.kind, value.unit ?? value.options?.map((option) => option.key), value.when?.equals ?? null, value.optional ?? false])).toEqual([
      ['metodo', 'choice', ['falta_real', 'botao_teste', 'nao_realizado'], null, false],
      ['carga', 'choice', ['sem_carga', 'com_carga'], null, false],
      ['carga_percentual', 'number', '%', 'com_carga', false],
      ['fonte_tempos', 'choice', ['instrumento', 'registro_controlador'], null, false],
      ['tensao', 'number', 'V', 'com_carga', true],
      ['frequencia', 'number', 'Hz', 'com_carga', true],
      ['corrente', 'number', 'A', 'com_carga', true],
    ]);
    expect(e5.values!.filter((value) => value.group !== undefined).map((value) => [value.key, value.group])).toEqual([
      ['tensao', 'Na Emergência, com carga'],
      ['frequencia', 'Na Emergência, com carga'],
      ['corrente', 'Na Emergência, com carga'],
    ]);
    expect(e5.skip_when).toEqual({ value: 'metodo', equals: 'nao_realizado' });
    expect(e5.criteria[0]).toMatchObject({ type: 'absolute', operator: '<=', value: 10, unit: 's', rows: ['ate_carga_na_emergencia'], columns: ['medido'] });
  });

  it('E6: Normal, Emergência and Carga by phase, the temperature, the two typed ΔT (optional) and the class, with the ambient temperature as a value', () => {
    const e6 = test('cta_termografia');
    expect(e6.rows.map((row) => row.label)).toEqual(['Normal · A', 'Normal · B', 'Normal · C', 'Emergência · A', 'Emergência · B', 'Emergência · C', 'Carga · A', 'Carga · B', 'Carga · C']);
    expect(e6.rows.filter((row) => row.when !== undefined).map((row) => row.key)).toEqual(['normal_c', 'emergencia_c', 'carga_c']);
    expect(e6.columns.map((column) => [column.label, column.kind, column.unit ?? null, column.optional ?? false])).toEqual([
      ['Temperatura', 'number', '°C', false],
      ['ΔT similares', 'number', '°C', true],
      ['ΔT ambiente', 'number', '°C', true],
      ['Classe', 'choice', null, false],
    ]);
    expect(e6.columns[3]!.options!.map((option) => option.label)).toEqual(['Normal', 'Possível deficiência', 'Provável deficiência', 'Grave']);
    expect(e6.values!.map((value) => [value.key, value.unit])).toEqual([['temperatura_ambiente', '°C']]);
    expect(e6.criteria[0]).toMatchObject({ type: 'choice_pass', column: 'classe', pass: ['normal'] });
  });

  it('every criterion names its source, and the two absolute criteria of E2 follow the tensão: BT its own limit, MT the seeded isolação', () => {
    for (const candidate of tests) {
      expect(candidate.criteria.length, candidate.key).toBeGreaterThanOrEqual(1);
      for (const criterion of candidate.criteria) expect(criterion.source.name.trim().length, candidate.key).toBeGreaterThan(3);
    }
    expect(test('cta_resistencia_contato').criteria[0]).toMatchObject({ type: 'relative_to_lowest', max_percent: 50, reference_label: 'Menor do lado' });
    const [bt, mt] = test('cta_isolamento_principal').criteria;
    expect(bt).toMatchObject({ type: 'absolute', operator: '>=', value: 100, unit: 'MΩ', when: { config: 'tensao', in: ['bt'] } });
    expect(mt).toMatchObject({ type: 'absolute', seeded: 'isolacao', when: { config: 'tensao', in: ['mt'] }, source: { name: 'aceitável na ficha' } });
    expect(mt).not.toHaveProperty('value');
    expect(SEEDED_CRITERIA.find((criterion) => criterion.key === 'isolacao')).toMatchObject({ operator: '>', value: 400, unit: 'MΩ' });
    expect(test('cta_isolamento_controle').criteria[0]).toMatchObject({ type: 'absolute', operator: '>=', value: 2, unit: 'MΩ' });
  });

  it('names no manufacturer or brand anywhere', () => {
    expect(JSON.stringify(cta)).not.toMatch(/asco/i);
  });

  it('the kernel schema rejects a criterion without its source, whatever its type', () => {
    const source = { name: 'NETA 7.22.3 (fonte secundária)', edition: null };
    const criteria = [
      { type: 'absolute', operator: '>=', value: 100, unit: 'MΩ', text: '≥ 100 MΩ', source },
      { type: 'absolute', seeded: 'isolacao', source },
      { type: 'relative_to_lowest', max_percent: 50, reference_label: 'Menor do lado', text: '≤ 50 %', source },
      { type: 'equals_column', column: 'deixado', reference: 'projeto', text: 'Deixado = projeto', source },
      { type: 'choice_pass', column: 'classe', pass: ['normal'], text: 'Classe Normal', source },
    ];
    for (const criterion of criteria) {
      expect(measurementCriterionSchema.safeParse(criterion).success, criterion.type).toBe(true);
      const withoutSource = Object.fromEntries(Object.entries(criterion).filter(([key]) => key !== 'source'));
      expect(measurementCriterionSchema.safeParse(withoutSource).success, criterion.type).toBe(false);
      expect(measurementCriterionSchema.safeParse({ ...criterion, source: { name: '', edition: null } }).success, criterion.type).toBe(false);
      expect(measurementCriterionSchema.safeParse({ ...criterion, source: { edition: null } }).success, criterion.type).toBe(false);
    }
    // And so does the whole test, and the whole seed, that carries one.
    const e1 = structuredClone(test('cta_resistencia_contato')) as MeasurementTest;
    delete (e1.criteria[0] as { source?: unknown }).source;
    expect(measurementTestSchema.safeParse(e1).success).toBe(false);
    const seed = structuredClone(v5) as typeof v5;
    delete (seed.blocks.chave_transferencia_automatica!.measurement_tests![0]!.criteria[0] as { source?: unknown }).source;
    expect(reportSeedSchema.safeParse(seed).success).toBe(false);
    expect(reportSeedSchema.safeParse(structuredClone(v5)).success).toBe(true);
  });

  it('the grammar refuses what it cannot mean', () => {
    const e1 = () => structuredClone(test('cta_resistencia_contato')) as MeasurementTest;
    const e5 = () => structuredClone(test('cta_transferencia')) as MeasurementTest;
    const bad = (candidate: MeasurementTest) => expect(measurementTestSchema.safeParse(candidate).success).toBe(false);
    // An absolute criterion is its own limit and text, or a seeded one, never both and never neither.
    const source = { name: 'fonte', edition: null };
    expect(measurementCriterionSchema.safeParse({ type: 'absolute', seeded: 'isolacao', operator: '>', value: 400, unit: 'MΩ', text: '>400 MΩ', source }).success).toBe(false);
    expect(measurementCriterionSchema.safeParse({ type: 'absolute', source }).success).toBe(false);
    expect(measurementCriterionSchema.safeParse({ type: 'absolute', operator: '>=', value: 100, unit: 'MΩ', source }).success).toBe(false);
    expect(measurementCriterionSchema.safeParse({ type: 'between', min: 1, max: 2, text: 'x', source }).success).toBe(false);
    // A choice lists its options; a number never does.
    const noOptions = e5();
    delete noOptions.values![0]!.options;
    bad(noOptions);
    const numberWithOptions = e1();
    numberWithOptions.columns[0]!.options = [
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ];
    bad(numberWithOptions);
    // Keys are unique and what a rule names exists.
    const twoColumns = e1();
    twoColumns.columns[1]!.key = twoColumns.columns[0]!.key;
    bad(twoColumns);
    const twoRows = e1();
    twoRows.rows[1]!.key = twoRows.rows[0]!.key;
    bad(twoRows);
    const fixedNowhere = e5();
    fixedNowhere.rows[1]!.fixed = { nenhuma: 'x' };
    bad(fixedNowhere);
    const criterionRow = e5();
    (criterionRow.criteria[0] as { rows?: string[] }).rows = ['nenhuma'];
    bad(criterionRow);
    const whenValue = e5();
    whenValue.values![2]!.when = { value: 'carga', equals: 'nenhuma' };
    bad(whenValue);
    const skip = e5();
    skip.skip_when = { value: 'nenhum', equals: 'x' };
    bad(skip);
    // Across the definition: a row's configuration and the test's sub-block exist.
    const definition = () => structuredClone(cta) as BlockDefinition;
    expect(blockDefinitionSchema.safeParse(definition()).success).toBe(true);
    const noField = definition();
    noField.measurement_tests![0]!.rows[2]!.when = { config: 'fases', in: ['3'] };
    expect(blockDefinitionSchema.safeParse(noField).success).toBe(false);
    const noOption = definition();
    noOption.measurement_tests![0]!.rows[2]!.when = { config: 'polos', in: ['5'] };
    expect(blockDefinitionSchema.safeParse(noOption).success).toBe(false);
    const noSubBlock = definition();
    noSubBlock.sub_blocks = noSubBlock.sub_blocks.filter((key) => key !== 'cta_termografia');
    expect(blockDefinitionSchema.safeParse(noSubBlock).success).toBe(false);
    const badDefault = definition();
    badDefault.config_fields![0]!.default = 'at';
    expect(blockDefinitionSchema.safeParse(badDefault).success).toBe(false);
  });

  it('a seed version always ships the eight, each keyed by its own type', () => {
    const missing = structuredClone(v5) as { blocks: Record<string, unknown> };
    delete missing.blocks.tp;
    expect(reportSeedSchema.safeParse(missing).success).toBe(false);
    const swapped = structuredClone(v5) as { blocks: Record<string, unknown> };
    swapped.blocks.tp = swapped.blocks.tc;
    expect(reportSeedSchema.safeParse(swapped).success).toBe(false);
  });
});

/** The content hash of seed v5 as merged (Story 14.5), pinned from the untouched tree before Stories 14.9 and 14.11 touched a schema; never updated after. */
const V5_HASH = '1b0abec402f96557b80723994f6b0ba373fd410dc094b3d7223ceee751dbf52e';

describe('seed v6 (Stories 14.9 and 14.11): v5 plus the Quadro elétrico (QGBT/QD), the oil option lists and the oil rule', () => {
  const v5 = getSeed('v5', 'cabine_primaria');
  const v6 = getSeed('v6', 'cabine_primaria');
  const QD = 'quadro_eletrico';
  const qd = getDefinition('v6', 'cabine_primaria', QD);
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
  const options = (version: string, type: string, key: string) => getDefinition(version, 'cabine_primaria', type).nameplate.find((field) => field.key === key)!.options;

  /** The 17 items of the original sheet, written from `docs/nc-chip-phrases.md` "Quadros elétricos", not read back from the seed. */
  const ITEMS = [
    'LIMPEZA INTERNA E EXTERNA',
    'PINTURA, CORROSÃO DA CAIXA',
    'RESISTÊNCIA DE AQUECIMENTO',
    'ILUMINAÇÃO INTERNA',
    'LÂMPADAS DE SINALIZAÇÃO',
    'RELÉS E CONTATORES',
    'FUSÍVEIS',
    'DISJUNTORES TERMOMAGNÉTICOS',
    'ATERRAMENTO',
    'INSTRUMENTOS DE MEDIÇÃO',
    'BARRAMENTOS',
    'ISOLADORES',
    'FIAÇÃO INTERNA',
    'REAPERTO GERAL',
    'PLACAS DE SINALIZAÇÃO',
    'ORGANIZAÇÃO INTERNA',
    'IDENTIFICAÇÃO DE CIRCUITOS',
  ];

  it('is shipped as v6, after v1 to v5', () => {
    expect(SEED_VERSIONS.v6!.version).toBe('v6');
    expect(Object.keys(SEED_VERSIONS).slice(0, 6)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  });

  it('differs from v5 by exactly the QGBT type, the three option lists and the four oil rules, and v1 to v5 hash as they shipped', () => {
    // Strip the additions from v6: what is left is v5, byte for byte.
    const stripped = structuredClone(v6) as typeof v6;
    delete stripped.blocks.quadro_eletrico;
    for (const type of ['tp', 'tc', 'transformador_forca', 'disjuntor_mt'] as const) {
      const definition = stripped.blocks[type] as BlockDefinition;
      expect(definition.oil_rule, type).toBeDefined();
      delete definition.oil_rule;
      for (const field of definition.nameplate) {
        const before = v5.blocks[type].nameplate.find((candidate) => candidate.key === field.key)!;
        if (JSON.stringify(field) !== JSON.stringify(before)) {
          expect(['tipo_de_isolacao', 'meio_de_extincao'], `${type}/${field.key}`).toContain(field.key);
          field.options = before.options;
        }
      }
    }
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v5));
    // e22s: the types up to the Quadro elétrico (the Inspeção de QGBT is seed v12's).
    expect(Object.keys(v6.blocks)).toEqual(EQUIPMENT_BLOCK_TYPES.slice(0, EQUIPMENT_BLOCK_TYPES.indexOf('quadro_eletrico') + 1));
    for (const type of ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'cabos_saida', 'chave_transferencia_automatica'] as const) {
      expect(JSON.stringify(v6.blocks[type]), type).toBe(JSON.stringify(v5.blocks[type]));
    }
    // None of v1 to v5 gained a key of v6: nothing was parsed into them.
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      const seed = getSeed(version, 'cabine_primaria');
      expect(Object.keys(seed.blocks), version).not.toContain(QD);
      for (const definition of Object.values(seed.blocks)) {
        for (const key of ['oil_rule', 'print_title']) expect(key in definition, `${version}/${definition.block_type}/${key}`).toBe(false);
        for (const test of definition.tests) expect('criterion_bands' in test, `${version}/${definition.block_type}`).toBe(false);
        for (const field of definition.nameplate) expect('optional' in field, `${version}/${definition.block_type}/${field.key}`).toBe(false);
        for (const item of definition.checklist ?? []) expect('hint' in item, `${version}/${definition.block_type}/${item.key}`).toBe(false);
      }
    }
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5'), 'seed v5 changed after it shipped: add a new version instead').toBe(V5_HASH);
  });

  it('the option lists: ÓLEO after EPÓXI and Á SECO on the three transformers; AR, SF6, VÁCUO and both ÓLEO on the disjuntor; the seccionadora as it was', () => {
    for (const type of ['tp', 'tc', 'transformador_forca']) {
      expect(options('v6', type, 'tipo_de_isolacao'), type).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
      // 2026-11-04: the transformador de força on v5 gained ÓLEO too (`legacy-options.ts`).
      expect(options('v5', type, 'tipo_de_isolacao'), type).toEqual(type === 'transformador_forca' ? ['EPÓXI', 'Á SECO', 'ÓLEO'] : ['EPÓXI', 'Á SECO']);
    }
    expect(options('v6', 'disjuntor_mt', 'meio_de_extincao')).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO (PVO)', 'ÓLEO (GVO)']);
    expect(options('v5', 'disjuntor_mt', 'meio_de_extincao')).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO']);
    expect(options('v6', 'chave_seccionadora', 'meio_de_extincao')).toEqual(['AR', 'SF6']);
    expect(getDefinition('v6', 'cabine_primaria', 'chave_seccionadora').oil_rule).toBeUndefined();
  });

  it('the oil rules: the eight oil items and VOL. ÓLEO on the transformers, the one oil item and VOL. ÓLEO on the disjuntor', () => {
    for (const type of ['tp', 'tc', 'transformador_forca']) {
      expect(getDefinition('v6', 'cabine_primaria', type).oil_rule, type).toEqual({ field: 'tipo_de_isolacao', oil_values: ['ÓLEO'], items: OIL_EIGHT, fields: ['vol_oleo'] });
      // The rule names the dry subtypes' own NA defaults, no second list.
      for (const subtype of getDefinition('v6', 'cabine_primaria', type).subtypes) expect(subtype.na_defaults, `${type}/${subtype.key}`).toEqual(OIL_EIGHT);
    }
    expect(getDefinition('v6', 'cabine_primaria', 'disjuntor_mt').oil_rule).toEqual({
      field: 'meio_de_extincao',
      oil_values: ['ÓLEO (PVO)', 'ÓLEO (GVO)'],
      items: ['oleo_isolante_indicador_de_nivel'],
      fields: ['vol_oleo'],
    });
    for (const type of ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'cabos_saida', 'chave_transferencia_automatica', QD]) {
      expect(getDefinition('v6', 'cabine_primaria', type).oil_rule, type).toBeUndefined();
    }
  });

  it('the schema refuses an oil rule or a band criterion naming what the definition lacks', () => {
    const tp = () => structuredClone(getDefinition('v6', 'cabine_primaria', 'tp')) as BlockDefinition;
    expect(blockDefinitionSchema.safeParse(tp()).success).toBe(true);
    const notSelect = tp();
    notSelect.oil_rule!.field = 'tipo';
    expect(blockDefinitionSchema.safeParse(notSelect).success).toBe(false);
    const notOption = tp();
    notOption.oil_rule!.oil_values = ['ÓLEO MINERAL'];
    expect(blockDefinitionSchema.safeParse(notOption).success).toBe(false);
    const notItem = tp();
    notItem.oil_rule!.items = ['motor'];
    expect(blockDefinitionSchema.safeParse(notItem).success).toBe(false);
    const notField = tp();
    notField.oil_rule!.fields = ['nenhum'];
    expect(blockDefinitionSchema.safeParse(notField).success).toBe(false);
    const board = () => structuredClone(qd) as BlockDefinition;
    expect(blockDefinitionSchema.safeParse(board()).success).toBe(true);
    const voltage = board();
    voltage.tests[0]!.criterion_bands!.field = 'corrente_de_curto';
    expect(blockDefinitionSchema.safeParse(voltage).success).toBe(false);
    const descending = board();
    descending.tests[0]!.criterion_bands!.bands.reverse();
    expect(blockDefinitionSchema.safeParse(descending).success).toBe(false);
    const sourceless = board();
    delete (sourceless.tests[0]!.criterion_bands!.bands[0] as { source?: unknown }).source;
    expect(blockDefinitionSchema.safeParse(sourceless).success).toBe(false);
    const nameless = board();
    nameless.tests[0]!.criterion_bands!.bands[1]!.source = { name: '', edition: null };
    expect(blockDefinitionSchema.safeParse(nameless).success).toBe(false);
  });

  it('the QGBT exists on v6 only, a library type with its own print title', () => {
    expect(qd.block_type).toBe(QD);
    expect(qd.label).toBe('Quadro elétrico (QGBT/QD)');
    expect(qd.print_title).toBe("QGBT/QD's");
    expect(qd.library).toBe(true);
    expect(qd.subtypes).toEqual([]);
    expect(qd.sub_blocks).toEqual(['nameplate', 'checklist', 'isolacao', 'ia_ip_display', 'observations', 'conclusion']);
    expect(qd.measurement_tests).toBeUndefined();
    expect(qd.config_fields).toBeUndefined();
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      expect(() => getDefinition(version, 'cabine_primaria', QD), version).toThrow(new RegExp(`block_type "${QD}" is not in seed_version "${version}"`));
      expect(findDefinition(version, QD), version).toBeNull();
      expect(isLibraryType(version, QD), version).toBe(false);
    }
    expect(isLibraryType('v6', QD)).toBe(true);
    expect(equipmentTypesOf('v5')).toEqual([...EIGHT, 'chave_transferencia_automatica']);
    expect(equipmentTypesOf('v6')).toEqual([...EIGHT, 'chave_transferencia_automatica', QD]);
  });

  it('DADOS DO EQUIPAMENTO: the 9 fields of the sheet in its order, then the optional SELV/PELV mark; IP a select of the twelve codes', () => {
    expect(qd.nameplate.map((field) => [field.key, field.label, field.kind, field.unit ?? null])).toEqual([
      ['identificacao', 'IDENTIFICAÇÃO', 'text', null],
      ['fabricante', 'FABRICANTE', 'manufacturer', null],
      ['n_serie', 'Nº SÉRIE', 'text', null],
      ['tipo', 'TIPO', 'text', null],
      ['tipo_de_isolacao', 'TIPO DE ISOLAÇÃO', 'text', null],
      ['data_de_fabricacao', 'DATA DE FABRICAÇÃO', 'date', null],
      ['corrente_de_curto', 'CORRENTE DE CURTO', 'number', 'kA'],
      ['tensao_nominal', 'TENSÃO NOMINAL', 'number', 'V'],
      ['ip', 'IP', 'select', null],
      ['circuito_selv_pelv', 'Circuito SELV/PELV', 'select', null],
    ]);
    expect(qd.nameplate.find((field) => field.key === 'ip')!.options).toEqual(['IP20', 'IP30', 'IP31', 'IP40', 'IP41', 'IP42', 'IP43', 'IP44', 'IP54', 'IP55', 'IP65', 'IP66']);
    expect(qd.nameplate.find((field) => field.key === 'circuito_selv_pelv')).toMatchObject({ options: ['SIM', 'NÃO'], optional: true });
    expect(qd.nameplate.filter((field) => field.optional === true).map((field) => field.key)).toEqual(['circuito_selv_pelv']);
    expect(qd.nameplate.filter((field) => field.per_unit === true).map((field) => field.key)).toEqual(['identificacao', 'n_serie']);
    for (const field of qd.nameplate) expect(fieldDefSchema.safeParse(field).success, field.key).toBe(true);
  });

  it('VERIFICAÇÕES GERAIS: the 17 items in order, item 17 IDENTIFICAÇÃO DE CIRCUITOS, each keyed by its label with three or four phrases, hints on 8 and 16 only', () => {
    const list = qd.checklist!;
    expect(list.map((item) => item.label)).toEqual(ITEMS);
    expect(list[16]!.label).toBe('IDENTIFICAÇÃO DE CIRCUITOS');
    for (const item of list) {
      expect(item.key, item.label).toBe(snake(item.label));
      expect(item.nc_phrases.length, item.key).toBeGreaterThanOrEqual(3);
      expect(item.nc_phrases.length, item.key).toBeLessThanOrEqual(4);
      expect(new Set(item.nc_phrases).size, item.key).toBe(item.nc_phrases.length);
    }
    expect(list.flatMap((item, index) => (item.hint === undefined ? [] : [[index + 1, item.hint]]))).toEqual([
      [8, 'FUNCIONAMENTO MECÂNICO (LIGA/DESLIGA/TRIP)'],
      [16, 'CANALETA, CHICOTE, CABOS...'],
    ]);
    // The new keys were the tail of the closed item enum until seed v10 appended four after them;
    // the four the eight already use keep theirs.
    const reused = ['lampadas_de_sinalizacao', 'fusiveis', 'aterramento', 'isoladores'];
    expect(list.map((item) => item.key).filter((key) => !reused.includes(key))).toEqual(ITEM_KEYS.slice(62, 75));
    for (const key of reused) expect(ITEM_KEYS.indexOf(key as (typeof ITEM_KEYS)[number]), key).toBeLessThan(62);
  });

  it('ENSAIO DE ISOLAÇÃO: FASE A, FASE B, FASE C and NEUTRO against MASSA on the single-table grammar, judged by the NBR 5410 bands', () => {
    expect(qd.tests).toHaveLength(1);
    const isolacao = qd.tests[0]!;
    expect(isolacao.key).toBe('isolacao');
    expect(isolacao.label).toBe('ENSAIO DE ISOLAÇÃO');
    const [only] = isolacao.tables;
    expect(isolacao.tables).toHaveLength(1);
    expect(only!.connection_columns).toEqual(['LINHA', 'TERRA', 'GUARD']);
    expect(only!.rows).toEqual([
      ['FASE A', 'MASSA', ''],
      ['FASE B', 'MASSA', ''],
      ['FASE C', 'MASSA', ''],
      ['NEUTRO', 'MASSA', ''],
    ]);
    expect(only!.value_columns.map((column) => [column.label, column.role, column.unit])).toEqual([
      ['30 SEGUNDOS', 'print', 'MΩ'],
      ['1 MINUTO', 'capture', 'MΩ'],
      ['ESTAB./10MIN', 'print', 'MΩ'],
      ['ABSORÇÃO', 'print', null],
      ['POLARIZAÇÃO', 'print', null],
    ]);
    const source = { name: 'NBR 5410', edition: null };
    expect(isolacao.criterion_bands).toEqual({
      field: 'tensao_nominal',
      selv_field: 'circuito_selv_pelv',
      selv: { operator: '>=', value: 0.25, unit: 'MΩ', source },
      bands: [
        { up_to: 500, operator: '>=', value: 0.5, unit: 'MΩ', source },
        { up_to: 1000, operator: '>=', value: 1, unit: 'MΩ', source },
      ],
    });
  });
});

/** The content hash of seed v6 as deployed in v0.2.3 (Stories 14.9 and 14.11), pinned from the untouched tree before Story 14.14 touched a schema; never updated after. */
const V6_HASH = '2d25915699418be456f01e55975b30e816d0f66c7768bd16ce907c4b9357a36f';

describe('seed v7 (Story 14.14): v6 plus the fixed extinction media with Outro, the SELV/PELV help and the band test voltages', () => {
  const v6 = getSeed('v6', 'cabine_primaria');
  const v7 = getSeed('v7', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
  const field = (version: string, type: string, key: string) => getDefinition(version, 'cabine_primaria', type).nameplate.find((candidate) => candidate.key === key)!;
  const source = { name: 'NBR 5410', edition: null };

  it('was the version a new Template is created with until seed v8 (pinned there)', () => {
    expect(SEED_VERSIONS.v7!.version).toBe('v7');
    expect(Object.keys(SEED_VERSIONS)).toContain('v7');
    expect(equipmentTypesOf('v7')).toEqual(equipmentTypesOf('v6'));
  });

  it('differs from v6 by exactly the disjuntor medium and oil rule, the SELV help, the SELV ceiling and the band test voltages, and v1 to v6 hash as they shipped', () => {
    const stripped = structuredClone(v7) as typeof v7;
    const disjuntor = stripped.blocks.disjuntor_mt as BlockDefinition;
    const medium = disjuntor.nameplate.find((candidate) => candidate.key === 'meio_de_extincao')!;
    delete medium.option_aliases;
    medium.options = field('v6', 'disjuntor_mt', 'meio_de_extincao').options;
    delete disjuntor.oil_rule!.full_values;
    disjuntor.oil_rule!.oil_values = v6.blocks.disjuntor_mt.oil_rule!.oil_values;
    const quadro = stripped.blocks.quadro_eletrico!;
    delete quadro.nameplate.find((candidate) => candidate.key === 'circuito_selv_pelv')!.help;
    const bands = quadro.tests[0]!.criterion_bands!;
    delete bands.selv_max_voltage;
    delete bands.selv!.test_voltage;
    for (const band of bands.bands) delete band.test_voltage;
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v6));
    // None of v1 to v6 gained a key of v7.
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
      for (const definition of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const candidate of definition.nameplate) {
          expect('help' in candidate, `${version}/${definition.block_type}/${candidate.key}`).toBe(false);
          expect('option_aliases' in candidate, `${version}/${definition.block_type}/${candidate.key}`).toBe(false);
        }
        if (definition.oil_rule !== undefined) expect('full_values' in definition.oil_rule, `${version}/${definition.block_type}`).toBe(false);
        for (const test of definition.tests) {
          const own = test.criterion_bands;
          if (own === undefined) continue;
          expect('selv_max_voltage' in own, version).toBe(false);
          for (const band of [...own.bands, own.selv!]) expect('test_voltage' in band, version).toBe(false);
        }
      }
    }
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6'), 'seed v6 changed after it shipped: add a new version instead').toBe(V6_HASH);
  });

  it('the disjuntor medium: Ar, Gás SF6, Vácuo, Óleo, Outro in that order, the v6 spellings as aliases; the seccionadora as it was', () => {
    const medium = field('v7', 'disjuntor_mt', 'meio_de_extincao');
    expect(medium.options).toEqual(['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Outro']);
    expect(medium.option_aliases).toEqual({ AR: 'Ar', SF6: 'Gás SF6', VÁCUO: 'Vácuo', 'ÓLEO (PVO)': 'Óleo', 'ÓLEO (GVO)': 'Óleo' });
    // Every v6 option of the disjuntor has a v7 reading.
    for (const old of field('v6', 'disjuntor_mt', 'meio_de_extincao').options!) expect(Object.keys(medium.option_aliases!), old).toContain(old);
    expect(field('v7', 'chave_seccionadora', 'meio_de_extincao')).toEqual(field('v6', 'chave_seccionadora', 'meio_de_extincao'));
    expect(getDefinition('v7', 'cabine_primaria', 'chave_seccionadora').oil_rule).toBeUndefined();
  });

  it('the disjuntor oil rule names Óleo as oil and Outro as shown in full', () => {
    expect(getDefinition('v7', 'cabine_primaria', 'disjuntor_mt').oil_rule).toEqual({
      field: 'meio_de_extincao',
      oil_values: ['Óleo'],
      items: ['oleo_isolante_indicador_de_nivel'],
      fields: ['vol_oleo'],
      full_values: ['Outro'],
    });
  });

  it('the SELV/PELV help, the 50 V ceiling and the band test voltages 250, 500 and 1000 V', () => {
    expect(field('v7', 'quadro_eletrico', 'circuito_selv_pelv').help).toBe('SELV e PELV: tensão até 120 V em corrente contínua ou 50 V em corrente alternada, conforme a NBR 5410');
    expect(getDefinition('v7', 'cabine_primaria', 'quadro_eletrico').tests[0]!.criterion_bands).toEqual({
      field: 'tensao_nominal',
      selv_field: 'circuito_selv_pelv',
      selv: { operator: '>=', value: 0.25, unit: 'MΩ', source, test_voltage: 250 },
      bands: [
        { up_to: 500, operator: '>=', value: 0.5, unit: 'MΩ', source, test_voltage: 500 },
        { up_to: 1000, operator: '>=', value: 1, unit: 'MΩ', source, test_voltage: 1000 },
      ],
      selv_max_voltage: 50,
    });
  });

  it('the schema refuses aliases off a select or naming no option, and full values that are oil or no option', () => {
    const disjuntor = () => structuredClone(getDefinition('v7', 'cabine_primaria', 'disjuntor_mt')) as BlockDefinition;
    expect(blockDefinitionSchema.safeParse(disjuntor()).success).toBe(true);
    const badAlias = disjuntor();
    badAlias.nameplate.find((candidate) => candidate.key === 'meio_de_extincao')!.option_aliases = { SF6: 'SF6' };
    expect(blockDefinitionSchema.safeParse(badAlias).success).toBe(false);
    expect(fieldDefSchema.safeParse({ key: 'tipo', label: 'TIPO', kind: 'text', option_aliases: { A: 'B' } }).success).toBe(false);
    // A select with aliases and no options reports an issue, never throws.
    expect(() => fieldDefSchema.safeParse({ key: 'meio', label: 'MEIO', kind: 'select', option_aliases: { AR: 'Ar' } })).not.toThrow();
    expect(fieldDefSchema.safeParse({ key: 'meio', label: 'MEIO', kind: 'select', option_aliases: { AR: 'Ar' } }).success).toBe(false);
    const oilFull = disjuntor();
    oilFull.oil_rule!.full_values = ['Óleo'];
    expect(blockDefinitionSchema.safeParse(oilFull).success).toBe(false);
    const notOption = disjuntor();
    notOption.oil_rule!.full_values = ['Mineral'];
    expect(blockDefinitionSchema.safeParse(notOption).success).toBe(false);
  });
});

/** v7 as it shipped in v0.2.4 (Story 14.14); a change to it is a new version. */
const V7_HASH = 'c3133e05413014a3a4926f7f4753f4dae85e0b2c02f5da899727d6a9fcdc795a';

describe('seed v8 (UX pass 2026-10-22, F43): v7 plus a Conclusão naming sections 8 and 9 by one variable', () => {
  const v7 = getSeed('v7', 'cabine_primaria');
  const v8 = getSeed('v8', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');

  it('was the version a new Template is created with until seed v9 (pinned there)', () => {
    expect(SEED_VERSIONS.v8!.version).toBe('v8');
    expect(Object.keys(SEED_VERSIONS)).toContain('v8');
    expect(equipmentTypesOf('v8')).toEqual(equipmentTypesOf('v7'));
  });

  it('differs from v7 by exactly the two "nos itens 8 e 9" of the Conclusão, and v1 to v7 hash as they shipped', () => {
    const stripped = structuredClone(v8) as typeof v8;
    for (const entry of stripped.sections) for (const block of entry.blocks ?? []) block.text = block.text.replaceAll('{itens_resultados}', 'nos itens 8 e 9');
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v7));
    const conclusao = sectionText('v8', 10, '2026-10-22').map((block) => block.text);
    expect(conclusao.filter((text) => text.includes('{itens_resultados}'))).toHaveLength(2);
    expect(conclusao.some((text) => text.includes('encontram-se {itens_resultados} deste relatório;'))).toBe(true);
    expect(conclusao.some((text) => text.includes('constantes {itens_resultados} deste sejam atendidas.'))).toBe(true);
    expect(conclusao.join(' ')).not.toContain('itens 8 e 9');
    expect(sectionText('v7', 10, '2026-10-22').filter((block) => block.text.includes('itens 8 e 9'))).toHaveLength(2);
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6')).toBe(V6_HASH);
    expect(hash('v7'), 'seed v7 changed after it shipped: add a new version instead').toBe(V7_HASH);
  });

  it('only v8 (and v9, which keeps its text) carries the results reference variable', () => {
    const variablesOf = (version: string) => {
      const found = new Set<string>();
      const seed = getSeed(version, 'cabine_primaria');
      for (const entry of seed.sections) for (const block of entry.blocks ?? []) for (const match of block.text.matchAll(/\{([^}]*)\}/g)) found.add(match[1]!);
      for (const row of seed.cover.rows) for (const match of row.value.matchAll(/\{([^}]*)\}/g)) found.add(match[1]!);
      return [...found].sort();
    };
    for (const version of ['v8', 'v9', 'v10']) expect(variablesOf(version), version).toEqual([...SECTION_VARIABLES].sort());
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']) {
      expect(variablesOf(version), version).toEqual(['cliente', 'datas', 'empresa_executora', 'escopo', 'obra', 'responsavel']);
    }
  });
});

/** v8 as it shipped (UX pass 2026-10-22, F43); a change to it is a new version. */
const V8_HASH = '03ade51f394d1382a656a0ca6d9aa26671cf5ad147fd1c51b39b46b0fce4ebae';

describe('seed v9 (Stories 15.3 and 15.6): v8 with one oil-level item, the TC without POTÊNCIA NOMINAL, two site items and the ratio with √3', () => {
  const v8 = getSeed('v8', 'cabine_primaria');
  const v9 = getSeed('v9', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
  const TRANSFORMERS = ['tp', 'tc', 'transformador_forca'] as const;

  it('was the version a new Template is created with until seed v10 (pinned there)', () => {
    expect(SEED_VERSIONS.v9!.version).toBe('v9');
    expect(Object.keys(SEED_VERSIONS)).toContain('v9');
    expect(equipmentTypesOf('v9')).toEqual(equipmentTypesOf('v8'));
  });

  it('differs from v8 by exactly the 15.3 and 15.6 differences, and v1 to v8 hash as they shipped', () => {
    const stripped = structuredClone(v9) as typeof v9;
    for (const type of TRANSFORMERS) {
      const own = stripped.blocks[type] as BlockDefinition;
      const shipped = v8.blocks[type];
      const at = shipped.checklist!.findIndex((item) => item.key === 'indicador_nivel_de_oleo');
      expect(at, type).toBe(4);
      own.checklist!.splice(at, 0, structuredClone(shipped.checklist![at]!));
      const kept = own.checklist!.find((item) => item.key === 'oleo_isolante_indicador_de_nivel')!;
      kept.nc_phrases = [...shipped.checklist!.find((item) => item.key === 'oleo_isolante_indicador_de_nivel')!.nc_phrases];
      own.subtypes = structuredClone(shipped.subtypes);
      own.oil_rule!.items = [...shipped.oil_rule!.items];
      if (type === 'tc') {
        const fieldAt = shipped.nameplate.findIndex((candidate) => candidate.key === 'potencia_nominal');
        own.nameplate.splice(fieldAt, 0, structuredClone(shipped.nameplate[fieldAt]!));
      }
      for (const test of own.tests) for (const table of test.tables) delete table.ratio_factor;
    }
    const ambiente = stripped.site_checklist!.groups.find((group) => group.key === 'ambiente')!;
    expect(ambiente.items.splice(-2).map((item) => item.key)).toEqual(['grades_e_portas_estado_e_fixacao', 'pintura_e_corrosao']);
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v8));
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6')).toBe(V6_HASH);
    expect(hash('v7')).toBe(V7_HASH);
    expect(hash('v8'), 'seed v8 changed after it shipped: add a new version instead').toBe(V8_HASH);
  });

  it('the three transformers: 14 checklist items, item 13 with four phrases, seven oil items in the dry defaults and the oil rule', () => {
    for (const type of TRANSFORMERS) {
      const definition = getDefinition('v9', 'cabine_primaria', type);
      expect(definition.checklist, type).toHaveLength(14);
      expect(definition.checklist!.map((item) => item.key), type).not.toContain('indicador_nivel_de_oleo');
      expect(definition.checklist!.find((item) => item.key === 'oleo_isolante_indicador_de_nivel')!.nc_phrases).toEqual([
        'nível de óleo abaixo do mínimo',
        'óleo com coloração escura',
        'indicador de nível ilegível',
        'indicador de nível danificado',
      ]);
      const oil = ['valvula_de_alivio', 'elemento_secante', 'juntas_vedacoes_e_vazamentos', 'registros_radiadores', 'rele_de_gas_funcionamento', 'termometro', 'oleo_isolante_indicador_de_nivel'];
      for (const subtype of definition.subtypes) expect(subtype.na_defaults, `${type} ${subtype.key}`).toEqual(oil);
      expect(definition.oil_rule!.items, type).toEqual(oil);
      expect(naDefaultsFor('v9', type, 'epoxi')).toHaveLength(7);
      expect(naDefaultsFor('v8', type, 'epoxi')).toHaveLength(8);
      expect(getDefinition('v8', 'cabine_primaria', type).checklist, type).toHaveLength(15);
    }
    // The Disjuntor MT keeps its item of the same key and its phrases.
    expect(getDefinition('v9', 'cabine_primaria', 'disjuntor_mt')).toEqual(getDefinition('v8', 'cabine_primaria', 'disjuntor_mt'));
  });

  it('the TC has no POTÊNCIA NOMINAL (13 fields, v8 has 14); TP and Transformador de força keep theirs', () => {
    const keys = (version: string, type: string) => getDefinition(version, 'cabine_primaria', type).nameplate.map((candidate) => candidate.key);
    expect(keys('v9', 'tc')).not.toContain('potencia_nominal');
    expect(keys('v9', 'tc')).toEqual(keys('v8', 'tc').filter((key) => key !== 'potencia_nominal'));
    expect(keys('v9', 'tc')).toHaveLength(13);
    expect(keys('v8', 'tc')).toHaveLength(14);
    expect(keys('v8', 'tc')).toContain('potencia_nominal');
    expect(keys('v9', 'tp')).toContain('potencia_nominal');
    expect(keys('v9', 'transformador_forca')).toContain('potencia_nominal');
  });

  it('ratio_factor sits on the v9 and v10 (sqrt3) and v11 to v13 (vector_group) transformador de força ratio table only', () => {
    const factors: string[] = [];
    for (const version of Object.keys(SEED_VERSIONS)) {
      for (const definition of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const test of definition.tests) for (const table of test.tables) if ('ratio_factor' in table) factors.push(`${version}/${definition.block_type}/${test.key}/${table.ratio_factor}`);
      }
    }
    expect(factors).toEqual([
      'v9/transformador_forca/relacao_transformacao/sqrt3',
      'v10/transformador_forca/relacao_transformacao/sqrt3',
      'v11/transformador_forca/relacao_transformacao/vector_group',
      'v12/transformador_forca/relacao_transformacao/vector_group',
      'v13/transformador_forca/relacao_transformacao/vector_group',
    ]);
  });

  it('the site checklist: 21 items, the two new ones items 20 and 21 at the end of Ambiente; v4 to v8 keep 19', () => {
    const items = siteItems('v9');
    expect(items.map((item) => item.number)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
    expect(items.map((item) => item.key)).toEqual([...SITE_ITEM_KEYS]);
    expect(items[19]).toEqual({
      key: 'grades_e_portas_estado_e_fixacao',
      label: 'Grades e portas: estado e fixação',
      groupKey: 'ambiente',
      number: 20,
      nc_phrases: ['Grade ou porta danificada', 'Grade ou porta solta ou mal fixada', 'Dobradiças, trincos ou fechos corroídos'],
    });
    expect(items[20]).toEqual({
      key: 'pintura_e_corrosao',
      label: 'Pintura e corrosão',
      groupKey: 'ambiente',
      number: 21,
      nc_phrases: ['Pintura descascada ou desgastada', 'Pontos de corrosão em estruturas metálicas', 'Corrosão em suportes ou ferragens'],
    });
    expect(siteChecklistOf('v9')!.groups.map((group) => group.items.length)).toEqual([7, 2, 2, 2, 3, 5]);
    for (const version of ['v4', 'v5', 'v6', 'v7', 'v8']) expect(siteItems(version), version).toHaveLength(19);
  });
});

/** v9 as it shipped (Stories 15.3 and 15.6); a change to it is a new version. */
const V9_HASH = '51a82df917a94d799ac0b8cfa6966fd7c05b249c95419e570361a99a2b69e9e3';

describe('seed v10 (Story 15.7): v9 with the TC\'s own seven-item checklist', () => {
  const v9 = getSeed('v9', 'cabine_primaria');
  const v10 = getSeed('v10', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
  const TC_KEYS = ['limpeza_pintura_e_corrosao', 'vasamento', 'fusiveis', 'aterramento', 'conexoes', 'fiacao_secundaria', 'buchas'];

  it('was the version a new Template is created with until seed v11 (pinned there)', () => {
    expect(SEED_VERSIONS.v10!.version).toBe('v10');
    expect(Object.keys(SEED_VERSIONS)).toContain('v10');
    expect(equipmentTypesOf('v10')).toEqual(equipmentTypesOf('v9'));
  });

  it('differs from v9 by exactly the TC\'s checklist, dry defaults and oil items, and v1 to v9 hash as they shipped', () => {
    const stripped = structuredClone(v10) as typeof v10;
    const own = stripped.blocks.tc as BlockDefinition;
    own.checklist = structuredClone(v9.blocks.tc.checklist);
    own.subtypes = structuredClone(v9.blocks.tc.subtypes);
    own.oil_rule!.items = [...v9.blocks.tc.oil_rule!.items];
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v9));
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6')).toBe(V6_HASH);
    expect(hash('v7')).toBe(V7_HASH);
    expect(hash('v8')).toBe(V8_HASH);
    expect(hash('v9'), 'seed v9 changed after it shipped: add a new version instead').toBe(V9_HASH);
  });

  it('the TC asks Bruno\'s seven items in order, with their labels', () => {
    const checklist = getDefinition('v10', 'cabine_primaria', 'tc').checklist!;
    expect(checklist.map((item) => item.key)).toEqual(TC_KEYS);
    expect(checklist.map((item) => item.label)).toEqual([
      'LIMPEZA, PINTURA E CORROSÃO',
      'VASAMENTO',
      'FUSÍVEIS',
      'ATERRAMENTO',
      'CONEXÕES',
      'FIAÇÃO SECUNDÁRIA',
      'BUCHAS',
    ]);
    // The shared keys carry the chips the other sheets offer.
    const v9Tc = getDefinition('v9', 'cabine_primaria', 'tc').checklist!;
    for (const key of ['aterramento', 'conexoes']) {
      expect(checklist.find((item) => item.key === key)!.nc_phrases, key).toEqual(v9Tc.find((item) => item.key === key)!.nc_phrases);
    }
    expect(checklist.find((item) => item.key === 'fusiveis')!.nc_phrases).toEqual(
      getDefinition('v9', 'cabine_primaria', 'chave_seccionadora').checklist!.find((item) => item.key === 'fusiveis')!.nc_phrases,
    );
    for (const key of TC_KEYS) expect(ITEM_KEYS as readonly string[]).toContain(key);
    expect(ITEM_KEYS.slice(-4)).toEqual(['limpeza_pintura_e_corrosao', 'vasamento', 'fiacao_secundaria', 'buchas']);
  });

  it('a dry TC marks only VASAMENTO NA, and the oil rule names it alone', () => {
    const tc = getDefinition('v10', 'cabine_primaria', 'tc');
    const v9Tc = getDefinition('v9', 'cabine_primaria', 'tc');
    expect(tc.subtypes.map((subtype) => subtype.key)).toEqual(['epoxi', 'a_seco']);
    for (const subtype of tc.subtypes) expect(subtype.na_defaults, subtype.key).toEqual(['vasamento']);
    expect(tc.oil_rule!.items).toEqual(['vasamento']);
    expect(tc.oil_rule!.field).toBe(v9Tc.oil_rule!.field);
    expect(tc.oil_rule!.oil_values).toEqual(v9Tc.oil_rule!.oil_values);
    expect(tc.oil_rule!.fields).toEqual(v9Tc.oil_rule!.fields);
    expect(naDefaultsFor('v10', 'tc', 'epoxi')).toHaveLength(1);
    expect(naDefaultsFor('v10', 'tp', 'epoxi')).toHaveLength(7);
    expect(naDefaultsFor('v9', 'tc', 'epoxi')).toHaveLength(7);
  });

  it('TP, Transformador de força and the TC\'s nameplate, insulation and ratio are v9\'s', () => {
    for (const type of ['tp', 'transformador_forca']) {
      expect(getDefinition('v10', 'cabine_primaria', type), type).toEqual(getDefinition('v9', 'cabine_primaria', type));
    }
    const tc = getDefinition('v10', 'cabine_primaria', 'tc');
    const v9Tc = getDefinition('v9', 'cabine_primaria', 'tc');
    expect(tc.nameplate).toEqual(v9Tc.nameplate);
    expect(tc.tests).toEqual(v9Tc.tests);
    expect(tc.sub_blocks).toEqual(v9Tc.sub_blocks);
    expect(getDefinition('v9', 'cabine_primaria', 'tc').checklist).toHaveLength(14);
  });
});

/** v10 as it shipped (Story 15.7); a change to it is a new version. */
const V10_HASH = 'deb9338028b2d1d1b2522fa1bc7f5a41e91d89184bfa294cf4c13dbcc96cf908';

describe('seed v11 (Story 21.1): v10 with the transformador de força\'s vector group', () => {
  const v10 = getSeed('v10', 'cabine_primaria');
  const v11 = getSeed('v11', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');

  it('was the version a new Template is created with until seed v12 (pinned there)', () => {
    expect(SEED_VERSIONS.v11!.version).toBe('v11');
    expect(Object.keys(SEED_VERSIONS).slice(0, 11)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11']);
    expect(equipmentTypesOf('v11')).toEqual(equipmentTypesOf('v10'));
  });

  it('differs from v10 by exactly the transformer LIGAÇÃO SECUNDÁRIA select and its ratio_factor, and v1 to v10 hash as they shipped', () => {
    const stripped = structuredClone(v11) as typeof v11;
    const own = stripped.blocks.transformador_forca as BlockDefinition;
    const at = own.nameplate.findIndex((field) => field.key === 'ligacao_secundaria');
    expect(own.nameplate[at]).toEqual({ key: 'ligacao_secundaria', label: 'LIGAÇÃO SECUNDÁRIA', kind: 'select', options: [...VECTOR_GROUP_CODES] });
    own.nameplate[at] = structuredClone(v10.blocks.transformador_forca.nameplate[at]!);
    for (const test of own.tests) {
      for (const table of test.tables) {
        if (table.ratio_factor === undefined) continue;
        expect(table.ratio_factor).toBe('vector_group');
        table.ratio_factor = 'sqrt3';
      }
    }
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v10));
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6')).toBe(V6_HASH);
    expect(hash('v7')).toBe(V7_HASH);
    expect(hash('v8')).toBe(V8_HASH);
    expect(hash('v9')).toBe(V9_HASH);
    expect(hash('v10'), 'seed v10 changed after it shipped: add a new version instead').toBe(V10_HASH);
  });

  it('the select offers the 47 codes in the manual order; TP and TC keep LIGAÇÃO SECUNDÁRIA as text and their plain ratio; the capture labels stay', () => {
    const field = getDefinition('v11', 'cabine_primaria', 'transformador_forca').nameplate.find((candidate) => candidate.key === 'ligacao_secundaria')!;
    expect(field.options).toHaveLength(47);
    expect(field.options![0]).toBe('Dd0');
    expect(field.options).toContain('Dyn1');
    expect(field.options).toContain('Yyn0');
    for (const type of ['tp', 'tc']) {
      expect(getDefinition('v11', 'cabine_primaria', type), type).toEqual(getDefinition('v10', 'cabine_primaria', type));
      expect(getDefinition('v11', 'cabine_primaria', type).nameplate.find((candidate) => candidate.key === 'ligacao_secundaria')!.kind, type).toBe('text');
    }
    const ratio = getDefinition('v11', 'cabine_primaria', 'transformador_forca').tests.find((test) => test.key === 'relacao_transformacao')!.tables[0]!;
    expect(ratio.value_columns.filter((column) => column.role === 'capture').map((column) => column.label)).toEqual(['H1-H3 / X1-X0', 'H2-H1 / X2-X0', 'H3-H2 / X3-X0']);
  });
});

/** v11 as it shipped (Stories 21.1 and 21.2), hashed before seed v12 was written; a change to it is a new version. */
const V11_HASH = 'abf0ca496d8883659a1fc2379212e7363c35e55eb2aa9e676c1b28d58d46eb33';

/** v12 as it shipped (Stories 22.7 to 22.9 and 22.11, deployed ae3d37e0), hashed before seed v13 was written; a change to it is a new version. */
// e22g (2026-11-07, before v12's first deploy): Bruno's test base rev03 (the TP's 3P and 6P) and review N3 (the inspection's title).
const V12_HASH = '62b2d734e2e706be6a1f5add592260ccce2cbe2dffe439d1b9755a7fe66e0649';

describe('seed v12 (Stories 22.7 to 22.9 and 22.11): v11 with oil transformers, the TP on the TC list, the defect reason, a voltage per insulation row, the accuracy class and the Inspeção de QGBT', () => {
  const v11 = getSeed('v11', 'cabine_primaria');
  const v12 = getSeed('v12', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');
  const at = (version: string, type: string) => getDefinition(version, 'cabine_primaria', type);
  const field = (version: string, type: string, key: string) => at(version, type).nameplate.find((candidate) => candidate.key === key);
  const INSULATED = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca', 'quadro_eletrico'];

  // Seed v13 (Story 23.2) is the version a new Template is created with since e23a; v12 ships as it did.
  it('ships the Inspeção de QGBT after the types of v11', () => {
    expect(SEED_VERSIONS.v12!.version).toBe('v12');
    expect(Object.keys(SEED_VERSIONS).slice(0, 12)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']);
    expect(equipmentTypesOf('v12')).toEqual([...equipmentTypesOf('v11'), 'inspecao_qgbt']);
    // Batch e23e (Story 23.21): the Malha de aterramento of seed v13 follows it.
    expect(EQUIPMENT_BLOCK_TYPES.at(-2)).toBe('inspecao_qgbt');
    for (const version of Object.keys(SEED_VERSIONS).slice(0, 11)) expect(equipmentTypesOf(version), version).not.toContain('inspecao_qgbt');
  });

  it('differs from v11 by exactly its four stories, field by field, and v1 to v11 hash as they shipped', () => {
    const stripped = structuredClone(v12) as typeof v12;
    const blocks = stripped.blocks as Record<string, BlockDefinition | undefined>;
    // Story 22.11: one library type more.
    expect(blocks.inspecao_qgbt).toBeDefined();
    delete blocks.inspecao_qgbt;
    // Story 22.7: the defect reason, before "Outro".
    expect(stripped.not_tested_reasons.map((reason) => reason.key)).toEqual([...v11.not_tested_reasons.filter((reason) => reason.key !== 'outro').map((reason) => reason.key), 'defeito_no_equipamento', 'outro']);
    stripped.not_tested_reasons = stripped.not_tested_reasons.filter((reason) => reason.key !== 'defeito_no_equipamento');
    // Story 22.8: every insulation table's appended TENSÃO column and its rows.
    for (const type of INSULATED) {
      for (const table of blocks[type]!.tests.find((candidate) => candidate.key === 'isolacao')!.tables) {
        expect(table.value_columns.at(-1), `${type}/${table.key}`).toEqual({ label: 'TENSÃO', unit: 'kV', role: 'voltage', derived: false, options: ['0,5', '1', '2,5', '5', '10'] });
        table.value_columns.pop();
        expect(table.voltage_rows, `${type}/${table.key}`).toHaveLength(table.rows.length);
        delete table.voltage_rows;
      }
    }
    // Story 22.7: ÓLEO MINERAL on the three transformers.
    for (const type of ['transformador_forca', 'tp', 'tc']) {
      const own = blocks[type]!;
      const insulation = own.nameplate.find((candidate) => candidate.key === 'tipo_de_isolacao')!;
      expect(insulation, type).toEqual({ key: 'tipo_de_isolacao', label: 'TIPO DE ISOLAÇÃO', kind: 'select', options: ['EPÓXI', 'Á SECO', 'ÓLEO MINERAL'], option_aliases: { ÓLEO: 'ÓLEO MINERAL' } });
      insulation.options = ['EPÓXI', 'Á SECO', 'ÓLEO'];
      delete insulation.option_aliases;
      expect(own.oil_rule!.oil_values, type).toEqual(['ÓLEO MINERAL']);
      own.oil_rule!.oil_values = ['ÓLEO'];
    }
    // Story 22.7: the transformer's TIPO DO ÓLEO and DESLOCAMENTO ANGULAR.
    const tf = blocks.transformador_forca!;
    const oilAt = tf.nameplate.findIndex((candidate) => candidate.key === 'tipo_do_oleo');
    expect(tf.nameplate[oilAt - 1]!.key).toBe('tipo_de_isolacao');
    expect(tf.nameplate[oilAt]).toEqual({ key: 'tipo_do_oleo', label: 'TIPO DO ÓLEO', kind: 'select', options: ['A', 'B'] });
    tf.nameplate.splice(oilAt, 1);
    const group = tf.nameplate.find((candidate) => candidate.key === 'ligacao_secundaria')!;
    expect(group.label).toBe('DESLOCAMENTO ANGULAR');
    expect(group.options).toEqual([...VECTOR_GROUP_CODES]);
    group.label = 'LIGAÇÃO SECUNDÁRIA';
    expect(tf.oil_rule!.fields).toEqual(['vol_oleo', 'tipo_do_oleo']);
    tf.oil_rule!.fields = ['vol_oleo'];
    // Story 22.7: the TP on the TC's v10 list; Story 22.9: its EXATIDÃO and its class ratio.
    const tp = blocks.tp!;
    expect(tp.checklist).toEqual(getDefinition('v10', 'cabine_primaria', 'tc').checklist);
    tp.checklist = structuredClone(v11.blocks.tp.checklist);
    expect(tp.subtypes.map((subtype) => subtype.na_defaults)).toEqual([['vasamento'], ['vasamento']]);
    tp.subtypes = structuredClone(v11.blocks.tp.subtypes);
    expect(tp.oil_rule!.items).toEqual(['vasamento']);
    tp.oil_rule!.items = [...v11.blocks.tp.oil_rule!.items];
    // e22g (Bruno's test base rev03, 2026-11-07): the TP gains 3P and 6P.
    expect(tp.nameplate.at(-1)).toEqual({ key: 'exatidao', label: 'EXATIDÃO', kind: 'select', options: ['0,3', '0,6', '1,2', '3P', '6P'] });
    tp.nameplate.pop();
    // Story 22.9: the TC's EXATIDÃO select.
    const tc = blocks.tc!;
    const classAt = tc.nameplate.findIndex((candidate) => candidate.key === 'exatidao');
    expect(tc.nameplate[classAt]).toEqual({ key: 'exatidao', label: 'EXATIDÃO', kind: 'select', options: ['0,3', '0,6', '1,2', '3', '5P', '10P'] });
    tc.nameplate[classAt] = structuredClone(v11.blocks.tc.nameplate[classAt]!);
    for (const own of [tp, tc]) {
      const ratio = own.tests.find((candidate) => candidate.key === 'relacao_transformacao')!;
      expect(ratio.criterion_class_field).toBe('exatidao');
      delete ratio.criterion_class_field;
    }
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v11));
    expect(hash('v1')).toBe(V1_HASH);
    expect(hash('v2')).toBe(V2_HASH);
    expect(hash('v3')).toBe(V3_HASH);
    expect(hash('v4')).toBe(V4_HASH);
    expect(hash('v5')).toBe(V5_HASH);
    expect(hash('v6')).toBe(V6_HASH);
    expect(hash('v7')).toBe(V7_HASH);
    expect(hash('v8')).toBe(V8_HASH);
    expect(hash('v9')).toBe(V9_HASH);
    expect(hash('v10')).toBe(V10_HASH);
    expect(hash('v11'), 'seed v11 changed after it shipped: add a new version instead').toBe(V11_HASH);
    expect(hash('v12'), 'seed v12 changed after it shipped: add a new version instead').toBe(V12_HASH);
  });

  it('every v12 insulation table carries the TENSÃO column after its value columns, their indices as v11; the transformer rows name their windings', () => {
    for (const type of INSULATED) {
      const v11Tables = at('v11', type).tests.find((candidate) => candidate.key === 'isolacao')!.tables;
      at('v12', type)
        .tests.find((candidate) => candidate.key === 'isolacao')!
        .tables.forEach((table, i) => {
          expect(table.value_columns.slice(0, -1), `${type}/${table.key}`).toEqual(v11Tables[i]!.value_columns);
          expect(table.value_columns.filter((column) => column.role === 'voltage'), `${type}/${table.key}`).toHaveLength(1);
          if (type !== 'transformador_forca') expect(table.voltage_rows!.every((row) => row.default_kv === null && row.winding === null), `${type}/${table.key}`).toBe(true);
        });
    }
    const tf = at('v12', 'transformador_forca').tests.find((candidate) => candidate.key === 'isolacao')!.tables[0]!;
    expect(tf.rows.map((row) => row[0])).toEqual(['PRIMÁRIO', 'PRIMÁRIO', 'SECUNDÁRIO']);
    expect(tf.voltage_rows).toEqual([
      { default_kv: null, winding: 'tensao_nominal_at' },
      { default_kv: null, winding: 'tensao_nominal_at' },
      { default_kv: '1', winding: 'tensao_nominal_bt' },
    ]);
    // The library measurement tests (the CTA's) are v11's.
    expect(at('v12', 'chave_transferencia_automatica')).toEqual(at('v11', 'chave_transferencia_automatica'));
    // No v1 to v11 table has a voltage column.
    for (const version of Object.keys(SEED_VERSIONS).slice(0, 11)) {
      for (const definition of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const one of definition!.tests) for (const t of one.tables) expect(t.value_columns.some((column) => column.role === 'voltage'), `${version}/${definition!.block_type}`).toBe(false);
      }
    }
  });

  it("the TP holds the TC's items, with no VÁLVULA DE ALÍVIO, RELÉ DE GÁS or VENTILADORES, VASAMENTO its only oil item; the transformer keeps its seven oil items", () => {
    const tp = at('v12', 'tp');
    expect(tp.checklist!.map((one) => one.key)).toEqual(at('v12', 'tc').checklist!.map((one) => one.key));
    for (const gone of ['valvula_de_alivio', 'rele_de_gas_funcionamento', 'ventiladores']) expect(tp.checklist!.some((one) => one.key === gone), gone).toBe(false);
    expect(tp.subtypes.map((subtype) => subtype.key)).toEqual(['epoxi', 'a_seco']);
    expect(tp.oil_rule).toEqual({ field: 'tipo_de_isolacao', oil_values: ['ÓLEO MINERAL'], items: ['vasamento'], fields: ['vol_oleo'] });
    expect(at('v12', 'transformador_forca').oil_rule!.items).toEqual(at('v11', 'transformador_forca').oil_rule!.items);
    expect(at('v12', 'transformador_forca').oil_rule!.items).toHaveLength(7);
  });

  it('the defect reason is flagged and justified; the v11 reasons are unflagged', () => {
    const defect = v12.not_tested_reasons.find((reason) => reason.key === 'defeito_no_equipamento');
    expect(defect).toEqual({ key: 'defeito_no_equipamento', label: 'Defeito no equipamento', justification: 'Os ensaios não foram realizados devido a defeito constatado no equipamento.', defect: true });
    expect(v11.not_tested_reasons.some((reason) => reason.defect !== undefined)).toBe(false);
  });

  it('EXATIDÃO is a select on the TC and the TP, both ratio tests read it; the transformer has no class field', () => {
    expect(field('v12', 'tc', 'exatidao')!.options).toEqual(['0,3', '0,6', '1,2', '3', '5P', '10P']);
    expect(field('v12', 'tp', 'exatidao')!.options).toEqual(['0,3', '0,6', '1,2', '3P', '6P']);
    expect(field('v11', 'tc', 'exatidao')!.kind).toBe('text');
    expect(field('v11', 'tp', 'exatidao')).toBeUndefined();
    for (const type of ['tc', 'tp']) expect(at('v12', type).tests.find((one) => one.key === 'relacao_transformacao')!.criterion_class_field, type).toBe('exatidao');
    expect(at('v12', 'transformador_forca').tests.find((one) => one.key === 'relacao_transformacao')!.criterion_class_field).toBeUndefined();
  });

  it('the Inspeção de QGBT: four fields, the quadro\'s ten visual items, no tests, observations and conclusion, printed as INSPEÇÃO DE QGBT (e22g N3)', () => {
    const qgbt = at('v12', 'inspecao_qgbt');
    const quadro = at('v12', 'quadro_eletrico');
    expect(qgbt.label).toBe('Inspeção de QGBT');
    expect(isLibraryType('v12', 'inspecao_qgbt')).toBe(true);
    expect(qgbt.print_title).toBe('INSPEÇÃO DE QGBT');
    expect(quadro.print_title).toBe("QGBT/QD's");
    expect(qgbt.nameplate.map((one) => one.label)).toEqual(['IDENTIFICAÇÃO', 'FABRICANTE', 'TENSÃO NOMINAL', 'CORRENTE NOMINAL']);
    for (const key of ['identificacao', 'fabricante', 'tensao_nominal']) expect(qgbt.nameplate.find((one) => one.key === key), key).toEqual(quadro.nameplate.find((one) => one.key === key));
    expect(qgbt.nameplate.find((one) => one.key === 'corrente_nominal')).toEqual({ key: 'corrente_nominal', label: 'CORRENTE NOMINAL', kind: 'number', unit: 'A' });
    expect(qgbt.checklist!.map((one) => one.label)).toEqual([
      'LIMPEZA INTERNA E EXTERNA',
      'PINTURA, CORROSÃO DA CAIXA',
      'FUSÍVEIS',
      'ATERRAMENTO',
      'BARRAMENTOS',
      'ISOLADORES',
      'FIAÇÃO INTERNA',
      'PLACAS DE SINALIZAÇÃO',
      'ORGANIZAÇÃO INTERNA',
      'IDENTIFICAÇÃO DE CIRCUITOS',
    ]);
    for (const one of qgbt.checklist!) expect(one, one.key).toEqual(quadro.checklist!.find((candidate) => candidate.key === one.key));
    expect(qgbt.tests).toEqual([]);
    expect(qgbt.measurement_tests).toBeUndefined();
    expect(qgbt.sub_blocks).toEqual(['nameplate', 'checklist', 'observations', 'conclusion']);
    expect(qgbt.subtypes).toEqual([]);
    expect(qgbt.conclusion).toBe(true);
  });

  it('v5 and v11 resolve as they did: no ÓLEO MINERAL, no TIPO DO ÓLEO, LIGAÇÃO SECUNDÁRIA, the shared transformer list on the TP', () => {
    for (const version of ['v5', 'v11']) {
      expect(field(version, 'transformador_forca', 'tipo_do_oleo'), version).toBeUndefined();
      expect(field(version, 'transformador_forca', 'ligacao_secundaria')!.label, version).toBe('LIGAÇÃO SECUNDÁRIA');
      expect(field(version, 'transformador_forca', 'tipo_de_isolacao')!.options, version).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
      expect(at(version, 'tp').checklist!.some((one) => one.key === 'valvula_de_alivio'), version).toBe(true);
      expect(findDefinition(version, 'inspecao_qgbt'), version).toBeNull();
    }
  });

  it('the new keys refuse a malformed seed: options off a voltage column, voltage_rows of the wrong length, a class or winding field that is not one', () => {
    const tf = structuredClone(at('v12', 'transformador_forca')) as BlockDefinition;
    const insulationOf = (definition: BlockDefinition) => definition.tests.find((one) => one.key === 'isolacao')!.tables[0]!;
    expect(blockDefinitionSchema.safeParse(tf).success).toBe(true);
    const shortRows = structuredClone(tf);
    insulationOf(shortRows).voltage_rows!.pop();
    expect(blockDefinitionSchema.safeParse(shortRows).success).toBe(false);
    const noOptions = structuredClone(tf);
    delete insulationOf(noOptions).value_columns.at(-1)!.options;
    expect(blockDefinitionSchema.safeParse(noOptions).success).toBe(false);
    const badWinding = structuredClone(tf);
    insulationOf(badWinding).voltage_rows![2]!.winding = 'tipo';
    expect(blockDefinitionSchema.safeParse(badWinding).success).toBe(false);
    const badClass = structuredClone(at('v12', 'tc')) as BlockDefinition;
    badClass.tests.find((one) => one.key === 'relacao_transformacao')!.criterion_class_field = 'tipo';
    expect(blockDefinitionSchema.safeParse(badClass).success).toBe(false);
  });
});

/** v13 as it ships (Epic 23); until its deploy (M-2) each Epic 23 batch re-pins it, after it a change is a new version. */
// e23a first commit (2026-11-08): v13 opens equal to v12.
// e23a (Stories 23.2 to 23.4: the NETA criterion tables, the instrument-limit note), then e23b (Stories 23.7 to 23.9: the nameplate fields,
// the TTR per tap, the dry fields; its block below), re-pinned on main 17127590 merged in.
// e23v (Stories 23.5, 23.6, 23.14: the temperature correction, the restriction rules, the contact criterion status; its block below).
// e23w (fix batch, Bruno's answers B-4 and B-6 of 2026-11-09: the TP's Table 100.5, the contact's history_rise_out_pct).
// e23t (Stories 23.15 to 23.17 and 23.19: the winding resistance, the typed IP, the insulating liquid and the oil sampling, the HH fuses; its block below).
// e23e (Stories 23.13, 23.18, 23.20, 23.21: the test-voltage defaults, polarity and function, the thermography, the Malha de aterramento; its block below).
const V13_HASH = 'ff1737055c046a1f8a3fb9099bae3306b338b8af50be5502b347837602bd30ff';

describe('seed v13 (Epic 23): v12 plus the keys of Bruno\'s test base rev08', () => {
  const v12 = getSeed('v12', 'cabine_primaria');
  const v13 = getSeed('v13', 'cabine_primaria');
  const hash = (version: string) => createHash('sha256').update(JSON.stringify(shipped(version))).digest('hex');

  it('is the version a new Template is created with, offering the types of v12', () => {
    expect(SEED_VERSION).toBe('v13');
    expect(SEED_VERSIONS.v13!.version).toBe('v13');
    expect(Object.keys(SEED_VERSIONS)).toEqual(['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13']);
    // Batch e23e (Story 23.21): v13 adds the Malha de aterramento after the types of v12.
    expect(equipmentTypesOf('v13')).toEqual([...equipmentTypesOf('v12'), 'malha_aterramento']);
  });

  it('differs from v12 by exactly its stories, and v1 to v12 hash as they shipped', () => {
    // e23b: batch e23b's delta is undone here and pinned in its own block below; e23v's and e23t's the same way.
    const stripped = withoutE23b(withoutE23v(withoutE23t(structuredClone(v13) as typeof v13)));
    // Batch e23a (Stories 23.2 and 23.4): the criterion tables and the instrument-limit note on the insulation tests.
    for (const definition of Object.values(stripped.blocks)) {
      for (const test of definition?.tests ?? []) {
        delete test.criterion_table;
        delete test.instrument_limit_note;
      }
    }
    expect(JSON.stringify(stripped)).toBe(JSON.stringify(v12));
    expect(hash('v11'), 'seed v11 changed after it shipped: add a new version instead').toBe(V11_HASH);
    expect(hash('v12'), 'seed v12 changed after it shipped: add a new version instead').toBe(V12_HASH);
    expect(hash('v13'), 'seed v13 changed: before its first deploy update this pin, after it add a new version').toBe(V13_HASH);
  });
});

describe('seed v13, batch e23a (Stories 23.2 and 23.4): the NETA tables and the instrument-limit note', () => {
  const v13 = getSeed('v13', 'cabine_primaria');
  const insulation = (type: string) => (v13.blocks as Record<string, BlockDefinition | undefined>)[type]!.tests.find((test) => test.key === 'isolacao')!;

  it('carries the two tables with every row sourced, editioned and given one of the base\'s four statuses', () => {
    expect([...CRITERION_ROW_STATUSES]).toEqual(['CONFIRMADO', 'CONFERIR NA NORMA', 'FABRICANTE', 'PADRÃO FASOR']);
    for (const table of [NETA_100_1, NETA_100_5]) {
      for (const row of table.rows) {
        expect(row.source).toEqual({ name: 'ANSI/NETA MTS', edition: '2023' });
        expect(CRITERION_ROW_STATUSES).toContain(row.status);
        expect(row.status).toBe('CONFIRMADO');
        expect(row.unit).toBe('MΩ');
      }
    }
    expect(NETA_100_1.rows.map((row) => [row.up_to_v, row.test_voltage_v, row.min])).toEqual([
      [250, 500, 25],
      [600, 1000, 100],
      [1000, 1000, 100],
      [2500, 1000, 500],
      [5000, 2500, 1500],
      [8000, 2500, 2500],
      [15000, 2500, 5000],
      [25000, 5000, 10000],
      [34500, 5000, 100000],
      [null, 5000, 100000],
    ]);
    expect(NETA_100_5.rows.map((row) => [row.up_to_v, row.test_voltage_v, row.oil, row.dry])).toEqual([
      [600, 1000, 100, 500],
      [5000, 2500, 1000, 5000],
      [null, 5000, 5000, 25000],
    ]);
  });

  // Fix batch e23w (Bruno's answer B-4, 2026-11-09): the TP takes the TC's Table 100.5 by its AT and its medium (TP-02).
  it('picks Table 100.5 on the transformer (by winding, by medium), the TC and the TP (by primary and medium), 100.1 on the disjuntor, seccionadora and para-raio; the cables keep the seeded criterion', () => {
    expect(insulation('transformador_forca').criterion_table).toEqual({ table: NETA_100_5, voltage: 'winding', medium: 'oil_rule' });
    expect(insulation('tc').criterion_table).toEqual({ table: NETA_100_5, voltage: { field: 'tensao_nominal_at' }, medium: 'oil_rule' });
    expect(insulation('tp').criterion_table).toEqual({ table: NETA_100_5, voltage: { field: 'tensao_nominal_at' }, medium: 'oil_rule' });
    // The TP's medium: TIPO DE ISOLAÇÃO, required, its oil rule's field; its AT is read over √3.
    const tp = getDefinition('v13', 'cabine_primaria', 'tp');
    expect(tp.oil_rule!.field).toBe('tipo_de_isolacao');
    expect(tp.nameplate.find((field) => field.key === 'tipo_de_isolacao')).toMatchObject({ kind: 'select', options: ['EPÓXI', 'Á SECO', 'ÓLEO MINERAL'] });
    expect(tp.nameplate.find((field) => field.key === 'tipo_de_isolacao')!.optional).toBeUndefined();
    expect(tp.nameplate.find((field) => field.key === 'tensao_nominal_at')).toMatchObject({ kind: 'number', unit: 'kV', over_sqrt3: true });
    expect(insulation('disjuntor_mt').criterion_table).toEqual({ table: NETA_100_1, voltage: { field: 'tensao_nominal' } });
    expect(insulation('chave_seccionadora').criterion_table).toEqual({ table: NETA_100_1, voltage: { field: 'tensao_de_placa' } });
    expect(insulation('para_raio').criterion_table).toEqual({ table: NETA_100_1, voltage: { field: 'tensao_nominal' } });
    for (const type of ['cabos_entrada', 'cabos_saida', 'quadro_eletrico']) expect(insulation(type).criterion_table, type).toBeUndefined();
  });

  it('flags the instrument-limit note on the insulation test of the eight FO.SERV-03 types only', () => {
    for (const type of BASE_EQUIPMENT_BLOCK_TYPES) expect(insulation(type).instrument_limit_note, type).toBe(true);
    expect(insulation('quadro_eletrico').instrument_limit_note).toBeUndefined();
    for (const definition of Object.values(v13.blocks)) {
      for (const test of definition?.tests ?? []) if (test.key !== 'isolacao') expect(test.instrument_limit_note).toBeUndefined();
    }
  });

  it('no definition of v1 to v12 carries either key', () => {
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']) {
      for (const definition of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const test of definition?.tests ?? []) {
          expect(test.criterion_table, version).toBeUndefined();
          expect(test.instrument_limit_note, version).toBeUndefined();
        }
      }
    }
  });

  it('refuses a criterion table whose plate field, rows or medium do not hold', () => {
    const disjuntor = structuredClone((v13.blocks as Record<string, BlockDefinition>).disjuntor_mt!);
    const at = disjuntor.tests.findIndex((test) => test.key === 'isolacao');
    const withTable = (table: unknown) => ({ ...disjuntor, tests: disjuntor.tests.map((test, i) => (i === at ? { ...test, criterion_table: table } : test)) });
    expect(blockDefinitionSchema.safeParse(disjuntor).success).toBe(true);
    // A field that is not a voltage, a medium with no oil rule, a medium over a one-column table.
    expect(blockDefinitionSchema.safeParse(withTable({ table: NETA_100_1, voltage: { field: 'corrente_nominal' } })).success).toBe(false);
    expect(blockDefinitionSchema.safeParse(withTable({ table: NETA_100_5, voltage: { field: 'tensao_nominal' }, medium: 'oil_rule' })).success).toBe(true);
    expect(blockDefinitionSchema.safeParse(withTable({ table: NETA_100_1, voltage: { field: 'tensao_nominal' }, medium: 'oil_rule' })).success).toBe(false);
    expect(blockDefinitionSchema.safeParse(withTable({ table: NETA_100_5, voltage: { field: 'tensao_nominal' } })).success).toBe(false);
    const seccionadora = structuredClone((v13.blocks as Record<string, BlockDefinition>).chave_seccionadora!);
    const iso = seccionadora.tests.findIndex((test) => test.key === 'isolacao');
    const noRule = { ...seccionadora, tests: seccionadora.tests.map((test, i) => (i === iso ? { ...test, criterion_table: { table: NETA_100_5, voltage: { field: 'tensao_de_placa' }, medium: 'oil_rule' } } : test)) };
    expect(blockDefinitionSchema.safeParse(noRule).success).toBe(false);
    // By winding: every table of the test needs its voltage_rows.
    const noRows = { ...disjuntor, tests: disjuntor.tests.map((test, i) => (i === at ? { ...test, criterion_table: { table: NETA_100_1, voltage: 'winding' }, tables: test.tables.map((table) => { const bare = { ...table, value_columns: table.value_columns.filter((column) => column.role !== 'voltage') }; delete bare.voltage_rows; return bare; }) } : test)) };
    expect(blockDefinitionSchema.safeParse(noRows).success).toBe(false);
    // Rows out of order.
    expect(blockDefinitionSchema.safeParse(withTable({ table: { ...NETA_100_1, rows: [...NETA_100_1.rows].reverse() }, voltage: { field: 'tensao_nominal' } })).success).toBe(false);
  });
});

// --- e23b: Stories 23.7 to 23.9 ---------------------------------------------------------------

/** The nameplate keys batch e23b appends after v12's (Story 23.7), by type. */
const E23B_APPENDED: Readonly<Partial<Record<(typeof EIGHT)[number], readonly string[]>>> = {
  transformador_forca: ['impedancia_pct', 'material_enrolamento', 'temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica'],
  disjuntor_mt: ['tipo_montagem', 'tensao_comando_v', 'acionamento', 'contador_operacoes', 'tempo_abertura_fab_ms', 'tempo_fechamento_fab_ms'],
  chave_seccionadora: ['tipo_seccionadora', 'fusivel_corrente_a'],
  tp: ['grupo_ligacao_tp'],
  para_raio: ['mcov_kv', 'involucro', 'desligador_integro'],
  cabos_entrada: ['classe_cabo', 'isolacao_cabo', 'secao_mm2', 'comprimento_m', 'tipo_terminacao', 'condicao_cabo'],
  cabos_saida: ['classe_cabo', 'isolacao_cabo', 'secao_mm2', 'comprimento_m', 'tipo_terminacao', 'condicao_cabo'],
};

/** Batch e23b's delta undone, so a v13 holding it compares with v12 for everything else (the e23a block reads it). */
function withoutE23b(seed: ReportSeed): ReportSeed {
  const out = structuredClone(seed);
  const blocks = out.blocks;
  for (const [type, keys] of Object.entries(E23B_APPENDED)) {
    const definition = blocks[type as (typeof EIGHT)[number]];
    definition.nameplate = definition.nameplate.filter((field) => !keys!.includes(field.key));
  }
  const transformer = blocks.transformador_forca;
  transformer.nameplate.splice(
    transformer.nameplate.findIndex((field) => field.key === 'taps'),
    2,
    { key: 'tap_atual', label: 'TAP ATUAL', kind: 'text' },
  );
  const rule = transformer.oil_rule!;
  rule.fields = rule.fields.filter((key) => key !== 'temperatura_oleo_c');
  delete rule.dry_fields;
  for (const test of transformer.tests) for (const table of test.tables) delete table.rows_from;
  const acionamento = blocks.chave_seccionadora.nameplate.find((field) => field.key === 'acionamento')!;
  acionamento.options = acionamento.options!.filter((option) => option !== 'MOTORIZADO');
  for (const field of blocks.tp.nameplate) delete field.over_sqrt3;
  for (const field of blocks.tc.nameplate) delete field.dash_ratio;
  for (const type of ['cabos_entrada', 'cabos_saida'] as const) blocks[type].sub_blocks = blocks[type].sub_blocks.filter((key) => key !== 'nameplate');
  return out;
}

describe('seed v13, batch e23b (Stories 23.7 to 23.9): the nameplate fields of decision K, the TTR per tap and the applicability keys', () => {
  const v12 = getSeed('v12', 'cabine_primaria');
  const v13 = getSeed('v13', 'cabine_primaria');
  const keysOf = (version: string, type: string) => getDefinition(version, 'cabine_primaria', type).nameplate.map((field) => field.key);

  it('adds exactly its delta to v12: the appended fields, TAPS and TAP ATUAL in place, the dry fields, the TTR from TAPS, MOTORIZADO, √3, the dash, the cable nameplate', () => {
    // Batch e23a's keys (the criterion tables, the instrument-limit note) are pinned in its own block; e23v's too.
    const bare = withoutE23b(withoutE23v(withoutE23t(structuredClone(v13) as typeof v13)));
    for (const definition of Object.values(bare.blocks)) {
      for (const test of definition?.tests ?? []) {
        delete test.criterion_table;
        delete test.instrument_limit_note;
      }
    }
    expect(JSON.stringify(bare)).toBe(JSON.stringify(v12));
    for (const [type, keys] of Object.entries(E23B_APPENDED)) {
      const before = keysOf('v12', type).flatMap((key) => (type === 'transformador_forca' && key === 'tap_atual' ? ['taps', 'tap_atual_kv'] : [key]));
      // Batch e23t's NATUREZA DO LÍQUIDO and TIPO (ANP) are pinned in its own block.
      const added = (withoutE23t(v13).blocks as Record<string, BlockDefinition | undefined>)[type]!.nameplate.map((field) => field.key).filter((key) => !before.includes(key));
      expect(added, type).toEqual(keys);
    }
    // No test of v13 carries an applicability condition or starts off: every one is "Sempre" (Base rev08).
    // Batch e23t: but the measurement tests it adds (Stories 23.17 and 23.19, pinned in its own block below).
    for (const definition of Object.values(withoutE23t(v13).blocks)) {
      for (const test of definition!.tests) expect([test.applies_when, test.initial_off], `${definition!.block_type} ${test.key}`).toEqual([undefined, undefined]);
      for (const test of definition!.measurement_tests ?? []) expect([test.applies_when, test.initial_off], `${definition!.block_type} ${test.key}`).toEqual([undefined, undefined]);
    }
    // Batch e23t (Story 23.17): TIPO DO ÓLEO gave way to NATUREZA DO LÍQUIDO and TIPO (ANP) (pinned in its own block below).
    expect(withoutE23t(v13).blocks.transformador_forca.oil_rule).toMatchObject({ fields: ['vol_oleo', 'tipo_do_oleo', 'temperatura_oleo_c'], dry_fields: ['temperatura_enrolamento_c', 'classe_termica'] });
  });

  it('pins the options it takes from the base (Base rev08 equipamentos[].campos) and which fields are optional', () => {
    const field = (type: string, key: string) => getDefinition('v13', 'cabine_primaria', type).nameplate.find((one) => one.key === key)!;
    expect(field('transformador_forca', 'classe_termica').options).toEqual(['B (130)', 'F (155)', 'H (180)']);
    expect(field('disjuntor_mt', 'tipo_montagem').options).toEqual(['EXTRAÍVEL', 'FIXO']);
    expect(field('disjuntor_mt', 'acionamento').options).toEqual(['MOLA MOTORIZADA', 'MOLA MANUAL', 'MAGNÉTICO']);
    expect(field('disjuntor_mt', 'tensao_comando_v').kind).toBe('text');
    expect(field('chave_seccionadora', 'tipo_seccionadora').options).toEqual(['SEM CARGA', 'SOB CARGA (INTERRUPTORA)', 'SOB CARGA COM FUSÍVEIS', 'CHAVE DE ATERRAMENTO']);
    expect(field('tp', 'grupo_ligacao_tp').options).toEqual(['1 (FASE-FASE)', '2 (FASE-TERRA, SISTEMA ATERRADO)', '3 (FASE-TERRA, SISTEMA ISOLADO)']);
    expect(field('para_raio', 'involucro').options).toEqual(['POLIMÉRICO', 'CERÂMICO']);
    expect(field('para_raio', 'desligador_integro').options).toEqual(['SIM', 'NÃO']);
    expect(field('para_raio', 'mcov_kv')).toMatchObject({ kind: 'number', unit: 'kV' });
    expect(field('cabos_entrada', 'classe_cabo').options).toEqual(['3,6/6 kV', '6/10 kV', '8,7/15 kV', '12/20 kV', '15/25 kV', '20/35 kV']);
    expect(field('cabos_saida', 'secao_mm2')).toMatchObject({ kind: 'number', unit: 'mm²' });
    const optional = (type: string) => getDefinition('v13', 'cabine_primaria', type).nameplate.filter((one) => one.optional === true).map((one) => one.key);
    expect(optional('transformador_forca')).toEqual(['impedancia_pct', 'temperatura_oleo_c', 'temperatura_enrolamento_c', 'classe_termica']);
    expect(optional('disjuntor_mt')).toEqual(['contador_operacoes', 'tempo_abertura_fab_ms', 'tempo_fechamento_fab_ms']);
    expect(optional('chave_seccionadora')).toEqual(['fusivel_corrente_a']);
    for (const type of ['tp', 'tc', 'para_raio', 'cabos_entrada', 'cabos_saida']) expect(optional(type), type).toEqual([]);
  });

  it('refuses at load a pick_from, a rows_from, a dry field or a key on the wrong kind that names nothing the definition holds', () => {
    const transformer = () => structuredClone(getDefinition('v13', 'cabine_primaria', 'transformador_forca')) as BlockDefinition;
    const issues = (definition: unknown) => blockDefinitionSchema.safeParse(definition).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];
    expect(issues(transformer())).toEqual([]);
    const pickAt = transformer().nameplate.findIndex((field) => field.key === 'tap_atual_kv');
    const withField = (key: string, change: Partial<FieldDef>) => {
      const definition = transformer();
      definition.nameplate = definition.nameplate.map((field) => (field.key === key ? ({ ...field, ...change } as FieldDef) : field));
      return definition;
    };
    expect(issues(withField('tap_atual_kv', { pick_from: 'potencia_nominal' }))).toEqual([`nameplate.${pickAt}.pick_from: pick_from "potencia_nominal" is not a list field of the nameplate in kV`]);
    expect(issues(withField('tap_atual_kv', { pick_from: 'taps', unit: 'V' }))).toEqual([`nameplate.${pickAt}.pick_from: pick_from "taps" is not a list field of the nameplate in V`]);
    const ratio = (rowsFrom: string) => {
      const definition = transformer();
      definition.tests = definition.tests.map((test) => (test.key === 'relacao_transformacao' ? { ...test, tables: test.tables.map((table) => ({ ...table, rows_from: rowsFrom })) } : test));
      return definition;
    };
    expect(issues(ratio('tensao_nominal_at'))).toEqual(['tests.1.tables.0.rows_from: rows_from "tensao_nominal_at" is not a list field of the nameplate in V or kV']);
    expect(issues(ratio('nao_existe'))).toEqual(['tests.1.tables.0.rows_from: rows_from "nao_existe" is not a list field of the nameplate in V or kV']);
    const insulation = transformer();
    insulation.tests = insulation.tests.map((test) => (test.key === 'isolacao' ? { ...test, tables: test.tables.map((table) => ({ ...table, rows_from: 'taps' })) } : test));
    expect(issues(insulation)).toEqual([
      'tests.0.tables.0.rows_from: rows_from belongs to a table whose connection is typed',
      'tests.0.tables.0.rows_from: rows_from belongs to a table of one seeded row and one connection column',
    ]);
    const dry = transformer();
    dry.oil_rule = { ...dry.oil_rule!, dry_fields: ['nao_existe'] };
    expect(issues(dry)).toEqual(['oil_rule.dry_fields: a dry field "nao_existe" is not on the nameplate']);
    expect(issues(withField('identificacao', { list: true }))).toContain(`nameplate.${transformer().nameplate.findIndex((field) => field.key === 'identificacao')}: list, pick_from and over_sqrt3 belong to a number field`);
    expect(fieldDefSchema.safeParse({ key: 'relacao', label: 'RELAÇÃO', kind: 'number', dash_ratio: true }).success).toBe(false);
    expect(fieldDefSchema.safeParse({ key: 'taps', label: 'TAPS', kind: 'number', unit: 'kV', list: true, pick_from: 'outra' }).success).toBe(false);
  });
});

// --- e23v: Stories 23.5, 23.6, 23.14 ---------------------------------------------------------------

/** Batch e23v's delta undone (the three test keys), so a v13 holding it compares with v12 for everything else. */
function withoutE23v(seed: ReportSeed): ReportSeed {
  const out = structuredClone(seed);
  for (const definition of Object.values(out.blocks)) {
    for (const test of definition?.tests ?? []) {
      delete test.temperature_correction;
      delete test.restriction;
      delete test.criterion_status;
    }
  }
  return out;
}

describe('seed v13, batch e23v (Stories 23.5, 23.6 and 23.14): the temperature correction, the restriction rules and the contact criterion status', () => {
  const v12 = getSeed('v12', 'cabine_primaria');
  const v13 = getSeed('v13', 'cabine_primaria');
  const test = (type: string, key: string) => getDefinition('v13', 'cabine_primaria', type).tests.find((one) => one.key === key)!;
  const keys = (type: string, key: string) => {
    const found = test(type, key);
    return { temperature_correction: found.temperature_correction, restriction: found.restriction, criterion_status: found.criterion_status };
  };

  it('adds exactly its keys to v13, on the tests the base rows name (Base rev08 TR-OL-02, TR-SE-02, DJ-02, DJ-03, SC-02, SC-03, CB-02, PR-02)', () => {
    // With e23a's and e23b's own deltas undone too, v13 is v12.
    const bare = withoutE23b(withoutE23v(withoutE23t(structuredClone(v13) as typeof v13)));
    for (const definition of Object.values(bare.blocks)) {
      for (const one of definition?.tests ?? []) {
        delete one.criterion_table;
        delete one.instrument_limit_note;
      }
    }
    expect(JSON.stringify(bare)).toBe(JSON.stringify(v12));
    expect(keys('transformador_forca', 'isolacao')).toEqual({
      temperature_correction: { to_c: 20, medium: 'oil_rule', oil_field: 'temperatura_oleo_c', dry_field: 'temperatura_enrolamento_c' },
      restriction: { history_drop_pct: 50, status: 'PADRÃO FASOR' },
      criterion_status: undefined,
    });
    for (const type of ['disjuntor_mt', 'chave_seccionadora']) {
      expect(keys(type, 'isolacao'), type).toEqual({ temperature_correction: { to_c: 20, medium: 'solid' }, restriction: undefined, criterion_status: undefined });
      // Fix batch e23w (Bruno's answer B-6): a pole more than 50 % above the previous v13 visit's is out.
      expect(keys(type, 'resistencia_contato'), type).toEqual({ temperature_correction: undefined, restriction: { pole_deviation_pct: 50, history_rise_out_pct: 50, status: 'CONFIRMADO' }, criterion_status: 'PADRÃO FASOR' });
    }
    for (const type of ['cabos_entrada', 'cabos_saida']) {
      expect(keys(type, 'isolacao'), type).toEqual({ temperature_correction: undefined, restriction: { below_largest_pct: 50, status: 'PADRÃO FASOR' }, criterion_status: undefined });
    }
    expect(keys('para_raio', 'isolacao')).toEqual({
      temperature_correction: undefined,
      restriction: { below_largest_pct: 50, prerequisite: { field: 'desligador_integro', fails_on: ['NÃO'] }, status: 'PADRÃO FASOR' },
      criterion_status: undefined,
    });
    // The TC, the TP, the ratio tests and every library type carry none of the three (no base row names a correction or a rule there).
    for (const definition of Object.values(v13.blocks)) {
      for (const one of definition!.tests) {
        const named = ['transformador_forca/isolacao', 'disjuntor_mt/isolacao', 'disjuntor_mt/resistencia_contato', 'chave_seccionadora/isolacao', 'chave_seccionadora/resistencia_contato', 'cabos_entrada/isolacao', 'cabos_saida/isolacao', 'para_raio/isolacao'];
        if (named.includes(`${definition!.block_type}/${one.key}`)) continue;
        expect([one.temperature_correction, one.restriction, one.criterion_status], `${definition!.block_type} ${one.key}`).toEqual([undefined, undefined, undefined]);
      }
    }
    // Every status is one of the base's four.
    for (const definition of Object.values(v13.blocks)) {
      for (const one of definition!.tests) {
        if (one.restriction !== undefined) expect(CRITERION_ROW_STATUSES).toContain(one.restriction.status);
        if (one.criterion_status !== undefined) expect(CRITERION_ROW_STATUSES).toContain(one.criterion_status);
      }
    }
  });

  it('no definition of v1 to v12 carries any of the three keys (AD-21)', () => {
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']) {
      for (const definition of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const one of definition?.tests ?? []) expect([one.temperature_correction, one.restriction, one.criterion_status], `${version} ${definition!.block_type} ${one.key}`).toEqual([undefined, undefined, undefined]);
      }
    }
  });

  it('refuses at load a correction, a restriction or a status that names nothing the definition holds', () => {
    const issues = (definition: unknown) => blockDefinitionSchema.safeParse(definition).error?.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) ?? [];
    const withTest = (type: string, key: string, change: (one: TestDef) => TestDef) => {
      const definition = structuredClone(getDefinition('v13', 'cabine_primaria', type)) as BlockDefinition;
      definition.tests = definition.tests.map((one) => (one.key === key ? change(one) : one));
      return definition;
    };
    const at = (type: string, key: string) => getDefinition('v13', 'cabine_primaria', type).tests.findIndex((one) => one.key === key);
    const tf = at('transformador_forca', 'isolacao');
    expect(issues(withTest('transformador_forca', 'isolacao', (one) => one))).toEqual([]);
    // A field that is not a number in °C, or not on the plate.
    expect(issues(withTest('transformador_forca', 'isolacao', (one) => ({ ...one, temperature_correction: { ...one.temperature_correction!, oil_field: 'potencia_nominal' } })))).toEqual([
      `tests.${tf}.temperature_correction.oil_field: temperature_correction.oil_field "potencia_nominal" is not a number field of the nameplate in °C`,
    ]);
    expect(issues(withTest('transformador_forca', 'isolacao', (one) => ({ ...one, temperature_correction: { ...one.temperature_correction!, dry_field: 'nao_existe' } })))).toEqual([
      `tests.${tf}.temperature_correction.dry_field: temperature_correction.dry_field "nao_existe" is not a number field of the nameplate in °C`,
    ]);
    // A correction read by the oil rule on a type with none; an oil field on a solid correction.
    const dj = at('disjuntor_mt', 'isolacao');
    const noRule = withTest('disjuntor_mt', 'isolacao', (one) => ({ ...one, temperature_correction: { to_c: 20, medium: 'oil_rule' } }));
    delete noRule.oil_rule;
    expect(issues(noRule)).toContain(`tests.${dj}.temperature_correction.medium: a temperature correction read by the oil rule needs an oil_rule`);
    expect(issues(withTest('disjuntor_mt', 'isolacao', (one) => ({ ...one, temperature_correction: { to_c: 20, medium: 'solid', oil_field: 'tensao_nominal' } })))).toContain(
      `tests.${dj}.temperature_correction.oil_field: oil_field belongs to a correction read by the oil rule`,
    );
    // A history rule with no correction; a prerequisite on a field that is no select, or naming an option it lacks.
    const cable = at('cabos_entrada', 'isolacao');
    expect(issues(withTest('cabos_entrada', 'isolacao', (one) => ({ ...one, restriction: { history_drop_pct: 50, status: 'PADRÃO FASOR' } })))).toEqual([
      `tests.${cable}.restriction.history_drop_pct: a history rule needs the test's temperature_correction`,
    ]);
    const pr = at('para_raio', 'isolacao');
    expect(issues(withTest('para_raio', 'isolacao', (one) => ({ ...one, restriction: { ...one.restriction!, prerequisite: { field: 'mcov_kv', fails_on: ['NÃO'] } } })))).toEqual([
      `tests.${pr}.restriction.prerequisite: restriction.prerequisite names a select of the nameplate and only its options ("mcov_kv")`,
    ]);
    expect(issues(withTest('para_raio', 'isolacao', (one) => ({ ...one, restriction: { ...one.restriction!, prerequisite: { field: 'desligador_integro', fails_on: ['TALVEZ'] } } })))).toEqual([
      `tests.${pr}.restriction.prerequisite: restriction.prerequisite names a select of the nameplate and only its options ("desligador_integro")`,
    ]);
    // The shapes: a share outside (0, 100), a restriction with no rule, a status the base does not have, another reference temperature.
    const pole = at('disjuntor_mt', 'resistencia_contato');
    for (const bad of [{ pole_deviation_pct: 0, status: 'CONFIRMADO' }, { pole_deviation_pct: 100, status: 'CONFIRMADO' }, { status: 'CONFIRMADO' }, { pole_deviation_pct: 50, status: 'OUTRO' }]) {
      expect(issues(withTest('disjuntor_mt', 'resistencia_contato', (one) => ({ ...one, restriction: bad as TestDef['restriction'] }))).some((issue) => issue.startsWith(`tests.${pole}.restriction`)), JSON.stringify(bad)).toBe(true);
    }
    expect(issues(withTest('disjuntor_mt', 'resistencia_contato', (one) => ({ ...one, criterion_status: 'OUTRO' as TestDef['criterion_status'] }))).some((issue) => issue.startsWith(`tests.${pole}.criterion_status`))).toBe(true);
    expect(issues(withTest('disjuntor_mt', 'isolacao', (one) => ({ ...one, temperature_correction: { to_c: 75, medium: 'solid' } as unknown as TestDef['temperature_correction'] }))).some((issue) => issue.startsWith(`tests.${dj}.temperature_correction.to_c`))).toBe(true);
  });
});

describe('K-20 (full review 2026-09-30) findDefinition and findSeed', () => {
  it('answer getDefinition and getSeed, and null where those throw', () => {
    expect(findDefinition('v1', 'tp')).toBe(getDefinition('v1', 'cabine_primaria', 'tp'));
    expect(findDefinition('v1', 'tp')).toBe(findDefinition('v1', 'tp'));
    expect(findDefinition('v1', 'section_1')).toBeNull();
    expect(findDefinition('v999', 'tp')).toBeNull();
    expect(findSeed('v1')).toBe(getSeed('v1', 'cabine_primaria'));
    expect(findSeed('v999')).toBeNull();
  });
});


describe('the 2026-11-04 option amendment of v1 to v5 (Matheus, for Bruno)', () => {
  const options = (version: string, type: string, key: string) => getDefinition(version, 'cabine_primaria', type).nameplate.find((field) => field.key === key)!.options;
  const optionsOf = (bundle: unknown, type: string, key: string) => {
    const seed = (bundle as { report_types: { cabine_primaria: ReportSeed } }).report_types.cabine_primaria;
    return (seed.blocks as Record<string, BlockDefinition | undefined>)[type]?.nameplate.find((f) => f.key === key)?.options;
  };

  it('appends VÁCUO and ÓLEO to the disjuntor and ÓLEO to the transformador de força on each of v1 to v5, and changes nothing else', () => {
    expect([...LEGACY_OPTION_VERSIONS]).toEqual(['v1', 'v2', 'v3', 'v4', 'v5']);
    for (const version of LEGACY_OPTION_VERSIONS) {
      const before = shipped(version);
      expect(optionsOf(before, 'disjuntor_mt', 'meio_de_extincao'), version).toEqual(['AR', 'SF6']);
      expect(optionsOf(before, 'transformador_forca', 'tipo_de_isolacao'), version).toEqual(['EPÓXI', 'Á SECO']);
      expect(options(version, 'disjuntor_mt', 'meio_de_extincao'), version).toEqual(['AR', 'SF6', 'VÁCUO', 'ÓLEO']);
      expect(options(version, 'transformador_forca', 'tipo_de_isolacao'), version).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO']);
      // Every other byte as shipped: putting the two old lists back gives the shipped bundle.
      const served = structuredClone(SEED_VERSIONS[version]) as unknown as { report_types: { cabine_primaria: ReportSeed } };
      const blocks = served.report_types.cabine_primaria.blocks as Record<string, BlockDefinition>;
      blocks.disjuntor_mt!.nameplate.find((f) => f.key === 'meio_de_extincao')!.options = ['AR', 'SF6'];
      blocks.transformador_forca!.nameplate.find((f) => f.key === 'tipo_de_isolacao')!.options = ['EPÓXI', 'Á SECO'];
      expect(JSON.stringify(served), version).toBe(JSON.stringify(before));
    }
  });

  it('leaves v6 and later as served, with no oil rule added to v1 to v5', () => {
    for (const version of LEGACY_OPTION_VERSIONS) {
      expect(getDefinition(version, 'cabine_primaria', 'disjuntor_mt').oil_rule, version).toBeUndefined();
      expect(getDefinition(version, 'cabine_primaria', 'transformador_forca').oil_rule, version).toBeUndefined();
    }
    expect(withLegacyOptions(CABINE_PRIMARIA_V5).blocks.chave_seccionadora.nameplate.find((f) => f.key === 'meio_de_extincao')?.options).toEqual(['AR', 'SF6']);
    expect(options('v7', 'disjuntor_mt', 'meio_de_extincao')).toEqual(['Ar', 'Gás SF6', 'Vácuo', 'Óleo', 'Outro']);
  });
});

// --- e23t: Stories 23.15 to 23.17 and 23.19 ---------------------------------------------------------

/** Batch e23t's delta undone (batch e23e's, applied after it, first), so a v13 holding it compares with v12 (through the other batches' strips) for everything else. */
function withoutE23t(seed: ReportSeed): ReportSeed {
  const out = withoutE23e(seed);
  const blocks = out.blocks;
  const transformer = blocks.transformador_forca;
  transformer.nameplate = transformer.nameplate.flatMap((field): FieldDef[] => {
    if (field.key === 'tipo_de_isolacao') return [{ ...field, options: ['EPÓXI', 'Á SECO', 'ÓLEO MINERAL'], option_aliases: { ÓLEO: 'ÓLEO MINERAL' } }];
    if (field.key === 'natureza_liquido') return [{ key: 'tipo_do_oleo', label: 'TIPO DO ÓLEO', kind: 'select', options: ['A', 'B'] }];
    if (field.key === 'tipo_anp') return [];
    return [field];
  });
  const rule = transformer.oil_rule!;
  rule.oil_values = ['ÓLEO MINERAL'];
  rule.fields = rule.fields.flatMap((key) => (key === 'natureza_liquido' ? ['tipo_do_oleo'] : key === 'tipo_anp' ? [] : [key]));
  for (const test of transformer.tests) {
    delete test.polarization_index;
    for (const table of test.tables) for (const column of table.value_columns) if (column.role === 'index') column.role = 'print';
  }
  const added = ['resistencia_enrolamento', 'coleta_oleo', 'resistencia_fusiveis'];
  for (const type of ['transformador_forca', 'disjuntor_mt', 'chave_seccionadora'] as const) {
    const definition = blocks[type];
    const kept = (definition.measurement_tests ?? []).filter((test) => !added.includes(test.key));
    if (kept.length === 0) delete definition.measurement_tests;
    else definition.measurement_tests = kept;
    definition.sub_blocks = definition.sub_blocks.filter((key) => !added.includes(key));
  }
  transformer.sub_blocks.splice(transformer.sub_blocks.indexOf('isolacao') + 1, 0, 'ia_ip_display');
  return out;
}

describe('seed v13, batch e23t (Stories 23.15 to 23.17 and 23.19): the winding resistance, the typed IP, the insulating liquid and the oil sampling, the HH fuses', () => {
  const v13 = getSeed('v13', 'cabine_primaria');
  const definition = (type: string) => getDefinition('v13', 'cabine_primaria', type);
  const measurement = (type: string, key: string) => definition(type).measurement_tests!.find((test) => test.key === key)!;

  it('adds its three sub-blocks to SUB_BLOCK_KEYS, appended in order, and to the three types before OBSERVAÇÕES', () => {
    // Batch e23e appends its three after them.
    expect(SUB_BLOCK_KEYS.slice(-6, -3)).toEqual(['resistencia_enrolamento', 'coleta_oleo', 'resistencia_fusiveis']);
    // Batch e23e (Story 23.20): the thermography follows them, the last measurement test of each of the eight.
    expect(definition('transformador_forca').sub_blocks).toEqual(['nameplate', 'checklist', 'isolacao', 'relacao_transformacao', 'resistencia_enrolamento', 'coleta_oleo', 'termografia', 'observations', 'conclusion']);
    expect(definition('disjuntor_mt').sub_blocks.slice(-4)).toEqual(['coleta_oleo', 'termografia', 'observations', 'conclusion']);
    expect(definition('chave_seccionadora').sub_blocks.slice(-4)).toEqual(['resistencia_fusiveis', 'termografia', 'observations', 'conclusion']);
    // The other types gain nothing of this batch (batch e23e's thermography only).
    for (const type of ['cabos_entrada', 'cabos_saida', 'para_raio', 'tp', 'tc']) expect(definition(type).measurement_tests!.map((test) => test.key), type).toEqual(['termografia']);
  });

  it('Story 23.15: the winding table, its two deviation criteria by medium, the 75 °C correction and the history rule (Base rev08 TR-OL-05, TR-SE-05)', () => {
    const test = measurement('transformador_forca', 'resistencia_enrolamento');
    expect(test.label).toBe('Resistência ôhmica dos enrolamentos');
    expect(test.instrument_of).toBe('resistencia_contato');
    expect(test.switchable).toBeDefined();
    expect(test.initial_off).toBeUndefined();
    expect(test.rows.map((row) => [row.key, row.unit, row.optional ?? false])).toEqual([
      ['at_tap_atual', 'Ω', false],
      ['at_primeiro_tap', 'Ω', true],
      ['at_ultimo_tap', 'Ω', true],
      ['bt', 'mΩ', false],
    ]);
    expect(test.columns.map((column) => column.label)).toEqual(['Fase A', 'Fase B', 'Fase C']);
    expect(test.criteria.map((criterion) => (criterion.type === 'phase_deviation' ? [criterion.medium, criterion.within_max_pct, criterion.restricted_max_pct, criterion.above] : null))).toEqual([
      ['oil', 2, 5, 'out'],
      ['dry', 2, undefined, 'restricted'],
    ]);
    expect(test.winding_correction).toEqual({ to_c: 75, material_field: 'material_enrolamento', oil_field: 'temperatura_oleo_c', dry_field: 'temperatura_enrolamento_c' });
    expect(test.history_deviation_pct).toBe(2);
  });

  it('Story 23.16: ABSORÇÃO and POLARIZAÇÃO are typed index columns, the IP judged by class, and IA e IP lidos do visor leaves the transformer', () => {
    const insulation = definition('transformador_forca').tests.find((test) => test.key === 'isolacao')!;
    const columns = insulation.tables[0]!.value_columns.map((column) => [column.label, column.role]);
    expect(columns).toEqual([
      ['30 SEGUNDOS', 'print'],
      ['1 MINUTO', 'capture'],
      ['ESTAB./10MIN', 'print'],
      ['ABSORÇÃO', 'index'],
      ['POLARIZAÇÃO', 'index'],
      ['TENSÃO', 'voltage'],
    ]);
    expect(insulation.polarization_index).toEqual({ column: 'POLARIZAÇÃO', min: 1, restricted_below: 2, required_on: 'dry', dar_column: 'ABSORÇÃO', status: 'CONFIRMADO' });
    expect(definition('transformador_forca').sub_blocks).not.toContain('ia_ip_display');
    // The TP and the TC keep their print columns and their IA e IP lidos do visor.
    for (const type of ['tp', 'tc']) expect(definition(type).sub_blocks, type).toContain('ia_ip_display');
  });

  it('Story 23.17: ÓLEO ISOLANTE with its two earlier spellings, NATUREZA DO LÍQUIDO and TIPO (ANP) in place of TIPO DO ÓLEO, the sampling on the transformer and the disjuntor', () => {
    const plate = definition('transformador_forca').nameplate;
    const field = (key: string) => plate.find((candidate) => candidate.key === key)!;
    expect(field('tipo_de_isolacao')).toMatchObject({ options: ['EPÓXI', 'Á SECO', 'ÓLEO ISOLANTE'], option_aliases: { ÓLEO: 'ÓLEO ISOLANTE', 'ÓLEO MINERAL': 'ÓLEO ISOLANTE' } });
    const keys = plate.map((candidate) => candidate.key);
    expect(keys.slice(keys.indexOf('tipo_de_isolacao'), keys.indexOf('tipo_de_isolacao') + 3)).toEqual(['tipo_de_isolacao', 'natureza_liquido', 'tipo_anp']);
    expect(keys).not.toContain('tipo_do_oleo');
    expect(field('natureza_liquido').options).toEqual(['MINERAL', 'ÉSTER NATURAL (VEGETAL)', 'ÉSTER SINTÉTICO', 'SILICONE']);
    expect(field('tipo_anp')).toMatchObject({ options: ['A', 'B', 'NÃO INFORMADO'], excused_unless: { field: 'natureza_liquido', in: ['MINERAL'] } });
    expect(definition('transformador_forca').oil_rule).toMatchObject({ oil_values: ['ÓLEO ISOLANTE'], fields: ['vol_oleo', 'natureza_liquido', 'tipo_anp', 'temperatura_oleo_c'] });
    // TP and TC keep ÓLEO MINERAL.
    for (const type of ['tp', 'tc']) expect(definition(type).nameplate.find((candidate) => candidate.key === 'tipo_de_isolacao')!.options, type).toEqual(['EPÓXI', 'Á SECO', 'ÓLEO MINERAL']);
    expect(measurement('transformador_forca', 'coleta_oleo').applies_when).toEqual({ field: 'tipo_de_isolacao', op: 'in', values: ['ÓLEO ISOLANTE'] });
    expect(measurement('disjuntor_mt', 'coleta_oleo').applies_when).toEqual({ field: 'meio_de_extincao', op: 'in', values: ['Óleo'] });
    const sampling = measurement('transformador_forca', 'coleta_oleo');
    expect(sampling.values![0]!.when).toEqual({ cell: { row: 'amostra', column: 'resultado' }, equals: 'nao_coletado' });
    expect(sampling.criteria[0]).toMatchObject({ type: 'choice_pass', pass: ['coletado', 'nao_coletado'] });
  });

  it('Story 23.19: the HH fuses by the deviation between fuses, NA unless the seccionadora carries fuses (Base rev08 SC-04)', () => {
    const test = measurement('chave_seccionadora', 'resistencia_fusiveis');
    expect(test.criteria[0]).toMatchObject({ type: 'phase_deviation', across: 'rows', within_max_pct: 15, above: 'out' });
    expect(test.applies_when).toEqual({ field: 'tipo_seccionadora', op: 'in', values: ['SOB CARGA COM FUSÍVEIS'], unmet: 'sem fusíveis' });
    expect(test.label).toBe('Resistência dos fusíveis HH');
  });

  it('no definition of v1 to v12 carries any of its keys (AD-21)', () => {
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']) {
      for (const one of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const test of one?.tests ?? []) {
          expect(test.polarization_index, `${version} ${one!.block_type}`).toBeUndefined();
          for (const table of test.tables) for (const column of table.value_columns) expect(column.role, `${version} ${one!.block_type}`).not.toBe('index');
        }
        for (const field of one?.nameplate ?? []) expect(field.excused_unless, `${version} ${field.key}`).toBeUndefined();
        for (const test of one?.measurement_tests ?? []) {
          expect([test.winding_correction, test.history_deviation_pct], `${version} ${test.key}`).toEqual([undefined, undefined]);
          expect(test.applies_when, `${version} ${test.key}`).toBeUndefined();
          for (const criterion of test.criteria) expect(criterion.type, `${version} ${test.key}`).not.toBe('phase_deviation');
        }
      }
    }
    expect(v13.blocks.transformador_forca.measurement_tests).toBeDefined();
  });

  it('refuses each bad reference of its keys at load', () => {
    const base = (): BlockDefinition => structuredClone(definition('transformador_forca'));
    const refused = (change: (copy: BlockDefinition) => void) => {
      const copy = base();
      change(copy);
      return blockDefinitionSchema.safeParse(copy).success;
    };
    expect(refused(() => undefined)).toBe(true);
    const winding = (copy: BlockDefinition) => copy.measurement_tests!.find((test) => test.key === 'resistencia_enrolamento')!;
    expect(refused((copy) => (winding(copy).winding_correction!.material_field = 'tipo'))).toBe(false);
    expect(refused((copy) => (winding(copy).winding_correction!.oil_field = 'potencia_nominal'))).toBe(false);
    expect(refused((copy) => delete winding(copy).winding_correction)).toBe(false);
    expect(refused((copy) => delete copy.oil_rule)).toBe(false);
    const isolacao = (copy: BlockDefinition) => copy.tests.find((test) => test.key === 'isolacao')!;
    expect(refused((copy) => (isolacao(copy).polarization_index!.column = '1 MINUTO'))).toBe(false);
    expect(refused((copy) => (isolacao(copy).polarization_index!.dar_column = 'OUTRA'))).toBe(false);
    expect(refused((copy) => (isolacao(copy).polarization_index!.restricted_below = 0.5))).toBe(false);
    const anp = (copy: BlockDefinition) => copy.nameplate.find((field) => field.key === 'tipo_anp')!;
    expect(refused((copy) => (anp(copy).excused_unless = { field: 'natureza_liquido', in: ['ÓLEO'] }))).toBe(false);
    expect(refused((copy) => (anp(copy).excused_unless = { field: 'potencia_nominal', in: ['MINERAL'] }))).toBe(false);
    const sampling = (copy: BlockDefinition) => copy.measurement_tests!.find((test) => test.key === 'coleta_oleo')!;
    expect(refused((copy) => (sampling(copy).values![0]!.when = { cell: { row: 'outra', column: 'resultado' }, equals: 'nao_coletado' }))).toBe(false);
    expect(refused((copy) => (sampling(copy).values![0]!.when = { cell: { row: 'amostra', column: 'resultado' }, equals: 'talvez' }))).toBe(false);
    expect(measurementCriterionSchema.safeParse({ type: 'phase_deviation', across: 'rows', within_max_pct: 5, restricted_max_pct: 2, above: 'out', text: 'x', source: { name: 'x', edition: null } }).success).toBe(false);
    expect(measurementCriterionSchema.safeParse({ type: 'phase_deviation', across: 'rows', within_max_pct: 2, restricted_max_pct: 5, above: 'restricted', text: 'x', source: { name: 'x', edition: null } }).success).toBe(false);
  });
});

// --- e23e: Stories 23.13, 23.18, 23.20, 23.21 ---------------------------------------------------------

/** v12's TC EXATIDÃO, which batch e23e's v13 TC replaces with the S classes and the protection classes with their factor. */
const TC_CLASSES_V12 = ['0,3', '0,6', '1,2', '3', '5P', '10P'];

/** Batch e23e's delta undone, so a v13 holding it compares with v12 (through the other batches' strips) for everything else. */
function withoutE23e(seed: ReportSeed): ReportSeed {
  const out = structuredClone(seed);
  const blocks = out.blocks as Record<string, BlockDefinition | undefined>;
  delete blocks.malha_aterramento;
  for (const definition of Object.values(blocks)) {
    if (definition === undefined) continue;
    for (const test of definition.tests) {
      delete test.notice_when;
      delete test.print_note;
      for (const table of test.tables) {
        delete table.voltage_default;
        table.value_columns = table.value_columns.filter((column) => column.role !== 'choice');
      }
    }
    if (definition.measurement_tests !== undefined) {
      const kept = definition.measurement_tests.filter((test) => test.key !== 'termografia');
      if (kept.length === 0) delete definition.measurement_tests;
      else definition.measurement_tests = kept;
    }
    definition.sub_blocks = definition.sub_blocks.filter((key) => key !== 'termografia');
  }
  const tc = blocks.tc!;
  tc.nameplate = tc.nameplate.filter((field) => field.key !== 'funcao_tc').map((field): FieldDef => {
    if (field.key !== 'exatidao') return field;
    const rest: FieldDef = { ...field, options: [...TC_CLASSES_V12] };
    delete rest.option_aliases;
    return rest;
  });
  return out;
}

describe('seed v13, batch e23e (Stories 23.13, 23.18, 23.20 and 23.21): test-voltage defaults, polarity and function, thermography, the Malha de aterramento', () => {
  const v13 = getSeed('v13', 'cabine_primaria');
  const definition = (type: string) => getDefinition('v13', 'cabine_primaria', type);
  const test = (type: string, key: string) => definition(type).tests.find((one) => one.key === key)!;
  const EIGHT_TYPES = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'];

  it('appends its keys to the shared lists after batch e23t\'s', () => {
    expect(SUB_BLOCK_KEYS.slice(-6)).toEqual(['resistencia_enrolamento', 'coleta_oleo', 'resistencia_fusiveis', 'termografia', 'resistencia_malha', 'continuidade_malha']);
    expect(EQUIPMENT_BLOCK_TYPES.slice(-2)).toEqual(['inspecao_qgbt', 'malha_aterramento']);
    expect(Object.keys(v13.blocks).at(-1)).toBe('malha_aterramento');
  });

  it('Story 23.13: every insulation table of the six types names its default\'s field and rule, and the transformer none (decision D)', () => {
    const picks = Object.fromEntries(EIGHT_TYPES.map((type) => [type, test(type, 'isolacao').tables.map((table) => table.voltage_default ?? null)]));
    expect(picks).toEqual({
      cabos_entrada: [{ field: 'classe_cabo', rule: 'rating' }],
      para_raio: [{ field: 'mcov_kv', rule: 'mcov' }],
      chave_seccionadora: [
        { field: 'tensao_de_placa', rule: 'rating' },
        { field: 'tensao_de_placa', rule: 'rating' },
      ],
      disjuntor_mt: [
        { field: 'tensao_nominal', rule: 'rating' },
        { field: 'tensao_nominal', rule: 'rating' },
      ],
      tp: [{ field: 'tensao_nominal_at', rule: 'rating' }],
      tc: [{ field: 'tensao_nominal_at', rule: 'rating' }],
      cabos_saida: [{ field: 'classe_cabo', rule: 'rating' }],
      transformador_forca: [null],
    });
  });

  it('Story 23.18: POLARIDADE appended to the TC\'s and the TP\'s ratio table, the print note, FUNÇÃO DO TC, the faturamento notice and the v13 classes (Base rev08 TC-03, TP-03, TC-02)', () => {
    for (const type of ['tc', 'tp']) {
      const ratio = test(type, 'relacao_transformacao');
      const columns = ratio.tables[0]!.value_columns;
      expect(columns.map((column) => column.role), type).toEqual(['input', 'input', 'derived', 'capture', 'derived', 'choice']);
      expect(columns.at(-1), type).toEqual({ label: 'POLARIDADE', unit: null, role: 'choice', derived: false, options: ['OK', 'INVERTIDA'], fails_on: ['INVERTIDA'] });
      expect(ratio.print_note, type).toBe('Verificação de relação (não substitui ensaio de exatidão).');
    }
    expect(test('transformador_forca', 'relacao_transformacao').print_note).toBeUndefined();
    const plate = definition('tc').nameplate;
    expect(plate.at(-1)).toEqual({ key: 'funcao_tc', label: 'FUNÇÃO DO TC', kind: 'select', options: ['MEDIÇÃO', 'PROTEÇÃO', 'FATURAMENTO'] });
    expect(plate.find((field) => field.key === 'exatidao')).toMatchObject({ options: ['0,3', '0,3S', '0,6', '0,6S', '1,2', '3', '5P20', '10P20'], option_aliases: { '5P': '5P20', '10P': '10P20' } });
    expect(test('tc', 'isolacao').notice_when).toMatchObject({ field: 'funcao_tc', values: ['FATURAMENTO'] });
    // The TP keeps v12's classes.
    expect(definition('tp').nameplate.find((field) => field.key === 'exatidao')!.options).toEqual(getDefinition('v12', 'cabine_primaria', 'tp').nameplate.find((field) => field.key === 'exatidao')!.options);
  });

  it('Story 23.20: the thermography is the last measurement test of each of the eight, switchable and on, NA until in load, judged by NETA Table 100.18 (Base rev08 GE-01)', () => {
    for (const type of EIGHT_TYPES) {
      const one = definition(type);
      expect(one.measurement_tests!.at(-1)!.key, type).toBe('termografia');
      expect(one.sub_blocks.slice(-3), type).toEqual(['termografia', 'observations', 'conclusion']);
    }
    const thermo = definition('para_raio').measurement_tests![0]!;
    expect(thermo.switchable).toBeDefined();
    expect(thermo.initial_off).toBeUndefined();
    expect(thermo.help).toBeUndefined();
    expect(thermo.recommendation).toBeUndefined();
    expect(thermo.rows.map((row) => [row.label, row.optional])).toEqual([
      ['Conexões', true],
      ['Terminações', true],
      ['Contatos', true],
      ['Buchas', true],
    ]);
    expect(thermo.columns.map((column) => [column.key, column.unit, column.optional])).toEqual([
      ['delta_t_similares', '°C', true],
      ['delta_t_ambiente', '°C', true],
    ]);
    expect(thermo.applies_when).toMatchObject({ op: 'in', value: 'em_carga', values: ['sim'], needs_value: true });
    const bands = thermo.criteria.map((criterion) => (criterion.type === 'bands' ? [criterion.column, criterion.bands.map((band) => [band.up_to ?? null, band.level]), criterion.status, criterion.source.name] : null));
    expect(bands).toEqual([
      ['delta_t_similares', [[3, 'within'], [15, 'restricted'], [null, 'out']], 'CONFIRMADO', 'NETA MTS-2023 Tabela 100.18'],
      ['delta_t_ambiente', [[10, 'within'], [20, 'restricted'], [40, 'restricted'], [null, 'out']], 'CONFIRMADO', 'NETA MTS-2023 Tabela 100.18'],
    ]);
    // The CTA keeps its own thermography.
    expect(definition('chave_transferencia_automatica').measurement_tests!.map((one) => one.key)).not.toContain('termografia');
  });

  it('Story 23.21: the Malha de aterramento, a library type with its plate and two tests (Base rev08 AT-01, AT-02)', () => {
    const malha = definition('malha_aterramento');
    expect(malha.label).toBe('Malha de aterramento');
    expect(malha.library).toBe(true);
    expect(malha.checklist).toBeNull();
    expect(malha.tests).toEqual([]);
    expect(malha.sub_blocks).toEqual(['nameplate', 'resistencia_malha', 'continuidade_malha', 'observations', 'conclusion']);
    expect(malha.nameplate.map((field) => [field.key, field.kind, field.unit ?? null, field.optional ?? false])).toEqual([
      ['valor_projeto_ohm', 'number', 'Ω', true],
      ['metodo_medicao', 'select', null, false],
      ['condicao_solo', 'select', null, false],
    ]);
    const [grid, continuity] = malha.measurement_tests!;
    expect(grid!.criteria[0]).toMatchObject({ type: 'max_field', field: 'valor_projeto_ohm', default: 5, unit: 'Ω', default_status: 'CONFIRMADO', status: 'CONFIRMADO' });
    expect(grid!.rows.map((row) => row.key)).toEqual(['malha']);
    expect(continuity!.rows.every((row) => row.optional === true)).toBe(true);
    expect(continuity!.criteria[0]).toMatchObject({ type: 'absolute', operator: '<=', value: 0.5, unit: 'Ω', source: { name: 'NETA MTS-2023 7.13' } });
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']) expect(equipmentTypesOf(version), version).not.toContain('malha_aterramento');
  });

  it('no definition of v1 to v12 carries any of its keys (AD-21)', () => {
    for (const version of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10', 'v11', 'v12']) {
      for (const one of Object.values(getSeed(version, 'cabine_primaria').blocks)) {
        for (const each of one?.tests ?? []) {
          expect([each.notice_when, each.print_note], `${version} ${one!.block_type}`).toEqual([undefined, undefined]);
          for (const table of each.tables) {
            expect(table.voltage_default, `${version} ${one!.block_type}`).toBeUndefined();
            for (const column of table.value_columns) expect(column.role, `${version} ${one!.block_type}`).not.toBe('choice');
          }
        }
        for (const each of one?.measurement_tests ?? []) for (const criterion of each.criteria) expect(['bands', 'max_field'], `${version} ${each.key}`).not.toContain(criterion.type);
        expect(one?.sub_blocks ?? [], version).not.toContain('termografia');
      }
    }
  });

  it('refuses each bad reference of its keys at load', () => {
    const refused = (type: string, change: (copy: BlockDefinition) => void) => {
      const copy = structuredClone(definition(type));
      change(copy);
      return blockDefinitionSchema.safeParse(copy).success;
    };
    expect(refused('tc', () => undefined)).toBe(true);
    expect(refused('malha_aterramento', () => undefined)).toBe(true);
    const insulation = (copy: BlockDefinition) => copy.tests.find((one) => one.key === 'isolacao')!;
    expect(refused('tc', (copy) => (insulation(copy).tables[0]!.voltage_default = { field: 'relacao', rule: 'rating' }))).toBe(false);
    expect(refused('tc', (copy) => (insulation(copy).tables[0]!.voltage_default = { field: 'tensao_nominal_at', rule: 'mcov' }))).toBe(true);
    expect(refused('tp', (copy) => (insulation(copy).tables[0]!.voltage_default = { field: 'tensao_nominal_bt', rule: 'mcov' }))).toBe(false);
    expect(refused('tc', (copy) => (insulation(copy).notice_when = { field: 'funcao_tc', values: ['COBRANÇA'], text: 'x' }))).toBe(false);
    expect(refused('tc', (copy) => (insulation(copy).notice_when = { field: 'exatidao_x', values: ['0,3'], text: 'x' }))).toBe(false);
    const ratio = (copy: BlockDefinition) => copy.tests.find((one) => one.key === 'relacao_transformacao')!.tables[0]!;
    expect(refused('tc', (copy) => (ratio(copy).value_columns.at(-1)!.fails_on = ['TALVEZ']))).toBe(false);
    expect(refused('tc', (copy) => delete ratio(copy).value_columns.at(-1)!.options)).toBe(false);
    expect(refused('tc', (copy) => ratio(copy).value_columns.push({ label: 'OUTRA', unit: null, role: 'choice', derived: false, options: ['A', 'B'] }))).toBe(false);
    // A voltage default on a table with no voltage column is refused.
    expect(refused('tc', (copy) => (ratio(copy).voltage_default = { field: 'tensao_nominal_at', rule: 'rating' }))).toBe(false);
    const thermo = (copy: BlockDefinition) => copy.measurement_tests!.find((one) => one.key === 'termografia')!;
    expect(refused('tc', (copy) => (thermo(copy).applies_when = { op: 'in', value: 'outra', values: ['sim'], unmet: 'x' }))).toBe(false);
    expect(refused('tc', (copy) => (thermo(copy).applies_when = { op: 'in', value: 'em_carga', values: ['talvez'], unmet: 'x' }))).toBe(false);
    const grid = (copy: BlockDefinition) => copy.measurement_tests![0]!;
    expect(refused('malha_aterramento', (copy) => (grid(copy).criteria = [{ ...grid(copy).criteria[0]!, field: 'metodo_medicao' } as MeasurementTest['criteria'][number]]))).toBe(false);
    const band = (bands: unknown) => measurementCriterionSchema.safeParse({ type: 'bands', column: 'x', bands, text: 'x', source: { name: 'x', edition: null } }).success;
    expect(band([{ up_to: 3, level: 'within', class: 'a' }, { level: 'out', class: 'b' }])).toBe(true);
    expect(band([{ up_to: 3, level: 'within', class: 'a' }, { up_to: 9, level: 'out', class: 'b' }])).toBe(false);
    expect(band([{ level: 'within', class: 'a' }, { level: 'out', class: 'b' }])).toBe(false);
    expect(band([{ up_to: 3, level: 'within', class: 'a' }, { up_to: 2, level: 'restricted', class: 'b' }, { level: 'out', class: 'c' }])).toBe(false);
    // A band table reads a number column of its test.
    expect(refused('tc', (copy) => ((thermo(copy).criteria[0] as { column: string }).column = 'outra'))).toBe(false);
  });
});
