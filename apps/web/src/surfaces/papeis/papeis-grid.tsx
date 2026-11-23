import {
  keyCellLabel,
  moduleCellLabel,
  moduleCountText,
  moduleState,
  permissionKeyHelp,
  permissionKeyLabel,
  permissionKeysOf,
  permissionModuleHelp,
  permissionModuleName,
  PERMISSION_MODULES,
  roleHeadMeta,
  SYSTEM_ROLE_LOCKED_TEXT,
  type AdminRoleView,
  type GridChange,
  type PermissionKey,
  type PermissionModule,
} from '@app/domain';
import { Button as AriaButton, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import { OverlayHistory } from '../../state/overlay-history.ts';
import { relabelDismissButtons } from '../../components/dismiss-label.ts';
import { OVERFLOW_MENU_PLACEMENT } from '../../components/overflow-menu.tsx';
import { copy } from '../../copy/pt-br.ts';
import { spriteHref } from '../../styles/sprite.ts';

/*
 * Story 26.10 (`mockups/prototype/screens/93-papeis.html`): the grid of Papéis e permissões, roles
 * as columns in the list's order, modules as rows, a module of several keys opening into its keys.
 * The mock's markup and class names. Every state, count, name and sentence is the kernel's
 * (`permissions/role-editor.ts`, `permissions/keys.ts`); this file only draws them and passes the
 * taps up. The locked Admin column (`locked`) draws every switch on and `aria-disabled`; a tap on it
 * does nothing. A cell the draft changed carries `is-changed` and the hidden words.
 */

const t = copy.papeis;

/** The frame's `i-lock` symbol, inline (the app's sprite holds no lock). */
export function LockIcon() {
  return (
    <svg className="ico ico-sm" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ChevronDown({ className = 'ico ico-sm' }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={spriteHref('i-chev-down')} />
    </svg>
  );
}

const classes = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

export interface PapeisGridProps {
  roles: readonly AdminRoleView[];
  /** The keys a role shows: its draft, else its saved set. */
  permissionsOf: (role: AdminRoleView) => readonly PermissionKey[];
  /** The kernel's unsaved changes (`gridChanges`). */
  changes: readonly GridChange[];
  openModules: ReadonlySet<PermissionModule>;
  onToggleOpen: (module: PermissionModule) => void;
  onToggleModule: (role: AdminRoleView, module: PermissionModule) => void;
  onToggleKey: (role: AdminRoleView, key: PermissionKey) => void;
  /** The role the chips picked: every other column carries `is-unpicked` (hidden when one role shows at a time). */
  pickedId: string | null;
  online: boolean;
  onRestore: (role: AdminRoleView) => void;
  onRename: (role: AdminRoleView) => void;
  onRemove: (role: AdminRoleView) => void;
}

export function PapeisGrid(props: PapeisGridProps) {
  const { roles, changes, openModules, pickedId } = props;
  const changed = new Set(changes.map((change) => `${change.role_id} ${change.key}`));
  const unpicked = (role: AdminRoleView) => pickedId !== null && role.id !== pickedId && 'is-unpicked';

  return (
    <table className="pp-grid" aria-label={t.gridLabel}>
      <thead>
        <tr>
          <th className="pp-corner" scope="col">
            {t.corner}
          </th>
          {roles.map((role) => (
            <th key={role.id} className={classes('pp-role', unpicked(role))} data-role={role.id} scope="col">
              {role.locked ? (
                <span className="pp-role-name">
                  <LockIcon />
                  {role.name}
                </span>
              ) : (
                <RoleMenu role={role} online={props.online} onRestore={props.onRestore} onRename={props.onRename} onRemove={props.onRemove} />
              )}
              <span className="pp-role-meta">{roleHeadMeta(role.user_count, role.system === null)}</span>
            </th>
          ))}
        </tr>
      </thead>
      {PERMISSION_MODULES.map((module) => {
        const keys = permissionKeysOf(module);
        const only = keys.length < 2 ? keys[0] : undefined;
        const isOpen = openModules.has(module);
        const name = permissionModuleName(module);
        const text = (
          <span className="pp-mod-text">
            <span className="pp-mod-name">{name}</span>
            <span className="pp-mod-meta">{permissionModuleHelp(module)}</span>
          </span>
        );
        return (
          <tbody key={module} className={classes('pp-module', isOpen && 'is-open')} data-module={module}>
            <tr className="pp-mod-row">
              <th className={classes('pp-label', only !== undefined && 'pp-single')} scope="row">
                {only !== undefined ? (
                  <span className="pp-mod-toggle">
                    <span className="pp-chev-space" aria-hidden="true" />
                    {text}
                  </span>
                ) : (
                  <button type="button" className="pp-mod-toggle" aria-expanded={isOpen} aria-label={t.moduleToggleLabel(name)} onClick={() => props.onToggleOpen(module)}>
                    <ChevronDown className="ico pp-chev" />
                    {text}
                  </button>
                )}
              </th>
              {roles.map((role) =>
                only !== undefined ? (
                  <KeyCell key={role.id} role={role} permissionKey={only} on={props.permissionsOf(role).includes(only)} changed={changed.has(`${role.id} ${only}`)} unpicked={unpicked(role)} onToggle={props.onToggleKey} />
                ) : (
                  <ModuleCell
                    key={role.id}
                    role={role}
                    module={module}
                    permissions={props.permissionsOf(role)}
                    changed={keys.some((key) => changed.has(`${role.id} ${key}`))}
                    unpicked={unpicked(role)}
                    onToggle={props.onToggleModule}
                  />
                ),
              )}
            </tr>
            {only !== undefined
              ? null
              : keys.map((key) => {
                  const help = permissionKeyHelp(key);
                  return (
                    <tr key={key} className="pp-key-row">
                      <th className="pp-label pp-key" scope="row">
                        <span className="pp-key-name">{permissionKeyLabel(key)}</span>
                        {help === null ? null : <span className="pp-key-help">{help}</span>}
                      </th>
                      {roles.map((role) => (
                        <KeyCell key={role.id} role={role} permissionKey={key} on={props.permissionsOf(role).includes(key)} changed={changed.has(`${role.id} ${key}`)} unpicked={unpicked(role)} onToggle={props.onToggleKey} />
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        );
      })}
    </table>
  );
}

function Track() {
  return (
    <span className="track" aria-hidden="true">
      <span className="knob" />
    </span>
  );
}

function KeyCell({
  role,
  permissionKey,
  on,
  changed,
  unpicked,
  onToggle,
}: {
  role: AdminRoleView;
  permissionKey: PermissionKey;
  on: boolean;
  changed: boolean;
  unpicked: string | false;
  onToggle: (role: AdminRoleView, key: PermissionKey) => void;
}) {
  return (
    <td className={classes('pp-cell', changed && 'is-changed', unpicked)} data-role={role.id}>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={on}
        aria-disabled={role.locked || undefined}
        aria-label={keyCellLabel(permissionKey, role.name, role.locked)}
        onClick={() => {
          if (!role.locked) onToggle(role, permissionKey);
        }}
      >
        <Track />
      </button>
      {changed ? <span className="visually-hidden">{t.changedHidden}</span> : null}
    </td>
  );
}

function ModuleCell({
  role,
  module,
  permissions,
  changed,
  unpicked,
  onToggle,
}: {
  role: AdminRoleView;
  module: PermissionModule;
  permissions: readonly PermissionKey[];
  changed: boolean;
  unpicked: string | false;
  onToggle: (role: AdminRoleView, module: PermissionModule) => void;
}) {
  const state = moduleState(permissions, module);
  return (
    <td className={classes('pp-cell', changed && 'is-changed', unpicked)} data-role={role.id}>
      <button
        type="button"
        className="toggle pp-mod"
        role="checkbox"
        aria-checked={state.state === 'mixed' ? 'mixed' : state.state === 'on'}
        aria-disabled={role.locked || undefined}
        aria-label={moduleCellLabel(module, role.name, role.locked, state)}
        onClick={() => {
          if (!role.locked) onToggle(role, module);
        }}
      >
        <Track />
      </button>
      {state.state === 'mixed' ? (
        <span className="pp-count" aria-hidden="true">
          {moduleCountText(state)}
        </span>
      ) : null}
      {changed ? <span className="visually-hidden">{t.changedHidden}</span> : null}
    </td>
  );
}

/**
 * A role head's menu (`.pp-role-btn`): a seeded role offers "Restaurar permissões padrão" with the
 * line that it is never renamed nor removed; a custom role offers "Renomear" and "Remover" (its own
 * destructive group), both writes, so disabled offline with the app's offline reason.
 */
function RoleMenu({
  role,
  online,
  onRestore,
  onRename,
  onRemove,
}: {
  role: AdminRoleView;
  online: boolean;
  onRestore: (role: AdminRoleView) => void;
  onRename: (role: AdminRoleView) => void;
  onRemove: (role: AdminRoleView) => void;
}) {
  const seeded = role.system !== null;
  return (
    <MenuTrigger>
      <AriaButton className="pp-role-btn" aria-label={t.roleMenuLabel(role.name)}>
        {role.name}
        <ChevronDown />
      </AriaButton>
      <Popover ref={relabelDismissButtons} placement={OVERFLOW_MENU_PLACEMENT} className="overflow-menu pp-role-menu">
        {/* Story 29.2: the device's back closes the open menu and nothing else. */}
        <OverlayHistory />
        {seeded ? (
          <>
            <Menu onAction={() => onRestore(role)}>
              <MenuItem id="restore" className="menu-item" textValue={t.restore}>
                {t.restore}
              </MenuItem>
            </Menu>
            <p className="btn-reason">{SYSTEM_ROLE_LOCKED_TEXT}</p>
          </>
        ) : (
          <>
            <Menu
              {...(online ? {} : { disabledKeys: ['rename', 'remove'] })}
              onAction={(key) => {
                if (!online) return;
                if (key === 'rename') onRename(role);
                else if (key === 'remove') onRemove(role);
              }}
            >
              <MenuItem id="rename" className="menu-item" textValue={t.rename}>
                {t.rename}
              </MenuItem>
              <MenuSection className="menu-group">
                <MenuItem id="remove" className="menu-item" data-tone="red" textValue={t.remove}>
                  {t.remove}
                </MenuItem>
              </MenuSection>
            </Menu>
            {online ? null : <p className="btn-reason">{copy.sync.offlineReason}</p>}
          </>
        )}
      </Popover>
    </MenuTrigger>
  );
}
