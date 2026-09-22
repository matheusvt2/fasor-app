import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Tabs } from './tabs.tsx';

const ITEMS = [
  { id: 'empresa', label: 'Empresa', panel: <p>Dados da empresa</p> },
  { id: 'clientes', label: 'Clientes', panel: <p>Lista de clientes</p> },
];

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
});
