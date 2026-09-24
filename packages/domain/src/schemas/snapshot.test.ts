import { describe, expect, it } from 'vitest';
import { BLOCK_3_ID, replaySmall, SUGGESTION_2_ID } from '../../fixtures/replay-small/op-log.ts';
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
