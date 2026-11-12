import {
  blockDefinitionIn,
  evaluateSheetMeasurements,
  OVER_RANGE_INSIDE_RANGE_HELPER,
  readingNotApplicableOn,
  sheetTestCellPath,
  snapshotDefinitionContext,
  type BlockRow,
  type Cell,
  type JsonValue,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import { layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { SheetCellExtrasProvider, type SheetCellExtras } from './measurement-field.tsx';
import { MeasurementTests } from './measurement-test-section.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';

/*
 * Story 25.9 (batch e25c): the measurement table's number cell as the sheet draws it.
 *   - Every seed (closes the test gap of e24x X6): a reading above the instrument's limit that a range criterion
 *     could not judge shows the kernel's neutral helper under it, no amber state and no "Marcar Com restrições".
 *   - Seed v15 (`reading_not_applicable`): the cell's Overflow offers "Não se aplica" where the kernel says so
 *     (`SheetCellExtras.notApplicableOffered`), never otherwise; the tap is one put through the edit queue with the
 *     frame's toast and "Desfazer"; a stored N/A reads "N/A" on the neutral NA fill.
 * The company sheet of the Epic 25 fixture (a rectifier whose output is judged 125 Vcc ± 5 %); values invented.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const AUTHOR = { id: 'u1', companyId: 'c1' };
const TEST = 'tensoes_medidas';
const OP = '019966b0-0e25-7009-8000-0000000000aa';
const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: OP });

/** The fixture's company sheet of `version`, its output cell holding `value`. */
function companySheet(version: string, value: JsonValue | null) {
  const snapshot = structuredClone(layoutLockEpic25Snapshot(version));
  const block = snapshot.blocks.find((row) => row.block_type.startsWith('type:') && row.removed_at === null)!;
  const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
  if (value === null) delete block.sheet.test[TEST]!.cells['0'];
  else block.sheet.test[TEST]!.cells['0'] = { '0': stored(value) };
  return { snapshot, block, definition };
}

function renderSheet({ snapshot, block, definition }: ReturnType<typeof companySheet>, extras: Partial<SheetCellExtras> = {}) {
  const edits: OpDraft[][] = [];
  const undoable = vi.fn();
  const api: FichaApi = {
    relatorioId: block.relatorio_id,
    projectId: 'p1',
    blockId: block.id,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      const drafts = build([block as BlockRow], AUTHOR, { blocks: [], locations: [], allLocations: [], equipment: [] });
      if (drafts === null) return null;
      edits.push(drafts);
      return 'batch-1';
    }),
    undoable,
    announce: vi.fn(),
  };
  const value: SheetCellExtras = { rangeOf: () => null, previousOf: () => null, ...extras };
  render(
    <MemoryRouter>
      <ToastProvider>
        <SheetReadOnlyProvider value={false}>
          <SheetCellExtrasProvider value={value}>
            <MeasurementTests
              api={api}
              snapshot={{ ...snapshot, relatorio: { ...snapshot.relatorio, setup: { ...snapshot.relatorio.setup, service_end: null, instrument_ids: [] } } } as RelatorioSnapshot}
              block={block}
              definition={definition}
              evaluations={evaluateSheetMeasurements(block, definition)}
              instruments={[]}
              onRun={() => false}
            />
          </SheetCellExtrasProvider>
        </SheetReadOnlyProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return { edits, undoable };
}

const outputCell = () => document.querySelector<HTMLElement>(`.ficha-cell[data-cell="${TEST}:0:0"]`)!;

afterEach(cleanup);

describe('25.9 the helper of a limit inside a range criterion (every seed)', () => {
  for (const version of ['v14', 'v15']) {
    it(`${version}: "> 125 Vcc" on a row judged 125 Vcc ± 5 % shows the neutral helper, no amber state, no "Marcar Com restrições"`, () => {
      renderSheet(companySheet(version, { raw: '125', unit: 'Vcc', state: 'over_range' }));
      const cell = outputCell();
      expect(cell.querySelector('.outlier-helper')).toHaveTextContent(OVER_RANGE_INSIDE_RANGE_HELPER);
      expect(cell.querySelector('.outlier-helper')).toHaveAttribute('role', 'status');
      expect(cell.querySelector('.measurement-field')).not.toHaveAttribute('data-state');
      expect(cell.querySelector('.mf-helper')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
    });
  }

  it('a limit at the upper end is out: its own amber helper, never the one of a limit inside the range', () => {
    renderSheet(companySheet('v15', { raw: '131.25', unit: 'Vcc', state: 'over_range' }));
    const cell = outputCell();
    expect(cell.querySelector('.measurement-field')).toHaveAttribute('data-state', 'out-of-limit');
    expect(cell.textContent).not.toContain(OVER_RANGE_INSIDE_RANGE_HELPER);
  });
});

describe('25.9 "Não se aplica" on a number cell (seed v15)', () => {
  it('offered where the kernel says so: one put of the N/A value through the edit queue, the frame\'s toast with "Desfazer"', async () => {
    const sheet = companySheet('v15', null);
    expect(readingNotApplicableOn(sheet.block)).toBe(true);
    const { edits, undoable } = renderSheet(sheet, { notApplicableOffered: readingNotApplicableOn(sheet.block) });
    await userEvent.click(outputCell().querySelector<HTMLElement>('button.overflow-trigger')!);
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Não medido', '> limite', 'Não se aplica']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Não se aplica' }));
    await waitFor(() => expect(edits).toHaveLength(1));
    expect(edits[0]).toEqual([expect.objectContaining({ kind: 'put', path: sheetTestCellPath(sheet.block.id, TEST, 0, 0), value: { raw: '', unit: 'Vcc', state: 'not_applicable' } })]);
    expect(undoable).toHaveBeenCalledWith('Leitura marcada Não se aplica — não é julgada e imprime N/A', 'batch-1');
  });

  it('not offered on a v14 sheet (the kernel says no), nor when the provider says nothing', async () => {
    const sheet = companySheet('v14', null);
    expect(readingNotApplicableOn(sheet.block)).toBe(false);
    renderSheet(sheet, { notApplicableOffered: readingNotApplicableOn(sheet.block) });
    await userEvent.click(outputCell().querySelector<HTMLElement>('button.overflow-trigger')!);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Não medido', '> limite']);
  });

  it('a stored N/A reads "N/A" on the NA fill, and is not offered again', async () => {
    const sheet = companySheet('v15', { raw: '', unit: 'Vcc', state: 'not_applicable' });
    renderSheet(sheet, { notApplicableOffered: true });
    const cell = outputCell();
    expect(cell.querySelector('.measurement-field')).toHaveAttribute('data-state', 'na');
    const input = cell.querySelector('input')!;
    expect(input).toHaveAttribute('placeholder', 'N/A');
    expect(input).toHaveValue('');
    await userEvent.click(cell.querySelector<HTMLElement>('button.overflow-trigger')!);
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).not.toContain('Não se aplica');
  });
});
