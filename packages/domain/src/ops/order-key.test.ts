import { describe, expect, it } from 'vitest';
import { initialOrderKey, orderKeyAfter, orderKeyBetween, orderKeyForMove, sortByOrderKey } from './order-key.ts';

describe('4.1-UNIT orderKeyBetween', () => {
  it('lands strictly between its two neighbours in plain string order', () => {
    for (const [before, after] of [
      ['a0', 'a1'],
      [null, 'a0'],
      ['ah', null],
      ['a0', 'a0i'],
      ['a', 'b'],
      ['az', 'b00'],
      ['0', '1'],
      ['zz', null],
    ] as const) {
      const key = orderKeyBetween(before, after);
      if (before !== null) expect(key > before, `${key} > ${before}`).toBe(true);
      if (after !== null) expect(key < after, `${key} < ${after}`).toBe(true);
    }
  });

  it('is the first sibling key with no neighbours at all', () => {
    expect(orderKeyBetween(null, null)).toBe(initialOrderKey(0));
  });

  it('throws when before is not below after', () => {
    expect(() => orderKeyBetween('a1', 'a0')).toThrow(RangeError);
    expect(() => orderKeyBetween('a0', 'a0')).toThrow(RangeError);
    expect(() => orderKeyBetween('a', 'a0')).toThrow(RangeError);
  });

  it('keeps 100 random insertions strictly ordered', () => {
    let seed = 20260923;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const keys = [initialOrderKey(0), initialOrderKey(1), initialOrderKey(2)];
    for (let i = 0; i < 100; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = orderKeyBetween(keys[at - 1] ?? null, keys[at] ?? null);
      keys.splice(at, 0, key);
      for (let j = 1; j < keys.length; j++) expect(keys[j - 1]! < keys[j]!, `${keys[j - 1]} < ${keys[j]}`).toBe(true);
    }
  });

  it('keeps 60 insertions at the very top and at the very bottom ordered', () => {
    let top = [initialOrderKey(0)];
    for (let i = 0; i < 60; i++) top = [orderKeyBetween(null, top[0]!), ...top];
    for (let j = 1; j < top.length; j++) expect(top[j - 1]! < top[j]!).toBe(true);
    let bottom = [initialOrderKey(0)];
    for (let i = 0; i < 60; i++) bottom = [...bottom, orderKeyBetween(bottom.at(-1)!, null)];
    for (let j = 1; j < bottom.length; j++) expect(bottom[j - 1]! < bottom[j]!).toBe(true);
    // And squeezing between the same two keys again and again.
    let low = 'a0';
    const high = 'a1';
    for (let i = 0; i < 60; i++) {
      const key = orderKeyBetween(low, high);
      expect(key > low && key < high).toBe(true);
      low = key;
    }
  });
});

describe('4.1-UNIT orderKeyBetween never mints JSON text', () => {
  const parsesAsJson = (key: string) => {
    try {
      JSON.parse(key);
      return true;
    } catch {
      return false;
    }
  };

  it('a move to the first slot no longer yields a bare digit', () => {
    const key = orderKeyBetween(null, 'a0');
    expect(key < 'a0').toBe(true);
    expect(parsesAsJson(key)).toBe(false);
    expect(Number.isNaN(Number(key))).toBe(true);
  });

  it('no key of 300 random insertions, nor of 80 insertions at the very top, parses as JSON', () => {
    let seed = 20260924;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const keys = [initialOrderKey(0)];
    for (let i = 0; i < 300; i++) {
      const at = Math.floor(random() * (keys.length + 1));
      const key = orderKeyBetween(keys[at - 1] ?? null, keys[at] ?? null);
      expect(parsesAsJson(key), `${key} between ${keys[at - 1] ?? null} and ${keys[at] ?? null}`).toBe(false);
      keys.splice(at, 0, key);
    }
    for (let j = 1; j < keys.length; j++) expect(keys[j - 1]! < keys[j]!, `${keys[j - 1]} < ${keys[j]}`).toBe(true);
    let top = [initialOrderKey(0)];
    for (let i = 0; i < 80; i++) {
      const key = orderKeyBetween(null, top[0]!);
      expect(parsesAsJson(key), `${key} above ${top[0]}`).toBe(false);
      top = [key, ...top];
    }
    for (let j = 1; j < top.length; j++) expect(top[j - 1]! < top[j]!).toBe(true);
  });
});

