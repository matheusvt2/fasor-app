import { composerView, standardTemplate } from '@app/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRESS_AND_HOLD_MS } from '../../input/use-press-and-hold.ts';
import { SectionList } from './section-list.tsx';

/*
 * The touch path of reorder (EXPERIENCE.md › Interaction Primitives): press and hold the
 * drag handle 300 ms, then drag. The e2e suite drags with a mouse only, so the touch hold
 * is exercised here with fake timers over the section cards, each laid out 60 px apart.
 */

const sections = composerView(standardTemplate({ id: '019966b0-0039-7000-8000-000000000001' })).sections;
const ROW = 60;

function renderList(onMove = vi.fn(async () => undefined)) {
  render(<SectionList sections={sections} onMove={onMove} onAddBelow={vi.fn()} onDuplicate={vi.fn()} onRemove={vi.fn()} />);
  // jsdom lays nothing out: give each card the box a real list would have.
  screen
    .getByRole('list', { name: 'Blocos do template' })
    .querySelectorAll<HTMLElement>(':scope > li')
    .forEach((li, i) => {
      li.getBoundingClientRect = () => ({ top: i * ROW, bottom: i * ROW + ROW - 8, left: 0, right: 600, width: 600, height: ROW - 8, x: 0, y: i * ROW, toJSON: () => ({}) });
    });
  return onMove;
}

const touch = (clientY: number) => ({ button: 0, pointerId: 7, pointerType: 'touch', clientX: 10, clientY });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reorder by touch: press and hold, then drag', () => {
  it('a hold past 300 ms arms the drag; the drop moves the card to where it lands', () => {
    const onMove = renderList();
    const handle = screen.getByRole('button', { name: 'Reordenar 1 Objetivo' });
    fireEvent.pointerDown(handle, touch(20));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS + 10));
    const card = handle.closest('li')!;
    expect(card).toHaveClass('is-dragging');
    // Down past the centres of the next two cards: it lands third.
    fireEvent.pointerMove(handle, touch(20 + 2 * ROW + 10));
    fireEvent.pointerUp(handle, touch(20 + 2 * ROW + 10));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(sections[0], 2);
    expect(card).not.toHaveClass('is-dragging');
  });

  it('movement before the 300 ms threshold is a scroll: no drag, no move', () => {
    const onMove = renderList();
    const handle = screen.getByRole('button', { name: 'Reordenar 1 Objetivo' });
    fireEvent.pointerDown(handle, touch(20));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS - 100));
    fireEvent.pointerMove(handle, touch(20 + ROW));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS));
    expect(handle.closest('li')).not.toHaveClass('is-dragging');
    fireEvent.pointerUp(handle, touch(20 + 3 * ROW));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('a drag that loses its pointer capture ends where it started, with no move', () => {
    const onMove = renderList();
    const handle = screen.getByRole('button', { name: 'Reordenar 1 Objetivo' });
    fireEvent.pointerDown(handle, touch(20));
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS + 10));
    fireEvent.pointerMove(handle, touch(20 + 2 * ROW));
    fireEvent.lostPointerCapture(handle, touch(20 + 2 * ROW));
    const card = handle.closest('li')!;
    expect(card).not.toHaveClass('is-dragging');
    expect(card.style.transform).toBe('');
    fireEvent.pointerUp(handle, touch(20 + 2 * ROW));
    expect(onMove).not.toHaveBeenCalled();
  });
});
