import {
  ADMIN_USER_EMAIL_MAX_LENGTH,
  ADMIN_USER_NAME_MAX_LENGTH,
  adminUserCreateRequestSchema,
  INVITATION_LINK_HOURS,
  lastAdminText,
  roleModulesText,
  userChangeLeavesNoAdmin,
  type AdminUserResponse,
  type RoleRow,
  type UserListEntry,
} from '@app/domain';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { createAdminUser, editAdminUser, type AdminUsersFailure } from '../../api/admin-users-client.ts';
import { Button, FormDialog } from '../../components/index.ts';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { useCan } from '../../state/permissions.tsx';
import { ROLES_PATH } from './users-tabs.tsx';

/*
 * Story 26.9 (`92-usuarios.html` `#usr-dlg-novo`, `#usr-dlg-novo-dup`, `#usr-dlg-editar`,
 * `#usr-dlg-editar-eu`): the user dialog, new and edit, in the Form dialog of "Novo relatório".
 * Nome, E-mail (read-only once invited) and Papel as Option rows, each naming the modules it opens
 * (`roleModulesText`). The route is the authority: a refusal it answers that belongs to a field
 * (the duplicate e-mail, a role that no longer exists) is said in the dialog; the last-Admin rule
 * is said before asking, from the rows the screen holds (`userChangeLeavesNoAdmin`), and any other
 * refusal goes back to the screen (`onRefused`).
 */

export type UserDialogMode = { kind: 'new' } | { kind: 'edit'; entry: UserListEntry };

export interface UserDialogProps {
  mode: UserDialogMode;
  /** The roles to offer, in the screen's order (`userDirectoryRoles`). */
  roles: readonly RoleRow[];
  /** The rows the screen lists, for the last-Admin rule. */
  entries: readonly UserListEntry[];
  /** The signed-in user. */
  selfId: string | null;
  onClose: () => void;
  /** The route saved the change: its answer, and whether the role changed. */
  onSaved: (response: AdminUserResponse, info: { action: 'create' | 'edit'; roleChanged: boolean }) => void;
  /** A refusal that is not the dialog's to say (the last Admin, a status that moved, ...): the screen says it. */
  onRefused: (failure: AdminUsersFailure) => void;
}

const emailSchema = adminUserCreateRequestSchema.shape.email;

/** The address as the route would store it, or null when it is not one. */
function parsedEmail(text: string): string | null {
  const parsed = emailSchema.safeParse(text);
  return parsed.success ? parsed.data : null;
}

