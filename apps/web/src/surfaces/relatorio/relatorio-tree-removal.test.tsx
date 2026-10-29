import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, orderKeyBetween, standardTemplate, type BlockRow, type EquipmentRow, type LocationRow, type RelatorioSummary } from '@app/domain';
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
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

// The read of every location row (removed ones included) can be held unresolved, for the one
// test of the restore list before it lands; every other test reads through to the store.
const pendingRead = vi.hoisted(() => ({ held: false }));
vi.mock('../../db/home-store.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/home-store.ts')>();
  return {
    ...actual,
    allLocationRows: (...args: Parameters<typeof actual.allLocationRows>) => (pendingRead.held ? new Promise<LocationRow[]>(() => {}) : actual.allLocationRows(...args)),
  };
});

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
  pendingRead.held = false;
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
    // No Overflow at all on a painel or a coluna of the rail, whatever its name; the local's row keeps its own.
    for (const locationId of [PAINEL, PAINEL_B, COLUNA_5, COLUNA_6]) {
      const railRow = rail.querySelector<HTMLElement>(`li[data-location-id="${locationId}"]`);
      expect(railRow, locationId).not.toBeNull();
      expect(railRow!.querySelectorAll('.overflow-trigger'), locationId).toHaveLength(0);
    }
    expect(rail.querySelectorAll(`li[data-location-id="${LOCAL}"] > .tree-row .overflow-trigger`)).toHaveLength(1);
    // The rail's coluna chevron is named with its painel and its local, as in the Sumário: open with its local, then collapsed.
    const chevron = within(rail).getByRole('button', { name: 'Recolher Coluna 5 de Painel de média tensão de Cabine de Testes' });
    expect(chevron).toHaveAttribute('data-tree-chevron', COLUNA_5);
    await userEvent.click(chevron);
    expect(within(rail).getByRole('button', { name: 'Expandir Coluna 5 de Painel de média tensão de Cabine de Testes' })).toHaveAttribute('data-tree-chevron', COLUNA_5);
    await userEvent.click(within(rail).getByRole('button', { name: LOCAL_MENU }));
    const menu = await screen.findByRole('menu');
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent)).toEqual(['Abrir primeira ficha (dados do local)', 'Agrupar por tipo na seção 9']);
    expect(within(menu).queryByText('Remover')).toBeNull();
  });
});

