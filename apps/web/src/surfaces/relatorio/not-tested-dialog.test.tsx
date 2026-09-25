import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotTestedDialog } from './not-tested-dialog.tsx';

describe('NotTestedDialog', () => {
  it('E12-Q13: choosing "Outro" moves the focus to "Descreva o motivo" at once, so typing needs no second tap', async () => {
    const onSubmit = vi.fn();
    render(<NotTestedDialog seedVersion="v2" onClose={vi.fn()} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByText('Outro'));
    const text = screen.getByRole('textbox', { name: 'Descreva o motivo' });
    expect(text).toHaveFocus();
    await userEvent.keyboard('Chave travada');
    await userEvent.click(screen.getByRole('button', { name: 'Marcar não ensaiado' }));
    expect(onSubmit).toHaveBeenCalledWith('outro', 'Chave travada');
  });

  it('another reason asks for no text', async () => {
    render(<NotTestedDialog seedVersion="v2" onClose={vi.fn()} onSubmit={vi.fn()} />);
    await userEvent.click(screen.getByText('Equipamento inacessível'));
    expect(screen.queryByRole('textbox', { name: 'Descreva o motivo' })).not.toBeInTheDocument();
  });
});
