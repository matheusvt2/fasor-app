import { act, cleanup, render, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OVERLAY_KEY, POSITION_KEY, startOverlayHistory, stopOverlayHistory, useOverlayHistory } from './overlay-history.ts';

/*
 * Story 29.2, batch e28r (wave review S1, S2): the overlay entries of `overlay-history.ts` on a
 * history of the test's own. `FakeHistory` keeps the entries and the index like a browser: a push
 * drops the entries after the current one, and `back`/`forward` traverse one task later and fire
 * `popstate` (none when there is nowhere to go, as `back()` on the first entry). A "router" here is
 * a plain push or replace with React Router's own state shape (`key`, `idx`, `usr`).
 */

interface Entry {
  state: unknown;
  url: string;
}

class FakeHistory {
  entries: Entry[];
  index = 0;
  scrollRestoration: ScrollRestoration = 'auto';

  constructor(state: unknown = null) {
    this.entries = [{ state, url: '/' }];
  }

  get state(): unknown {
    return this.entries[this.index]!.state;
  }

  get length(): number {
    return this.entries.length;
  }

  pushState(state: unknown, _unused: string, url?: string | URL | null): void {
    this.entries.splice(this.index + 1);
    this.entries.push({ state: structuredClone(state), url: url === undefined || url === null ? this.entries[this.index]!.url : String(url) });
    this.index += 1;
  }

  replaceState(state: unknown, _unused: string, url?: string | URL | null): void {
    this.entries[this.index] = { state: structuredClone(state), url: url === undefined || url === null ? this.entries[this.index]!.url : String(url) };
  }

  go(delta: number): void {
    setTimeout(() => {
      const target = this.index + delta;
      if (target < 0 || target >= this.entries.length) return;
      this.index = target;
      window.dispatchEvent(new PopStateEvent('popstate', { state: this.state }));
    }, 0);
  }

  back(): void {
    this.go(-1);
  }

  forward(): void {
    this.go(1);
  }
}

let history: FakeHistory;
let closed: string[];

function install(initial: unknown = { key: 'p', idx: 0, usr: null }): void {
  history = new FakeHistory(initial);
  Object.defineProperty(window, 'history', { configurable: true, value: history });
  startOverlayHistory();
}

/** A router push of screen `key` (React Router's state shape). */
function routerPush(key: string, url = `/${key}`): void {
  window.history.pushState({ key, idx: history.index + 1, usr: null }, '', url);
}

/** Every pending traversal and deferred push, in order. */
async function flush(): Promise<void> {
  for (let round = 0; round < 12; round += 1) {
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }
}

/** An overlay mounted while open; `unmount` is any close but a back (Escape, a tap outside, a button). */
function overlay(name: string) {
  return renderHook(() => useOverlayHistory(() => closed.push(name)));
}

const key = () => (history.state as { key?: string }).key;
const token = (index = history.index) => (history.entries[index]!.state as Record<string, unknown>)[OVERLAY_KEY];
const positions = () => history.entries.map((entry) => (entry.state as Record<string, unknown>)[POSITION_KEY]);

beforeEach(() => {
  closed = [];
});

afterEach(() => {
  cleanup();
  stopOverlayHistory();
});

