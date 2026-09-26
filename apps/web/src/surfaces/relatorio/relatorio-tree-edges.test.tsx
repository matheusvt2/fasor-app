import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, standardTemplate, type BlockRow, type EquipmentRow, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { MemoryRouter, Route, Routes, useNavigate, useParams, type NavigateFunction } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { LAST_SHEET_PREF, openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { BackTargetProvider } from '../../state/back-target.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { SumarioSurface } from './sumario-surface.tsx';
import { TreeSurface } from './tree-surface.tsx';

/*
 * Stories 4.4 and 4.5: the location tree in the Sumário's section 9 and on the rail, over
 * the small Porto Seguro fixture (one cabine, SEC-TEST in progress, DJ-TEST not tested,
 * TR-TEST in progress) plus a "Coluna 1" holding an empty SEC-C01 and an empty cabine.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;

const id = (n: number) => `019966c1-0020-7000-8000-${n.toString(16).padStart(12, '0')}`;
const CABINE = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const COLUNA = id(1);
const EMPTY_CABINE = id(2);
const SEC_C01 = id(3);
const blockIdOf = (n: number) => portoSeguroSmall.log.filter((op) => /^block\/[^/]+$/.test(op.path))[n]!.path.split('/')[1]!;
const SEC_TEST = blockIdOf(0);

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: USER, name: 'Bento Braga', email: 'b@teste.local', companyId: COMPANY, companyName: 'Empresa B de Teste', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

const syncState = (): SyncState => makeSyncState();

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-0021-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-0022-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0023-7000-8000-000000000001' }),
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

async function seeded(options: { status?: string; extraEquipment?: EquipmentRow[] } = {}): Promise<AppDatabase> {
  const db = await freshDb();
  await applyPulled(db, portoSeguroSmall.log);
  const cabine = (await db.entities.get(['location', CABINE]))!.row as LocationRow;
  const coluna: LocationRow = { id: COLUNA, relatorio_id: RELATORIO, parent_id: CABINE, kind: 'coluna', name: 'Coluna 1', order_key: 'a0', removed_at: null };
  const empty: LocationRow = { ...cabine, id: EMPTY_CABINE, name: 'Cabine Vazia', order_key: 'a5' } as LocationRow;
  const pair = newEquipmentBlock({
    blockId: SEC_C01,
    equipmentId: id(4),
    relatorioId: RELATORIO,
    projectId: PROJECT,
    locationId: COLUNA,
    type: 'chave_seccionadora',
    tag: 'SEC-C01',
    seedVersion: 'v1',
    orderKey: 'a0',
  });
  await db.entities.bulkPut([
    ...sectionBlocksFor(RELATORIO).map((b) => toRecord(`block:${b.id}`, b)),
    toRecord(`location:${COLUNA}`, coluna),
    toRecord(`location:${EMPTY_CABINE}`, empty),
    toRecord(`equipment:${pair.equipment.id}`, pair.equipment),
    toRecord(`block:${pair.block.id}`, pair.block),
    ...(options.extraEquipment ?? []).map((e) => toRecord(`equipment:${e.id}`, e)),
  ]);
  if (options.status !== undefined) {
    const record = (await db.entities.get(['relatorio', RELATORIO]))!;
    await db.entities.put({ ...record, row: { ...(record.row as { status: string }), status: options.status } as never });
  }
  return db;
}

/** The router's `navigate`, so a test can leave the surface while the toast outlet stays. */
let go: NavigateFunction | null = null;
function NavProbe() {
  go = useNavigate();
  return null;
}

/** Story 5.1: a tree row opens its sheet; the probe names the block the address carries. */
function FichaProbe() {
  const { blockId } = useParams();
  return <p data-testid="ficha-probe">{blockId}</p>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SyncContext value={syncState()}>
        <ToastProvider>
          <BackTargetProvider>
            <NavProbe />
            <Routes>
              <Route path="/relatorio/:id" element={<SumarioSurface />} />
              <Route path="/relatorio/:id/arvore" element={<TreeSurface />} />
              <Route path="/elsewhere" element={<p>Outra tela</p>} />
              <Route path="/relatorio/:id/ficha/:blockId" element={<FichaProbe />} />
            </Routes>
            <ToastOutlet />
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );
}

const tree = () => screen.getByRole('list', { name: 'Locais do relatório' });
const announcer = () => screen.getByTestId('sumario-announcer');
const eqRow = (blockId: string) => document.querySelector<HTMLElement>(`li.s9-eq[data-block-id="${blockId}"]`)!;
const tags = (li: Element) => [...li.querySelectorAll(':scope > .s9-eqs > li.s9-eq .block-tag')].map((e) => e.textContent);
const outbox = async () => (await database!.outbox.toArray()).map((op) => ({ path: op.path, kind: op.kind, value: op.value, batch: op.batch_id, scope: op.scope }));

