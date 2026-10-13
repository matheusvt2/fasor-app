import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, standardTemplate, type BlockRow, type EquipmentRow, type LocationRow, type RelatorioSummary } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { COMPANY_STREAM, openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { BackTargetProvider } from '../../state/back-target.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { loadIndependentWaits } from '../../test/load.ts';
import { makeSyncState } from '../../test/sync-state.ts';
import { SumarioSurface } from './sumario-surface.tsx';
import { TreeSurface } from './tree-surface.tsx';

/*
 * Story 14.2, second pass: "Remover" of a coluna, a painel and a local in the relatório tree
 * and their restore from "Restaurar ficha removida", over the small Porto Seguro fixture
 * (the local "Cabine de Testes" with SEC-TEST, DJ-TEST and TR-TEST directly on it) plus a
 * painel "Painel de média tensão" holding "Coluna 5" (an empty SEC-C05) and "Coluna 6", and
 * an empty painel "Painel B". The company stream is pulled to the end, so a removed sheet
 * frees its equipment (E9 sweep B15).
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;

const id = (n: number) => `019966c1-0152-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const PAINEL = id(1);
const PAINEL_B = id(2);
const COLUNA_5 = id(3);
const COLUNA_6 = id(4);
const SEC_C05 = id(5);
const SEC_C05_EQUIPMENT = id(6);
const blockIdOf = (n: number) => portoSeguroSmall.log.filter((op) => /^block\/[^/]+$/.test(op.path))[n]!.path.split('/')[1]!;
const SEC_TEST = blockIdOf(0);
const DJ_TEST = blockIdOf(1);
const TR_TEST = blockIdOf(2);

const RECOVER = 'Dá para recuperar até a emissão, em "Restaurar ficha removida".';

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
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

// E7-A2: DOM waits for a store round trip get a load-independent ceiling, and the tests a budget to match.
loadIndependentWaits();

function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-0153-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0154-7000-8000-000000000001' }),
    { id: PROJECT },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null)
    .map((b) => ({ ...b, relatorio_id: relatorioId }));
}

const summary: RelatorioSummary = { id: RELATORIO, project_id: PROJECT, status: 'em_campo', template_id: null, seed_version: 'v1', updated_seq: 1 };

async function seeded(): Promise<AppDatabase> {
  const user = `019966c1-0155-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  // The company stream pulled to the end, its summary listing the obra's one relatório.
  await db.sync_state.put({
    id: COMPANY_STREAM,
    cursor_seq: 1,
    complete: true,
    files_pending: 0,
    downloaded_at: '2026-09-28T12:00:00.000Z',
    last_sync_at: '2026-09-28T12:00:00.000Z',
    last_push_at: [],
    relatorios: [summary],
  });
  const base = { relatorio_id: RELATORIO, removed_at: null };
  const locations: LocationRow[] = [
    { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0' },
    { ...base, id: PAINEL_B, parent_id: LOCAL, kind: 'painel', name: 'Painel B', order_key: 'a1' },
    { ...base, id: COLUNA_5, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0' },
    { ...base, id: COLUNA_6, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 6', order_key: 'a1' },
  ];
  const pair = newEquipmentBlock({ blockId: SEC_C05, equipmentId: SEC_C05_EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_5, type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
  await db.entities.bulkPut([
    ...sectionBlocksFor(RELATORIO).map((b) => toRecord(`block:${b.id}`, b)),
    ...locations.map((row) => toRecord(`location:${row.id}`, row)),
    toRecord(`equipment:${pair.equipment.id}`, pair.equipment),
    toRecord(`block:${pair.block.id}`, pair.block),
  ]);
  return db;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncContext value={makeSyncState()}>
        <ToastProvider>
          <BackTargetProvider>
            <Routes>
              <Route path="/relatorio/:id" element={<SumarioSurface />} />
              <Route path="/relatorio/:id/arvore" element={<TreeSurface />} />
              <Route path="/relatorio/:id/ficha/:blockId" element={<p>Ficha</p>} />
            </Routes>
            <ToastOutlet />
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const announcer = () => screen.getByTestId('sumario-announcer');
const toast = () => document.querySelector('.toast');
const row = (locationId: string) => document.querySelector<HTMLElement>(`.s9-tree li[data-location-id="${locationId}"]`);
const eqRow = (blockId: string) => document.querySelector<HTMLElement>(`li.s9-eq[data-block-id="${blockId}"]`);
/** This device's unsent ops in the order they were written: batch after batch, each batch in its own order. */
const outbox = async () =>
  (await database!.outbox.toArray())
    .sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1))
    .map((op) => ({ path: op.path, kind: op.kind, value: op.value, batch: op.batch_id, scope: op.scope }));
