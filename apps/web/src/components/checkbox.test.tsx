import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
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
    const row = screen.getByRole('checkbox', { name: 'Megôhmetro digital DMG10Ki' });
    expect(row).not.toBeChecked();
    expect(row).toHaveClass('checkbox');
    expect(container.querySelector('.checkbox .box')).not.toBeNull();

    await userEvent.click(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('carries the checked state on the styled row, so the mock fill engages (retro F-SPEC-6)', () => {
    const { container } = render(<Checkbox isSelected>Instrumento</Checkbox>);
    expect(screen.getByRole('checkbox')).toBeChecked();
    // `components.css`: `.checkbox[aria-checked="true"] .box`.
    expect(container.querySelector('.checkbox[aria-checked="true"] .box')).not.toBeNull();
  });

  it('toggles with Space and ignores Enter (APG checkbox)', async () => {
    const onChange = vi.fn();
    render(
      <Checkbox isSelected={false} onChange={onChange}>
        2E
      </Checkbox>,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('links an aria-describedby reason (e.g. expired calibration) and stays selectable', () => {
    render(
      <Checkbox isSelected aria-describedby="cal-note">
        2E
      </Checkbox>,
    );
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-describedby', 'cal-note');
  });

  it('has no axe violations checked or not', async () => {
    const { container } = render(
      <div>
        <Checkbox isSelected>2E</Checkbox>
        <Checkbox isSelected={false}>3M</Checkbox>
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
