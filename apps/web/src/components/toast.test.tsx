import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dropToastRoom, forgetPointerPress, keepClearOfStickyBar, keepClearOfToast, STICKY_BAR_COVERED, Toast, TOAST_CLEARANCE, TOAST_ROOM, TOAST_ROOM_UP, TOAST_UP, useStickyBarScrollPadding, type ToastMessage } from './toast.tsx';

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

// A press made by an earlier test is not the next one's (the focus rule skips a press's own focus).
beforeEach(() => forgetPointerPress());

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

/** A DOMRect from its top, height, left and width. */
function rect(top: number, height: number, left = 0, width = 390): DOMRect {
  return { top, bottom: top + height, height, left, right: left + width, width, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe('Review fixes 2026-10-08 (H-7, DE-6): a toast never covers the focused field nor the last rows', () => {
  it('writes its own height plus the --sp-3 gap as --toast-clearance on the root while it is up, and marks the root', () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.dataset.testid === 'toast' ? rect(600, 64) : original.call(this);
    });
    try {
      const { unmount } = render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
      expect(document.documentElement.style.getPropertyValue(TOAST_CLEARANCE)).toBe('calc(64px + var(--sp-3))');
      expect(document.documentElement.hasAttribute(TOAST_UP)).toBe(true);
      unmount();
      expect(document.documentElement.style.getPropertyValue(TOAST_CLEARANCE)).toBe('');
      expect(document.documentElement.hasAttribute(TOAST_UP)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('scrolls a focused element the toast overlaps until it ends the gap above the toast\'s top edge', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const toast = document.createElement('div');
    const field = document.createElement('input');
    document.body.append(field, toast);
    vi.spyOn(toast, 'getBoundingClientRect').mockReturnValue(rect(700, 60, 40, 300));
    const box = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rect(680, 48));
    try {
      keepClearOfToast(field, toast);
      // 728 - 700 + the 12 px gap (no tokens loaded in jsdom).
      expect(scrollBy).toHaveBeenCalledWith({ top: 40, behavior: 'instant' });
      scrollBy.mockClear();
      // Above the toast: nothing moves.
      box.mockReturnValue(rect(500, 48));
      keepClearOfToast(field, toast);
      // Beside it: nothing moves either.
      box.mockReturnValue(rect(700, 48, 360, 30));
      keepClearOfToast(field, toast);
      expect(scrollBy).not.toHaveBeenCalled();
      // Inside a dialog (it sits over the toast) or inside the toast: left alone.
      box.mockReturnValue(rect(680, 48));
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.append(dialog);
      dialog.append(field);
      keepClearOfToast(field, toast);
      toast.append(field);
      keepClearOfToast(field, toast);
      expect(scrollBy).not.toHaveBeenCalled();
      dialog.remove();
      // Taller than the room above the toast (a section host focused by a stepper jump): it
      // scrolls only until its own top reaches the top of the page, never to its end.
      document.body.append(field);
      box.mockReturnValue(rect(100, 900));
      keepClearOfToast(field, toast);
      expect(scrollBy).toHaveBeenLastCalledWith({ top: 100, behavior: 'instant' });
      scrollBy.mockClear();
      box.mockReturnValue(rect(0, 900));
      keepClearOfToast(field, toast);
      expect(scrollBy).not.toHaveBeenCalled();
    } finally {
      scrollBy.mockRestore();
      field.remove();
      toast.remove();
    }
  });

  it('applies the rule to the field focused when the toast appears, and to a field focused while it is up', async () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const original = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'toast') return rect(700, 60);
      if (this.dataset.under === '') return rect(690, 48);
      return original.call(this);
    });
    try {
      const { rerender } = render(
        <main>
          <input aria-label="Coberto" data-under="" />
          <input aria-label="Outro" />
        </main>,
      );
      screen.getByRole('textbox', { name: 'Coberto' }).focus();
      rerender(
        <main>
          <input aria-label="Coberto" data-under="" />
          <input aria-label="Outro" />
          <Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />
        </main>,
      );
      expect(scrollBy).toHaveBeenCalledWith({ top: 50, behavior: 'instant' });
      scrollBy.mockClear();
      screen.getByRole('textbox', { name: 'Outro' }).focus();
      screen.getByRole('textbox', { name: 'Coberto' }).focus();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      expect(scrollBy).toHaveBeenCalledTimes(1);
      expect(scrollBy).toHaveBeenCalledWith({ top: 50, behavior: 'instant' });
    } finally {
      spy.mockRestore();
      scrollBy.mockRestore();
    }
  });
});

