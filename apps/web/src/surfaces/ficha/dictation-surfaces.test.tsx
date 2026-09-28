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
  render(<DictatedMeasurementField api={api} cell={faseA()} label="Fase A, Valores" reading={{ raw: '147', unit: 'GΩ' }} onDone={onDone} />);
  return { commits, onDone, input: screen.getByRole('textbox', { name: 'Fase A, Valores' }) };
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

  it('with "Observações" on, becomes the observation suggestion and is announced', () => {
    const { result, announce, seen } = renderTable(true);
    act(() => result.current.onDictated('está chovendo muito'));
    expect(announce).toHaveBeenCalledWith(ui.dictation.unparsed);
    expect(seen.pending).toBe('Está chovendo muito');
    act(() => result.current.onDictated('Fase A, 147 giga'));
    expect(result.current.dictated).toMatchObject({ kind: 'cell', raw: '147', unit: 'GΩ', address: { testKey: 'isolacao', row: 3, col: 0 } });
  });
});
