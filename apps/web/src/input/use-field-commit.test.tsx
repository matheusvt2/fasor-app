import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastOutlet, ToastProvider } from '../state/toast.tsx';
import { useFieldCommit } from './use-field-commit.ts';

/*
 * Test 1.8-E2E-003's unit half (AD-8, FR-54): a write the browser refuses names itself,
 * the value is not lost, and nothing reaches the console as an unhandled rejection.
 */

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastOutlet />
    </ToastProvider>
  );
}

const named = (name: string) => {
  const error = new Error(name);
  error.name = name;
  return error;
};

/** Lets the rejected promise's `catch` and the toast state settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function mount(commit: (value: string) => void | Promise<void>) {
  return renderHook(() => useFieldCommit<string>({ commit }), { wrapper });
}

const toastText = () => screen.queryByTestId('toast')?.textContent ?? null;

describe('useFieldCommit error toast', () => {
  it('names a quota refusal and keeps the value pending for a retry', async () => {
    const commit = vi.fn<(value: string) => Promise<void>>(async () => {
      throw named('QuotaExceededError');
    });
    const { result } = mount(commit);

    act(() => result.current.immediate('valor'));
    await settle();
    expect(toastText()).toContain('Não foi possível salvar neste aparelho. Libere espaço e tente de novo.');
    // The value is not lost: the committer still holds it.
    expect(result.current.pending).toBe(true);

    // The retry is the user's next blur, never a timer that would loop forever.
    commit.mockImplementation(async () => {});
    act(() => result.current.blur());
    await settle();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith('valor');
    expect(result.current.pending).toBe(false);
  });

  it('names any other refusal with the shorter sentence', async () => {
    const { result } = mount(async () => {
      throw named('AbortError');
    });
    act(() => result.current.immediate('valor'));
    await settle();
    expect(toastText()).toContain('Não foi possível salvar. Tente de novo.');
  });

  it('raises the toast for a synchronous throw, which the controller still rethrows', async () => {
    const { result } = mount(() => {
      throw named('QuotaExceededError');
    });
    expect(() => act(() => result.current.immediate('valor'))).toThrow('QuotaExceededError');
    await settle();
    expect(toastText()).toContain('Não foi possível salvar neste aparelho.');
  });

  it('shows nothing when the write succeeds', async () => {
    const { result } = mount(async () => {});
    act(() => result.current.immediate('valor'));
    await settle();
    expect(toastText()).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('a newer value replaces a refused one rather than retrying the stale text', async () => {
    const commit = vi.fn(async (value: string) => {
      if (value === 'ruim') throw named('QuotaExceededError');
    });
    const { result } = mount(commit);
    act(() => result.current.immediate('ruim'));
    await settle();
    expect(result.current.pending).toBe(true);

    act(() => result.current.change('novo'));
    act(() => result.current.blur());
    await settle();
    expect(commit).toHaveBeenLastCalledWith('novo');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });

  // A synchronous throw out of `immediate()` is the discrete-control path (tri-state,
  // chip, picker, cell): the controller clears its pending value before calling commit
  // and does not re-queue on the way out, so the hook has to hold the value itself.
  it('keeps a value a discrete control refused synchronously', async () => {
    const commit = vi.fn((value: string) => {
      if (value === 'ruim') throw named('QuotaExceededError');
    });
    const { result } = mount(commit);

    expect(() => act(() => result.current.immediate('ruim'))).toThrow('QuotaExceededError');
    await settle();
    expect(toastText()).toContain('Não foi possível salvar neste aparelho.');
    expect(result.current.pending).toBe(true);

    commit.mockImplementation(() => {});
    act(() => result.current.blur());
    await settle();
    expect(commit).toHaveBeenLastCalledWith('ruim');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(false);
  });

  // Two writes in flight, the older one losing: without a sequence guard its rejection
  // would put the stale text back over the value that actually committed.
  it('ignores a rejection that a newer commit has already superseded', async () => {
    let releaseSlow: (() => void) | null = null;
    const commit = vi.fn(async (value: string) => {
      if (value === 'lento') {
        await new Promise<void>((resolve) => {
          releaseSlow = resolve;
        });
        throw named('QuotaExceededError');
      }
    });
    const { result } = mount(commit);

    act(() => result.current.immediate('lento'));
    await settle();
    act(() => result.current.immediate('novo'));
    await settle();

    // The slow write now fails, after the newer one succeeded.
    act(() => releaseSlow!());
    await settle();

    expect(toastText()).toBeNull();
    expect(result.current.pending).toBe(false);
    act(() => result.current.blur());
    await settle();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith('novo');
  });

  it('leaves no unhandled rejection behind', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { result } = mount(async () => {
        throw named('QuotaExceededError');
      });
      act(() => result.current.immediate('valor'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('keeps one controller across re-renders so typing is not interrupted', () => {
    const { result, rerender } = renderHook(
      ({ commit }: { commit: (value: string) => void }) => useFieldCommit<string>({ commit }),
      { wrapper, initialProps: { commit: vi.fn() } },
    );
    const first = result.current;
    rerender({ commit: vi.fn() });
    expect(result.current).toBe(first);
  });
});
