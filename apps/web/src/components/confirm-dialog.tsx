import { useId } from 'react';
import { Button, Dialog, DialogTrigger, Modal, ModalOverlay } from 'react-aria-components';
import { ui } from '../copy/ui';

export interface ConfirmDialogProps {
  trigger: React.ReactNode;
  /** One sentence stating the consequence (Component Patterns › Confirm dialog). */
  title: string;
  description?: string;
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
 * sequence RAC's focus trap lands on.
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

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <ModalOverlay className="dialog-scrim">
        <Modal>
          <Dialog
            className="confirm-dialog"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
          >
            {({ close }) => (
              <>
                <h2 className="dialog-title" id={titleId}>
                  {title}
                </h2>
                {description ? (
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
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
