import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import { LocalDialog, type LocalDialogResult } from './local-dialog.tsx';

/*
 * Story 14.2: the Função dialog (`42-template-composer.html` `#tc-dlg-local`), shared by the
 * Template composer and the relatório tree. "Adicionar local" asks the Função and a name
 * that follows it until typed; "Função e nome" is the same form filled in.
 */

afterEach(cleanup);

function open(props: Partial<Parameters<typeof LocalDialog>[0]> = {}) {
  const onSubmit = vi.fn<(result: LocalDialogResult) => void>();
  const onClose = vi.fn();
  const view = render(<LocalDialog mode="add" seedVersion="v5" onSubmit={onSubmit} onClose={onClose} {...props} />);
  return { ...view, onSubmit, onClose };
}

const radios = () => screen.getAllByRole('radio');
const name = () => screen.getByRole('textbox', { name: 'Nome' });

describe('Epic 14 QA Q-17: the description follows the seed version', () => {
  it('names the Verificações do local on a seed with site items (mock 42), and leaves them out on v1 to v3', () => {
    open();
    expect(screen.getByText(/^Cada cabine é um local\./)).toHaveTextContent(
      'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio, o agrupamento por tipo e as Verificações do local. Os equipamentos ficam direto no local ou nas colunas de um painel.',
    );
    cleanup();
    open({ seedVersion: 'v3' });
    expect(screen.getByText(/^Cada cabine é um local\./)).toHaveTextContent(
      'Cada cabine é um local. O local guarda a função, as características da SE, o ambiente de ensaio e o agrupamento por tipo. Os equipamentos ficam direto no local ou nas colunas de um painel.',
    );
  });
});

