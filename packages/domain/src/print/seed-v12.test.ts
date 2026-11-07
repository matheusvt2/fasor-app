import { describe, expect, it } from 'vitest';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { rowVoltageCell } from '../relatorio/row-voltage.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { groupForPrint } from './group-for-print.ts';
import { section9Layout, type LayoutSectionSheets, type PrintSheet, type PrintTable } from './section-9.ts';

/*
 * Stories 22.8, 22.9 and 22.11 (seed v12): the print deltas. A v12 insulation table prints a
 * TENSÃO (kV) column right after its connection columns, each row's effective voltage; a v12 TC
 * prints the class's ACEITÁVEL; the Inspeção de QGBT prints in "Outros equipamentos" after the
 * run's full Quadro elétrico sheets. A v11 table prints as before.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;
const TITLE = 'RELATÓRIOS DOS ENSAIOS';

const id = (n: number) => `019966b0-0223-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function cabine(n: number, agrupar = false): LocationRow {
  return {
    id: id(n),
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine 1',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: agrupar,
  };
}

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

function sheet(n: number, type: EquipmentBlockType, orderKey: string, seedVersion = 'v12'): Built {
  return newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO, projectId: TEST_PROJECT, locationId: id(1), type, tag: `T${n}`, seedVersion, orderKey });
}

function edit(built: Built, patch: (block: BlockRow) => void): Built {
  const block = structuredClone(built.block);
  patch(block);
  return { ...built, block };
}

function setTest(block: BlockRow, testKey: string, cells: Record<string, unknown>, instrument: unknown = null): void {
  const test = block.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(cells)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  if (instrument !== null) test.instrument = cell(instrument);
  block.sheet.test[testKey] = test;
}

const MEGGER = { instrument_id: id(800), code: '2E', manufacturer: 'Instrument', model: 'DMG10Ki', serial: 'IN919021', cert_number: '37428/26', calibrated_at: null, valid_until: null, test_parameter: '10 kV' };

function snapshotOf(locations: LocationRow[], sheets: Built[]): RelatorioSnapshot {
  return { ...small, locations, blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment), files: [], points: [], suggestions: [], actors: [] };
}

function layoutOf(snapshot: RelatorioSnapshot): LayoutSectionSheets {
  const section = section9Layout(snapshot, 9, TITLE);
  if (section === null) throw new Error('section 9 printed nothing');
  return section;
}

const sheetOf = (section: LayoutSectionSheets, blockId: string): PrintSheet => section.subsections.flatMap((s) => s.sheets).find((s) => s.blockId === blockId)!;
const tables = (printed: PrintSheet): PrintTable[] => printed.parts.flatMap((part) => (part.kind === 'table' ? [part.table] : []));
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));
/** The table whose rows hold a cell reading `text`. */
const tableWith = (printed: PrintSheet, text: string): PrintTable => tables(printed).find((table) => texts(table).some((row) => row.includes(text)))!;

