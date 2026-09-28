import { describe, expect, it } from 'vitest';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell, type Sheet } from '../schemas/entities.ts';
import { evaluateSheetReadings, type EvaluatedTable } from '../relatorio/readings.ts';
import { getDefinition } from '../seed/definitions.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { dictatedText, parseSpokenNumberPtBr, parseSpokenUnit, parseTableUtterance, tableDictationLabel } from './utterance.ts';

const ID = '019966b0-0094-7000-8000-000000000001';
const OP = '019966b0-0094-7000-8000-000000000002';

function block(type: EquipmentBlockType, sheet: Partial<Sheet> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: type,
    config: defaultBlockConfig('v1', type) as BlockRow['config'],
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), ...sheet },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/** The evaluated table `tableKey` of the sheet's test `testKey`. */
function tableOf(type: EquipmentBlockType, testKey: string, tableKey: string, sheet: Partial<Sheet> = {}): EvaluatedTable {
  const definition = getDefinition('v1', 'cabine_primaria', type);
  const test = evaluateSheetReadings(block(type, sheet), definition).find((t) => t.testKey === testKey);
  const table = test?.tables.find((t) => t.key === tableKey);
  if (table === undefined) throw new Error(`no table ${testKey}/${tableKey} on ${type}`);
  return table;
}

const cell = (raw: string, unit: string | null): Cell => ({ value: { raw, unit, state: 'measured' } as Cell['value'], source_suggestion_id: null, op_id: OP });

const FECHADO = () => tableOf('chave_seccionadora', 'isolacao', 'contato_fechado');
const ABERTO = () => tableOf('chave_seccionadora', 'isolacao', 'contato_aberto');
const RESISTENCIA = () => tableOf('chave_seccionadora', 'resistencia_contato', 'resistencia_contato');

describe('9.4-UNIT parseSpokenNumberPtBr', () => {
  it('reads 0 to 20 in words, with the feminine forms and both spellings of 14', () => {
    const words = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
    words.forEach((word, n) => expect(parseSpokenNumberPtBr(word)).toBe(String(n)));
    expect(parseSpokenNumberPtBr('quatorze')).toBe('14');
    expect(parseSpokenNumberPtBr('uma')).toBe('1');
    expect(parseSpokenNumberPtBr('duas')).toBe('2');
    expect(parseSpokenNumberPtBr('duzentas e duas')).toBe('202');
  });

  it('reads the tens and the hundreds, "cem" and "cento e um"', () => {
    expect(parseSpokenNumberPtBr('trinta')).toBe('30');
    expect(parseSpokenNumberPtBr('noventa e nove')).toBe('99');
    expect(parseSpokenNumberPtBr('cinquenta e dois')).toBe('52');
    expect(parseSpokenNumberPtBr('cem')).toBe('100');
    expect(parseSpokenNumberPtBr('cento e um')).toBe('101');
    expect(parseSpokenNumberPtBr('cento e quarenta e sete')).toBe('147');
    expect(parseSpokenNumberPtBr('quinhentos')).toBe('500');
    expect(parseSpokenNumberPtBr('novecentos e noventa e nove')).toBe('999');
  });

  it('reads "mil" alone, before and after a hundred', () => {
    expect(parseSpokenNumberPtBr('mil')).toBe('1000');
    expect(parseSpokenNumberPtBr('dois mil e quinhentos')).toBe('2500');
    expect(parseSpokenNumberPtBr('mil e duzentos')).toBe('1200');
    expect(parseSpokenNumberPtBr('trezentos e vinte mil')).toBe('320000');
    expect(parseSpokenNumberPtBr('2 mil')).toBe('2000');
  });

  it('reads digits the Brazilian way', () => {
    expect(parseSpokenNumberPtBr('147')).toBe('147');
    expect(parseSpokenNumberPtBr('120,1')).toBe('120.1');
    expect(parseSpokenNumberPtBr('3.7')).toBe('3.7');
    expect(parseSpokenNumberPtBr('2.500')).toBe('2500');
    expect(parseSpokenNumberPtBr('120,10')).toBe('120.1');
  });

  it('reads a decimal by "vírgula" or "ponto", digit by digit or as a cardinal, mixed with digits', () => {
    expect(parseSpokenNumberPtBr('147 vírgula cinco')).toBe('147.5');
    expect(parseSpokenNumberPtBr('120 vírgula 1')).toBe('120.1');
    expect(parseSpokenNumberPtBr('um vírgula zero cinco')).toBe('1.05');
    expect(parseSpokenNumberPtBr('três ponto sete')).toBe('3.7');
    expect(parseSpokenNumberPtBr('dois vírgula vinte e cinco')).toBe('2.25');
    expect(parseSpokenNumberPtBr('cento e quarenta e sete virgula cinco')).toBe('147.5');
  });

  it('is null for anything that is not only a number', () => {
    expect(parseSpokenNumberPtBr('')).toBeNull();
    expect(parseSpokenNumberPtBr('está chovendo')).toBeNull();
    expect(parseSpokenNumberPtBr('147 giga')).toBeNull();
    expect(parseSpokenNumberPtBr('vírgula cinco')).toBeNull();
    expect(parseSpokenNumberPtBr('cinco vírgula')).toBeNull();
    expect(parseSpokenNumberPtBr('e cinco')).toBeNull();
    expect(parseSpokenNumberPtBr('cinco e')).toBeNull();
    expect(parseSpokenNumberPtBr('1 vírgula 2 vírgula 3')).toBeNull();
    expect(parseSpokenNumberPtBr('3.7 vírgula 1')).toBeNull();
  });
});

