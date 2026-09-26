import 'fake-indexeddb/auto';
import { instantiateTemplate, newEquipmentBlock, standardTemplate, type BlockRow, type EquipmentRow, type LocationRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { act, configure, render, screen, waitFor, within } from '@testing-library/react';
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
import { SETTLE_TIMEOUT_MS } from './relatorio-editor.ts';
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

// E3-A4: one of three parts of the tree suite, split so they run in parallel (drawing, keys, Overflow, moves; the rail).

describe('4.4 location tree (Sumário presentation)', () => {
  it('draws cabine › coluna › equipment rows with meta, counters, glyphs (aria-hidden) and state words', async () => {
    database = await seeded();
    const { container } = renderAt(`/relatorio/${RELATORIO}`);
    const list = await screen.findByRole('list', { name: 'Locais do relatório' });
    const cabines = [...list.querySelectorAll<HTMLElement>(':scope > li.s9-cabine')];
    expect(cabines.map((li) => li.querySelector('.s9-cab-name')?.textContent)).toEqual(['Cabine de Testes', 'Cabine Vazia']);
    expect(cabines[0]!.querySelector('.s9-cab-meta')).toHaveTextContent('ALVENARIA - CONVENCIONAL · 13,8 kV · 20 °C · 60 %');
    expect(cabines[0]!.querySelector('.progress-counter')).toHaveTextContent('1 de 4');
    expect(cabines[1]!.querySelector('.progress-counter')).toHaveTextContent('0 de 0');
    // Collapsed: no children drawn.
    const chevron = within(cabines[0]!).getByRole('button', { name: 'Expandir Cabine de Testes' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    expect(cabines[0]!.querySelector('.s9-eqs')).toBeNull();

    await userEvent.click(chevron);
    expect(within(cabines[0]!).getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveAttribute('aria-expanded', 'true');
    expect(tags(cabines[0]!)).toEqual(['SEC-TEST', 'DJ-TEST', 'TR-TEST']);
    // The coluna opens with its cabine.
    const coluna = cabines[0]!.querySelector<HTMLElement>('li.s9-coluna')!;
    expect(coluna).toHaveClass('is-open');
    expect(coluna.querySelector('.s9-col-name')).toHaveTextContent('Coluna 1');
    expect(coluna.querySelector('.s9-col-meta')).toHaveTextContent('0 de 1');
    expect(tags(coluna)).toEqual(['SEC-C01']);

    const state = (blockId: string) => eqRow(blockId).querySelector('.s9-state')!;
    expect(state(SEC_TEST)).toHaveAttribute('data-state', 'doing');
    expect(state(SEC_TEST)).toHaveTextContent('● Em preenchimento');
    expect(state(DJ_TEST)).toHaveAttribute('data-state', 'nao-ensaiada');
    expect(state(DJ_TEST)).toHaveTextContent('⊘ Não ensaiada · Solicitação do cliente');
    expect(state(SEC_C01)).toHaveAttribute('data-state', 'empty');
    expect(state(SEC_C01)).toHaveTextContent('○ Vazia');
    for (const blockId of [SEC_TEST, DJ_TEST, SEC_C01]) expect(state(blockId).querySelector('[aria-hidden="true"]')?.textContent).toMatch(/^[✓●○⊘]$/);
    expect(eqRow(SEC_TEST).querySelector('.s9-eq-name')).toHaveTextContent('Chave seccionadora');
    // "Adicionar bloco em ⟨cabine⟩" under the open cabine; "Adicionar cabine" at the foot.
    expect(within(cabines[0]!).getByRole('button', { name: 'Adicionar bloco em Cabine de Testes' })).toHaveClass('s9-add');
    expect(screen.getByRole('button', { name: 'Adicionar cabine' })).toBeInTheDocument();
    // "Mover para…" is never drawn.
    expect(screen.queryByText(/Mover para/)).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Left/Right expand and collapse; Left on a leaf or a collapsed node goes to the parent chevron; the Position box keeps its arrows', async () => {
    database = await seeded();
    renderAt(`/relatorio/${RELATORIO}`);
    const chevron = await screen.findByRole('button', { name: 'Expandir Cabine de Testes' });
    chevron.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(chevron).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(chevron).toHaveAttribute('aria-expanded', 'false'));
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(eqRow(SEC_C01)).not.toBeNull());
    // Left on an equipment row's body goes to its coluna's chevron; Left there collapses it,
    // Left again (collapsed) goes to the cabine's chevron.
    const open = eqRow(SEC_C01).querySelector<HTMLElement>('.s9-eq-open')!;
    open.focus();
    await userEvent.keyboard('{ArrowLeft}');
    const colChevron = screen.getByRole('button', { name: 'Recolher Coluna 1' });
    expect(colChevron).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(colChevron).toHaveAttribute('aria-expanded', 'false'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveFocus();
    // Inside the Position box the arrows move the caret only.
    const box = within(eqRow(SEC_TEST)).getByRole('textbox', { name: 'Posição de SEC-TEST' });
    box.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(box).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers the Overflow per row kind; "Abrir primeira ficha" is absent on a cabine with no equipment and opens the sheet', async () => {
    database = await seeded();
    await openCabine();
    const itemsOf = async (trigger: string) => {
      await userEvent.click(screen.getByRole('button', { name: trigger }));
      const menu = await screen.findByRole('menu');
      const labels = [...menu.querySelectorAll('[role^="menuitem"]')].map((item) => item.textContent);
      await userEvent.keyboard('{Escape}');
      return labels;
    };
    expect(await itemsOf('Mais opções de Cabine de Testes')).toEqual([
      'Abrir primeira ficha (dados da cabine)',
      'Agrupar por tipo na seção 9',
      'Adicionar bloco',
      'Adicionar coluna',
      'Renomear',
      'Descer',
    ]);
    expect(await itemsOf('Mais opções de Cabine Vazia')).toEqual(['Agrupar por tipo na seção 9', 'Adicionar bloco', 'Adicionar coluna', 'Renomear', 'Subir']);
    expect(await itemsOf('Mais opções de Coluna 1')).toEqual(['Adicionar bloco', 'Renomear']);
    expect(await itemsOf('Mais opções de DJ-TEST')).toEqual(['Adicionar abaixo', 'Subir', 'Descer', 'Duplicar', 'Renomear TAG', 'Remover']);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Abrir primeira ficha (dados da cabine)' }));
    // Story 5.1: the cabine's first sheet opens, and it is the last sheet worked on here.
    expect(await screen.findByTestId('ficha-probe')).toHaveTextContent(SEC_TEST);
    await waitFor(async () => expect((await database!.local_prefs.get(LAST_SHEET_PREF(RELATORIO)))?.value).toBe(SEC_TEST));
    act(() => void go!(`/relatorio/${RELATORIO}`));
    await waitFor(() => expect(eqRow(SEC_TEST)).toHaveAttribute('aria-current', 'true'));
    expect(within(eqRow(SEC_TEST)).getByText('você parou aqui')).toHaveClass('sum-here');
  });

  it('"Agrupar por tipo" is a menuitemcheckbox writing location/{id}/agrupar_por_tipo, announced, and the meta follows', async () => {
    database = await seeded();
    renderAt(`/relatorio/${RELATORIO}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    const toggle = await screen.findByRole('menuitemcheckbox', { name: 'Agrupar por tipo na seção 9' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(announcer()).toHaveTextContent('Agrupar por tipo ativado em Cabine de Testes'));
    expect(await outbox()).toEqual([expect.objectContaining({ path: `location/${CABINE}/agrupar_por_tipo`, kind: 'put', value: true, scope: 'relatorio' })]);
    await waitFor(() => expect(tree().querySelector('.s9-cab-meta')).toHaveTextContent('agrupar por tipo'));
  });

  it('moves a block by Position box (clamped), Alt+Arrow and Overflow, one order_key op each, announced with Desfazer', async () => {
    database = await seeded();
    await openCabine();
    const box = within(eqRow(SEC_TEST)).getByRole('textbox', { name: 'Posição de SEC-TEST' });
    await userEvent.clear(box);
    await userEvent.type(box, '9{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('SEC-TEST movido para a posição 3 de 3'));
    await waitFor(() => expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['DJ-TEST', 'TR-TEST', 'SEC-TEST']));
    await waitFor(() => expect(document.querySelector('.toast')).toHaveTextContent('SEC-TEST movido para a posição 3 de 3'));
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument();
    let ops = await outbox();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ path: `block/${SEC_TEST}/order_key`, kind: 'put' });
    // An empty or non-numeric box is no move.
    const box2 = within(eqRow(DJ_TEST)).getByRole('textbox', { name: 'Posição de DJ-TEST' });
    await userEvent.clear(box2);
    await userEvent.type(box2, 'x{Enter}');
    expect(await outbox()).toHaveLength(1);
    // Alt+ArrowUp on SEC-TEST's row.
    eqRow(SEC_TEST).querySelector<HTMLElement>('.s9-eq-open')!.focus();
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await waitFor(() => expect(announcer()).toHaveTextContent('SEC-TEST movido para a posição 2 de 3'));
    // Overflow "Descer" on DJ-TEST.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de DJ-TEST' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('DJ-TEST movido para a posição 2 de 3'));
    ops = await outbox();
    expect(ops).toHaveLength(3);
    expect(ops.every((op) => op.path.endsWith('/order_key'))).toBe(true);
    // Every block keeps its location.
    expect(ops.some((op) => op.path.includes('location_id'))).toBe(false);
  });

  it('Q7: a move is announced, with its toast, in the render that draws it, well before the settle fallback', async () => {
    database = await seeded();
    await openCabine();
    eqRow(SEC_TEST).querySelector<HTMLElement>('.s9-eq-open')!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await waitFor(() => expect(announcer()).toHaveTextContent('SEC-TEST movido para a posição 2 de 3'), { timeout: SETTLE_TIMEOUT_MS / 2 });
    expect(tags(tree().querySelector('li.s9-cabine')!)).toEqual(['DJ-TEST', 'SEC-TEST', 'TR-TEST']);
    expect(document.querySelector('.toast')).toHaveTextContent('SEC-TEST movido para a posição 2 de 3');
  });

});

describe('4.4 rail presentation (/relatorio/:id/arvore)', () => {
  it('lists cabines and fichas, marks the last sheet aria-current, and the strip opens and collapses the rail', async () => {
    database = await seeded();
    await database.local_prefs.put({ key: LAST_SHEET_PREF(RELATORIO), value: DJ_TEST });
    const { container } = renderAt(`/relatorio/${RELATORIO}/arvore`);
    const rail = await screen.findByRole('list', { name: 'Árvore do relatório' });
    expect(rail).toHaveClass('relatorio-tree');
    expect(container.querySelector('.rail-head')).toHaveTextContent('Árvore do relatório · 4 blocos');
    // The path to the last sheet opens; its row is selected.
    const current = await waitFor(() => {
      const row = container.querySelector<HTMLElement>('.tree-row.is-selected');
      expect(row).not.toBeNull();
      return row!;
    });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveTextContent('DJ-TEST');
    expect(current.querySelector('.tree-state')).toHaveAttribute('data-state', 'nao-ensaiada');
    expect(current.querySelector('.tree-state [aria-hidden="true"]')).toHaveTextContent('⊘');
    // No sections, no Position box, no drag handle, no equipment Overflow.
    expect(rail.querySelector('.pos-box, .drag-handle')).toBeNull();
    expect(within(rail).queryByRole('button', { name: 'Mais opções de DJ-TEST' })).toBeNull();
    expect(rail.textContent).not.toContain('Objetivo');
    await userEvent.click(within(rail).getByRole('button', { name: 'Mais opções de Cabine de Testes' }));
    const menu = await screen.findByRole('menu');
    expect([...menu.querySelectorAll('[role^="menuitem"]')].map((i) => i.textContent)).toEqual(['Abrir primeira ficha (dados da cabine)', 'Agrupar por tipo na seção 9']);
    await userEvent.keyboard('{Escape}');

    const body = container.querySelector('.arvore-body')!;
    expect(body).toHaveAttribute('data-rail', 'auto');
    const strip = screen.getByRole('complementary', { name: 'Árvore do relatório (recolhida)' });
    const toggle = within(strip).getByRole('button', { name: 'Abrir árvore do relatório' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(strip).getByText('Árvore do relatório')).toHaveClass('rail-vlabel');
    await userEvent.click(toggle);
    expect(body).toHaveAttribute('data-rail', 'open');
    await userEvent.click(screen.getByRole('button', { name: 'Recolher árvore' }));
    expect(body).toHaveAttribute('data-rail', 'closed');
    await waitFor(() => expect(toggle).toHaveFocus());
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Left/Right on the rail expand, collapse and go to the parent chevron; a location with nothing below has no chevron control', async () => {
    database = await seeded();
    renderAt(`/relatorio/${RELATORIO}/arvore`);
    const rail = await screen.findByRole('list', { name: 'Árvore do relatório' });
    const chevron = within(rail).getByRole('button', { name: 'Expandir Cabine de Testes' });
    expect(within(rail).queryByRole('button', { name: /^(Expandir|Recolher) Cabine Vazia$/ })).toBeNull();
    expect(rail.querySelector('li[data-location-id] span.tree-chevron[aria-hidden="true"]')).not.toBeNull();
    chevron.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(chevron).toHaveAttribute('aria-expanded', 'true'));
    const body = rail.querySelector<HTMLElement>(`li[data-block-id="${SEC_TEST}"] [data-tree-open]`)!;
    body.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(within(rail).getByRole('button', { name: 'Recolher Cabine de Testes' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(within(rail).getByRole('button', { name: 'Expandir Cabine de Testes' })).toHaveAttribute('aria-expanded', 'false'));
    expect(rail.querySelector(`li[data-block-id="${SEC_TEST}"]`)).toBeNull();
  });
});
