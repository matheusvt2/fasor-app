import { CADASTROS_SUBLINE, templatesSubline } from '@app/domain';
import { Link } from 'react-router';
import { copy } from '../../copy/pt-br.ts';

export interface ShortcutRowProps {
  templateCount: number;
}

/**
 * `.shortcut-row` from `20-home.html`: Templates and Cadastros, each with a live
 * sub-line and never a badge or a dot (UX-DR64). Templates opens the Templates surface
 * (Story 3.2); Cadastros opens the Registries surface (Story 2.1).
 */
export function ShortcutRow({ templateCount }: ShortcutRowProps) {
  return (
    <div className="shortcut-row">
      <Link className="shortcut-card" to="/templates">
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
      </Link>
      <Link className="shortcut-card" to="/cadastros">
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
      </Link>
    </div>
  );
}