/** Opens the Sumário (Em campo, section 9 open) and expands the fixture's cabine. */
async function openCabine() {
  renderAt(`/relatorio/${RELATORIO}`);
  await screen.findByRole('list', { name: 'Locais do relatório' });
  await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
  await waitFor(() => expect(eqRow(SEC_TEST)).not.toBeNull());
}

afterEach(() => {
  database?.close();
  database = null;
});

// E3-A4: one of three parts of the tree suite, split so they run in parallel (edge paths and the field palette).

describe('4.4/4.5 tree edge paths', () => {
  /** Tombstones a row in the device store as another device's pull would. */
  async function tombstone(entity: 'block' | 'equipment', entityId: string) {
    const record = (await database!.entities.get([entity, entityId]))!;
    const at = '2026-09-08T10:00:00.000Z';
    await database!.entities.put({ ...record, removed_at: at, row: { ...(record.row as object), removed_at: at } as never });
  }

  it('a block removed elsewhere after its Overflow opened: "Descer" says it changed and writes nothing', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' }));
    const down = await screen.findByRole('menuitem', { name: 'Descer' });
    await tombstone('block', SEC_TEST);
    fireEvent.click(down);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('A ficha mudou em outro aparelho; nada foi alterado.'));
    expect(await outbox()).toHaveLength(0);
  });

  it('"Duplicar" submitted after another live row took the TAG is refused with the sentence and writes nothing', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Duplicar SEC-C01' });
    const submit = within(dialog).getByRole('button', { name: 'Duplicar' });
    const twin: EquipmentRow = { id: id(10), project_id: PROJECT, tag: 'SEC-C01-2', type: 'chave_seccionadora', last_nameplate: null, removed_at: null };
    await database.entities.put(toRecord(`equipment:${twin.id}`, twin));
    fireEvent.click(submit);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('TAG já existe nesta obra — SEC-C01-2'));
    expect(await outbox()).toHaveLength(0);
  });

  it('"Renomear TAG" after the equipment row was removed elsewhere says the sheet changed', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear TAG' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear TAG SEC-C01' });
    const field = within(dialog).getByRole('textbox', { name: 'TAG' });
    await userEvent.clear(field);
    await userEvent.type(field, 'SEC-C01-A');
    await tombstone('equipment', id(4));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('A ficha mudou em outro aparelho; nada foi alterado.'));
    expect(await outbox()).toHaveLength(0);
  });

  it('"Adicionar abaixo" creates the block right after its row; "Desfazer" hands the focus back to that row', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar abaixo' }));
    const palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine de Testes')).toBeInTheDocument();
    await userEvent.click([...palette.querySelectorAll<HTMLElement>('.pf-field')][1]!);
    await waitFor(() => expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['SEC-TEST', 'PR-TESTES', 'DJ-TEST', 'TR-TEST']));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['SEC-TEST', 'DJ-TEST', 'TR-TEST']));
    await waitFor(() => expect(eqRow(SEC_TEST).querySelector('.s9-eq-open')).toHaveFocus());
  });

  it('".s9-add" opens the palette on the cabine\'s current coluna and creates there; the palette opens on its first type; "Desfazer" focuses the coluna chevron', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar bloco em Cabine de Testes' }));
    const palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    // Review F-3: the cabine's last coluna (no last sheet under it), as the mock's "Em: 1° Subsolo › Coluna 9".
    expect(within(palette).getByText('Em: Cabine de Testes › Coluna 1')).toBeInTheDocument();
    // Review F-9: the first type row takes the focus, not "Fechar".
    await waitFor(() => expect(palette.querySelector('.pf-field')).toHaveFocus());
    await userEvent.click([...palette.querySelectorAll<HTMLElement>('.pf-field')][1]!);
    const coluna = () => tree().querySelector('li.s9-coluna')!;
    await waitFor(() => expect(tags(coluna())).toEqual(['SEC-C01', 'PR-C01']));
    expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['SEC-TEST', 'DJ-TEST', 'TR-TEST']);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('PR-C01 criada na Coluna 1'));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(tags(coluna())).toEqual(['SEC-C01']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Coluna 1' })).toHaveFocus());
  });

  it('the cabine\'s "Adicionar bloco" follows the last sheet\'s coluna; a cabine with no coluna takes the block itself, "criada em ⟨cabine⟩"', async () => {
    // Rascunho: section 9 opens collapsed, so nothing is expanded for the last sheet.
    database = await seeded({ status: 'rascunho' });
    const coluna2: LocationRow = { id: id(20), relatorio_id: RELATORIO, parent_id: CABINE, kind: 'coluna', name: 'Coluna 2', order_key: 'a1', removed_at: null };
    await database.entities.put(toRecord(`location:${coluna2.id}`, coluna2));
    await database.local_prefs.put({ key: LAST_SHEET_PREF(RELATORIO), value: SEC_C01 });
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar bloco' }));
    let palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine de Testes › Coluna 1')).toBeInTheDocument();
    await userEvent.click(within(palette).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Expandir Cabine Vazia' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar bloco em Cabine Vazia' }));
    palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine Vazia')).toBeInTheDocument();
    await userEvent.click([...palette.querySelectorAll<HTMLElement>('.pf-field')][3]!);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('DJ-VAZIA criada em Cabine Vazia'));
  });

  it('"Desfazer" of a Restaurar hands the focus back to the header\'s "Mais opções do relatório"', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(() => expect(document.querySelector(`li[data-block-id="${SEC_C01}"]`)).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar ficha removida' }));
    const restore = await screen.findByRole('dialog', { name: 'Restaurar ficha removida' });
    await userEvent.click(within(restore).getByRole('button', { name: 'Restaurar SEC-C01 — Cabine de Testes › Coluna 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de SEC-C01' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(document.querySelector(`li[data-block-id="${SEC_C01}"]`)).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções do relatório' })).toHaveFocus());
  });

  it('"Desfazer" after a move focuses the row\'s Position box; after "Adicionar coluna" the cabine\'s chevron', async () => {
    database = await seeded();
    await openCabine();
    const box = within(eqRow(SEC_TEST)).getByRole('textbox', { name: 'Posição de SEC-TEST' });
    await userEvent.clear(box);
    await userEvent.type(box, '2{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('SEC-TEST movido para a posição 2 de 3'));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['SEC-TEST', 'DJ-TEST', 'TR-TEST']));
    await waitFor(() => expect(within(eqRow(SEC_TEST)).getByRole('textbox', { name: 'Posição de SEC-TEST' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar coluna' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Coluna 2' })).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Recolher Coluna 2' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveFocus());
  });

  it('the undo toast is dismissed when the Sumário is left', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de DJ-TEST' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument());
    act(() => {
      void go!('/elsewhere');
    });
    expect(await screen.findByText('Outra tela')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
  });
});

describe('4.5 field palette (Sumário)', () => {
  it('opens from a coluna row, lists the eight types with the suggested TAG, and one tap creates equipment + block in one batch', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 1' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar bloco' }));
    const palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine de Testes › Coluna 1')).toBeInTheDocument();
    const field = [...palette.querySelectorAll('.pf-field')];
    expect(field).toHaveLength(8);
    expect(field.map((b) => b.querySelector('.pi-meta')?.textContent)).toEqual(['CE-C01', 'PR-C01', 'SEC-C01-2', 'DJ-C01', 'TP-C01', 'TC-C01', 'CS-C01', 'TR-1']);
    // No section blocks and no sub-block toggles in the field palette.
    expect(within(palette).queryByText('Objetivo')).toBeNull();
    expect(within(palette).queryByRole('switch')).toBeNull();
    expect(await axe(palette)).toHaveNoViolations();
    await userEvent.click(field[3] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar bloco' })).toBeNull());
    await waitFor(() => expect(tags(tree().querySelector('li.s9-coluna')!)).toEqual(['SEC-C01', 'DJ-C01']));
    expect(await screen.findByText('DJ-C01 criada na Coluna 1')).toBeInTheDocument();
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => [op.path.split('/')[0], op.kind, op.scope])).toEqual([
      ['equipment', 'create', 'project'],
      ['block', 'create', 'relatorio'],
    ]);
    expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);
    const equipment = ops[0]!.value as EquipmentRow;
    const block = ops[1]!.value as BlockRow;
    expect(equipment).toMatchObject({ tag: 'DJ-C01', type: 'disjuntor_mt', project_id: PROJECT });
    expect(block).toMatchObject({ equipment_id: equipment.id, location_id: COLUNA, block_type: 'disjuntor_mt', seed_version: 'v1' });
    expect(block.order_key > 'a0').toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(eqRow(block.id).querySelector('.s9-eq-open')));
  });
});
