import {
  ADMIN_ROLE_LOCKED_TEXT,
  changedRolePermissions,
  gridChanges,
  managementGrantText,
  restoredPermissions,
  roleInUseText,
  roleLockedText,
  rolesOneAtATime,
  toggleKey,
  toggleModule,
  unsavedChangesText,
  type AdminRoleView,
  type PermissionKey,
  type PermissionModule,
  type RoleInUseDetails,
  type RoleLockedDetails,
  type RoleNameIssue,
} from '@app/domain';
import { useCallback, useEffect, useId, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { Link } from 'react-router';
import { createRole, listRoles, removeRole, renameRole, saveRolePermissions, type AdminRolesResult } from '../../api/admin-roles-client.ts';
import { Button, ConfirmDialog, FilterChipGroup, LoadingNote } from '../../components/index.ts';
import { DialogShell } from '../../components/dialog-shell.tsx';
import { copy } from '../../copy/pt-br.ts';
import { useSession } from '../../state/session.tsx';
import { useToast } from '../../state/toast.tsx';
import { LockIcon, PapeisGrid } from './papeis-grid.tsx';
import { RoleNameDialog, type RoleNameSubmitResult } from './role-name-dialog.tsx';
import { UsuariosTabs } from './usuarios-tabs.tsx';

/*
 * Story 26.10 (`mockups/prototype/screens/93-papeis.html`, approved 2026-11-21): Papéis e
 * permissões, the second tab of Usuários, behind `roles.manage` (the route guard reads the kernel's
 * screen map). Online only: the grid draws the list route's answer (the counts of users live on the
 * server). The draft is a map role id -> keys held here; "Salvar alterações" sends only the changed
 * roles in one request and redraws from its answer. Every verdict, count and sentence is the
 * kernel's; this surface holds the draft, the dialogs and the calls.
 */

const t = copy.papeis;

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; roles: AdminRoleView[] };

type Dialog =
  | null
  | { kind: 'new' }
  | { kind: 'rename'; role: AdminRoleView }
  | { kind: 'remove'; role: AdminRoleView }
  | { kind: 'in-use'; role: AdminRoleView; details: RoleInUseDetails };

const NO_ROLES: AdminRoleView[] = [];

/** `role_locked`'s details as the kernel reads them. */
function lockedDetails(details: unknown): RoleLockedDetails {
  return typeof details === 'object' && details !== null && (details as { system?: unknown }).system === true ? { system: true } : {};
}

/** `role_in_use`'s details as the kernel reads them. */
function inUseDetails(details: unknown): RoleInUseDetails {
  const raw = (typeof details === 'object' && details !== null ? details : {}) as { user_count?: unknown; user_names?: unknown };
  const names = Array.isArray(raw.user_names) ? raw.user_names.filter((name): name is string => typeof name === 'string') : [];
  return { user_count: typeof raw.user_count === 'number' ? raw.user_count : names.length, user_names: names };
}

/** `role_name_invalid`'s issue. */
function nameIssue(details: unknown): RoleNameIssue {
  const issue = typeof details === 'object' && details !== null ? (details as { issue?: unknown }).issue : undefined;
  return issue === 'too_long' ? 'too_long' : 'empty';
}

