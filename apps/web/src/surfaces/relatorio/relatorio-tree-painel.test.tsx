import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, standardTemplate, type BlockRow, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { BackTargetProvider } from '../../state/back-target.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { SumarioSurface } from './sumario-surface.tsx';
import { TreeSurface } from './tree-surface.tsx';

/*
 * Story 14.2: Local › Painel › Coluna in the relatório tree, over the small Porto Seguro
 * fixture (the local "Cabine de Testes" with SEC-TEST, DJ-TEST and TR-TEST directly on it)
 * plus a painel "Painel de média tensão" holding "Coluna 5" (an empty SEC-C05) and "Coluna
 * 6", and an empty painel "Painel B".
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;
const PROJECT = portoSeguroSmall.projectId;

const id = (n: number) => `019966c1-0142-7000-8000-${n.toString(16).padStart(12, '0')}`;
const LOCAL = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
const PAINEL = id(1);
const PAINEL_B = id(2);
const COLUNA_5 = id(3);
const COLUNA_6 = id(4);
const SEC_C05 = id(5);
const blockIdOf = (n: number) => portoSeguroSmall.log.filter((op) => /^block\/[^/]+$/.test(op.path))[n]!.path.split('/')[1]!;
const SEC_TEST = blockIdOf(0);

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

configure({ asyncUtilTimeout: 5000 });

function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-0143-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-0144-7000-8000-000000000001' }),
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

async function seeded(options: { funcao?: string; paineis?: boolean } = {}): Promise<AppDatabase> {
  const user = `019966c1-0145-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  await openDatabase(user).delete();
  const db = openDatabase(user);
  await applyPulled(db, portoSeguroSmall.log);
  const base = { relatorio_id: RELATORIO, removed_at: null };
  const locations: LocationRow[] =
    options.paineis === false
      ? []
      : [
          { ...base, id: PAINEL, parent_id: LOCAL, kind: 'painel', name: 'Painel de média tensão', order_key: 'a0' },
          { ...base, id: PAINEL_B, parent_id: LOCAL, kind: 'painel', name: 'Painel B', order_key: 'a1' },
          { ...base, id: COLUNA_5, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 5', order_key: 'a0' },
          { ...base, id: COLUNA_6, parent_id: PAINEL, kind: 'coluna', name: 'Coluna 6', order_key: 'a1' },
        ];
  const pair = newEquipmentBlock({ blockId: SEC_C05, equipmentId: id(6), relatorioId: RELATORIO, projectId: PROJECT, locationId: COLUNA_5, type: 'chave_seccionadora', tag: 'SEC-C05', seedVersion: 'v1', orderKey: 'a0' });
  await db.entities.bulkPut([
    ...sectionBlocksFor(RELATORIO).map((b) => toRecord(`block:${b.id}`, b)),
    ...locations.map((row) => toRecord(`location:${row.id}`, row)),
    ...(options.paineis === false ? [] : [toRecord(`equipment:${pair.equipment.id}`, pair.equipment), toRecord(`block:${pair.block.id}`, pair.block)]),
  ]);
  if (options.funcao !== undefined) {
    const record = (await db.entities.get(['location', LOCAL]))!;
    await db.entities.put({ ...record, row: { ...(record.row as object), funcao: options.funcao } as never });
  }
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

const tree = () => screen.getByRole('list', { name: 'Locais do relatório' });
const announcer = () => screen.getByTestId('sumario-announcer');
const row = (locationId: string) => document.querySelector<HTMLElement>(`li[data-location-id="${locationId}"]`)!;
const outbox = async () =>
  (await database!.outbox.toArray())
    .sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1))
    .map((op) => ({ path: op.path, kind: op.kind, value: op.value, batch: op.batch_id }));
const locationRow = async (locationId: string) => (await database!.entities.get(['location', locationId]))?.row as LocationRow | undefined;

/** Opens the Sumário (Em campo, section 9 open) and expands the local: its painéis and their colunas open with it. */
async function openLocal() {
  const view = renderAt(`/relatorio/${RELATORIO}`);
  await screen.findByRole('list', { name: 'Locais do relatório' });
  await userEvent.click(await screen.findByRole('button', { name: 'Expandir Cabine de Testes' }));
  await waitFor(() => expect(document.querySelector(`li.s9-eq[data-block-id="${SEC_TEST}"]`)).not.toBeNull());
  return view;
}

