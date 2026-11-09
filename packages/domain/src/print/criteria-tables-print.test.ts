import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT } from '../seed/definitions.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { section9Layout, withAppendedColumn, withPreviousColumn, type LayoutSectionSheets, type PrintSheet, type PrintTable } from './section-9.ts';

/*
 * Batch e23a (Stories 23.2 to 23.4, seed v13): the print deltas of section 9. ACEITÁVEL prints the
 * row's criterion when every row shares it, POR LINHA with an ACEITÁVEL column when the rows differ,
 * the manufacturer's value with " (fabricante)"; the instrument-limit note is a paragraph after the
 * test's last table, and the row above the limit prints N/A in POLARIZAÇÃO. A v12 sheet prints as before.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;

const id = (n: number) => `019966b0-0231-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

const CABINE: LocationRow = {
  id: id(1),
  relatorio_id: RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Cabine 1',
  order_key: 'a0',
  removed_at: null,
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
};

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

function sheet(n: number, type: EquipmentBlockType, seedVersion: string, patch: (block: BlockRow) => void): Built {
  const built = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(1), type, tag: `T${n}`, seedVersion, orderKey: 'a0' });
  patch(built.block);
  return built;
}

function setTest(block: BlockRow, testKey: string, cells: Record<string, unknown>, override: unknown = undefined): void {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  if (override !== undefined) test.criterion_override = cell(override);
  block.sheet.test[testKey] = test;
}

function printed(built: Built): PrintSheet {
  const snapshot: RelatorioSnapshot = { ...small, locations: [CABINE], blocks: [built.block], equipment: [built.equipment], files: [], points: [], suggestions: [], actors: [] };
  const section: LayoutSectionSheets | null = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS');
  if (section === null) throw new Error('section 9 printed nothing');
  return section.subsections.flatMap((s) => s.sheets).find((s) => s.blockId === built.block.id)!;
}

const tables = (sheetPrinted: PrintSheet): PrintTable[] => sheetPrinted.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));
const tableWith = (sheetPrinted: PrintSheet, text: string): PrintTable => tables(sheetPrinted).find((table) => texts(table).some((row) => row.includes(text)))!;
/** The ACEITÁVEL value under the instrument header of the test titled `title`. */
const acceptable = (sheetPrinted: PrintSheet, title: string): string => {
  const header = tables(sheetPrinted).find((table) => table.rows[0]?.cells[0]?.text === title)!;
  const labels = header.rows[1]!.cells.map((c) => c.text);
  return header.rows[2]!.cells[labels.findIndex((label) => label.startsWith('ACEITÁVEL'))]!.text;
};

const transformer = (n: number, seedVersion: string, medium: string, extra: (block: BlockRow) => void = () => undefined) =>
  sheet(n, 'transformador_forca', seedVersion, (block) => {
    block.sheet.nameplate.tipo_de_isolacao = cell(medium);
    block.sheet.nameplate.tensao_nominal_at = cell(measured('13.8', 'kV'));
    block.sheet.nameplate.tensao_nominal_bt = cell(measured('380', 'V'));
    extra(block);
  });

