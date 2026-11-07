import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { ctaBlock, CTA_EQUIPMENT, E2 } from '../relatorio/measurement-test-support.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import { lastResultsSchema, type BlockRow, type Cell, type EquipmentRow, type LastResults, type LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import { TEST_PROJECT } from '../test-support.ts';
import {
  blockReadings,
  lastResults,
  previousHelpers,
  previousHelperText,
  previousReadingText,
  previousResultsFor,
  previousRowText,
  readingAddressKey,
  readingSlotsOf,
} from './last-results.ts';
import { section9Layout, withPreviousColumn, type PrintSheet, type PrintTable } from './section-9.ts';

/*
 * Story 22.12 (contract 32): the `last_results` projection an issued revision leaves on each
 * equipment row, the prior chain of a re-issue, the key match across seed versions, and what the
 * next relatório shows ("Anterior: …") and prints (MANUT. ANTERIOR).
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO_B = small.relatorio.id;
const RELATORIO_A = '019966b0-2212-7000-8000-00000000000a';
const RELATORIO_C = '019966b0-2212-7000-8000-00000000000c';
const ISSUED_A = '2026-10-05T15:00:00.000Z';
const TITLE = 'RELATÓRIOS DOS ENSAIOS';

const id = (n: number) => `019966b0-2212-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(50_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const over = (raw: string, unit: string | null) => ({ raw, unit, state: 'over_range' as const });

interface Built {
  block: BlockRow;
  equipment: EquipmentRow;
}

function local(): LocationRow {
  return {
    id: id(1),
    relatorio_id: RELATORIO_B,
    parent_id: null,
    kind: 'cabine',
    name: 'Cabine A',
    order_key: 'a0',
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: false,
  };
}

function sheet(n: number, type: EquipmentBlockType, cells: Record<string, Record<string, unknown>> = {}, seedVersion = 'v1'): Built {
  const built = newEquipmentBlock({ blockId: id(1000 + n), equipmentId: id(2000 + n), relatorioId: RELATORIO_B, projectId: TEST_PROJECT, locationId: id(1), type, tag: `T${n}`, seedVersion, orderKey: `a${n}` });
  for (const [testKey, values] of Object.entries(cells)) {
    const test = built.block.sheet.test[testKey] ?? { cells: {} };
    for (const [address, value] of Object.entries(values)) {
      const [row, col] = address.split('/') as [string, string];
      test.cells[row] = { ...test.cells[row], [col]: cell(value) };
    }
    built.block.sheet.test[testKey] = test;
  }
  return built;
}

const withLast = (built: Built, last: LastResults | null): Built => ({ ...built, equipment: { ...built.equipment, last_results: last } });

function snapshotOf(sheets: Built[], relatorioId = RELATORIO_B): RelatorioSnapshot {
  return { ...small, relatorio: { ...small.relatorio, id: relatorioId }, locations: [local()], blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment), files: [], points: [], suggestions: [], actors: [] };
}

const CABOS_KEY = (phase: string) => `isolacao|isolacao:${phase}/MASSA/BLIND./|1 MINUTO`;

/** Relatório A's issued entry for a cabos de saída: 4,9 GΩ on FASE A, over range on FASE B. */
const ENTRY_A: LastResults = {
  relatorio_id: RELATORIO_A,
  revision_number: 1,
  issued_at: ISSUED_A,
  seed_version: 'v1',
  block_type: 'cabos_saida',
  readings: { [CABOS_KEY('FASE A')]: measured('4.9', 'GΩ'), [CABOS_KEY('FASE B')]: over('2', 'TΩ') },
  prior: null,
};

const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));
const sheetsOf = (snapshot: RelatorioSnapshot): PrintSheet[] => (section9Layout(snapshot, 9, TITLE)?.subsections ?? []).flatMap((s) => s.sheets);
const tableStarting = (printed: PrintSheet, text: string): PrintTable => {
  const part = printed.parts.find((p) => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text === text);
  if (part === undefined || part.kind !== 'table') throw new Error(`no table "${text}"`);
  return part.table;
};

