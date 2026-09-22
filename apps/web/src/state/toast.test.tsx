import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Timers } from '../input/field-commit.ts';
import { ToastOutlet, ToastProvider, useToast, TOAST_TIMEOUT_MS } from './toast.tsx';

/** A timer the test fires by hand, the same shape the field-commit layer uses. */
function fakeTimers(): Timers & { run(): void; pending(): number } {
  const queue = new Map<number, () => void>();
  let seq = 0;
  return {
    setTimeout(cb) {
      const id = ++seq;
      queue.set(id, cb);
      return id;
    },
    clearTimeout(handle) {
      queue.delete(handle as number);
    },
    run() {
      const entries = [...queue.entries()];
      queue.clear();
      for (const [, cb] of entries) cb();
    },
    pending: () => queue.size,
  };
}

function Harness({ timers }: { timers: Timers }) {
  return (
    <ToastProvider timers={timers}>
      <Buttons />
      <ToastOutlet />
    </ToastProvider>
  );
}

const acted = vi.fn();

function Buttons() {
  const { showToast, showOnce } = useToast();
  return (
    <>
      <button type="button" onClick={() => showToast('Primeiro')}>
        primeiro
      </button>
      <button type="button" onClick={() => showToast('Segundo')}>
        segundo
      </button>
      <button type="button" onClick={() => showToast('Com ação', { action: { label: 'Desfazer', onPress: acted } })}>
        com ação
      </button>
      <button type="button" onClick={() => showOnce('k', 'Sem conexão. Tudo fica salvo neste aparelho.')}>
        uma vez
      </button>
    </>
  );
}

describe('Toast', () => {
  it('shows one at a time: the second replaces the first', async () => {
    render(<Harness timers={fakeTimers()} />);
    await userEvent.click(screen.getByText('primeiro'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Primeiro');
    await userEvent.click(screen.getByText('segundo'));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(screen.getByTestId('toast')).toHaveTextContent('Segundo');
  });

  it('is a status region that clears itself after 6 s without an action', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} />);
    await userEvent.click(screen.getByText('primeiro'));
    expect(screen.getByTestId('toast')).toHaveAttribute('role', 'status');
    expect(TOAST_TIMEOUT_MS).toBe(6_000);
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('with an action, stays until it is dismissed', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} />);
    await userEvent.click(screen.getByText('com ação'));
    // Nothing was scheduled: an action means the toast waits for the user.
    expect(timers.pending()).toBe(0);
    const action = screen.getByRole('button', { name: 'Desfazer' });
    expect(action).toHaveClass('toast-action');
    await userEvent.click(action);
    expect(acted).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('showOnce shows a key once for the page session', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} />);
    await userEvent.click(screen.getByText('uma vez'));
    expect(screen.getByTestId('toast')).toHaveTextContent('Sem conexão. Tudo fica salvo neste aparelho.');
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
    await userEvent.click(screen.getByText('uma vez'));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('showToast answers every time, which is what a repeated tap needs', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} />);
    await userEvent.click(screen.getByText('primeiro'));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
    // Unlike `showOnce`, a second call of the same sentence shows again: Home's
    // "Não está neste aparelho" tap must answer on the second tap as well.
    await userEvent.click(screen.getByText('primeiro'));
    expect(screen.getByTestId('toast')).toBeInTheDocument();
  });
});
