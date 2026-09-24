import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
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
