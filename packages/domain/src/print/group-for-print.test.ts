import { describe, expect, it } from 'vitest';
import { portoSeguro, SUBSOLO_FEEDER_CABLE_BLOCK_IDS, SUBSOLO_TRANSFORMER_BLOCK_IDS } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replay } from '../ops/replay.ts';
import { sheetOrder } from '../relatorio/ficha.ts';
import { newEquipmentBlock } from '../relatorio/tree.ts';
import type { EquipmentBlockType, Role } from '../schemas/block-config.ts';
import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { TEST_PROJECT } from '../test-support.ts';
import { blockRoleOf, groupForPrint, type PrintSubsection } from './group-for-print.ts';

/*
 * 7.1-UNIT-001: `groupForPrint` over small hand-built relatórios and the Porto Seguro
 * fixture. `ordem_de_campo` is the base case (one subsection per cabine, tree order) and
 * `por_local_e_tipo` is built on it, splitting only the cabines with "Agrupar por tipo" on.
 */

const small = buildSnapshot(replay(portoSeguroSmall.log, { deadOpIds: portoSeguroSmall.deadOpIds }), portoSeguroSmall.relatorioId);
const RELATORIO = small.relatorio.id;

const id = (n: number) => `019966b0-0071-7000-8000-${n.toString(16).padStart(12, '0')}`;

function cabine(n: number, name: string, orderKey: string, agrupar = false): LocationRow {
  return {
    id: id(n),
    relatorio_id: RELATORIO,
    parent_id: null,
    kind: 'cabine',
    name,
    order_key: orderKey,
    removed_at: null,
    se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
    env: { altitude_m: null, temperature_c: null, humidity_pct: null },
    agrupar_por_tipo: agrupar,
  };
}

function coluna(n: number, name: string, parent: number, orderKey: string): LocationRow {
  return { id: id(n), relatorio_id: RELATORIO, parent_id: id(parent), kind: 'coluna', name, order_key: orderKey, removed_at: null };
}

interface SheetOptions {
  role?: Role;
  feeds?: number;
  removed?: boolean;
}

/** An equipment sheet `n` (block id(1000+n), equipment id(2000+n), TAG "T⟨n⟩") at `location`. */
function sheet(n: number, location: number, type: EquipmentBlockType, orderKey: string, options: SheetOptions = {}): { block: BlockRow; equipment: EquipmentRow } {
  const { block, equipment } = newEquipmentBlock({
    blockId: id(1000 + n),
    equipmentId: id(2000 + n),
    relatorioId: RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(location),
    type,
    tag: `T${n}`,
    seedVersion: 'v1',
    orderKey,
  });
  return {
    block: {
      ...block,
      config: options.role === undefined ? block.config : { ...(block.config as object), role: options.role },
      feeds_block_id: options.feeds === undefined ? null : id(1000 + options.feeds),
      removed_at: options.removed === true ? '2026-09-20T12:00:00.000Z' : null,
    },
    equipment,
  };
}

function snapshotOf(locations: LocationRow[], sheets: { block: BlockRow; equipment: EquipmentRow }[]): RelatorioSnapshot {
  return { ...small, locations, blocks: sheets.map((s) => s.block), equipment: sheets.map((s) => s.equipment), files: [], points: [], suggestions: [] };
}

const block = (n: number) => id(1000 + n);
const summary = (subsections: readonly PrintSubsection[]) => subsections.map((s) => ({ kind: s.kind, title: s.title, blockIds: s.blockIds }));

