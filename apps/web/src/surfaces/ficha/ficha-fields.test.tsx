import type { FieldDef } from '@app/domain';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from 'react-aria-components';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { focusNextMissingField, ReadOnlyField, SheetField } from './ficha-fields.tsx';

/*
 * Review fixes 2026-09-30 on the sheet's typed fields:
 * - F-01 (cause 2): a nameplate field swapped out while it holds typing not committed yet (a
 *   plate suggestion landing on the empty field) commits that typing, never drops it;
 * - F-22: a plate date outside 1900 .. next year ("20/02/0001") is refused with the invalid
 *   helper and writes nothing.
 */

// The draft registrations, by field, so a test can read what a field still holds as a draft.
const draftSources = vi.hoisted(() => new Map<string, { read: () => unknown }>());
vi.mock('../../state/drafts.tsx', () => ({
  useDraftSource: (source: { field: string; read: () => unknown }) => {
    draftSources.set(source.field, source);
  },
}));

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
    await waitFor(() => expect(screen.getByText('Data não reconhecida — use dd/mm/aaaa, mm/aaaa ou aaaa')).toBeVisible());
    expect(commit).not.toHaveBeenCalled();

    await userEvent.clear(input);
    await userEvent.type(input, '20/02/2012');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith('2012-02-20'));
    expect(screen.queryByText('Data não reconhecida — use dd/mm/aaaa, mm/aaaa ou aaaa')).toBeNull();
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
    expect(screen.getByText('Data não reconhecida — use dd/mm/aaaa, mm/aaaa ou aaaa')).toBeVisible();
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

  it('INP-3: a stored full date cleared in the picker keeps the picker and its focus past the idle commit', async () => {
    const written = vi.fn();
    function Stored() {
      const [value, setValue] = useState<unknown>('2020-01-01');
      return (
        <I18nProvider locale="pt-BR">
          <ToastProvider>
            <SheetField
              field={DATE}
              value={value}
              commit={(next) => {
                written(next);
                setValue(next);
              }}
              draft={{ entityId: 'b', field: DATE.key }}
              invalidText="x"
              selectEmpty="Selecione"
            />
          </ToastProvider>
        </I18nProvider>
      );
    }
    render(<Stored />);
    const group = screen.getByRole('group', { name: /fabrica/i });
    for (const index of [0, 1, 2]) {
      await userEvent.click(within(group).getAllByRole('spinbutton')[index]!);
      await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}');
    }
    // Past the 500 ms idle: null is written, and the focused picker is not swapped for the text form.
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(written).toHaveBeenLastCalledWith(null);
    const still = screen.getByRole('group', { name: /fabrica/i });
    expect(within(still).getAllByRole('spinbutton')).toHaveLength(3);
    expect(still.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole('textbox', { name: /fabrica/i })).toBeNull();
  });

  it('INP-3: a refused write of the text form raises the AD-8 toast', async () => {
    const commit = vi.fn(() => Promise.reject(Object.assign(new Error('refused'), { name: 'UnknownError' })));
    render(
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField field={DATE} value={null} commit={commit} draft={{ entityId: 'b', field: DATE.key }} invalidText="x" selectEmpty="Selecione" />
          <ToastOutlet />
        </ToastProvider>
      </I18nProvider>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: /fabrica/i }), '2024{Enter}');
    expect(commit).toHaveBeenCalledWith('2024');
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeVisible();
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

/*
 * Review fixes 2026-10-08 (DB-7): Enter in a plate or cabine field commits, then moves the focus to
 * the next missing field after it (the "Concluir ficha" markers), else to the sheet's primary.
 * jsdom draws nothing, so `getClientRects` says an element is drawn unless it sits under `hidden`.
 */
