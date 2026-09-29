import {
  defaultBlockConfig,
  emptySheet,
  evaluateSheetReadings,
  getDefinition,
  sheetTestCellPath,
  type BlockRow,
  type EvaluatedCell,
  type OpDraft,
} from '@app/domain';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ui } from '../../copy/ui.ts';
import type { FichaApi } from './ficha-api.ts';
import { DictatedMeasurementField } from './measurement-field.tsx';
import { SheetObservationDictationProvider, useSheetObservationDictation, useTableDictation } from './sheet-observation-dictation.tsx';

/*
 * 9.4-UNIT the sheet's dictation writes: a dictated reading's cell writes the heard value on
 * "Confirmar", the typed value when the engineer edits it, nothing when emptied; a table
 * utterance the kernel cannot read goes to the sheet observation, or, with "Observações" off, is
 * only announced.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-0094-7000-8000-000000000011';
const AUTHOR = { id: 'u1', companyId: 'c1' };
const SEC = getDefinition('v1', 'cabine_primaria', 'chave_seccionadora');

function block(): BlockRow {
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'chave_seccionadora',
    config: defaultBlockConfig('v1', 'chave_seccionadora', { subtype: 'manual' }),
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

function fichaApi() {
  const commits: OpDraft[][] = [];
  const announced: string[] = [];
  const api: FichaApi = {
    relatorioId: ID,
    projectId: ID,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async (drafts: OpDraft[]) => {
      commits.push(drafts);
    }),
    edit: vi.fn(async () => null),
    undoable: vi.fn(),
    announce: vi.fn((text: string) => {
      announced.push(text);
    }),
  };
  return { api, commits, announced };
}

/** The contato fechado table's Fase A cell (test row 3, column 0), empty. */
function faseA(): EvaluatedCell {
  const test = evaluateSheetReadings(block(), SEC).find((t) => t.testKey === 'isolacao')!;
  const table = test.tables.find((t) => t.key === 'contato_fechado')!;
  return table.rows[0]!.cells[0]!;
}

const CELL_PATH = sheetTestCellPath(ID, 'isolacao', 3, 0);

function renderDictated(onDone = vi.fn()) {
  const { api, commits } = fichaApi();
  const onRun = vi.fn(() => true);
  render(<DictatedMeasurementField api={api} cell={faseA()} label="Fase A, Valores" reading={{ raw: '147', unit: 'GΩ' }} onDone={onDone} onRun={onRun} />);
  return { commits, onDone, onRun, input: screen.getByRole('textbox', { name: 'Fase A, Valores' }) };
}

describe('9.4-UNIT DictatedMeasurementField', () => {
  it('"Confirmar" writes the reading as heard, once', async () => {
    const { commits, onDone } = renderDictated();
    await userEvent.click(screen.getByRole('button', { name: 'Sugerido, 147 GΩ, confirmar' }));
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual([expect.objectContaining({ kind: 'put', path: CELL_PATH, value: { raw: '147', unit: 'GΩ', state: 'measured' } })]);
    expect(onDone).toHaveBeenCalled();
  });

  it('a different value typed and entered is written instead of the heard one', async () => {
    const { commits, input } = renderDictated();
    await userEvent.clear(input);
    await userEvent.type(input, '210{Enter}');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toEqual([expect.objectContaining({ path: CELL_PATH, value: { raw: '210', unit: 'GΩ', state: 'measured' } })]);
  });

  it('E9-Q8 Enter on the reading as heard writes it and runs on to the next cell; Shift+Enter runs back and writes nothing', async () => {
    const { commits, onRun, input } = renderDictated();
    await userEvent.click(input);
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(commits).toHaveLength(0);
    expect(onRun).toHaveBeenLastCalledWith({ testKey: 'isolacao', row: 3, col: 0 }, 'previous');
    await userEvent.keyboard('{Enter}');
    expect(commits).toEqual([[expect.objectContaining({ kind: 'put', path: CELL_PATH, value: { raw: '147', unit: 'GΩ', state: 'measured' } })]]);
    expect(onRun).toHaveBeenLastCalledWith({ testKey: 'isolacao', row: 3, col: 0 }, 'next');
    // A second Enter (or the blur the run causes) writes nothing more.
    await userEvent.keyboard('{Enter}');
    expect(commits).toHaveLength(1);
  });

  it('E9-Q8 Enter on a typed value writes it and runs on; an invalid one stays put', async () => {
    const { commits, onRun, input } = renderDictated();
    await userEvent.clear(input);
    await userEvent.type(input, 'abc{Enter}');
    expect(commits).toHaveLength(0);
    expect(onRun).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, '210{Enter}');
    expect(commits).toEqual([[expect.objectContaining({ path: CELL_PATH, value: { raw: '210', unit: 'GΩ', state: 'measured' } })]]);
    expect(onRun).toHaveBeenCalledWith({ testKey: 'isolacao', row: 3, col: 0 }, 'next');
  });

  it('an emptied field drops the dictation and writes nothing', async () => {
    const { commits, onDone, input } = renderDictated();
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    expect(commits).toHaveLength(0);
    expect(onDone).toHaveBeenCalled();
  });
});

