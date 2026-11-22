import {
  avatarInitial,
  filterUserList,
  INVITATION_LINK_HOURS,
  lastAdminText,
  linkLifeText,
  permissionRefusalText,
  RESET_LINK_HOURS,
  roleOriginText,
  USER_STATUS_FILTERS,
  userActionDoneText,
  userChangeLeavesNoAdmin,
  userDirectory,
  userDirectoryRoles,
  userListCountText,
  userRowActionDestructive,
  userRowActionLabel,
  userRowActions,
  userRowDetailText,
  userStatusPillId,
  userStatusPillLabel,
  type AdminUserResponse,
  type AdminUserView,
  type UserListEntry,
  type UserRowAction,
  type UserStatusFilter,
} from '@app/domain';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { adminUserAction, listAdminUsers, type AdminUsersFailure } from '../../api/admin-users-client.ts';
import { Button, Combobox, ConfirmDialog, FilterChipGroup, OverflowMenu, TextButton, type ComboboxOption, type OverflowMenuAction } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { ui } from '../../copy/ui.ts';
import { now } from '../../clock.ts';
import { useLiveQuery } from '../../db/live.ts';
import { localUserDirectory, type UserDirectoryRows } from '../../db/users-store.ts';
import { useSession } from '../../state/session.tsx';
import { useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';
import { UserDialog, type UserDialogMode } from './user-dialog.tsx';
import { UsersTabs } from './users-tabs.tsx';

/*
 * Story 26.9 (AD-29; `mockups/prototype/screens/92-usuarios.html`): the Usuários screen, first tab.
 * The list renders from IndexedDB (the company's `user` and `role` rows the pull brings), overlaid
 * by the Admin route's views once it answers (`userDirectory`: the last sign-in, the fresher status
 * and role). Every change goes through the routes of Story 26.8, online only: the answer's user
 * replaces its row at once and one sync is asked, so the device's own rows follow. Offline (or
 * with the route unreachable) the list still shows and every action is `aria-disabled`, pointing
 * at the frame's Banner line. The kernel computes every word and rule (`permissions/user-list.ts`).
 */

const ALL_ROLES = '__all__';

const EMPTY: UserDirectoryRows = { users: [], roles: [] };

/** What a confirmation asks for. */
type Confirmation = { action: Exclude<UserRowAction, 'edit'>; entry: UserListEntry };

export function UsersSurface() {
  const session = useSession();
  const sync = useSync();
  const { showToast } = useToast();
  const t = copy.users;
  const db = session.database;
  const selfId = session.user?.id ?? null;
  const offlineId = useId();
  const statusLabelId = useId();

  const local = useLiveQuery(() => (db === null ? Promise.resolve(EMPTY) : localUserDirectory(db)), [db], EMPTY);
  const [views, setViews] = useState<AdminUserView[]>([]);
  /** The route did not answer at all (no network to it): the screen behaves as offline. */
  const [unreachable, setUnreachable] = useState(false);
  const offline = !session.online || unreachable;

  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('todos');
  const [roleKey, setRoleKey] = useState<string>(ALL_ROLES);
  const [roleText, setRoleText] = useState<string>(t.allRoles);
  const [dialog, setDialog] = useState<UserDialogMode | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const busy = useRef(false);

  const roles = useMemo(() => userDirectoryRoles(local.roles), [local.roles]);
  const entries = useMemo(() => userDirectory(local.users, roles, views), [local.users, roles, views]);
  const roleId = roleKey === ALL_ROLES ? null : roleKey;
  const shown = filterUserList(entries, { status: statusFilter, roleId });
  const removedCount = filterUserList(entries, { status: 'removido', roleId }).length;
  const at = now();

  const refresh = useCallback(async (): Promise<void> => {
    const result = await listAdminUsers();
    if (result.ok) {
      setViews(result.value);
      setUnreachable(false);
    } else if (result.failure.kind === 'offline') setUnreachable(true);
  }, []);

  // The route's views, asked when the screen opens online (and again when the device comes back).
  useEffect(() => {
    if (!session.online) return;
    void refresh();
  }, [session.online, refresh]);

  /** The answer's user replaces its row at once; one sync brings the device's own rows after it. */
  function applyAnswer(response: AdminUserResponse): void {
    setViews((current) => [...current.filter((view) => view.id !== response.user.id), response.user]);
    void sync.syncNow().catch(() => undefined);
  }

  /** Says a refusal the route answered: the last-Admin dialog, or one sentence in a Toast. */
  function sayRefusal(failure: AdminUsersFailure, entry: UserListEntry | null): void {
    if (failure.kind === 'offline') {
      showToast(t.errorOffline);
      return;
    }
    if (failure.kind === 'server') {
      showToast(t.errorServer);
      return;
    }
    switch (failure.code) {
      case 'last_admin':
        setRefusal(lastAdminText({ isSelf: entry !== null && entry.id === selfId, name: entry?.name ?? '' }));
        return;
      case 'user_state_invalid':
        showToast(t.errorStateInvalid);
        void refresh();
        return;
      case 'user_not_found':
        showToast(t.errorNotFound);
        void refresh();
        return;
      case 'forbidden':
        showToast(permissionRefusalText('users.manage'));
        return;
      case 'rate_limited':
        showToast(t.errorRateLimited);
        return;
      case 'role_not_found':
        showToast(t.errorRoleNotFound);
        return;
      default:
        showToast(failure.status === 401 ? t.errorSession : t.errorServer);
    }
  }

  function pick(action: UserRowAction, entry: UserListEntry): void {
    if (offline) return;
    if (action === 'edit') {
      setDialog({ kind: 'edit', entry });
      return;
    }
    // The last-Admin rule over the rows the screen holds, before asking (the route stays the authority).
    if ((action === 'pause' || action === 'remove') && userChangeLeavesNoAdmin(entries, roles, { user_id: entry.id, status: action === 'pause' ? 'paused' : 'removed' })) {
      setRefusal(lastAdminText({ isSelf: entry.id === selfId, name: entry.name }));
      return;
    }
    setConfirmation({ action, entry });
  }

  async function run({ action, entry }: Confirmation): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await adminUserAction(action, entry.id);
      if (!result.ok) {
        sayRefusal(result.failure, entry);
        return;
      }
      applyAnswer(result.value);
      if (result.value.invitation === 'failed') showToast(t.resendFailed);
      else if (result.value.reset === 'failed') showToast(t.resetFailed);
      else showToast(userActionDoneText(action, { name: result.value.user.name, email: result.value.user.email }));
    } finally {
      busy.current = false;
    }
  }

  function saved(response: AdminUserResponse, info: { action: 'create' | 'edit'; roleChanged: boolean }): void {
    setDialog(null);
    applyAnswer(response);
    const { name, email } = response.user;
    if (info.action === 'create' && response.invitation === 'failed') showToast(t.invitationFailed(name));
    else showToast(userActionDoneText(info.action, { name, email, roleChanged: info.roleChanged }));
  }

  const roleOptions: ComboboxOption[] = [
    { id: ALL_ROLES, label: t.allRoles },
    ...roles.map((role): ComboboxOption => {
      const origin = roleOriginText(role);
      return origin === null ? { id: role.id, label: role.name } : { id: role.id, label: role.name, meta: origin };
    }),
  ];

  function clearFilters(): void {
    setStatusFilter('todos');
    setRoleKey(ALL_ROLES);
    setRoleText(t.allRoles);
  }

  const rootClass = ['content', 'usr-root', offline ? 'is-offline' : '', shown.length === 0 ? 'is-empty' : ''].filter(Boolean).join(' ');

  return (
    <main className="screen" data-route="/usuarios">
      <UsersTabs current="usuarios" />
      <div className={rootClass}>
        <div className="usr-head">
          <h2>{t.heading}</h2>
          <Button
            variant="primary"
            isDisabled={offline}
            {...(offline ? { disabledReasonId: offlineId } : {})}
            onPress={() => setDialog({ kind: 'new' })}
          >
            <svg className="ico" aria-hidden="true">
              <use href="/sprite.svg#i-plus" />
            </svg>
            {t.newUser}
          </Button>
        </div>

        {offline ? (
          <div className="banner usr-offline" data-variant="info" role="status" id={offlineId}>
            <span className="banner-text">
              <strong>{t.offlineLead}</strong> {t.offlineText}
            </span>
          </div>
        ) : null}

        <div className="usr-filters">
          <div className="field usr-f-status">
            <span className="field-label" id={statusLabelId} aria-hidden="true">
              {t.statusLabel}
            </span>
            <FilterChipGroup
              options={USER_STATUS_FILTERS}
              selectedId={statusFilter}
              onChange={(id) => setStatusFilter(id as UserStatusFilter)}
              aria-label={t.statusLabel}
            />
          </div>
          <div className="usr-f-role">
            <Combobox
              label={t.roleLabel}
              options={roleOptions}
              selectedKey={roleKey}
              inputValue={roleText}
              onInputChange={setRoleText}
              onSelectionChange={(key) => {
                const next = key ?? ALL_ROLES;
                setRoleKey(next);
                setRoleText(roleOptions.find((option) => option.id === next)?.label ?? t.allRoles);
              }}
            />
          </div>
        </div>

        {shown.length > 0 ? (
          <>
            <ul className="usr-list" aria-label={t.listLabel}>
              {shown.map((entry) => (
                <UserRow key={entry.id} entry={entry} isSelf={entry.id === selfId} detail={userRowDetailText(entry, at)} offline={offline} offlineId={offlineId} onPick={pick} />
              ))}
            </ul>
            <p className="section-note usr-count">{userListCountText({ filter: statusFilter, shown: shown.length, removed: removedCount })}</p>
          </>
        ) : (
          <div className="usr-empty" role="status">
            <p>{t.empty}</p>
            <TextButton onPress={clearFilters}>{t.clearFilters}</TextButton>
          </div>
        )}
      </div>

      {dialog === null ? null : (
        <UserDialog
          mode={dialog}
          roles={roles}
          entries={entries}
          selfId={selfId}
          onClose={() => setDialog(null)}
          onSaved={saved}
          onRefused={(failure) => {
            const entry = dialog.kind === 'edit' ? dialog.entry : null;
            setDialog(null);
            sayRefusal(failure, entry);
          }}
        />
      )}

      {confirmation === null ? null : (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setConfirmation(null);
          }}
          {...confirmationCopy(confirmation)}
          onConfirm={() => void run(confirmation)}
        />
      )}

      <LastAdminDialog text={refusal} onClose={() => setRefusal(null)} />
    </main>
  );
}

