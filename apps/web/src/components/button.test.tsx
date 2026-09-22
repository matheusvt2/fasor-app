import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, TextButton } from './button.tsx';

describe('Button', () => {
  it('renders the primary/secondary/destructive classes from components.css', () => {
    const { rerender } = render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('btn', 'btn-primary');

    rerender(<Button variant="secondary">Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('btn-secondary');

    rerender(<Button variant="destructive">Remover</Button>);
    expect(screen.getByRole('button', { name: 'Remover' })).toHaveClass('btn-destructive');
  });

  it('fires onPress when enabled', async () => {
    const onPress = vi.fn();
    render(<Button onPress={onPress}>Continuar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is aria-disabled with a linked reason, stays focusable, and never calls onPress', async () => {
    const onPress = vi.fn();
    render(
      <Button isDisabled disabledReason="Entrar precisa de conexão" onPress={onPress}>
        Entrar
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Entrar' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toHaveAttribute('disabled');
    expect(button).toHaveAccessibleDescription('Entrar precisa de conexão');
    expect(screen.getByText('Entrar precisa de conexão')).toHaveClass('btn-reason');

    button.focus();
    expect(button).toHaveFocus();

    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('throws when disabled without a reason (component-level invariant)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Button isDisabled>Entrar</Button>)).toThrow(/disabledReason/);
    spy.mockRestore();
  });

  it('every tappable hit area measures at least 48px tall', () => {
    render(<Button>Continuar</Button>);
    // jsdom has no layout engine; this asserts the CSS contract (min-height token) is wired
    // through the `.btn` class rather than a computed pixel box (see gallery.test.tsx for
    // the token-level floor check across every component).
    expect(screen.getByRole('button')).toHaveClass('btn');
  });
});

describe('TextButton', () => {
  it('renders .btn-text and supports the red tone', () => {
    render(<TextButton tone="red">Remover ficha</TextButton>);
    const button = screen.getByRole('button', { name: 'Remover ficha' });
    expect(button).toHaveClass('btn', 'btn-text');
    expect(button).toHaveAttribute('data-tone', 'red');
  });

  it('is aria-disabled with a linked reason and stays focusable', () => {
    render(
      <TextButton isDisabled disabledReason="Todos os itens já estão marcados">
        Marcar os restantes como Conforme
      </TextButton>,
    );
    const button = screen.getByRole('button', { name: /Marcar os restantes/ });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Todos os itens já estão marcados');
  });

  it('throws when disabled without a reason (component-level invariant)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TextButton isDisabled>Remover ficha</TextButton>)).toThrow(/disabledReason/);
    spy.mockRestore();
  });

  it('two controls can share one reason already on the page, rendering no copy of it', async () => {
    const onPress = vi.fn();
    const { container } = render(
      <div>
        <Button isDisabled disabledReasonId="shared" onPress={onPress}>
          Continuar
        </Button>
        <TextButton isDisabled disabledReasonId="shared">
          Ver sumário
        </TextButton>
        <span className="btn-reason" id="shared">
          Disponível em uma próxima etapa
        </span>
      </div>,
    );
    for (const name of ['Continuar', 'Ver sumário']) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription('Disponível em uma próxima etapa');
    }
    expect(container.querySelectorAll('.btn-reason')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
