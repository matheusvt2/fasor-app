import { SHEET_STEPS, sheetProgressState, sheetProgressText, sheetSummaryParts, type SheetProgress, type SheetStep } from '@app/domain';
import { OverflowMenu, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

/**
 * The Sheet header (UX-DR33, `key-equipment-sheet-v09.html` `.sheet-header`): type + TAG,
 * the TAG a 48 px text button that renames the equipment (its id kept); Cabine › Coluna;
 * the attribution lines once saved; the kernel's one sentence of progress
 * (`sheetSummaryParts`, "Placa e verificações prontas · faltam 9 leituras e a conclusão",
 * Story 12.5, J-14), which never blocks anything; and the sheet's Overflow. A sheet marked
 * not tested keeps its v0.8 Progress counter ("Completa"): nothing in it is counted.
 */
export function FichaHeader({
  typeName,
  tag,
  locationText,
  filledBy,
  concludedBy,
  progress,
  shown = SHEET_STEPS,
  menu,
  notTested = false,
  onRename,
}: {
  typeName: string;
  tag: string;
  locationText: string;
  filledBy: string | null;
  concludedBy: string | null;
  progress: SheetProgress;
  /** The steps the Section stepper shows; a step it does not show is never named. */
  shown?: readonly SheetStep[];
  menu: OverflowMenuAction[];
  /** `key-sheet-states.html` frame (a): the chip beside the TAG once the sheet is not tested. */
  notTested?: boolean;
  onRename: (() => void) | null;
}) {
  const t = copy.ficha;
  return (
    <div className="sheet-header">
      <div>
        <h2 className="sheet-title">
          {typeName}
          {tag === '' ? null : t.titleSeparator}
          {tag === '' ? null : onRename === null ? (
            <span className="tag-btn">{tag}</span>
          ) : (
            <button type="button" className="tag-btn" aria-label={t.tagLabel(tag)} onClick={onRename}>
              {tag}
              <svg className="ico ico-sm" aria-hidden="true">
                <use href="/sprite.svg#i-pencil" />
              </svg>
            </button>
          )}
          {notTested ? <span className="not-tested-chip">{t.notTestedChip}</span> : null}
        </h2>
        {locationText === '' ? null : <p className="sheet-meta">{locationText}</p>}
        {/* E6-Q1: the attribution line keeps its height before the first commit, so the line
            appearing under an open Combobox list never grows the header, never makes the
            browser's scroll anchoring move the page, and never closes that list (React Aria
            closes a non-modal popover on any scroll of its trigger's ancestors). */}
        {filledBy === null ? (
          <p className="sheet-meta" aria-hidden="true">
            {' '}
          </p>
        ) : (
          <p className="sheet-meta">{filledBy}</p>
        )}
        {concludedBy === null ? null : <p className="sheet-meta">{concludedBy}</p>}
        {notTested ? null : (
          <p className="sheet-summary" data-testid="ficha-progress">
            {/* E12-Q8: the missing counts in `.n-missing`, as `key-equipment-sheet-v09.html` draws them. */}
            {sheetSummaryParts(progress, shown).map((part, index) =>
              part.kind === 'missing' ? (
                <span key={index} className="n-missing">
                  {part.text}
                </span>
              ) : (
                part.text
              ),
            )}
          </p>
        )}
      </div>
      <div className="ficha-head-side">
        {notTested ? (
          <div className="progress-counter" data-state={sheetProgressState(progress)} data-testid="ficha-progress">
            <span className="dot" aria-hidden="true" />
            {sheetProgressText(progress)}
          </div>
        ) : null}
        <OverflowMenu name="" label={t.headerMenu(tag)} items={menu} />
      </div>
    </div>
  );
}
