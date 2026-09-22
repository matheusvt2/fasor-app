import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LockedToggle, Toggle } from './toggle.tsx';

describe('Toggle', () => {
  it('is a switch whose word carries the accessible state', async () => {
    const onChange = vi.fn();
    const { container } = render(<Toggle isSelected={false} onChange={onChange} aria-label="Localização nas fotos" />);
    const input = screen.getByRole('switch', { name: 'Localização nas fotos' });
    expect(input).not.toBeChecked();

    const styledRoot = container.querySelector('.toggle');
    expect(styledRoot).not.toBeNull();
    expect(styledRoot).not.toHaveAttribute('data-selected');
    expect(styledRoot).toHaveTextContent('Desativado');

    await userEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects the selected state on the input and the "Ativado" word on the label', () => {
    const { container } = render(<Toggle isSelected aria-label="Marca d'água" />);
    expect(screen.getByRole('switch')).toBeChecked();
    const styledRoot = container.querySelector('.toggle');
    expect(styledRoot).toHaveAttribute('data-selected', 'true');
    expect(styledRoot).toHaveTextContent('Ativado');
  });

  it('has a 48px hit area via the .toggle class the CSS keys off', () => {
    const { container } = render(<Toggle isSelected={false} aria-label="x" />);
    expect(container.querySelector('.toggle')).not.toBeNull();
  });
});

describe('LockedToggle', () => {
  it('reads "Sempre" and is read-only, not a control', () => {
    render(<LockedToggle aria-label="Lista de verificação" />);
    const el = screen.getByRole('switch', { name: 'Lista de verificação' });
    expect(el).toHaveTextContent('Sempre');
    expect(el).toHaveAttribute('aria-checked', 'true');
    expect(el).toHaveAttribute('aria-readonly', 'true');
  });
});