describe('22.12-UNIT the reading keys (readingSlotsOf)', () => {
  it('a seeded capture: test, table and connection cells, and the seed column label; the typed TAP row by its index', () => {
    const cabos = readingSlotsOf(getDefinition('v1', 'cabine_primaria', 'cabos_saida'));
    expect(cabos.map((slot) => slot.key)).toEqual(['FASE A', 'FASE B', 'FASE C', 'FASE RESERVA'].map(CABOS_KEY));
    expect(cabos[0]).toMatchObject({ testKey: 'isolacao', row: 0, col: 1 });
    const tr = readingSlotsOf(getDefinition('v1', 'cabine_primaria', 'transformador_forca'));
    expect(tr.filter((slot) => slot.testKey === 'relacao_transformacao').map((slot) => slot.key)).toEqual([
      'relacao_transformacao|relacao_transformacao:#0|H1-H3 / X1-X0',
      'relacao_transformacao|relacao_transformacao:#0|H2-H1 / X2-X0',
      'relacao_transformacao|relacao_transformacao:#0|H3-H2 / X3-X0',
    ]);
    // The seccionadora's two insulation tables run on in the op path's rows; each keeps its table key.
    const sec = readingSlotsOf(getDefinition('v1', 'cabine_primaria', 'chave_seccionadora')).filter((slot) => slot.testKey === 'isolacao');
    expect(sec.map((slot) => [slot.row, slot.key])).toEqual([
      [0, 'isolacao|contato_aberto:T1/T2/MASSA|VALORES'],
      [1, 'isolacao|contato_aberto:T3/T4/MASSA|VALORES'],
      [2, 'isolacao|contato_aberto:T5/T6/MASSA|VALORES'],
      [3, 'isolacao|contato_fechado:FASE A/MASSA/|VALORES'],
      [4, 'isolacao|contato_fechado:FASE B/MASSA/|VALORES'],
      [5, 'isolacao|contato_fechado:FASE C/MASSA/|VALORES'],
    ]);
  });

  it('a measurement test: the row and column keys of its number cells, fixed cells left out', () => {
    const slots = readingSlotsOf(getDefinition('v5', 'cabine_primaria', 'chave_transferencia_automatica')).filter((slot) => slot.testKey === E2);
    expect(slots.map((slot) => slot.key)).toContain(`${E2}|a_t|normal_fechada`);
    expect(slots.map((slot) => slot.key)).toContain(`${E2}|linha_carga|aberta`);
    expect(slots.map((slot) => slot.key)).not.toContain(`${E2}|linha_carga|normal_fechada`);
  });

  it('a key met again in one definition takes ~2', () => {
    const column = { label: 'VALORES', unit: 'GΩ', role: 'capture' as const, derived: false };
    const table = { key: 't', connection_columns: ['A'], connection_typed: false, value_columns: [column], capture_column: 'VALORES', rows: [['X'], ['X']] };
    const slots = readingSlotsOf({ tests: [{ key: 'isolacao', label: 'I', criterion_key: 'isolacao', tables: [table] }], measurement_tests: undefined } as never);
    expect(slots.map((slot) => slot.key)).toEqual(['isolacao|t:X|VALORES', 'isolacao|t:X|VALORES~2']);
  });

  it('the keys a v5 relatório issued are found again on v11 (Bruno\'s v5 relatório, the next visit on the current seed)', () => {
    for (const type of ['transformador_forca', 'cabos_saida', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'para_raio'] as const) {
      const v5 = readingSlotsOf(getDefinition('v5', 'cabine_primaria', type)).filter((slot) => slot.testKey === 'isolacao' || slot.testKey === 'resistencia_contato');
      const v11 = new Set(readingSlotsOf(getDefinition('v11', 'cabine_primaria', type)).map((slot) => slot.key));
      expect(v5.length).toBeGreaterThan(0);
      for (const slot of v5) expect(v11.has(slot.key), `${type} ${slot.key}`).toBe(true);
    }
  });
});

