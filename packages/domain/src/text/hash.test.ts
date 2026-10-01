import { describe, expect, it } from 'vitest';
import { canonicalJson } from './hash.ts';

describe('K-7 canonicalJson', () => {
  it('writes an undefined array member as null, as JSON.stringify does', () => {
    expect(canonicalJson([1, undefined, 'a'])).toBe('[1,null,"a"]');
    expect(canonicalJson([undefined])).toBe(JSON.stringify([undefined]));
  });

  it('drops undefined object members and sorts keys at every level', () => {
    expect(canonicalJson({ b: [{ d: 1, c: undefined }], a: null, z: undefined })).toBe('{"a":null,"b":[{"d":1}]}');
  });

  it('is plain JSON: it parses back to the same value', () => {
    const value = { list: [1, 'x', null, { k: true }], n: -2.5, s: 'á"\\' };
    expect(JSON.parse(canonicalJson(value))).toEqual(value);
  });
});
