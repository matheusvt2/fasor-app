import { Button, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import { relabelDismissButtons } from './dismiss-label.ts';
import { ui } from '../copy/ui';

export interface OverflowMenuAction {
  id: string;
  label: string;
  onAction: () => void;
  /**
   * Present on a toggle item ("Agrupar por tipo na seção 9"): the item is a
   * `menuitemcheckbox` whose `aria-checked` is this value, and a press calls `onAction`.
   */
  checked?: boolean;
}

export interface OverflowMenuProps {
  /** The object this menu acts on, used in the trigger's accessible name. */
  name: string;
  items: ReadonlyArray<OverflowMenuAction>;
  /** Rendered last, inside their own `.menu-group` (Boundaries: destructive is always last). */
  destructiveItems?: ReadonlyArray<OverflowMenuAction>;
  /** The trigger's whole accessible name, when the "Mais opções de ⟨nome⟩" template does not fit ("Mais opções do relatório"). */
  label?: string;
}

/**
 * Opens on tap or Enter; arrow keys move, Esc closes and returns focus to the trigger
 * (Component Patterns › Overflow menu) — all built into `MenuTrigger`/`Menu`. A toggle
 * item sits in its own selection section, so React Aria gives it the checkbox role and
 * state while every other item stays a plain `menuitem`.
 */
export function OverflowMenu({ name, items, destructiveItems = [], label }: OverflowMenuProps) {
  const actionsById = new Map([...items, ...destructiveItems].map((item) => [item.id, item]));

  return (
    <MenuTrigger>
      <Button className="overflow-trigger" aria-label={label ?? ui.overflowMenu.triggerLabel(name)}>
        <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      </Button>
      <Popover ref={relabelDismissButtons}>
        <Menu
          className="overflow-menu"
          onAction={(key) => {
            const item = actionsById.get(String(key));
            // A toggle item answers through its section's selection change instead.
            if (item !== undefined && item.checked === undefined) item.onAction();
          }}
        >
          {items.map((item) =>
            item.checked === undefined ? (
              <MenuItem key={item.id} id={item.id} className="menu-item" textValue={item.label}>
                {item.label}
              </MenuItem>
            ) : (
              <MenuSection
                key={item.id}
                className="menu-toggle-group"
                aria-label={item.label}
                selectionMode="multiple"
                selectedKeys={item.checked ? [item.id] : []}
                onSelectionChange={() => item.onAction()}
                shouldCloseOnSelect
              >
                <MenuItem id={item.id} className="menu-item" textValue={item.label}>
                  {item.label}
                </MenuItem>
              </MenuSection>
            ),
          )}
          {destructiveItems.length > 0 ? (
            <MenuSection className="menu-group">
              {destructiveItems.map((item) => (
                <MenuItem
                  key={item.id}
                  id={item.id}
                  className="menu-item"
                  data-tone="red"
                  textValue={item.label}
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuSection>
          ) : null}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
