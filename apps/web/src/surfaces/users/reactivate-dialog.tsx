import { type RoleRow, type UserListEntry } from '@app/domain';
import { useId, useState } from 'react';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { RoleOptions } from './user-dialog.tsx';

/*
 * 2026-11-22, e26s (the owner's word, "corrija"): the reactivation of a user whose role is gone.
 * The route refuses `role_not_found` for a user whose role was removed (e26r), and a removed user
 * cannot be edited, so the Admin picks the role here, at the moment of reactivating: the same
 * Papel Option rows as the user dialog (`RoleOptions`, `.usr-dialog` classes), the existing
 * sentence "Esse papel não existe mais. Escolha outro." under them, and "Reativar" once one is
 * chosen. The confirmation sends `role_id` with the reactivation (one server batch).
 */

export interface ReactivateRoleDialogProps {
  entry: UserListEntry;
  /** The roles to offer, in the screen's order (`userDirectoryRoles`). */
  roles: readonly RoleRow[];
  onClose: () => void;
  onConfirm: (roleId: string) => void;
}

const NONE_LOCKED: ReadonlySet<string> = new Set();

export function ReactivateRoleDialog({ entry, roles, onClose, onConfirm }: ReactivateRoleDialogProps) {
  const t = copy.users;
  const roleLabelId = useId();
  const roleHelperId = useId();
  const [roleId, setRoleId] = useState<string | null>(null);
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t.reactivateTitle(entry.name)}
      className="usr-dialog"
    >
      <div className="field">
        <span className="field-label" id={roleLabelId}>
          {t.roleLabel}
        </span>
        <RoleOptions roles={roles} value={roleId} locked={NONE_LOCKED} labelledBy={roleLabelId} describedBy={roleHelperId} onPick={setRoleId} />
        <span className="helper" data-tone="red" id={roleHelperId} role="alert">
          {t.errorRoleNotFound}
        </span>
      </div>
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button
          variant="primary"
          isDisabled={roleId === null}
          {...(roleId === null ? { disabledReason: t.roleMissing } : {})}
          onPress={() => {
            if (roleId === null) return;
            onConfirm(roleId);
            onClose();
          }}
        >
          {t.reactivateConfirm}
        </Button>
      </div>
    </FormDialog>
  );
}
