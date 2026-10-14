// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { pointerGesture, type GesturePointerEvent } from './pointer-gesture.ts';

/** A pointer event on an element whose capture is recorded (or throws, as a synthetic pointer's can). */
function event(pointerId: number, clientX: number, clientY: number, capture: (id: number) => void = () => undefined): GesturePointerEvent {
  return { pointerId, clientX, clientY, currentTarget: { setPointerCapture: capture } as unknown as HTMLElement };
}

const client = (e: { clientX: number; clientY: number }) => ({ x: e.clientX, y: e.clientY });

describe('pointerGesture', () => {
  it('tracks a pointer from down to up, in the coordinates it is given, and captures it', () => {
    const capture = vi.fn();
    const g = pointerGesture({ tapSlop: 8, coords: (e) => ({ x: e.clientX - 100, y: e.clientY - 50 }) });
    expect(g.down(event(1, 110, 60, capture))).toEqual({ x: 10, y: 10, startX: 10, startY: 10 });
    expect(capture).toHaveBeenCalledWith(1);
    expect(g.size).toBe(1);
    expect(g.move(event(1, 120, 70))).toEqual({ x: 20, y: 20, startX: 10, startY: 10 });
    expect(g.first()).toEqual({ x: 20, y: 20, startX: 10, startY: 10 });
    expect(g.up(event(1, 120, 70))).not.toBeNull();
    expect(g.size).toBe(0);
    expect(g.first()).toBeUndefined();
  });

  it('ignores a pointer it does not track', () => {
    const g = pointerGesture({ tapSlop: 8, coords: client });
    expect(g.move(event(7, 0, 0))).toBeNull();
    expect(g.up(event(7, 0, 0))).toBeNull();
  });

  it('keeps tracking a pointer whose capture throws', () => {
    const g = pointerGesture({ tapSlop: 8, coords: client });
    g.down(
      event(1, 0, 0, () => {
        throw new Error('not capturable');
      }),
    );
    expect(g.size).toBe(1);
  });

  it('says a pointer left its tap once it moved further than the slop from where it went down', () => {
    const g = pointerGesture({ tapSlop: 10, coords: client });
    g.down(event(1, 0, 0));
    expect(g.beyondSlop(g.move(event(1, 6, 8))!)).toBe(false);
    expect(g.beyondSlop(g.move(event(1, 6, 8.1))!)).toBe(true);
    // Back at the start: within the slop again (each user decides whether a tap stays lost).
    expect(g.beyondSlop(g.move(event(1, 0, 0))!)).toBe(false);
  });

  it('gives the spread and midpoint of the first two pointers', () => {
    const g = pointerGesture({ tapSlop: 8, coords: client });
    g.down(event(1, 0, 0));
    expect(g.pinch()).toBeNull();
    expect(g.spread()).toBe(0);
    g.down(event(2, 30, 40));
    expect(g.pinch()).toEqual({ spread: 50, midX: 15, midY: 20 });
    g.move(event(2, 60, 80));
    expect(g.spread()).toBe(100);
    g.up(event(1, 0, 0));
    expect(g.pinch()).toBeNull();
    g.clear();
    expect(g.size).toBe(0);
  });
});
