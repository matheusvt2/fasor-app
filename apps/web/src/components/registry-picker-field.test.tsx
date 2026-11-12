import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('F-07: a value set from outside ("Igual à", an undo, a pull) shows in the field at once; typing is never replaced', async () => {
    const props = { label: 'Fabricante', options: OPTIONS, recentIds: [], onChange: vi.fn(), onCreate: vi.fn() };
    const { rerender } = render(<RegistryPickerField {...props} value={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    expect(input).toHaveValue('');
    input.blur();
    rerender(<RegistryPickerField {...props} value="siemens" />);
    expect(input).toHaveValue('Siemens');
    // A by-value text the registry does not hold (a copied manufacturer) shows as it is.
    rerender(<RegistryPickerField {...props} value={null} initialText="Celtta" />);
    expect(input).toHaveValue('Celtta');
    // While the engineer types, a value landing elsewhere does not rewrite the text.
    await userEvent.clear(input);
    await userEvent.type(input, 'We');
    rerender(<RegistryPickerField {...props} value="schneider" />);
    expect(input).toHaveValue('We');
  });

  it('F-09: with nothing registered, the empty-list hint says how to add one; gone once an entry exists', () => {
    const props = { label: 'Tensão de placa', recentIds: [], value: null, onChange: vi.fn(), onCreate: vi.fn(), emptyHint: 'Nenhuma classe de tensão cadastrada ainda — digite o valor em kV para criar' };
    const { rerender } = render(<RegistryPickerField {...props} options={[]} />);
    expect(screen.getByText(props.emptyHint)).toHaveClass('helper');
    rerender(<RegistryPickerField {...props} options={[{ id: 'kv15', label: '15 kV' }]} />);
    expect(screen.queryByText(props.emptyHint)).toBeNull();
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

/*
 * Review fixes 2026-10-08 (DH-1): a name typed under "Outro…" and left (a tap elsewhere, Tab,
 * Escape then a tap) is kept as "Criar" would keep it: an entry it names is selected, a new
 * name is created once.
 */
describe('R8LAY DH-1 typed text left in the field', () => {
  function field(props: { onChange?: (id: string | null) => void; onCreate?: (text: string) => string | null | void; value?: string | null; options?: typeof OPTIONS }) {
    return (
      <>
        <RegistryPickerField
          label="Fabricante"
          options={props.options ?? OPTIONS}
          recentIds={[]}
          value={props.value ?? null}
          onChange={props.onChange ?? vi.fn()}
          onCreate={props.onCreate ?? vi.fn()}
        />
        <button type="button">Nome</button>
      </>
    );
  }

  it('an unmatched name left with a tap elsewhere is created once, as "Criar" does', async () => {
    const onCreate = vi.fn();
    const { rerender } = render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.keyboard('Megabras ');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Megabras');
    expect(input).toHaveValue('Megabras');
    // A later leave while the created entry has not landed creates nothing more.
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCreate).toHaveBeenCalledTimes(1);
    // Once it lands it is the field's selected entry; leaving again changes nothing.
    rerender(field({ onCreate, value: 'megabras', options: [...OPTIONS, { id: 'megabras', label: 'Megabras' }] }));
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('"Criar" then leaving creates nothing a second time', async () => {
    const onCreate = vi.fn();
    render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Megabras');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Megabras”' }));
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('Escape then a tap elsewhere behaves as leaving', async () => {
    const onCreate = vi.fn();
    render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Megabras');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Megabras');
  });

  it('a name matching an entry whatever its case selects it, with no new word', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();
    render(field({ onChange, onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.keyboard('siemens');
    await userEvent.click(screen.getByText('Nome'));
    expect(onChange).toHaveBeenLastCalledWith('siemens');
    expect(onCreate).not.toHaveBeenCalled();
    expect(input).toHaveValue('Siemens');
  });

  it('a stored by-value name focused and left untouched creates and changes nothing', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();
    render(
      <>
        <RegistryPickerField label="Fabricante" options={OPTIONS} recentIds={[]} value={null} initialText="Hi-Tech" onChange={onChange} onCreate={onCreate} />
        <button type="button">Nome</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    expect(screen.getByRole('combobox', { name: 'Fabricante' })).toHaveValue('Hi-Tech');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    // Typing is what makes it the engineer's text.
    await userEvent.click(screen.getByRole('combobox', { name: 'Fabricante' }));
    await userEvent.keyboard('X');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledWith('Hi-TechX');
  });

  it('a window blur (lock, app switch) mid-typing creates nothing; back in the field, the finished name left creates one word', async () => {
    const onCreate = vi.fn();
    render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.keyboard('Mega');
    // The window loses the focus: a focusout with no related target while the input stays the active element.
    fireEvent.blur(input, { relatedTarget: null });
    expect(input).toHaveFocus();
    expect(onCreate).not.toHaveBeenCalled();
    // The window comes back: a focus with no related target, then the name finished and left.
    fireEvent.focus(input, { relatedTarget: null });
    await userEvent.keyboard('bras');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Megabras');
  });

  it('a new name typed over a registered one and left writes the create alone, never a clear first', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();
    render(field({ onChange, onCreate, value: 'siemens' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.clear(input);
    await userEvent.keyboard('Megabras');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Megabras');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a text whose create the caller refused (null) is tried again on the next leave', async () => {
    const onCreate = vi.fn((): string | null => null);
    render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.keyboard('abc');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    await userEvent.click(input);
    await userEvent.keyboard('d');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate).toHaveBeenLastCalledWith('abcd');
  });

  it('a created word that landed and left the list again is created again by the next leave', async () => {
    const onCreate = vi.fn();
    const { rerender } = render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.keyboard('Megabras');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    rerender(field({ onCreate, options: [...OPTIONS, { id: 'megabras', label: 'Megabras' }] }));
    // Archived elsewhere: gone from the list while the field stays mounted.
    rerender(field({ onCreate }));
    await userEvent.click(input);
    await userEvent.keyboard(' ');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).toHaveBeenCalledTimes(2);
  });

  it('an emptied field keeps today\'s behaviour: nothing created', async () => {
    const onCreate = vi.fn();
    render(field({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Me{Backspace}{Backspace}');
    await userEvent.click(screen.getByText('Nome'));
    expect(onCreate).not.toHaveBeenCalled();
  });
});

/*
 * Story 25.2 (M02): a sheet left while FABRICAÇÃO holds the focus (the tree, "Voltar", the stepper: no blur first)
 * decides as a leave does, and an emptied field left writes the clear (`onClear`), also for a name the registry does
 * not hold.
 */
describe('25.2-WEB the manufacturer typed and left with the sheet', () => {
  function picker(props: { onChange?: (id: string | null) => void; onCreate?: (text: string) => string | null | void; onClear?: () => void; value?: string | null; initialText?: string; options?: typeof OPTIONS }) {
    return (
      <>
        <RegistryPickerField
          label="Fabricante"
          options={props.options ?? OPTIONS}
          recentIds={[]}
          value={props.value ?? null}
          {...(props.initialText === undefined ? {} : { initialText: props.initialText })}
          onChange={props.onChange ?? vi.fn()}
          onCreate={props.onCreate ?? vi.fn()}
          {...(props.onClear === undefined ? {} : { onClear: props.onClear })}
        />
        <button type="button">Nome</button>
      </>
    );
  }

  it('a name the registry holds, typed with the focus still in the field, is selected when the field unmounts', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();
    const { unmount } = render(picker({ onChange, onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('siemens');
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('siemens');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('an option picked with the focus kept in the field is its new baseline: the unmount that follows writes it no second time', async () => {
    const onChange = vi.fn();
    const { unmount } = render(picker({ onChange }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('sie');
    await userEvent.click(await screen.findByRole('option', { name: 'Siemens' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('siemens');
  });

  it('a new name is created once when the field unmounts, and not again after "Criar"', async () => {
    const onCreate = vi.fn();
    const first = render(picker({ onCreate }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Megabras');
    first.unmount();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith('Megabras');

    const created = vi.fn();
    const second = render(picker({ onCreate: created }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Celtta');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Celtta”' }));
    expect(created).toHaveBeenCalledTimes(1);
    second.unmount();
    expect(created).toHaveBeenCalledTimes(1);
  });

  it('a stored name focused and left untouched writes nothing when the field unmounts', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn();
    const onClear = vi.fn();
    const { unmount } = render(picker({ onChange, onCreate, onClear, initialText: 'Hi-Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    expect(screen.getByRole('combobox', { name: 'Fabricante' })).toHaveValue('Hi-Tech');
    unmount();
    expect(onChange).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('a stored name the registry does not hold, emptied and left, is cleared once', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(picker({ onChange, onClear, initialText: 'Hi-Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.clear(input);
    await userEvent.click(screen.getByText('Nome'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith(expect.any(String));
    expect(input).toHaveValue('');
  });

  it('a registered name emptied and left is cleared, and the stored entry is not written back', async () => {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(picker({ onChange, onClear, value: 'siemens' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    await userEvent.clear(input);
    await userEvent.click(screen.getByText('Nome'));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith('siemens');
    expect(input).toHaveValue('');
  });

  it('an emptied field that unmounts with the focus in it is cleared', async () => {
    const onClear = vi.fn();
    const { unmount } = render(picker({ onClear, initialText: 'Hi-Tech' }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.clear(screen.getByRole('combobox', { name: 'Fabricante' }));
    unmount();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('D2 (fix batch e24z lead): after "Criar", leaves before and after the entry lands, with the options late, create once and never clear', async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn(() => 'Fabricante R8CAP');
    const onClear = vi.fn();
    const { rerender } = render(picker({ onChange, onCreate, onClear }));
    await userEvent.click(screen.getByRole('button', { name: 'Outro…' }));
    await userEvent.keyboard('Fabricante R8CAP');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Fabricante R8CAP”' }));
    const input = screen.getByRole('combobox', { name: 'Fabricante' });
    // Left before the entry lands.
    await userEvent.click(screen.getByText('Nome'));
    // The registry row lands before the sheet's value does (two live reads), then the value.
    const landed = [...OPTIONS, { id: 'r8cap', label: 'Fabricante R8CAP' }];
    rerender(picker({ onChange, onCreate, onClear, options: landed }));
    await userEvent.click(input);
    await userEvent.click(screen.getByText('Nome'));
    rerender(picker({ onChange, onCreate, onClear, options: landed, value: 'r8cap' }));
    await userEvent.click(input);
    await userEvent.click(screen.getByText('Nome'));
    // The picker may still hand React Aria's null on to its caller (the leave whose text equals its baseline releases
    // it); the sheet's field drops it (`ficha-fields.test.tsx`, the same case through WordField). It never clears.
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    expect(input).toHaveValue('Fabricante R8CAP');
  });
});
