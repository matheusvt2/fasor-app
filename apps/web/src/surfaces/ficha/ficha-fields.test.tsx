import type { FieldDef } from '@app/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from 'react-aria-components';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import { SheetField } from './ficha-fields.tsx';

/*
 * Review fixes 2026-09-30 on the sheet's typed fields:
 * - F-01 (cause 2): a nameplate field swapped out while it holds typing not committed yet (a
 *   plate suggestion landing on the empty field) commits that typing, never drops it;
 * - F-22: a plate date outside 1900 .. next year ("20/02/0001") is refused with the invalid
 *   helper and writes nothing.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const TAP: FieldDef = { key: 'tap_atual', label: 'TAP ATUAL', kind: 'text' };
const VOL: FieldDef = { key: 'vol_oleo', label: 'VOL. ÓLEO', kind: 'number', unit: 'L' };
const DATE: FieldDef = { key: 'data_fabricacao', label: 'DATA FABRICAÇÃO', kind: 'date' };

function field(def: FieldDef, commit: (value: unknown) => void, flushOnUnmount?: boolean) {
  return (
    <I18nProvider locale="pt-BR">
      <ToastProvider>
        <SheetField
          field={def}
          value={null}
          commit={commit}
          draft={{ entityId: 'b', field: def.key }}
          invalidText="Número não reconhecido"
          selectEmpty="Selecione"
          {...(flushOnUnmount === undefined ? {} : { flushOnUnmount })}
        />
      </ToastProvider>
    </I18nProvider>
  );
}

describe('F-01 a nameplate field swapped out mid-typing', () => {
  it('commits the typed text on unmount instead of dropping it (text field)', async () => {
    const commit = vi.fn();
    const { unmount } = render(field(TAP, commit, true));
    await userEvent.type(screen.getByRole('textbox', { name: /tap/i }), '3');
    expect(commit).not.toHaveBeenCalled();
    unmount();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('3');
  });

  it('commits the typed number on unmount (number field)', async () => {
    const commit = vi.fn();
    const { unmount } = render(field(VOL, commit, true));
    await userEvent.type(screen.getByRole('textbox', { name: /óleo/i }), '120');
    expect(commit).not.toHaveBeenCalled();
    unmount();
    expect(commit).toHaveBeenCalledWith({ raw: '120', unit: 'L', state: 'measured' });
  });

  it('a field left without the flag keeps its old behaviour: the draft store keeps the text, nothing is committed behind the user', async () => {
    const commit = vi.fn();
    const { unmount } = render(field(TAP, commit));
    await userEvent.type(screen.getByRole('textbox', { name: /tap/i }), '3');
    unmount();
    expect(commit).not.toHaveBeenCalled();
  });
});

describe('F-22 a plate date outside 1900 .. next year', () => {
  it('"20/02/0001" shows the invalid-date helper once the focus leaves and writes nothing; a real year is written', async () => {
    const commit = vi.fn();
    render(
      <>
        {field(DATE, commit)}
        <button type="button">fora</button>
      </>,
    );
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    await userEvent.type(input, '20/02/0001');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(screen.getByText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa')).toBeVisible());
    expect(commit).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '20/02/2012');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith('2012-02-20'));
    expect(screen.queryByText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa')).toBeNull();
  });
});

describe('13.4 the sheet\'s keyboard attributes and the empty date as text', () => {
  it('INP-1: a text field never capitalizes, corrects or spell-checks', () => {
    render(field(TAP, vi.fn()));
    const input = screen.getByRole('textbox', { name: /tap/i });
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it('INP-3: the empty date is the mock\'s text input, numeric, with the plate placeholder', () => {
    const { container } = render(field(DATE, vi.fn()));
    expect(container.querySelector('[role="spinbutton"]')).toBeNull();
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    expect(input).toHaveClass('input');
    expect(input).toHaveAttribute('placeholder', 'Ex: 03/2012');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input).toHaveAttribute('autocapitalize', 'off');
    expect(input).toHaveAttribute('autocorrect', 'off');
    expect(input).toHaveAttribute('spellcheck', 'false');
  });

  it.each([
    ['08/2024', '2024-08'],
    ['082024', '2024-08'],
    ['2024', '2024'],
    ['15032019', '2019-03-15'],
    ['15/03/2019', '2019-03-15'],
  ])('INP-3: "%s" commits %s on Enter', async (typed, stored) => {
    const commit = vi.fn();
    render(field(DATE, commit));
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    await userEvent.type(input, `${typed}{Enter}`);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(stored);
  });

  it.each(['1899', '13/2024', 'abc', '2099'])('INP-3: "%s" writes nothing and shows the invalid helper', async (typed) => {
    const commit = vi.fn();
    render(field(DATE, commit));
    await userEvent.type(screen.getByRole('textbox', { name: /fabrica/i }), `${typed}{Enter}`);
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getByText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa')).toBeVisible();
  });

  it('INP-3: the text input keeps the focus while it holds a full date; the picker takes over once the focus leaves', async () => {
    function Stored() {
      const [value, setValue] = useState<unknown>(null);
      return (
        <I18nProvider locale="pt-BR">
          <ToastProvider>
            <SheetField field={DATE} value={value} commit={setValue} draft={{ entityId: 'b', field: DATE.key }} invalidText="x" selectEmpty="Selecione" />
          </ToastProvider>
          <button type="button">fora</button>
        </I18nProvider>
      );
    }
    render(<Stored />);
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    await userEvent.type(input, '01012020{Enter}');
    expect(input).toHaveFocus();
    await waitFor(() => expect(input).toHaveValue('01/01/2020'));
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    const group = await screen.findByRole('group', { name: /fabrica/i });
    expect(within(group).getAllByRole('spinbutton').map((s) => s.textContent)).toEqual(['01', '01', '2020']);
  });

  it('INP-3 with F-01: typed date text is committed when the field leaves the page', async () => {
    const commit = vi.fn();
    const { unmount } = render(field(DATE, commit, true));
    await userEvent.type(screen.getByRole('textbox', { name: /fabrica/i }), '082024');
    expect(commit).not.toHaveBeenCalled();
    unmount();
    expect(commit).toHaveBeenCalledWith('2024-08');
  });
});