describe('7.1-UNIT-001 groupForPrint: the base case (ordem_de_campo)', () => {
  // Cabine A (flag on) with its own sheet and two colunas; cabine B with nothing; cabine C (flag off).
  const locations = [cabine(1, 'Cabine A', 'a0', true), coluna(2, 'Coluna 1', 1, 'a0'), coluna(3, 'Coluna 2', 1, 'a1'), cabine(4, 'Cabine B', 'a1'), cabine(5, 'Cubículo C', 'a2')];
  const sheets = [
    sheet(1, 1, 'transformador_forca', 'a0'),
    sheet(2, 2, 'chave_seccionadora', 'a0'),
    sheet(3, 2, 'tp', 'a1'),
    sheet(4, 3, 'disjuntor_mt', 'a0'),
    sheet(5, 5, 'cabos_entrada', 'a0'),
    sheet(6, 5, 'tc', 'a1'),
  ];
  const snapshot = snapshotOf(locations, sheets);

  it('gives one subsection per cabine holding a sheet, titled with its name, sheets in tree order, the flag ignored', () => {
    const grouping = groupForPrint(snapshot, 'ordem_de_campo');
    expect(grouping.scheme).toBe('ordem_de_campo');
    expect(summary(grouping.subsections)).toEqual([
      { kind: 'cabine', title: 'Cabine A', blockIds: [block(1), block(2), block(3), block(4)] },
      { kind: 'cabine', title: 'Cubículo C', blockIds: [block(5), block(6)] },
    ]);
    expect(grouping.subsections.map((s) => s.cabineId)).toEqual([id(1), id(5)]);
    expect(grouping.warnings).toEqual([]);
  });

  it('never reorders the tree: the subsections, joined, are `sheetOrder`', () => {
    const joined = groupForPrint(snapshot, 'ordem_de_campo').subsections.flatMap((s) => s.blockIds);
    expect(joined).toEqual(sheetOrder(snapshot).map((node) => node.blockId));
  });

  it('reads the relatório\'s own scheme by default', () => {
    const fieldOrder: RelatorioSnapshot = { ...snapshot, relatorio: { ...snapshot.relatorio, export: { scheme: 'ordem_de_campo' } } };
    expect(groupForPrint(fieldOrder)).toEqual(groupForPrint(snapshot, 'ordem_de_campo'));
    expect(groupForPrint(snapshot).scheme).toBe('por_local_e_tipo');
  });

  it('ignores removed sheets', () => {
    const withRemoved = snapshotOf(locations, [...sheets, sheet(7, 5, 'para_raio', 'a2', { removed: true })]);
    expect(groupForPrint(withRemoved, 'ordem_de_campo')).toEqual(groupForPrint(snapshot, 'ordem_de_campo'));
    expect(groupForPrint(withRemoved, 'por_local_e_tipo')).toEqual(groupForPrint(snapshot, 'por_local_e_tipo'));
  });
});

