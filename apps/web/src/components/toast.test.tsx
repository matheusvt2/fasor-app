import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Toast, type ToastMessage } from './toast.tsx';

const message: ToastMessage = { id: 1, text: 'Rascunho encontrado', action: { label: 'Recuperar', onPress: () => undefined } };

/** A screen with a control before the toast; dismissing the toast removes it, as the provider does. */
function Screen({ onDismiss, withOpener = true }: { onDismiss: () => void; withOpener?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <main className="screen">
        {withOpener ? (
          <button type="button" onClick={() => undefined}>
            Abrir
          </button>
        ) : null}
      </main>
      {open ? (
        <Toast
          toast={message}
          onClose={() => setOpen(false)}
          onDismiss={() => {
            onDismiss();
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

describe('Toast Esc (B4)', () => {
  it('returns focus to the element focused before focus entered the toast', async () => {
    const onDismiss = vi.fn();
    render(<Screen onDismiss={onDismiss} />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    opener.focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Recuperar' })).toHaveFocus();
    // Moving inside the toast keeps the element from before it.
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('falls back to main when nothing was focused before the toast', async () => {
    render(<Screen onDismiss={() => undefined} withOpener={false} />);
    screen.getByRole('button', { name: 'Recuperar' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('toast')).toBeNull();
    const main = screen.getByRole('main');
    expect(main).toHaveFocus();
    expect(main).toHaveAttribute('tabindex', '-1');
  });
});
