import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ON_SCREEN_LEAVE_MARGIN_PX, stepOnScreen, testKeyOnScreen, useOnScreen } from './use-on-screen.ts';

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

describe('F-06 (review 2026-10-06) what is on screen starts below the sticky App bar', () => {
  /** A box from `top` to `bottom` in viewport px. */
  function at(element: Element, top: number, bottom: number) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top, bottom, height: bottom - top, left: 0, right: 390, width: 390, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
  }

  /** The App bar (0 to 56) and, under it, two steps and two test tables at the given boxes. */
  function page(): { root: HTMLElement; bar: HTMLElement; steps: HTMLElement[]; tables: HTMLElement[] } {
    const root = document.createElement('div');
    const bar = document.createElement('header');
    bar.className = 'app-bar';
    const verificacoes = document.createElement('section');
    verificacoes.id = 'ficha-step-verificacoes';
    verificacoes.dataset.step = 'verificacoes';
    const ensaios = document.createElement('section');
    ensaios.id = 'ficha-step-ensaios';
    ensaios.dataset.step = 'ensaios';
    const first = document.createElement('div');
    first.dataset.testKey = 'isolacao';
    const second = document.createElement('div');
    second.dataset.testKey = 'resistencia_contato';
    ensaios.append(first, second);
    root.append(bar, verificacoes, ensaios);
    document.body.append(root);
    return { root, bar, steps: [verificacoes, ensaios], tables: [first, second] };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a step whose visible part is all under the bar is not the one on screen', () => {
    const { bar, steps } = page();
    at(bar, 0, 56);
    // Verificações: 56 px in the viewport, all of them under the bar. Ensaios: 40 px below it.
    at(steps[0]!, -94, 56);
    at(steps[1]!, 56, 96);
    expect(stepOnScreen(document)).toBe('ensaios');
  });

  it('the table nearest the top is measured from the bar\'s bottom, and one hidden under the bar is skipped', () => {
    const { bar, tables, steps } = page();
    at(bar, 0, 56);
    at(steps[0]!, -500, -100);
    at(steps[1]!, -100, 800);
    // The first table sits entirely under the bar; the second starts just below it.
    at(tables[0]!, 10, 50);
    at(tables[1]!, 60, 400);
    expect(testKeyOnScreen(document)).toBe('resistencia_contato');
  });

  it('with the bar scrolled away (static, under 480 px of height) the page starts at 0', () => {
    const { bar, tables, steps } = page();
    at(bar, -300, -244);
    at(steps[0]!, -500, -100);
    at(steps[1]!, -100, 800);
    at(tables[0]!, 10, 50);
    at(tables[1]!, 60, 400);
    expect(testKeyOnScreen(document)).toBe('isolacao');
  });
});
