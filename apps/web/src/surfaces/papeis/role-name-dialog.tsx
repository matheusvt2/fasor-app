import { cleanRoleName, roleNameIssue, roleNameIssueText, type AdminRoleView, type RoleNameIssue } from '@app/domain';
import { useId, useState } from 'react';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';

/*
 * Story 26.10 (`93-papeis.html` `#pp-dlg-novo`, `#pp-dlg-renomear`): the Form dialog of "Novo papel"
 * and "Renomear papel". The name's issue is the kernel's (`roleNameIssue` against the roles of the
 * grid, the own name excepted on a rename; `roleNameIssueText`), shown under the field; an empty name
 * says so only once the field was left or the dialog submitted. The server decides again: its
 * `role_name_taken` and `role_name_invalid` come back here as the same lines.
 */

const t = copy.papeis;

/** What a submit answered: done (the surface closes the dialog), a name issue, or a line to show. */
export type RoleNameSubmitResult = { ok: true } | { ok: false; issue: RoleNameIssue } | { ok: false; line: string };

export interface RoleNameDialogProps {
  /** Absent for "Novo papel"; the role to rename otherwise. */
  role?: AdminRoleView;
  roles: readonly AdminRoleView[];
  online: boolean;
  onSubmit: (name: string) => Promise<RoleNameSubmitResult>;
  onClose: () => void;
}

export function RoleNameDialog({ role, roles, online, onSubmit, onClose }: RoleNameDialogProps) {
  const [name, setName] = useState(role?.name ?? '');
  const [left, setLeft] = useState(false);
  const [serverIssue, setServerIssue] = useState<RoleNameIssue | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelId = useId();
  const helperId = useId();
  const issueId = useId();
  const issue = serverIssue ?? roleNameIssue(name, roles, role?.id);
  const showIssue = issue !== null && (left || issue !== 'empty');
  const blocked = issue !== null || !online;
  const reason = !blocked ? {} : showIssue ? { disabledReasonId: issueId } : { disabledReason: issue !== null ? roleNameIssueText(issue) : copy.sync.offlineReason };

  async function submit() {
    setLeft(true);
    if (blocked || busy) return;
    setBusy(true);
    setLine(null);
    const answer = await onSubmit(cleanRoleName(name));
    setBusy(false);
    if (answer.ok) return;
    if ('issue' in answer) setServerIssue(answer.issue);
    else setLine(answer.line);
  }

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={role === undefined ? t.newTitle : t.renameTitle}
    >
      <div className="field">
        <span className="field-label" id={labelId}>
          {t.nameLabel}
        </span>
        <input
          className="input"
          aria-labelledby={labelId}
          value={name}
          aria-invalid={showIssue ? true : undefined}
          aria-describedby={showIssue ? `${helperId} ${issueId}` : helperId}
          onChange={(event) => {
            setServerIssue(null);
            setLine(null);
            setName(event.target.value);
          }}
          onBlur={() => setLeft(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <span className="helper" id={helperId}>
          {role === undefined ? t.newHelper : t.renameHelper}
        </span>
        {showIssue && issue !== null ? (
          <span className="helper" data-tone="red" id={issueId} role="alert">
            {roleNameIssueText(issue)}
          </span>
        ) : null}
      </div>
      {line === null ? null : (
        <p className="btn-reason" role="alert">
          {line}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button variant="primary" isDisabled={blocked} {...reason} onPress={() => void submit()}>
          {role === undefined ? t.newSubmit : t.renameSubmit}
        </Button>
      </div>
    </FormDialog>
  );
}
