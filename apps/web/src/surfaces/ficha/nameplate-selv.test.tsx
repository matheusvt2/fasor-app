import 'fake-indexeddb/auto';
import { defaultBlockConfig, emptySheet, getDefinition, SELV_VOLTAGE_NOTICE, type BlockRow, type Cell, type EntityState, type RelatorioSnapshot } from '@app/domain';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { FichaApi } from './ficha-api.ts';
import { NameplateSection } from './nameplate-section.tsx';
import { SheetReadOnlyProvider } from './sheet-read-only.tsx';

/*
 * Story 14.14 (seed v7): on a read-only Quadro elétrico sheet the SELV/PELV field still shows the
 * seed's help and, marked SIM at 380 V, the kernel's amber SELV notice.
 */

const session: { database: AppDatabase | null; user: null; online: boolean } = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-d0b3-7000-8000-000000000001';
const REL = '019966b0-d0b3-7000-8000-000000000002';
const OP = '019966b0-d0b3-7000-8000-000000000003';
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const DEFINITION = getDefinition('v7', 'cabine_primaria', 'quadro_eletrico');

const board: BlockRow = {
  id: ID,
  relatorio_id: REL,
  location_id: null,
  equipment_id: null,
  block_type: 'quadro_eletrico',
  config: defaultBlockConfig('v7', 'quadro_eletrico'),
  seed_version: 'v7',
  order_key: 'a0',
  feeds_block_id: null,
  not_tested: null,
  concluded_by: null,
  sheet: { ...emptySheet(), nameplate: { tensao_nominal: cell({ raw: '380', unit: 'V', state: 'measured' }), circuito_selv_pelv: cell('SIM') } },
  created_by: null,
  first_edited_at: null,
  last_modified_by: null,
  last_modified_at: null,
  removed_at: null,
};

let counter = 0;
beforeEach(() => {
  session.database = openDatabase(`019966b0-d0b3-7000-8000-${(++counter).toString(16).padStart(12, 'a')}`);
});
afterEach(async () => {
  cleanup();
  await session.database?.close();
  session.database = null;
});

describe('14.14 the SELV/PELV help and notice on a read-only sheet', () => {
  it('shows the seed help and the amber SELV notice under the field', () => {
    const api = { relatorioId: REL, projectId: REL, blockId: ID, author: null, commit: vi.fn(), edit: vi.fn(), undoable: vi.fn(), announce: vi.fn() } as unknown as FichaApi;
    const snapshot = { relatorio: { id: REL, status: 'emitido' }, blocks: [board], equipment: [], locations: [], files: [], points: [], suggestions: [], instruments: [] } as unknown as RelatorioSnapshot;
    const { container } = render(
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <SheetReadOnlyProvider value>
            <NameplateSection api={api} snapshot={snapshot} state={new Map() as EntityState} block={board} definition={DEFINITION} equipment={[]} registries={{ manufacturer: [], voltage_class: [] }} />
          </SheetReadOnlyProvider>
        </ToastProvider>
      </SyncContext>,
    );
    const help = DEFINITION.nameplate.find((field) => field.key === 'circuito_selv_pelv')!.help!;
    const helpers = [...container.querySelectorAll('.helper')];
    expect(helpers.filter((node) => !node.hasAttribute('data-tone')).map((node) => node.textContent)).toContain(help);
    const amber = container.querySelectorAll('.helper[data-tone="amber"]');
    expect(amber).toHaveLength(1);
    expect(amber[0]!.textContent).toBe(SELV_VOLTAGE_NOTICE);
    expect(container.querySelector('select')).toBeNull();
  });
});
