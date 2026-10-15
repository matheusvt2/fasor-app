import { afterEach, describe, expect, it, vi } from 'vitest';
import { plateFocusTarget, plateScopeOf, watchPlateFocus } from './plate-focus.ts';

/*
 * Story 14.10 lane B: where the focus goes after a plate shot, in the nameplate section: the
 * pending shot's waiting line, then the stored row's, then its tile, then the crop.
 */

function section(html: string): HTMLElement {
  const element = document.createElement('section');
  element.id = 'ficha-nameplate';
  element.innerHTML = html;
  document.body.append(element);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('14.10 plateFocusTarget', () => {
  it('prefers the pending row waiting line, then the stored row line, then its tile, then the crop', () => {
    const scope = section(`
      <div class="photo-row ficha-np-photo"><button class="photo-tile"></button><p class="reading-line" tabindex="-1">Lendo…</p></div>
      <div class="photo-row ficha-np-photo" data-pending-shot=""><span class="photo-tile"></span><p class="reading-line" tabindex="-1" id="pending">Lendo…</p></div>
    `);
    expect(plateFocusTarget(scope)?.id).toBe('pending');
    scope.querySelector('[data-pending-shot]')!.remove();
    expect(plateFocusTarget(scope)?.matches('.reading-line')).toBe(true);
    scope.querySelector('.reading-line')!.remove();
    expect(plateFocusTarget(scope)?.matches('button.photo-tile')).toBe(true);
    scope.querySelector('.ficha-np-photo')!.remove();
    expect(plateFocusTarget(scope)).toBeNull();
    scope.insertAdjacentHTML('beforeend', '<button type="button" class="plate-crop-open"></button>');
    expect(plateFocusTarget(scope)?.matches('.plate-crop-open')).toBe(true);
  });

  it('never picks a line that is not a waiting line (no tabindex), and finds the section from inside it', () => {
    const scope = section('<div class="photo-row ficha-np-photo"><button class="photo-tile"></button><p class="reading-line" role="status">Nada foi lido nesta foto</p></div>');
    expect(plateFocusTarget(scope)?.matches('button.photo-tile')).toBe(true);
    expect(plateScopeOf(scope.querySelector('.photo-tile'))).toBe(scope);
    expect(plateFocusTarget(null)).toBeNull();
  });
});

describe('14.10 watchPlateFocus', () => {
  /** Frames are run one at a time by hand, as in `focus-restore.test.ts`. */
  function stubFrames(): () => number {
    let frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    return () => {
      const due = frames;
      frames = [];
      for (const callback of due) callback(0);
      return frames.length;
    };
  }

  it('takes a lost focus to the waiting line, and leaves a later loss alone once the focus was moved to another control', () => {
    const frame = stubFrames();
    const scope = section('<div class="photo-row ficha-np-photo"><button class="photo-tile"></button><p class="reading-line" tabindex="-1">Lendo…</p></div>');
    const line = scope.querySelector<HTMLElement>('.reading-line')!;
    const tile = document.createElement('button');
    document.body.append(tile);
    watchPlateFocus(scope);
    frame();
    expect(document.activeElement).toBe(line);
    // The user opens the Photo viewer from a strip tile; the viewer closing drops the focus to <body>.
    tile.focus();
    expect(frame()).toBe(0);
    tile.blur();
    frame();
    // 11.11-E2E-001: the viewer's own restore gives the tile back; the plate watch ended and takes nothing.
    expect(document.activeElement).toBe(document.body);
  });
});
