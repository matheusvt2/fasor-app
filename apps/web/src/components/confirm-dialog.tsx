import { useId, type ReactNode } from 'react';
import { Button, DialogTrigger } from 'react-aria-components';
import { ui } from '../copy/ui';
import { DialogShell } from './dialog-shell.tsx';

export interface ConfirmDialogProps {
  /**
   * The control that opens the dialog, wrapped in a `DialogTrigger`. Omit it for the
   * controlled mode: the surface opens the dialog itself through `isOpen` (for instance
   * from a `Button` that is disabled with a reason, which a trigger could not respect).
   */
  trigger?: ReactNode;
  /** One sentence stating the consequence (Component Patterns › Confirm dialog). */
  title: string;
  /** The sentence under the title; a kernel sentence goes here as it is. */
  description?: ReactNode;
  /** The action verb on the button ("Remover ficha", never "OK"). */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive confirms use `.btn-destructive` (outline red, never a red fill). */
  isDestructive?: boolean;
  onConfirm: () => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * `role="dialog" aria-modal="true"`, labelled and described, initial focus on the
 * non-destructive action, Esc/back closes and returns focus (Component Patterns › Confirm
 * dialog). Cancelar is first in reading order, so it is also first in the default tab
 * sequence React Aria's focus trap lands on. The shell (`DialogShell`) owns the modal
 * semantics and the focus return in both modes.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = ui.confirmDialog.cancel,
  isDestructive = false,
  onConfirm,
  isOpen,
  onOpenChange,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const hasDescription = description !== undefined && description !== null && description !== '';

  const dialog = (
    <DialogShell
      className="confirm-dialog"
      isOpen={trigger === undefined ? (isOpen ?? false) : isOpen}
      onOpenChange={onOpenChange}
      aria-labelledby={titleId}
      aria-describedby={hasDescription ? descriptionId : undefined}
    >
      {({ close }) => (
        <>
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          {hasDescription ? (
            <p className="t-body" id={descriptionId}>
              {description}
            </p>
          ) : null}
          <div className="dialog-actions">
            <Button className="btn btn-secondary" autoFocus onPress={close}>
              {cancelLabel}
            </Button>
            <Button
              className={isDestructive ? 'btn btn-destructive' : 'btn btn-primary'}
              onPress={() => {
                onConfirm();
                close();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </DialogShell>
  );

  if (trigger === undefined) return dialog;
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      {dialog}
    </DialogTrigger>
  );
}
