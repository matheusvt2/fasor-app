import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow } from '../schemas/entities.ts';
import { idSequence, opFactory, T0, T1, TEST_RELATORIO } from '../test-support.ts';
import { applyOp, entityKey, readPath, type EntityState } from './apply.ts';
import type { Op } from './op.ts';
import { coalesce, invertBatch } from './outbox.ts';
import { replay } from './replay.ts';

const B1 = '019966b0-0005-7000-8000-000000000001';
const L1 = '019966b0-0005-7000-8000-000000000002';
const BATCH = '019966b0-0005-7000-8000-000000000003';
const PREV = '019966b0-0005-7000-8000-000000000004';

describe('1.4-UNIT-003 coalescing', () => {
  const path = `sheet/${B1}/nameplate/fabricacao`;

  it('merges two plain puts on one path from one device keeping last op_id, value, client_ts and first prev_op_id', () => {
    const f = opFactory();
    const a = f.op({ path, value: 'W', prev_op_id: PREV });
    const b = f.op({ path, value: 'WEG' });
    const merged = coalesce(a, b);
    expect(merged).toEqual({ ...b, prev_op_id: PREV });
    expect(merged?.op_id).toBe(b.op_id);
    expect(merged?.client_ts).toBe(b.client_ts);
  });

  it('keeps two rows when either op has meta or batch_id', () => {
    const f = opFactory();
    const plain = () => f.op({ path, value: 'x' });
    expect(coalesce(plain(), f.op({ path, value: 'y', meta: { source_suggestion_id: PREV } }))).toBeNull();
    expect(coalesce(f.op({ path, value: 'y', meta: { auto: true } }), plain())).toBeNull();
    expect(coalesce(plain(), f.op({ path, value: 'y', batch_id: BATCH }))).toBeNull();
    expect(coalesce(f.op({ path, value: 'y', batch_id: BATCH }), plain())).toBeNull();
  });

  it('keeps two rows across paths, devices, kinds and actors', () => {
    const f = opFactory();
    const a = f.op({ path, value: 'x' });
    expect(coalesce(a, f.op({ path: `sheet/${B1}/nameplate/modelo`, value: 'y' }))).toBeNull();
    expect(coalesce(a, f.op({ path, value: 'y', device_id: 'other' }))).toBeNull();
    expect(coalesce(a, f.op({ path, value: 'y', actor_id: '019966b0-0005-7000-8000-000000000009' }))).toBeNull();
    expect(coalesce(f.op({ kind: 'remove', path: `block/${B1}/removed_at`, value: null }), f.op({ path: `block/${B1}/removed_at`, value: null }))).toBeNull();
  });
});

const block = (): BlockRow => ({
  id: B1,
  relatorio_id: TEST_RELATORIO,
  location_id: L1,
  equipment_id: null,
  block_type: 'tc',
  config: {},
  seed_version: 'v1',
  order_key: 'a0',
  feeds_block_id: null,
  not_tested: null,
  concluded_by: null,
  sheet: emptySheet(),
  created_by: null,
  first_edited_at: null,
  last_modified_by: null,
  last_modified_at: null,
  removed_at: null,
});

/** Applies ops in order, recording the value each op replaced (what the outbox stores as prev_value). */
function applyRecording(initial: EntityState, ops: Op[]): { state: EntityState; before: Map<string, unknown> } {
  const before = new Map<string, unknown>();
  let state = initial;
  for (const op of ops) {
    before.set(op.op_id, readPath(state, op));
    state = applyOp(state, op);
  }
  return { state, before };
}

describe('1.4-UNIT-002 batch and undo', () => {
  it('N changes share one batch_id and undo writes N inverse ops in a new batch that restore the state', () => {
    const f = opFactory();
    const key = entityKey('block', B1);
    const initial: EntityState = new Map([[key, block()]]);
    const batch = [
      f.op({ path: `block/${B1}/order_key`, value: 'a5', batch_id: BATCH }),
      f.op({ path: `sheet/${B1}/nameplate/fabricacao`, value: 'WEG', batch_id: BATCH }),
      f.op({ kind: 'remove', path: `block/${B1}/removed_at`, value: null, batch_id: BATCH }),
    ];
    expect(new Set(batch.map((op) => op.batch_id)).size).toBe(1);
    const { state, before } = applyRecording(initial, batch);
    expect((state.get(key) as BlockRow).removed_at).not.toBeNull();

    const inverses = invertBatch(batch, before, { newId: idSequence('019966b0-0006-7000-8000-'), now: T1 });
    expect(inverses).toHaveLength(3);
    expect(new Set(inverses.map((op) => op.batch_id)).size).toBe(1);
    expect(inverses[0]?.batch_id).not.toBe(BATCH);
    expect(inverses.map((op) => op.path)).toEqual([...batch].reverse().map((op) => op.path));
    expect(inverses.map((op) => op.prev_op_id)).toEqual([...batch].reverse().map((op) => op.op_id));
    expect(inverses.every((op) => op.client_ts === T1.toISOString())).toBe(true);

    const undone = inverses.reduce((s, op) => applyOp(s, op), state).get(key) as BlockRow;
    expect(undone.removed_at).toBeNull();
    expect(undone.order_key).toBe('a0');
    // A cell never set before is undone to a null value; attribution stays (AD-18 is append-only).
    expect(undone.sheet.nameplate.fabricacao?.value).toBeNull();
  });

  it('undoes a create with a remove and skips a relatorio create', () => {
    const f = opFactory();
    const create = f.op({ kind: 'create', path: `block/${B1}`, value: block(), batch_id: BATCH });
    const relatorioCreate = f.op({
      kind: 'create',
      path: `relatorio/${TEST_RELATORIO}`,
      value: {
        id: TEST_RELATORIO,
        project_id: L1,
        template_id: null,
        template_version: null,
        seed_version: 'v1',
        status: 'rascunho',
        setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
        export: { scheme: 'por_local_e_tipo' },
        preview_file_id: null,
        removed_at: null,
      },
      batch_id: BATCH,
    });
    const { state, before } = applyRecording(new Map(), [relatorioCreate, create]);
    const inverses = invertBatch([relatorioCreate, create], before, { newId: idSequence('019966b0-0006-7000-8000-'), now: T0 });
    expect(inverses).toHaveLength(1);
    expect(inverses[0]).toMatchObject({ kind: 'remove', path: `block/${B1}/removed_at` });
    const after = replay([...[relatorioCreate, create], ...inverses]);
    expect((after.get(entityKey('block', B1)) as BlockRow).removed_at).toBe(T0.toISOString());
    expect(state.get(entityKey('relatorio', TEST_RELATORIO))).toBeDefined();
  });
});