describe('29.2 e28r overlay history entries', () => {
  it('gives the opening entry its position and each push the next one', async () => {
    install();
    routerPush('s');
    const dialog = overlay('dialog');
    await flush();
    expect(positions()).toEqual([0, 1, 2]);
    expect(token(2)).toEqual(expect.any(String));
    expect((history.state as { key: string }).key).toBe('s');
    dialog.unmount();
  });

  it('a back from an open overlay closes it and nothing else', async () => {
    install();
    routerPush('s');
    overlay('dialog');
    await flush();
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(history.index).toBe(1);
    expect(key()).toBe('s');
  });

  // (1) S1: Fotos, the photo viewer, its "Remover" confirm, "Cancelar", then "Fechar".
  it('(1) after a nested pair is closed without back, one back leaves the screen', async () => {
    install();
    routerPush('g');
    const viewer = overlay('viewer');
    await flush();
    const confirm = overlay('confirm');
    await flush();
    expect(history.length).toBe(4);
    confirm.unmount();
    viewer.unmount();
    history.back();
    await flush();
    expect(history.index).toBe(0);
    expect(key()).toBe('p');
    expect(closed).toEqual([]);
  });

  it('(1) with the viewer still open over its closed confirm, one back closes the viewer and the screen stays', async () => {
    install();
    routerPush('g');
    overlay('viewer');
    await flush();
    const confirm = overlay('confirm');
    await flush();
    confirm.unmount();
    history.back();
    await flush();
    expect(closed).toEqual(['viewer']);
    expect(history.index).toBe(1);
    expect(key()).toBe('g');
  });

  // (2) S2: the Sumário's menu closed by a tap outside, a ficha opened, back, forward.
  it('(2) back then forward across a released entry: back lands on the screen, forward on the ficha', async () => {
    install();
    routerPush('s');
    const menu = overlay('menu');
    await flush();
    menu.unmount();
    routerPush('f');
    expect(positions()).toEqual([0, 1, 2, 3]);
    history.back();
    await flush();
    expect(key()).toBe('s');
    expect(history.index).toBe(1);
    history.forward();
    await flush();
    expect(key()).toBe('f');
    expect(history.index).toBe(3);
  });

  // (3) `back()` on the first entry fires no pop, so the skip it started must not swallow a later press.
  it('(3) a released entry at index 0: the skip that moves nothing leaves the next presses alone', async () => {
    install({ key: 'x', idx: 0, usr: null, [OVERLAY_KEY]: 'before-a-reload-1' });
    routerPush('a');
    history.back();
    await flush();
    expect(history.index).toBe(0);
    history.forward();
    await flush();
    expect(history.index).toBe(1);
    expect(key()).toBe('a');
    const dialog = overlay('dialog');
    await flush();
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(history.index).toBe(1);
    dialog.unmount();
    routerPush('b');
    history.back();
    await flush();
    expect(key()).toBe('a');
    expect(history.index).toBe(1);
  });

  // (4) A menu item that opens a dialog: the menu unmounts and the dialog mounts in one commit, or later.
  it('(4) the menu closes then the dialog opens in the same tick: the dialog takes the menu\'s entry over', async () => {
    install();
    routerPush('s');
    const menu = overlay('menu');
    await flush();
    act(() => {
      menu.unmount();
      overlay('dialog');
    });
    await flush();
    expect(history.length).toBe(3);
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(key()).toBe('s');
    expect(history.index).toBe(1);
  });

  it('(4) the dialog opens then the menu closes in the same tick: the same one entry', async () => {
    install();
    routerPush('s');
    const menu = overlay('menu');
    await flush();
    act(() => {
      overlay('dialog');
      menu.unmount();
    });
    await flush();
    expect(history.length).toBe(3);
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(history.index).toBe(1);
  });

  it('(4) the menu unmounts only after the dialog pushed: one back still closes the dialog and keeps the screen', async () => {
    install();
    routerPush('s');
    const menu = overlay('menu');
    await flush();
    overlay('dialog');
    await flush();
    menu.unmount();
    expect(history.length).toBe(4);
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(key()).toBe('s');
    expect(history.index).toBe(1);
  });

  // (5) An overlay's action opens a screen while the overlay is still open.
  it('(5) a router push over an open overlay that stays mounted: back returns to it, open', async () => {
    install();
    routerPush('s');
    overlay('dialog');
    await flush();
    routerPush('f');
    history.back();
    await flush();
    expect(closed).toEqual([]);
    expect(history.index).toBe(2);
    expect(token()).toEqual(expect.any(String));
  });

  it('(5) a router push over an overlay that unmounts with the screen: back lands on the screen under it', async () => {
    install();
    routerPush('s');
    const dialog = overlay('dialog');
    await flush();
    routerPush('f');
    dialog.unmount();
    history.back();
    await flush();
    expect(history.index).toBe(1);
    expect(key()).toBe('s');
  });

  // (6) StrictMode mounts, unmounts and remounts the overlay in one task.
  it('(6) mount, unmount and remount within one task push one entry', async () => {
    install();
    routerPush('s');
    function Probe() {
      useOverlayHistory(() => closed.push('dialog'));
      return null;
    }
    render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    await flush();
    expect(history.length).toBe(3);
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(history.index).toBe(1);
  });

  // (7) React Router replaces the entry an overlay owns (a search parameter written with `replace`).
  it('(7) a router replace that keeps the address keeps the overlay\'s entry: after Escape one back leaves the screen', async () => {
    install();
    routerPush('s');
    const dialog = overlay('dialog');
    await flush();
    const owned = token(2);
    window.history.replaceState({ key: 's2', idx: 1, usr: { kept: true } }, '');
    expect(token(2)).toBe(owned);
    expect(positions()).toEqual([0, 1, 2]);
    dialog.unmount();
    history.back();
    await flush();
    expect(history.index).toBe(0);
    expect(key()).toBe('p');
  });

  it('(7) a router replace that changes the address leaves a plain entry at the same place: back closes the overlay', async () => {
    install();
    routerPush('s');
    overlay('dialog');
    await flush();
    window.history.replaceState({ key: 't', idx: 1, usr: null }, '', '/elsewhere');
    expect(token(2)).toBeUndefined();
    expect(positions()).toEqual([0, 1, 2]);
    history.back();
    await flush();
    expect(closed).toEqual(['dialog']);
    expect(history.index).toBe(1);
    expect(key()).toBe('s');
  });
});
