import { CADASTROS_SUBLINE, permissionForScreen, templatesSubline, type TemplateRow } from '@app/domain';
import { Link } from 'react-router';
import { copy } from '../../copy/pt-br.ts';
import { useCanFn } from '../../state/permissions.tsx';

const TEMPLATES = '/templates';
const CADASTROS = '/cadastros';
const USUARIOS = '/usuarios';

/**
 * Story 26.5: the shortcuts the signed-in user's role opens, each behind the key the kernel's
 * screen map names for its address (a module the role lacks is hidden, `21-home-campo.html`).
 */
export function useShortcuts(): { templates: boolean; cadastros: boolean; usuarios: boolean } {
  const can = useCanFn();
  return {
    templates: can(permissionForScreen(TEMPLATES)),
    cadastros: can(permissionForScreen(CADASTROS)),
    // Story 26.9 (`20-home.html`): the third shortcut, only with `users.manage`.
    usuarios: can(permissionForScreen(USUARIOS)),
  };
}

export interface ShortcutRowProps {
  /** The templates on this device; the kernel counts the live, not archived ones. */
  templates: readonly TemplateRow[];
}

/**
 * `.shortcut-row` from `20-home.html`: Templates and Cadastros, each with a live
 * sub-line and never a badge or a dot (UX-DR64). Templates opens the Templates surface
 * (Story 3.2); Cadastros opens the Registries surface (Story 2.1).
 */
export function ShortcutRow({ templates }: ShortcutRowProps) {
  const shown = useShortcuts();
  // Story 26.5: a row with no shortcut left is not drawn.
  if (!shown.templates && !shown.cadastros && !shown.usuarios) return null;
  // Story 26.9 (`20-home.html` `.shortcut-row.has-3`): three in one row from 768 px.
  const three = shown.templates && shown.cadastros && shown.usuarios;
  return (
    <div className={three ? 'shortcut-row has-3' : 'shortcut-row'}>
      {shown.templates ? (
        <Link className="shortcut-card" to={TEMPLATES} data-telemetry="home.shortcut_templates">
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-layers" />
          </svg>
          <span>
            {copy.home.templates}
            <span className="shortcut-sub">{templatesSubline(templates)}</span>
          </span>
          <svg className="ico chev" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </Link>
      ) : null}
      {shown.cadastros ? (
        <Link className="shortcut-card" to={CADASTROS} data-telemetry="home.shortcut_cadastros">
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
      ) : null}
      {shown.usuarios ? (
        <Link className="shortcut-card" to={USUARIOS}>
          <svg className="ico" aria-hidden="true">
            <use href="/sprite.svg#i-users" />
          </svg>
          <span>
            {copy.users.shortcut}
            <span className="shortcut-sub">{copy.users.shortcutSub}</span>
          </span>
          <svg className="ico chev" aria-hidden="true">
            <use href="/sprite.svg#i-chev-right" />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}
