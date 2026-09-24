import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TriStateControl, type TriStateValue } from './tri-state-control.tsx';

function Controlled({ initial = null, onChange }: { initial?: TriStateValue | null; onChange?: (value: TriStateValue | null) => void }) {
  const [value, setValue] = useState<TriStateValue | null>(initial);
  return (
    <>
      <TriStateControl
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
        aria-label="1. Limpeza"
      />
      <button type="button">depois</button>
    </>
  );
}

describe('TriStateControl (UX-DR37)', () => {
  it('is the mock markup: a radiogroup of three .seg radios with full-word names and letter text', async () => {
    const { container } = render(<Controlled />);
    const group = screen.getByRole('radiogroup', { name: '1. Limpeza' });
    expect(group).toHaveClass('tri-state');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Conforme', 'Não conforme', 'Não se aplica']);
    expect(radios.map((radio) => radio.textContent)).toEqual(['C', 'NC', 'NA']);
    expect(radios.map((radio) => radio.dataset.value)).toEqual(['c', 'nc', 'na']);
    expect(radios.every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(container.querySelector('.check')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('a tap selects; re-tapping the selected segment does nothing', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Não conforme' }));
    expect(onChange).toHaveBeenLastCalledWith('NC');
    expect(screen.getByRole('radio', { name: 'Não conforme' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Não conforme' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('roving tab stop, arrows move and wrap, Home/End, Delete and Backspace clear', async () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Conforme' })).toHaveFocus();
    // Focus alone commits nothing.
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Não se aplica' })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('NA');
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('C');
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('NA');
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith('C');
    await userEvent.keyboard('{Delete}');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('NC');
    await userEvent.keyboard('{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(null);
    // Tab leaves the group in one stop.
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'depois' })).toHaveFocus();
  });
});
