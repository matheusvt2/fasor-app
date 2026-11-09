import { defaultBlockConfig, emptySheet, evaluateSheetReadings, getDefinition, type BlockRow, type Cell, type EvaluatedCell, type OpDraft } from '@app/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementField, ReadOnlyMeasurementField } from './measurement-field.tsx';

/*
 * Batch e23v (Story 23.6, seed v13; `60-ficha.html` #/ficha/TR1): a restricted reading in its cell. The
 * kernel's v13 cable at 5, 5 and 1,5 GΩ restricts phase C: its field takes `data-state="restricted"` (never
 * the out-of-limit state, and no "Marcar Com restrições"), and its helper is `.mf-helper[data-tone="restricted"]`
 * with the bold "Com restrição:" lead and the kernel's sentence, the cell's description; the read-only cell
 * of a sheet marked not tested shows the same.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

const ID = '019966b0-2310-7000-8000-000000000011';
const OP = '019966b0-2310-7000-8000-000000000012';
const CABLE = getDefinition('v13', 'cabine_primaria', 'cabos_entrada');

function cable(readings: readonly string[]): BlockRow {
  const sheet = emptySheet();
  sheet.test.isolacao = { cells: Object.fromEntries(readings.map((raw, row) => [String(row), { '1': { value: { raw, unit: 'GΩ', state: 'measured' }, source_suggestion_id: null, op_id: OP } as Cell }])) };
  return {
    id: ID,
    relatorio_id: ID,
    location_id: null,
    equipment_id: ID,
    block_type: 'cabos_entrada',
    config: defaultBlockConfig('v13', 'cabos_entrada'),
    seed_version: 'v13',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet,
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
  commit: vi.fn<(drafts: OpDraft[]) => Promise<void>>(async () => undefined),
  edit: vi.fn(async () => null),
  undoable: vi.fn(),
  announce: vi.fn(),
};

/** Phase `row` of the cable's insulation, as the kernel evaluates it. */
function phase(row: number): EvaluatedCell {
  return evaluateSheetReadings(cable(['5', '5', '1.5']), CABLE).find((test) => test.testKey === 'isolacao')!.tables[0]!.rows[row]!.cells.find((cell) => cell.role === 'capture')!;
}

const wrap = (node: React.ReactNode) => (
  <SyncContext value={makeSyncState()}>
    <ToastProvider>{node}</ToastProvider>
  </SyncContext>
);

describe('Story 23.6: a restricted reading in its cell', () => {
  it('phase C: data-state restricted, the bold "Com restrição:" lead and the kernel\'s sentence as its description, no "Marcar Com restrições"', () => {
    const cell = phase(2);
    expect(cell.verdict).toBe('restricted');
    const { container } = render(wrap(<MeasurementField api={api} cell={cell} label="Fase C, 1 minuto" presentation="table" missing={false} onRun={() => false} />));
    expect(container.querySelector('.measurement-field')).toHaveAttribute('data-state', 'restricted');
    const helper = container.querySelector('.mf-helper[data-tone="restricted"]')!;
    expect(helper).toHaveTextContent(`Com restrição: ${cell.restriction!.text}`);
    expect(helper.querySelector('b')).toHaveTextContent('Com restrição:');
    expect(screen.getByRole('textbox', { name: 'Fase C, 1 minuto' })).toHaveAccessibleDescription(`Com restrição: ${cell.restriction!.text}`);
    expect(screen.queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
  });

  it('phase A, within: no state and no helper', () => {
    const { container } = render(wrap(<MeasurementField api={api} cell={phase(0)} label="Fase A, 1 minuto" presentation="table" missing={false} onRun={() => false} />));
    expect(container.querySelector('.measurement-field')).not.toHaveAttribute('data-state');
    expect(container.querySelector('.mf-helper[data-tone="restricted"]')).toBeNull();
  });

  it('read-only (a sheet marked not tested): the same state and helper', () => {
    const cell = phase(2);
    const { container } = render(wrap(<ReadOnlyMeasurementField cell={cell} label="Fase C, 1 minuto" />));
    expect(container.querySelector('.measurement-field')).toHaveAttribute('data-state', 'restricted');
    expect(container.querySelector('.mf-helper[data-tone="restricted"]')).toHaveTextContent(`Com restrição: ${cell.restriction!.text}`);
  });
});
