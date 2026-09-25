import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ON_SCREEN_LEAVE_MARGIN_PX, useOnScreen } from './use-on-screen.ts';

/*
 * E5-A1: the checklist-on-screen flag that shows the Bulk action mirror in the Sticky
 * action bar. jsdom draws no layout, so the two IntersectionObservers are fakes the test
 * drives: the enter observer watches the viewport, the leave observer the viewport grown
 * by the margin. The loop it guards against: the mirror's own height moves the checklist
 * across a single boundary, which hid the mirror, which moved it back, every frame.
 */

interface FakeObserver {
  margin: string | undefined;
  fire: (isIntersecting: boolean) => void;
  disconnected: boolean;
}

let observers: FakeObserver[] = [];

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly record: FakeObserver;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        const record: FakeObserver = {
          margin: options?.rootMargin,
          fire: (isIntersecting) => callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
          disconnected: false,
        };
        this.record = record;
        observers.push(record);
      }
      observe() {}
      disconnect() {
        this.record.disconnected = true;
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(ref, id);
  return (
    <div ref={ref} data-testid="probe">
      {onScreen ? 'on' : 'off'}
    </div>
  );
}

const enter = () => observers.find((o) => o.margin === undefined && !o.disconnected)!;
const leave = () => observers.find((o) => o.margin === `${ON_SCREEN_LEAVE_MARGIN_PX}px` && !o.disconnected)!;

describe('useOnScreen', () => {
  it('turns on when the element enters the viewport and off only once it leaves the grown one', () => {
    render(<Probe id="a" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('off');

    act(() => enter().fire(true));
    expect(screen.getByTestId('probe')).toHaveTextContent('on');

    // The mirror's own shift takes the element just out of the viewport: still inside the
    // grown one, so the flag holds and the bar does not change back.
    act(() => enter().fire(false));
    act(() => leave().fire(true));
    expect(screen.getByTestId('probe')).toHaveTextContent('on');

    act(() => leave().fire(false));
    expect(screen.getByTestId('probe')).toHaveTextContent('off');

    // Near the viewport but not in it: the leave observer alone never turns it on.
    act(() => leave().fire(true));
    expect(screen.getByTestId('probe')).toHaveTextContent('off');
  });

  it('re-attaches both observers for another element key and disconnects on unmount', () => {
    const { rerender, unmount } = render(<Probe id="a" />);
    expect(observers).toHaveLength(2);
    rerender(<Probe id="b" />);
    expect(observers).toHaveLength(4);
    expect(observers.slice(0, 2).every((o) => o.disconnected)).toBe(true);
    unmount();
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });
});
