import { acceptsVoltagePair, type FieldDef } from '@app/domain';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from 'react-aria-components';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { trackInputRefused } from '../../telemetry/hooks.ts';
import { focusNextMissingField, focusRunEnd, ReadOnlyField, SheetField } from './ficha-fields.tsx';

/*
 * Review fixes 2026-09-30 on the sheet's typed fields:
 * - F-01 (cause 2): a nameplate field swapped out while it holds typing not committed yet (a
 *   plate suggestion landing on the empty field) commits that typing, never drops it;
 * - F-22: a plate date outside 1900 .. next year ("20/02/0001") is refused with the invalid
 *   helper and writes nothing.
 */

// The draft registrations, by field, so a test can read what a field still holds as a draft.
const draftSources = vi.hoisted(() => new Map<string, { read: () => unknown }>());
// Story 18.4: the refusals the fields report, by name and reason.
vi.mock('../../telemetry/hooks.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../telemetry/hooks.ts')>()),
  trackInputRefused: vi.fn(),
}));

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
    // e23f (R8LAY, Matheus 2026-11-08): the run ends on the primary without scrolling the page.
    const primaryFocus = vi.spyOn(screen.getByRole('button', { name: 'Próxima ficha' }), 'focus');
    await userEvent.keyboard('3{Enter}');
    expect(commits.tap_atual).toHaveBeenCalledWith('3');
    expect(screen.getByRole('button', { name: 'Próxima ficha' })).toHaveFocus();
    expect(primaryFocus).toHaveBeenCalledTimes(1);
    expect(primaryFocus).toHaveBeenCalledWith({ preventScroll: true });
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

describe('fix batch fxpw G4: the two-level secondary voltage', () => {
  const SECONDARY: FieldDef = { key: 'secondary_kv', label: 'Tensão secundária', kind: 'number', unit: 'V' };
  const PRIMARY: FieldDef = { key: 'primary_kv', label: 'Tensão primária', kind: 'number', unit: 'kV' };

  function cabineField(def: FieldDef, commit: (value: unknown) => void) {
    return (
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField
            field={def}
            value={null}
            commit={commit}
            draft={{ entityId: 'c', field: def.key }}
            invalidText="Número não reconhecido"
            selectEmpty="Selecione"
            acceptsNotApplicable
            acceptsPair={acceptsVoltagePair('se', def.key)}
          />
        </ToastProvider>
      </I18nProvider>
    );
  }

  it('Tensão secundária opens the text keyboard (a "/" key) and commits "380/220"; Tensão primária keeps the decimal keypad', async () => {
    const commit = vi.fn();
    render(
      <>
        {cabineField(SECONDARY, commit)}
        {cabineField(PRIMARY, vi.fn())}
      </>,
    );
    const secondary = screen.getByLabelText('Tensão secundária', { exact: true });
    expect(secondary).toHaveAttribute('inputmode', 'text');
    expect(screen.getByLabelText('Tensão primária', { exact: true })).toHaveAttribute('inputmode', 'decimal');
    await userEvent.type(secondary, '380/220{Enter}');
    expect(commit).toHaveBeenCalledWith({ raw: '380/220', unit: 'V', state: 'measured' });
  });
});

describe('Story 18.4: a refused number or date is an input_refused with its name and the kernel reason', () => {
  afterEach(() => vi.mocked(trackInputRefused).mockClear());

  it('the number field: "abc" on blur is not_a_number; "N/A" where none is taken is not_applicable; the input carries ficha.number', async () => {
    render(
      <>
        {field(VOL, vi.fn())}
        <button type="button">fora</button>
      </>,
    );
    const input = screen.getByRole('textbox', { name: /óleo/i });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.number');
    await userEvent.type(input, 'abc');
    expect(trackInputRefused).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(vi.mocked(trackInputRefused).mock.calls).toEqual([['ficha.number', 'not_a_number']]);
    await userEvent.clear(input);
    await userEvent.type(input, 'N/A');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(vi.mocked(trackInputRefused).mock.calls.at(-1)).toEqual(['ficha.number', 'not_applicable']);
  });

  it('the date picker: a year outside 1900 .. next year, left, is one out_of_range; moving between its segments reports nothing', async () => {
    render(
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField field={DATE} value="2020-01-01" commit={vi.fn()} draft={{ entityId: 'b', field: DATE.key }} invalidText="x" selectEmpty="Selecione" />
        </ToastProvider>
        <button type="button">fora</button>
      </I18nProvider>,
    );
    const group = screen.getByRole('group', { name: /fabrica/i });
    const segments = within(group).getAllByRole('spinbutton');
    await userEvent.click(segments[2]!);
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}1850');
    await userEvent.click(segments[0]!);
    expect(trackInputRefused).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(vi.mocked(trackInputRefused).mock.calls).toEqual([['ficha.date', 'out_of_range']]);
  });

  it('the date field: an unreadable date is not_a_date, a year out of range out_of_range, each once per blur or Enter', async () => {
    render(
      <>
        {field(DATE, vi.fn())}
        <button type="button">fora</button>
      </>,
    );
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.date');
    await userEvent.type(input, 'ontem');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await userEvent.clear(input);
    await userEvent.type(input, '20/02/0001{Enter}');
    expect(vi.mocked(trackInputRefused).mock.calls).toEqual([
      ['ficha.date', 'not_a_date'],
      ['ficha.date', 'out_of_range'],
    ]);
  });
});

