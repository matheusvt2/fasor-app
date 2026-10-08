import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Timers } from '../input/field-commit.ts';
import { ToastOutlet, ToastProvider, useToast } from './toast.tsx';
import { useUndoableEdits } from './use-undoable-edits.ts';

/*
 * Review fix (Epic 13 QA, Q-1 queue): an undo toast queued behind a job outcome is withdrawn
 * when it is retired or when its surface leaves, so a stale "Desfazer" never shows after the
 * outcome's 6 s.
 */

vi.mock('./session.tsx', () => ({ useSession: () => ({ database: {} }) }));

function fakeTimers(): Timers & { run(): void } {
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
  };
}

function Surface() {
  const edits = useUndoableEdits();
  return (
    <>
      <button type="button" onClick={() => edits.undoable('Valor apagado', 'batch-1', { label: 'Desfazer' })}>
        apagar
      </button>
      <button type="button" onClick={edits.retire}>
        retirar
      </button>
    </>
  );
}

function Outcome() {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast('Revisão 1 pronta — DOCX e PDF', { outcome: true })}>
      revisão
    </button>
  );
}

function Harness({ timers, surface }: { timers: Timers; surface: boolean }) {
  return (
    <ToastProvider timers={timers}>
      <Outcome />
      {surface ? <Surface /> : null}
      <ToastOutlet />
    </ToastProvider>
  );
}

describe('review fix: an undo toast queued behind an outcome', () => {
  it('is withdrawn by retire: no "Desfazer" after the outcome', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} surface />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('apagar'));
    await userEvent.click(screen.getByText('retirar'));
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
  });

  it('pushed back to the head of the queue by an outcome, is withdrawn by retire', async () => {
    const timers = fakeTimers();
    render(<Harness timers={timers} surface />);
    await userEvent.click(screen.getByText('apagar'));
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('retirar'));
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('is withdrawn when the surface leaves', async () => {
    const timers = fakeTimers();
    const { rerender } = render(<Harness timers={timers} surface />);
    await userEvent.click(screen.getByText('revisão'));
    await userEvent.click(screen.getByText('apagar'));
    rerender(<Harness timers={timers} surface={false} />);
    act(() => timers.run());
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