describe('14.2 second pass: the controls of a row are named apart when default names repeat', () => {
  const PAINEL_1 = id(0x31);
  const PAINEL_2 = id(0x33);
  const ENEL = id(0x35);
  const ENEL_PAINEL_1 = id(0x36);
  const COLUNA_1 = [id(0x32), id(0x34), id(0x37)] as const;

  it('two painéis each with a "Coluna 1", and two locals each with a "Painel 1" holding a "Coluna 1": every chevron, drag handle, Position box and Overflow name in the tree is unique, and so is each "Adicionar bloco em"', async () => {
    database = await seeded();
    const base = { relatorio_id: RELATORIO, removed_at: null };
    const more: LocationRow[] = [
      { ...base, id: PAINEL_1, parent_id: LOCAL, kind: 'painel', name: 'Painel 1', order_key: 'a2' },
      { ...base, id: COLUNA_1[0], parent_id: PAINEL_1, kind: 'coluna', name: 'Coluna 1', order_key: 'a0' },
      { ...base, id: PAINEL_2, parent_id: LOCAL, kind: 'painel', name: 'Painel 2', order_key: 'a3' },
      { ...base, id: COLUNA_1[1], parent_id: PAINEL_2, kind: 'coluna', name: 'Coluna 1', order_key: 'a0' },
      {
        ...base,
        id: ENEL,
        parent_id: null,
        kind: 'cabine',
        name: 'Cubículo Enel',
        order_key: 'z0',
        se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
        env: { altitude_m: null, temperature_c: null, humidity_pct: null },
        agrupar_por_tipo: false,
      },
      { ...base, id: ENEL_PAINEL_1, parent_id: ENEL, kind: 'painel', name: 'Painel 1', order_key: 'a0' },
      { ...base, id: COLUNA_1[2], parent_id: ENEL_PAINEL_1, kind: 'coluna', name: 'Coluna 1', order_key: 'a0' },
    ];
    await database.entities.bulkPut(more.map((location) => toRecord(`location:${location.id}`, location)));
    await openLocal();
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cubículo Enel' }));
    await waitFor(() => expect(COLUNA_1.every((locationId) => row(locationId) !== null)).toBe(true));

    const tree = screen.getByRole('list', { name: 'Locais do relatório' });
    const locations = tree.querySelectorAll('li[data-location-id]').length;
    const sheets = tree.querySelectorAll('li.s9-eq').length;
    expect(locations).toBe(12);
    const names = (selector: string) => [...tree.querySelectorAll<HTMLElement>(selector)].map((control) => control.getAttribute('aria-label'));
    // One chevron per location row; a handle, a Position box and an Overflow per location row and per sheet.
    const chevrons = names('.tree-chevron');
    expect(chevrons).toHaveLength(locations);
    for (const [what, selector] of [['drag handle', '.drag-handle'], ['Position box', '.pos-box'], ['Overflow', '.overflow-trigger']] as const) {
      const found = names(selector);
      expect(found, what).toHaveLength(locations + sheets);
      expect(found.every((name) => name !== null && name !== ''), what).toBe(true);
      expect(new Set(found).size, what).toBe(found.length);
    }
    expect(chevrons.every((name) => name !== null && name !== '')).toBe(true);
    expect(new Set(chevrons).size).toBe(chevrons.length);
    // The three "Coluna 1" rows, by the names the kernel composes.
    for (const where of ['Painel 1 de Cabine de Testes', 'Painel 2 de Cabine de Testes', 'Painel 1 de Cubículo Enel']) {
      expect(within(tree).getByRole('button', { name: `Mais opções de Coluna 1 de ${where}` })).toBeInTheDocument();
      expect(within(tree).getByRole('button', { name: `Reordenar Coluna 1 de ${where}` })).toBeInTheDocument();
      expect(within(tree).getByRole('textbox', { name: `Posição de Coluna 1 de ${where}` })).toBeInTheDocument();
    }

    // The two "Painel 1" show the same words on their add button; their accessible names differ.
    const first = within(tree).getByRole('button', { name: 'Adicionar bloco em Painel 1 de Cabine de Testes' });
    const second = within(tree).getByRole('button', { name: 'Adicionar bloco em Painel 1 de Cubículo Enel' });
    expect(first).not.toBe(second);
    expect(first).toHaveTextContent(/^Adicionar bloco em Painel 1$/);
    expect(second).toHaveTextContent(/^Adicionar bloco em Painel 1$/);
    const adds = names('.s9-add').filter((name) => name !== null);
    expect(new Set(adds).size).toBe(adds.length);
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
    // Story 15.2: the kicker says the level ("Painel · 1 coluna" before).
    expect(row(PAINEL)!.querySelector(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveTextContent(/^1 coluna$/);

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

describe('14.2 second pass: an edit reads the kernel\'s live locations', () => {
  it('a painel whose local was removed on another device is gone for an edit too: "Renomear" says the location changed and writes nothing', async () => {
    database = await seeded();
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: PAINEL_B_MENU }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Painel B' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Painel C');
    const save = within(dialog).getByRole('button', { name: 'Salvar' });
    // The painel's own row stays live; only its local carries the tombstone.
    const record = (await database.entities.get(['location', LOCAL]))!;
    const at = '2026-10-12T10:00:00.000Z';
    await database.entities.put({ ...record, removed_at: at, row: { ...(record.row as object), removed_at: at } as never });
    fireEvent.click(save);
    await waitFor(() => expect(toast()).toHaveTextContent('O local mudou em outro aparelho; nada foi alterado.'));
    expect(await outbox()).toHaveLength(0);
    expect((await stored<LocationRow>('location', PAINEL_B))!.name).toBe('Painel B');
  });
});

describe('14.2 second pass: a new location beside a removed sibling', () => {
  it('"Adicionar coluna" after a middle coluna was removed, and again after the last one was, writes a create whose name and order key no sibling holds, removed ones included', async () => {
    database = await seeded();
    // "Painel B" with three colunas added one after the other, under their default names.
    const keys = [orderKeyBetween(null, null)];
    keys.push(orderKeyBetween(keys[0]!, null));
    keys.push(orderKeyBetween(keys[1]!, null));
    const colunas = keys.map((order_key, i): LocationRow => ({ id: id(0x21 + i), relatorio_id: RELATORIO, parent_id: PAINEL_B, kind: 'coluna', name: `Coluna ${i + 1}`, order_key, removed_at: null }));
    await database.entities.bulkPut(colunas.map((coluna) => toRecord(`location:${coluna.id}`, coluna)));
    await openLocal();
    const siblings = async () => (await database!.entities.where('entity').equals('location').toArray()).map((record) => record.row as LocationRow).filter((location) => location.parent_id === PAINEL_B);
    const addColuna = async (): Promise<LocationRow> => {
      const before = (await outbox()).length;
      await userEvent.click(screen.getByRole('button', { name: PAINEL_B_MENU }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar coluna' }));
      await waitFor(async () => expect(await outbox()).toHaveLength(before + 1));
      const op = (await outbox()).at(-1)!;
      expect(op.kind).toBe('create');
      const made = op.value as unknown as LocationRow;
      expect(op.path).toBe(`location/${made.id}`);
      await waitFor(() => expect(row(made.id)).not.toBeNull());
      return made;
    };

    // The middle one leaves (no sheet on it: no Confirm).
    await pressRemove('Mais opções de Coluna 2 de Painel B de Cabine de Testes');
    await waitFor(() => expect(row(colunas[1]!.id)).toBeNull());
    const first = await addColuna();
    expect(first.name).toBe('Coluna 4');
    let others = (await siblings()).filter((location) => location.id !== first.id);
    expect(others).toHaveLength(3);
    expect(others.map((location) => location.name)).not.toContain(first.name);
    expect(others.map((location) => location.order_key)).not.toContain(first.order_key);

    // The last one leaves: the number after the live ones ("Coluna 4") is the removed row's own.
    await pressRemove('Mais opções de Coluna 4 de Painel B de Cabine de Testes');
    await waitFor(() => expect(row(first.id)).toBeNull());
    const second = await addColuna();
    expect(second.name).toBe('Coluna 5');
    others = (await siblings()).filter((location) => location.id !== second.id);
    expect(others).toHaveLength(4);
    expect(others.map((location) => location.name)).not.toContain(second.name);
    expect(others.map((location) => location.order_key)).not.toContain(second.order_key);
    expect(second.order_key > first.order_key).toBe(true);
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

  it('offers nothing while the read of every location row has not landed: never the sheets of a removed painel one by one', async () => {
    database = await removedPainel();
    pendingRead.held = true;
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    const dialog = await openRestore();
    // With the live rows standing in, SEC-C05 and SEC-OLD (their coluna unknown to the list) would each be offered alone.
    expect(within(dialog).getByText('Nenhuma ficha removida para restaurar')).toBeVisible();
    expect(dialog.querySelector('.restore-list')).toBeNull();
    expect(within(dialog).queryAllByRole('button', { name: /^Restaurar / })).toHaveLength(0);
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

  it('a location restored on another device after the dialog opened: "Restaurar" says the location changed and writes nothing', async () => {
    database = await removedPainel();
    renderAt(`/relatorio/${RELATORIO}`);
    await screen.findByRole('list', { name: 'Locais do relatório' });
    const dialog = await openRestore();
    const button = await within(dialog).findByRole('button', { name: 'Restaurar Painel de média tensão de Cabine de Testes — Painel · 2 colunas · 1 ficha' });
    // The painel is live again, as another device's pull would leave it: there is no removal to restore.
    const record = (await database.entities.get(['location', PAINEL]))!;
    await database.entities.put({ ...record, removed_at: null, row: { ...(record.row as object), removed_at: null } as never });
    fireEvent.click(button);
    await waitFor(() => expect(toast()).toHaveTextContent('O local mudou em outro aparelho; nada foi alterado.'));
    expect(toast()).not.toHaveTextContent('Painel restaurado');
    expect(await outbox()).toHaveLength(0);
    // Nothing else of the removal came back.
    for (const [entity, entityId] of [['location', COLUNA_5], ['location', COLUNA_6], ['block', SEC_C05], ['equipment', SEC_C05_EQUIPMENT]] as const) {
      expect(await removedAt(entity, entityId), `${entity} ${entityId}`).toBe(T);
    }
  });

  describe('a coluna and a local come back as a painel does', () => {
    /** The rows of one removal, tombstoned at T as its batch leaves them. */
    async function removedTogether(locations: string[], blocks: string[]): Promise<{ db: AppDatabase; equipment: string[] }> {
      const db = await seeded();
      const equipment = await Promise.all(blocks.map((blockId) => equipmentOfIn(db, blockId)));
      const rows = [...locations.map((entityId) => ['location', entityId] as const), ...blocks.map((entityId) => ['block', entityId] as const), ...equipment.map((entityId) => ['equipment', entityId] as const)];
      for (const [entity, entityId] of rows) {
        const record = (await db.entities.get([entity, entityId]))!;
        await db.entities.put({ ...record, removed_at: T, row: { ...(record.row as object), removed_at: T } as never });
      }
      return { db, equipment };
    }
    const cases = [
      {
        kind: 'coluna',
        target: COLUNA_5,
        locations: [COLUNA_5],
        blocks: [SEC_C05],
        entry: 'Restaurar Coluna 5 de Painel de média tensão de Cabine de Testes — Coluna · 1 ficha',
        toastText: 'Coluna restaurada',
        said: 'Coluna 5 de Painel de média tensão de Cabine de Testes restaurada',
        menu: COLUNA_5_MENU,
        // The path down to the coluna is opened by the restore, and a coluna shows its sheets.
        expand: null,
      },
      {
        kind: 'local',
        target: LOCAL,
        // The plan's order: the local, then what is under it in tree order.
        locations: [LOCAL, PAINEL, COLUNA_5, COLUNA_6, PAINEL_B],
        blocks: [SEC_TEST, DJ_TEST, TR_TEST, SEC_C05],
        entry: 'Restaurar Cabine de Testes — Local · 2 painéis · 2 colunas · 4 fichas',
        toastText: 'Local restaurado',
        said: 'Cabine de Testes restaurada',
        menu: LOCAL_MENU,
        // A local comes back as any local is first drawn, collapsed: what is under it shows once it is opened.
        expand: 'Expandir Cabine de Testes',
      },
    ] as const;

    it.each(cases)('restoring a $kind writes one batch from the plan, toasts "$toastText", says it and focuses the restored row', async ({ target, locations, blocks, entry, toastText, said, menu, expand }) => {
      const seededRows = await removedTogether([...locations], [...blocks]);
      database = seededRows.db;
      renderAt(`/relatorio/${RELATORIO}`);
      await screen.findByRole('button', { name: 'Mais opções do relatório' });
      await waitFor(() => expect(document.querySelector('.sum-s9')).not.toBeNull());
      expect(row(target)).toBeNull();

      const dialog = await openRestore();
      await userEvent.click(await within(dialog).findByRole('button', { name: entry }));
      await waitFor(() => expect(row(target)).not.toBeNull());
      expect(document.querySelector('.sum-s9')).toHaveClass('is-open');
      await waitFor(() => expect(toast()).toHaveTextContent(toastText));
      await waitFor(() => expect(announcer().textContent).toBe(said));
      // The focus lands on the restored row: its Overflow trigger, inside that row.
      await waitFor(() => expect(screen.getByRole('button', { name: menu })).toHaveFocus());
      expect(row(target)!.contains(document.activeElement)).toBe(true);
      expect(document.activeElement!.closest('li[data-location-id]')).toBe(row(target));
      // Everything that left with it is drawn again.
      if (expand !== null) await userEvent.click(screen.getByRole('button', { name: expand }));
      for (const locationId of locations) await waitFor(() => expect(row(locationId), locationId).not.toBeNull());
      for (const blockId of blocks) await waitFor(() => expect(eqRow(blockId), blockId).not.toBeNull());

      const ops = await outbox();
      expect(ops.map((op) => [op.path, op.kind, op.value, op.scope])).toEqual([
        ...locations.map((locationId) => [`location/${locationId}/removed_at`, 'put', null, 'relatorio']),
        ...blocks.map((blockId) => [`block/${blockId}/removed_at`, 'put', null, 'relatorio']),
        ...seededRows.equipment.map((equipmentId) => [`equipment/${equipmentId}/removed_at`, 'put', null, 'project']),
      ]);
      expect(new Set(ops.map((op) => op.batch)).size).toBe(1);
      for (const locationId of locations) expect(await removedAt('location', locationId), locationId).toBeNull();
      for (const blockId of blocks) expect(await removedAt('block', blockId), blockId).toBeNull();
      for (const equipmentId of seededRows.equipment) expect(await removedAt('equipment', equipmentId), equipmentId).toBeNull();
    });
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
