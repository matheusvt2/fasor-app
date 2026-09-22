import { Tab, TabList, TabPanel, Tabs as AriaTabs } from 'react-aria-components';

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
 * `tablist`/`tab`/`tabpanel`; arrow keys move between tabs and the panel follows selection
 * immediately (Component Patterns › Tabs). `.tabs` wraps to a second line, never scrolls.
 */
export function Tabs({ items, selectedId, onSelectionChange, 'aria-label': ariaLabel }: TabsProps) {
  return (
    <AriaTabs selectedKey={selectedId} onSelectionChange={(key) => onSelectionChange?.(String(key))}>
      <TabList aria-label={ariaLabel} className="tabs">
        {items.map((item) => (
          <Tab key={item.id} id={item.id} className="tab">
            {item.label}
          </Tab>
        ))}
      </TabList>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id}>
          {item.panel}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}