export function PapeisSurface() {
  const { online } = useSession();
  const { showToast } = useToast();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [draft, setDraft] = useState<Record<string, PermissionKey[]>>({});
  const [openModules, setOpenModules] = useState<ReadonlySet<PermissionModule>>(() => new Set());
  const [picked, setPicked] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const lineId = useId();
  const savedId = useId();

  const reload = useCallback(async () => {
    const answer = await listRoles();
    setLoad(answer.ok ? { status: 'ready', roles: answer.roles } : { status: 'failed' });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const roles = load.status === 'ready' ? load.roles : NO_ROLES;
  const changes = gridChanges(roles, draft);
  const dirty = changes.length > 0;
  const grant = managementGrantText(changes);
  const dirtyLine = `${unsavedChangesText(changes) ?? t.noChanges}${grant === null ? '' : ` ${grant}`}`;
  const many = rolesOneAtATime(roles.length);
  // The chips' default: the first role after the locked Admin column.
  const pickedId = picked !== null && roles.some((role) => role.id === picked) ? picked : (roles.find((role) => !role.locked)?.id ?? roles[0]?.id ?? null);
  const permissionsOf = (role: AdminRoleView): readonly PermissionKey[] => draft[role.id] ?? role.permissions;

  const edit = (role: AdminRoleView, next: PermissionKey[]) => {
    setSaved(false);
    setErrorLine(null);
    setDraft((current) => ({ ...current, [role.id]: next }));
  };

  /** A write's answer: the whole list redraws from it; a refusal says the kernel's line. */
  function settle(answer: AdminRolesResult): answer is Extract<AdminRolesResult, { ok: true }> {
    if (answer.ok) {
      setLoad({ status: 'ready', roles: answer.roles });
      return true;
    }
    if (answer.code === 'role_not_found') {
      setErrorLine(t.roleGone);
      void reload();
    } else if (answer.code === 'role_locked') setErrorLine(roleLockedText(lockedDetails(answer.details)));
    else setErrorLine(t.writeFailed);
    return false;
  }

  async function save() {
    if (busy || !online) return;
    const body = changedRolePermissions(roles, draft);
    if (body.length === 0) return;
    setBusy(true);
    setErrorLine(null);
    const answer = await saveRolePermissions(body);
    setBusy(false);
    if (!settle(answer)) return;
    setDraft({});
    setSaved(true);
    showToast(t.savedToast);
  }

  function discard() {
    setDraft({});
    setErrorLine(null);
    showToast(t.discardedToast);
  }

  function restore(role: AdminRoleView) {
    const restored = restoredPermissions(role);
    if (restored === null) return;
    edit(role, restored);
    showToast(t.restoredToast);
  }

  /** A name write's refusal, for the dialog: the name's issue, else a line. */
  function nameRefusal(answer: Extract<AdminRolesResult, { ok: false }>): RoleNameSubmitResult {
    if (answer.code === 'role_name_taken') return { ok: false, issue: 'taken' };
    if (answer.code === 'role_name_invalid') return { ok: false, issue: nameIssue(answer.details) };
    if (answer.code === 'role_not_found') {
      setDialog(null);
      void reload();
      return { ok: false, line: t.roleGone };
    }
    if (answer.code === 'role_locked') return { ok: false, line: roleLockedText(lockedDetails(answer.details)) };
    return { ok: false, line: t.writeFailed };
  }

  async function submitNew(name: string): Promise<RoleNameSubmitResult> {
    const before = new Set(roles.map((role) => role.id));
    const answer = await createRole(name);
    if (!answer.ok) return nameRefusal(answer);
    setLoad({ status: 'ready', roles: answer.roles });
    setSaved(false);
    // The new column is the one a phone shows next.
    setPicked(answer.roles.find((role) => !before.has(role.id))?.id ?? null);
    setDialog(null);
    showToast(t.createdToast(name));
    return { ok: true };
  }

  async function submitRename(role: AdminRoleView, name: string): Promise<RoleNameSubmitResult> {
    const answer = await renameRole(role.id, name);
    if (!answer.ok) return nameRefusal(answer);
    setLoad({ status: 'ready', roles: answer.roles });
    setDialog(null);
    showToast(t.renamedToast);
    return { ok: true };
  }

  async function doRemove(role: AdminRoleView) {
    setErrorLine(null);
    const answer = await removeRole(role.id);
    if (!answer.ok && answer.code === 'role_in_use') {
      setDialog({ kind: 'in-use', role, details: inUseDetails(answer.details) });
      return;
    }
    if (!settle(answer)) return;
    setSaved(false);
    showToast(t.removedToast);
  }

  /**
   * "Remover": a role nobody holds asks first; a role the list says is held goes straight to the
   * server, whose refusal names the holders (reading open to the owner: when the count was stale and
   * nobody holds it any more, the server removes it as asked).
   */
  function askRemove(role: AdminRoleView) {
    if (role.user_count > 0) void doRemove(role);
    else setDialog({ kind: 'remove', role });
  }

  const offline = copy.sync.offlineReason;
  const reasonId = saved ? savedId : lineId;

  return (
    <main className="screen" data-route="/usuarios/papeis">
      <UsuariosTabs selected="/usuarios/papeis" />
      <div className="screen-wrap pp-wrap">
        <div className={['content', 'pp-root', many && 'pp-many', saved && 'is-saved'].filter(Boolean).join(' ')} data-picked={pickedId ?? undefined}>
          <div className="pp-head">
            <h2>{t.heading}</h2>
            <Button variant="secondary" isDisabled={!online} disabledReason={offline} onPress={() => setDialog({ kind: 'new' })}>
              <svg className="ico" aria-hidden="true">
                <use href="/sprite.svg#i-plus" />
              </svg>
              {t.newRole}
            </Button>
          </div>
          <p className="section-note">{t.note}</p>
          <p className="section-note pp-admin-note">
            <LockIcon />
            <span>{ADMIN_ROLE_LOCKED_TEXT}</span>
          </p>
          {load.status === 'loading' ? <LoadingNote what={t.heading} /> : null}
          {load.status === 'failed' ? (
            <>
              <p className="section-note" role="alert">
                {t.loadFailed}
              </p>
              <Button variant="secondary" onPress={() => void reload()}>
                {t.retry}
              </Button>
            </>
          ) : null}
          {load.status === 'ready' ? (
            <>
              <div className="field pp-pick">
                <span className="field-label" aria-hidden="true">
                  {t.pickLabel}
                </span>
                <FilterChipGroup aria-label={t.pickLabel} options={roles.map((role) => ({ id: role.id, label: role.name }))} selectedId={pickedId} onChange={setPicked} />
              </div>
              <PapeisGrid
                roles={roles}
                permissionsOf={permissionsOf}
                changes={changes}
                openModules={openModules}
                onToggleOpen={(module) =>
                  setOpenModules((current) => {
                    const next = new Set(current);
                    if (next.has(module)) next.delete(module);
                    else next.add(module);
                    return next;
                  })
                }
                onToggleModule={(role, module) => edit(role, toggleModule(permissionsOf(role), module))}
                onToggleKey={(role, key) => edit(role, toggleKey(permissionsOf(role), key))}
                pickedId={pickedId}
                online={online}
                onRestore={restore}
                onRename={(role) => setDialog({ kind: 'rename', role })}
                onRemove={askRemove}
              />
            </>
          ) : null}
        </div>

        {/* One save for the whole grid. Unsaved: the count (and the grant warning); saved: when it takes effect. */}
        <div className="sticky-action-bar">
          <span className="btn-reason pp-dirty-line" id={lineId}>
            {dirtyLine}
          </span>
          <span className="btn-reason pp-saved-line" id={savedId} role="status">
            {saved ? t.saved : ''}
          </span>
          {errorLine === null ? null : (
            <span className="btn-reason" role="alert">
              {errorLine}
            </span>
          )}
          <div className="bar-buttons">
            <Button variant="secondary" isDisabled={!dirty} disabledReasonId={reasonId} onPress={discard}>
              {t.discard}
            </Button>
            <Button variant="primary" isDisabled={!dirty || !online} {...(!dirty ? { disabledReasonId: reasonId } : { disabledReason: offline })} onPress={() => void save()}>
              {t.save}
            </Button>
          </div>
        </div>
      </div>

      {dialog?.kind === 'new' ? <RoleNameDialog roles={roles} online={online} onSubmit={submitNew} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'rename' ? <RoleNameDialog role={dialog.role} roles={roles} online={online} onSubmit={(name) => submitRename(dialog.role, name)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'remove' ? (
        <ConfirmDialog
          isOpen
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          title={t.removeTitle(dialog.role.name)}
          description={t.removeDescription}
          confirmLabel={t.removeConfirm}
          isDestructive
          onConfirm={() => void doRemove(dialog.role)}
        />
      ) : null}
      {dialog?.kind === 'in-use' ? <InUseDialog role={dialog.role} details={dialog.details} onClose={() => setDialog(null)} /> : null}
    </main>
  );
}

/** The refusal of a removal (`#pp-dlg-remover`): who holds the role, the way to Usuários, "Entendi" focused. */
function InUseDialog({ role, details, onClose }: { role: AdminRoleView; details: RoleInUseDetails; onClose: () => void }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <DialogShell
      className="confirm-dialog pp-dialog"
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      {({ close }) => (
        <>
          <h2 className="dialog-title" id={titleId}>
            {t.inUseTitle(role.name)}
          </h2>
          <p className="t-body" id={descriptionId}>
            {roleInUseText(details)}
          </p>
          <div className="dialog-actions">
            {/* Lands on Home until batch e26d's `/usuarios` is on main (the coordinator's wiring). */}
            <Link className="btn btn-secondary" to="/usuarios">
              {t.goToUsers}
            </Link>
            <AriaButton className="btn btn-primary" autoFocus onPress={close}>
              {t.understood}
            </AriaButton>
          </div>
        </>
      )}
    </DialogShell>
  );
}
