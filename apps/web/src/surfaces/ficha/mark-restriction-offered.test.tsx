import {
  choiceValue,
  EMPTY_DEFINITION_CONTEXT,
  evaluateSheetReadings,
  getDefinition,
  newEquipmentBlock,
  NO_VISIT_CONTEXT,
  type BlockRow,
  type Cell,
  type EntityState,
  type EvaluatedCell,
  type JsonValue,
  type RelatorioSnapshot,
} from '@app/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { FichaApi } from './ficha-api.ts';
import { MeasurementField, SheetCellExtrasProvider } from './measurement-field.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * Batch e24a (Story 24.3, row at 3019; `60-ficha.html` #/ficha/DJ-01): a reading out of its criterion
 * offers "Marcar Com restrições" only where the kernel says so (`markRestrictionOffered`): never on a
 * seed v14 sheet, as before on v13. The Ensaios step hands the kernel's answer to every cell
 * (`SheetCellExtras.restrictionOffered`); a cell outside it offers the action as before.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

afterEach(cleanup);

const id = (n: number) => `019966b0-0e24-7200-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const RELATORIO = id(4);
const AUTHOR = { id: 'u1', companyId: 'c1' };

const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: id(9) });

/** A breaker of `version` whose contact resistance reads 310 µΩ on its first pole (criterion < 250 µΩ). */
function breaker(version: string): BlockRow {
  const { block } = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'disjuntor_mt', tag: 'DJ-01', seedVersion: version, orderKey: 'a0' });
  const micro = (raw: string) => stored({ raw, unit: 'µΩ', state: 'measured' });
  return { ...block, sheet: { ...block.sheet, test: { resistencia_contato: { cells: { '0': { '0': micro('310') }, '1': { '0': micro('200') }, '2': { '0': micro('205') } } } } } };
}

const api: FichaApi = {
  relatorioId: RELATORIO,
  projectId: id(5),
  blockId: BLOCK,
  author: AUTHOR,
  commit: vi.fn(async () => undefined),
  edit: vi.fn(async () => null),
  undoable: vi.fn(),
  announce: vi.fn(),
};

const renderEnsaios = (block: BlockRow) => renderEnsaiosOf(block, 'disjuntor_mt');

function renderEnsaiosOf(block: BlockRow, type: string) {
  const snapshot = {
    relatorio: { id: RELATORIO, seed_version: block.seed_version, setup: { service_end: null, instrument_ids: [] }, export: { scheme: 'ordem_de_campo' } },
    blocks: [block],
    equipment: [],
    locations: [],
    files: [],
    points: [],
    suggestions: [],
  } as unknown as RelatorioSnapshot;
  const targetFor = (testKey: string): CaptureTarget => ({ blockId: BLOCK, itemKey: testKey, caption: null }) as unknown as CaptureTarget;
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <EnsaiosSection
            api={api}
            state={new Map() as EntityState}
            snapshot={snapshot}
            block={block}
            definition={getDefinition(block.seed_version, 'cabine_primaria', type)}
            instruments={[]}
            className="ficha-step"
            onFocus={() => undefined}
            primaryId="ficha-primary"
            targetFor={targetFor}
            visit={NO_VISIT_CONTEXT}
          />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const contact = (container: HTMLElement) => container.querySelector<HTMLElement>('section[data-test-key="resistencia_contato"]')!;

describe('24.3 "Marcar Com restrições" on a reading out of its criterion', () => {
  it('v14: the out reading shows its helper, and no "Marcar Com restrições"', () => {
    const { container } = renderEnsaios(breaker('v14'));
    const section = contact(container);
    expect(section.querySelectorAll('.measurement-field[data-state="out-of-limit"]').length).toBeGreaterThan(0);
    expect(section.querySelector('.mf-helper')).not.toBeNull();
    expect(within(section).queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
  });

  it('v13: the same reading offers it, as before', () => {
    const { container } = renderEnsaios(breaker('v13'));
    expect(within(contact(container)).getAllByRole('button', { name: 'Marcar Com restrições' }).length).toBeGreaterThan(0);
  });

  it('a choice cell out of its criterion (the CTA\'s Deixado unlike Projeto): v14 no action; v13 the action', () => {
    const cta = (version: string): BlockRow => {
      const { block } = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'chave_transferencia_automatica', tag: 'CTA-1', seedVersion: version, orderKey: 'a0' });
      const test = getDefinition(version, 'cabine_primaria', 'chave_transferencia_automatica').measurement_tests!.find((one) => one.key === 'cta_ajustes_controlador')!;
      const row = String(test.rows.findIndex((one) => one.key === 'falta_de_fase'));
      const col = (key: string) => String(test.columns.findIndex((one) => one.key === key));
      return { ...block, sheet: { ...block.sheet, test: { cta_ajustes_controlador: { cells: { [row]: { [col('projeto')]: stored(choiceValue('ligado')), [col('deixado')]: stored(choiceValue('desligado')) } } } } } };
    };
    const helperOf = (container: HTMLElement) => container.querySelector<HTMLElement>('section[data-test-key="cta_ajustes_controlador"] tr[data-row-key="falta_de_fase"] .mf-helper')!;
    const v14 = renderEnsaiosOf(cta('v14'), 'chave_transferencia_automatica');
    expect(helperOf(v14.container)).toHaveTextContent('Diferente de Projeto (Ligado)');
    expect(within(helperOf(v14.container)).queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
    cleanup();
    const v13 = renderEnsaiosOf(cta('v13'), 'chave_transferencia_automatica');
    expect(within(helperOf(v13.container)).getByRole('button', { name: 'Marcar Com restrições' })).toBeVisible();
  });

  it('a cell reads the answer from the sheet\'s extras: false hides the action, absent offers it', () => {
    const block = breaker('v14');
    const cell: EvaluatedCell = evaluateSheetReadings(block, getDefinition('v14', 'cabine_primaria', 'disjuntor_mt'))
      .find((test) => test.testKey === 'resistencia_contato')!
      .tables[0]!.rows[0]!.cells.find((one) => one.role === 'capture')!;
    expect(cell.verdict).toBe('out');
    const field = <MeasurementField api={api} cell={cell} label="T1-T2, Valores" presentation="table" missing={false} onRun={() => false} />;
    const wrap = (node: React.ReactNode) => (
      <SyncContext value={makeSyncState()}>
        <ToastProvider>{node}</ToastProvider>
      </SyncContext>
    );
    render(wrap(<SheetCellExtrasProvider value={{ rangeOf: () => null, previousOf: () => null, restrictionOffered: false }}>{field}</SheetCellExtrasProvider>));
    expect(screen.queryByRole('button', { name: 'Marcar Com restrições' })).toBeNull();
    cleanup();
    render(wrap(field));
    expect(screen.getByRole('button', { name: 'Marcar Com restrições' })).toBeVisible();
  });
});