describe('9.4-UNIT useTableDictation: unparsed table speech', () => {
  const fechado = () => evaluateSheetReadings(block(), SEC).find((t) => t.testKey === 'isolacao')!.tables.find((t) => t.key === 'contato_fechado')!;

  function renderTable(enabled: boolean) {
    const announce = vi.fn();
    const seen: { pending: string | null } = { pending: null };
    function Probe() {
      seen.pending = useSheetObservationDictation().pending;
      return null;
    }
    const { result } = renderHook(() => useTableDictation(fechado(), announce), {
      wrapper: ({ children }) => (
        <SheetObservationDictationProvider enabled={enabled}>
          {children}
          <Probe />
        </SheetObservationDictationProvider>
      ),
    });
    return { result, announce, seen };
  }

  it('with "Observações" off, is announced as "type it in the table" and leaves no pending suggestion', () => {
    const { result, announce, seen } = renderTable(false);
    act(() => result.current.onDictated('está chovendo muito'));
    expect(announce).toHaveBeenCalledWith(ui.dictation.unparsedNoObservations);
    expect(result.current.dictated).toBeNull();
    expect(seen.pending).toBeNull();
  });

  it('E9-Q9 a dictated reading is dropped once its cell is filled another way, and does not come back when the cell is emptied', () => {
    const announce = vi.fn();
    const empty = fechado();
    const filledBlock = block();
    filledBlock.sheet = { ...filledBlock.sheet, test: { isolacao: { cells: { '3': { '0': { value: { raw: '150', unit: 'GΩ', state: 'measured' }, source_suggestion_id: null, op_id: 'x' } } } } } } as BlockRow['sheet'];
    const filled = evaluateSheetReadings(filledBlock, SEC).find((t) => t.testKey === 'isolacao')!.tables.find((t) => t.key === 'contato_fechado')!;
    expect(filled.rows[0]!.cells[0]!.state).toBe('measured');
    const { result, rerender } = renderHook(({ table }) => useTableDictation(table, announce), {
      initialProps: { table: empty },
      wrapper: ({ children }) => <SheetObservationDictationProvider enabled>{children}</SheetObservationDictationProvider>,
    });
    act(() => result.current.onDictated('Fase A, 147 giga'));
    expect(result.current.dictated).toMatchObject({ raw: '147', address: { row: 3, col: 0 } });
    // "Confirmar todos", a pull: the cell is filled.
    rerender({ table: filled });
    expect(result.current.dictated).toBeNull();
    // Emptied later: the old reading stays gone.
    rerender({ table: empty });
    expect(result.current.dictated).toBeNull();
  });

  it('with "Observações" on, becomes the observation suggestion and is announced', () => {
    const { result, announce, seen } = renderTable(true);
    act(() => result.current.onDictated('está chovendo muito'));
    expect(announce).toHaveBeenCalledWith(ui.dictation.unparsed);
    expect(seen.pending).toBe('Está chovendo muito');
    act(() => result.current.onDictated('Fase A, 147 giga'));
    expect(result.current.dictated).toMatchObject({ kind: 'cell', raw: '147', unit: 'GΩ', address: { testKey: 'isolacao', row: 3, col: 0 } });
  });
});