describe('status flow 2026-10-10 (the lost tap of 12.1-E2E-006): a toast never moves what a finger is on', () => {
  /** A covered control and a toast, with the toast's and the control's boxes overlapping. */
  function covered(toast: ToastMessage) {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const original = HTMLElement.prototype.getBoundingClientRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === 'toast') return rect(700, 60);
      if (this.dataset.under === '') return rect(690, 48);
      return original.call(this);
    });
    const view = (withToast: boolean) => (
      <main>
        <button type="button" data-under="">
          Coberto
        </button>
        <input aria-label="Outro" />
        {withToast ? <Toast toast={toast} onClose={() => undefined} onDismiss={() => undefined} /> : null}
      </main>
    );
    const { rerender } = render(view(false));
    return {
      scrollBy,
      show: () => rerender(view(true)),
      restore: () => {
        spy.mockRestore();
        scrollBy.mockRestore();
      },
    };
  }
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  it('a focus given by a pointer press does not scroll the pressed control clear of the toast; a keyboard focus still does', async () => {
    const page = covered(message);
    try {
      const button = screen.getByRole('button', { name: 'Coberto' });
      // The press starts before the toast is up, and the toast appears under it (the WebKit
      // order: `pointerdown`, the toast, then `mousedown` and the focus it gives).
      button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      page.show();
      expect(page.scrollBy).not.toHaveBeenCalled();
      button.focus();
      await frame();
      expect(page.scrollBy).not.toHaveBeenCalled();
      button.dispatchEvent(new Event('pointerup', { bubbles: true }));
      // A touch tap focuses its target right after the pointer came up: still the press's own focus.
      screen.getByRole('textbox', { name: 'Outro' }).focus();
      button.focus();
      await frame();
      expect(page.scrollBy).not.toHaveBeenCalled();
      // Long after the press, the keyboard moves the focus there: the rule applies.
      const real = performance.now.bind(performance);
      const now = vi.spyOn(performance, 'now').mockImplementation(() => real() + 5_000);
      try {
        screen.getByRole('textbox', { name: 'Outro' }).focus();
        button.focus();
        await frame();
        expect(page.scrollBy).toHaveBeenCalledWith({ top: 50, behavior: 'instant' });
      } finally {
        now.mockRestore();
      }
    } finally {
      page.restore();
    }
  });

  it('a passive toast (an edit\'s status toast) does not scroll the page when it appears, and is marked so no press lands on it', () => {
    const page = covered({ id: 9, text: 'Relatório em campo', passive: true });
    try {
      screen.getByRole('button', { name: 'Coberto' }).focus();
      page.show();
      expect(page.scrollBy).not.toHaveBeenCalled();
      expect(screen.getByTestId('toast')).toHaveAttribute('data-passive');
    } finally {
      page.restore();
    }
  });
});

describe('Review fixes 2026-10-08 (DE-6): the bottom room outlives its toast only while it is in view', () => {
  const root = document.documentElement;
  function pageHeight(height: number) {
    Object.defineProperty(root, 'scrollHeight', { value: height, configurable: true });
  }

  it('keeps the room after the toast while the page is at its end, and drops it once a scroll takes it out of view', () => {
    pageHeight(window.innerHeight);
    const { unmount } = render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(true);
    unmount();
    // The scroll padding goes at once; the room stays under the reader at the end of the page.
    expect(root.hasAttribute(TOAST_UP)).toBe(false);
    expect(root.style.getPropertyValue(TOAST_CLEARANCE)).toBe('');
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(true);
    expect(root.style.getPropertyValue(TOAST_ROOM)).not.toBe('');
    // A scroll that leaves the end behind (the page grew longer than the room's reach) drops it.
    pageHeight(window.innerHeight + 2000);
    window.dispatchEvent(new Event('scroll'));
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(false);
    expect(root.style.getPropertyValue(TOAST_ROOM)).toBe('');
  });

  it('drops the room at once when the page is away from its end, and on a route change (dropToastRoom)', () => {
    pageHeight(window.innerHeight + 2000);
    const away = render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
    away.unmount();
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(false);

    pageHeight(window.innerHeight);
    const atEnd = render(<Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} />);
    atEnd.unmount();
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(true);
    dropToastRoom();
    expect(root.hasAttribute(TOAST_ROOM_UP)).toBe(false);
    pageHeight(0);
  });
});

describe('Review fixes 2026-10-08: a toast that leaves with the focus in it hands the focus back', () => {
  it('returns the focus to where it was when the toast is withdrawn under it, as Esc does', async () => {
    function Host({ up }: { up: boolean }) {
      return (
        <main>
          <button type="button">Antes</button>
          {up ? <Toast toast={message} onClose={() => undefined} onDismiss={() => undefined} /> : null}
        </main>
      );
    }
    const { rerender } = render(<Host up />);
    screen.getByRole('button', { name: 'Antes' }).focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Recuperar' })).toHaveFocus();
    // Withdrawn (or expired, or advanced) while the keyboard is in it.
    rerender(<Host up={false} />);
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveFocus();
  });
});

