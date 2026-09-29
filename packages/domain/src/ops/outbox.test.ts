import { describe, expect, it } from 'vitest';
import { emptySheet, type BlockRow, type FileRow } from '../schemas/entities.ts';
import { idSequence, opFactory, T0, T1, TEST_COMPANY, TEST_RELATORIO } from '../test-support.ts';
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

  it('10.2 merges two puts that carry only the commit stamps, keeping the FIRST op\'s stamps (what the device saw before the run)', () => {
    const f = opFactory();
    const standing = '019966b0-0005-7000-8000-000000000005';
    const displaced = '019966b0-0005-7000-8000-000000000006';
    // The cell held `standing` with a `conflict` of `displaced`; the second put was stamped with the first.
    const a = f.op({ path, value: 'W', prev_op_id: PREV, meta: { standing_op_id: standing, seen_conflict_op_id: displaced } });
    const b = f.op({ path, value: 'WEG', prev_op_id: a.op_id, meta: { standing_op_id: a.op_id, seen_conflict_op_id: displaced } });
    const merged = coalesce(a, b);
    expect(merged).toEqual({ ...b, prev_op_id: PREV, meta: { standing_op_id: standing, seen_conflict_op_id: displaced } });
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

describe('E9-Q3 undo of a photo-backed create (Story 9.2)', () => {
  const PHOTO = '019966b0-0005-7000-8000-000000000010';
  const SUGGESTION = '019966b0-0005-7000-8000-000000000011';
  const panelPhoto = (status: 'queued' | 'running' | 'done'): FileRow =>
    ({
      id: PHOTO,
      company_id: TEST_COMPANY,
      relatorio_id: TEST_RELATORIO,
      kind: 'photo',
      sha256: 'c'.repeat(64),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: '2026-09-21T12:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: 'panel',
      reading_target: { location_id: L1 },
      reading_status: status,
      people_in_photo: false,
    }) as FileRow;
  const suggestion = {
    id: SUGGESTION,
    relatorio_id: TEST_RELATORIO,
    target_path: `file/${PHOTO}/block_id`,
    value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C9' },
    trust: 'suggested',
    mode: 'fill',
    status: 'pending',
    source: { photo_id: PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: '019966b0-0005-7000-8000-000000000012' },
    prompt_version: 'panel-v1',
    hint: null,
  };

  it('puts reading_kind and reading_target null (the photo becomes a plain one, none) and the panel suggestion discarded', () => {
    for (const status of ['queued', 'running', 'done'] as const) {
      const f = opFactory();
      const fileKey = entityKey('file', PHOTO);
      const suggestionKey = entityKey('suggestion', SUGGESTION);
      const initial: EntityState = new Map<never, never>([
        [fileKey, panelPhoto(status)],
        [suggestionKey, suggestion],
      ] as never);
      const batch = [
        f.op({ path: `file/${PHOTO}/block_id`, value: B1, batch_id: BATCH }),
        f.op({ path: `file/${PHOTO}/caption`, value: 'placa de identificação', batch_id: BATCH }),
        f.op({ path: `file/${PHOTO}/reading_target`, value: { block_id: B1, block_type: 'chave_seccionadora' }, batch_id: BATCH }),
        f.op({ path: `file/${PHOTO}/reading_kind`, value: 'plate', batch_id: BATCH }),
        f.op({ path: `suggestion/${SUGGESTION}/status`, value: 'confirmed', batch_id: BATCH }),
      ];
      const { state, before } = applyRecording(initial, batch);
      expect(state.get(fileKey)).toMatchObject({ reading_kind: 'plate', reading_status: 'queued' });

      const inverses = invertBatch(batch, before, { newId: idSequence('019966b0-0007-7000-8000-'), now: T1 });
      expect(inverses.map((op) => [op.path, op.value])).toEqual([
        [`suggestion/${SUGGESTION}/status`, 'discarded'],
        [`file/${PHOTO}/reading_kind`, null],
        [`file/${PHOTO}/reading_target`, null],
        [`file/${PHOTO}/caption`, null],
        [`file/${PHOTO}/block_id`, null],
      ]);
      const undone = inverses.reduce((s, op) => applyOp(s, op), state);
      expect(undone.get(fileKey)).toMatchObject({ block_id: null, caption: null, reading_kind: null, reading_target: null, reading_status: 'none' });
      expect(undone.get(suggestionKey)).toMatchObject({ status: 'discarded' });
    }
  });

  it('undoes a suggestion status put to its previous value in a batch that re-targets no photo', () => {
    const f = opFactory();
    const suggestionKey = entityKey('suggestion', SUGGESTION);
    const initial: EntityState = new Map([[suggestionKey, suggestion]] as never);
    const batch = [f.op({ path: `suggestion/${SUGGESTION}/status`, value: 'confirmed', batch_id: BATCH })];
    const { before } = applyRecording(initial, batch);
    const inverses = invertBatch(batch, before, { newId: idSequence('019966b0-0008-7000-8000-'), now: T1 });
    expect(inverses.map((op) => op.value)).toEqual(['pending']);
  });
});