describe('22.12-UNIT the projection an issue writes (lastResults)', () => {
  const cabos = sheet(1, 'cabos_saida', { isolacao: { '0/1': measured('4.9', 'GΩ'), '1/1': over('2', 'TΩ'), '2/1': { raw: '', unit: 'GΩ', state: 'not_measured' } } });

  it('keeps the measured and over-range captures of each equipment, keyed, with the revision it came from', () => {
    const [entry, ...rest] = lastResults(snapshotOf([cabos]), { revisionNumber: 1, issuedAt: ISSUED_A });
    expect(rest).toEqual([]);
    expect(entry).toEqual({
      equipmentId: id(2001),
      value: {
        relatorio_id: RELATORIO_B,
        revision_number: 1,
        issued_at: ISSUED_A,
        seed_version: 'v1',
        block_type: 'cabos_saida',
        readings: { [CABOS_KEY('FASE A')]: measured('4.9', 'GΩ'), [CABOS_KEY('FASE B')]: over('2', 'TΩ') },
        prior: null,
      },
    });
    expect(lastResultsSchema.parse(entry!.value)).toEqual(entry!.value);
  });

  it('no entry for a sheet with no reading, marked not tested, removed or with no equipment', () => {
    const empty = sheet(2, 'cabos_saida');
    const notTested = { ...sheet(3, 'cabos_saida', { isolacao: { '0/1': measured('1', 'GΩ') } }) };
    notTested.block = { ...notTested.block, not_tested: { reason: 'cliente', text: null, at: ISSUED_A, by: id(900) } as never };
    const removed = sheet(4, 'cabos_saida', { isolacao: { '0/1': measured('1', 'GΩ') } });
    removed.block = { ...removed.block, removed_at: ISSUED_A };
    const loose = sheet(5, 'cabos_saida', { isolacao: { '0/1': measured('1', 'GΩ') } });
    loose.block = { ...loose.block, equipment_id: null };
    expect(lastResults(snapshotOf([empty, notTested, removed, loose]), { revisionNumber: 1, issuedAt: ISSUED_A })).toEqual([]);
  });

  it('a disabled test does not print and gives nothing', () => {
    const off = sheet(6, 'cabos_saida', { isolacao: { '0/1': measured('1', 'GΩ') } });
    const config = off.block.config as { sub_blocks: Record<string, { enabled: boolean }> };
    off.block = { ...off.block, config: { ...config, sub_blocks: { ...config.sub_blocks, isolacao: { enabled: false } } } };
    expect(blockReadings(off.block, getDefinition('v1', 'cabine_primaria', 'cabos_saida'))).toEqual({});
  });

  it('the prior chain: over another relatório\'s entry prior is that entry; over its own (a re-issue), that entry\'s prior', () => {
    const first = lastResults(snapshotOf([withLast(cabos, ENTRY_A)]), { revisionNumber: 1, issuedAt: '2026-11-01T12:00:00.000Z' })[0]!.value;
    const strippedA = { relatorio_id: RELATORIO_A, revision_number: 1, issued_at: ISSUED_A, seed_version: 'v1', block_type: 'cabos_saida', readings: ENTRY_A.readings };
    expect(first.prior).toEqual(strippedA);
    const reissued = lastResults(snapshotOf([withLast(cabos, first)]), { revisionNumber: 2, issuedAt: '2026-11-02T12:00:00.000Z' })[0]!.value;
    expect(reissued).toMatchObject({ relatorio_id: RELATORIO_B, revision_number: 2, prior: strippedA });
    // The prior never nests: the entry kept is written without its own prior.
    const third = lastResults(snapshotOf([withLast(cabos, first)], RELATORIO_C), { revisionNumber: 1, issuedAt: '2026-11-03T12:00:00.000Z' })[0]!.value;
    expect(third.prior).toMatchObject({ relatorio_id: RELATORIO_B, revision_number: 1 });
    expect((third.prior as Record<string, unknown>).prior).toBeUndefined();
  });

  it('a CTA (seed v5) keeps its measurement number cells', () => {
    const b = ctaBlock({}, [{ test: E2, row: 'a_t', col: 'normal_fechada', value: measured('12.4', 'GΩ') }]);
    const readings = blockReadings(b, getDefinition('v5', 'cabine_primaria', 'chave_transferencia_automatica'));
    expect(readings[`${E2}|a_t|normal_fechada`]).toEqual(measured('12.4', 'GΩ'));
    expect(b.equipment_id).toBe(CTA_EQUIPMENT);
  });
});

