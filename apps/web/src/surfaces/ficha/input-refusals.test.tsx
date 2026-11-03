import { defaultBlockConfig, emptySheet, evaluateSheetReadings, getDefinition, type BlockRow, type EvaluatedCell, type FieldDef, type SuggestionRow } from '@app/domain';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { trackInputRefused } from '../../telemetry/hooks.ts';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { DictatedMeasurementField, MeasurementField } from './measurement-field.tsx';
import { SuggestionFill, type NameplateSuggestionsModel } from './nameplate-suggestions.tsx';
import { EnvSuggestionFill, type EnvDisplayModel } from './read-display.tsx';

/*
 * Story 18.4: each refusing sheet field reports one `input_refused` per decision (a blur, an
 * Enter, a "Confirmar"), with its constant name and the kernel's reason, never the text.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));
vi.mock('../../telemetry/hooks.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../telemetry/hooks.ts')>()),
  trackInputRefused: vi.fn(),
}));

afterEach(() => vi.mocked(trackInputRefused).mockClear());

const calls = () => vi.mocked(trackInputRefused).mock.calls;
const ID = '019966b0-0095-7000-8000-000000000011';
const PHOTO = '019966b0-0095-7000-8000-000000000012';
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

const api: FichaApi = {
  relatorioId: ID,
  projectId: ID,
  blockId: ID,
  author: { id: 'u1', companyId: 'c1' },
  commit: vi.fn(async () => undefined),
  edit: vi.fn(async () => null),
  undoable: vi.fn(),
  announce: vi.fn(),
};

/** The contato fechado table's Fase A cell, empty. */
function faseA(): EvaluatedCell {
  const test = evaluateSheetReadings(block(), SEC).find((t) => t.testKey === 'isolacao')!;
  return test.tables.find((t) => t.key === 'contato_fechado')!.rows[0]!.cells[0]!;
}

const POSITIVE = 'A leitura deve ser maior que zero.';

function suggestion(value: unknown): SuggestionRow {
  return {
    id: ID,
    relatorio_id: ID,
    target_path: 'x',
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: ID },
    status: 'pending',
    prompt_version: 'v1',
    hint: null,
  } as SuggestionRow;
}

const wrap = (node: React.ReactNode) => (
  <SyncContext value={makeSyncState()}>
    <ToastProvider>
      {node}
      <input aria-label="outra" />
      <button type="button">fora</button>
    </ToastProvider>
  </SyncContext>
);

describe('the measurement grid cell (Story 18.4)', () => {
  it('a refused value on blur is one report; Enter that moves the focus to another cell reports once, not again on the blur it causes', async () => {
    const onRun = vi.fn(() => {
      screen.getByRole('textbox', { name: 'outra' }).focus();
      return true;
    });
    render(wrap(<MeasurementField api={api} cell={faseA()} label="Fase A" presentation="table" missing={false} onRun={onRun} />));
    const input = screen.getByRole('textbox', { name: 'Fase A' });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.measurement');
    await userEvent.type(input, 'quinze');
    expect(calls()).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([['ficha.measurement', 'not_a_number']]);

    await userEvent.click(input);
    await userEvent.type(input, 'x{Enter}');
    expect(onRun).toHaveBeenCalled();
    expect(input).not.toHaveFocus();
    expect(calls()).toEqual([
      ['ficha.measurement', 'not_a_number'],
      ['ficha.measurement', 'not_a_number'],
    ]);
  });

  it('a reading at or below zero on a positive-only cell is not_positive', async () => {
    render(wrap(<MeasurementField api={api} cell={{ ...faseA(), positiveOnlyText: POSITIVE }} label="Fase A" presentation="table" missing={false} onRun={() => false} />));
    await userEvent.type(screen.getByRole('textbox', { name: 'Fase A' }), '0');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([['ficha.measurement', 'not_positive']]);
  });
});

describe('the dictated measurement cell (Story 18.4)', () => {
  it('a typed value refused on blur is one report', async () => {
    render(wrap(<DictatedMeasurementField api={api} cell={faseA()} label="Fase A, Valores" reading={{ raw: '147', unit: 'GΩ' }} onDone={vi.fn()} onRun={() => true} />));
    const input = screen.getByRole('textbox', { name: 'Fase A, Valores' });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.measurement');
    await userEvent.clear(input);
    await userEvent.type(input, 'quinze');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([['ficha.measurement', 'not_a_number']]);
  });

  it('a heard reading at or below zero on a positive-only cell, confirmed, is one not_positive', async () => {
    render(
      wrap(
        <DictatedMeasurementField api={api} cell={{ ...faseA(), positiveOnlyText: POSITIVE }} label="Fase A, Valores" reading={{ raw: '0', unit: 'GΩ' }} onDone={vi.fn()} onRun={() => true} />,
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(calls()).toEqual([['ficha.measurement', 'not_positive']]);
  });
});

describe('the suggestion fills (Story 18.4)', () => {
  it('a nameplate suggestion: one report per blur (the input and its root hear the same blur), with the field kind\'s reason', async () => {
    const field: FieldDef = { key: 'data_fabricacao', label: 'DATA FABRICAÇÃO', kind: 'date' };
    const model = {
      type: vi.fn(() => 'invalid' as const),
      confirm: vi.fn(),
      createsEntry: vi.fn(() => false),
      openCrop: vi.fn(),
    } as unknown as NameplateSuggestionsModel;
    render(wrap(<SuggestionFill model={model} field={field} suggestion={suggestion('2012')} />));
    const input = screen.getByRole('textbox', { name: /fabrica/i });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.suggestion');
    await userEvent.clear(input);
    await userEvent.type(input, '1850');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([['ficha.suggestion', 'out_of_range']]);
    await userEvent.click(input);
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([
      ['ficha.suggestion', 'out_of_range'],
      ['ficha.suggestion', 'out_of_range'],
    ]);
  });

  it('an environment reading: one report per blur, with the field kind\'s reason', async () => {
    const field = { key: 'temperature_c', label: 'Temperatura', kind: 'number', unit: '°C' } as FieldDef;
    const model = { type: vi.fn(() => 'invalid' as const), confirm: vi.fn(), openCrop: vi.fn() } as unknown as EnvDisplayModel;
    render(wrap(<EnvSuggestionFill model={model} field={field} suggestion={suggestion({ raw: '23.4', unit: '°C', state: 'measured' })} />));
    const input = screen.getByRole('textbox', { name: /temperatura/i });
    expect(input).toHaveAttribute('data-telemetry', 'ficha.reading');
    await userEvent.clear(input);
    await userEvent.type(input, 'quinze');
    await userEvent.click(screen.getByRole('button', { name: 'fora' }));
    expect(calls()).toEqual([['ficha.reading', 'not_a_number']]);
  });
});
