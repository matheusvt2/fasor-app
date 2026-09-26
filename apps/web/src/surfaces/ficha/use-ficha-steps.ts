import { stepMayCollapse, type SheetProgress, type SheetStep } from '@app/domain';
import { useCallback, useState } from 'react';
import { LIST_FOCUS_WATCH_FRAMES } from '../../input/focus-restore.ts';
import { isPointerModality } from '../../input/press-hold.ts';
import { firstFocusable } from './ficha-fields.tsx';

export function isSheetStep(value: string | null): value is SheetStep {
  return value === 'placa' || value === 'verificacoes' || value === 'ensaios' || value === 'conclusao';
}

/** The element inside a missing-field marker that takes the focus. */
function focusableIn(element: HTMLElement): HTMLElement {
  return firstFocusable(element) ?? element;
}

/** After the menu or the dialog that triggered it has handed its focus back, `run` once the DOM holds the change. */
function afterFrames(run: () => void, frames = 3): void {
  let left = frames;
  const tick = () => {
    if (--left <= 0) run();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export interface FichaSteps {
  current: SheetStep;
  /** A focus arriving in `step`: leaving the previous step only when it came from the keyboard. */
  focusIn: (step: SheetStep) => void;
  stepClass: (step: SheetStep) => string;
  /** Scrolls to a step and expands it; with `missing`, focuses its first missing field. */
  goTo: (step: SheetStep, missing: boolean) => void;
}

export function useFichaSteps(progress: SheetProgress): FichaSteps {
  // --- the steps: the current one, the ones left complete (collapsed), the jump -----------
  // D-2 (`source-deltas.md` 2026-09-24): a complete section collapses when the engineer
  // leaves it (a stepper tap, or the keyboard -- Tab, the Enter run -- moving the focus into
  // another section), never in reaction to a tap: a pointer focus arriving in another
  // section makes it current but leaves the previous one open, and a section holding a
  // reading out of its criterion never collapses (`stepMayCollapse`, the kernel's rule).
  const [current, setCurrentStep] = useState<SheetStep>(() => progress.firstIncompleteStep ?? 'placa');
  const [left, setLeft] = useState<ReadonlySet<SheetStep>>(() => new Set());
  const setCurrent = useCallback(
    (step: SheetStep, leaving: boolean) => {
      if (step === current) return;
      setLeft((before) => {
        const after = new Set(before);
        after.delete(step);
        if (leaving) after.add(current);
        return after;
      });
      setCurrentStep(step);
    },
    [current],
  );

  /** A focus arriving in `step`: leaving the previous step only when it came from the keyboard. */
  const focusIn = (step: SheetStep) => setCurrent(step, !isPointerModality());
  const collapsed = (step: SheetStep) => step !== current && left.has(step) && stepMayCollapse(progress, step);

  /** Scrolls to a step and expands it; with `missing`, focuses its first missing field. */
  const goTo = (step: SheetStep, missing: boolean) => {
    setCurrent(step, true);
    const hostOf = () => document.getElementById(`ficha-step-${step}`);
    // The first marker drawn now (a TTR table and its phone cards both carry one; CSS shows one).
    const markerIn = (host: HTMLElement) => (missing ? ([...host.querySelectorAll<HTMLElement>('[data-missing-field]')].find((element) => element.getClientRects().length > 0) ?? null) : null);
    /** What the land (or the watch below) last gave the focus to. */
    let landed: HTMLElement | null = null;
    const land = () => {
      const host = hostOf();
      if (host === null) return;
      host.scrollIntoView?.({ block: 'start' });
      const marker = markerIn(host);
      landed = marker === null ? host : focusableIn(marker);
      landed.focus({ preventScroll: marker === null });
    };
    afterFrames(land);
    // A menu that closed on the action hands its focus back to its trigger on its own
    // schedule; land again only if that is where the focus went (never over a control the
    // engineer moved to in the meantime).
    afterFrames(() => {
      const active = document.activeElement;
      if (active === null || active === document.body || active.matches('.overflow-trigger')) land();
    }, 12);
    // E6-Q6: the sheet can be drawn from rows older than the ones "Concluir ficha" read (the
    // value committed just before it -- "Com restrições" asking for the observation --
    // reaches the sheet on the live query's own schedule), so the land may fall on the step
    // or on a marker that is already answered. Until the person does something, the focus
    // follows the first missing field as the sheet catches up, from wherever the land left
    // it (the step, that stale marker, the body, the menu's trigger), never from a control
    // they moved to.
    if (missing) {
      let interacted = false;
      const stop = () => {
        interacted = true;
      };
      const events = ['pointerdown', 'keydown'] as const;
      for (const type of events) document.addEventListener(type, stop, { capture: true });
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (interacted || frames > LIST_FOCUS_WATCH_FRAMES) {
          for (const type of events) document.removeEventListener(type, stop, { capture: true });
          return;
        }
        const host = hostOf();
        const marker = host === null || landed === null ? null : markerIn(host);
        if (host !== null && marker !== null) {
          const target = focusableIn(marker);
          const active = document.activeElement;
          const stillLanding = active === null || active === document.body || !active.isConnected || active === host || active === landed || active.matches('.overflow-trigger');
          if (active !== target && stillLanding) {
            landed = target;
            target.focus();
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  };

  const stepClass = (step: SheetStep) => (collapsed(step) ? 'ficha-step is-collapsed' : 'ficha-step');
  return { current, focusIn, stepClass, goTo };
}
