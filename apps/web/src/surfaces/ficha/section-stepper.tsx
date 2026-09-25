import { SHEET_STEPS, stepMissingLabel, type SheetProgress, type SheetStep } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';

/** The steps the stepper draws, all four; the Sheet header names only these (`sheetSummaryText`). */
export const STEPPER_STEPS: readonly SheetStep[] = SHEET_STEPS;

/**
 * The Section stepper (UX-DR35, `60-ficha.html` `.section-stepper`): the four steps with
 * their missing counts, the current one `aria-current="step"`, each a button named "Placa,
 * 2 faltando" that scrolls to its section and expands it. Not a wizard: every step is
 * reachable at any time. A step with nothing missing shows the stylesheet's check.
 */
export function SectionStepper({ progress, current, onGo }: { progress: SheetProgress; current: SheetStep; onGo: (step: SheetStep) => void }) {
  const t = copy.ficha;
  return (
    <div className="section-stepper" role="group" aria-label={t.stepperLabel}>
      {STEPPER_STEPS.map((step) => {
        const missing = progress.steps[step].missing;
        const name = t.steps[step];
        return (
          <button
            key={step}
            type="button"
            className="step seg"
            data-step={step}
            data-missing={missing}
            aria-current={current === step ? 'step' : undefined}
            aria-label={stepMissingLabel(name.long, missing)}
            onClick={() => onGo(step)}
          >
            <span className="step-name">
              <span className="long">{name.long}</span>
              <span className="short">{name.short}</span>
            </span>
            <span className="step-count">
              <span className="n">{missing}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
