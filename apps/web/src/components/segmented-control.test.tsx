import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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

  it('keeps the choice when focus leaves the group and comes back', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} withNeighbour />);

    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(onChange).toHaveBeenCalledTimes(1);

    // Tab away and shift-tab back: wherever React Aria parks the roving tab stop,
    // arriving by focus must not rewrite the preference.
    await userEvent.tab();
    expect(screen.getByTestId('depois')).toHaveFocus();
    await userEvent.tab({ shift: true });

    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveAttribute('aria-checked', 'false');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves the selection with the arrow keys', async () => {
    render(<Controlled />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Sistema' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Claro' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveFocus();
    expect(screen.getByRole('radio', { name: 'Escuro' })).toHaveAttribute('aria-checked', 'true');
  });

  it('has no axe violations in either state', async () => {
    const { container } = render(<Controlled />);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
