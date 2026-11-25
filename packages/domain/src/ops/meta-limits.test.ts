import { describe, expect, it } from 'vitest';
import { opLog as portoSeguroLog } from '../../fixtures/porto-seguro/op-log.ts';
import { opLog as portoSeguroSmallLog } from '../../fixtures/porto-seguro/small/op-log.ts';
import { opLog as replaySmallLog } from '../../fixtures/replay-small/op-log.ts';
import { shortStringsOfBytes } from '../../fixtures/value-caps.ts';
import { opMetaSchema, type OpMeta } from './op.ts';
import { longestArrayOf, opDepthIssue, serializedBytes, VALUE_MAX_BYTES, VALUE_MAX_ITEMS } from './value-limits.ts';

/*
 * Story 30.1 D (R-12 (E20)): an op's `meta` keeps every key its emitter stamped (`z.looseObject`), so it
 * was bounded by depth only. It is now held to the caps a value has, by the same check the push route
 * asks before any parse (`opDepthIssue`): at most `VALUE_MAX_BYTES` serialized and no array longer than
 * `VALUE_MAX_ITEMS`. The app's own metas stay far under both.
 */

const UUID = '019966c1-0000-7000-8000-000000000001';

describe('30.1-UNIT-D: the caps of an op\'s meta', () => {
  it('a meta over the byte cap, or holding an array over the count cap, is refused; at the caps it passes', () => {
    const atBytes = { note: 'x'.repeat(VALUE_MAX_BYTES - serializedBytes({ note: '' })) };
    expect(serializedBytes(atBytes)).toBe(VALUE_MAX_BYTES);
    expect(opDepthIssue({ value: null, meta: atBytes })).toBeNull();
    expect(opDepthIssue({ value: null, meta: { ...atBytes, note: `${atBytes.note}x` } })).toMatch(/^meta weighs 131073 bytes, over 131072$/);
    const atItems = { list: shortStringsOfBytes(VALUE_MAX_ITEMS, 4 * VALUE_MAX_ITEMS) };
    expect(opDepthIssue({ value: null, meta: atItems })).toBeNull();
    expect(opDepthIssue({ value: null, meta: { list: [...atItems.list, 'x'] } })).toMatch(/^meta\.list holds 501 items, over 500$/);
    // The depth is still asked first, so a deep meta never reaches the recursive walks.
    let deep: unknown = 'x';
    for (let i = 0; i < 20_000; i++) deep = { a: deep };
    expect(opDepthIssue({ value: null, meta: deep })).toMatch(/meta nests more than 32/);
  });

  it('measure: every meta the app writes today (the fixture logs, and every known key filled) is far under both caps', () => {
    const full: OpMeta = opMetaSchema.parse({
      source_suggestion_id: UUID,
      auto: true,
      standing_op_id: UUID,
      seen_conflict_op_id: UUID,
      seen_modified_at: '2026-11-24T12:00:00.000Z',
      composed: true,
    });
    // A restore mark is a handful of ids and timestamps; counted with room to spare.
    const restoreRoom = 512;
    let bytes = serializedBytes(full) + restoreRoom;
    let items = 0;
    for (const op of [...portoSeguroLog, ...portoSeguroSmallLog, ...replaySmallLog]) {
      if (op.meta === null) continue;
      bytes = Math.max(bytes, serializedBytes(op.meta));
      items = Math.max(items, longestArrayOf(op.meta)?.length ?? 0);
      expect(opDepthIssue(op)).toBeNull();
    }
    console.log(`30.1-UNIT-D measured: the largest meta ${bytes} B, the longest array in a meta ${items}`);
    expect(bytes * 100).toBeLessThan(VALUE_MAX_BYTES);
    expect(items * 100).toBeLessThan(VALUE_MAX_ITEMS);
  });
});