describe('9.4-UNIT parseSpokenUnit', () => {
  const insulation = ['MΩ', 'GΩ', 'TΩ'];
  it('reads the insulation prefixes with or without "ohm"', () => {
    for (const word of ['giga', 'gigaohm', 'gigaohms', 'giga ohm', 'G', 'GΩ']) expect(parseSpokenUnit(word, insulation)).toBe('GΩ');
    for (const word of ['mega', 'megaohms', 'MΩ']) expect(parseSpokenUnit(word, insulation)).toBe('MΩ');
    for (const word of ['tera', 'teraohm', 'TΩ']) expect(parseSpokenUnit(word, insulation)).toBe('TΩ');
  });

  it('reads micro, mili, volts, quilovolts and ampères', () => {
    for (const word of ['micro', 'microohm', 'microohms', 'micro-ohms', 'µΩ']) expect(parseSpokenUnit(word, ['µΩ'])).toBe('µΩ');
    expect(parseSpokenUnit('mili', ['mΩ'])).toBe('mΩ');
    expect(parseSpokenUnit('miliohm', ['mΩ'])).toBe('mΩ');
    expect(parseSpokenUnit('volts', ['V'])).toBe('V');
    expect(parseSpokenUnit('V', ['V'])).toBe('V');
    expect(parseSpokenUnit('quilovolts', ['kV'])).toBe('kV');
    expect(parseSpokenUnit('kV', ['kV'])).toBe('kV');
    expect(parseSpokenUnit('ampères', ['A'])).toBe('A');
  });

  it('is null with no unit word and invalid when the field does not take the unit', () => {
    expect(parseSpokenUnit('', insulation)).toBeNull();
    expect(parseSpokenUnit('chovendo', insulation)).toBeNull();
    expect(parseSpokenUnit('volts', insulation)).toBe('invalid');
    expect(parseSpokenUnit('mΩ', insulation)).toBe('invalid');
    expect(parseSpokenUnit('micro', insulation)).toBe('invalid');
    expect(parseSpokenUnit('giga', [])).toBe('invalid');
  });
});

