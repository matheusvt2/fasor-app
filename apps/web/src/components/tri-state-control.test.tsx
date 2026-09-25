import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
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

  it('committed=false (an na_defaults display default): tapping the pre-shown segment still commits a real cell', async () => {
    const onChange = vi.fn();
    render(
      <TriStateControl value="NA" committed={false} onChange={onChange} aria-label="1. Motor" />,
    );
    expect(screen.getByRole('radio', { name: 'Não se aplica' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Não se aplica' }));
    expect(onChange).toHaveBeenCalledWith('NA');
  });

  it('readOnly (Story 5.9, a not-tested sheet): aria-readonly, never aria-disabled, and onChange never fires by click, arrows or Delete', async () => {
    const onChange = vi.fn();
    render(<TriStateControl value="C" readOnly onChange={onChange} aria-label="1. Limpeza" />);
    const group = screen.getByRole('radiogroup', { name: '1. Limpeza' });
    expect(group).toHaveAttribute('aria-readonly', 'true');
    expect(group).not.toHaveAttribute('aria-disabled');
    await userEvent.click(screen.getByRole('radio', { name: 'Não conforme' }));
    expect(onChange).not.toHaveBeenCalled();
    screen.getByRole('radio', { name: 'Conforme' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Delete}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('E5-Q8: Space, ArrowRight, Delete before the value round-trips still clears (the guard reads the emitted value)', async () => {
    const onChange = vi.fn();
    // The prop never catches up here: the IndexedDB round trip has not rendered yet.
    render(<TriStateControl value={null} onChange={onChange} aria-label="1. Limpeza" />);
    screen.getByRole('radio', { name: 'Conforme' }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{Delete}');
    expect(onChange.mock.calls).toEqual([['C'], ['NC'], [null]]);
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
