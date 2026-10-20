import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PositionBox } from './reorder-controls.tsx';
import type { Reorder } from './use-reorder.ts';

/*
 * Fix R8E-E2E-002 (2026-10-20): the Position box selects its number on the frame after its
 * focus, and `select()` focuses an input. A Tab that left the box before that frame (keys
 * dispatch ahead of animation frames) must not be pulled back: the box selects only while it
 * still holds the focus.
 */

const reorder = { moveTo: vi.fn(async () => undefined) } as unknown as Reorder;
let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
});
afterEach(() => vi.restoreAllMocks());

function renderBox() {
  render(
    <>
      <PositionBox name="Objetivo" position={1} siblings={3} reorder={reorder} />
      <button type="button">Abrir</button>
    </>,
  );
  return { box: screen.getByRole('textbox') as HTMLInputElement, next: screen.getByRole('button', { name: 'Abrir' }) };
}

const runFrames = () => frames.splice(0).forEach((callback) => callback(0));

describe('PositionBox', () => {
  it('selects its number on the frame after the focus while it holds the focus', () => {
    const { box } = renderBox();
    const select = vi.spyOn(box, 'select');
    box.focus();
    runFrames();
    expect(select).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(box);
  });

  it('does not select, and so does not take the focus back, when the focus left before the frame', () => {
    const { box, next } = renderBox();
    const select = vi.spyOn(box, 'select');
    box.focus();
    next.focus();
    runFrames();
    expect(select).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(next);
  });
});