describe('4.1-UNIT initialOrderKey', () => {
  it('is the fixture scheme for the first 36 siblings and keeps sorting beyond them', () => {
    expect(initialOrderKey(0)).toBe('a0');
    expect(initialOrderKey(9)).toBe('a9');
    expect(initialOrderKey(10)).toBe('aa');
    expect(initialOrderKey(35)).toBe('az');
    const keys = Array.from({ length: 200 }, (_, n) => initialOrderKey(n));
    for (let j = 1; j < keys.length; j++) expect(keys[j - 1]! < keys[j]!, `${keys[j - 1]} < ${keys[j]}`).toBe(true);
    expect(() => initialOrderKey(-1)).toThrow(RangeError);
  });
});

describe('4.1-UNIT sortByOrderKey and orderKeyForMove', () => {
  const rows = [
    { id: 'c', order_key: 'a2' },
    { id: 'a', order_key: 'a0' },
    { id: 'b', order_key: 'a1' },
    { id: 'd', order_key: 'a1' },
  ];

  it('sorts by key then id', () => {
    expect(sortByOrderKey(rows).map((r) => r.id)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('moves a row between the neighbours it lands between, null for a move to its own slot', () => {
    const sorted = sortByOrderKey([
      { id: 'a', order_key: 'a0' },
      { id: 'b', order_key: 'a1' },
      { id: 'c', order_key: 'a2' },
      { id: 'd', order_key: 'a3' },
    ]);
    const first = orderKeyForMove(sorted, 'c', 0);
    expect(first !== null && first < 'a0').toBe(true);
    const last = orderKeyForMove(sorted, 'a', 3);
    expect(last !== null && last > 'a3').toBe(true);
    const middle = orderKeyForMove(sorted, 'a', 1);
    expect(middle !== null && middle > 'a1' && middle < 'a2').toBe(true);
    const clamped = orderKeyForMove(sorted, 'a', 99);
    expect(clamped !== null && clamped > 'a3').toBe(true);
    expect(orderKeyForMove(sorted, 'a', 0)).toBeNull();
    expect(orderKeyForMove(sorted, 'd', 3)).toBeNull();
    expect(() => orderKeyForMove(sorted, 'zz', 0)).toThrow(RangeError);
  });

  it('lands after a run of equal keys instead of throwing', () => {
    const sorted = sortByOrderKey(rows);
    const key = orderKeyForMove(sorted, 'a', 1);
    expect(key !== null && key > 'a1' && key < 'a2').toBe(true);
  });
});

describe('4.3-UNIT orderKeyAfter', () => {
  it('lands right under the named row, before the next sibling', () => {
    const sorted = sortByOrderKey([
      { id: 'a', order_key: 'a0' },
      { id: 'b', order_key: 'a1' },
      { id: 'c', order_key: 'a2' },
    ]);
    const underA = orderKeyAfter(sorted, 'a');
    expect(underA > 'a0' && underA < 'a1').toBe(true);
    const underC = orderKeyAfter(sorted, 'c');
    expect(underC > 'a2').toBe(true);
    expect(() => orderKeyAfter(sorted, 'zz')).toThrow(RangeError);
  });

  it('skips a run of equal keys instead of throwing, at the end of the list too', () => {
    const sorted = sortByOrderKey([
      { id: 'a', order_key: 'a0' },
      { id: 'b', order_key: 'a1' },
      { id: 'd', order_key: 'a1' },
      { id: 'c', order_key: 'a2' },
    ]);
    for (const id of ['b', 'd']) {
      const key = orderKeyAfter(sorted, id);
      expect(key > 'a1' && key < 'a2', `${key} under ${id}`).toBe(true);
    }
    const tail = sortByOrderKey([
      { id: 'a', order_key: 'a1' },
      { id: 'b', order_key: 'a1' },
    ]);
    expect(orderKeyAfter(tail, 'a') > 'a1').toBe(true);
  });
});