describe('22.8-UNIT the TENSÃO column prints right after the connection columns (seed v12)', () => {
  const transformer = (seedVersion: string) =>
    edit(sheet(1, 'transformador_forca', 'a0', seedVersion), (block) => {
      block.sheet.nameplate.tensao_nominal_bt = cell(measured('220', 'V'));
      setTest(block, 'isolacao', { '0/1': measured('1.2', 'GΩ'), '2/1': measured('0.9', 'GΩ'), ...(seedVersion === 'v12' ? { '2/5': rowVoltageCell('0,5') } : {}) }, MEGGER);
    });

  it('a v12 transformer prints TENSÃO (kV) with 10, 10 and the typed 0,5; the column never prints at its storage place', () => {
    const printed = sheetOf(layoutOf(snapshotOf([cabine(1)], [transformer('v12')])), id(1001));
    const table = tableWith(printed, 'TENSÃO (kV)');
    const rows = texts(table);
    expect(rows[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', '', 'VALORES (GΩ)', 'QUALIDADE ISOLAÇÃO']);
    expect(rows[1]).toEqual(['LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', '30 SEGUNDOS', '1 MINUTO', 'ESTAB./10MIN', 'ABSORÇÃO', 'POLARIZAÇÃO']);
    expect(rows.slice(2).map((row) => row.slice(0, 6))).toEqual([
      ['PRIMÁRIO', 'MASSA', 'SECUNDÁRIO', '10', '-', '1,2'],
      // A row with no measured reading prints no test voltage, its default (10) not applied.
      ['PRIMÁRIO', 'SECUNDÁRIO', 'MASSA', '-', '-', '-'],
      ['SECUNDÁRIO', 'MASSA', 'PRIMÁRIO', '0,5', '-', '0,9'],
    ]);
    expect(rows.slice(2).every((row) => row.length === 9)).toBe(true);
    expect(table.columns).toHaveLength(9);
  });

  it('a row with no voltage prints "-": no instrument and no default', () => {
    const bare = edit(sheet(2, 'para_raio', 'a0'), () => undefined);
    const printed = sheetOf(layoutOf(snapshotOf([cabine(1)], [bare])), id(1002));
    const rows = texts(tableWith(printed, 'TENSÃO (kV)'));
    expect(rows.slice(2).map((row) => row[3])).toEqual(['-', '-', '-', '-']);
  });

  it('the seccionadora prints the column in both contato tables, side by side as before', () => {
    const chave = edit(sheet(3, 'chave_seccionadora', 'a0'), (block) => setTest(block, 'isolacao', { '0/0': measured('12', 'GΩ'), '3/0': measured('15', 'GΩ') }, { ...MEGGER, test_parameter: '5 kV' }));
    const printed = sheetOf(layoutOf(snapshotOf([cabine(1)], [chave])), id(1003));
    const rows = texts(tableWith(printed, 'SECCIONADORA CONTATO ABERTO'));
    expect(rows[1]).toEqual(['LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', 'VALORES (GΩ)', 'LINHA', 'TERRA', 'GUARD', 'TENSÃO (kV)', 'VALORES (GΩ)']);
    expect(rows[2]).toEqual(['T1', 'T2', 'MASSA', '5', '12', 'FASE A', 'MASSA', '', '5', '15']);
    // The rows with no reading print no test voltage.
    expect(rows[3]).toEqual(['T3', 'T4', 'MASSA', '-', '-', 'FASE B', 'MASSA', '', '-', '-']);
  });

  it('a v11 transformer prints as today: no TENSÃO column, eight columns', () => {
    const printed = sheetOf(layoutOf(snapshotOf([cabine(1)], [transformer('v11')])), id(1001));
    const table = tableWith(printed, 'PONTO DE ENSAIO/CONEXÃO');
    expect(texts(table).some((row) => row.includes('TENSÃO (kV)'))).toBe(false);
    expect(texts(table)[1]).toEqual(['LINHA', 'TERRA', 'GUARD', '30 SEGUNDOS', '1 MINUTO', 'ESTAB./10MIN', 'ABSORÇÃO', 'POLARIZAÇÃO']);
    expect(table.columns).toHaveLength(8);
  });
});

describe('22.9-UNIT ACEITÁVEL prints the class criterion (seed v12)', () => {
  const tc = (seedVersion: string) =>
    edit(sheet(4, 'tc', 'a0', seedVersion), (block) => {
      block.sheet.nameplate.exatidao = cell('1,2');
      setTest(block, 'relacao_transformacao', { '0/0': measured('100', 'A'), '0/1': measured('5', 'A'), '0/3': measured('20.168', null) });
    });

  it('a v12 TC of class 1,2 prints ±1,2 % and the 0,84 % row SATISFATÓRIO; on v11 ±0,5 % and INSATISFATÓRIO', () => {
    const v12 = sheetOf(layoutOf(snapshotOf([cabine(1)], [tc('v12')])), id(1004));
    expect(tableWith(v12, '±1,2 %')).toBeDefined();
    expect(texts(tableWith(v12, 'P1-P2 / S1-S2')).find((row) => row[0] === 'FASE R')).toContain('SATISFATÓRIO');
    const v11 = sheetOf(layoutOf(snapshotOf([cabine(1)], [tc('v11')])), id(1004));
    expect(tableWith(v11, '±0,5 %')).toBeDefined();
    expect(texts(tableWith(v11, 'P1-P2 / S1-S2')).find((row) => row[0] === 'FASE R')).toContain('INSATISFATÓRIO');
  });
});

describe('22.11-UNIT the Inspeção de QGBT prints after the full Quadro elétrico sheets (seed v12)', () => {
  it('in a grouped cabine, an inspection placed before the quadros prints after the last of them, in "Outros equipamentos"', () => {
    const sheets = [sheet(5, 'inspecao_qgbt', 'a0'), sheet(6, 'quadro_eletrico', 'a1'), sheet(7, 'para_raio', 'a2'), sheet(8, 'quadro_eletrico', 'a3'), sheet(9, 'inspecao_qgbt', 'a4')];
    const grouping = groupForPrint(snapshotOf([cabine(1, true)], sheets), 'por_local_e_tipo');
    const outros = grouping.subsections.find((subsection) => subsection.kind === 'outros')!;
    expect(outros.title.startsWith('Outros equipamentos')).toBe(true);
    expect(outros.blockIds).toEqual([id(1006), id(1008), id(1005), id(1009)]);
  });

  it('with no quadro the inspections keep their tree order; the sheet prints its nameplate, checklist and conclusion and no test', () => {
    const sheets = [sheet(5, 'inspecao_qgbt', 'a0'), sheet(9, 'inspecao_qgbt', 'a1')];
    const snapshot = snapshotOf([cabine(1, true)], sheets);
    expect(groupForPrint(snapshot, 'por_local_e_tipo').subsections.find((subsection) => subsection.kind === 'outros')!.blockIds).toEqual([id(1005), id(1009)]);
    const printed = sheetOf(layoutOf(snapshot), id(1005));
    const all = JSON.stringify(tables(printed).map(texts));
    expect(printed.title, JSON.stringify(printed.title)).toContain("QGBT/QD's");
    expect(all).not.toContain('ENSAIO DE ISOLAÇÃO');
    expect(all).toContain('LIMPEZA INTERNA E EXTERNA');
    expect(all).toContain('CORRENTE NOMINAL');
    expect(all).toContain('CONCLUSÃO');
  });
});
