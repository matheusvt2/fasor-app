import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Chip, FilterChipGroup } from './chip.tsx';

describe('Chip', () => {
  it('text chip: tap inserts text, no pressed state', async () => {
    const onPress = vi.fn();
    render(<Chip onPress={onPress}>Sinais de aquecimento</Chip>);
    const chip = screen.getByRole('button', { name: 'Sinais de aquecimento' });
    expect(chip).toHaveClass('chip');
    expect(chip).not.toHaveAttribute('aria-pressed');
    await userEvent.click(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('value chip: controlled aria-pressed toggle', async () => {
    const onSelectedChange = vi.fn();
    render(
      <Chip isSelected={false} onSelectedChange={onSelectedChange}>
        3.700 MΩ
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: '3.700 MΩ' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });
});

describe('FilterChipGroup', () => {
  const options = [
    { id: 'all', label: 'Todas' },
    { id: 'enel', label: 'Cubículo Enel' },
  ];

  it('keeps exactly one selected chip, moving the selection on tap', async () => {
    const onChange = vi.fn();
    render(<FilterChipGroup options={options} selectedId="all" onChange={onChange} aria-label="Filtrar por cabine" />);
    expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Cubículo Enel' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('radio', { name: 'Cubículo Enel' }));
    expect(onChange).toHaveBeenCalledWith('enel');
  });

  it('tapping the selected chip again does nothing (no clearing by re-tap)', async () => {
    const onChange = vi.fn();
    render(<FilterChipGroup options={options} selectedId="all" onChange={onChange} aria-label="Filtrar por cabine" />);
    await userEvent.click(screen.getByRole('radio', { name: 'Todas' }));
    // disallowEmptySelection keeps the same key selected instead of clearing it; any call
    // the group makes reports the selection unchanged, never empty.
    for (const call of onChange.mock.calls) expect(call[0]).toBe('all');
    expect(screen.getByRole('radio', { name: 'Todas' })).toBeChecked();
  });

  it('Story 12.4: with no selection (null) no chip is pressed until a tap picks one', async () => {
    const onChange = vi.fn();
    render(<FilterChipGroup options={options} selectedId={null} onChange={onChange} aria-label="Motivo" />);
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLElement).getAttribute('aria-checked') === 'true')).toHaveLength(0);
    await userEvent.click(screen.getByRole('radio', { name: 'Cubículo Enel' }));
    expect(onChange).toHaveBeenCalledWith('enel');
  });
});
