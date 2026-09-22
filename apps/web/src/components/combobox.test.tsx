import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Combobox } from './combobox.tsx';

const MANUFACTURERS = [
  { id: 'schneider', label: 'Schneider' },
  { id: 'instrum', label: 'Instrum' },
];

function openList() {
  return userEvent.click(screen.getByRole('button', { name: /Abrir lista/ }));
}

describe('Combobox', () => {
  it('renders the field shell with the mockups classes and lists every option', async () => {
    render(<Combobox label="Fabricante" options={MANUFACTURERS} />);
    expect(screen.getByText('Fabricante')).toHaveClass('field-label');
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    expect(input).toHaveClass('input');

    await openList();
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Schneider', 'Instrum']);
  });

  it('offers a trailing "Criar" option last for text with no match', async () => {
    render(<Combobox label="Fabricante" options={[]} inputValue="Blutrafos" onInputChange={vi.fn()} onCreate={vi.fn()} />);
    await openList();

    const createOption = screen.getByRole('option', { name: 'Criar “Blutrafos”' });
    expect(createOption).toHaveClass('combobox-option', 'is-create');
    expect(createOption).toHaveTextContent('Criar “Blutrafos”');
  });

  it('selecting the create option calls onCreate with the typed text', async () => {
    const onCreate = vi.fn();
    render(<Combobox label="Fabricante" options={[]} inputValue="Blutrafos" onInputChange={vi.fn()} onCreate={onCreate} />);
    await openList();
    await userEvent.click(screen.getByRole('option', { name: 'Criar “Blutrafos”' }));
    expect(onCreate).toHaveBeenCalledWith('Blutrafos');
  });

  it('choosing an existing option reports its key', async () => {
    const onSelectionChange = vi.fn();
    render(<Combobox label="Fabricante" options={MANUFACTURERS} onSelectionChange={onSelectionChange} />);
    await openList();
    await userEvent.click(screen.getByRole('option', { name: 'Schneider' }));
    expect(onSelectionChange).toHaveBeenCalledWith('schneider');
  });

  it('is aria-disabled with a linked reason', () => {
    render(<Combobox label="Fabricante" options={[]} isDisabled disabledReason="Cadastro indisponível offline" />);
    expect(screen.getByText('Cadastro indisponível offline')).toHaveClass('btn-reason');
  });

  it('links the reason via aria-describedby on the input', () => {
    render(<Combobox label="Fabricante" options={[]} isDisabled disabledReason="Cadastro indisponível offline" />);
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    expect(input).toHaveAccessibleDescription('Cadastro indisponível offline');
  });

  it('throws when disabled without a reason (component-level invariant)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Combobox label="Fabricante" options={[]} isDisabled />)).toThrow(/disabledReason/);
    spy.mockRestore();
  });

  it('blocks selection and typing while disabled, without removing the field from the tab order', async () => {
    const onSelectionChange = vi.fn();
    const onInputChange = vi.fn();
    render(
      <Combobox
        label="Fabricante"
        options={MANUFACTURERS}
        isDisabled
        disabledReason="Cadastro indisponível offline"
        inputValue=""
        onInputChange={onInputChange}
        onSelectionChange={onSelectionChange}
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    expect(input).toHaveAttribute('aria-disabled', 'true');

    input.focus();
    expect(input).toHaveFocus();

    await userEvent.type(input, 'S');
    expect(onInputChange).not.toHaveBeenCalled();
  });
});
