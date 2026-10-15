import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FieldDef, SuggestionRow } from '@app/domain';
import { NameplateField, ReplaceLine, type NameplateSuggestionsModel } from './nameplate-suggestions.tsx';

/*
 * R8CAP-UNIT (review 2026-10-08, DG-2 on WebKit): a tap on the field's own "Substituir" or
 * "Manter o digitado" blurs the input with no `relatedTarget` (WebKit does not focus a tapped
 * button); that blur is not a leave, so the suggestion is not turned down under the tap. A
 * real blur still is, also after a press on the input itself.
 */

const FIELD = { key: 'tipo', label: 'Tipo', kind: 'text' } as unknown as FieldDef;
const MODEL = {} as NameplateSuggestionsModel;

function draw() {
  const onLeave = vi.fn();
  render(
    <NameplateField model={MODEL} field={FIELD} source={null} onLeave={onLeave}>
      <input aria-label="Tipo" />
      <div className="suggestion-tray" role="group">
        <button type="button">Substituir</button>
      </div>
    </NameplateField>,
  );
  return { onLeave, input: screen.getByRole('textbox', { name: 'Tipo' }), button: screen.getByRole('button', { name: 'Substituir' }) };
}

const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('R8CAP-UNIT NameplateField: a tap inside the field is not a leave', () => {
  it('a pointerdown on a button inside, then a blur with no relatedTarget: no leave', () => {
    const { onLeave, input, button } = draw();
    fireEvent.pointerDown(button);
    fireEvent.blur(input, { relatedTarget: null });
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('a blur with no relatedTarget and no press inside: a leave', () => {
    const { onLeave, input } = draw();
    fireEvent.blur(input, { relatedTarget: null });
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('a press on the input itself, then a later blur with no relatedTarget: a leave', async () => {
    const { onLeave, input } = draw();
    fireEvent.pointerDown(input);
    fireEvent.pointerUp(input);
    await tick();
    fireEvent.blur(input, { relatedTarget: null });
    expect(onLeave).toHaveBeenCalledOnce();
  });
});

describe('14.10-UNIT ReplaceLine: the tray of option A (key-suggestion-options.html)', () => {
  const SERIAL = { key: 'numero_de_serie', label: 'Nº de série', kind: 'text' } as unknown as FieldDef;
  const SUGGESTION = { id: 's1', value: '240815-01', status: 'pending' } as unknown as SuggestionRow;

  it('draws the suggested value and two Secondary buttons named after the field, in a labelled group; each calls its handler', async () => {
    const confirm = vi.fn();
    const keepTyped = vi.fn();
    const model = { confirm, keepTyped } as unknown as NameplateSuggestionsModel;
    const { container } = render(<ReplaceLine model={model} field={SERIAL} suggestion={SUGGESTION} typed="240815-07" />);
    const tray = screen.getByRole('group', { name: 'Nº de série: a leitura difere do digitado' });
    expect(tray).toHaveClass('suggestion-tray');
    expect(tray).toHaveAttribute('data-suggestion-id', 's1');
    expect(container.querySelector('.suggestion-tray-text')).toHaveTextContent('Sugerido: 240815-01');
    const replace = screen.getByRole('button', { name: 'Substituir Nº de série por 240815-01' });
    const keep = screen.getByRole('button', { name: 'Manter o digitado em Nº de série, 240815-07' });
    expect(replace).toHaveClass('btn', 'btn-secondary');
    expect(replace).toHaveTextContent('Substituir');
    expect(keep).toHaveClass('btn', 'btn-secondary');
    expect(keep).toHaveTextContent('Manter o digitado');
    await userEvent.click(replace);
    expect(confirm).toHaveBeenCalledWith(SUGGESTION, SERIAL);
    await userEvent.click(keep);
    expect(keepTyped).toHaveBeenCalledWith(SUGGESTION);
  });
});