export function UserDialog({ mode, roles, entries, selfId, onClose, onSaved, onRefused }: UserDialogProps) {
  const t = copy.users;
  const editing = mode.kind === 'edit' ? mode.entry : null;
  const nameId = useId();
  const emailId = useId();
  const emailHelperId = useId();
  const roleLabelId = useId();
  const roleBannerId = useId();
  const roleHelperId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(editing?.name ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [roleId, setRoleId] = useState<string | null>(editing?.role_id ?? null);
  /** The address the route answered `user_email_taken` for; "Enviar convite" waits until it changes. */
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  const [roleRefused, setRoleRefused] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inFlight = useRef(false);
  const rolesShown = useCan('roles.manage');

  // The last-Admin rule over the rows the screen holds: the roles that would leave no active Admin.
  const lockedRoles = new Set(
    editing === null ? [] : roles.filter((role) => role.id !== editing.role_id && userChangeLeavesNoAdmin(entries, roles, { user_id: editing.id, role_id: role.id })).map((role) => role.id),
  );
  const lastAdmin = editing !== null && lockedRoles.size > 0 ? lastAdminText({ isSelf: editing.id === selfId, name: editing.name }) : null;

  const trimmedName = name.trim();
  const address = editing === null ? parsedEmail(email) : editing.email;
  const emailIsTaken = editing === null && takenEmail !== null && address === takenEmail;
  const nameChanged = editing !== null && trimmedName !== editing.name;
  const roleChanged = editing !== null && roleId !== null && roleId !== editing.role_id;

  let reason: string | undefined;
  let reasonId: string | undefined;
  if (sending) reason = t.sending;
  else if (trimmedName === '') reason = t.nameMissing;
  else if (address === null) reason = t.emailMissing;
  else if (emailIsTaken) reasonId = emailHelperId;
  else if (roleId === null) reason = t.roleMissing;
  else if (editing !== null && !nameChanged && !roleChanged) reason = t.unchanged;

  async function submit(): Promise<void> {
    if (reason !== undefined || reasonId !== undefined || inFlight.current || roleId === null || address === null) return;
    inFlight.current = true;
    setSending(true);
    setFormError(null);
    setRoleRefused(false);
    try {
      const result =
        editing === null
          ? await createAdminUser({ name: trimmedName, email: address, role_id: roleId })
          : await editAdminUser(editing.id, { ...(nameChanged ? { name: trimmedName } : {}), ...(roleChanged ? { role_id: roleId } : {}) });
      if (result.ok) {
        onSaved(result.value, { action: editing === null ? 'create' : 'edit', roleChanged });
        return;
      }
      const failure = result.failure;
      if (failure.kind === 'offline') setFormError(t.errorOffline);
      else if (failure.kind === 'server') setFormError(t.errorServer);
      else if (failure.code === 'user_email_taken') setTakenEmail(address);
      else if (failure.code === 'role_not_found') setRoleRefused(true);
      else if (failure.code === 'rate_limited') setFormError(t.errorRateLimited);
      else onRefused(failure);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing === null ? t.newTitle : t.editTitle}
      className="usr-dialog"
    >
      {editing === null ? (
        <p className="t-body" id={descriptionId}>
          {t.newDescription}
        </p>
      ) : null}
      <div className="field">
        <label className="field-label" htmlFor={nameId}>
          {t.nameLabel}
        </label>
        <input
          id={nameId}
          className="input"
          value={name}
          maxLength={ADMIN_USER_NAME_MAX_LENGTH}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor={emailId}>
          {t.emailLabel}
        </label>
        {editing === null ? (
          <input
            id={emailId}
            className={emailIsTaken ? 'input is-invalid' : 'input'}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            maxLength={ADMIN_USER_EMAIL_MAX_LENGTH}
            aria-invalid={emailIsTaken ? true : undefined}
            aria-describedby={emailHelperId}
            onChange={(event) => setEmail(event.target.value)}
          />
        ) : (
          <input id={emailId} className="input is-readonly" value={editing.email} readOnly aria-describedby={emailHelperId} />
        )}
        {emailIsTaken ? (
          <span className="helper" data-tone="red" id={emailHelperId} role="alert">
            {t.emailTaken}
          </span>
        ) : (
          <span className="helper" id={emailHelperId}>
            {editing === null ? t.emailHelper(INVITATION_LINK_HOURS) : t.emailFixed}
          </span>
        )}
      </div>
      {/* The frame puts `role="radiogroup"` on the `.field`; here it is on `.role-options`, so the Banner, the
          error line and the link sit beside the radios rather than among them. */}
      <div className="field">
        <span className="field-label" id={roleLabelId}>
          {t.roleLabel}
        </span>
        {lastAdmin === null ? null : (
          <div className="banner dialog-banner" role="status" id={roleBannerId}>
            <span className="banner-text">{lastAdmin}</span>
          </div>
        )}
        <RoleOptions
          roles={roles}
          value={roleId}
          locked={lockedRoles}
          labelledBy={roleLabelId}
          {...(lastAdmin === null ? {} : { describedBy: roleBannerId })}
          onPick={(id) => {
            setRoleId(id);
            setRoleRefused(false);
          }}
        />
        {roleRefused ? (
          <span className="helper" data-tone="red" id={roleHelperId} role="alert">
            {t.errorRoleNotFound}
          </span>
        ) : null}
        {rolesShown && editing === null ? (
          <Link className="btn btn-text usr-see-roles" to={ROLES_PATH}>
            {t.seeRoles}
          </Link>
        ) : null}
      </div>
      {formError === null ? null : (
        <p className="helper" data-tone="red" role="alert">
          {formError}
        </p>
      )}
      <div className="dialog-actions">
        <Button variant="secondary" onPress={onClose}>
          {ui.confirmDialog.cancel}
        </Button>
        <Button
          variant="primary"
          isDisabled={reason !== undefined || reasonId !== undefined}
          {...(reasonId !== undefined ? { disabledReasonId: reasonId } : reason !== undefined ? { disabledReason: reason } : {})}
          onPress={() => void submit()}
        >
          {editing === null ? t.sendInvitation : t.save}
        </Button>
      </div>
    </FormDialog>
  );
}

interface RoleOptionsProps {
  roles: readonly RoleRow[];
  value: string | null;
  /** The roles the last-Admin rule refuses: shown, `aria-disabled`, out of the arrow keys. */
  locked: ReadonlySet<string>;
  labelledBy: string;
  describedBy?: string;
  onPick: (roleId: string) => void;
}

/**
 * The Papel Option rows: a `radiogroup` with one tab stop (the checked row, else the first open
 * one); the arrow keys, Home and End move the focus over the open rows, and a tap, Space or Enter
 * picks one (the Option rows of `local-dialog.tsx`).
 */
function RoleOptions({ roles, value, locked, labelledBy, describedBy, onPick }: RoleOptionsProps) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const open = roles.map((role, index) => (locked.has(role.id) ? -1 : index)).filter((index) => index !== -1);
  const checkedIndex = roles.findIndex((role) => role.id === value);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabIndexOf = focusIndex !== null && open.includes(focusIndex) ? focusIndex : checkedIndex !== -1 ? checkedIndex : (open[0] ?? 0);

  const move = (from: number, step: number | 'first' | 'last') => {
    if (open.length === 0) return;
    const at = open.indexOf(from);
    const next = step === 'first' ? open[0] : step === 'last' ? open[open.length - 1] : open[((at === -1 ? 0 : at) + step + open.length) % open.length];
    if (next === undefined) return;
    setFocusIndex(next);
    rows.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : null;
    if (step === null) return;
    event.preventDefault();
    move(index, step);
  };

  return (
    <div className="role-options" role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {roles.map((role, index) => {
        const checked = role.id === value;
        const disabled = locked.has(role.id);
        return (
          <button
            key={role.id}
            ref={(element) => {
              rows.current[index] = element;
            }}
            type="button"
            className={checked ? 'option-row is-selected' : 'option-row'}
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled ? true : undefined}
            data-role-id={role.id}
            tabIndex={index === tabIndexOf && !disabled ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => {
              if (!disabled) onPick(role.id);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={checked ? 'radio is-on' : 'radio'} aria-hidden="true" />
            <span className="grow">
              {role.name}
              <br />
              <span className="lr-meta">{roleModulesText(role)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
