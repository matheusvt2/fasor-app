import type { PointLinkGroup } from '@app/domain';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import { PointLinkPicker } from './point-link-picker.tsx';

/*
 * Story 20.4: "Equipamento ou local" is a labelled listbox with groups, the current link
 * selected, and the focus back on its trigger after a choice; a pick of the current link
 * calls nothing.
 */

const groups: PointLinkGroup[] = [
  { id: 'group:geral', label: null, options: [{ key: 'geral', equipmentId: null, locationId: null, text: 'Geral' }] },
  {
    id: 'group:local:l1',
    label: 'Cubículo Enel',
    options: [
      { key: 'local:l1', equipmentId: null, locationId: 'l1', text: 'Cubículo Enel · Verificações do local' },
      { key: 'equipment:e1', equipmentId: 'e1', locationId: null, text: 'SEC-ENEL · Chave seccionadora · Cubículo Enel' },
      { key: 'equipment:e2', equipmentId: 'e2', locationId: null, text: 'TR-01 · Transformador de força · Cubículo Enel' },
    ],
  },
];

describe('20.4 PointLinkPicker', () => {
  it('names the current link, lists the groups, and a pick returns the focus to the trigger', async () => {
    const onPick = vi.fn();
    const { container } = render(<PointLinkPicker groups={groups} selectedKey="geral" onPick={onPick} />);
    const trigger = screen.getByRole('button', { name: /Equipamento ou local/ });
    expect(trigger).toHaveTextContent('Geral');
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(trigger);
    const list = await screen.findByRole('listbox');
    expect(within(list).getByRole('option', { name: 'Geral' })).toHaveAttribute('aria-selected', 'true');
    const enel = within(list).getByRole('group', { name: 'Cubículo Enel' });
    expect(within(enel).getAllByRole('option').map((option) => option.textContent)).toEqual(groups[1]!.options.map((option) => option.text));

    await userEvent.click(within(list).getByRole('option', { name: 'TR-01 · Transformador de força · Cubículo Enel' }));
    expect(onPick).toHaveBeenCalledWith('equipment:e2');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('by keyboard: the current link is selected, a choice by arrows and Enter, the same one picks nothing', async () => {
    const onPick = vi.fn();
    render(<PointLinkPicker groups={groups} selectedKey="equipment:e1" onPick={onPick} />);
    const trigger = screen.getByRole('button', { name: /Equipamento ou local/ });
    expect(trigger).toHaveTextContent('SEC-ENEL · Chave seccionadora · Cubículo Enel');
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    const list = await screen.findByRole('listbox');
    expect(within(list).getByRole('option', { name: 'SEC-ENEL · Chave seccionadora · Cubículo Enel' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Enter}');
    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    expect(onPick).toHaveBeenCalledWith('geral');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