describe('22.12-UNIT what the next relatório reads (previousResultsFor, previousHelpers)', () => {
  const definition = getDefinition('v1', 'cabine_primaria', 'cabos_saida');
  const block = sheet(1, 'cabos_saida').block;

  it('another relatório\'s entry; on a re-issue the prior; null with none, or of another block type', () => {
    expect(previousResultsFor({ last_results: ENTRY_A }, block, RELATORIO_B)).toMatchObject({ relatorio_id: RELATORIO_A });
    const own: LastResults = { ...ENTRY_A, relatorio_id: RELATORIO_B, revision_number: 1, prior: { ...ENTRY_A, relatorio_id: RELATORIO_A } as never };
    delete (own.prior as Record<string, unknown>).prior;
    expect(previousResultsFor({ last_results: own }, block, RELATORIO_B)).toMatchObject({ relatorio_id: RELATORIO_A });
    expect(previousResultsFor({ last_results: { ...ENTRY_A, relatorio_id: RELATORIO_B } }, block, RELATORIO_B)).toBeNull();
    expect(previousResultsFor({ last_results: null }, block, RELATORIO_B)).toBeNull();
    expect(previousResultsFor({}, block, RELATORIO_B)).toBeNull();
    expect(previousResultsFor(undefined, block, RELATORIO_B)).toBeNull();
    expect(previousResultsFor({ last_results: { ...ENTRY_A, block_type: 'para_raio' } }, block, RELATORIO_B)).toBeNull();
  });

  it('the helper of each capture cell with a previous value: "Anterior: 4,9 GΩ (rev. 1, dd/mm/aaaa)", "> 2 TΩ"', () => {
    const helpers = previousHelpers({ last_results: ENTRY_A }, block, definition, RELATORIO_B);
    expect(helpers.get(readingAddressKey({ testKey: 'isolacao', row: 0, col: 1 }))).toBe('Anterior: 4,9 GΩ (rev. 1, 05/10/2026)');
    expect(helpers.get(readingAddressKey({ testKey: 'isolacao', row: 1, col: 1 }))).toBe('Anterior: > 2 TΩ (rev. 1, 05/10/2026)');
    expect(helpers.has(readingAddressKey({ testKey: 'isolacao', row: 2, col: 1 }))).toBe(false);
    expect(previousHelpers({ last_results: null }, block, definition, RELATORIO_B).size).toBe(0);
    expect(previousReadingText(measured('3300', 'MΩ'))).toBe('3.300 MΩ');
    expect(previousHelperText({ revision_number: 2, issued_at: ISSUED_A }, over('2000', 'µΩ'))).toBe('Anterior: > 2.000 µΩ (rev. 2, 05/10/2026)');
  });

  it('a row key the definition does not hold (a seed that renamed a row) reads nothing: "-"', () => {
    const renamed: LastResults = { ...ENTRY_A, readings: { 'isolacao|isolacao:FASE Z/MASSA/BLIND./|1 MINUTO': measured('1', 'GΩ') } };
    expect(previousHelpers({ last_results: renamed }, block, definition, RELATORIO_B).size).toBe(0);
    expect(previousRowText(new Map(), [{ testKey: 'isolacao', row: 0, col: 1 }])).toBe('-');
  });
});