describe('9.4-UNIT parseTableUtterance (the I/O matrix)', () => {
  it('Table, digits: "Fase A, 147 giga" on contato fechado fills Fase A, 147 GΩ', () => {
    const table = FECHADO();
    expect(parseTableUtterance('Fase A, 147 giga', table)).toEqual({ kind: 'cell', address: table.rows[0]!.cells[0]!.address, raw: '147', unit: 'GΩ' });
  });

  it('Table, words: "fase b cento e quarenta e sete vírgula cinco mega" is 147.5 MΩ on Fase B', () => {
    const table = FECHADO();
    expect(parseTableUtterance('fase b cento e quarenta e sete vírgula cinco mega', table)).toEqual({ kind: 'cell', address: table.rows[1]!.cells[0]!.address, raw: '147.5', unit: 'MΩ' });
  });

  it('Table, no unit: "Fase C 52" takes the unit the cell shows', () => {
    const table = FECHADO();
    const target = table.rows[2]!.cells[0]!;
    expect(parseTableUtterance('Fase C 52', table)).toEqual({ kind: 'cell', address: target.address, raw: '52', unit: target.unit });
    expect(target.unit).toBe('GΩ');
  });

  it('Table, no unit: an empty cell takes the unit the previous row shows', () => {
    const table = tableOf('chave_seccionadora', 'isolacao', 'contato_fechado', {
      test: { isolacao: { cells: { '3': { '0': cell('900', 'MΩ') } } } },
    } as Partial<Sheet>);
    expect(parseTableUtterance('Fase B 52', table)).toMatchObject({ kind: 'cell', unit: 'MΩ' });
  });

  it('Table, µΩ: "T1-T2, 145 micro" and "t1 t2 145 micro-ohms" on the contact resistance', () => {
    const table = RESISTENCIA();
    const expected = { kind: 'cell', address: table.rows[0]!.cells[0]!.address, raw: '145', unit: 'µΩ' };
    expect(parseTableUtterance('T1-T2, 145 micro', table)).toEqual(expected);
    expect(parseTableUtterance('t1 t2 145 micro-ohms', table)).toEqual(expected);
    expect(parseTableUtterance('145µΩ', table)).toMatchObject({ kind: 'unparsed' });
    // "Fase A" is a connection cell of the T1-T2 row there.
    expect(parseTableUtterance('Fase A 145 micro', table)).toEqual(expected);
  });

  it('Table, single row: "147" on the one-row TAP table fills its first empty capture cell', () => {
    const table = tableOf('transformador_forca', 'relacao_transformacao', 'relacao_transformacao');
    expect(table.rows).toHaveLength(1);
    const capture = table.rows[0]!.cells.filter((c) => c.role === 'capture');
    expect(parseTableUtterance('147', table)).toEqual({ kind: 'cell', address: capture[0]!.address, raw: '147', unit: capture[0]!.unit });
  });

  it('Table, single row: the next empty capture cell when the first is filled', () => {
    const empty = tableOf('transformador_forca', 'relacao_transformacao', 'relacao_transformacao');
    const [first, second] = empty.rows[0]!.cells.filter((c) => c.role === 'capture');
    const table = tableOf('transformador_forca', 'relacao_transformacao', 'relacao_transformacao', {
      test: { relacao_transformacao: { cells: { '0': { [String(first!.address.col)]: cell('30', null) } } } },
    } as Partial<Sheet>);
    expect(parseTableUtterance('trinta vírgula dois', table)).toEqual({ kind: 'cell', address: second!.address, raw: '30.2', unit: null });
  });

  it('Table, "mil": "Fase A dois mil e quinhentos mega" is 2500 MΩ', () => {
    expect(parseTableUtterance('Fase A dois mil e quinhentos mega', FECHADO())).toMatchObject({ kind: 'cell', raw: '2500', unit: 'MΩ' });
  });

  it('Table, decimal comma: "Fase T, 120,1", "120 vírgula 1" and "3.7 tera"', () => {
    const tp = tableOf('tp', 'relacao_transformacao', 'relacao_transformacao');
    const capture = tp.rows[2]!.cells.find((c) => c.role === 'capture')!;
    expect(parseTableUtterance('Fase T, 120,1', tp)).toEqual({ kind: 'cell', address: capture.address, raw: '120.1', unit: null });
    expect(parseTableUtterance('Fase T 120 vírgula 1', tp)).toMatchObject({ kind: 'cell', raw: '120.1' });
    expect(parseTableUtterance('Fase A, 3.7 tera', FECHADO())).toMatchObject({ kind: 'cell', raw: '3.7', unit: 'TΩ' });
  });

  it('Unit not allowed: "Fase A 147 volts" on a GΩ table is unparsed', () => {
    expect(parseTableUtterance('Fase A 147 volts', FECHADO())).toEqual({ kind: 'unparsed', text: 'Fase A 147 volts' });
    expect(parseTableUtterance('Fase T 120 volts', tableOf('tp', 'relacao_transformacao', 'relacao_transformacao'))).toMatchObject({ kind: 'unparsed' });
  });

  it('Ambiguous row: "Primário 147 giga" on the transformer insulation is unparsed', () => {
    const table = tableOf('transformador_forca', 'isolacao', 'isolacao');
    expect(table.rows.filter((row) => row.label === 'Primário').length).toBeGreaterThan(1);
    expect(parseTableUtterance('Primário 147 giga', table)).toEqual({ kind: 'unparsed', text: 'Primário 147 giga' });
  });

  it('No row match or no number: "está chovendo" is unparsed, capitalized', () => {
    expect(parseTableUtterance('está chovendo', FECHADO())).toEqual({ kind: 'unparsed', text: 'Está chovendo' });
    expect(parseTableUtterance('Fase Z 147 giga', FECHADO())).toMatchObject({ kind: 'unparsed' });
    expect(parseTableUtterance('147 giga', FECHADO())).toMatchObject({ kind: 'unparsed' });
    expect(parseTableUtterance('Fase A 147 giga está bom', FECHADO())).toMatchObject({ kind: 'unparsed' });
  });

  it('Row full: a row whose capture cell holds a value is unparsed', () => {
    const table = tableOf('chave_seccionadora', 'isolacao', 'contato_fechado', {
      test: { isolacao: { cells: { '3': { '0': cell('900', 'GΩ') } } } },
    } as Partial<Sheet>);
    expect(table.rows[0]!.cells[0]!.state).toBe('measured');
    expect(parseTableUtterance('Fase A, 147 giga', table)).toMatchObject({ kind: 'unparsed' });
  });

  it('the rows of every seed table family match by their names', () => {
    expect(parseTableUtterance('T3 T4 200 giga', ABERTO())).toMatchObject({ kind: 'cell', address: { row: 1 } });
    expect(parseTableUtterance('T5, 200 giga', ABERTO())).toMatchObject({ kind: 'cell', address: { row: 2 } });
    expect(parseTableUtterance('Fase reserva 300 mega', tableOf('cabos_entrada', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'cell', address: { row: 3 } });
    expect(parseTableUtterance('Fase C 300 mega', tableOf('para_raio', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'cell', address: { row: 2 } });
    expect(parseTableUtterance('Fase S 300 mega', tableOf('tc', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'cell', address: { row: 1 } });
    expect(parseTableUtterance('Fase R, 40', tableOf('tc', 'relacao_transformacao', 'relacao_transformacao'))).toMatchObject({ kind: 'cell', address: { row: 0 }, raw: '40' });
    expect(parseTableUtterance('Secundário massa 1 tera', tableOf('transformador_forca', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'cell', address: { row: 2 }, unit: 'TΩ' });
    expect(parseTableUtterance('Primário secundário 1 tera', tableOf('transformador_forca', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'cell', address: { row: 1 } });
    expect(parseTableUtterance('Secundário 1 tera', tableOf('transformador_forca', 'isolacao', 'isolacao'))).toMatchObject({ kind: 'unparsed' });
    expect(parseTableUtterance('T3-T4 150 micro', RESISTENCIA())).toMatchObject({ kind: 'cell', address: { row: 1 } });
    expect(parseTableUtterance('fase c 150 microohms', RESISTENCIA())).toMatchObject({ kind: 'cell', address: { row: 2 } });
  });
});

describe('9.4-UNIT dictatedText and tableDictationLabel', () => {
  it('trims, collapses spaces and upper-cases the first letter', () => {
    expect(dictatedText('  detalhe da limpeza   dos cubículos ')).toBe('Detalhe da limpeza dos cubículos');
    expect(dictatedText('é preciso trocar')).toBe('É preciso trocar');
    expect(dictatedText('')).toBe('');
  });

  it('names a table button with its first row and a sample in its unit family', () => {
    expect(tableDictationLabel(FECHADO())).toBe('Ditar leitura — ex.: “Fase A, 147 giga”');
    expect(tableDictationLabel(ABERTO())).toBe('Ditar leitura — ex.: “T1, 147 giga”');
    expect(tableDictationLabel(RESISTENCIA())).toBe('Ditar leitura — ex.: “T1-T2, 145 micro”');
    expect(tableDictationLabel(tableOf('tp', 'relacao_transformacao', 'relacao_transformacao'))).toBe('Ditar leitura — ex.: “Fase R, 120 vírgula 1”');
    expect(tableDictationLabel(tableOf('transformador_forca', 'relacao_transformacao', 'relacao_transformacao'))).toBe('Ditar leitura — ex.: “120 vírgula 1”');
    expect(tableDictationLabel(tableOf('cabos_entrada', 'isolacao', 'isolacao'))).toBe('Ditar leitura — ex.: “Fase A, 147 mega”');
    expect(tableDictationLabel(tableOf('transformador_forca', 'isolacao', 'isolacao'))).toBe('Ditar leitura — ex.: “Primário, 147 giga”');
  });
});
