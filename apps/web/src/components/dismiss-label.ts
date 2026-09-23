import { ui } from '../copy/ui.ts';

/**
 * A callback ref for a React Aria `Popover` that renames its two visually hidden dismiss
 * buttons. React Aria names them from its own pt-BR dictionary ("Descartar", which reads
 * as "discard" to a screen-reader user) and offers no prop for it; closing a menu is
 * "Fechar" everywhere else in the app (Epic 2 retro D-8). They are the popover's only
 * `tabindex="-1"` buttons, and React never rewrites the attribute afterwards because its
 * own value for it does not change between renders.
 */
export function relabelDismissButtons(element: HTMLElement | null): void {
  if (element === null) return;
  for (const button of element.querySelectorAll<HTMLButtonElement>('button[tabindex="-1"]')) {
    button.setAttribute('aria-label', ui.overlay.dismiss);
  }
}