describe('14.2 LocalDialog: "Adicionar local"', () => {
  it('asks the Função in a radiogroup of five, nothing chosen, and holds the primary with its reason until one is', async () => {
    const { onSubmit } = open();
    const dialog = screen.getByRole('dialog', { name: 'Adicionar local' });
    expect(within(dialog).getByRole('radiogroup', { name: 'Função' })).toBeVisible();
    expect(radios().map((radio) => radio.textContent)).toEqual(['Entrada', 'Primária', 'Transformação', 'Distribuição', 'Outra']);
    expect(radios().every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.queryByRole('textbox', { name: 'Qual função' })).toBeNull();
    expect(name()).toHaveValue('');
    const primary = within(dialog).getByRole('button', { name: 'Adicionar local' });
    expect(primary).toHaveAttribute('aria-disabled', 'true');
    expect(primary).toHaveAccessibleDescription('Escolha a função');
    await userEvent.click(primary);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  it('proposes the name of each Função (the kernel words), and stores the reserved key', async () => {
    const { onSubmit } = open();
    const expected: Record<string, string> = {
      Entrada: 'Cabine de entrada',
      Primária: 'Cabine primária',
      Transformação: 'Cabine de transformação',
      Distribuição: 'Cabine de distribuição',
    };
    for (const [label, proposed] of Object.entries(expected)) {
      await userEvent.click(screen.getByRole('radio', { name: label }));
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
      expect(name()).toHaveValue(proposed);
    }
    await userEvent.click(screen.getByRole('radio', { name: 'Primária' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar local' }));
    expect(onSubmit).toHaveBeenCalledWith({ funcao: 'primaria', name: 'Cabine primária' });
  });

  it('"Outra" reveals "Qual função"; the name follows what is typed, in lower case, and the typed text is what is stored', async () => {
    const { onSubmit } = open();
    await userEvent.click(screen.getByRole('radio', { name: 'Outra' }));
    const other = screen.getByRole('textbox', { name: 'Qual função' });
    expect(other).toHaveAccessibleDescription('Escrita como deve aparecer na árvore e no relatório.');
    expect(other).toHaveAttribute('maxlength', '80');
    expect(screen.getByRole('button', { name: 'Adicionar local' })).toHaveAccessibleDescription('Informe a função');
    await userEvent.type(other, 'Medição');
    expect(name()).toHaveValue('Cabine de medição');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar local' }));
    expect(onSubmit).toHaveBeenCalledWith({ funcao: 'Medição', name: 'Cabine de medição' });
    // Another Função takes the text field away again.
    await userEvent.click(screen.getByRole('radio', { name: 'Entrada' }));
    expect(screen.queryByRole('textbox', { name: 'Qual função' })).toBeNull();
  });

  it('stops following the Função once the name is typed in, and refuses a blank name', async () => {
    const { onSubmit } = open();
    await userEvent.click(screen.getByRole('radio', { name: 'Primária' }));
    await userEvent.clear(name());
    await userEvent.type(name(), 'Cabine primária — 1° Subsolo');
    await userEvent.click(screen.getByRole('radio', { name: 'Transformação' }));
    expect(name()).toHaveValue('Cabine primária — 1° Subsolo');
    expect(name()).toHaveAccessibleDescription('Vem da função; complete com o lugar, como em "Cabine primária — 1° Subsolo".');
    await userEvent.clear(name());
    expect(screen.getByRole('button', { name: 'Adicionar local' })).toHaveAccessibleDescription('Informe o nome');
    // Enter in the field tries, says why and writes nothing.
    await userEvent.type(name(), '{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(name()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome');
    await userEvent.type(name(), ' Sala A {Enter}');
    expect(onSubmit).toHaveBeenCalledWith({ funcao: 'transformacao', name: 'Sala A' });
  });

  it('moves the focus through the radios with the arrows, one row in the tab order, and has no violations', async () => {
    const { container, onClose } = open();
    const [first, second] = radios();
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    first!.focus();
    fireEvent.keyDown(first!, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second!, { key: 'End' });
    expect(radios()[4]).toHaveFocus();
    fireEvent.keyDown(radios()[4]!, { key: 'ArrowRight' });
    expect(first).toHaveFocus();
    // Moving the focus chooses nothing; Space or Enter (a click on a button) does.
    expect(radios().every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    await userEvent.keyboard(' ');
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(radios().map((radio) => radio.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(await axe(container.ownerDocument.body)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('14.2 LocalDialog: "Função e nome"', () => {
  it('opens filled with the local Função and name, keeps the name when the Função changes, and saves both', async () => {
    const { onSubmit } = open({ mode: 'edit', initial: { funcao: 'transformacao', name: 'Cabine de transformação — 1° Subsolo' } });
    const dialog = screen.getByRole('dialog', { name: 'Função e nome' });
    expect(screen.getByRole('radio', { name: 'Transformação' })).toHaveAttribute('aria-checked', 'true');
    expect(name()).toHaveValue('Cabine de transformação — 1° Subsolo');
    await userEvent.click(screen.getByRole('radio', { name: 'Distribuição' }));
    expect(name()).toHaveValue('Cabine de transformação — 1° Subsolo');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(onSubmit).toHaveBeenCalledWith({ funcao: 'distribuicao', name: 'Cabine de transformação — 1° Subsolo' });
  });

  it('reads a typed Função back under "Outra"', () => {
    open({ mode: 'edit', initial: { funcao: 'Medição', name: 'Sala de medição' } });
    expect(screen.getByRole('radio', { name: 'Outra' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('textbox', { name: 'Qual função' })).toHaveValue('Medição');
  });

  it('a local with no Função may be renamed alone: nothing is chosen, and the answer carries no Função', async () => {
    const { onSubmit } = open({ mode: 'edit', initial: { funcao: null, name: 'Cubículo Enel' } });
    expect(radios().every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    const save = screen.getByRole('button', { name: 'Salvar' });
    expect(save).not.toHaveAttribute('aria-disabled');
    await userEvent.clear(name());
    await userEvent.type(name(), 'Cubículo da concessionária');
    await userEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith({ funcao: null, name: 'Cubículo da concessionária' });
  });
});
