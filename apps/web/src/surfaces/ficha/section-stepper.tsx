import { stepMissingLabel, type SheetProgress, type SheetStep } from '@app/domain';
import { copy } from '../../copy/pt-br.ts';

/**
 * The Section stepper (UX-DR35, `60-ficha.html` `.section-stepper`): the shown steps (the
 * kernel's `shownSheetSteps`, E12-A7: an off sub-block's step is not drawn, and the Sheet
 * header names only these) with their missing counts, the current one `aria-current="step"`, each a button named "Placa,
 * 2 faltando" that scrolls to its section and expands it. Not a wizard: every step is
 * reachable at any time. A step with nothing missing shows the stylesheet's check.
 */
export function SectionStepper({
  steps,
  progress,
  current,
  titles = {},
  onGo,
}: {
  steps: readonly SheetStep[];
  progress: SheetProgress;
  current: SheetStep;
  /** Fix batch e24y (F10): a step the definition titles itself (`sheetStepTitle`: the v14 Malha's "Dados da malha"), long and short alike. */
  titles?: Partial<Record<SheetStep, string | null>>;
  onGo: (step: SheetStep) => void;
}) {
  const t = copy.ficha;
  return (
    <div className="section-stepper" role="group" aria-label={t.stepperLabel}>
      {steps.map((step) => {
        const missing = progress.steps[step].missing;
        const title = titles[step] ?? null;
        const name = title === null ? t.steps[step] : { long: title, short: title };
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
