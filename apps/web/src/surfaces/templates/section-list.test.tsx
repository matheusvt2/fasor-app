import { composerView, standardTemplate } from '@app/domain';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionList } from './section-list.tsx';

/*
 * Story 27.14 (batch e27c, F20 of the 2026-11-21 pass): a section row of the template composer
 * shows one number, the one a relatório created from the template gives the section (Story 27.5,
 * `.block-tag`); its position among the sections is no longer drawn beside it as a Position box.
 * The row still moves: Alt+arrows from the row reach `onMove` with the new index.
 */

const view = composerView(standardTemplate({ id: '019966b0-0039-7000-8000-000000000002' }));

function renderList(onMove = vi.fn(async () => undefined)) {
  render(
    <SectionList
      sections={view.sections}
      generatedNumbers={view.generatedNumbers}
      onMove={onMove}
      onAddBelow={vi.fn()}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      canEditText={() => false}
      onEditText={vi.fn()}
    />,
  );
  return onMove;
}

describe('27.14-UNIT-001 one number per section row', () => {
  it('each row carries its Story 27.5 number and no Position box', () => {
    renderList();
    const rows = within(screen.getByRole('list', { name: 'Blocos do template' })).getAllByRole('listitem');
    expect(rows).toHaveLength(view.sections.length);
    rows.forEach((row, i) => {
      expect(row.querySelectorAll('.block-tag')).toHaveLength(1);
      expect(row.querySelector('.block-tag')!.textContent).toBe(String(view.sections[i]!.number));
      expect(row.querySelector('.pos-box')).toBeNull();
      expect(within(row).queryByRole('textbox')).toBeNull();
      // What the row shows: the section number, then its title, nothing before them.
      expect(row.textContent!.startsWith(`${view.sections[i]!.number}${row.querySelector('.block-name')!.textContent}`)).toBe(true);
    });
  });

  it('a row still moves by Alt+ArrowDown, to the next position', async () => {
    const onMove = renderList();
    const first = within(screen.getByRole('list', { name: 'Blocos do template' })).getAllByRole('listitem')[0]!;
    fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(view.sections[0], 1));
  });
});
