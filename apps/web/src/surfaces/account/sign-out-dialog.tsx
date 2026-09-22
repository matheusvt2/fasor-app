import { useId } from 'react';
import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { copy } from '../../copy/pt-br.ts';
import { useAriaModal, useInitialFocus } from '../use-aria-modal.ts';

export interface SignOutDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirm dialog of the destructive "Sair" (mock: `#acc-dlg-sair`). The initial focus is
 * on "Cancelar", never on the destructive action (DESIGN.md).
 *
 * The mock's pending-sync wording ("31 fotos e 3 fichas ainda nao foram enviadas") needs
 * the sync counts of Story 1.5; until then the dialog says what is true today, which is
 * that nothing on this device is deleted.
 */
export function SignOutDialog(props: SignOutDialogProps) {
  const dialogRef = useAriaModal<HTMLElement>();
  const cancelRef = useInitialFocus<HTMLButtonElement>();
  const titleId = useId();
  const descriptionId = useId();

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
            {copy.account.signOutDialogTitle}
          </h2>
          <p className="t-body" id={descriptionId}>
            {copy.account.signOutDialogBody}
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