describe('Carry-over co14a (F-11 on WebKit): a field the keyboard focused stops clear of the Sticky action bar and the App bar', () => {
  /** A sticky App bar 56 px tall and a sticky Sticky action bar covering the viewport's last 100 px (jsdom: 768 px tall). */
  function bars(): { appBar: HTMLElement; bar: HTMLElement; floor: number } {
    const appBar = document.createElement('header');
    appBar.className = 'app-bar';
    appBar.style.position = 'sticky';
    vi.spyOn(appBar, 'getBoundingClientRect').mockReturnValue(rect(0, 56));
    const bar = document.createElement('div');
    bar.className = 'sticky-action-bar';
    bar.style.position = 'sticky';
    const floor = window.innerHeight - 100;
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(rect(floor, 100));
    document.body.append(appBar, bar);
    return { appBar, bar, floor };
  }

  it('scrolls a field under the bar up until its bottom meets the bar, one under the App bar down, and a taller one to its own top', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const { appBar, bar, floor } = bars();
    const field = document.createElement('input');
    document.body.append(field);
    const box = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rect(floor - 18, 48));
    try {
      keepClearOfStickyBar(field);
      expect(scrollBy).toHaveBeenLastCalledWith({ top: 30, behavior: 'instant' });
      // Under the App bar: scrolls back by what it hides.
      box.mockReturnValue(rect(20, 48));
      keepClearOfStickyBar(field);
      expect(scrollBy).toHaveBeenLastCalledWith({ top: -36, behavior: 'instant' });
      // Taller than the room, its top under the App bar: its top comes into view, never its end.
      box.mockReturnValue(rect(40, 700));
      keepClearOfStickyBar(field);
      expect(scrollBy).toHaveBeenLastCalledWith({ top: -16, behavior: 'instant' });
      // Taller than the room, its top in view: it stays.
      scrollBy.mockClear();
      box.mockReturnValue(rect(56, 700));
      keepClearOfStickyBar(field);
      // Clear of both: nothing moves. Exactly on the floor: nothing moves either.
      box.mockReturnValue(rect(300, 48));
      keepClearOfStickyBar(field);
      box.mockReturnValue(rect(floor - 48, 48));
      keepClearOfStickyBar(field);
      expect(scrollBy).not.toHaveBeenCalled();
      // Inside the bar or a dialog: left alone.
      box.mockReturnValue(rect(floor - 18, 48));
      bar.append(field);
      keepClearOfStickyBar(field);
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      document.body.append(dialog);
      dialog.append(field);
      keepClearOfStickyBar(field);
      expect(scrollBy).not.toHaveBeenCalled();
      dialog.remove();
      // Inside an open menu or listbox: left alone, or the scroll moves an item under the
      // pointer that opened it and the pointer's release picks it.
      for (const role of ['menu', 'listbox']) {
        const popover = document.createElement('div');
        popover.setAttribute('role', role);
        document.body.append(popover);
        popover.append(field);
        keepClearOfStickyBar(field);
        popover.remove();
      }
      expect(scrollBy).not.toHaveBeenCalled();
      // A static App bar covers nothing: only the bar counts.
      document.body.append(field);
      appBar.style.position = 'static';
      box.mockReturnValue(rect(20, 48));
      keepClearOfStickyBar(field);
      expect(scrollBy).not.toHaveBeenCalled();
    } finally {
      scrollBy.mockRestore();
      appBar.remove();
      bar.remove();
      field.remove();
    }
  });

  it('acts on a focus a Tab or an Enter moved, never on one with no key before it', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1e9);
    const { appBar, bar, floor } = bars();
    function Host() {
      useStickyBarScrollPadding();
      return (
        <>
          <input aria-label="A" />
          <input aria-label="B" />
        </>
      );
    }
    const { unmount } = render(<Host />);
    const [a, b] = [screen.getByRole('textbox', { name: 'A' }), screen.getByRole('textbox', { name: 'B' })];
    vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(rect(floor - 18, 48));
    vi.spyOn(b, 'getBoundingClientRect').mockReturnValue(rect(floor - 18, 48));
    try {
      // No key: a press or the app focused it.
      a.focus();
      expect(scrollBy).not.toHaveBeenCalled();
      // A Tab, then the focus it moves.
      fireEvent.keyDown(document.body, { key: 'Tab' });
      b.focus();
      expect(scrollBy).toHaveBeenCalledWith({ top: 30, behavior: 'instant' });
      // 500 ms after the key the focus is no longer the key's.
      scrollBy.mockClear();
      now.mockReturnValue(1e9 + 500);
      a.focus();
      expect(scrollBy).not.toHaveBeenCalled();
    } finally {
      unmount();
      scrollBy.mockRestore();
      now.mockRestore();
      appBar.remove();
      bar.remove();
    }
  });
});
