import { render, screen, waitFor } from '@testing-library/react';
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

  it('Story 12.4: "Outro…" lands the focus in the Combobox it opens, so typing starts at once', async () => {
    render(
      <RegistryPickerField label="Fabricante" options={OPTIONS} recentIds={[]} value={null} onChange={vi.fn()} onCreate={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.keyboard('Blu');
    expect(input).toHaveValue('Blu');
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

  it('E12-Q7: "Outro…" focuses the Combobox inside the press itself, not in a later frame', async () => {
    render(
      <RegistryPickerField label="Fabricante" options={OPTIONS} recentIds={[]} value={null} onChange={vi.fn()} onCreate={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    // No waitFor: the focus is already there when the press handler returns.
    expect(screen.getByRole('combobox', { name: 'Fabricante' })).toHaveFocus();
  });

  it('E12-Q1: after "Criar" the input shows the label onCreate returns, and a blur once the entry arrives keeps it', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn(() => '15 kV');
    const matchKey = (text: string) => text.trim().replace(/\s*kv$/i, '');
    const classes = [{ id: 'c13', label: '13,8 kV' }];
    const { rerender } = render(
      <>
        <RegistryPickerField label="Tensão" options={classes} recentIds={[]} value={null} onChange={onChange} onCreate={onCreate} matchKey={matchKey} />
        <button type="button">depois</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Tensão' });
    // Typed bare, created with its unit: the input shows the created row's label, not the typed text.
    await userEvent.keyboard('15');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “15”' }));
    expect(onCreate).toHaveBeenCalledWith('15');
    expect(input).toHaveValue('15 kV');
    // The created entry arrives through the live reads, then the engineer tabs away.
    rerender(
      <>
        <RegistryPickerField
          label="Tensão"
          options={[...classes, { id: 'c15', label: '15 kV' }]}
          recentIds={['c15']}
          value="c15"
          onChange={onChange}
          onCreate={onCreate}
          matchKey={matchKey}
        />
        <button type="button">depois</button>
      </>,
    );
    input.focus();
    await userEvent.tab();
    expect(input).toHaveValue('15 kV');
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  it('E12-Q1: a match key folds the unit, so an existing "15 kV" offers no "Criar" for a typed "15"', async () => {
    const matchKey = (text: string) => text.trim().replace(/\s*kv$/i, '');
    render(
      <RegistryPickerField label="Tensão" options={[{ id: 'c15', label: '15 kV' }]} recentIds={[]} value={null} onChange={vi.fn()} onCreate={vi.fn()} matchKey={matchKey} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('15');
    expect(await screen.findByRole('option', { name: '15 kV' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Criar/ })).not.toBeInTheDocument();
  });
});