const stored = async <T,>(entity: 'location' | 'block' | 'equipment', entityId: string) => (await database!.entities.get([entity, entityId]))?.row as T | undefined;
const removedAt = async (entity: 'location' | 'block' | 'equipment', entityId: string) => (await stored<{ removed_at: string | null }>(entity, entityId))?.removed_at;
const equipmentOf = async (blockId: string) => (await stored<BlockRow>('block', blockId))!.equipment_id!;

/** Opens the Sumário (Em campo, section 9 open) and expands the local: its painéis and their colunas open with it. */
async function openLocal() {
  const view = renderAt(`/relatorio/${RELATORIO}`);
  await screen.findByRole('list', { name: 'Locais do relatório' });
  await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
  await waitFor(() => expect(eqRow(SEC_TEST)).not.toBeNull());
  return view;
}

/** Opens a row's Overflow and presses "Remover". */
async function pressRemove(trigger: string) {
  await userEvent.click(screen.getByRole('button', { name: trigger }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
}

const PAINEL_MENU = 'Mais opções de Painel de média tensão de Cabine de Testes';
const PAINEL_B_MENU = 'Mais opções de Painel B de Cabine de Testes';
const COLUNA_5_MENU = 'Mais opções de Coluna 5 de Painel de média tensão de Cabine de Testes';
const COLUNA_6_MENU = 'Mais opções de Coluna 6 de Painel de média tensão de Cabine de Testes';
const LOCAL_MENU = 'Mais opções de Cabine de Testes';

afterEach(() => {
  database?.close();
  database = null;
});

describe('14.2 second pass: "Remover" in the location Overflow', () => {
  it('is the last item of a local, a painel and a coluna in the Sumário, alone in the destructive group', async () => {
    database = await seeded();
    await openLocal();
    for (const trigger of [LOCAL_MENU, PAINEL_MENU, PAINEL_B_MENU, COLUNA_5_MENU, COLUNA_6_MENU]) {
      await userEvent.click(screen.getByRole('button', { name: trigger }));
      const menu = await screen.findByRole('menu');
      const items = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
      const last = items.at(-1)!;
      expect(last, trigger).toHaveTextContent(/^Remover$/);
      expect(last).toHaveAttribute('data-tone', 'red');
      // The destructive group holds it alone, after every other item.
      expect([...menu.querySelectorAll('.menu-group [role^="menuitem"]')].map((item) => item.textContent)).toEqual(['Remover']);
      expect(items.filter((item) => item.textContent === 'Remover')).toHaveLength(1);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    }
  });

  it('the rail offers no removal: the local keeps its two items, a painel and a coluna have no Overflow', async () => {
    database = await seeded();
    renderAt(`/relatorio/${RELATORIO}/arvore`);
    const rail = await screen.findByRole('list', { name: 'Árvore do relatório' });
    await userEvent.click(await within(rail).findByRole('button', { name: 'Expandir Cabine de Testes' }));
    await waitFor(() => expect(rail.querySelector(`li[data-location-id="${COLUNA_5}"]`)).not.toBeNull());
    expect(within(rail).queryByRole('button', { name: PAINEL_MENU })).toBeNull();
    expect(within(rail).queryByRole('button', { name: COLUNA_5_MENU })).toBeNull();
    await userEvent.click(within(rail).getByRole('button', { name: LOCAL_MENU }));
    const menu = await screen.findByRole('menu');
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent)).toEqual(['Abrir primeira ficha (dados do local)', 'Agrupar por tipo na seção 9']);
    expect(within(menu).queryByText('Remover')).toBeNull();
  });
});

