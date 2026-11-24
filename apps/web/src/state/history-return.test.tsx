import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { keepSumarioView, keptSumarioView, returnArrival, returnToOrigin, useEntryOrigins } from './history-return.ts';

/*
 * Fix batch e28w (S2, N2 of the pass of 2026-11-23): the Sumário's view kept by history entry, and the origin of each
 * pushed entry that lets the in-app "Voltar" step back. The browser half (a real back, the scroll) is
 * `e2e/overlay-back.spec.ts` e28w-E2E-001 to 004.
 */

describe('the Sumário view kept by history entry', () => {
  it('reads back what was kept for the entry and the relatório, a copy; another entry or relatório reads nothing', () => {
    const locals = new Map([['loc-1', true]]);
    keepSumarioView('entry-a', 'rel-1', { section9: true, locals });
    locals.set('loc-2', true);
    expect(keptSumarioView('entry-a', 'rel-1')).toEqual({ section9: true, locals: new Map([['loc-1', true]]) });
    expect(keptSumarioView('entry-b', 'rel-1')).toBeNull();
    expect(keptSumarioView('entry-a', 'rel-2')).toBeNull();
  });

  it('keeps nothing under the router\'s "default" key, which every entry it did not create shares', () => {
    keepSumarioView('default', 'rel-1', { section9: true, locals: new Map() });
    expect(keptSumarioView('default', 'rel-1')).toBeNull();
  });

  it('keeps at most 64 entries, the oldest going first', () => {
    for (let i = 0; i < 70; i++) keepSumarioView(`bounded-${i}`, 'rel-b', { section9: i % 2 === 0, locals: new Map() });
    expect(keptSumarioView('bounded-0', 'rel-b')).toBeNull();
    expect(keptSumarioView('bounded-69', 'rel-b')).toEqual({ section9: false, locals: new Map() });
  });
});

function harness() {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/relatorio/r1']}>{children}</MemoryRouter>;
  return renderHook(
    () => {
      useEntryOrigins();
      return { location: useLocation(), navigate: useNavigate() };
    },
    { wrapper },
  );
}

describe('the origin of a pushed entry', () => {
  it('a ficha pushed from the Sumário steps back to it, with the arrival state its push would have carried', () => {
    const { result } = harness();
    act(() => void result.current.navigate('/relatorio/r1/ficha/b1'));
    const state = { openSection9: true, focusBlockId: 'b1' };
    expect(returnToOrigin(result.current.location.key, '/relatorio/r1', state)).toBe(true);
    expect(returnArrival('/relatorio/r1')).toBe(state);
    // Pure: a second read (StrictMode's second render) reads the same.
    expect(returnArrival('/relatorio/r1')).toBe(state);
    expect(returnArrival('/relatorio/r2')).toBeNull();
    act(() => void result.current.navigate(-1));
    expect(result.current.location.pathname).toBe('/relatorio/r1');
    // Read by the screen's render, then ended.
    expect(returnArrival('/relatorio/r1')).toBeNull();
  });

  it('a replace keeps the origin; another origin or an address not pushed from navigates as before', () => {
    const { result } = harness();
    act(() => void result.current.navigate('/relatorio/r1/ficha/b1'));
    act(() => void result.current.navigate('/relatorio/r1/ficha/b1?etapa=2', { replace: true }));
    expect(returnToOrigin(result.current.location.key, '/relatorio/r1', null)).toBe(true);
    act(() => void result.current.navigate('/relatorio/r1/ficha/b2'));
    expect(returnToOrigin(result.current.location.key, '/relatorio/r1', null)).toBe(false);
    expect(returnToOrigin('never-pushed', '/relatorio/r1', null)).toBe(false);
  });
});
