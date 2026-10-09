import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FieldDef } from '@app/domain';
import { NameplateField, type NameplateSuggestionsModel } from './nameplate-suggestions.tsx';

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
      <span className="suggestion-alt">
        <button type="button">Substituir</button>
      </span>
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