describe('14.2 second pass: removing a location', () => {
  it('a painel with no sheet leaves at once: one tombstone, the mock toast, the announcement, the focus on the row before it; "Desfazer" restores it and focuses its Overflow', async () => {
    database = await seeded();
    await openLocal();
    await pressRemove(PAINEL_B_MENU);
    await waitFor(() => expect(row(PAINEL_B)).toBeNull());
    // No sheet underneath: nothing is asked.
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(toast()).toHaveTextContent('Painel, suas colunas e fichas removidos — recuperável até a emissão'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel B de Cabine de Testes removido'));
    // The toast and the announcer never say the same sentence twice.
    expect(announcer().textContent).not.toBe(toast()!.querySelector(':scope > span')!.textContent);
    // The last of its list: the row before it takes the focus.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Painel de média tensão de Cabine de Testes' })).toHaveFocus());
    let ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value, op.scope])).toEqual([[`location/${PAINEL_B}/removed_at`, 'remove', null, 'relatorio']]);
    expect(await removedAt('location', PAINEL_B)).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(row(PAINEL_B)).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: PAINEL_B_MENU })).toHaveFocus());
    ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value])).toEqual([
      [`location/${PAINEL_B}/removed_at`, 'remove', null],
      [`location/${PAINEL_B}/removed_at`, 'put', null],
    ]);
    expect(await removedAt('location', PAINEL_B)).toBeNull();
  });

  it('a painel with a sheet asks first with the kernel\'s counts; "Cancelar" writes nothing and returns the focus to its Overflow', async () => {
    database = await seeded();
    await openLocal();
    await pressRemove(PAINEL_MENU);
    const dialog = await screen.findByRole('dialog', { name: 'Remover Painel de média tensão de Cabine de Testes?' });
    expect(dialog).toHaveClass('confirm-dialog');
    expect(within(dialog).getByText(`O painel, 2 colunas e 1 ficha saem do relatório. ${RECOVER}`)).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Remover painel' })).toHaveClass('btn-destructive');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: PAINEL_MENU })).toHaveFocus());
    expect(row(PAINEL)).not.toBeNull();
    expect(await outbox()).toHaveLength(0);
    expect(toast()).toBeNull();
  });

  it('removing a painel writes one batch in order (the painel, its colunas, their sheets, the freed equipment), closes the counters and focuses the next row; "Desfazer" restores every row', async () => {
    database = await seeded();
    await openLocal();
    expect(row(LOCAL)!.querySelector(':scope > .s9-loc-row .progress-counter')).toHaveTextContent('1 de 4');
    await pressRemove(PAINEL_MENU);
    const dialog = await screen.findByRole('dialog', { name: 'Remover Painel de média tensão de Cabine de Testes?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover painel' }));
    await waitFor(() => expect(row(PAINEL)).toBeNull());
    await waitFor(() => expect(toast()).toHaveTextContent('Painel, suas colunas e fichas removidos — recuperável até a emissão'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão de Cabine de Testes removido'));
    // Nothing of it is left in the tree, and the local's counter closes up.
    expect(row(COLUNA_5)).toBeNull();
    expect(row(COLUNA_6)).toBeNull();
    expect(eqRow(SEC_C05)).toBeNull();
    expect(row(LOCAL)!.querySelector(':scope > .s9-loc-row .progress-counter')).toHaveTextContent('1 de 3');
    expect([...row(LOCAL)!.querySelectorAll(':scope > .s9-pnls > li .s9-pnl-name')].map((el) => el.textContent)).toEqual(['Painel B']);
    // The row now at its place (the painel after it) takes the focus.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Painel B de Cabine de Testes' })).toHaveFocus());

    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value, op.scope])).toEqual([
      [`location/${PAINEL}/removed_at`, 'remove', null, 'relatorio'],
      [`location/${COLUNA_5}/removed_at`, 'remove', null, 'relatorio'],
      [`location/${COLUNA_6}/removed_at`, 'remove', null, 'relatorio'],
      [`block/${SEC_C05}/removed_at`, 'remove', null, 'relatorio'],
      [`equipment/${SEC_C05_EQUIPMENT}/removed_at`, 'remove', null, 'project'],
    ]);
    expect(new Set(ops.map((op) => op.batch)).size).toBe(1);
    // One batch, one timestamp: the rows of one removal share their `removed_at`.
    const stamps = await Promise.all([removedAt('location', PAINEL), removedAt('location', COLUNA_5), removedAt('location', COLUNA_6), removedAt('block', SEC_C05), removedAt('equipment', SEC_C05_EQUIPMENT)]);
    expect(stamps[0]).toEqual(expect.any(String));
    expect(new Set(stamps).size).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(row(PAINEL)).not.toBeNull());
    await waitFor(() => expect(eqRow(SEC_C05)).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: PAINEL_MENU })).toHaveFocus());
    expect(row(LOCAL)!.querySelector(':scope > .s9-loc-row .progress-counter')).toHaveTextContent('1 de 4');
    for (const [entity, entityId] of [['location', PAINEL], ['location', COLUNA_5], ['location', COLUNA_6], ['block', SEC_C05], ['equipment', SEC_C05_EQUIPMENT]] as const) {
      expect(await removedAt(entity, entityId), `${entity} ${entityId}`).toBeNull();
    }
    const all = await outbox();
    expect(all).toHaveLength(10);
    expect(all.slice(5).every((op) => op.kind === 'put' && op.value === null)).toBe(true);
    expect(new Set(all.slice(5).map((op) => op.batch)).size).toBe(1);
  });

  it('a coluna: with a sheet it asks ("Remover coluna") and the next coluna takes the focus; the last coluna left leaves at once and the painel\'s chevron takes it', async () => {
    database = await seeded();
    await openLocal();
    await pressRemove(COLUNA_5_MENU);
    const dialog = await screen.findByRole('dialog', { name: 'Remover Coluna 5 de Painel de média tensão de Cabine de Testes?' });
    expect(within(dialog).getByText(`A coluna e 1 ficha saem do relatório. ${RECOVER}`)).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover coluna' }));
    await waitFor(() => expect(row(COLUNA_5)).toBeNull());
    await waitFor(() => expect(toast()).toHaveTextContent('Coluna e suas fichas removidas — recuperável até a emissão'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 de Painel de média tensão de Cabine de Testes removida'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Coluna 6 de Painel de média tensão de Cabine de Testes' })).toHaveFocus());
    const first = await outbox();
    expect(first.map((op) => [op.path, op.kind])).toEqual([
      [`location/${COLUNA_5}/removed_at`, 'remove'],
      [`block/${SEC_C05}/removed_at`, 'remove'],
      [`equipment/${SEC_C05_EQUIPMENT}/removed_at`, 'remove'],
    ]);
    expect(new Set(first.map((op) => op.batch)).size).toBe(1);
    expect(row(PAINEL)!.querySelector(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveTextContent('Painel · 1 coluna');

    // No sheet on it: no Confirm. No coluna is left in the list: the painel's chevron takes the focus.
    await pressRemove(COLUNA_6_MENU);
    await waitFor(() => expect(row(COLUNA_6)).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 6 de Painel de média tensão de Cabine de Testes removida'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Painel de média tensão de Cabine de Testes' })).toHaveFocus());
    expect((await outbox()).slice(3).map((op) => [op.path, op.kind])).toEqual([[`location/${COLUNA_6}/removed_at`, 'remove']]);
    // The painel says it has no coluna now.
    expect(within(row(PAINEL)!).getByRole('note')).toHaveClass('pnl-empty');
  });

  it('a local: the Confirm counts its painéis, colunas and sheets; one batch in tree order; the foot\'s "Adicionar local" takes the focus when no row is left; "Desfazer" focuses its Overflow', async () => {
    database = await seeded();
    await openLocal();
    await pressRemove(LOCAL_MENU);
    const dialog = await screen.findByRole('dialog', { name: 'Remover Cabine de Testes?' });
    expect(within(dialog).getByText(`O local, 2 painéis, 2 colunas e 4 fichas saem do relatório. ${RECOVER}`)).toBeVisible();
    const equipment = await Promise.all([SEC_TEST, DJ_TEST, TR_TEST].map(equipmentOf));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover local' }));
    await waitFor(() => expect(row(LOCAL)).toBeNull());
    await waitFor(() => expect(toast()).toHaveTextContent('Local, seus painéis e fichas removidos — recuperável até a emissão'));
    // The kernel's sentence, named by the local's control name (its own name).
    await waitFor(() => expect(announcer()).toHaveTextContent(/^Cabine de Testes removida$/));
    expect(document.querySelectorAll('.s9-tree li')).toHaveLength(0);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Adicionar local' })).toHaveFocus());

    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind])).toEqual([
      // The target first, then what is under it in tree order.
      [`location/${LOCAL}/removed_at`, 'remove'],
      [`location/${PAINEL}/removed_at`, 'remove'],
      [`location/${COLUNA_5}/removed_at`, 'remove'],
      [`location/${COLUNA_6}/removed_at`, 'remove'],
      [`location/${PAINEL_B}/removed_at`, 'remove'],
      // Every sheet, location by location.
      [`block/${SEC_TEST}/removed_at`, 'remove'],
      [`block/${DJ_TEST}/removed_at`, 'remove'],
      [`block/${TR_TEST}/removed_at`, 'remove'],
      [`block/${SEC_C05}/removed_at`, 'remove'],
      // The equipment each of them frees, in the order of the sheets.
      ...equipment.map((equipmentId) => [`equipment/${equipmentId}/removed_at`, 'remove']),
      [`equipment/${SEC_C05_EQUIPMENT}/removed_at`, 'remove'],
    ]);
    expect(new Set(ops.map((op) => op.batch)).size).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(row(LOCAL)).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: LOCAL_MENU })).toHaveFocus());
    for (const locationId of [LOCAL, PAINEL, COLUNA_5, COLUNA_6, PAINEL_B]) expect(await removedAt('location', locationId)).toBeNull();
    for (const blockId of [SEC_TEST, DJ_TEST, TR_TEST, SEC_C05]) expect(await removedAt('block', blockId)).toBeNull();
    for (const equipmentId of [...equipment, SEC_C05_EQUIPMENT]) expect(await removedAt('equipment', equipmentId)).toBeNull();
  });

  it('a location removed on another device after its Overflow opened: "Remover" says the location changed and writes nothing', async () => {
    database = await seeded();
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: PAINEL_B_MENU }));
    const remove = await screen.findByRole('menuitem', { name: 'Remover' });
    // Its local is tombstoned as another device's pull would: the painel is under a removed location now.
    const record = (await database.entities.get(['location', LOCAL]))!;
    const at = '2026-10-12T10:00:00.000Z';
    await database.entities.put({ ...record, removed_at: at, row: { ...(record.row as object), removed_at: at } as never });
    fireEvent.click(remove);
    await waitFor(() => expect(toast()).toHaveTextContent('O local mudou em outro aparelho; nada foi alterado.'));
    expect(await outbox()).toHaveLength(0);
    expect(await removedAt('location', PAINEL_B)).toBeNull();
  });
});

