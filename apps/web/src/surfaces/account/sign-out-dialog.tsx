import { useId } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';
import { useAriaModal, useInitialFocus } from '../use-aria-modal.ts';

export interface SignOutDialogProps {
  /** The kernel's pending summary ("3 fichas") and its count, or null when nothing waits. */
  pending: { text: string; count: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirm dialog of the destructive "Sair" (mock: `#acc-dlg-sair`). The initial focus is
 * on "Cancelar", never on the destructive action (DESIGN.md).
 *
 * With pending work the dialog is the mock's "Sair com envios pendentes?" with the
 * kernel's summary in its sentence; with nothing pending it says what is true today,
 * which is that nothing on this device is deleted.
 */
export function SignOutDialog(props: SignOutDialogProps) {
  const dialogRef = useAriaModal<HTMLElement>();
  const cancelRef = useInitialFocus<HTMLButtonElement>();
  const titleId = useId();
  const descriptionId = useId();

  const title = props.pending === null ? copy.account.signOutDialogTitle : copy.account.signOutPendingDialogTitle;
  const body =
    props.pending === null
      ? copy.account.signOutDialogBody
      : copy.account.signOutPendingDialogBody(props.pending.text, props.pending.count);

  return (
    <ModalOverlay className="dialog-scrim" isOpen isDismissable onOpenChange={props.onCancel}>
      <Modal className="dialog-modal">
        <Dialog
          className="confirm-dialog"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          ref={dialogRef}
        >
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          <p className="t-body" id={descriptionId}>
            {body}
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn btn-secondary"
              ref={cancelRef}
              onClick={props.onCancel}
            >
              {copy.account.cancel}
            </button>
            <button type="button" className="btn btn-destructive" onClick={props.onConfirm}>
              {copy.account.signOutConfirm}
            </button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