afterEach(() => {
  database?.close();
  database = null;
});

describe('14.2 relatório tree: three levels (Sumário presentation)', () => {
  it('draws the local row with its Função-led meta, its own sheets under "Equipamentos no local", then its painéis with their colunas and sheets', async () => {
    database = await seeded({ funcao: 'primaria' });
    const { container } = await openLocal();
    const local = row(LOCAL);
    expect(local).toHaveClass('s9-local', 'is-open');
    expect(local.querySelector(':scope > .s9-loc-row .s9-loc-name')).toHaveTextContent('Cabine de Testes');
    expect(local.querySelector(':scope > .s9-loc-row .s9-loc-meta')).toHaveTextContent('Primária · ALVENARIA - CONVENCIONAL · 13,8 kV · 20 °C · 60 %');
    expect(local.querySelector(':scope > .s9-loc-row .progress-counter')).toHaveTextContent('1 de 4');
    const direct = local.querySelector(':scope > .s9-col-direct')!;
    expect(direct).toHaveTextContent('Equipamentos no local');
    expect(direct.querySelector('.s9-col-meta')).toHaveTextContent('1 de 3');
    expect([...local.querySelectorAll(':scope > .s9-eqs > li.s9-eq .block-tag')].map((el) => el.textContent)).toEqual(['SEC-TEST', 'DJ-TEST', 'TR-TEST']);

    const paineis = within(local).getByRole('list', { name: 'Painéis de Cabine de Testes' });
    expect(paineis).toHaveClass('s9-pnls');
    expect([...paineis.querySelectorAll(':scope > li.s9-painel .s9-pnl-name')].map((el) => el.textContent)).toEqual(['Painel de média tensão', 'Painel B']);
    const painel = row(PAINEL);
    expect(painel).toHaveClass('s9-painel', 'is-open');
    expect(painel.querySelector(':scope > .s9-pnl-row .s9-pnl-meta')).toHaveTextContent('Painel · 2 colunas');
    expect(painel.querySelector(':scope > .s9-pnl-row .progress-counter')).toHaveTextContent('0 de 1');
    // The colunas of a painel are `.s9-col` rows under it, one level in; their sheets one more.
    const colunas = [...painel.querySelectorAll<HTMLElement>(':scope > .s9-cols > li.s9-coluna')];
    expect(colunas.map((li) => [li.querySelector('.s9-col-name')?.textContent, li.dataset.level])).toEqual([
      ['Coluna 5', '2'],
      ['Coluna 6', '2'],
    ]);
    expect(colunas[0]!.querySelector(':scope > .s9-col')).not.toBeNull();
    const sheet = colunas[0]!.querySelector<HTMLElement>(':scope > .s9-eqs > li.s9-eq')!;
    expect(sheet).toHaveAttribute('data-level', '3');
    expect(sheet.querySelector('.block-tag')).toHaveTextContent('SEC-C05');
    // "Adicionar equipamento no local" under the local's own sheets; "Adicionar bloco em ⟨painel⟩" under the painel.
    expect(within(local).getByRole('button', { name: 'Adicionar equipamento no local Cabine de Testes' })).toHaveClass('s9-add');
    // Its accessible name adds the painel's local (rule 9); the visible words stay the mock's.
    const addInPainel = within(painel).getByRole('button', { name: 'Adicionar bloco em Painel de média tensão de Cabine de Testes' });
    expect(addInPainel).toHaveClass('s9-add');
    expect(addInPainel).toHaveTextContent(/^Adicionar bloco em Painel de média tensão$/);
    expect(screen.getByRole('button', { name: 'Adicionar local' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    // No label of the tree calls the root "cabine" (the stored names are the user's own, so they are left out).
    const copyOfTree = tree().closest('.sum-s9')!.cloneNode(true) as HTMLElement;
    for (const el of copyOfTree.querySelectorAll('.s9-loc-name')) el.textContent = '';
    expect(copyOfTree).not.toHaveTextContent(/\bcabines?\b/i);
    expect(copyOfTree).toHaveTextContent('Equipamentos no local');
  }, 60_000);

  it('matrix "Empty painel": it shows the note, offers "Adicionar coluna" and no "Adicionar bloco"', async () => {
    database = await seeded();
    await openLocal();
    const painelB = row(PAINEL_B);
    expect(painelB.querySelector('.s9-pnl-meta')).toHaveTextContent('Painel · sem colunas');
    const note = within(painelB).getByRole('note');
    expect(note).toHaveClass('pnl-empty');
    expect(note).toHaveTextContent('Este painel ainda não tem colunas. Um painel só agrupa colunas e não recebe equipamento direto: adicione uma coluna e coloque os equipamentos nela.');
    expect(within(painelB).queryByRole('button', { name: /Adicionar bloco/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel B de Cabine de Testes' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Adicionar coluna', 'Renomear', 'Subir', 'Remover']);
    await userEvent.keyboard('{Escape}');
    // The painel with colunas offers "Adicionar bloco" too.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel de média tensão de Cabine de Testes' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Adicionar bloco', 'Adicionar coluna', 'Renomear', 'Descer', 'Remover']);
    await userEvent.keyboard('{Escape}');

    await userEvent.click(within(painelB).getByRole('button', { name: 'Adicionar coluna' }));
    expect(await screen.findByText('Coluna 1 adicionada')).toBeInTheDocument();
    await waitFor(() => expect(within(row(PAINEL_B)).queryByRole('note')).toBeNull());
    expect(within(row(PAINEL_B)).getByRole('button', { name: 'Adicionar bloco em Painel B de Cabine de Testes' })).toHaveTextContent(/^Adicionar bloco em Painel B$/);
    const [create] = await outbox();
    expect(create).toMatchObject({ kind: 'create', value: { kind: 'coluna', parent_id: PAINEL_B, name: 'Coluna 1' } });
    expect(create!.path).toMatch(/^location\/[0-9a-f-]{36}$/);
  });

  it('a block that sits on a painel is drawn under it, as it is counted: a block never vanishes', async () => {
    database = await seeded();
    const stray = newEquipmentBlock({ blockId: id(0x21), equipmentId: id(0x22), relatorioId: RELATORIO, projectId: PROJECT, locationId: PAINEL_B, type: 'disjuntor_mt', tag: 'DJ-9', seedVersion: 'v1', orderKey: 'a0' });
    await database.entities.bulkPut([toRecord(`equipment:${stray.equipment.id}`, stray.equipment), toRecord(`block:${stray.block.id}`, stray.block)]);
    await openLocal();
    const painelB = row(PAINEL_B);
    expect(painelB.querySelector(':scope > .s9-pnl-row .progress-counter')).toHaveTextContent('0 de 1');
    const sheet = painelB.querySelector<HTMLElement>(`:scope > .s9-eqs > li.s9-eq[data-block-id="${stray.block.id}"]`)!;
    expect(sheet).not.toBeNull();
    expect(sheet.querySelector('.block-tag')).toHaveTextContent('DJ-9');
    // The chevron names the list it opens.
    expect(within(painelB).getByRole('button', { name: 'Recolher Painel B de Cabine de Testes' }).getAttribute('aria-controls')).toContain(painelB.querySelector(':scope > .s9-eqs')!.id);
  });

  it('names the chevron, drag handle, Position box and Overflow of a painel with its local, so the first painel of two locals never reads alike (coordinator review 2026-10-13)', async () => {
    database = await seeded();
    // A second local whose first painel carries the same default name as one under the first local.
    const OTHER = id(0x41);
    const TWIN_A = id(0x42);
    const TWIN_B = id(0x43);
    const local = (await locationRow(LOCAL))!;
    const twins: LocationRow[] = [
      { ...local, id: OTHER, name: 'Geradores', order_key: 'z0' },
      { id: TWIN_A, relatorio_id: RELATORIO, parent_id: LOCAL, kind: 'painel', name: 'Painel 1', order_key: 'z1', removed_at: null },
      { id: TWIN_B, relatorio_id: RELATORIO, parent_id: OTHER, kind: 'painel', name: 'Painel 1', order_key: 'a0', removed_at: null },
    ];
    await database.entities.bulkPut(twins.map((location) => toRecord(`location:${location.id}`, location)));
    await openLocal();
    await userEvent.click(await screen.findByRole('button', { name: 'Expandir Geradores' }));
    await waitFor(() => expect(row(TWIN_B)).not.toBeNull());
    for (const [painelId, where] of [
      [TWIN_A, 'Painel 1 de Cabine de Testes'],
      [TWIN_B, 'Painel 1 de Geradores'],
    ] as const) {
      const painel = within(row(painelId));
      expect(painel.getByRole('button', { name: `Recolher ${where}` })).toHaveClass('tree-chevron');
      expect(painel.getByRole('button', { name: `Reordenar ${where}` })).toHaveClass('drag-handle');
      expect(painel.getByRole('textbox', { name: `Posição de ${where}` })).toHaveClass('pos-box');
      expect(painel.getByRole('button', { name: `Mais opções de ${where}` })).toHaveClass('overflow-trigger');
    }
    // Each name is one control on the page; the painel's own name alone names none.
    expect(screen.getAllByRole('button', { name: /^Mais opções de Painel 1/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Mais opções de Painel 1' })).toBeNull();
    // What the row shows, and its rename dialog, keep the painel's own name.
    expect(row(TWIN_B).querySelector('.s9-pnl-name')).toHaveTextContent(/^Painel 1$/);
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel 1 de Geradores' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    expect(await screen.findByRole('dialog', { name: 'Renomear Painel 1' })).toBeInTheDocument();
  });

  it('the local Overflow says "Adicionar equipamento" only when the block goes on the local itself; with colunas directly under it the item is "Adicionar bloco" and adds to its current coluna (coordinator review 2026-10-13)', async () => {
    database = await seeded({ paineis: false });
    await openLocal();
    // No coluna under the local: the palette target is the local.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toContain('Adicionar equipamento');
    expect(screen.queryByRole('menuitem', { name: 'Adicionar bloco' })).toBeNull();
    await userEvent.keyboard('{Escape}');

    // A coluna directly under it (the shape of every tree born from the standard template): the block goes into that coluna.
    const DIRECT = id(0x51);
    await database.entities.put(toRecord(`location:${DIRECT}`, { id: DIRECT, relatorio_id: RELATORIO, parent_id: LOCAL, kind: 'coluna', name: 'Coluna 9', order_key: 'a0', removed_at: null } satisfies LocationRow));
    await waitFor(() => expect(row(DIRECT)).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toContain('Adicionar bloco');
    expect(items).not.toContain('Adicionar equipamento');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Adicionar bloco' }));
    const palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine de Testes › Coluna 9')).toBeInTheDocument();
  });

  it('"Adicionar painel" creates a painel under the local, named after its siblings, opened with its note; "Desfazer" removes it', async () => {
    database = await seeded({ paineis: false });
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
      'Abrir primeira ficha (dados do local)',
      'Adicionar equipamento',
      'Adicionar painel',
      'Função e nome',
      'Remover',
    ]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Adicionar painel' }));
    expect(await screen.findByText('Painel 1 adicionado')).toBeInTheDocument();
    const [create] = await outbox();
    expect(create).toMatchObject({ kind: 'create', value: { kind: 'painel', parent_id: LOCAL, name: 'Painel 1', relatorio_id: RELATORIO, removed_at: null } });
    const painelId = create!.path.split('/')[1]!;
    await waitFor(() => expect(row(painelId)).toHaveClass('s9-painel', 'is-open'));
    expect(within(row(painelId)).getByRole('note')).toHaveClass('pnl-empty');
    await waitFor(() => expect(within(row(painelId)).getByRole('button', { name: 'Recolher Painel 1 de Cabine de Testes' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(row(painelId)).toBeNull());
    expect((await locationRow(painelId))?.removed_at).not.toBeNull();
    const ops = await outbox();
    expect(ops.map((op) => [op.path.replace(painelId, 'ID'), op.kind])).toEqual([
      ['location/ID', 'create'],
      ['location/ID/removed_at', 'remove'],
    ]);
  });

  it('the painel "Adicionar bloco" puts the block in its current coluna, and the local "Adicionar equipamento no local" on the local itself, each with the TAG of the kernel rule', async () => {
    database = await seeded();
    await openLocal();
    await userEvent.click(within(row(PAINEL)).getByRole('button', { name: 'Adicionar bloco em Painel de média tensão de Cabine de Testes' }));
    let palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    // No last sheet in this painel: its last coluna.
    expect(within(palette).getByText('Em: Cabine de Testes › Painel de média tensão › Coluna 6')).toBeInTheDocument();
    await userEvent.click([...palette.querySelectorAll<HTMLElement>('.pf-field')][2]!);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('SEC-C06 criada na Coluna 6'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar bloco' })).toBeNull());

    await userEvent.click(within(row(LOCAL)).getByRole('button', { name: 'Adicionar equipamento no local Cabine de Testes' }));
    palette = await screen.findByRole('dialog', { name: 'Adicionar bloco' });
    expect(within(palette).getByText('Em: Cabine de Testes')).toBeInTheDocument();
    await userEvent.click([...palette.querySelectorAll<HTMLElement>('.pf-field')][7]!);
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent(/^TR-\d+ criada em Cabine de Testes/));

    const blocks = (await outbox()).filter((op) => /^block\/[0-9a-f-]{36}$/.test(op.path)).map((op) => op.value as BlockRow);
    expect(blocks.map((b) => [b.block_type, b.location_id])).toEqual([
      ['chave_seccionadora', COLUNA_6],
      ['transformador_forca', LOCAL],
    ]);
  });

  it('"Função e nome" opens the Função dialog filled in and writes funcao and name in one batch; "Desfazer" restores both', async () => {
    database = await seeded({ funcao: 'primaria' });
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Função e nome' }));
    const dialog = await screen.findByRole('dialog', { name: 'Função e nome' });
    expect(within(dialog).getByRole('radio', { name: 'Primária' })).toHaveAttribute('aria-checked', 'true');
    const name = within(dialog).getByRole('textbox', { name: 'Nome' });
    expect(name).toHaveValue('Cabine de Testes');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Outra' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Qual função' }), 'Medição');
    // The name of a local being edited is its own.
    expect(name).toHaveValue('Cabine de Testes');
    await userEvent.clear(name);
    await userEvent.type(name, 'Sala de medição');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(announcer()).toHaveTextContent('Local Sala de medição atualizado'));
    expect(await screen.findByText('Local Sala de medição atualizado', { selector: '.toast, .toast *' })).toBeInTheDocument();
    await waitFor(() => expect(row(LOCAL).querySelector('.s9-loc-meta')).toHaveTextContent(/^Medição · ALVENARIA/));
    expect(row(LOCAL).querySelector('.s9-loc-name')).toHaveTextContent('Sala de medição');
    const ops = await outbox();
    expect(ops.map((op) => [op.path, op.kind, op.value])).toEqual([
      [`location/${LOCAL}/funcao`, 'put', 'Medição'],
      [`location/${LOCAL}/name`, 'put', 'Sala de medição'],
    ]);
    expect(ops[0]!.batch).not.toBeNull();
    expect(ops[0]!.batch).toBe(ops[1]!.batch);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Recolher Sala de medição' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect(await locationRow(LOCAL)).toMatchObject({ funcao: 'primaria', name: 'Cabine de Testes' }));
    await waitFor(() => expect(row(LOCAL).querySelector('.s9-loc-meta')).toHaveTextContent(/^Primária · ALVENARIA/));
    const undone = (await outbox()).slice(2);
    expect(undone.map((op) => [op.path, op.value]).sort()).toEqual([
      [`location/${LOCAL}/funcao`, 'primaria'],
      [`location/${LOCAL}/name`, 'Cabine de Testes'],
    ]);
  });

  it('a local with no Função may be renamed alone through "Função e nome": one name put, the Função untouched', async () => {
    database = await seeded();
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Função e nome' }));
    const dialog = await screen.findByRole('dialog', { name: 'Função e nome' });
    const name = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Subestação{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Local Subestação atualizado'));
    expect((await outbox()).map((op) => [op.path, op.value])).toEqual([[`location/${LOCAL}/name`, 'Subestação']]);
    expect(Object.keys((await locationRow(LOCAL))!)).not.toContain('funcao');
  });

  /** An op of another device on the local, as a pull brings it. */
  const pulledOnLocal = (n: number, kind: 'put' | 'remove', field: string, value: string | null) => ({
    op_id: id(0x900 + n),
    kind,
    scope: 'relatorio' as const,
    company_id: COMPANY,
    project_id: null,
    relatorio_id: RELATORIO,
    path: `location/${LOCAL}/${field}`,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER,
    device_id: 'tablet-escritorio',
    client_ts: `2026-10-13T12:0${n}:00.000Z`,
    seq: 90_000 + n,
  });
  const openFuncaoENome = async (localName: string) => {
    await userEvent.click(screen.getByRole('button', { name: `Mais opções de ${localName}` }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Função e nome' }));
    return screen.findByRole('dialog', { name: 'Função e nome' });
  };

  it('"Função e nome" writes only the field the user changed: a name pulled while the dialog was open stays, and a local removed meanwhile is gone', async () => {
    database = await seeded();
    await openLocal();
    let dialog = await openFuncaoENome('Cabine de Testes');
    // Another device renames the local while the dialog is open.
    await applyPulled(database, [pulledOnLocal(1, 'put', 'name', 'Subestação Norte')]);
    await waitFor(() => expect(row(LOCAL).querySelector('.s9-loc-name')).toHaveTextContent('Subestação Norte'));
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Cabine de Testes');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Transformação' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    // The Função alone is written; the name the dialog opened on is not put back.
    await waitFor(() => expect(announcer()).toHaveTextContent('Local Subestação Norte atualizado'));
    expect((await outbox()).map((op) => [op.path, op.value])).toEqual([[`location/${LOCAL}/funcao`, 'transformacao']]);
    expect(await locationRow(LOCAL)).toMatchObject({ name: 'Subestação Norte', funcao: 'transformacao' });

    // Removed on another device while the dialog is open: nothing is written, and it is said.
    dialog = await openFuncaoENome('Subestação Norte');
    await applyPulled(database, [pulledOnLocal(2, 'remove', 'removed_at', null)]);
    await waitFor(async () => expect((await locationRow(LOCAL))!.removed_at).not.toBeNull());
    const name = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Subestação Sul');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('O local mudou em outro aparelho; nada foi alterado.', { selector: '.toast, .toast *' })).toBeInTheDocument();
    expect(await outbox()).toHaveLength(1);
  });

  it('"Função e nome" with the name alone changed keeps a Função pulled while the dialog was open', async () => {
    database = await seeded();
    await applyPulled(database, [pulledOnLocal(1, 'put', 'funcao', 'primaria')]);
    await openLocal();
    const dialog = await openFuncaoENome('Cabine de Testes');
    expect(within(dialog).getByRole('radio', { name: 'Primária' })).toHaveAttribute('aria-checked', 'true');
    await applyPulled(database, [pulledOnLocal(2, 'put', 'funcao', 'entrada')]);
    await waitFor(() => expect(row(LOCAL).querySelector('.s9-loc-meta')).toHaveTextContent(/^Entrada · /));
    const name = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Subestação');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(announcer()).toHaveTextContent('Local Subestação atualizado'));
    expect((await outbox()).map((op) => [op.path, op.value])).toEqual([[`location/${LOCAL}/name`, 'Subestação']]);
    expect(await locationRow(LOCAL)).toMatchObject({ name: 'Subestação', funcao: 'entrada' });
  });

  it('renames a painel ("Painel … renomeado", masculine) and moves it by Alt+arrow, the menu and the Position box: one location op each, said, undone by "Desfazer"', async () => {
    database = await seeded();
    await openLocal();
    const order = () => [...row(LOCAL).querySelectorAll(':scope > .s9-pnls > li.s9-painel .s9-pnl-name')].map((el) => el.textContent);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel B de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Painel B' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Painel de baixa tensão{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de baixa tensão renomeado'));
    expect(await screen.findByText('Painel de baixa tensão renomeado', { selector: '.toast, .toast *' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await locationRow(PAINEL_B))!.name).toBe('Painel B'));

    // Alt+Up on the painel's chevron.
    const chevron = await within(row(PAINEL_B)).findByRole('button', { name: 'Recolher Painel B de Cabine de Testes' });
    chevron.focus();
    fireEvent.keyDown(chevron, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel B movido para a posição 1 de 2'));
    await waitFor(() => expect(order()).toEqual(['Painel B', 'Painel de média tensão']));
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(order()).toEqual(['Painel de média tensão', 'Painel B']));

    // The Overflow's "Descer" on the first painel.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel de média tensão de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão movido para a posição 2 de 2'));
    await waitFor(() => expect(order()).toEqual(['Painel B', 'Painel de média tensão']));

    // The Position box (EXPERIENCE.md: drag, Position box, Overflow menu or Alt+arrows at every level).
    const box = within(row(PAINEL)).getByRole('textbox', { name: 'Posição de Painel de média tensão de Cabine de Testes' });
    expect(box).toHaveValue('2');
    await userEvent.clear(box);
    await userEvent.type(box, '1{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão movido para a posição 1 de 2'));
    await waitFor(() => expect(order()).toEqual(['Painel de média tensão', 'Painel B']));

    const paths = (await outbox()).map((op) => [op.path.replace(/[0-9a-f-]{36}/, (m) => (m === PAINEL ? 'P' : m === PAINEL_B ? 'B' : m)), op.kind]);
    expect(paths).toEqual([
      ['location/B/name', 'put'],
      ['location/B/name', 'put'],
      ['location/B/order_key', 'put'],
      ['location/B/order_key', 'put'],
      ['location/P/order_key', 'put'],
      ['location/P/order_key', 'put'],
    ]);
    // The sheets never moved: no block op at all.
    expect((await outbox()).some((op) => op.path.startsWith('block/'))).toBe(false);
  });

  it('in a local holding painéis and colunas directly, a painel moves among the painéis and a coluna among the colunas: the total said and the one order_key put are of its own kind', async () => {
    database = await seeded();
    // A tree from before the painel level that gained painéis: two colunas directly under the
    // local, the first keyed between the two painéis ("a0" and "a1"), the second after both.
    const DIRECT_1 = id(0x31);
    const DIRECT_2 = id(0x32);
    const base = { relatorio_id: RELATORIO, removed_at: null, parent_id: LOCAL, kind: 'coluna' as const };
    const direct: LocationRow[] = [
      { ...base, id: DIRECT_1, name: 'Coluna 1', order_key: 'a0V' },
      { ...base, id: DIRECT_2, name: 'Coluna 2', order_key: 'a2' },
    ];
    await database.entities.bulkPut(direct.map((location) => toRecord(`location:${location.id}`, location)));
    await openLocal();
    const paineis = () => [...row(LOCAL).querySelectorAll(':scope > .s9-pnls > li.s9-painel > .s9-pnl-row .s9-pnl-name')].map((el) => el.textContent);
    const colunas = () => [...row(LOCAL).querySelectorAll(':scope > .s9-cols > li.s9-coluna > .s9-col .s9-col-name')].map((el) => el.textContent);
    expect(paineis()).toEqual(['Painel de média tensão', 'Painel B']);
    expect(colunas()).toEqual(['Coluna 1', 'Coluna 2']);
    expect(within(row(PAINEL_B)).getByRole('textbox', { name: 'Posição de Painel B de Cabine de Testes' })).toHaveValue('2');
    expect(within(row(DIRECT_2)).getByRole('textbox', { name: 'Posição de Coluna 2 de Cabine de Testes' })).toHaveValue('2');

    // The painel: second of two painéis, whatever the colunas between them hold.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel B de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Subir' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel B movido para a posição 1 de 2'));
    await waitFor(() => expect(paineis()).toEqual(['Painel B', 'Painel de média tensão']));
    expect(colunas()).toEqual(['Coluna 1', 'Coluna 2']);
    expect((await outbox()).map((op) => [op.path, op.kind])).toEqual([[`location/${PAINEL_B}/order_key`, 'put']]);

    // The coluna: second of two colunas.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 2 de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Subir' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 2 movida para a posição 1 de 2'));
    await waitFor(() => expect(colunas()).toEqual(['Coluna 2', 'Coluna 1']));
    expect(paineis()).toEqual(['Painel B', 'Painel de média tensão']);
    expect((await outbox()).map((op) => [op.path, op.kind])).toEqual([
      [`location/${PAINEL_B}/order_key`, 'put'],
      [`location/${DIRECT_2}/order_key`, 'put'],
    ]);
    // Each key landed among the rows of its own kind: the coluna before the other coluna, the painel before the other painel.
    expect((await locationRow(DIRECT_2))!.order_key < 'a0V').toBe(true);
    expect((await locationRow(PAINEL_B))!.order_key < 'a0').toBe(true);
  });

  it('a coluna inside a painel moves among the colunas of its own painel, with its drag handle and Position box drawn', async () => {
    database = await seeded();
    await openLocal();
    const coluna6 = row(COLUNA_6);
    expect(within(coluna6).getByRole('button', { name: 'Reordenar Coluna 6 de Painel de média tensão de Cabine de Testes' })).toHaveClass('drag-handle');
    const box = within(coluna6).getByRole('textbox', { name: 'Posição de Coluna 6 de Painel de média tensão de Cabine de Testes' });
    expect(box).toHaveValue('2');
    await userEvent.clear(box);
    await userEvent.type(box, '1{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 6 movida para a posição 1 de 2'));
    await waitFor(() => expect([...row(PAINEL).querySelectorAll(':scope > .s9-cols > li.s9-coluna .s9-col-name')].map((el) => el.textContent)).toEqual(['Coluna 6', 'Coluna 5']));
    expect((await outbox()).map((op) => op.path)).toEqual([`location/${COLUNA_6}/order_key`]);
    // A local and a painel carry both controls too.
    expect(within(row(LOCAL)).getByRole('button', { name: 'Reordenar Cabine de Testes' })).toBeInTheDocument();
    expect(within(row(LOCAL)).getByRole('textbox', { name: 'Posição de Cabine de Testes' })).toHaveValue('1');
    expect(within(row(PAINEL)).getByRole('button', { name: 'Reordenar Painel de média tensão de Cabine de Testes' })).toBeInTheDocument();
  });

  it('"Adicionar local" at the foot asks the Função and the name and creates the cabine row with both', async () => {
    database = await seeded();
    await openLocal();
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar local' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar local' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Transformação' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar local' }));
    expect(await screen.findByText('Cabine de transformação adicionada')).toBeInTheDocument();
    const [create] = await outbox();
    expect(create).toMatchObject({ kind: 'create', value: { kind: 'cabine', parent_id: null, name: 'Cabine de transformação', funcao: 'transformacao', agrupar_por_tipo: false } });
    const localId = create!.path.split('/')[1]!;
    await waitFor(() => expect(row(localId).querySelector('.s9-loc-meta')).toHaveTextContent('Transformação · sem painéis'));
    // A local with nothing under it takes equipment itself: no "Adicionar coluna" is offered.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de transformação' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Adicionar equipamento', 'Adicionar painel', 'Função e nome', 'Subir', 'Remover']);
  });
});

describe('14.2 relatório tree: three levels (rail presentation)', () => {
  it('draws local, painel, coluna and sheet rows at levels 0 to 3, each with the kernel meta line', async () => {
    database = await seeded({ funcao: 'primaria' });
    const { container } = renderAt(`/relatorio/${RELATORIO}/arvore`);
    const rail = await screen.findByRole('list', { name: 'Árvore do relatório' });
    await userEvent.click(await within(rail).findByRole('button', { name: 'Expandir Cabine de Testes' }));
    const rows = () => [...container.querySelectorAll<HTMLElement>('.relatorio-tree .tree-row')].map((el) => [el.querySelector('.tree-body > span')?.textContent, el.dataset.level, el.querySelector('.tree-meta')?.textContent]);
    await waitFor(() => expect(rows().some(([name]) => name === 'Coluna 5')).toBe(true));
    expect(rows()).toEqual([
      ['Cabine de Testes', '0', 'Local · Primária · 2 painéis · 1 de 4 fichas'],
      ['Chave seccionadora', '1', expect.stringMatching(/^SEC-TEST/)],
      ['Disjuntor MT', '1', expect.stringMatching(/^DJ-TEST/)],
      ['Transformador de força', '1', expect.stringMatching(/^TR-TEST/)],
      ['Painel de média tensão', '1', 'Painel · 2 colunas · 0 de 1'],
      ['Coluna 5', '2', '0 de 1'],
      ['Chave seccionadora', '3', 'SEC-C05'],
      ['Coluna 6', '2', '0 de 0'],
      ['Painel B', '1', 'Painel · sem colunas'],
    ]);
    // The rail edits nothing: no handle, no Position box, and only the local carries a menu.
    expect(rail.querySelector('.pos-box, .drag-handle')).toBeNull();
    expect(within(rail).queryByRole('button', { name: 'Mais opções de Painel de média tensão de Cabine de Testes' })).toBeNull();
    expect(within(rail).getByRole('button', { name: 'Mais opções de Cabine de Testes' })).toBeInTheDocument();
  });
});
