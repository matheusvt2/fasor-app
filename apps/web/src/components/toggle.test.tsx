import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { LockedToggle, Toggle } from './toggle.tsx';

describe('Toggle', () => {
  it('is a switch whose word carries the visible state', async () => {
    const onChange = vi.fn();
    render(<Toggle isSelected={false} onChange={onChange} aria-label="Localização nas fotos" />);
    const toggle = screen.getByRole('switch', { name: 'Localização nas fotos' });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveTextContent('Desativado');

    await userEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('carries the on state on the styled element itself, so the mock rule engages (retro F-SPEC-6)', () => {
    const { container } = render(<Toggle isSelected aria-label="Marca d'água" />);
    const toggle = screen.getByRole('switch');
    // `components.css`: `.toggle[aria-checked="true"] .track | .knob | .toggle-word`.
    expect(toggle).toHaveClass('toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(container.querySelector('.toggle[aria-checked="true"] .track')).not.toBeNull();
    expect(container.querySelector('.toggle[aria-checked="true"] .knob')).not.toBeNull();
    expect(toggle).toHaveTextContent('Ativado');
  });

  it('toggles from the keyboard: Space and Enter', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle isSelected={false} onChange={onChange} aria-label="x" />);
    await userEvent.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<Toggle isSelected onChange={onChange} aria-label="x" />);
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('has no axe violations on or off', async () => {
    const { container } = render(
      <div>
        <Toggle isSelected aria-label="Ligado" />
        <Toggle isSelected={false} aria-label="Desligado" />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
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
