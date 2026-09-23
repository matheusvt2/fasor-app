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
    // Typing alone opens the list, "Criar" and all: no option matches, and the list still
    // opens for it (Epic 2 retro D-2).
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Blutrafos”' }));
    expect(onCreate).toHaveBeenCalledWith('Blutrafos');
  });

  it('offers no "Criar" for a name the registry already holds, whatever its case or accents', async () => {
    render(
      <RegistryPickerField label="Fabricante" options={OPTIONS} recentIds={[]} value={null} onChange={vi.fn()} onCreate={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.type(screen.getByRole('combobox', { name: 'Fabricante' }), ' SCHNEIDER ');
    // The entry matches the trimmed text and is offered; "Criar" is not.
    expect(await screen.findByRole('option', { name: 'Schneider' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Criar/ })).not.toBeInTheDocument();
  });

  it('shows the stored by-value text in the Combobox from the first render', () => {
    render(
      <RegistryPickerField
        label="Fabricante"
        options={OPTIONS}
        recentIds={[]}
        value={null}
        initialText="Instrum"
        onChange={vi.fn()}
        onCreate={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Fabricante', hidden: true })).toHaveValue('Instrum');
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
