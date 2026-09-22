import type { KeyboardEvent } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { ui } from '../copy/ui';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastMessage {
  id: number;
  text: string;
  action?: ToastAction;
  /**
   * Called when the user dismisses the toast (its close control or Esc), never when it
   * expires, is replaced or closes through its action.
   */
  onDismiss?: () => void;
}

/**
 * `.toast` from `key-home.html` frame 3: one line, `role="status"`, and an optional
 * `.toast-action` whose 48px hit area comes from `components.css`. Never used for an
 * error that needs a decision — those are a Banner or a Confirm dialog.
 *
 * A toast with an action does not expire by itself, so it also carries a dismiss control
 * with the same `.toast-action` look, and Esc on either control dismisses it (retro U7).
 */
export function Toast({
  toast,
  onClose,
  onDismiss,
}: {
  toast: ToastMessage;
  /** The toast is done (its action ran): close it quietly. */
  onClose: () => void;
  /** The user dismissed it. */
  onDismiss: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onDismiss();
  }

  return (
    <div className="toast" role="status" data-testid="toast" onKeyDown={onKeyDown}>
      <span>{toast.text}</span>
      {toast.action === undefined ? null : (
        <>
          <AriaButton
            className="toast-action"
            onPress={() => {
              toast.action?.onPress();
              onClose();
            }}
          >
            {toast.action.label}
          </AriaButton>
          <AriaButton className="toast-action" onPress={onDismiss}>
            {ui.toast.dismiss}
          </AriaButton>
        </>
      )}
    </div>
  );
}
