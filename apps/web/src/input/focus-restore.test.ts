import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreFocus } from './focus-restore.ts';

/*
 * E14-A7: the `until: 'moved'` watch of `restoreFocus` (the camera's return to its opener).
 * Frames are run one at a time by hand, so each step says what one frame of the watch does.
 */

let frames: FrameRequestCallback[] = [];

/** Runs the frames queued so far (one frame of the watch). */
function frame(): void {
  const due = frames;
  frames = [];
  for (const callback of due) callback(0);
}

function button(name: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.textContent = name;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('restoreFocus until moved', () => {
  it('gives the target the focus when the focus was lost', () => {
    const target = button('opener');
    restoreFocus(() => target, { frames: 10, until: 'moved' });
    expect(document.activeElement).toBe(document.body);
    frame();
    expect(document.activeElement).toBe(target);
  });

  it('takes the focus back when a re-render drops it to <body> after the target held it (E6-Q6)', () => {
    const target = button('opener');
    restoreFocus(() => target, { frames: 10, until: 'moved' });
    frame();
    expect(document.activeElement).toBe(target);
    frame();
    target.blur();
    expect(document.activeElement).toBe(document.body);
    frame();
    expect(document.activeElement).toBe(target);
    expect(frames).toHaveLength(1);
  });

  it('ends the watch once another control holds the focus, and leaves a later loss alone', () => {
    const target = button('opener');
    const other = button('dialog opener');
    restoreFocus(() => target, { frames: 10, until: 'moved' });
    frame();
    expect(document.activeElement).toBe(target);
    other.focus();
    frame();
    expect(document.activeElement).toBe(other);
    // The watch ended: no frame is left, so a loss now (the dialog closing) is not the target's.
    expect(frames).toHaveLength(0);
    other.blur();
    frame();
    expect(document.activeElement).toBe(document.body);
  });

  it('does not end the watch while the target is not there yet', () => {
    const other = button('shutter');
    other.focus();
    let target: HTMLButtonElement | null = null;
    restoreFocus(() => target, { frames: 10, until: 'moved' });
    frame();
    expect(frames).toHaveLength(1);
    other.remove();
    target = button('opener');
    frame();
    expect(document.activeElement).toBe(target);
  });

  it('keeps watching whatever holds the focus without the option (the default is unchanged)', () => {
    const target = button('opener');
    const other = button('dialog opener');
    restoreFocus(() => target, { frames: 10 });
    frame();
    other.focus();
    frame();
    expect(frames).toHaveLength(1);
    other.blur();
    frame();
    expect(document.activeElement).toBe(target);
  });
});
