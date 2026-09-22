import { CADASTROS_SUBLINE, templatesSubline } from '@app/domain';
import { useId } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';

export interface ShortcutRowProps {
  templateCount: number;
}

/**
 * `.shortcut-row` from `20-home.html`: Templates and Cadastros, each with a live
 * sub-line and never a badge or a dot (UX-DR64). Both destinations belong to Epic 3, so
 * both cards are `aria-disabled` with the one shared reason under the row.
 */
export function ShortcutRow({ templateCount }: ShortcutRowProps) {
  const reasonId = useId();
  return (
    <>
      <div className="shortcut-row">
        <AriaButton className="shortcut-card" aria-disabled aria-describedby={reasonId}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-layers" />
          </svg>
          <span>
            {copy.home.templates}
            <span className="shortcut-sub">{templatesSubline(templateCount)}</span>
          </span>
          <svg className="ico chev" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </AriaButton>
        <AriaButton className="shortcut-card" aria-disabled aria-describedby={reasonId}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-book" />
          </svg>
          <span>
            {copy.home.cadastros}
            <span className="shortcut-sub">{CADASTROS_SUBLINE}</span>
          </span>
          <svg className="ico chev" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </AriaButton>
      </div>
      <span className="btn-reason" id={reasonId}>
        {copy.home.notAvailableYet}
      </span>
    </>
  );
}
