import type { BlockDefinition } from '@app/domain';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from '../../test-axe.ts';
import { TestHelpAction } from './test-help-dialog.tsx';

/*
 * Story 23.10 (batch e23h; `60-ficha.html` `#ficha-dlg-como-iso` and `#ficha-dlg-como-ttr`):
 * "Como ensaiar" on a test's section head, drawn only where the definition carries help, and its
 * read-only dialog: the filled headings in the kernel's order, the kernel's meta line, the focus on
 * the title, and Esc, the close button and "Voltar ao ensaio" giving the focus back to the button.
 * Synthetic texts.
 */

afterEach(cleanup);

const FIVE = { nr10: 'Desenergizar e aterrar.', objective: 'Conferir a relação.', procedure: 'Passos de exemplo.\nSegunda linha.', instrument: 'TTR calibrado.', connections: 'H1-H3 com X1-X0.' };
const EIGHT = { objective: 'A', instrument: 'B', voltage: 'C', connections: 'D', procedure: 'E', criterion: 'F', standard: 'G', nr10: 'H' };

function definition(tests: Record<string, unknown>[], measurement: Record<string, unknown>[] = []): BlockDefinition {
  return { label: 'Transformador de força', tests, measurement_tests: measurement } as unknown as BlockDefinition;
}

function open(def: BlockDefinition, testKey: string, title = 'Relação de transformação (TTR)') {
  return render(
    <section>
      <TestHelpAction definition={def} testKey={testKey} title={title} />
    </section>,
  );
}

const button = () => screen.getByRole('button', { name: 'Como ensaiar' });

describe('23.10 "Como ensaiar": the action', () => {
  it('draws no action for a test with no help, an empty help or only blank headings', () => {
    const def = definition([{ key: 'isolacao' }, { key: 'resistencia_contato', help: {} }, { key: 'relacao_transformacao', help: { objective: '  ' } }]);
    for (const key of ['isolacao', 'resistencia_contato', 'relacao_transformacao', 'ausente']) {
      const { container } = open(def, key);
      expect(container.querySelector('button')).toBeNull();
      cleanup();
    }
  });

  it('is a text button with the book icon that says it opens a dialog, in either grammar', () => {
    open(definition([], [{ key: 'tensoes_medidas', help: { objective: 'Texto.' } }]), 'tensoes_medidas');
    expect(button()).toHaveClass('btn', 'btn-text');
    expect(button()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button().querySelector('use')).toHaveAttribute('href', '/sprite.svg#i-book');
  });
});

describe('23.10 "Como ensaiar": the dialog', () => {
  it('lists only the filled headings in the fixed order, with the meta and its count, and the focus on the title', async () => {
    open(definition([{ key: 'relacao_transformacao', help: FIVE }]), 'relacao_transformacao');
    await userEvent.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Relação de transformação (TTR)' });
    expect(dialog).toHaveClass('form-dialog', 'como-dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Do tipo Transformador de força · abre sem conexão · não sai no relatório · 5 de 8 tópicos preenchidos');
    expect(within(dialog).getByText('Como ensaiar', { selector: '.como-kicker' })).toBeVisible();
    expect([...dialog.querySelectorAll('.como-list dt')].map((dt) => dt.textContent)).toEqual(['Objetivo', 'Instrumento', 'Ligações', 'Procedimento', 'Pré-requisito (NR-10)']);
    expect([...dialog.querySelectorAll('.como-list dd')].map((dd) => dd.textContent)).toEqual([FIVE.objective, FIVE.instrument, FIVE.connections, FIVE.procedure, FIVE.nr10]);
    const title = within(dialog).getByRole('heading', { level: 2, name: 'Relação de transformação (TTR)' });
    expect(title).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(title).toHaveFocus());
    // The focus stays on the title after the shell's own first-control pass.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(title).toHaveFocus();
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('with all eight headings filled the meta line has no count', async () => {
    open(definition([{ key: 'isolacao', help: EIGHT }]), 'isolacao', 'Ensaio de isolação');
    await userEvent.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Ensaio de isolação' });
    expect(dialog).toHaveAccessibleDescription('Do tipo Transformador de força · abre sem conexão · não sai no relatório');
    expect(dialog.querySelectorAll('.como-list dt')).toHaveLength(8);
  });

  it('Esc, the close button and "Voltar ao ensaio" each close it and give the focus back to the button', async () => {
    open(definition([{ key: 'isolacao', help: FIVE }]), 'isolacao');
    const closers: ((dialog: HTMLElement) => Promise<void>)[] = [
      async () => {
        await userEvent.keyboard('{Escape}');
      },
      async (dialog) => {
        await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar Como ensaiar' }));
      },
      async (dialog) => {
        await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar ao ensaio' }));
      },
    ];
    for (const close of closers) {
      button().focus();
      await userEvent.keyboard('{Enter}');
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus());
      await close(dialog);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(button()).toHaveFocus());
    }
  });
});
