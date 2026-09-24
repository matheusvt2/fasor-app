import { Button, Menu, MenuItem, MenuSection, MenuTrigger, Popover } from 'react-aria-components';
import { relabelDismissButtons } from './dismiss-label.ts';
import { ui } from '../copy/ui';

export interface OverflowMenuAction {
  id: string;
  label: string;
  onAction: () => void;
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
 * (Component Patterns › Overflow menu) — all built into `MenuTrigger`/`Menu`.
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
          onAction={(key) => actionsById.get(String(key))?.onAction()}
        >
          {items.map((item) => (
            <MenuItem key={item.id} id={item.id} className="menu-item" textValue={item.label}>
              {item.label}
            </MenuItem>
          ))}
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