describe('e23f focusRunEnd (R8LAY, Matheus 2026-11-08)', () => {
  /** The Sticky action bar with its primary, the bar `position` given, the primary's box at `top`..`bottom`. */
  function barWith(position: string, top: number, bottom: number): { primary: HTMLButtonElement; scroll: ReturnType<typeof vi.fn> } {
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    bar.style.position = position;
    const primary = document.createElement('button');
    primary.type = 'button';
    primary.id = 'ficha-primary';
    bar.append(primary);
    document.body.append(bar);
    primary.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 200, width: 200, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    const scroll = vi.fn();
    primary.scrollIntoView = scroll;
    return { primary, scroll };
  }
  afterEach(() => document.querySelectorAll('.sticky-action-bar').forEach((bar) => bar.remove()));

  it('focuses the primary with preventScroll and never reveals a sticky bar, even a fraction past the viewport', () => {
    const { primary, scroll } = barWith('sticky', window.innerHeight - 56, window.innerHeight + 0.4);
    const focus = vi.spyOn(primary, 'focus');
    focusRunEnd(primary);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(primary).toHaveFocus();
    expect(scroll).not.toHaveBeenCalled();
  });

  it('brings a static bar\'s primary into view only when it is outside the viewport', () => {
    const below = barWith('static', window.innerHeight + 300, window.innerHeight + 356);
    focusRunEnd(below.primary);
    expect(below.primary).toHaveFocus();
    expect(below.scroll).toHaveBeenCalledWith({ block: 'nearest' });
    document.querySelectorAll('.sticky-action-bar').forEach((bar) => bar.remove());
    const inView = barWith('static', 100, 156);
    focusRunEnd(inView.primary);
    expect(inView.primary).toHaveFocus();
    expect(inView.scroll).not.toHaveBeenCalled();
  });
});

/*
 * Story 25.2 (M02): FABRICAÇÃO on the sheet. The field's own React Aria null selections stay dropped (a created
 * name not landed yet, a stored name the registry does not hold); a clear the technician made is written, once.
 */