describe('R8LAY DB-7 the plate and cabine fields\' Enter run', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.closest('[hidden]') === null ? [{ width: 1, height: 1 }] : []) as unknown as DOMRectList;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const SERIAL: FieldDef = { key: 'n_serie', label: 'Nº SÉRIE', kind: 'text' };

  function plate(commits: Record<string, (value: unknown) => void>) {
    return (
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          {[SERIAL, VOL, DATE, TAP].map((def) => (
            <SheetField key={def.key} field={def} value={null} missing commit={commits[def.key] ?? vi.fn()} draft={{ entityId: 'b', field: def.key }} invalidText="Número não reconhecido" selectEmpty="Selecione" />
          ))}
          <button type="button" id="ficha-primary">
            Próxima ficha
          </button>
        </ToastProvider>
      </I18nProvider>
    );
  }

  it('each Enter commits its field, then lands on the next empty field, and the last on the primary; every input says "next"', async () => {
    const commits = { n_serie: vi.fn(), vol_oleo: vi.fn(), data_fabricacao: vi.fn(), tap_atual: vi.fn() };
    render(plate(commits));
    const serial = screen.getByRole('textbox', { name: /série/i });
    for (const name of [/série/i, /óleo/i, /fabrica/i, /tap/i]) expect(screen.getByRole('textbox', { name })).toHaveAttribute('enterkeyhint', 'next');
    await userEvent.type(serial, 'PR2291{Enter}');
    expect(commits.n_serie).toHaveBeenCalledWith('PR2291');
    expect(screen.getByRole('textbox', { name: /óleo/i })).toHaveFocus();
    await userEvent.keyboard('120{Enter}');
    expect(commits.vol_oleo).toHaveBeenCalledWith({ raw: '120', unit: 'L', state: 'measured' });
    expect(screen.getByRole('textbox', { name: /fabrica/i })).toHaveFocus();
    await userEvent.keyboard('082024{Enter}');
    expect(commits.data_fabricacao).toHaveBeenCalledWith('2024-08');
    // The blur of the move commits the date no second time.
    expect(commits.data_fabricacao).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: /tap/i })).toHaveFocus();
    await userEvent.keyboard('3{Enter}');
    expect(commits.tap_atual).toHaveBeenCalledWith('3');
    expect(screen.getByRole('button', { name: 'Próxima ficha' })).toHaveFocus();
  });

  it('an invalid number or date commits nothing and keeps the focus with its helper', async () => {
    const commits = { vol_oleo: vi.fn(), data_fabricacao: vi.fn() };
    render(plate(commits));
    const vol = screen.getByRole('textbox', { name: /óleo/i });
    await userEvent.type(vol, 'abc{Enter}');
    expect(vol).toHaveFocus();
    expect(screen.getByText('Número não reconhecido')).toBeVisible();
    expect(commits.vol_oleo).not.toHaveBeenCalled();
    const date = screen.getByRole('textbox', { name: /fabrica/i });
    await userEvent.type(date, '13/2024{Enter}');
    expect(date).toHaveFocus();
    expect(commits.data_fabricacao).not.toHaveBeenCalled();
  });

  it('Shift+Enter commits only; the focus stays', async () => {
    const commits = { vol_oleo: vi.fn(), n_serie: vi.fn() };
    render(plate(commits));
    const vol = screen.getByRole('textbox', { name: /óleo/i });
    await userEvent.type(vol, '120{Shift>}{Enter}{/Shift}');
    expect(commits.vol_oleo).toHaveBeenCalledWith({ raw: '120', unit: 'L', state: 'measured' });
    expect(vol).toHaveFocus();
    const serial = screen.getByRole('textbox', { name: /série/i });
    await userEvent.type(serial, 'X{Shift>}{Enter}{/Shift}');
    expect(commits.n_serie).toHaveBeenCalledWith('X');
    expect(serial).toHaveFocus();
  });

  it('the Enter that ends an IME composition commits only: the text, number and date-text fields keep the focus', async () => {
    const commits = { n_serie: vi.fn(), vol_oleo: vi.fn(), data_fabricacao: vi.fn() };
    render(plate(commits));
    for (const [name, text] of [[/série/i, 'PR2291'], [/óleo/i, '120'], [/fabrica/i, '2024']] as const) {
      const input = screen.getByRole('textbox', { name });
      await userEvent.type(input, text);
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
      expect(input).toHaveFocus();
    }
    expect(commits.n_serie).toHaveBeenCalledWith('PR2291');
    expect(commits.vol_oleo).toHaveBeenCalledWith({ raw: '120', unit: 'L', state: 'measured' });
    expect(commits.data_fabricacao).toHaveBeenCalledWith('2024');
  });

  it('Shift+Enter on the date text commits once and keeps the focus', async () => {
    const commits = { data_fabricacao: vi.fn() };
    render(plate(commits));
    const date = screen.getByRole('textbox', { name: /fabrica/i });
    await userEvent.type(date, '082024{Shift>}{Enter}{/Shift}');
    expect(date).toHaveFocus();
    expect(commits.data_fabricacao).toHaveBeenCalledTimes(1);
    expect(commits.data_fabricacao).toHaveBeenCalledWith('2024-08');
  });

  it('a held Enter that lands on a button never presses it with its repeats', async () => {
    const commit = vi.fn();
    const press = vi.fn();
    render(
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField field={TAP} value={null} missing commit={commit} draft={{ entityId: 'b', field: TAP.key }} invalidText="x" selectEmpty="Selecione" />
          <ul>
            <li className="checklist-row" data-missing-field="">
              <button type="button" onClick={press}>
                C
              </button>
            </li>
          </ul>
        </ToastProvider>
      </I18nProvider>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: /tap/i }), '3');
    await userEvent.keyboard('{Enter>4/}');
    expect(screen.getByRole('button', { name: 'C' })).toHaveFocus();
    expect(commit).toHaveBeenCalledWith('3');
    expect(press).not.toHaveBeenCalled();
    // A new Enter, after the key went up, presses it as usual.
    await userEvent.keyboard('{Enter}');
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('focusNextMissingField skips filled, hidden and earlier markers and selects the target\'s text', () => {
    document.body.innerHTML = `
      <div data-field-key="a" data-missing-field><input id="a" /></div>
      <div data-field-key="b"><input id="b" /></div>
      <div data-field-key="c" data-missing-field hidden><input id="c" /></div>
      <li class="checklist-row" data-missing-field><button type="button" id="d">C</button></li>
      <div data-field-key="e" data-missing-field><input id="e" value="12" /></div>
      <button type="button" id="ficha-primary">Concluir ficha</button>`;
    const byId = (id: string) => document.getElementById(id)!;
    expect(focusNextMissingField(byId('b'))).toBe(true);
    expect(document.activeElement).toBe(byId('d'));
    const select = vi.spyOn(HTMLInputElement.prototype, 'select');
    expect(focusNextMissingField(byId('d'))).toBe(true);
    expect(document.activeElement).toBe(byId('e'));
    expect(select).toHaveBeenCalled();
    expect(focusNextMissingField(byId('e'))).toBe(true);
    expect(document.activeElement).toBe(byId('ficha-primary'));
    document.body.innerHTML = '';
  });
});

