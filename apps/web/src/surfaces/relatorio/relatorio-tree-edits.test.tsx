import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, standardTemplate, type BlockRow, type EquipmentRow, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
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
const DJ_TEST = blockIdOf(1);

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

// E3-A4: one of three parts of the tree suite, split so they run in parallel (removals, TAGs, duplicates, locations).

describe('4.4 location tree (Sumário presentation)', () => {
  it('removes an empty block without asking; the focus goes to the parent chevron; Desfazer brings it back and focuses its Overflow', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(() => expect(document.querySelector(`li[data-block-id="${SEC_C01}"]`)).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('Ficha removida')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Coluna 1' })).toHaveFocus());
    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.scope])).toEqual([
      [`block/${SEC_C01}/removed_at`, 'remove', 'relatorio'],
      [`equipment/${id(4)}/removed_at`, 'remove', 'project'],
    ]);
    expect(new Set(ops.map((op) => op.batch)).size).toBe(1);
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(eqRow(SEC_C01)).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de SEC-C01' })).toHaveFocus());
  });

  it('Q4: removing a block whose equipment another relatório of the obra holds writes only the block tombstone', async () => {
    database = await seeded();
    // A second live relatório of the same project on this device, whose live block holds SEC-C01's equipment.
    const OTHER = id(50);
    const relatorio = (await database.entities.get(['relatorio', RELATORIO]))!.row as { id: string };
    const other = newEquipmentBlock({
      blockId: id(51),
      equipmentId: id(4),
      relatorioId: OTHER,
      projectId: PROJECT,
      locationId: id(52),
      type: 'chave_seccionadora',
      tag: 'SEC-C01',
      seedVersion: 'v1',
      orderKey: 'a0',
    });
    await database.entities.bulkPut([toRecord(`relatorio:${OTHER}`, { ...relatorio, id: OTHER } as never), toRecord(`block:${other.block.id}`, other.block)]);
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(() => expect(document.querySelector(`li[data-block-id="${SEC_C01}"]`)).toBeNull());
    expect((await outbox()).map((op) => [op.path, op.kind])).toEqual([[`block/${SEC_C01}/removed_at`, 'remove']]);
    expect(((await database.entities.get(['equipment', id(4)]))!.row as EquipmentRow).removed_at).toBeNull();
  });

  it('asks before removing a block with data; Cancelar returns to the trigger; Remover moves the focus to the row in the slot; Restaurar brings it back', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover ficha SEC-TEST?' });
    expect(dialog).toHaveAccessibleDescription('Dá para desfazer em seguida e restaurar em "Restaurar ficha removida" até o relatório ser emitido.');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    expect(await axe(dialog)).toHaveNoViolations();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' })).toHaveFocus());
    expect(await outbox()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover ficha SEC-TEST?' })).getByRole('button', { name: 'Remover ficha' }));
    await waitFor(() => expect(document.querySelector(`li[data-block-id="${SEC_TEST}"]`)).toBeNull());
    await waitFor(() => expect(eqRow(DJ_TEST).querySelector('.s9-eq-open')).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar ficha removida' }));
    const restore = await screen.findByRole('dialog', { name: 'Restaurar ficha removida' });
    await userEvent.click(within(restore).getByRole('button', { name: 'Restaurar SEC-TEST — Cabine de Testes' }));
    await waitFor(() => expect(eqRow(SEC_TEST)).not.toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de SEC-TEST' })).toHaveFocus());
    expect(await screen.findByText('Ficha restaurada')).toBeInTheDocument();
    const ops = await outbox();
    expect(ops.slice(-2).map((op) => [op.path, op.kind, op.value])).toEqual([
      [`block/${SEC_TEST}/removed_at`, 'put', null],
      [`equipment/019966c1-0000-7000-8000-000000000009/removed_at`, 'put', null],
    ]);
  });

  it('shows "TAG ⟨TAG⟩ duplicada" with Renomear on rows whose TAG another live equipment row shares; renaming keeps the equipment and clears it', async () => {
    const twin: EquipmentRow = { id: id(9), project_id: PROJECT, tag: 'DJ-TEST', type: 'disjuntor_mt', last_nameplate: null, removed_at: null };
    database = await seeded({ extraEquipment: [twin] });
    await openCabine();
    const line = eqRow(DJ_TEST).querySelector('.s9-dup')!;
    expect(line).toHaveTextContent('TAG DJ-TEST duplicada');
    // Review F-6: the line's button is named with its row.
    await userEvent.click(within(line as HTMLElement).getByRole('button', { name: 'Renomear TAG DJ-TEST em Cabine de Testes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear TAG DJ-TEST' });
    const field = within(dialog).getByRole('textbox', { name: 'TAG' });
    expect(field).toHaveValue('DJ-TEST');
    // Taken by another live row: refused on blur with the kernel sentence.
    await userEvent.clear(field);
    await userEvent.type(field, 'sec-test ');
    fireEvent.blur(field);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('TAG já existe nesta obra — SEC-TEST em Cabine de Testes');
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.clear(field);
    await userEvent.type(field, 'DJ-TEST-A');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(eqRow(DJ_TEST).querySelector('.block-tag')).toHaveTextContent('DJ-TEST-A'));
    expect(eqRow(DJ_TEST).querySelector('.s9-dup')).toBeNull();
    const ops = await outbox();
    expect(ops).toEqual([expect.objectContaining({ path: 'equipment/019966c1-0000-7000-8000-00000000000a/tag', kind: 'put', value: 'DJ-TEST-A', scope: 'project' })]);
  });

  it('"Duplicar" asks a new TAG (suggested, refused when taken) and creates equipment + block after the source, copying its config only', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de SEC-C01' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Duplicar SEC-C01' });
    const field = within(dialog).getByRole('textbox', { name: 'TAG' });
    expect(field).toHaveValue('SEC-C01-2');
    expect(await axe(dialog)).toHaveNoViolations();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Duplicar' }));
    await waitFor(() => expect(tags(tree().querySelector('li.s9-coluna')!)).toEqual(['SEC-C01', 'SEC-C01-2']));
    expect(await screen.findByText('SEC-C01-2 criada na Coluna 1')).toBeInTheDocument();
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.path.split('/')[0])).toEqual(['equipment', 'block']);
    const block = ops[1]!.value as BlockRow;
    const source = (await database.entities.get(['block', SEC_C01]))!.row as BlockRow;
    expect(block).toMatchObject({ location_id: COLUNA, block_type: 'chave_seccionadora', seed_version: 'v1', not_tested: null, concluded_by: null });
    expect(block.config).toEqual(source.config);
    expect(block.order_key > source.order_key).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(eqRow(block.id).querySelector('.s9-eq-open')));
  });

  it('adds, renames and reorders locations with location ops, announced; every block keeps its location', async () => {
    database = await seeded();
    await openCabine();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar coluna' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Coluna 2' })).toHaveFocus());
    expect(await screen.findByText('Coluna 2 adicionada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Subir' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 2 movida para a posição 1 de 2'));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Coluna 2' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByText('Salvar: falta o nome')).toBeInTheDocument();
    await userEvent.type(field, 'Entrada{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Entrada' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar cabine' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Expandir Cabine 3' })).toHaveFocus());
    // Alt+ArrowUp on the new cabine's chevron moves it.
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Cabine 3 movida para a posição 2 de 3'));
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => [op.path.replace(/[0-9a-f-]{36}/, 'ID'), op.kind])).toEqual([
      ['location/ID', 'create'],
      ['location/ID/order_key', 'put'],
      ['location/ID/name', 'put'],
      ['location/ID', 'create'],
      ['location/ID/order_key', 'put'],
    ]);
    const created = ops[0]!.value as LocationRow;
    expect(created).toMatchObject({ kind: 'coluna', parent_id: CABINE, name: 'Coluna 2' });
    expect(ops[3]!.value).toMatchObject({ kind: 'cabine', parent_id: null, name: 'Cabine 3', agrupar_por_tipo: false });
    expect(ops.some((op) => op.path.startsWith('block/'))).toBe(false);
  });
});
