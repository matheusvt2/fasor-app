import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, type TabItem } from './tabs.tsx';

const ITEMS = [
  { id: 'empresa', label: 'Empresa', panel: <p>Dados da empresa</p> },
  { id: 'clientes', label: 'Clientes', panel: <p>Lista de clientes</p> },
  { id: 'instrumentos', label: 'Instrumentos', panel: <p>Lista de instrumentos</p> },
  { id: 'fabricantes', label: 'Fabricantes', panel: <p>Lista de fabricantes</p> },
  { id: 'classes-tensao', label: 'Classes de tensão', panel: <p>Lista de classes de tensão</p> },
  { id: 'criterios', label: 'Critérios de aceitação', panel: <p>Tabela de critérios</p> },
];

/** A controlled harness so a real selection change is reflected back into `selectedId`,
 * the same round trip `RegistriesSurface` does through `writeRegistryTab`. */
function ControlledTabs({ items, onSelectionChange }: { items: ReadonlyArray<TabItem>; onSelectionChange: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  return (
    <Tabs
      items={items}
      selectedId={selectedId}
      onSelectionChange={(id) => {
        setSelectedId(id);
        onSelectionChange(id);
      }}
      aria-label="Cadastros"
    />
  );
}

describe('Tabs', () => {
  it('renders a tablist/tab/tabpanel with the panel following the selected tab', async () => {
    const onSelectionChange = vi.fn();
    render(<Tabs items={ITEMS} selectedId="empresa" onSelectionChange={onSelectionChange} aria-label="Cadastros" />);

    const tablist = screen.getByRole('tablist', { name: 'Cadastros' });
    expect(tablist).toHaveClass('tabs');
    const empresaTab = screen.getByRole('tab', { name: 'Empresa' });
    expect(empresaTab).toHaveClass('tab');
    expect(empresaTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Dados da empresa');

    await userEvent.click(screen.getByRole('tab', { name: 'Clientes' }));
    expect(onSelectionChange).toHaveBeenCalledWith('clientes');
  });

  it('renders a one-row phone selector whose accessible name is the current tab, with a menu of all six', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(<ControlledTabs items={ITEMS} onSelectionChange={onSelectionChange} />);

    const trigger = screen.getByRole('button', { name: 'Empresa' });
    await user.click(trigger);

    // React Aria labels the menu by its trigger (the current tab's name) rather than by
    // the `aria-label` passed to `Menu`, so the menu's accessible name tracks the trigger.
    const menu = screen.getByRole('menu', { name: 'Empresa' });
    const menuItems = within(menu).getAllByRole('menuitemradio');
    expect(menuItems).toHaveLength(6);
    expect(menuItems.map((item) => item.textContent)).toEqual([
      'Empresa',
      'Clientes',
      'Instrumentos',
      'Fabricantes',
      'Classes de tensão',
      'Critérios de aceitação',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Empresa' })).toHaveAttribute('aria-checked', 'true');

    // Arrow keys move focus among the items.
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'Clientes' })).toHaveFocus();

    // Esc closes the menu and returns focus to the trigger.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());

    // Choosing a different tab notifies the parent and the trigger's name updates.
    await user.click(trigger);
    await user.click(screen.getByRole('menuitemradio', { name: 'Fabricantes' }));
    expect(onSelectionChange).toHaveBeenCalledWith('fabricantes');
    expect(screen.getByRole('button', { name: 'Fabricantes' })).toBeInTheDocument();
  });

  it('opens the phone selector on Enter or Space when the trigger is focused (AC2)', async () => {
    const user = userEvent.setup();
    render(<ControlledTabs items={ITEMS} onSelectionChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Empresa' });
    trigger.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard(' ');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