describe('25.2-WEB the manufacturer field of the sheet', () => {
  const MAKER: FieldDef = { key: 'fabricacao', label: 'FABRICAÇÃO', kind: 'manufacturer' };
  const row = (id: string, name: string) => ({ id, kind: 'manufacturer', name, gender: null, number: null, removed_at: null }) as unknown as NonNullable<Parameters<typeof SheetField>[0]['registries']>['manufacturer'][number];
  const SIEMENS = row('siemens', 'Siemens');

  function maker(props: { value: string | null; commit: (value: unknown) => void; rows?: readonly ReturnType<typeof row>[]; onCreateWord?: (kind: 'manufacturer' | 'voltage_class', name: string) => void }) {
    return (
      <I18nProvider locale="pt-BR">
        <ToastProvider>
          <SheetField
            field={MAKER}
            value={props.value}
            commit={props.commit}
            draft={{ entityId: 'b', field: MAKER.key }}
            invalidText="Número não reconhecido"
            selectEmpty="Selecione"
            registries={{ manufacturer: props.rows ?? [SIEMENS], voltage_class: [] }}
            onCreateWord={props.onCreateWord ?? vi.fn()}
          />
          <button type="button">fora</button>
        </ToastProvider>
      </I18nProvider>
    );
  }

  async function openCombobox(): Promise<HTMLElement> {
    const other = screen.queryByRole('button', { name: 'Outro…' });
    if (other !== null) await userEvent.click(other);
    return screen.getByRole('combobox', { name: /FABRICAÇÃO/i });
  }

  it('a stored name the registry does not hold, emptied and left, writes the clear once; the screen and the store agree', async () => {
    const commit = vi.fn();
    render(maker({ value: 'Hi-Tech', commit }));
    const input = await openCombobox();
    expect(input).toHaveValue('Hi-Tech');
    await userEvent.clear(input);
    await userEvent.click(screen.getByText('fora'));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(null);
    expect(input).toHaveValue('');
  });

  it('the same clear made with the sheet left (the field unmounts with the focus in it) is written once', async () => {
    const commit = vi.fn();
    const { unmount } = render(maker({ value: 'Hi-Tech', commit }));
    const input = await openCombobox();
    await userEvent.clear(input);
    unmount();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(null);
  });

  it('a stored name the registry does not hold, focused and left untouched, writes nothing', async () => {
    const commit = vi.fn();
    const { unmount } = render(maker({ value: 'Hi-Tech', commit }));
    await openCombobox();
    await userEvent.click(screen.getByText('fora'));
    await userEvent.click(screen.getByRole('combobox', { name: /FABRICAÇÃO/i }));
    unmount();
    expect(commit).not.toHaveBeenCalled();
  });

  it('a registered name typed with the focus in the field is stored when the sheet is left', async () => {
    const commit = vi.fn();
    const { unmount } = render(maker({ value: null, commit }));
    const input = await openCombobox();
    await userEvent.type(input, 'siemens');
    unmount();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('Siemens');
  });

  it('a new name typed with the focus in the field is created once, as "Criar" does, when the sheet is left', async () => {
    const commit = vi.fn();
    const onCreateWord = vi.fn();
    const { unmount } = render(maker({ value: null, commit, onCreateWord }));
    const input = await openCombobox();
    await userEvent.type(input, 'Megabras');
    unmount();
    expect(onCreateWord).toHaveBeenCalledTimes(1);
    expect(onCreateWord).toHaveBeenCalledWith('manufacturer', 'Megabras');
    expect(commit).not.toHaveBeenCalled();
  });

  it('D2 (fix batch e24z lead): "Criar", then leaves while the registry row and the value land one after the other, never write a clear', async () => {
    const commit = vi.fn();
    const onCreateWord = vi.fn();
    const { rerender } = render(maker({ value: null, commit, onCreateWord }));
    const input = await openCombobox();
    await userEvent.type(input, 'Fabricante R8CAP');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Fabricante R8CAP”' }));
    expect(onCreateWord).toHaveBeenCalledTimes(1);
    // Left before anything lands.
    await userEvent.click(screen.getByText('fora'));
    // The registry row lands first (its live read), the value second.
    const created = row('r8cap', 'Fabricante R8CAP');
    rerender(maker({ value: null, commit, onCreateWord, rows: [SIEMENS, created] }));
    await userEvent.click(input);
    await userEvent.click(screen.getByText('fora'));
    rerender(maker({ value: 'Fabricante R8CAP', commit, onCreateWord, rows: [SIEMENS, created] }));
    await userEvent.click(input);
    await userEvent.click(screen.getByText('fora'));
    expect(commit).not.toHaveBeenCalledWith(null);
    expect(onCreateWord).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Fabricante R8CAP');
  });

  /*
   * Fix batch e25x, "e25x A9": a clear the technician makes is written, whatever happened to an earlier clear. The
   * first clear of a registered name goes through React Aria's null selection (`onChange`, an Enter on the emptied
   * text); a leave of the emptied field is the clear of `onClear`.
   */
  const WEG = row('weg', 'WEG');

  it('e25x A9: a clear through onChange that the store refused does not block the next clear', async () => {
    const commit = vi.fn<(value: unknown) => Promise<void>>().mockRejectedValueOnce(new Error('refused')).mockResolvedValue(undefined);
    render(maker({ value: 'Siemens', commit }));
    const input = await openCombobox();
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenLastCalledWith(null);
    // The refusal lands; the store still holds "Siemens".
    await act(async () => {
      await Promise.resolve();
    });
    // The technician clears again: leaving the emptied field.
    await userEvent.click(screen.getByText('fora'));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith(null);
  });

  it('e25x A9: clear "Siemens", pick "WEG" before the store read null, "Siemens" again later, then clear: the last clear is written', async () => {
    const commit = vi.fn();
    const rows = [SIEMENS, WEG];
    const { rerender } = render(maker({ value: 'Siemens', commit, rows }));
    const input = await openCombobox();
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(commit).toHaveBeenLastCalledWith(null);
    await userEvent.type(input, 'weg');
    await userEvent.click(await screen.findByRole('option', { name: 'WEG' }));
    expect(commit).toHaveBeenLastCalledWith('WEG');
    // The store skips the null: the next read already holds the name picked, and later "Siemens" again (an undo, a pull).
    rerender(maker({ value: 'WEG', commit, rows }));
    rerender(maker({ value: 'Siemens', commit, rows }));
    const before = commit.mock.calls.length;
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');
    expect(commit.mock.calls.length).toBe(before + 1);
    expect(commit).toHaveBeenLastCalledWith(null);
  });
});