describe('16.4 "N/A" in a nameplate or cabine number field (Story 17.3: printed "N/A", the control)', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
      return (this.closest('[hidden]') === null ? [{ width: 1, height: 1 }] : []) as unknown as DOMRectList;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const POT: FieldDef = { key: 'potencia_nominal', label: 'POTÊNCIA NOMINAL', kind: 'number', unit: 'kVA' };
  const NA = { raw: '', unit: null, state: 'not_applicable' };

  /** A field over a store: a commit becomes the stored value, as the live query would make it. */
  function Stored({ initial, commit, def = POT, accepts = true }: { initial: unknown; commit: (value: unknown) => void; def?: FieldDef; accepts?: boolean }) {
    const [value, setValue] = useState<unknown>(initial);
    return (
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField
            field={def}
            value={value}
            missing
            commit={(next) => {
              commit(next);
              setValue(next);
            }}
            draft={{ entityId: 'b', field: def.key }}
            invalidText="Número não reconhecido"
            selectEmpty="Selecione"
            {...(accepts ? { acceptsNotApplicable: true } : {})}
          />
          <SheetField field={TAP} value={null} missing commit={vi.fn()} draft={{ entityId: 'b', field: TAP.key }} invalidText="Número não reconhecido" selectEmpty="Selecione" />
          <button type="button" onClick={() => setValue({ raw: '1500', unit: 'kVA', state: 'measured' })}>
            desfazer
          </button>
        </ToastProvider>
      </I18nProvider>
    );
  }

  const unitOf = (input: HTMLElement) => input.closest('.field')!.querySelector('.mf-unit');
  const echoOf = (input: HTMLElement) => input.closest('.field')!.querySelector('.mf-echo');

  for (const typed of ['N.A', 'NA', 'N/A', 'N.A.', ' n . a ']) {
    it(`"${typed}" commits the not_applicable value, reads "N/A" with no unit nor echo, and Enter runs on`, async () => {
      const commit = vi.fn();
      render(<Stored initial={null} commit={commit} />);
      const input = screen.getByRole('textbox', { name: /potência/i });
      expect(unitOf(input)).not.toBeNull();
      await userEvent.type(input, typed);
      // Typed: no unit and no echo line while the text reads N/A.
      expect(unitOf(input)).toBeNull();
      expect(echoOf(input)).toBeNull();
      expect(draftSources.get('potencia_nominal')!.read()).toBe(typed);
      await userEvent.keyboard('{Enter}');
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith(NA);
      expect(screen.getByRole('textbox', { name: /tap/i })).toHaveFocus();
      expect(input).toHaveValue('N/A');
      expect(unitOf(input)).toBeNull();
      expect(echoOf(input)).toBeNull();
      expect(screen.queryByText('Número não reconhecido')).toBeNull();
      expect(input).not.toHaveAttribute('aria-invalid');
      // The draft source is cleared as for a number.
      expect(draftSources.get('potencia_nominal')!.read()).toBeNull();
    });
  }

  it('a stored "N/A" reads "N/A" at rest with no unit; an undo to a number replaces it at rest', async () => {
    render(<Stored initial={NA} commit={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    expect(input).toHaveValue('N/A');
    expect(unitOf(input)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'desfazer' }));
    expect(input).toHaveValue('1.500');
    expect(unitOf(input)).toHaveTextContent('kVA');
  });

  it('a near spelling is still no number: the helper shows and nothing commits', async () => {
    const commit = vi.fn();
    render(<Stored initial={null} commit={commit} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    await userEvent.type(input, 'N.A.A{Enter}');
    expect(input).toHaveFocus();
    expect(screen.getByText('Número não reconhecido')).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
  });

  it('a number field without the flag (a measurement test\'s value) refuses "N.A": no control, the helper shows and nothing commits', async () => {
    const commit = vi.fn();
    render(<Stored initial={null} commit={commit} accepts={false} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    expect(screen.queryByRole('button', { name: /como não aplicável/ })).toBeNull();
    expect(input.closest('.field')!.querySelector('.field-na-row')).toBeNull();
    await userEvent.type(input, 'N.A{Enter}');
    expect(input).toHaveFocus();
    expect(screen.getByText('Número não reconhecido')).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
  });

  it('a read-only field holding "N/A" reads "N/A" with no unit, and has no control; a number keeps its unit', () => {
    const { unmount } = render(<ReadOnlyField field={POT} value={NA} />);
    expect(screen.getByRole('textbox', { name: /potência/i })).toHaveTextContent(/^N\/A$/);
    expect(document.querySelector('.mf-unit')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    render(<ReadOnlyField field={POT} value={{ raw: '1500', unit: 'kVA', state: 'measured' }} />);
    expect(document.querySelector('.mf-unit')).toHaveTextContent('kVA');
  });

  it('a cabine number field (no unit of the seed\'s in the way) commits and reads "N/A" the same', async () => {
    const PRIMARY: FieldDef = { key: 'primary_kv', label: 'TENSÃO PRIMÁRIA', kind: 'number', unit: 'kV' };
    const commit = vi.fn();
    render(<Stored initial={{ raw: '13.8', unit: 'kV', state: 'measured' }} commit={commit} def={PRIMARY} />);
    const input = screen.getByRole('textbox', { name: /primária/i });
    expect(input).toHaveValue('13,8');
    await userEvent.clear(input);
    await userEvent.type(input, 'na');
    fireEvent.blur(input);
    expect(commit).toHaveBeenCalledWith(NA);
    expect(input).toHaveValue('N/A');
    expect(unitOf(input)).toBeNull();
  });

  const control = () => screen.queryByRole('button', { name: 'Marcar Potência nominal como não aplicável' });

  it('17.3 the control renders beside the value of a field that accepts N/A, with its authored name and text', () => {
    render(<Stored initial={{ raw: '1000', unit: 'kVA', state: 'measured' }} commit={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    const button = control()!;
    expect(button).toHaveTextContent(/^N\/A$/);
    expect(button).toHaveClass('btn', 'btn-secondary', 'btn-na');
    expect(button).toHaveAttribute('type', 'button');
    // The row holds the untouched `.measurement-field` and the control, in that order.
    const row = input.closest('.field-na-row')!;
    expect(row.firstElementChild).toHaveClass('measurement-field');
    expect(row.lastElementChild).toBe(button);
    // The decimal keypad still comes up.
    expect(input).toHaveAttribute('inputmode', 'decimal');
  });

  it('17.3 a tap commits the not_applicable value once, reads "N/A" with no unit nor echo, hides the control and moves no focus', async () => {
    const commit = vi.fn();
    render(<Stored initial={{ raw: '1000', unit: 'kVA', state: 'measured' }} commit={commit} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    const tap = screen.getByRole('textbox', { name: /tap/i });
    await userEvent.click(control()!);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(NA);
    expect(input).toHaveValue('N/A');
    expect(unitOf(input)).toBeNull();
    expect(echoOf(input)).toBeNull();
    expect(control()).toBeNull();
    expect(input).not.toHaveFocus();
    expect(tap).not.toHaveFocus();
    expect(draftSources.get('potencia_nominal')!.read()).toBeNull();
  });

  it('17.3 a field holding N/A, stored or just typed, renders no control', async () => {
    const { unmount } = render(<Stored initial={NA} commit={vi.fn()} />);
    expect(control()).toBeNull();
    unmount();
    render(<Stored initial={null} commit={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    expect(control()).not.toBeNull();
    await userEvent.type(input, 'n.a');
    expect(control()).toBeNull();
    // The input kept its focus while the control went (the row stays, the input never remounts).
    expect(input).toHaveFocus();
  });

  it('17.3 a number typed over N/A commits measured and the control shows again', async () => {
    const commit = vi.fn();
    render(<Stored initial={NA} commit={commit} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    await userEvent.clear(input);
    await userEvent.type(input, '1500');
    fireEvent.blur(input);
    expect(commit).toHaveBeenLastCalledWith({ raw: '1500', unit: 'kVA', state: 'measured' });
    expect(input).toHaveValue('1.500');
    expect(unitOf(input)).toHaveTextContent('kVA');
    expect(control()).not.toBeNull();
  });

  it('17.3 clearing an N/A field commits null and the control shows again', async () => {
    const commit = vi.fn();
    render(<Stored initial={NA} commit={commit} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    await userEvent.clear(input);
    fireEvent.blur(input);
    expect(commit).toHaveBeenLastCalledWith(null);
    expect(input).toHaveValue('');
    expect(control()).not.toBeNull();
  });

  it('17.3 a tap while a number is typed and not committed commits that number first, then N/A', async () => {
    const commit = vi.fn();
    render(<Stored initial={null} commit={commit} />);
    const input = screen.getByRole('textbox', { name: /potência/i });
    await userEvent.type(input, '12');
    // WebKit takes no focus on a tapped button: the click lands while the input keeps the
    // focus, so no blur commits 12 and the control's own commitNow must.
    expect(input).toHaveFocus();
    fireEvent.click(control()!);
    expect(commit.mock.calls).toEqual([[{ raw: '12', unit: 'kVA', state: 'measured' }], [NA]]);
    expect(input).toHaveValue('N/A');
    expect(control()).toBeNull();
  });
});
