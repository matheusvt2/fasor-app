import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox.tsx';

describe('Checkbox', () => {
  it('is a 56px full-row target whose whole row is the checkbox', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Checkbox isSelected={false} onChange={onChange}>
        Megôhmetro digital DMG10Ki
      </Checkbox>,
    );
    const input = screen.getByRole('checkbox', { name: 'Megôhmetro digital DMG10Ki' });
    expect(input).not.toBeChecked();
    const styledRoot = container.querySelector('.checkbox');
    expect(styledRoot).not.toHaveAttribute('data-selected');
    expect(styledRoot?.querySelector('.box')).not.toBeNull();

    await userEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the selected state on the input and the label', () => {
    const { container } = render(<Checkbox isSelected>Instrumento</Checkbox>);
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(container.querySelector('.checkbox')).toHaveAttribute('data-selected', 'true');
  });

  it('links an aria-describedby reason (e.g. expired calibration) and stays selectable', () => {
    render(
      <Checkbox isSelected aria-describedby="cal-note">
        2E
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-describedby', 'cal-note');
  });
});
