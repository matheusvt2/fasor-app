import { Button as AriaButton } from 'react-aria-components';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastMessage {
  id: number;
  text: string;
  action?: ToastAction;
}

/**
 * `.toast` from `key-home.html` frame 3: one line, `role="status"`, and an optional
 * `.toast-action` whose 48px hit area comes from `components.css`. Never used for an
 * error that needs a decision — those are a Banner or a Confirm dialog.
 */
export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  return (
    <div className="toast" role="status" data-testid="toast">
      <span>{toast.text}</span>
      {toast.action === undefined ? null : (
        <AriaButton
          className="toast-action"
          onPress={() => {
            toast.action?.onPress();
            onDismiss();
          }}
        >
          {toast.action.label}
        </AriaButton>
      )}
    </div>
  );
}
