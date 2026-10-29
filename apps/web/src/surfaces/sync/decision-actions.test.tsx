import 'fake-indexeddb/auto';
import { newEquipmentBlock, type BlockRemovalDecision, type BlockRow, type DecisionTextContext, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { heldDecisions } from '../../db/decision-store.ts';
import { relatorioState } from '../../db/home-store.ts';
import { relatorioSnapshotOf } from '../../db/relatorio-snapshot.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { useDecisionActions } from './decision-actions.ts';

/*
 * Story 14.2, second pass (rule 5): "Manter a ficha" of a removed-versus-edited decision
 * whose sheet left with its location. The kept sheet comes back together with the removed
 * rows above it, so it is never restored into a location the tree does not show.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;

const id = (n: number) => `019966c1-0162-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const PAINEL = id(1);
const COLUNA_5 = id(2);
const COLUNA_6 = id(3);
const SHEET = id(4);
const EQUIPMENT = id(5);
const T = '2026-10-12T10:00:00.000Z';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

/**
 * A painel removed at T with its two colunas and the sheet SEC-C05 of Coluna 5, which
 * another device had edited: the sheet carries the removed-versus-edited mark.
 */
async function seeded(): Promise<AppDatabase> {
  const user = `019966c1-0163-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const base = { relatorio_id: RELATORIO, removed_at: T };
  const locations: LocationRow[] = [
    { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0' },
    { ...base, id: COLUNA_5, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0' },
    { ...base, id: COLUNA_6, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 6', order_key: 'a1' },
  ];
  const pair = newEquipmentBlock({ blockId: SHEET, equipmentId: EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_5, type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
  const marked: BlockRow = {
    ...pair.block,
    removed_at: T,
    removed_by: USER,
    removal_conflict: { removed_by: USER, removed_at: T, edited_by: USER, edited_at: '2026-10-12T09:59:00.000Z' },
  };
  await db.entities.bulkPut([
    ...locations.map((row) => toRecord(`location:${row.id}`, row)),
    toRecord(`equipment:${pair.equipment.id}`, { ...pair.equipment, removed_at: T }),
    toRecord(`block:${marked.id}`, marked),
  ]);
  return db;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>
    {children}
    <ToastOutlet />
  </ToastProvider>
);
const outbox = async () =>
  (await database!.outbox.toArray())
    .sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1))
    .map((op) => ({ path: op.path, kind: op.kind, value: op.value, batch: op.batch_id, scope: op.scope }));

afterEach(() => {
  database?.close();
  database = null;
});

describe('14.2 second pass: "Manter a ficha" of a sheet removed with its location', () => {
  it('restores the removed painel and coluna above the sheet, the sheet and its equipment in one batch; the snapshot then shows the sheet in a live location', async () => {
    database = await seeded();
    const [entry] = await heldDecisions(database);
    const decision = entry!.decisions.find((row): row is BlockRemovalDecision => row.kind === 'block_removal' && row.block_id === SHEET)!;
    expect(decision).toBeDefined();
    // Before: the sheet and everything of the painel are out of the snapshot.
    let snapshot = relatorioSnapshotOf((await relatorioState(database, RELATORIO))!, RELATORIO);
    expect(snapshot.blocks.some((block) => block.id === SHEET)).toBe(false);
    expect(snapshot.locations.map((row) => row.id)).toEqual([LOCAL]);

    const context: DecisionTextContext = { blocks: entry!.blocks, equipment: entry!.equipment, locations: entry!.locations, users: [], viewerActorId: USER, viewerDeviceId: 'tablet-1' };
    const { result } = renderHook(() => useDecisionActions(), { wrapper });
    await act(async () => {
      await result.current.keep(entry!, decision, context);
    });

    // The decision's rows carry the removed locations, so the toast still names the sheet's place.
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('SEC-C05 mantido na Coluna 5 com as suas alterações'));
    expect(entry!.locations.map((row) => row.id).sort()).toEqual([LOCAL, PAINEL, COLUNA_5, COLUNA_6].sort());

    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value, op.scope])).toEqual([
      // The removed rows above the sheet, root first; Coluna 6 is no ancestor of it and stays removed.
      [`location/${PAINEL}/removed_at`, 'put', null, 'relatorio'],
      [`location/${COLUNA_5}/removed_at`, 'put', null, 'relatorio'],
      [`block/${SHEET}/removed_at`, 'put', null, 'relatorio'],
      [`equipment/${EQUIPMENT}/removed_at`, 'put', null, 'project'],
    ]);
    expect(new Set(ops.map((op) => op.batch)).size).toBe(1);

    await waitFor(async () => {
      snapshot = relatorioSnapshotOf((await relatorioState(database!, RELATORIO))!, RELATORIO);
      expect(snapshot.blocks.some((block) => block.id === SHEET)).toBe(true);
    });
    expect(snapshot.locations.map((row) => row.id).sort()).toEqual([LOCAL, PAINEL, COLUNA_5].sort());
    expect(((await database.entities.get(['location', COLUNA_6]))!.row as LocationRow).removed_at).toBe(T);
  });
});
