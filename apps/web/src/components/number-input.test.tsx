import { numberEchoText, parseReadingPtBr } from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../state/toast.tsx';
import { useNumberInput, type ParsedNumber } from './number-input.tsx';

vi.mock('../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

/** A field whose commits land in "the store" after `delay` ms, like a Dexie live query. */
function Harness({ onCommit, delay = 0, external }: { onCommit: (value: ParsedNumber | null) => void; delay?: number; external?: { set: (raw: string) => void } }) {
  const [raw, setRaw] = useState<string | null>(null);
  if (external !== undefined) external.set = (next) => setRaw(next);
  const number = useNumberInput({
    storedText: raw ?? '',
    storedRaw: raw,
    parse: (text) => parseReadingPtBr(text, { units: ['A'], defaultUnit: 'A' }),
    commit: (value) => {
      onCommit(value);
      setTimeout(() => setRaw(value?.raw ?? null), delay);
    },
    echo: (value) => numberEchoText(value.raw, value.unit),
    draft: { surface: 'ficha', entityId: 'e', field: 'f' },
  });
  return (
    <div>
      <input aria-label="Corrente" {...number.inputProps} />
      {number.echo === null ? null : <span data-testid="echo">{number.echo}</span>}
      {number.invalid ? <span data-testid="invalid" /> : null}
      <button type="button">fora</button>
    </div>
  );
}

const renderField = (props: Parameters<typeof Harness>[0]) =>
  render(
    <ToastProvider>
      <Harness {...props} />
    </ToastProvider>,
  );

describe('useNumberInput (Story 5.5; PR #30 carry-over)', () => {
  it('"3.3", a pause, "00": never rewritten while typing, echoes "= 3.300 A", commits 3300 once on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderField({ onCommit });
    const input = screen.getByRole('textbox', { name: 'Corrente' });
    await user.type(input, '3.3');
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(onCommit).not.toHaveBeenCalled();
    await user.type(input, '00');
    expect(input).toHaveValue('3.300');
    expect(screen.getByTestId('echo')).toHaveTextContent('= 3.300 A');
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ raw: '3300', unit: 'A' });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    expect(input).toHaveValue('3.300');
  });

  it('Enter commits; a stored value that arrives while focused never replaces the typed text; it lands once blurred', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const external: { set: (raw: string) => void } = { set: () => undefined };
    renderField({ onCommit, external });
    const input = screen.getByRole('textbox', { name: 'Corrente' });
    await user.type(input, '12');
    act(() => external.set('99'));
    expect(input).toHaveValue('12');
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalledWith({ raw: '12', unit: 'A' });
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => external.set('7'));
    expect(input).toHaveValue('7');
  });

  it('text that is no number stays typed, is flagged and commits nothing', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    renderField({ onCommit });
    const input = screen.getByRole('textbox', { name: 'Corrente' });
    await user.type(input, 'abc');
    await user.click(screen.getByRole('button', { name: 'fora' }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue('abc');
    expect(screen.getByTestId('invalid')).toBeInTheDocument();
  });
});
