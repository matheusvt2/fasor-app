import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { portoSeguroSmall } from '../../fixtures/porto-seguro/small/op-log.ts';
import { replaySmall } from '../../fixtures/replay-small/op-log.ts';
import { applyOp, entityKey, targetsOf, type EntityKey, type EntityState } from '../ops/apply.ts';
import type { Op } from '../ops/op.ts';
import { orderLog, replay } from '../ops/replay.ts';
import type { EntityRow } from './entities.ts';
import { buildSnapshot, createSnapshotBuilder, serializeSnapshot } from './snapshot.ts';

/*
 * E7-A1/E8-A1: the incremental snapshot builder equals `buildSnapshot` for every state, and
 * shares every row and array a commit did not touch with the previous call.
 */

/** One op folded into `state` in place, the way `replay` does (a changed row is a new object). */
function applyInPlace(state: Map<EntityKey, EntityRow>, op: Op): void {
  const touched = new Map<EntityKey, EntityRow>();
  for (const ref of targetsOf(op)) {
    const row = state.get(ref.key);
    if (row) touched.set(ref.key, row);
  }
  const next = applyOp(touched, op);
  for (const [key, row] of next) if (row !== touched.get(key)) state.set(key, row);
}

let n = 0;
function put(path: string, value: Op['value'], relatorioId: string, blockCompany: { company_id: string; actor_id: string }): Op {
  n += 1;
  return {
    op_id: `019966b0-0009-7000-8000-${n.toString(16).padStart(12, '0')}`,
    kind: 'put',
    scope: 'relatorio',
    company_id: blockCompany.company_id,
    project_id: null,
    relatorio_id: relatorioId,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: blockCompany.actor_id,
    device_id: 'tablet-builder',
    client_ts: new Date(Date.UTC(2026, 8, 28, 12, 0, n)).toISOString(),
  } as Op;
}

describe('E9C1-UNIT-001 createSnapshotBuilder equals buildSnapshot', () => {
  /**
   * Folds `log` one op at a time, calls the incremental builder after every op, and compares
   * it with `buildSnapshot` (serialized) after every op where `compareAt(index)` holds.
   * Fails on the first divergence, naming the op.
   */
  function foldAndCompare(log: readonly Op[], deadOpIds: readonly string[], relatorioId: string, compareAt: (index: number, last: number) => boolean): number {
    const build = createSnapshotBuilder();
    const dead = new Set(deadOpIds);
    const state = new Map<EntityKey, EntityRow>();
    const ordered = orderLog(log);
    let compared = 0;
    ordered.forEach((op, index) => {
      if (dead.has(op.op_id)) return;
      applyInPlace(state, op);
      if (!state.has(entityKey('relatorio', relatorioId))) {
        expect(() => build(state, relatorioId), `op ${index}`).toThrow(/not in state/);
        return;
      }
      const incremental = build(state, relatorioId);
      if (!compareAt(index, ordered.length - 1)) return;
      if (serializeSnapshot(incremental) !== serializeSnapshot(buildSnapshot(state, relatorioId))) {
        expect.fail(`the snapshots diverge after op ${index} (${op.kind} ${op.path})`);
      }
      compared += 1;
    });
    expect(build(state, relatorioId)).toEqual(buildSnapshot(state, relatorioId));
    return compared;
  }

  it('after every op of the small Porto Seguro log, applied one at a time, the incremental snapshot serializes exactly as buildSnapshot', () => {
    expect(foldAndCompare(portoSeguroSmall.log, portoSeguroSmall.deadOpIds, portoSeguroSmall.relatorioId, () => true)).toBeGreaterThan(50);
  });

  it('the full Porto Seguro log (3841 ops), applied one at a time with the builder called after every op, serializes as buildSnapshot at every 48th op and the last', () => {
    // The builder runs after every op, so every memo transition is exercised; the full
    // reference (about 45 ms per call on this log: a parse of every row plus two
    // serializations) is compared at a stride so the unit gate stays short. The small log
    // above is compared after every single op.
    expect(foldAndCompare(portoSeguro.log, portoSeguro.deadOpIds, portoSeguro.relatorioId, (index, last) => index % 48 === 0 || index === last)).toBeGreaterThan(70);
  });

  it('matches buildSnapshot over the small replay fixture, through a block removal and its restore', () => {
    const build = createSnapshotBuilder();
    const state = new Map<EntityKey, EntityRow>();
    const dead = new Set(replaySmall.deadOpIds ?? []);
    orderLog(replaySmall.log).forEach((op, index) => {
      if (dead.has(op.op_id)) return;
      applyInPlace(state, op);
      if (!state.has(entityKey('relatorio', replaySmall.relatorioId))) return;
      expect(serializeSnapshot(build(state, replaySmall.relatorioId)), `op ${index}`).toBe(serializeSnapshot(buildSnapshot(state, replaySmall.relatorioId)));
    });
  });

  it('throws as buildSnapshot does for a relatorio the state does not hold', () => {
    const build = createSnapshotBuilder();
    expect(() => build(new Map(), 'missing')).toThrow('relatorio missing not in state');
    expect(() => buildSnapshot(new Map(), 'missing')).toThrow('relatorio missing not in state');
  });
});

