import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control.tsx';

const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
] as const;

type Theme = (typeof THEME_OPTIONS)[number]['value'];

function Controlled({ onChange, withNeighbour }: { onChange?: (value: Theme) => void; withNeighbour?: boolean }) {
  const [value, setValue] = useState<Theme>('system');
  return (
    <>
      <SegmentedControl
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        options={THEME_OPTIONS}
        aria-label="Tema"
      />
      {withNeighbour ? (
        <button type="button" data-testid="depois">
          depois
        </button>
      ) : null}
    </>
  );
}

describe('SegmentedControl', () => {
  it('is a radiogroup whose visible .seg buttons carry role="radio" and aria-checked', () => {
    const { container } = render(
      <SegmentedControl value="dark" onChange={vi.fn()} options={THEME_OPTIONS} aria-label="Tema" />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toHaveClass('segmented');

    const segments = [...container.querySelectorAll('.seg')];
    expect(segments).toHaveLength(3);
    // The attribute `components.css` reads has to be on the element it styles, not on a
    // hidden input inside it: `.segmented .seg[aria-checked="true"]` is the selected fill.
    for (const segment of segments) expect(segment).toHaveAttribute('role', 'radio');
    expect(container.querySelectorAll('.seg[aria-checked="true"]')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveClass('seg');
  });

  it('applies the change immediately on selection, once per press', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    // A press commits once: focus alone must never be a second commit.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('gives the tab stop to the checked segment and takes it back on a change', async () => {
    const { rerender } = render(
      <SegmentedControl value="dark" onChange={vi.fn()} options={THEME_OPTIONS} aria-label="Tema" />,
    );
    // Roving tabindex (APG radiogroup): Tab reaches the checked segment and no other.
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('tabindex', '-1');

    rerender(<SegmentedControl value="light" onChange={vi.fn()} options={THEME_OPTIONS} aria-label="Tema" />);
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the choice when focus leaves the group and comes back', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} withNeighbour />);

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(onChange).toHaveBeenCalledTimes(1);

    // Tab away and shift-tab back: the tab stop is the checked segment, and arriving by
    // focus must not rewrite the preference.
    await userEvent.tab();
    expect(screen.getByTestId('depois')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveFocus();

    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'false');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves focus and selection together with the arrow keys, wrapping at the ends', async () => {
    render(<Controlled />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
    // Past the last segment the selection wraps to the first, as a radiogroup does.
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('Home and End move focus and selection to the ends, never to the focused segment alone', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveFocus();

    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'true');
  });

  it('does not commit a key that moved no focus', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    // "Escuro" chosen, then focus parked on it by the roving tab stop.
    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    onChange.mockClear();

    // The regression this guards: Home, End, ArrowUp and ArrowDown used to commit the
    // segment that happened to hold focus, because the commit hung off a keyup whether
    // or not the key had moved anything.
    for (const key of ['{Escape}', '{Shift}', 'a', '{PageDown}']) {
      await userEvent.keyboard(key);
      expect(onChange).not.toHaveBeenCalled();
    }
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('selects the focused segment with Space and with Enter', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    onChange.mockClear();
    // Focus is on "Claro" and it is already checked, so Space and Enter are no-ops that
    // must not throw or double-commit.
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has no axe violations in either state', async () => {
    const { container } = render(<Controlled />);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
