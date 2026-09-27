import { describe, expect, it } from 'vitest';
import { BLOCK_1_ID, BLOCK_2_ID, BLOCK_3_ID, COMPANY_ID, fixedTs, RELATORIO_ID, replaySmall, SUGGESTION_2_ID, USER_ID } from '../../fixtures/replay-small/op-log.ts';
import type { Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot, serializeSnapshot } from './snapshot.ts';

/** The fixture log replayed up to and including the op at `index`. */
function snapshotAfter(index: number) {
  const log = replaySmall.log.slice(0, index + 1);
  return buildSnapshot(replay(log), replaySmall.relatorioId);
}

describe('snapshot tombstones (AD-20)', () => {
  const removeIndex = replaySmall.log.findIndex(
    (op) => op.kind === 'remove' && op.path === `block/${BLOCK_3_ID}/removed_at`,
  );
  const restoreIndex = removeIndex + 1;

  it('excludes a removed row and includes it again after the restore', () => {
    expect(removeIndex).toBeGreaterThan(0);
    const restore = replaySmall.log[restoreIndex]!;
    expect(restore).toMatchObject({ kind: 'put', path: `block/${BLOCK_3_ID}/removed_at`, value: null });

    const beforeRemove = snapshotAfter(removeIndex - 1);
    expect(beforeRemove.blocks.map((b) => b.id)).toContain(BLOCK_3_ID);

    const removed = snapshotAfter(removeIndex);
    expect(removed.blocks.map((b) => b.id)).not.toContain(BLOCK_3_ID);

    const restored = snapshotAfter(restoreIndex);
    expect(restored.blocks.map((b) => b.id)).toContain(BLOCK_3_ID);
  });

  it('keeps only the suggestions a current cell references', () => {
    const final = buildSnapshot(replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId);
    expect(final.suggestions.map((s) => s.id)).not.toContain(SUGGESTION_2_ID);
  });

  it('resolves the responsible user row when the state holds it, null otherwise (Story 4.8)', () => {
    const state = replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds });
    const relatorio = state.get(`relatorio:${replaySmall.relatorioId}`) as { setup: { responsible_user_id: string | null } };
    const userId = relatorio.setup.responsible_user_id;
    // The fixture names a responsible but projects no `user` row: the snapshot says null.
    expect(buildSnapshot(state, replaySmall.relatorioId).responsible).toBeNull();
    if (userId === null) return;
    const withUser = new Map(state);
    const user = { id: userId, name: 'Ana Alves', email: 'a@teste.local', council: 'crea', registration_number: '1', title: 'Eng.', photo_location_enabled: true };
    withUser.set(`user:${userId}`, user as never);
    expect(buildSnapshot(withUser, replaySmall.relatorioId).responsible).toEqual(user);
  });

  it('lists as actors the user rows a block names as its last editor or its concluder, sorted by id, and leaves out an actor with no row (Story 7.1)', () => {
    const EDITOR = '019966b0-0000-7000-8000-00000000f0e2';
    const CONCLUDER = '019966b0-0000-7000-8000-00000000f0e1';
    const UNKNOWN = '019966b0-0000-7000-8000-00000000f0e3';
    let n = 0;
    const op = (path: string, value: Op['value'], extra: Partial<Op> = {}): Op => ({
      op_id: `019966b0-0001-7000-8000-00000000f2${(++n).toString(16).padStart(2, '0')}`,
      kind: 'put',
      scope: 'relatorio',
      company_id: COMPANY_ID,
      project_id: null,
      relatorio_id: RELATORIO_ID,
      path,
      value,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      actor_id: USER_ID,
      device_id: 'tablet-a',
      client_ts: fixedTs(90 + n),
      ...extra,
    });
    const user = (id: string, name: string): Op =>
      op(`user/${id}`, { id, name, email: `${name}@teste.local`, council: null, registration_number: null, title: null, photo_location_enabled: true }, {
        kind: 'create',
        scope: 'company',
        relatorio_id: null,
        actor_id: 'system:identity',
        device_id: 'server',
      });
    const extra: Op[] = [
      user(EDITOR, 'Bruno'),
      user(CONCLUDER, 'Carla'),
      // Block 3's last editor is a user with a row.
      op(`sheet/${BLOCK_3_ID}/observations`, 'Cabos limpos.', { actor_id: EDITOR, device_id: 'tablet-b' }),
      // Block 1 is concluded by another user with a row (its last editor stays the fixture's user, who has none).
      op(`block/${BLOCK_1_ID}/concluded_by`, { actor_id: CONCLUDER, at: fixedTs(95) }),
      // Block 2's last editor has no user row here: left out.
      op(`sheet/${BLOCK_2_ID}/observations`, 'Ver placa.', { actor_id: UNKNOWN, device_id: 'tablet-c' }),
    ];
    const snapshot = buildSnapshot(replay([...replaySmall.log, ...extra], { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId);
    const byId = new Map(snapshot.blocks.map((block) => [block.id, block]));
    expect(byId.get(BLOCK_3_ID)?.last_modified_by).toBe(EDITOR);
    expect(byId.get(BLOCK_1_ID)?.concluded_by?.actor_id).toBe(CONCLUDER);
    expect(byId.get(BLOCK_2_ID)?.last_modified_by).toBe(UNKNOWN);
    expect(snapshot.actors.map((row) => [row.id, row.name])).toEqual([
      [CONCLUDER, 'Carla'],
      [EDITOR, 'Bruno'],
    ]);
    // The fixture alone names only its own user, who has no row: none.
    expect(buildSnapshot(replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId).actors).toEqual([]);
  });

  it('serializes as canonical JSON: keys sorted at every level, no formatting whitespace', () => {
    const text = serializeSnapshot(snapshotAfter(removeIndex));
    expect(JSON.stringify(sortKeysDeep(JSON.parse(text)))).toBe(text);
  });
});

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