describe('7.1-UNIT-001 groupForPrint: por_local_e_tipo is built on the base case', () => {
  it('equals the base case when every cabine has the flag off', () => {
    const locations = [cabine(1, 'Cabine A', 'a0'), coluna(2, 'Coluna 1', 1, 'a0'), cabine(3, 'Cabine B', 'a1')];
    const sheets = [sheet(1, 2, 'tc', 'a0'), sheet(2, 2, 'tp', 'a1'), sheet(3, 1, 'transformador_forca', 'a0'), sheet(4, 3, 'cabos_saida', 'a0', { role: 'alimentacao' })];
    const snapshot = snapshotOf(locations, sheets);
    expect(groupForPrint(snapshot, 'por_local_e_tipo').subsections).toEqual(groupForPrint(snapshot, 'ordem_de_campo').subsections);
    expect(groupForPrint(snapshot, 'por_local_e_tipo').warnings).toEqual([]);
  });

  it('keeps an unflagged cabine\'s base subsection exactly, beside a flagged one split by type', () => {
    const locations = [cabine(1, 'Cabine A', 'a0', true), cabine(2, 'Cabine B', 'a1')];
    const sheets = [sheet(1, 1, 'disjuntor_mt', 'a0'), sheet(2, 1, 'chave_seccionadora', 'a1'), sheet(3, 2, 'disjuntor_mt', 'a0'), sheet(4, 2, 'chave_seccionadora', 'a1')];
    const snapshot = snapshotOf(locations, sheets);
    const base = groupForPrint(snapshot, 'ordem_de_campo').subsections;
    const grouped = groupForPrint(snapshot, 'por_local_e_tipo').subsections;
    expect(grouped.at(-1)).toEqual(base.at(-1));
    expect(summary(grouped)).toEqual([
      { kind: 'seccionadoras', title: 'Seccionadoras dos Cubículos de MT da Cabine A', blockIds: [block(2)] },
      { kind: 'disjuntores', title: 'Disjuntores dos Cubículos de MT da Cabine A', blockIds: [block(1)] },
      { kind: 'cabine', title: 'Cabine B', blockIds: [block(3), block(4)] },
    ]);
  });

  it('prints the flagged groups in the fixed order, skips the empty ones and puts para-raios and cabos with the seccionadoras', () => {
    const locations = [cabine(1, '1° Subsolo', 'a0', true), coluna(2, 'Coluna 1', 1, 'a0'), coluna(3, 'Coluna 2', 1, 'a1')];
    const sheets = [
      sheet(1, 1, 'transformador_forca', 'a0'),
      sheet(2, 1, 'cabos_saida', 'a1', { role: 'alimentacao', feeds: 1 }),
      sheet(3, 2, 'disjuntor_mt', 'a0'),
      sheet(4, 2, 'para_raio', 'a1', { role: 'entrada' }),
      sheet(5, 2, 'chave_seccionadora', 'a2'),
      sheet(6, 3, 'cabos_entrada', 'a0', { role: 'entrada' }),
      sheet(7, 3, 'cabos_saida', 'a1', { role: 'saida' }),
      sheet(8, 3, 'cabos_saida', 'a2'),
    ];
    const grouping = groupForPrint(snapshotOf(locations, sheets), 'por_local_e_tipo');
    expect(summary(grouping.subsections)).toEqual([
      { kind: 'seccionadoras', title: 'Seccionadoras dos Cubículos de MT do 1° Subsolo', blockIds: [block(4), block(5), block(6), block(7), block(8)] },
      { kind: 'disjuntores', title: 'Disjuntores dos Cubículos de MT do 1° Subsolo', blockIds: [block(3)] },
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação do 1° Subsolo', blockIds: [block(2), block(1)] },
    ]);
    expect(grouping.warnings).toEqual([]);
  });

  it('pairs the n-th TP with the n-th TC of each location in tree order, leftovers after the pairs', () => {
    const locations = [cabine(1, 'Geradores', 'a0', true), coluna(2, 'Coluna 3', 1, 'a0'), coluna(3, 'Coluna 4', 1, 'a1')];
    const sheets = [
      // The cabine itself: TP, TP, TC, TC.
      sheet(1, 1, 'tp', 'a0'),
      sheet(2, 1, 'tp', 'a1'),
      sheet(3, 1, 'tc', 'a2'),
      sheet(4, 1, 'tc', 'a3'),
      // Coluna 3: TC, TP, TP (one TP is left over).
      sheet(5, 2, 'tc', 'a0'),
      sheet(6, 2, 'tp', 'a1'),
      sheet(7, 2, 'tp', 'a2'),
      // Coluna 4: a lone TC.
      sheet(8, 3, 'tc', 'a0'),
    ];
    const grouping = groupForPrint(snapshotOf(locations, sheets), 'por_local_e_tipo');
    expect(summary(grouping.subsections)).toEqual([
      { kind: 'tps_tcs', title: "TP's e TC's dos Cubículos de MT dos Geradores", blockIds: [block(1), block(3), block(2), block(4), block(6), block(5), block(7), block(8)] },
    ]);
  });

  it('pairs cables with transformers by feeds_block_id only: each transformer after the cables feeding it', () => {
    const locations = [cabine(1, 'Subestação Norte', 'a0', true), coluna(2, 'Coluna 1', 1, 'a0')];
    const sheets = [
      sheet(1, 1, 'transformador_forca', 'a0'),
      sheet(2, 1, 'transformador_forca', 'a1'),
      // Tree order: the cable feeding transformer 2 comes first; two cables feed transformer 1.
      sheet(3, 1, 'cabos_saida', 'a2', { role: 'alimentacao', feeds: 2 }),
      sheet(4, 1, 'cabos_saida', 'a3', { role: 'alimentacao', feeds: 1 }),
      sheet(5, 2, 'cabos_saida', 'a0', { role: 'alimentacao', feeds: 1 }),
    ];
    const grouping = groupForPrint(snapshotOf(locations, sheets), 'por_local_e_tipo');
    expect(summary(grouping.subsections)).toEqual([
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação da Subestação Norte', blockIds: [block(4), block(5), block(1), block(3), block(2)] },
    ]);
    expect(grouping.warnings).toEqual([]);
  });

  it('prints an unpaired cable last in its group with an integrity warning: no feed, another cabine\'s transformer, a removed one', () => {
    const locations = [cabine(1, 'Cabine A', 'a0', true), cabine(2, 'Cabine B', 'a1', true)];
    const sheets = [
      sheet(1, 1, 'transformador_forca', 'a0'),
      sheet(2, 1, 'cabos_saida', 'a1', { role: 'alimentacao' }),
      sheet(3, 1, 'cabos_saida', 'a2', { role: 'alimentacao', feeds: 5 }),
      sheet(4, 1, 'cabos_saida', 'a3', { role: 'alimentacao', feeds: 6 }),
      sheet(5, 2, 'transformador_forca', 'a0'),
      sheet(6, 2, 'transformador_forca', 'a1', { removed: true }),
      sheet(7, 1, 'cabos_saida', 'a4', { role: 'alimentacao', feeds: 1 }),
    ];
    const grouping = groupForPrint(snapshotOf(locations, sheets), 'por_local_e_tipo');
    expect(summary(grouping.subsections)).toEqual([
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação da Cabine A', blockIds: [block(7), block(1), block(2), block(3), block(4)] },
      { kind: 'transformadores', title: 'Transformadores e Cabos de Alimentação da Cabine B', blockIds: [block(5)] },
    ]);
    expect(grouping.warnings).toEqual([
      { kind: 'integrity', code: 'unpaired_cable', blockId: block(2), cabineId: id(1) },
      { kind: 'integrity', code: 'unpaired_cable', blockId: block(3), cabineId: id(1) },
      { kind: 'integrity', code: 'unpaired_cable', blockId: block(4), cabineId: id(1) },
    ]);
    // The base case pairs nothing and warns of nothing.
    expect(groupForPrint(snapshotOf(locations, sheets), 'ordem_de_campo').warnings).toEqual([]);
  });

  it('agrees the title with the cabine name\'s head noun: do, da, dos, das, masculine singular when unknown', () => {
    const titleOf = (name: string) => {
      const snapshot = snapshotOf([cabine(1, name, 'a0', true)], [sheet(1, 1, 'disjuntor_mt', 'a0')]);
      return groupForPrint(snapshot, 'por_local_e_tipo').subsections[0]!.title;
    };
    expect(titleOf('1° Subsolo')).toBe('Disjuntores dos Cubículos de MT do 1° Subsolo');
    // A leading ordinal or number is skipped: the noun after it agrees.
    expect(titleOf('2ª Cabine')).toBe('Disjuntores dos Cubículos de MT da 2ª Cabine');
    expect(titleOf('3º Subsolo')).toBe('Disjuntores dos Cubículos de MT do 3º Subsolo');
    expect(titleOf('2 Colunas')).toBe('Disjuntores dos Cubículos de MT das 2 Colunas');
    expect(titleOf('Geradores')).toBe('Disjuntores dos Cubículos de MT dos Geradores');
    expect(titleOf('Cabine Principal')).toBe('Disjuntores dos Cubículos de MT da Cabine Principal');
    expect(titleOf('Colunas Leste')).toBe('Disjuntores dos Cubículos de MT das Colunas Leste');
    expect(titleOf('Subsolo')).toBe('Disjuntores dos Cubículos de MT do Subsolo');
    expect(titleOf('  Torre B  ')).toBe('Disjuntores dos Cubículos de MT do Torre B');
  });

  it('reads the role from the block config only', () => {
    expect(blockRoleOf({ config: { block_type: 'cabos_saida', role: 'alimentacao', sub_blocks: {}, na_defaults: [] } })).toBe('alimentacao');
    expect(blockRoleOf({ config: { role: 'lateral' } })).toBeNull();
    expect(blockRoleOf({ config: null })).toBeNull();
  });
});

