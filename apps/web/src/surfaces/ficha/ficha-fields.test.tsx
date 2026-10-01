import type { FieldDef } from '@app/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from 'react-aria-components';
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
    const group = screen.getByRole('group', { name: /fabrica/i });
    const [day] = within(group).getAllByRole('spinbutton');
    await userEvent.click(day!);
    await userEvent.keyboard('20020001');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(screen.getByText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa')).toBeVisible());
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(commit).not.toHaveBeenCalled();

    const [, , year] = within(group).getAllByRole('spinbutton');
    await userEvent.click(year!);
    await userEvent.keyboard('2012');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith('2012-02-20'));
    expect(screen.queryByText('Data não reconhecida — use dd/mm/aaaa ou mm/aaaa')).toBeNull();
  });
});
