import { describe, expect, it } from 'vitest';
import { draftKey, draftTargetSchema, parseDraftKey, type DraftTarget } from './key.ts';

/* Test 1.8-UNIT-001: AD-2's "keyed by surface and entity". */

const ENTITY = '019966b0-0009-7000-8000-000000000001';

describe('draftKey', () => {
  it('joins the two segments, and the three when there is a field', () => {
    expect(draftKey({ surface: 'ficha', entity_id: ENTITY })).toBe(`ficha/${ENTITY}`);
    expect(draftKey({ surface: 'ficha', entity_id: ENTITY, field: 'observacoes' })).toBe(
      `ficha/${ENTITY}/observacoes`,
    );
  });

  it('is stable: the same target always gives the same key', () => {
    const target: DraftTarget = { surface: 'fixture-field', entity_id: ENTITY, field: 'local' };
    expect(draftKey(target)).toBe(draftKey({ ...target }));
  });

  it('never collides across the three segments', () => {
    const keys = [
      draftKey({ surface: 'a', entity_id: 'b' }),
      draftKey({ surface: 'a', entity_id: 'b', field: 'c' }),
      draftKey({ surface: 'a-b', entity_id: 'c' }),
      draftKey({ surface: 'a', entity_id: 'b-c' }),
      draftKey({ surface: 'b', entity_id: 'a', field: 'c' }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('refuses a segment the vocabulary does not allow', () => {
    for (const bad of ['', 'Ficha', 'fi cha', 'ficha/x', '-ficha', 'ficha.x', 'ação']) {
      expect(() => draftKey({ surface: bad, entity_id: ENTITY })).toThrow();
      expect(() => draftKey({ surface: 'ficha', entity_id: ENTITY, field: bad })).toThrow();
    }
  });
});

describe('parseDraftKey', () => {
  it('round-trips every key it produces', () => {
    for (const target of [
      { surface: 'ficha', entity_id: ENTITY },
      { surface: 'ficha', entity_id: ENTITY, field: 'observacoes' },
      { surface: 'fixture-field', entity_id: 'b1', field: 'local' },
    ] satisfies DraftTarget[]) {
      const key = draftKey(target);
      const parsed = parseDraftKey(key);
      expect(parsed).toEqual(target);
      expect(draftKey(parsed!)).toBe(key);
    }
  });

  it('returns null for anything that is not one of our keys', () => {
    for (const bad of ['', 'ficha', 'a/b/c/d', 'A/b', 'a//b', 'a/b/', '/a/b']) {
      expect(parseDraftKey(bad)).toBeNull();
    }
  });
});

describe('draftTargetSchema', () => {
  it('accepts a uuidv7 entity id and rejects an unknown shape', () => {
    expect(draftTargetSchema.safeParse({ surface: 'ficha', entity_id: ENTITY }).success).toBe(true);
    expect(draftTargetSchema.safeParse({ surface: 'ficha' }).success).toBe(false);
  });
});
