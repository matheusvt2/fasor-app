import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { STICKY_BAR_COVERED, Toast, useStickyBarScrollPadding, type ToastMessage } from './toast.tsx';

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

describe('F-02 the toast keeps above the Sticky action bar', () => {
  it('carries the height the bar covers at the bottom of the viewport as --toast-bar, 0 px with no bar in view', () => {
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    document.body.append(bar);
    const height = window.innerHeight;
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ top: height - 136, bottom: height, height: 136, left: 0, right: 390, width: 390, x: 0, y: height - 136, toJSON: () => ({}) } as DOMRect);
    try {
      const { unmount } = render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
      expect(screen.getByTestId('toast').style.getPropertyValue('--toast-bar')).toBe('136px');
      unmount();
    } finally {
      bar.remove();
    }
    render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
    expect(screen.getByTestId('toast').style.getPropertyValue('--toast-bar')).toBe('0px');
  });
});

describe('F-11 a focused field stops above the Sticky action bar', () => {
  function Padded() {
    useStickyBarScrollPadding();
    return null;
  }

  function stub(bar: HTMLElement, height: number) {
    const top = window.innerHeight - height;
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ top, bottom: window.innerHeight, height, left: 0, right: 390, width: 390, x: 0, y: top, toJSON: () => ({}) } as DOMRect);
  }

  it('writes the height a sticky bar covers as --sticky-bar-covered on the root, and removes it with the bar', () => {
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    bar.style.position = 'sticky';
    document.body.append(bar);
    stub(bar, 200);
    try {
      const { unmount } = render(<Padded />);
      expect(document.documentElement.style.getPropertyValue(STICKY_BAR_COVERED)).toBe('200px');
      // The bar grows (the Bulk mirror): a scroll or a resize measures it again.
      stub(bar, 264);
      window.dispatchEvent(new Event('scroll'));
      expect(document.documentElement.style.getPropertyValue(STICKY_BAR_COVERED)).toBe('264px');
      unmount();
      expect(document.documentElement.style.getPropertyValue(STICKY_BAR_COVERED)).toBe('');
    } finally {
      bar.remove();
    }
  });

  it('leaves out a sticky bar inside a dialog (the caption composer\'s own bar)', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    bar.style.position = 'sticky';
    dialog.append(bar);
    document.body.append(dialog);
    stub(bar, 300);
    try {
      const { unmount } = render(<Padded />);
      expect(document.documentElement.style.getPropertyValue(STICKY_BAR_COVERED)).toBe('0px');
      unmount();
    } finally {
      dialog.remove();
    }
  });

  it('is 0 px while the bar is static (under a 480 px viewport height it flows after the content)', () => {
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    bar.style.position = 'static';
    document.body.append(bar);
    stub(bar, 124);
    try {
      const { unmount } = render(<Padded />);
      expect(document.documentElement.style.getPropertyValue(STICKY_BAR_COVERED)).toBe('0px');
      unmount();
    } finally {
      bar.remove();
    }
  });
});
