import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RegistryPickerField } from './registry-picker-field.tsx';

const OPTIONS = [
  { id: 'schneider', label: 'Schneider' },
  { id: 'siemens', label: 'Siemens' },
  { id: 'weg', label: 'WEG' },
];

describe('RegistryPickerField', () => {
  it('renders the recent ids as chips, most recent first, up to 5', async () => {
    render(
      <RegistryPickerField
        label="Fabricante"
        options={OPTIONS}
        recentIds={['schneider', 'siemens']}
        value={null}
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Schneider' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siemens' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'WEG' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outro…' })).toBeInTheDocument();
  });

  it('tapping a recent chip calls onChange with its id', async () => {
    const onChange = vi.fn();
    render(
      <RegistryPickerField
        label="Fabricante"
        options={OPTIONS}
        recentIds={['schneider']}
        value={null}
        onChange={onChange}
        onCreate={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Schneider' }));
    expect(onChange).toHaveBeenCalledWith('schneider');
  });

  it('the Combobox is not reachable until "Outro…" is tapped', async () => {
    render(
      <RegistryPickerField label="Fabricante" options={OPTIONS} recentIds={[]} value={null} onChange={vi.fn()} onCreate={vi.fn()} />,
    );
    expect(screen.queryByRole('combobox', { name: 'Fabricante' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    expect(screen.getByRole('combobox', { name: 'Fabricante' })).toBeInTheDocument();
  });

  it('typing an unmatched name and choosing "Criar…" calls onCreate with the trimmed text', async () => {
    const onCreate = vi.fn();
    function Harness() {
      return (
        <RegistryPickerField
          label="Fabricante"
          options={OPTIONS}
          recentIds={[]}
          value={null}
          onChange={vi.fn()}
          onCreate={onCreate}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.type(input, '  Blutrafos  ');
    await userEvent.click(screen.getByRole('button', { name: /Abrir lista/ }));
    await userEvent.click(screen.getByRole('option', { name: 'Criar “Blutrafos”' }));
    expect(onCreate).toHaveBeenCalledWith('Blutrafos');
  });

  it('once the caller adds the created entry to options, it renders selectable at once', () => {
    const { rerender } = render(
      <RegistryPickerField
        label="Fabricante"
        options={OPTIONS}
        recentIds={[]}
        value={null}
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    const grown = [...OPTIONS, { id: 'blutrafos', label: 'Blutrafos' }];
    rerender(
      <RegistryPickerField
        label="Fabricante"
        options={grown}
        recentIds={['blutrafos']}
        value="blutrafos"
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Blutrafos', pressed: true })).toBeInTheDocument();
  });
});
