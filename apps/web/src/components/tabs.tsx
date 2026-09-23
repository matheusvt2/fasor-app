import { Button, Menu, MenuItem, MenuTrigger, Popover, Tab, TabList, TabPanel, Tabs as AriaTabs } from 'react-aria-components';
import { relabelDismissButtons } from './dismiss-label.ts';

export interface TabItem {
  id: string;
  label: string;
  panel: React.ReactNode;
}

export interface TabsProps {
  items: ReadonlyArray<TabItem>;
  selectedId?: string;
  onSelectionChange?: (id: string) => void;
  'aria-label': string;
}

/**
 * `tablist`/`tab`/`tabpanel` (`.tabs-desktop`) at 768px+; arrow keys move between tabs and
 * the panel follows selection immediately (Component Patterns › Tabs). Below 768px the
 * six-tab strip would wrap to three rows and crowd out the panel, so `.tabs-phone` — a
 * one-row `MenuTrigger`/`Menu`/`Popover` selector, the same primitives `OverflowMenu` uses
 * — replaces it. Both stay permanently mounted; CSS alone (`app.css`) picks one per
 * viewport (Boundaries: never a JS `matchMedia` switch, the same CSS-only pattern
 * `RegistryPickerField` already uses), so assistive tech only ever sees one.
 */
export function Tabs({ items, selectedId, onSelectionChange, 'aria-label': ariaLabel }: TabsProps) {
  const selectedItem = items.find((item) => item.id === selectedId) ?? items[0];

  return (
    <AriaTabs selectedKey={selectedId} onSelectionChange={(key) => onSelectionChange?.(String(key))}>
      <TabList aria-label={ariaLabel} className="tabs tabs-desktop">
        {items.map((item) => (
          <Tab key={item.id} id={item.id} className="tab">
            {item.label}
          </Tab>
        ))}
      </TabList>
      <div className="tabs-phone">
        <MenuTrigger>
          {/* The trigger's only text content is the current tab's label, so its accessible
              name equals the visible text with no extra `aria-label` (AC1); the chevron is
              `aria-hidden` and adds nothing to that name. Same disclosure affordance as
              `Combobox`'s `.combobox-chevron` (`combobox.tsx`), reused here rather than
              invented. */}
          <Button className="tab-select-trigger">
            <span>{selectedItem?.label}</span>
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
          <Popover ref={relabelDismissButtons}>
            {/* React Aria labels the menu by its trigger (the current tab's name)
                automatically, the same as `OverflowMenu`'s Popover -- no extra `aria-label`. */}
            <Menu
              className="overflow-menu"
              selectionMode="single"
              selectedKeys={selectedItem ? new Set([selectedItem.id]) : new Set<string>()}
              onAction={(key) => onSelectionChange?.(String(key))}
            >
              {items.map((item) => (
                <MenuItem key={item.id} id={item.id} className="menu-item" textValue={item.label}>
                  {item.label}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id}>
          {item.panel}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}
