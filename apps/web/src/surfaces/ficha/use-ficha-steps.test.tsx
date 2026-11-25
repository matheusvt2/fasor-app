import type { SheetProgress, SheetStep } from '@app/domain';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFichaSteps, type FichaSteps } from './use-ficha-steps.ts';

/*
 * Story 30.5 (25.2-E2E-002, 12.1-E2E-012): the stepper's jump lands (scroll and focus on the step)
 * three animation frames after the tap, and again after twelve when the focus fell to the body.
 * A press or a key the person gives meanwhile is theirs: the land never takes the focus from the
 * field they tapped into, nor scrolls the page under it. No animation frame runs here by itself:
 * the test steps them one at a time, as a slow tablet's starved frames would.
 */

const counts = { missing: 0, outOfLimit: 0 };
const progress = { firstIncompleteStep: null, steps: { placa: counts, verificacoes: counts, ensaios: counts, conclusao: counts } } as unknown as SheetProgress;
const SHOWN: readonly SheetStep[] = ['placa', 'verificacoes', 'ensaios', 'conclusao'];

let frames: FrameRequestCallback[] = [];
/** Runs the animation frames asked for so far, `n` times over. */
function runFrames(n: number): void {
  for (let i = 0; i < n; i += 1) {
    const due = frames;
    frames = [];
    act(() => {
      for (const callback of due) callback(performance.now());
    });
  }
}

let steps: FichaSteps | null = null;
function Sheet() {
  steps = useFichaSteps(progress, SHOWN);
  return (
    <>
      <button type="button" onClick={() => steps!.goTo('ensaios', false)}>
        Ensaios
      </button>
      {SHOWN.map((step) => (
        <section key={step} id={`ficha-step-${step}`} tabIndex={-1} data-step={step}>
          <input aria-label={`campo ${step}`} />
        </section>
      ))}
    </>
  );
}

beforeEach(() => {
  frames = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Story 30.5: the stepper jump never takes the focus from a field tapped before it lands', () => {
  it('with nothing done meanwhile, the step takes the focus three frames after the tap (unchanged)', () => {
    render(<Sheet />);
    const tab = screen.getByRole('button', { name: 'Ensaios' });
    tab.focus();
    fireEvent.click(tab);
    runFrames(2);
    expect(tab).toHaveFocus();
    runFrames(1);
    expect(document.getElementById('ficha-step-ensaios')).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('a cell tapped and typed into before the land keeps the focus: "548" is never cut to "5"', () => {
    render(<Sheet />);
    const tab = screen.getByRole('button', { name: 'Ensaios' });
    tab.focus();
    fireEvent.click(tab);
    runFrames(1);
    const cell = screen.getByRole('textbox', { name: 'campo ensaios' });
    fireEvent.pointerDown(cell);
    cell.focus();
    fireEvent.keyDown(cell, { key: '5' });
    runFrames(15);
    expect(cell).toHaveFocus();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('a key given before the land keeps the focus where the key took it', () => {
    render(<Sheet />);
    const tab = screen.getByRole('button', { name: 'Ensaios' });
    tab.focus();
    fireEvent.click(tab);
    const cell = screen.getByRole('textbox', { name: 'campo placa' });
    fireEvent.keyDown(tab, { key: 'Tab' });
    cell.focus();
    runFrames(15);
    expect(cell).toHaveFocus();
  });

  it('a control given the focus before the land (the bulk bar\'s button) keeps it', () => {
    render(<Sheet />);
    const tab = screen.getByRole('button', { name: 'Ensaios' });
    tab.focus();
    fireEvent.click(tab);
    runFrames(1);
    const other = screen.getByRole('textbox', { name: 'campo verificacoes' });
    other.focus();
    runFrames(15);
    expect(other).toHaveFocus();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('a tap on no control before the late land (the focus on the body) is not followed by a land either', () => {
    render(<Sheet />);
    const tab = screen.getByRole('button', { name: 'Ensaios' });
    tab.focus();
    fireEvent.click(tab);
    runFrames(3);
    expect(document.getElementById('ficha-step-ensaios')).toHaveFocus();
    fireEvent.pointerDown(document.body);
    (document.activeElement as HTMLElement).blur();
    runFrames(12);
    expect(document.body).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
