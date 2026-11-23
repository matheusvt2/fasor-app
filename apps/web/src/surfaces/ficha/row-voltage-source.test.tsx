import {
  EMPTY_DEFINITION_CONTEXT,
  getDefinition,
  instrumentHeaderOf,
  newEquipmentBlock,
  NO_VISIT_CONTEXT,
  type BlockRow,
  type Cell,
  type EntityState,
  type InstrumentRow,
  type JsonValue,
  type RelatorioSnapshot,
} from '@app/domain';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { EnsaiosSection } from './ensaios-section.tsx';
import type { CaptureTarget } from './use-photo-capture.ts';

/*
 * 28.6-WEB (batch e28b, Story 28.6, B-16; `60-ficha.html` `#/ficha/TR-04`): under each insulation row's voltage, the line that
 * says where it comes from, the kernel's words: "Do cabeçalho" for a row that follows the header's TENSÃO ENSAIO, "Digitada"
 * for a typed one, "Padrão da linha" for a seeded or rated default; tied to the select as its description. A v17 sheet draws
 * no line. The transformer is rated 13,8 kV on the AT, the megôhmetro registered at 10 kV.
 */

vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));
vi.mock('../../state/session.tsx', () => ({ useSession: () => ({ database: null, user: null, online: true }) }));

afterEach(cleanup);

const id = (n: number) => `019966b0-2806-7000-8000-${n.toString(16).padStart(12, '0')}`;
const BLOCK = id(1);
const RELATORIO = id(4);
const OP = id(9);
const stored = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: OP });

const megger = {
  id: id(20),
  kind: 'instrument',
  code: '2E',
  name: 'Megôhmetro',
  manufacturer: 'Instrum',
  model: 'DMG10Ki',
  serial: 'IN919021',
  cert_number: '37428/26',
  laboratory: null,
  calibrated_at: '2026-08-28',
  calibration_interval_months: 12,
  rbc_accredited: true,
  test_isolacao: { raw: '10', unit: 'kV' },
  test_resistencia_contato: null,
  test_relacao_transformacao: null,
  certificate_file_id: null,
  removed_at: null,
} as InstrumentRow;

function transformer(seedVersion: 'v17' | 'v18'): BlockRow {
  const { block } = newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: BLOCK, equipmentId: id(2), relatorioId: RELATORIO, projectId: id(5), locationId: id(3), type: 'transformador_forca', tag: 'TR-1', seedVersion, orderKey: 'a0' });
  const definition = getDefinition(seedVersion, 'cabine_primaria', 'transformador_forca');
  const voltageCol = definition.tests.find((test) => test.key === 'isolacao')!.tables[0]!.value_columns.findIndex((column) => column.role === 'voltage');
  return {
    ...block,
    sheet: {
      ...block.sheet,
      nameplate: { ...block.sheet.nameplate, tensao_nominal_at: stored({ raw: '13800', unit: 'V', state: 'measured' }), tensao_nominal_bt: stored({ raw: '380', unit: 'V', state: 'measured' }) },
      test: {
        ...block.sheet.test,
        isolacao: { cells: { '1': { [String(voltageCol)]: stored({ raw: '2.5', unit: 'kV', state: 'measured' }) } }, instrument: stored(instrumentHeaderOf(megger, 'isolacao') as unknown as JsonValue) },
      },
    } as BlockRow['sheet'],
  };
}

function renderSheet(seedVersion: 'v17' | 'v18') {
  const block = transformer(seedVersion);
  const api: FichaApi = { relatorioId: RELATORIO, projectId: id(5), blockId: BLOCK, author: { id: 'u1', companyId: 'c1' }, commit: vi.fn(async () => undefined), edit: vi.fn(async () => null), undoable: vi.fn(), announce: vi.fn() };
  const snapshot = {
    relatorio: { id: RELATORIO, seed_version: seedVersion, setup: { service_end: null, instrument_ids: [] }, export: { scheme: 'ordem_de_campo' } },
    blocks: [block],
    equipment: [],
    locations: [],
    files: [],
    points: [],
    suggestions: [],
  } as unknown as RelatorioSnapshot;
  return render(
    <MemoryRouter>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <EnsaiosSection
            api={api}
            state={new Map() as EntityState}
            snapshot={snapshot}
            block={block}
            definition={getDefinition(seedVersion, 'cabine_primaria', 'transformador_forca')}
            instruments={[megger]}
            className="ficha-step"
            onFocus={() => undefined}
            primaryId="ficha-primary"
            targetFor={(testKey: string) => ({ blockId: BLOCK, itemKey: testKey, caption: null }) as unknown as CaptureTarget}
            visit={NO_VISIT_CONTEXT}
          />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

/** Each row's select value and the line under it, in the table (the column at 768 px and wider). */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('section[data-test-key="isolacao"] td.cell-voltage')].map((cell) => {
    const select = cell.querySelector<HTMLSelectElement>('select')!;
    const line = cell.querySelector<HTMLElement>('[data-row-voltage-source]');
    return { value: select.value, line: line?.textContent ?? null, describedBy: select.getAttribute('aria-describedby') === (line?.id ?? null) };
  });
}

describe('28.6-WEB the row voltage says where it comes from', () => {
  it('v18: the header\'s 10 kV "Do cabeçalho", the typed 2,5 kV "Digitada", the seeded 1 kV "Padrão da linha", each the select\'s description', () => {
    const { container } = renderSheet('v18');
    expect(rows(container)).toEqual([
      { value: '10', line: 'Do cabeçalho', describedBy: true },
      { value: '2,5', line: 'Digitada', describedBy: true },
      { value: '1', line: 'Padrão da linha', describedBy: true },
    ]);
  });

  it('v17: the rating default before the header, and no line', () => {
    const { container } = renderSheet('v17');
    expect(rows(container)).toEqual([
      { value: '5', line: null, describedBy: true },
      { value: '2,5', line: null, describedBy: true },
      { value: '1', line: null, describedBy: true },
    ]);
  });
});
