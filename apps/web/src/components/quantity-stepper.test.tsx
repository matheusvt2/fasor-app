import { quantityLabel } from '@app/domain';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_AND_HOLD_MS } from '../input/use-press-and-hold.ts';
import { QuantityStepper, STEP_REPEAT_MS } from './quantity-stepper.tsx';

const label = (n: number) => quantityLabel('chave_seccionadora', n);

/** A stepper whose commits land in state, like the composer's live row. */
function Harness({ initial = 0, onCommit = vi.fn() }: { initial?: number; onCommit?: (n: number) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <QuantityStepper
      value={value}
      label={label}
      onCommit={async (n) => {
        onCommit(n);
        setValue(n);
      }}
    />
  );
}

const group = () => screen.getByRole('group');
const count = () => screen.getByRole('textbox', { name: 'Quantidade' });

afterEach(() => {
  vi.useRealTimers();
});

describe('QuantityStepper (UX-DR30)', () => {
  it('draws the mock markup: a named group, "Menos um" / "Mais um" steps and "—" at zero', async () => {
    const { container } = render(<Harness />);
    expect(group()).toHaveClass('quantity-stepper');
    expect(group()).toHaveAccessibleName('Seccionadoras, 0');
    expect(screen.getByRole('button', { name: 'Menos um' })).toHaveClass('step');
    expect(screen.getByRole('button', { name: 'Mais um' })).toHaveClass('step');
    expect(count()).toHaveValue('—');
    expect(count()).toHaveClass('count', 'is-zero');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('"+" and "−" step and commit once per press, and the label follows', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(count()).toHaveValue('2'));
    expect(group()).toHaveAccessibleName('Seccionadoras, 2');
    expect(onCommit.mock.calls).toEqual([[1], [2]]);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Seccionadoras, 2'));

    await userEvent.click(screen.getByRole('button', { name: 'Menos um' }));
    await userEvent.click(screen.getByRole('button', { name: 'Menos um' }));
    await waitFor(() => expect(count()).toHaveValue('—'));
    expect(count()).toHaveClass('is-zero');
    // "−" at zero writes nothing.
    await userEvent.click(screen.getByRole('button', { name: 'Menos um' }));
    expect(onCommit.mock.calls).toEqual([[1], [2], [1], [0]]);
  });

  it('steps from the keyboard with Enter and Space on a step button', async () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    screen.getByRole('button', { name: 'Mais um' }).focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    await waitFor(() => expect(count()).toHaveValue('2'));
    expect(onCommit.mock.calls).toEqual([[1], [2]]);
  });

  it('commits a typed number on blur or Enter, clamped to 99; anything else restores with no commit', async () => {
    const onCommit = vi.fn();
    render(<Harness initial={4} onCommit={onCommit} />);
    await userEvent.click(count());
    await userEvent.clear(count());
    await userEvent.type(count(), '25');
    await userEvent.tab();
    await waitFor(() => expect(count()).toHaveValue('25'));
    expect(onCommit).toHaveBeenLastCalledWith(25);

    await userEvent.click(count());
    await userEvent.clear(count());
    await userEvent.type(count(), '150{Enter}');
    await waitFor(() => expect(count()).toHaveValue('99'));

    for (const bad of ['abc', '-3']) {
      onCommit.mockClear();
      await userEvent.click(count());
      await userEvent.clear(count());
      await userEvent.type(count(), bad);
      await userEvent.tab();
      expect(count()).toHaveValue('99');
      expect(onCommit).not.toHaveBeenCalled();
    }
  });

  it('holding "+" steps once, repeats every 100 ms after 300 ms, and commits once on release', async () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const plus = screen.getByRole('button', { name: 'Mais um' });
    fireEvent.pointerDown(plus, { button: 0, pointerId: 1, pointerType: 'touch' });
    expect(count()).toHaveValue('1');
    act(() => vi.advanceTimersByTime(PRESS_AND_HOLD_MS + STEP_REPEAT_MS * 5));
    expect(count()).toHaveValue('6');
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.pointerUp(plus, { button: 0, pointerId: 1, pointerType: 'touch' });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(onCommit.mock.calls).toEqual([[6]]);
    // The release is not followed by another step.
    act(() => vi.advanceTimersByTime(STEP_REPEAT_MS * 5));
    expect(count()).toHaveValue('6');
  });

  it('puts the committed value back when the write is refused', async () => {
    render(
      <QuantityStepper
        value={3}
        label={label}
        onCommit={() => Promise.reject(Object.assign(new Error('quota'), { name: 'QuotaExceededError' }))}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(count()).toHaveValue('3'));
  });

  it('a disabled stepper writes nothing and points at its reason', async () => {
    const onCommit = vi.fn();
    render(
      <>
        <p id="why">Selecione uma cabine ou coluna.</p>
        <QuantityStepper value={0} label={label} onCommit={onCommit} isDisabled disabledReasonId="why" />
      </>,
    );
    const plus = screen.getByRole('button', { name: 'Mais um' });
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).toHaveAccessibleDescription('Selecione uma cabine ou coluna.');
    await userEvent.click(plus);
    expect(count()).toHaveValue('—');
    expect(onCommit).not.toHaveBeenCalled();
  });
});
