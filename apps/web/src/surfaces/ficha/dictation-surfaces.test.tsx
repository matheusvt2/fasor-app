import {
  defaultBlockConfig,
  emptySheet,
  evaluateSheetReadings,
  getDefinition,
  sheetTestCellPath,
  type BlockRow,
  type EvaluatedCell,
  type OpDraft,
  type RelatorioSnapshot,
} from '@app/domain';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ui } from '../../copy/ui.ts';
import { SpeechEngineProvider } from '../../speech/dictation.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { createFakeEngine } from '../../speech/fake-engine.ts';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { DictatedMeasurementField } from './measurement-field.tsx';
import { SheetObservationDictationProvider } from './sheet-observation-dictation.tsx';

/*
 * 9.4-UNIT the sheet's dictation writes: a dictated reading's cell writes the heard value on
 * "Confirmar", the typed value when the engineer edits it, nothing when emptied; a table
 * utterance the kernel cannot read, on a sheet whose "Observações" is off, is only announced.
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

afterEach(() => {
  globalThis.__fakeSpeech = undefined;
  globalThis.__FAKE_SPEECH__ = undefined;
});

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

describe('9.4-UNIT unparsed table speech with "Observações" off', () => {
  it('is announced as "type it in the table" and leaves no pending suggestion anywhere', async () => {
    const { api, commits, announced } = fichaApi();
    const shown = block();
    const snapshot = { blocks: [shown], relatorio: { setup: { service_end: null } } } as unknown as RelatorioSnapshot;
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
        <SpeechEngineProvider engine={createFakeEngine()} online>
          <SheetObservationDictationProvider enabled={false}>
            <EnsaiosSection api={api} snapshot={snapshot} block={shown} definition={SEC} instruments={[]} className="ficha-step" onFocus={() => undefined} primaryId="primary" />
          </SheetObservationDictationProvider>
        </SpeechEngineProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    const fechado = container.querySelector('.ficha-mt[data-table-key="contato_fechado"]')!;
    const mic = fechado.querySelector<HTMLButtonElement>('.dictation-btn')!;
    await userEvent.click(mic);
    expect(mic).toHaveAttribute('aria-pressed', 'true');
    await act(async () => {
      globalThis.__fakeSpeech!.say('está chovendo muito');
    });
    expect(announced).toEqual([ui.dictation.unparsedNoObservations]);
    expect(container.querySelector('.dictated-suggestion')).toBeNull();
    expect(container.querySelector('.suggestion-field')).toBeNull();
    expect(commits).toHaveLength(0);
  });
});