describe('14.2 second pass: "Restaurar ficha removida" with removed locations', () => {
  const T0 = '2026-10-11T09:00:00.000Z';
  const T = '2026-10-12T10:00:00.000Z';
  const T2 = '2026-10-12T11:00:00.000Z';
  const OLD = id(0x11);
  const OLD_EQUIPMENT = id(0x12);
  const TAKER = id(0x13);
  const TAKER_EQUIPMENT = id(0x14);

  /**
   * The painel removed at T with its colunas, SEC-C05 and its equipment; a sheet of Coluna 5
   * (SEC-OLD) removed on its own before, at T0; TR-TEST removed on its own afterwards, on the
   * live local; and a live sheet on the local that took the TAG "SEC-C05" meanwhile.
   */
  async function removedPainel(): Promise<AppDatabase> {
    const db = await seeded();
    const tombstone = async (entity: 'location' | 'block' | 'equipment', entityId: string, at: string) => {
      const record = (await db.entities.get([entity, entityId]))!;
      await db.entities.put({ ...record, removed_at: at, row: { ...(record.row as object), removed_at: at } as never });
    };
    const old = newEquipmentBlock({ blockId: OLD, equipmentId: OLD_EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_5, type: 'chave_seccionadora', tag: 'SEC-OLD', seedVersion: 'v1', orderKey: 'a1' });
    const taker = newEquipmentBlock({ blockId: TAKER, equipmentId: TAKER_EQUIPMENT, relatorioId: RELATORIO, projectId: PROJECT, locationId: LOCAL, type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'z0' });
    await db.entities.bulkPut([
      toRecord(`equipment:${old.equipment.id}`, { ...old.equipment, removed_at: T0 } as EquipmentRow),
      toRecord(`block:${old.block.id}`, { ...old.block, removed_at: T0 }),
      toRecord(`equipment:${taker.equipment.id}`, taker.equipment),
      toRecord(`block:${taker.block.id}`, taker.block),
    ]);
    for (const locationId of [PAINEL, COLUNA_5, COLUNA_6]) await tombstone('location', locationId, T);
    await tombstone('block', SEC_C05, T);
    await tombstone('equipment', SEC_C05_EQUIPMENT, T);
    await tombstone('block', TR_TEST, T2);
    await tombstone('equipment', await equipmentOfIn(db, TR_TEST), T2);
    return db;
  }
  const equipmentOfIn = async (db: AppDatabase, blockId: string) => ((await db.entities.get(['block', blockId]))!.row as BlockRow).equipment_id!;

  async function openRestore() {
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar ficha removida' }));
    return screen.findByRole('dialog', { name: 'Restaurar ficha removida' });
  }
  const entries = (dialog: HTMLElement) =>
    [...dialog.querySelectorAll<HTMLElement>('.restore-list > li')].map((li) => [
      li.dataset.locationId !== undefined ? 'location' : 'block',
      li.dataset.locationId ?? li.dataset.blockId,
      li.querySelector('.rr-primary')?.textContent,
      li.querySelector('.rr-secondary')?.textContent ?? null,
      li.querySelector('button')?.getAttribute('aria-label'),
    ]);

  it('lists one entry per removed location beside the removed sheets, newest first; a sheet that left with its location, or sits under it, is not listed', async () => {
    database = await removedPainel();
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    const dialog = await openRestore();
    await waitFor(() => expect(dialog.querySelector(`li[data-location-id="${PAINEL}"]`)).not.toBeNull());
    expect(entries(dialog)).toEqual([
      ['block', TR_TEST, 'TR-TEST', 'Cabine de Testes', 'Restaurar TR-TEST — Cabine de Testes'],
      [
        'location',
        PAINEL,
        'Painel de média tensão de Cabine de Testes',
        'Painel · 2 colunas · 1 ficha',
        'Restaurar Painel de média tensão de Cabine de Testes — Painel · 2 colunas · 1 ficha',
      ],
    ]);
    // The mock's list classes, and the dialog keeps its title.
    expect(dialog.querySelector('.restore-list')).toHaveClass('registry-list');
    expect(dialog.querySelector(`li[data-location-id="${PAINEL}"]`)).toHaveClass('registry-row');
    // Neither the colunas and the sheet that left with the painel nor the sheet removed before it, under it.
    for (const hidden of [COLUNA_5, COLUNA_6]) expect(dialog.querySelector(`li[data-location-id="${hidden}"]`)).toBeNull();
    for (const hidden of [SEC_C05, OLD]) expect(dialog.querySelector(`li[data-block-id="${hidden}"]`)).toBeNull();
  });

  it('restoring a painel writes one batch from the plan (locations, sheets, equipment), opens section 9 on the restored row, says it, and marks a TAG reused meanwhile as a duplicate; "Desfazer" removes the same rows again', async () => {
    database = await removedPainel();
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    // Section 9 collapsed, so the restore has to open it.
    await userEvent.click(screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' }));
    await waitFor(() => expect(document.querySelector('.sum-s9')).not.toHaveClass('is-open'));

    const dialog = await openRestore();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Restaurar Painel de média tensão de Cabine de Testes — Painel · 2 colunas · 1 ficha' }));
    await waitFor(() => expect(row(PAINEL)).not.toBeNull());
    expect(document.querySelector('.sum-s9')).toHaveClass('is-open');
    await waitFor(() => expect(toast()).toHaveTextContent('Painel restaurado'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão de Cabine de Testes restaurado'));
    await waitFor(() => expect(screen.getByRole('button', { name: PAINEL_MENU })).toHaveFocus());
    // The colunas and the sheet that left with it are back; the sheet removed before it stays removed.
    expect(row(COLUNA_5)).not.toBeNull();
    expect(row(COLUNA_6)).not.toBeNull();
    expect(eqRow(SEC_C05)).not.toBeNull();
    expect(eqRow(OLD)).toBeNull();
    expect(await removedAt('block', OLD)).toBe(T0);
    // The TAG was taken meanwhile: the restore is not refused, and both rows carry the duplicate line.
    expect(eqRow(SEC_C05)!.querySelector('.s9-dup')).not.toBeNull();
    expect(eqRow(TAKER)!.querySelector('.s9-dup')).not.toBeNull();

    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value, op.scope])).toEqual([
      [`location/${PAINEL}/removed_at`, 'put', null, 'relatorio'],
      [`location/${COLUNA_5}/removed_at`, 'put', null, 'relatorio'],
      [`location/${COLUNA_6}/removed_at`, 'put', null, 'relatorio'],
      [`block/${SEC_C05}/removed_at`, 'put', null, 'relatorio'],
      [`equipment/${SEC_C05_EQUIPMENT}/removed_at`, 'put', null, 'project'],
    ]);
    expect(new Set(ops.map((op) => op.batch)).size).toBe(1);

    // The sheet removed on its own before is offered by itself now that its coluna is live.
    const again = await openRestore();
    await waitFor(() => expect(again.querySelector(`li[data-block-id="${OLD}"]`)).not.toBeNull());
    expect(entries(again)).toEqual([
      ['block', TR_TEST, 'TR-TEST', 'Cabine de Testes', 'Restaurar TR-TEST — Cabine de Testes'],
      ['block', OLD, 'SEC-OLD', 'Cabine de Testes › Painel de média tensão › Coluna 5', 'Restaurar SEC-OLD — Cabine de Testes › Painel de média tensão › Coluna 5'],
    ]);
    await userEvent.click(within(again).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // "Desfazer" puts the removal's own timestamp back on every row, so they still restore together.
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(row(PAINEL)).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções do relatório' })).toHaveFocus());
    for (const [entity, entityId] of [['location', PAINEL], ['location', COLUNA_5], ['location', COLUNA_6], ['block', SEC_C05], ['equipment', SEC_C05_EQUIPMENT]] as const) {
      expect(await removedAt(entity, entityId), `${entity} ${entityId}`).toBe(T);
    }
  });

  it('restoring a sheet still restores the sheet and its equipment alone when its location is live', async () => {
    database = await removedPainel();
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    const dialog = await openRestore();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Restaurar TR-TEST — Cabine de Testes' }));
    await waitFor(() => expect(eqRow(TR_TEST)).not.toBeNull());
    await waitFor(() => expect(toast()).toHaveTextContent('Ficha restaurada'));
    expect((await outbox()).map((op) => [op.path, op.kind, op.value])).toEqual([
      [`block/${TR_TEST}/removed_at`, 'put', null],
      [`equipment/${await equipmentOf(TR_TEST)}/removed_at`, 'put', null],
    ]);
    // The painel stays removed.
    expect(await removedAt('location', PAINEL)).toBe(T);
  });
});