describe('7.1-UNIT-001 groupForPrint on the Porto Seguro fixture', () => {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);

  it('yields the FO.SERV-03 9.1-9.11 subsections with their titles and sheet counts', () => {
    const grouping = groupForPrint(snapshot);
    expect(grouping.scheme).toBe('por_local_e_tipo');
    expect(grouping.subsections.map((s) => [s.title, s.blockIds.length])).toEqual([
      ['Cubículo Enel', 9],
      ['Seccionadoras dos Cubículos de MT do 1° Subsolo', 13],
      ['Disjuntores dos Cubículos de MT do 1° Subsolo', 14],
      ["TP's e TC's dos Cubículos de MT do 1° Subsolo", 12],
      ['Transformadores e Cabos de Alimentação do 1° Subsolo', 10],
      ['Oxigênio', 5],
      ['Cobertura A', 6],
      ['Cobertura B', 6],
      ['Seccionadoras dos Cubículos de MT dos Geradores', 7],
      ['Disjuntores dos Cubículos de MT dos Geradores', 4],
      ["TP's e TC's dos Cubículos de MT dos Geradores", 8],
    ]);
    expect(grouping.warnings).toEqual([]);
    // Every one of the 94 sheets prints exactly once.
    const printed = grouping.subsections.flatMap((s) => s.blockIds);
    expect(printed).toHaveLength(94);
    expect(new Set(printed).size).toBe(94);
  });

  it('prints each alimentação cable right before the transformer it feeds, as the delivered 9.5', () => {
    const transformers = groupForPrint(snapshot).subsections.find((s) => s.kind === 'transformadores')!;
    expect(transformers.blockIds).toEqual(SUBSOLO_TRANSFORMER_BLOCK_IDS.flatMap((transformer, n) => [SUBSOLO_FEEDER_CABLE_BLOCK_IDS[n]!, transformer]));
  });

  it('is the base case for every cabine once the flags are off', () => {
    const unflagged: RelatorioSnapshot = { ...snapshot, locations: snapshot.locations.map((l) => (l.kind === 'cabine' ? { ...l, agrupar_por_tipo: false } : l)) };
    expect(groupForPrint(unflagged, 'por_local_e_tipo').subsections).toEqual(groupForPrint(snapshot, 'ordem_de_campo').subsections);
    expect(groupForPrint(snapshot, 'ordem_de_campo').subsections.map((s) => s.title)).toEqual(['Cubículo Enel', '1° Subsolo', 'Oxigênio', 'Cobertura A', 'Cobertura B', 'Geradores']);
  });
});