describe('22.12-UNIT MANUT. ANTERIOR in section 9', () => {
  it('withPreviousColumn appends the column last: an empty shaded top header, the header, one cell per row, a band one wider', () => {
    const printed: PrintTable = {
      columns: [1, 1],
      rows: [
        { band: true, cells: [{ text: 'TÍTULO', span: 2, bold: true, shade: true, align: 'center' }] },
        { header: true, cells: [{ text: 'GRUPO', span: 2, bold: true, shade: true, align: 'center' }] },
        { header: true, cells: [{ text: 'A', bold: true, shade: true, align: 'center' }, { text: 'B', bold: true, shade: true, align: 'center' }] },
        { cells: [{ text: '1' }, { text: '2' }] },
      ],
    };
    const widened = withPreviousColumn(printed, ['4,9 GΩ']);
    expect(widened.columns).toHaveLength(3);
    expect(texts(widened)).toEqual([['TÍTULO'], ['GRUPO', ''], ['A', 'B', 'MANUT. ANTERIOR'], ['1', '2', '4,9 GΩ']]);
    expect(widened.rows[0]!.cells[0]!.span).toBe(3);
    expect(widened.rows[1]!.cells[1]).toMatchObject({ shade: true, bold: true });
  });

  it('a cabos de saída whose equipment has a previous visit prints the column with its values; one with none prints none', () => {
    const now = sheet(1, 'cabos_saida', { isolacao: { '0/1': measured('5.1', 'GΩ'), '1/1': over('2', 'TΩ') } });
    const fresh = sheet(2, 'cabos_saida', { isolacao: { '0/1': measured('5.1', 'GΩ') } });
    const [withPrevious, without] = sheetsOf(snapshotOf([withLast(now, ENTRY_A), fresh]));
    const grid = texts(tableStarting(withPrevious!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(grid[0]!.at(-1)).toBe('');
    expect(grid[1]!.at(-1)).toBe('MANUT. ANTERIOR');
    expect(grid.slice(2).map((row) => row.at(-1))).toEqual(['4,9 GΩ', '> 2 TΩ', '-', '-']);
    // Story 22.10: the over-range cell of this visit; the VALORES group names no single unit here.
    expect(grid[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', 'VALORES', 'QUALIDADE ISOLAÇÃO', '']);
    expect(grid.slice(2, 4).map((row) => row[4])).toEqual(['5,1 GΩ', '> 2 TΩ']);
    const plain = texts(tableStarting(without!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(plain[1]).not.toContain('MANUT. ANTERIOR');
    expect(plain[1]!.length).toBe(grid[1]!.length - 1);
  });

  it('a re-issue of the same relatório keeps printing the visit before it; its own entry alone prints no column', () => {
    const now = sheet(1, 'cabos_saida', { isolacao: { '0/1': measured('5.1', 'GΩ') } });
    const own: LastResults = { ...ENTRY_A, relatorio_id: RELATORIO_B, readings: { [CABOS_KEY('FASE A')]: measured('5.1', 'GΩ') }, prior: { ...ENTRY_A } as never };
    delete (own.prior as Record<string, unknown>).prior;
    const reissue = texts(tableStarting(sheetsOf(snapshotOf([withLast(now, own)]))[0]!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(reissue[2]!.at(-1)).toBe('4,9 GΩ');
    const alone = texts(tableStarting(sheetsOf(snapshotOf([withLast(now, { ...own, prior: null })]))[0]!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(alone[1]).not.toContain('MANUT. ANTERIOR');
  });

  it('an entry none of whose keys this sheet\'s definition holds prints no column', () => {
    const now = sheet(1, 'cabos_saida', { isolacao: { '0/1': measured('5.1', 'GΩ') } });
    const renamed: LastResults = { ...ENTRY_A, readings: { 'isolacao|isolacao:FASE Z/MASSA/BLIND./|1 MINUTO': measured('1', 'GΩ') } };
    const grid = texts(tableStarting(sheetsOf(snapshotOf([withLast(now, renamed)]))[0]!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(grid.flat()).not.toContain('MANUT. ANTERIOR');
    expect(grid[0]).toEqual(['PONTO DE ENSAIO/CONEXÃO', 'VALORES (GΩ)', 'QUALIDADE ISOLAÇÃO']);
  });

  it('the seccionadora\'s paired tables get the column on both halves', () => {
    const sec = sheet(1, 'chave_seccionadora', { isolacao: { '0/0': measured('173', 'GΩ'), '3/0': measured('720', 'GΩ') } });
    const entry: LastResults = { ...ENTRY_A, block_type: 'chave_seccionadora', readings: { 'isolacao|contato_aberto:T1/T2/MASSA|VALORES': measured('150', 'GΩ'), 'isolacao|contato_fechado:FASE A/MASSA/|VALORES': over('2', 'TΩ') } };
    const grid = texts(tableStarting(sheetsOf(snapshotOf([withLast(sec, entry)]))[0]!, 'SECCIONADORA CONTATO ABERTO'));
    expect(grid[1]).toEqual(['LINHA', 'TERRA', 'GUARD', 'VALORES (GΩ)', 'MANUT. ANTERIOR', 'LINHA', 'TERRA', 'GUARD', 'VALORES (GΩ)', 'MANUT. ANTERIOR']);
    expect(grid[2]).toEqual(['T1', 'T2', 'MASSA', '173', '150 GΩ', 'FASE A', 'MASSA', '', '720', '> 2 TΩ']);
    expect(grid[3]!.at(4)).toBe('-');
  });

  it('Story 22.10: an over-range cell under a header that names its one unit prints bare "> 2"', () => {
    const tp = sheet(1, 'tp', { isolacao: { '0/1': over('2', 'GΩ'), '1/1': measured('9', 'GΩ'), '2/1': measured('8', 'GΩ') } });
    const grid = texts(tableStarting(sheetsOf(snapshotOf([tp]))[0]!, 'PONTO DE ENSAIO/CONEXÃO'));
    expect(grid[0]).toContain('VALORES (GΩ)');
    expect(grid[2]![4]).toBe('> 2');
  });

  it('a measurement test (a CTA on seed v5) gets the column with its previous number cells', () => {
    const b = ctaBlock({}, [{ test: E2, row: 'a_t', col: 'normal_fechada', value: measured('12.4', 'GΩ') }]);
    const equipment: EquipmentRow = {
      id: CTA_EQUIPMENT,
      project_id: TEST_PROJECT,
      tag: 'CTA-GER',
      type: 'chave_transferencia_automatica',
      last_nameplate: null,
      last_results: { ...ENTRY_A, seed_version: 'v5', block_type: 'chave_transferencia_automatica', readings: { [`${E2}|a_t|normal_fechada`]: measured('9.8', 'GΩ'), [`${E2}|a_t|aberta`]: over('2', 'TΩ') } },
      removed_at: null,
    };
    const snapshot: RelatorioSnapshot = { ...small, relatorio: { ...small.relatorio, seed_version: 'v5' }, locations: [{ ...local(), id: b.location_id! }], blocks: [b], equipment: [equipment], files: [], points: [], suggestions: [], actors: [] };
    const printed = sheetsOf(snapshot)[0]!;
    const e2 = printed.parts.find((p) => p.kind === 'table' && p.table.rows[0]!.cells[0]!.text.includes('ISOLAMENTO PRINCIPAL'));
    if (e2 === undefined || e2.kind !== 'table') throw new Error('no E2 table');
    const grid = texts(e2.table);
    const header = grid.find((row) => row.includes('MANUT. ANTERIOR'))!;
    expect(header.at(-1)).toBe('MANUT. ANTERIOR');
    const aT = grid.find((row) => row[0] === 'A-T')!;
    expect(aT.at(-1)).toBe('9,8 GΩ · - · > 2 TΩ');
    expect(e2.table.rows[0]!.cells[0]!.span).toBe(e2.table.columns.length);
  });

  it('the Porto Seguro fixture carries no previous value: its section 9 prints no MANUT. ANTERIOR anywhere', () => {
    const porto = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    expect(porto.equipment.every((row) => (row.last_results ?? null) === null)).toBe(true);
    const all = sheetsOf(porto).flatMap((printed) => printed.parts.flatMap((part) => (part.kind === 'table' ? part.table.rows.flatMap((row) => row.cells.map((c) => c.text)) : [])));
    expect(all).not.toContain('MANUT. ANTERIOR');
  });
});
