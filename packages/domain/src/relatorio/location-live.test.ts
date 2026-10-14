import { describe, expect, it } from 'vitest';
import { hiddenLocationIds, liveLocationIds } from './location-live.ts';

/*
 * 14.2-UNIT, second pass (rule 1): the one liveness rule of a location. A row is live when
 * it is not removed and no row above it is.
 */

const T = '2026-10-13T12:00:00.000Z';
const row = (id: string, parent_id: string | null, removed_at: string | null = null) => ({ id, parent_id, removed_at });

describe('14.2-UNIT liveLocationIds', () => {
  it('keeps a row that is not removed and has no removed row above it, at any depth', () => {
    const rows = [row('local', null), row('painel', 'local'), row('coluna', 'painel'), row('nicho', 'coluna'), row('outro', null)];
    expect([...liveLocationIds(rows)].sort()).toEqual(['coluna', 'local', 'nicho', 'outro', 'painel']);
    expect(hiddenLocationIds(rows).size).toBe(0);
  });

  it('a removed row takes every row under it, whatever their own removed_at; its siblings and the rows above stay', () => {
    const rows = [row('local', null), row('painel', 'local', T), row('coluna', 'painel'), row('nicho', 'coluna'), row('painel-2', 'local'), row('coluna-2', 'painel-2')];
    expect([...liveLocationIds(rows)].sort()).toEqual(['coluna-2', 'local', 'painel-2']);
    expect([...hiddenLocationIds(rows)].sort()).toEqual(['coluna', 'nicho', 'painel']);
    // The answer does not depend on the order the rows come in.
    expect([...liveLocationIds([...rows].reverse())].sort()).toEqual(['coluna-2', 'local', 'painel-2']);
  });

  it('an ancestor absent from the input is not "removed": the row under it stays live', () => {
    const rows = [row('coluna', 'never-pulled'), row('nicho', 'coluna')];
    expect([...liveLocationIds(rows)].sort()).toEqual(['coluna', 'nicho']);
    // The absent id is in neither set: nothing says it left.
    expect(hiddenLocationIds(rows).has('never-pulled')).toBe(false);
    expect(liveLocationIds(rows).has('never-pulled')).toBe(false);
  });

  it('a parent cycle terminates: its rows are live unless one of them is removed', () => {
    const cycle = [row('a', 'b'), row('b', 'a'), row('under', 'a')];
    expect([...liveLocationIds(cycle)].sort()).toEqual(['a', 'b', 'under']);
    const cut = [row('a', 'b'), row('b', 'a', T), row('under', 'a')];
    expect(liveLocationIds(cut).size).toBe(0);
    expect(liveLocationIds([row('self', 'self')]).has('self')).toBe(true);
  });
});
