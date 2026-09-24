import { sheetProgressState, sheetProgressText, type SheetProgress } from '@app/domain';
import { OverflowMenu, type OverflowMenuAction } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';

/**
 * The Sheet header (UX-DR33, `60-ficha.html` `.sheet-header`): type + TAG, the TAG a 48 px
 * text button that renames the equipment (its id kept); Cabine › Coluna; the attribution
 * lines once saved; the Progress counter ("8 obrigatórios faltando" / "Completa"), which
 * never blocks anything; and the sheet's Overflow. No hint sentence of its own.
 */
export function FichaHeader({
  typeName,
  tag,
  locationText,
  filledBy,
  concludedBy,
  progress,
  menu,
  onRename,
}: {
  typeName: string;
  tag: string;
  locationText: string;
  filledBy: string | null;
  concludedBy: string | null;
  progress: SheetProgress;
  menu: OverflowMenuAction[];
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
        </h2>
        {locationText === '' ? null : <p className="sheet-meta">{locationText}</p>}
        {filledBy === null ? null : <p className="sheet-meta">{filledBy}</p>}
        {concludedBy === null ? null : <p className="sheet-meta">{concludedBy}</p>}
      </div>
      <div className="ficha-head-side">
        <div className="progress-counter" data-state={sheetProgressState(progress)} data-testid="ficha-progress">
          <span className="dot" aria-hidden="true" />
          {sheetProgressText(progress)}
        </div>
        <OverflowMenu name="" label={t.headerMenu(tag)} items={menu} />
      </div>
    </div>
  );
}
