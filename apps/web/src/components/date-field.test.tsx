import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../test-axe.ts';
import { useState } from 'react';
import { I18nProvider } from 'react-aria-components';
import { describe, expect, it, vi } from 'vitest';
import { DateField } from './date-field.tsx';

function Harness({ onChange, initial = null }: { onChange: (v: string | null) => void; initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <I18nProvider locale="pt-BR">
      <DateField
        label="Início da parada"
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
    </I18nProvider>
  );
}

describe('DateField', () => {
  it('renders the mock field shell: label, .input box with pt-BR segments and the calendar glyph', async () => {
    const { container } = render(<Harness onChange={vi.fn()} />);
    expect(screen.getByText('Início da parada')).toHaveClass('field-label');
    const group = screen.getByRole('group', { name: 'Início da parada' });
    expect(group).toHaveClass('input');
    const segments = screen.getAllByRole('spinbutton');
    // React Aria names each segment "dia, " (the field's name follows through aria-labelledby).
    expect(segments.map((s) => s.getAttribute('aria-label')?.replace(/,\s*$/, ''))).toEqual(['dia', 'mês', 'ano']);
    expect(container.querySelector('use')?.getAttribute('href')).toBe('/sprite.svg#i-calendar');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('typing 06092026 yields 2026-09-06', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const [day] = screen.getAllByRole('spinbutton');
    await userEvent.click(day!);
    await userEvent.keyboard('06092026');
    expect(onChange).toHaveBeenLastCalledWith('2026-09-06');
  });

  it('shows an ISO value in the segments', () => {
    render(<Harness onChange={vi.fn()} initial="2026-09-08" />);
    const segments = screen.getAllByRole('spinbutton');
    expect(segments.map((s) => s.textContent)).toEqual(['08', '09', '2026']);
  });
});

describe('13.4 INP-3 DateField "Hoje"', () => {
  function TodayHarness({ onChange, onBlur, initial = null }: { onChange: (v: string | null) => void; onBlur?: () => void; initial?: string | null }) {
    const [value, setValue] = useState<string | null>(initial);
    return (
      <I18nProvider locale="pt-BR">
        <DateField
          label="Início da execução"
          value={value}
          today={() => '2026-10-07'}
          {...(onBlur === undefined ? {} : { onBlur })}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      </I18nProvider>
    );
  }

  it('an empty field offers "Hoje" in a `.chip-row`; pressing it fills today and settles the commit', async () => {
    const onChange = vi.fn();
    const onBlur = vi.fn();
    const { container } = render(<TodayHarness onChange={onChange} onBlur={onBlur} />);
    const chip = screen.getByRole('button', { name: 'Hoje' });
    expect(chip).toHaveClass('chip');
    expect(chip.parentElement).toHaveClass('chip-row');
    await userEvent.click(chip);
    expect(onChange).toHaveBeenLastCalledWith('2026-10-07');
    expect(onBlur).toHaveBeenCalled();
    expect(screen.getAllByRole('spinbutton').map((s) => s.textContent)).toEqual(['07', '10', '2026']);
    expect(screen.queryByRole('button', { name: 'Hoje' })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('is absent once a value exists', () => {
    render(<TodayHarness onChange={vi.fn()} initial="2026-09-08" />);
    expect(screen.queryByRole('button', { name: 'Hoje' })).toBeNull();
  });

  it('is absent on a field without `today`', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Hoje' })).toBeNull();
  });
});
