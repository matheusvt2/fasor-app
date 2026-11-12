import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../state/toast.tsx';
import { GeneratedTextField, type GeneratedTextState } from './generated-text-field.tsx';
import { SuggestionField } from './suggestion-field.tsx';

vi.mock('../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

function renderField(state: GeneratedTextState, handlers: { onConfirm?: () => void; onReplace?: () => void; onEdit?: (text: string) => void } = {}) {
  return render(
    <ToastProvider>
      <GeneratedTextField
        label="Texto da conclusão"
        text="A seccionadora SEC-C05 apresentou valores medidos dentro dos critérios de aceitação."
        criteriaItems={['R_iso T1–T2 330 MΩ · critério >400 MΩ', 'item 8 NC']}
        state={state}
        onConfirm={handlers.onConfirm ?? vi.fn()}
        onReplace={handlers.onReplace ?? vi.fn()}
        onEdit={handlers.onEdit ?? vi.fn()}
        draft={{ surface: 'ficha', entityId: 'e', field: 'conclusion-text' }}
      />
    </ToastProvider>,
  );
}

describe('GeneratedTextField (UX-DR46/47)', () => {
  it('unconfirmed: the amber suggested state, the Criteria line as the description, "Confirmar"', async () => {
    const onConfirm = vi.fn();
    const { container } = renderField('unconfirmed', { onConfirm });
    expect(container.querySelector('.suggestion-field.is-generated')).toHaveAttribute('data-state', 'suggested');
    const text = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    expect(text).toHaveAccessibleDescription(/Critérios usados.*R_iso T1–T2 330 MΩ/);
    expect(screen.getByText('Sugerido')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('stale: "Sugerido: texto atualizado — Substituir" beneath, never an overwrite of its own', async () => {
    const onReplace = vi.fn();
    const { container } = renderField('stale', { onReplace });
    expect(container.querySelector('.suggestion-field.is-generated')).toHaveAttribute('data-state', 'confirmed');
    expect(container.querySelector('.suggestion-alt')).toHaveTextContent('Sugerido: texto atualizado — Substituir');
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
    // E5-Q5: the criteria line no longer describes the stored text; it follows the row as the
    // evidence of the suggested replacement.
    const stored = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    expect(stored).not.toHaveAttribute('aria-describedby');
    const alt = container.querySelector('.suggestion-alt')!;
    expect(alt.nextElementSibling).toHaveClass('criteria-line');
    expect(screen.getByRole('button', { name: 'Substituir' })).toHaveAccessibleDescription(/Critérios usados.*R_iso T1–T2 330 MΩ/);
    await userEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('"Editar" stores the current text as edited at once and opens typing; a typed text is committed on blur', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderField('unconfirmed', { onEdit });
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith('A seccionadora SEC-C05 apresentou valores medidos dentro dos critérios de aceitação.');
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.clear(area);
    await user.type(area, 'Meu texto');
    await user.tab();
    expect(onEdit).toHaveBeenCalledWith('Meu texto');
  });

  it('read-only (a sheet marked not tested): the text alone, no Confirmar, Editar or Substituir, even when edited', () => {
    for (const state of ['unconfirmed', 'stale', 'edited'] as const) {
      const { unmount } = render(
        <ToastProvider>
          <GeneratedTextField
            label="Texto da conclusão"
            text="Texto guardado."
            criteriaItems={[]}
            state={state}
            onConfirm={vi.fn()}
            onReplace={vi.fn()}
            onEdit={vi.fn()}
            draft={{ surface: 'ficha', entityId: 'e', field: 'conclusion-text' }}
            readOnly
          />
        </ToastProvider>,
      );
      expect(screen.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveAttribute('aria-readonly', 'true');
      expect(screen.queryByRole('button')).toBeNull();
      if (state === 'stale') {
        // E5-Q5: no Substituir row, so no criteria line and nothing described.
        expect(screen.getByRole('textbox', { name: 'Texto da conclusão' })).not.toHaveAttribute('aria-describedby');
        expect(document.querySelector('.criteria-line')).toBeNull();
      }
      unmount();
    }
  });

  it('E5-R3: with no criteria items there is no "Critérios usados" heading and no description', () => {
    for (const state of ['unconfirmed', 'confirmed', 'stale'] as const) {
      const { unmount } = render(
        <ToastProvider>
          <GeneratedTextField
            label="Texto da conclusão"
            text="O TP TP-ENEL não apresentou valores medidos nem itens verificados registrados."
            criteriaItems={[]}
            state={state}
            onConfirm={vi.fn()}
            onReplace={vi.fn()}
            onEdit={vi.fn()}
            draft={{ surface: 'ficha', entityId: 'e', field: 'conclusion-text' }}
          />
        </ToastProvider>,
      );
      expect(screen.queryByText('Critérios usados')).toBeNull();
      expect(document.querySelector('.criteria-line')).toBeNull();
      expect(screen.getByRole('textbox', { name: 'Texto da conclusão' })).not.toHaveAttribute('aria-describedby');
      unmount();
    }
  });
});

/*
 * Story 25.2 (M02): the sheet's conclusion text commits while typing (a 500 ms pause), on blur and when the field
 * leaves the screen, never twice and never for an unchanged text; before "Editar" it reads as text, not as a field.
 */
describe('25.2-WEB the conclusion text is saved as it is typed', () => {
  const STORED = 'Texto guardado.';
  const pause = (ms: number) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));

  function typingField(onEdit: (text: string) => void, state: GeneratedTextState = 'edited') {
    return (
      <ToastProvider>
        <GeneratedTextField
          label="Texto da conclusão"
          text={STORED}
          criteriaItems={[]}
          state={state}
          onConfirm={vi.fn()}
          onReplace={vi.fn()}
          onEdit={onEdit}
          draft={{ surface: 'ficha', entityId: 'e', field: 'conclusion-text' }}
          presentation="text"
          commitWhileTyping
        />
        <button type="button">fora</button>
      </ToastProvider>
    );
  }

  it('a 500 ms pause commits the typed text with the cursor still in the field', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(typingField(onEdit));
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.click(area);
    await user.type(area, ' Mais.');
    expect(onEdit).not.toHaveBeenCalled();
    await pause(650);
    expect(area).toHaveFocus();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(`${STORED} Mais.`);
  });

  it('the field leaving the screen 100 ms after a key commits the text once, and a blur during the removal adds nothing', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { unmount } = render(typingField(onEdit));
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.click(area);
    await user.type(area, ' Fim.');
    await pause(100);
    expect(onEdit).not.toHaveBeenCalled();
    unmount();
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(`${STORED} Fim.`);
  });

  it('an idle commit followed by a blur is one commit; a text equal to the stored one is never committed', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(typingField(onEdit));
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.click(area);
    await user.type(area, 'X');
    await pause(650);
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(`${STORED}X`);
  });

  it('a refused write is not lost: the blur that follows commits the same text again', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn<(text: string) => Promise<void>>().mockRejectedValueOnce(Object.assign(new Error('refused'), { name: 'QuotaExceededError' })).mockResolvedValue(undefined);
    render(typingField(onEdit));
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.click(area);
    await user.type(area, ' Mais.');
    await pause(650);
    expect(onEdit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit).toHaveBeenLastCalledWith(`${STORED} Mais.`);
  });

  it('typed back to the stored text and left: nothing is written, no "edited" mark', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { unmount } = render(typingField(onEdit));
    const area = screen.getByRole('textbox', { name: 'Texto da conclusão' });
    await user.click(area);
    await user.type(area, 'X{Backspace}');
    await pause(650);
    await user.click(screen.getByRole('button', { name: 'fora' }));
    unmount();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('confirmed, the text reads as text: no textbox, the label kept, and "Editar" is the way to type', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const { container } = render(typingField(onEdit, 'confirmed'));
    expect(screen.queryByRole('textbox')).toBeNull();
    const shown = container.querySelector('.suggestion-field.is-generated > .generated-text')!;
    expect(shown).toHaveTextContent(STORED);
    expect(shown).not.toHaveAttribute('role');
    expect(shown).toHaveAttribute('aria-labelledby', container.querySelector('.field-label')!.id);
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(onEdit).toHaveBeenCalledWith(STORED);
    expect(screen.getByRole('textbox', { name: 'Texto da conclusão' })).toHaveValue(STORED);
  });

  it('without the props (the Etapa 6 parecer summary) a typed text still commits on blur only, and the text before "Editar" stays a textbox', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(
      <ToastProvider>
        <GeneratedTextField label="Resumo" text={STORED} criteriaItems={[]} state="edited" onConfirm={vi.fn()} onReplace={vi.fn()} onEdit={onEdit} draft={{ surface: 'setup', entityId: 'e', field: 'parecer' }} />
        <button type="button">fora</button>
      </ToastProvider>,
    );
    const area = screen.getByRole('textbox', { name: 'Resumo' });
    await user.click(area);
    await user.type(area, 'X');
    await pause(650);
    expect(onEdit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('SuggestionField (UX-DR45)', () => {
  it('draws the value with the "Sugerido" pill and writes nothing before "Confirmar"', async () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <SuggestionField label="Sugestão" onConfirm={onConfirm}>
        Aprovado · Sem restrições?
      </SuggestionField>,
    );
    expect(container.querySelector('.field.suggestion-field')).toHaveAttribute('data-state', 'suggested');
    expect(screen.getByRole('group', { name: 'Sugestão' })).toHaveTextContent('Aprovado · Sem restrições?');
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
