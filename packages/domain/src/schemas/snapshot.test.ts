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