describe('E9C1-UNIT-002 createSnapshotBuilder shares what a commit did not touch', () => {
  // One replay for the whole block (rows are immutable; each test copies the map it changes).
  let replayed: EntityState | null = null;
  const base = (): EntityState => (replayed ??= replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }));
  const who = { company_id: portoSeguro.companyId, actor_id: portoSeguro.userId };

  it('one commit to block A: every other block, the locations, the files and the equipment are the previous objects', () => {
    const build = createSnapshotBuilder();
    const state = new Map(base());
    const first = build(state, portoSeguro.relatorioId);
    const target = first.blocks.find((block) => block.equipment_id !== null)!;
    applyInPlace(state, put(`sheet/${target.id}/observations`, 'Observação nova.', portoSeguro.relatorioId, who));
    const second = build(new Map(state), portoSeguro.relatorioId);

    expect(second).not.toBe(first);
    expect(second.blocks).not.toBe(first.blocks);
    second.blocks.forEach((block, i) => {
      if (block.id === target.id) expect(block).not.toBe(first.blocks[i]);
      else expect(block).toBe(first.blocks[i]);
    });
    expect(second.locations).toBe(first.locations);
    expect(second.files).toBe(first.files);
    expect(second.equipment).toBe(first.equipment);
    expect(second.points).toBe(first.points);
    expect(second.relatorio).toBe(first.relatorio);
    expect(second.project).toBe(first.project);
    expect(second.instruments).toBe(first.instruments);
    expect(second).toEqual(buildSnapshot(state, portoSeguro.relatorioId));
  });

  it('a state with no change returns the previous snapshot itself', () => {
    const build = createSnapshotBuilder();
    const state = base();
    const first = build(state, portoSeguro.relatorioId);
    expect(build(new Map(state), portoSeguro.relatorioId)).toBe(first);
  });

  it('a removed block leaves blocks, and its equipment leaves equipment when no other live block names it', () => {
    const build = createSnapshotBuilder();
    const state = new Map(base());
    const first = build(state, portoSeguro.relatorioId);
    const target = first.blocks.find((block) => block.equipment_id !== null && first.blocks.filter((b) => b.equipment_id === block.equipment_id).length === 1)!;
    applyInPlace(state, { ...put(`block/${target.id}/removed_at`, '2026-09-28T12:00:00.000Z', portoSeguro.relatorioId, who), kind: 'remove' } as Op);
    const second = build(state, portoSeguro.relatorioId);
    expect(second.blocks.map((b) => b.id)).not.toContain(target.id);
    expect(second.equipment.map((e) => e.id)).not.toContain(target.equipment_id);
    expect(second.locations).toBe(first.locations);
    expect(serializeSnapshot(second)).toBe(serializeSnapshot(buildSnapshot(state, portoSeguro.relatorioId)));
  });

  it('empty edges: a relatorio alone (no project, blocks, files or registry) builds as buildSnapshot, with empty arrays kept across calls', () => {
    const build = createSnapshotBuilder();
    const full = base();
    const only = new Map<EntityKey, EntityRow>([[entityKey('relatorio', portoSeguro.relatorioId), full.get(entityKey('relatorio', portoSeguro.relatorioId))!]]);
    const first = build(only, portoSeguro.relatorioId);
    expect(first).toEqual(buildSnapshot(only, portoSeguro.relatorioId));
    expect(first.project).toBeNull();
    expect(first.blocks).toEqual([]);
    const again = build(new Map(only), portoSeguro.relatorioId);
    expect(again).toBe(first);
  });

  it('two relatórios through one builder keep their own previous snapshots', () => {
    const build = createSnapshotBuilder();
    const porto = base();
    const small = replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds });
    const a = build(porto, portoSeguro.relatorioId);
    const b = build(small, replaySmall.relatorioId);
    expect(build(porto, portoSeguro.relatorioId)).toBe(a);
    expect(build(small, replaySmall.relatorioId)).toBe(b);
  });
});
