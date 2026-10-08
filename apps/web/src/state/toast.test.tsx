import { act, render, screen, within } from '@testing-library/react';
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

const opened = vi.fn();
const openedNewer = vi.fn();
const dismissed = vi.fn();
const undone = vi.fn();

function QueueButtons() {
  const { showToast, showOnce, dismissToast, withdrawToast } = useToast();
  return (
    <>
      <button type="button" onClick={dismissToast}>
        fechar
      </button>
      <button type="button" onClick={() => withdrawToast('1 leitura pronta para confirmar')}>
        retirar
      </button>
      <button type="button" onClick={() => showToast('1 leitura pronta para confirmar', { action: { label: 'Ver', onPress: openedNewer }, arrival: true })}>
        leitura nova
      </button>
      <button type="button" onClick={() => showToast('Revisão 1 pronta — DOCX e PDF', { outcome: true })}>
        revisão
      </button>
      <button type="button" onClick={() => showToast('Revisão 2 pronta — DOCX e PDF', { outcome: true })}>
        revisão 2
      </button>
      <button type="button" onClick={() => showToast('1 leitura pronta para confirmar', { action: { label: 'Ver', onPress: opened }, onDismiss: dismissed, arrival: true })}>
        leitura
      </button>
      <button type="button" onClick={() => showToast('Primeiro')}>
        primeiro
      </button>
      <button type="button" onClick={() => showToast('Segundo')}>
        segundo
      </button>
      <button type="button" onClick={() => showOnce('k', 'Uma vez')}>
        uma vez
      </button>
      <button type="button" onClick={() => showToast('Seção removida deste relatório — numeração refeita', { action: { label: 'Desfazer', onPress: undone } })}>
        remover
      </button>
    </>
  );
}

function QueueHarness({ timers }: { timers: Timers }) {
  return (
    <ToastProvider timers={timers}>
      <QueueButtons />
      <ToastOutlet />
    </ToastProvider>
  );
}

const shownText = () => screen.queryByTestId('toast')?.textContent ?? null;

describe('review F-03/F-04 (Q-1) the toast queue behind a job outcome', () => {
  it('a reading toast showing, then "Revisão 1 pronta": the revision shows now for 6 s, then the reading toast with its "Ver"', async () => {
    opened.mockReset();
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('leitura'));
    expect(shownText()).toContain('1 leitura pronta para confirmar');
    await userEvent.click(screen.getByText('revisão'));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(shownText()).toContain('Revisão 1 pronta — DOCX e PDF');
    // The outcome holds the slot for its 6 s; then the reading toast comes back, its action kept.
    expect(timers.pending()).toBe(1);
    act(() => timers.run());
    expect(shownText()).toContain('1 leitura pronta para confirmar');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('"Revisão 1 pronta" showing, a reading arrives: it waits, and shows after the 6 s', async () => {
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('leitura'));
    expect(shownText()).toContain('Revisão 1 pronta — DOCX e PDF');
    act(() => timers.run());
    expect(shownText()).toContain('1 leitura pronta para confirmar');
    expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument();
  });

  it('"Revisão 1 pronta" showing, a reading arrives: dismissing the revision shows the reading at once', async () => {
    dismissed.mockReset();
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('leitura'));
    await userEvent.click(screen.getByText('fechar'));
    expect(shownText()).toContain('1 leitura pronta para confirmar');
    expect(within(screen.getByTestId('toast')).getByRole('button', { name: 'Ver' })).toBeInTheDocument();
    // The revision's dismissal is not the reading toast's.
    expect(dismissed).not.toHaveBeenCalled();
  });

  it('queues FIFO, one text once; plain toasts among themselves still replace each other', async () => {
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('primeiro'));
    await userEvent.click(screen.getByText('segundo'));
    await userEvent.click(screen.getByText('primeiro'));
    await userEvent.click(screen.getByText('revisão 2'));
    expect(shownText()).toContain('Revisão 1 pronta');
    act(() => timers.run());
    expect(shownText()).toBe('Primeiro');
    act(() => timers.run());
    expect(shownText()).toBe('Segundo');
    act(() => timers.run());
    expect(shownText()).toContain('Revisão 2 pronta');
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();

    // No outcome on screen: today's replace semantics.
    await userEvent.click(screen.getByText('primeiro'));
    await userEvent.click(screen.getByText('segundo'));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(shownText()).toBe('Segundo');
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('showOnce queues behind an outcome too, and still shows its key once', async () => {
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('uma vez'));
    act(() => timers.run());
    expect(shownText()).toBe('Uma vez');
    act(() => timers.run());
    await userEvent.click(screen.getByText('uma vez'));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a same-text toast asked for while one is queued replaces it in place: the newer action is the one kept', async () => {
    opened.mockReset();
    openedNewer.mockReset();
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('leitura'));
    await userEvent.click(screen.getByText('primeiro'));
    await userEvent.click(screen.getByText('leitura nova'));
    act(() => timers.run());
    // Still first in line (replaced in place), with the newer "Ver".
    expect(shownText()).toContain('1 leitura pronta para confirmar');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(openedNewer).toHaveBeenCalledTimes(1);
    expect(opened).not.toHaveBeenCalled();
    expect(shownText()).toBe('Primeiro');
  });

  it('withdrawToast drops a queued toast of that text, and dismisses it when it is on screen', async () => {
    dismissed.mockReset();
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    // Queued behind the outcome, then withdrawn: it never shows.
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('leitura'));
    await userEvent.click(screen.getByText('retirar'));
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
    // Pushed back to the head of the queue by an outcome, then withdrawn: gone too.
    await userEvent.click(screen.getByText('leitura'));
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('retirar'));
    expect(shownText()).toContain('Revisão 1 pronta');
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
    // On screen: dismissed quietly (no `onDismiss`).
    await userEvent.click(screen.getByText('leitura'));
    await userEvent.click(screen.getByText('retirar'));
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(dismissed).not.toHaveBeenCalled();
  });
});

describe('Epic 13 re-check R-1: a toast answering the user\'s own press is not queued behind a job outcome', () => {
  it('"Revisão 1 pronta" showing, the user removes a section: "Seção removida" with "Desfazer" shows at once; the revision comes back for its full 6 s once it is dismissed', async () => {
    undone.mockReset();
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('remover'));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(shownText()).toContain('Seção removida deste relatório — numeração refeita');
    // An undo toast has no expiry: the interrupted outcome's timer is gone, it waits at the head.
    expect(timers.pending()).toBe(0);
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(undone).toHaveBeenCalledTimes(1);
    expect(shownText()).toContain('Revisão 1 pronta — DOCX e PDF');
    expect(timers.pending()).toBe(1);
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('the interrupted outcome goes back to the head of the queue, before a reading arrival that was waiting behind it', async () => {
    const timers = fakeTimers();
    render(<QueueHarness timers={timers} />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('leitura'));
    expect(shownText()).toContain('Revisão 1 pronta');
    await userEvent.click(screen.getByText('remover'));
    expect(shownText()).toContain('Seção removida');
    await userEvent.click(screen.getByText('fechar'));
    expect(shownText()).toContain('Revisão 1 pronta');
    act(() => timers.run());
    expect(shownText()).toContain('1 leitura pronta para confirmar');
  });
});
