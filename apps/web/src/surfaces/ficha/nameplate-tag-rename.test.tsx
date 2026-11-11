import 'fake-indexeddb/auto';
import { defaultBlockConfig, emptySheet, getDefinition, tagRenamedText, tagTakenText, type BlockRow, type Cell, type EntityState, type EquipmentRow, type OpDraft, type RelatorioSnapshot } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import type { Build } from '../relatorio/relatorio-editor.ts';
import type { FichaApi } from './ficha-api.ts';
import { NameplateSection } from './nameplate-section.tsx';

/*
 * Fix batch e24y (P3, the coordinator's reading N3): the plate's TAG field on a v14 Disjuntor MT is
 * the equipment's TAG. Typing and leaving it (blur or Enter) renames the equipment through the
 * rename's checks, the cell written in the same batch, with the rename's undo toast; a TAG another
 * live equipment holds, or a blank one, is refused with the rename's reason and the field shows the
 * stored value again; idle typing writes nothing.
 */

const session: { database: AppDatabase | null; user: null; online: boolean } = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/drafts.tsx', () => ({ useDraftSource: () => undefined }));

const ID = '019966b0-d0e4-7000-8000-000000000001';
const REL = '019966b0-d0e4-7000-8000-000000000002';
const PROJECT = '019966b0-d0e4-7000-8000-000000000003';
const EQUIPMENT = '019966b0-d0e4-7000-8000-000000000004';
const OTHER = '019966b0-d0e4-7000-8000-000000000005';
const OP = '019966b0-d0e4-7000-8000-000000000006';
const AUTHOR = { id: 'u1', companyId: 'c1' };
const DEFINITION = getDefinition('v14', 'cabine_primaria', 'disjuntor_mt');

const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });

function sheetOf(nameplate: Record<string, Cell> = {}): BlockRow {
  return {
    id: ID,
    relatorio_id: REL,
    location_id: null,
    equipment_id: EQUIPMENT,
    block_type: 'disjuntor_mt',
    config: defaultBlockConfig('v14', 'disjuntor_mt'),
    seed_version: 'v14',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), nameplate },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const equipmentRow = (id: string, tag: string): EquipmentRow => ({ id, project_id: PROJECT, tag, type: 'disjuntor_mt', last_nameplate: null, removed_at: null });
const EQUIPMENT_ROWS = [equipmentRow(EQUIPMENT, 'DJ-01'), equipmentRow(OTHER, 'DJ-02')];

let counter = 0;
beforeEach(async () => {
  const user = `019966b0-d0e4-7000-8000-${(++counter).toString(16).padStart(12, 'b')}`;
  const db = openDatabase(user);
  await db.delete();
  session.database = openDatabase(user);
});

afterEach(async () => {
  cleanup();
  await session.database?.close();
  session.database = null;
});

function draw(shown: BlockRow) {
  const built: OpDraft[][] = [];
  const api: FichaApi = {
    relatorioId: REL,
    projectId: PROJECT,
    blockId: ID,
    author: AUTHOR,
    commit: vi.fn(async () => undefined),
    edit: vi.fn(async (build: Build) => {
      const ops = build([shown], AUTHOR, { blocks: [shown], locations: [], allLocations: [], equipment: EQUIPMENT_ROWS });
      if (ops === null) return null;
      built.push(ops);
      return 'b1';
    }),
    undoable: vi.fn(),
    announce: vi.fn(),
  };
  const snapshot = {
    relatorio: { id: REL, project_id: PROJECT, status: 'em_campo', seed_version: 'v14', export: { scheme: 'ordem_de_campo' } },
    blocks: [shown],
    equipment: EQUIPMENT_ROWS,
    locations: [],
    files: [],
    points: [],
    suggestions: [],
    instruments: [],
  } as unknown as RelatorioSnapshot;
  render(
    <SyncContext value={makeSyncState()}>
      <ToastProvider>
        <NameplateSection api={api} snapshot={snapshot} state={new Map() as EntityState} block={shown} definition={DEFINITION} equipment={EQUIPMENT_ROWS} registries={{ manufacturer: [], voltage_class: [] }} />
        <ToastOutlet />
      </ToastProvider>
    </SyncContext>,
  );
  return { api, built };
}

const tagInput = () => screen.getByRole('textbox', { name: 'TAG' });
const paths = (ops: readonly OpDraft[]) => ops.map((op) => `${op.path}=${String(op.value)}`);

describe('e24y-P3 the plate\'s TAG field renames the equipment', () => {
  it('typing "QM8" and leaving the field renames DJ-01 with the plate cell in the same batch, under the rename\'s toast', async () => {
    const { api, built } = draw(sheetOf());
    expect(tagInput()).toHaveValue('DJ-01');
    await userEvent.clear(tagInput());
    await userEvent.type(tagInput(), 'QM8');
    // Idle mid-typing: nothing is written ("Q", "QM" never rename).
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(api.edit).not.toHaveBeenCalled();
    expect(api.commit).not.toHaveBeenCalled();
    await userEvent.tab();
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)).toEqual([`equipment/${EQUIPMENT}/tag=QM8`, `sheet/${ID}/nameplate/tag=QM8`]);
    await waitFor(() => expect(api.undoable).toHaveBeenCalledWith(tagRenamedText('QM8'), 'b1'));
    expect(api.commit).not.toHaveBeenCalled();
  });

  it('Enter commits the rename too', async () => {
    const { built } = draw(sheetOf());
    await userEvent.clear(tagInput());
    await userEvent.type(tagInput(), 'QM8{Enter}');
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)[0]).toBe(`equipment/${EQUIPMENT}/tag=QM8`);
  });

  it('a TAG another live equipment holds is refused with the rename\'s reason; the field shows DJ-01 again; nothing written', async () => {
    const { api, built } = draw(sheetOf());
    await userEvent.clear(tagInput());
    await userEvent.type(tagInput(), 'DJ-02');
    await userEvent.tab();
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1));
    expect(built).toEqual([]);
    expect(await screen.findByText(tagTakenText('DJ-02', null))).toBeInTheDocument();
    await waitFor(() => expect(tagInput()).toHaveValue('DJ-01'));
    expect(api.undoable).not.toHaveBeenCalled();
  });

  it('a blank TAG is refused with the empty reason and the stored cell shows again', async () => {
    const { api, built } = draw(sheetOf({ tag: cell('SINT-4') }));
    expect(tagInput()).toHaveValue('SINT-4');
    await userEvent.clear(tagInput());
    await userEvent.tab();
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(1));
    expect(built).toEqual([]);
    await waitFor(() => expect(tagInput()).toHaveValue('SINT-4'));
  });

  it('a stored cell that differs: typing the equipment\'s own TAG writes the cell alone, with no rename toast', async () => {
    const { api, built } = draw(sheetOf({ tag: cell('SINT-4') }));
    await userEvent.clear(tagInput());
    await userEvent.type(tagInput(), 'DJ-01');
    await userEvent.tab();
    await waitFor(() => expect(built).toHaveLength(1));
    expect(paths(built[0]!)).toEqual([`sheet/${ID}/nameplate/tag=DJ-01`]);
    expect(api.undoable).not.toHaveBeenCalled();
  });
});
