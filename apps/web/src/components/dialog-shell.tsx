import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';

export interface DialogShellProps {
  /** The mock's dialog class: `confirm-dialog` or `form-dialog`. */
  className: string;
  /**
   * A modifier on the `.dialog-scrim`, for a dialog placed at an edge rather than centred
   * (the Template composer's Block palette drawer and sheet).
   */
  overlayClassName?: string;
  /**
   * Controlled open state. Leave both undefined inside a `DialogTrigger`, which then owns
   * the state and the focus return.
   */
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  'aria-labelledby': string;
  'aria-describedby'?: string;
  children: ReactNode | ((options: { close: () => void }) => ReactNode);
}

/**
 * The controls a keyboard user can reach, in DOM order; a roving group offers only its tab
 * stop. A natively disabled control and a hidden input are never tab stops.
 */
const TABBABLE = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex="0"]:not([disabled])',
].join(', ');

/**
 * The one modal shell every dialog of the app renders (Component Patterns › Confirm
 * dialog, Form dialog; EXPERIENCE.md › Accessibility › Dialogs and overlays):
 *
 * - `.dialog-scrim` › `.dialog-modal` › the dialog, the mock's markup (`app.css` makes the
 *   scrim fixed and the React Aria `Modal` wrapper `display: contents`).
 * - `role="dialog"` with `aria-modal="true"` on the same element. React Aria deliberately
 *   leaves `aria-modal` off and hides the page with `aria-hidden` instead; the spine asks
 *   for the attribute, so it is set here, on the element React Aria gave the role to.
 * - Initial focus on the first control a keyboard user can reach: "Cancelar", first in a
 *   Confirm dialog's reading order, or the first field of a Form dialog. React Aria
 *   focuses the dialog container when nothing claims the focus, so this has the last word.
 * - Esc and a tap on the scrim cancel; focus returns to the element that opened the
 *   dialog, on cancel and on save alike. React Aria restores it when the overlay unmounts;
 *   when the dialog closes from inside (a save that re-renders the surface) and the focus
 *   ends on `<body>` instead, the opener recorded here takes it back.
 */
export function DialogShell({ className, overlayClassName, isOpen, onOpenChange, children, ...aria }: DialogShellProps) {
  useReturnFocus(isOpen);

  const markModal = useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    element.setAttribute('aria-modal', 'true');
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active !== element && active !== null && element.contains(active)) return;
      element.querySelector<HTMLElement>(TABBABLE)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <ModalOverlay
      className={overlayClassName === undefined ? 'dialog-scrim' : `dialog-scrim ${overlayClassName}`}
      isDismissable
      isOpen={isOpen}
      onOpenChange={onOpenChange}
    >
      <Modal className="dialog-modal">
        <Dialog className={className} {...aria} ref={markModal}>
          {children}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * Records the focused element when a controlled dialog opens and gives the focus back to it
 * after the dialog closes or unmounts, unless something else already holds the focus.
 */
function useReturnFocus(isOpen: boolean | undefined) {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  // Read during the render that opens the dialog: by the time any effect runs, React Aria
  // has already moved the focus inside it.
  if (isOpen === true && !wasOpen.current && typeof document !== 'undefined') {
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasOpen.current = isOpen === true;

  useEffect(() => {
    if (isOpen !== true) return;
    const target = opener.current;
    return () => {
      // After React Aria's own restore, which it also runs in an animation frame.
      requestAnimationFrame(() => {
        if (target === null || !target.isConnected) return;
        const active = document.activeElement;
        if (active === null || active === document.body || !active.isConnected) target.focus();
      });
    };
  }, [isOpen]);
}