/** The Confirm dialog's words of one action, the frame's (Cancelar first). */
function confirmationCopy({ action, entry }: Confirmation): { title: string; description: string; confirmLabel: string; isDestructive?: boolean } {
  const t = copy.users;
  switch (action) {
    case 'pause':
      return { title: t.pauseTitle(entry.name), description: t.pauseBody, confirmLabel: t.pauseConfirm };
    case 'reactivate':
      return {
        title: t.reactivateTitle(entry.name),
        description: entry.role_name === null ? t.reactivateBodyNoRole : t.reactivateBody(entry.role_name),
        confirmLabel: t.reactivateConfirm,
      };
    case 'remove':
      return { title: t.removeTitle(entry.name), description: t.removeBody, confirmLabel: t.removeConfirm, isDestructive: true };
    case 'send_reset':
      return { title: t.resetTitle, description: t.resetBody(entry.name, entry.email, linkLifeText(RESET_LINK_HOURS)), confirmLabel: t.resetConfirm };
    case 'resend_invitation':
      return { title: t.resendTitle, description: t.resendBody(entry.name, entry.email, INVITATION_LINK_HOURS), confirmLabel: t.resendConfirm };
  }
}

interface UserRowProps {
  entry: UserListEntry;
  isSelf: boolean;
  detail: string;
  offline: boolean;
  offlineId: string;
  onPick: (action: UserRowAction, entry: UserListEntry) => void;
}

