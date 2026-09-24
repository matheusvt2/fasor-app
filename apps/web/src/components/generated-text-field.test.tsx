import { render, screen } from '@testing-library/react';
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
      unmount();
    }
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