describe('23.2-UNIT section 9 prints the criterion a v13 test is judged by', () => {
  it('a v13 dry transformer prints POR LINHA in ACEITÁVEL and each row\'s minimum in an ACEITÁVEL column', () => {
    const doc = printed(transformer(1, 'v13', 'EPÓXI', (block) => setTest(block, 'isolacao', { '0/1': measured('30', 'GΩ'), '2/1': measured('400', 'MΩ') })));
    expect(acceptable(doc, 'ENSAIO DE ISOLAÇÃO')).toBe('POR LINHA');
    const rows = texts(tableWith(doc, '1 MINUTO'));
    expect(rows[1]!.at(-1)).toBe('ACEITÁVEL');
    expect(rows.slice(2).map((row) => row.at(-1))).toEqual(['≥ 25.000 MΩ', '≥ 25.000 MΩ', '≥ 500 MΩ']);
  });

  it('a v13 disjuntor of class 15 kV prints its one table minimum, no column added', () => {
    const doc = printed(sheet(2, 'disjuntor_mt', 'v13', (block) => (block.sheet.nameplate.tensao_nominal = cell('15'))));
    expect(acceptable(doc, 'ENSAIO DE ISOLAÇÃO')).toBe('≥ 5.000 MΩ');
    expect(texts(tableWith(doc, 'TENSÃO (kV)')).flat()).not.toContain('ACEITÁVEL');
  });

  it('the manufacturer\'s value prints followed by " (fabricante)", on a v13 and on a v12 sheet', () => {
    for (const version of ['v13', 'v12']) {
      const doc = printed(sheet(3, 'disjuntor_mt', version, (block) => setTest(block, 'resistencia_contato', { '0/0': measured('70', 'µΩ') }, { raw: '80', unit: 'µΩ' })));
      expect(acceptable(doc, 'ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO'), version).toBe('<80 µΩ (fabricante)');
    }
    const tf = printed(transformer(4, 'v13', 'EPÓXI', (block) => setTest(block, 'isolacao', {}, { raw: '5', unit: 'GΩ' })));
    expect(acceptable(tf, 'ENSAIO DE ISOLAÇÃO')).toBe('≥ 5 GΩ (fabricante)');
    expect(texts(tableWith(tf, '1 MINUTO'))[1]!.at(-1)).not.toBe('ACEITÁVEL');
  });

  it('a reading above the 2 TΩ limit prints the note after the test\'s last table and N/A in its POLARIZAÇÃO', () => {
    const doc = printed(transformer(5, 'v13', 'EPÓXI', (block) => setTest(block, 'isolacao', { '0/1': { raw: '2', unit: 'TΩ', state: 'over_range' }, '1/1': measured('30', 'GΩ') })));
    const table = tableWith(doc, '1 MINUTO');
    const rows = texts(table);
    const polarization = rows[1]!.indexOf('POLARIZAÇÃO');
    expect(rows.slice(2).map((row) => row[polarization])).toEqual(['N/A', '-', '-']);
    const at = doc.parts.findIndex((part) => part.kind === 'table' && part.table === table);
    expect(doc.parts[at]).toMatchObject({ keepWithNext: true });
    expect(doc.parts[at + 1]).toEqual({ kind: 'paragraph', text: 'Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento.' });
  });

  it('a v12 transformer with the same plate and readings prints as before: >400 MΩ, no column, no note, no N/A', () => {
    const doc = printed(transformer(6, 'v12', 'EPÓXI', (block) => setTest(block, 'isolacao', { '0/1': { raw: '2', unit: 'TΩ', state: 'over_range' }, '2/1': measured('400', 'MΩ') })));
    expect(acceptable(doc, 'ENSAIO DE ISOLAÇÃO')).toBe('>400 MΩ');
    const rows = texts(tableWith(doc, '1 MINUTO'));
    expect(rows.flat()).not.toContain('ACEITÁVEL');
    expect(rows.flat()).not.toContain('N/A');
    expect(doc.parts.some((part) => part.kind === 'paragraph' && part.text.includes('limite de leitura'))).toBe(false);
  });
});

describe('withAppendedColumn generalizes withPreviousColumn without changing its output', () => {
  it('gives the same table for the MANUT. ANTERIOR header', () => {
    const doc = printed(transformer(7, 'v12', 'EPÓXI', (block) => setTest(block, 'isolacao', { '0/1': measured('30', 'GΩ') })));
    const table = tableWith(doc, '1 MINUTO');
    const previous = ['1,2 GΩ', '-', '0,9 GΩ'];
    expect(withAppendedColumn(table, 'MANUT. ANTERIOR', previous)).toEqual(withPreviousColumn(table, previous));
    expect(texts(withPreviousColumn(table, previous))[1]!.at(-1)).toBe('MANUT. ANTERIOR');
  });
});
