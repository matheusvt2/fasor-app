import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog.tsx';
import { Button } from './button.tsx';

function renderDialog(onConfirm = vi.fn()) {
  render(
    <ConfirmDialog
      trigger={<Button>Remover</Button>}
      title="Remover ficha SEC-C09 e seus dados?"
      description="Dá para desfazer em seguida."
      confirmLabel="Remover ficha"
      isDestructive
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

describe('ConfirmDialog', () => {
  it('opens as a labelled, described modal dialog with the destructive action outlined', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    const dialog = await screen.findByRole('dialog', { name: 'Remover ficha SEC-C09 e seus dados?' });
    expect(dialog).toHaveClass('confirm-dialog');
    expect(dialog).toHaveAccessibleDescription('Dá para desfazer em seguida.');

    const confirmButton = screen.getByRole('button', { name: 'Remover ficha' });
    expect(confirmButton).toHaveClass('btn-destructive');
    expect(confirmButton).not.toHaveClass('btn-primary');
  });

  it('puts initial focus on Cancelar', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  });

  it('Cancelar closes without confirming; Esc also closes and returns focus', async () => {
    const onConfirm = renderDialog();
    const trigger = screen.getByRole('button', { name: 'Remover' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.click(trigger);
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('confirming calls onConfirm and closes', async () => {
    const onConfirm = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Remover ficha' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