/** One `.registry-row.usr-row`: Avatar, name ("· você"), e-mail, role and last access, the Status pill, the Overflow menu. */
function UserRow({ entry, isSelf, detail, offline, offlineId, onPick }: UserRowProps) {
  const t = copy.users;
  const pill = userStatusPillId(entry.status);
  const actions = userRowActions(entry.status, { isSelf });
  const item = (action: UserRowAction): OverflowMenuAction => ({ id: action, label: userRowActionLabel(action), onAction: () => onPick(action, entry) });
  return (
    <li className="registry-row usr-row" data-status={pill} data-user-id={entry.id}>
      <span className="avatar" aria-hidden="true">
        {avatarInitial(entry.name)}
      </span>
      <span className="rr-text">
        <span className="rr-primary">
          {entry.name}
          {isSelf ? (
            <>
              {' '}
              <span className="usr-you">{t.you}</span>
            </>
          ) : null}
        </span>
        <span className="rr-secondary">{entry.email}</span>
        {detail === '' ? null : <span className="rr-secondary">{detail}</span>}
      </span>
      <span className="usr-state">
        <span className="status-pill" data-status={pill}>
          {userStatusPillLabel(entry.status)}
        </span>
      </span>
      {offline ? (
        <button type="button" className="overflow-trigger" aria-disabled="true" aria-label={ui.overflowMenu.triggerLabel(entry.name)} aria-describedby={offlineId}>
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
          </svg>
        </button>
      ) : (
        <OverflowMenu
          name={entry.name}
          items={actions.filter((action) => !userRowActionDestructive(action)).map(item)}
          destructiveItems={actions.filter(userRowActionDestructive).map(item)}
        />
      )}
    </li>
  );
}

/** The last-Admin refusal (`#usr-dlg-ultimo-admin`): an alert dialog with one action, "Entendi", focused. */
function LastAdminDialog({ text, onClose }: { text: string | null; onClose: () => void }) {
  const t = copy.users;
  const titleId = useId();
  const descriptionId = useId();
  return (
    <DialogShell
      className="confirm-dialog"
      role="alertdialog"
      isOpen={text !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {({ close }) => (
        <>
          <h2 className="dialog-title" id={titleId}>
            {t.lastAdminTitle}
          </h2>
          <p className="t-body" id={descriptionId}>
            {text}
          </p>
          <div className="dialog-actions">
            <AriaButton className="btn btn-primary" autoFocus onPress={close}>
              {t.lastAdminOk}
            </AriaButton>
          </div>
        </>
      )}
    </DialogShell>
  );
}
