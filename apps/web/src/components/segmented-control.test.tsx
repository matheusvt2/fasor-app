import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control.tsx';

const THEME_OPTIONS = [
  { value: 'system', label: 'Sistema' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
] as const;

describe('SegmentedControl', () => {
  it('is a radiogroup with one radio per option, the selection reflected on the .seg label', () => {
    const { container } = render(<SegmentedControl value="system" onChange={vi.fn()} options={THEME_OPTIONS} aria-label="Tema" />);
    expect(screen.getByRole('radiogroup', { name: 'Tema' })).toHaveClass('segmented');

    const segments = container.querySelectorAll('.seg');
    expect(segments).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Sistema' }).closest('.seg')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Claro' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Claro' }).closest('.seg')).not.toHaveAttribute('data-selected');
  });

  it('applies the change immediately on selection (arrow keys move via the native radiogroup)', async () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="system" onChange={onChange} options={THEME_OPTIONS} aria-label="Tema" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
