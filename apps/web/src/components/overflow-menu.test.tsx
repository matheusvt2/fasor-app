import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverflowMenu } from './overflow-menu.tsx';

describe('OverflowMenu', () => {
  it('has an accessible trigger name from the template and opens the menu on tap', async () => {
    const onUp = vi.fn();
    const onRemove = vi.fn();
    render(
      <OverflowMenu
        name="SEC-C09"
        items={[{ id: 'up', label: 'Subir', onAction: onUp }]}
        destructiveItems={[{ id: 'remove', label: 'Remover', onAction: onRemove }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Mais opções de SEC-C09' });
    expect(trigger).toHaveClass('overflow-trigger');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toHaveClass('overflow-menu');
  });

  it('keeps the destructive item last, inside its own group', async () => {
    const onUp = vi.fn();
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    render(
      <OverflowMenu
        name="SEC-C09"
        items={[
          { id: 'up', label: 'Subir', onAction: onUp },
          { id: 'duplicate', label: 'Duplicar', onAction: onDuplicate },
        ]}
        destructiveItems={[{ id: 'remove', label: 'Remover', onAction: onRemove }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C09' }));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Subir', 'Duplicar', 'Remover']);
    expect(items.at(-1)).toHaveAttribute('data-tone', 'red');

    await userEvent.click(items.at(-1)!);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('Esc closes the menu and returns focus to the trigger', async () => {
    render(
      <OverflowMenu
        name="SEC-C09"
        items={[{ id: 'up', label: 'Subir', onAction: vi.fn() }]}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Mais opções de SEC-C09' });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('draws a toggle item as a menuitemcheckbox with its state, in order, and a press calls it once', async () => {
    const onToggle = vi.fn();
    const onOpen = vi.fn();
    const { rerender } = render(
      <OverflowMenu
        name="1° Subsolo"
        items={[
          { id: 'open', label: 'Abrir primeira ficha (dados da cabine)', onAction: onOpen },
          { id: 'agrupar', label: 'Agrupar por tipo na seção 9', onAction: onToggle, checked: true },
          { id: 'up', label: 'Subir', onAction: vi.fn() },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1° Subsolo' }));
    const menu = screen.getByRole('menu');
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent)).toEqual([
      'Abrir primeira ficha (dados da cabine)',
      'Agrupar por tipo na seção 9',
      'Subir',
    ]);
    const toggle = screen.getByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    rerender(
      <OverflowMenu
        name="1° Subsolo"
        items={[{ id: 'agrupar', label: 'Agrupar por tipo na seção 9', onAction: onToggle, checked: false }]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1° Subsolo' }));
    expect(screen.getByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' })).toHaveAttribute('aria-checked', 'false');
  });
});
