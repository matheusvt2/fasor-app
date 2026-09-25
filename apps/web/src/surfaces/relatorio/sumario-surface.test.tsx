import 'fake-indexeddb/auto';
import { instantiateTemplate, standardTemplate, type BlockRow, type LocationRow, type RelatorioRow, type SumarioRow } from '@app/domain';
import { portoSeguroSmall } from '@app/domain/fixtures/porto-seguro/small';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { LAST_SHEET_PREF, openDatabase, type AppDatabase } from '../../db/schema.ts';
import { applyPulled } from '../../db/sync-store.ts';
import { BackTargetProvider } from '../../state/back-target.tsx';
import { BannerSlot } from '../../state/banner-slot.tsx';
import { ExtraBannerProvider, useExtraBannerValue } from '../../state/extra-banner.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { GenerateAction } from './generate-action.tsx';
import { SETTLE_TIMEOUT_MS } from './relatorio-editor.ts';
import { RowBody } from './sumario-row.tsx';
import { SumarioSurface } from './sumario-surface.tsx';

/*
 * Story 4.3: the Sumário over the small Porto Seguro fixture loaded through `applyPulled`,
 * plus the eleven section blocks a relatório born from the template carries (the fixture
 * predates them). Thirteen rows, every title and meta the kernel's, the Overflow per row
 * kind, one `order_key` op per move, announced and undoable.
 */

const COMPANY = portoSeguroSmall.companyId;
const USER = portoSeguroSmall.userId;
const RELATORIO = portoSeguroSmall.relatorioId;

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

const syncRelatorio = vi.fn(async () => 'ran' as const);

const syncState = (over: Partial<SyncState> = {}): SyncState =>
  makeSyncState({ syncRelatorio, generate: vi.fn(async () => ({ outcome: 'queued' as const, job_id: 'job', revision_number: 1 })), ...over });

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966c1-000b-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

/** The eleven section blocks of a relatório born from the standard template, retargeted at the fixture's relatório. */
function sectionBlocksFor(relatorioId: string): BlockRow[] {
  let n = 0;
  const newId = () => `019966c1-000c-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const { drafts } = instantiateTemplate(
    standardTemplate({ id: '019966c1-000d-7000-8000-000000000001' }),
    { id: portoSeguroSmall.projectId },
    { service_start: null, service_end: null, existingEquipment: [], responsible_user_id: null },
    { newId, actorId: USER, companyId: COMPANY },
  );
  return drafts
    .filter((d) => d.path.startsWith('block/'))
    .map((d) => d.value as unknown as BlockRow)
    .filter((b) => b.location_id === null)
    .map((b) => ({ ...b, relatorio_id: relatorioId, created_by: USER }));
}

async function seeded(): Promise<AppDatabase> {
  const db = await freshDb();
  await applyPulled(db, portoSeguroSmall.log);
  await db.entities.bulkPut(sectionBlocksFor(RELATORIO).map((b) => toRecord(`block:${b.id}`, b)));
  return db;
}

/** The setup route, as far as this test needs it: which Etapa the address asks for. */
function SetupProbe() {
  const [params] = useSearchParams();
  return <p data-testid="setup-route">Setup {params.get('etapa')}</p>;
}

/** Stands in for `AppShell`'s one banner slot, which a route cannot render itself (`extra-banner.tsx`). */
function BannerSlotProbe() {
  const banner = useExtraBannerValue();
  return <BannerSlot banners={banner === null ? [] : [banner]} />;
}

/** The tree the surface renders for `id` under `sync`; `rerender` swaps the sync state in place. */
function tree(id: string, sync: SyncState, state: unknown = null) {
  return (
    <MemoryRouter initialEntries={[{ pathname: `/relatorio/${id}`, state }]}>
      <SyncContext value={sync}>
        <ToastProvider>
          <BackTargetProvider>
            <ExtraBannerProvider>
              <BannerSlotProbe />
              <Routes>
                <Route path="/relatorio/:id" element={<SumarioSurface />} />
                <Route path="/relatorio/:id/setup" element={<SetupProbe />} />
                <Route path="/relatorio/:id/secao/:blockId" element={<p data-testid="secao-route">Seção</p>} />
              </Routes>
              <ToastOutlet />
            </ExtraBannerProvider>
          </BackTargetProvider>
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>
  );
}

function renderSumario(id = RELATORIO, sync = syncState(), state: unknown = null) {
  return render(tree(id, sync, state));
}

const list = () => screen.getByRole('list', { name: 'Sumário do relatório' });
/** The Sumário's own rows: section 9's tree nests its own `li`s when open. */
const rows = () => [...list().querySelectorAll<HTMLElement>(':scope > li')];
const titles = async () => {
  const items = rows();
  return items.map((li) => li.querySelector('.sum-title')?.textContent);
};

afterEach(() => {
  database?.close();
  database = null;
  syncRelatorio.mockClear();
});

describe('4.3 SumarioSurface', () => {
  it('lists the 13 rows in FO.SERV-03 order with the kernel titles, metas and notes', async () => {
    database = await seeded();
    const { container } = renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(await titles()).toEqual([
      'Capa e dados do relatório',
      'Controle do documento',
      'Objetivo',
      'Definições',
      'Limite de escopo',
      'Requisitos básicos',
      'Recomendações gerais (NR-10)',
      'Verificações e ensaios aplicáveis',
      'Registro fotográfico',
      'Pontos de atenção',
      'Relatórios dos ensaios',
      'Conclusão e parecer',
      'Certificados',
    ]);
    const [capa, controle, ...numbered] = rows();
    expect(capa!.querySelector('.sum-ro')).toHaveTextContent('sempre no início');
    expect(controle!.querySelector('.sum-ro')).toHaveTextContent('montado sozinho');
    expect(capa!.querySelector('.pos-box')).toBeNull();
    expect(controle!.querySelector('.overflow-trigger')).toBeNull();
    expect(numbered.map((li) => (li.querySelector('.pos-box') as HTMLInputElement).value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(within(numbered[1]!).getByRole('textbox', { name: 'Número de Definições — digite outro para mover' })).toHaveClass('pos-box', 'sum-pos');
    // The fixture's three sheets: one not tested (counts as concluded), two in progress.
    expect(numbered[8]!.querySelector('.sum-status')).toHaveTextContent('1 de 3 · 1 não ensaiada');
    expect(numbered[8]!).toHaveClass('has-pend');
    expect(numbered[1]!.querySelector('.sum-status')).toHaveTextContent('texto padrão');
    expect(numbered[0]!.querySelector('.sum-status')).toHaveTextContent('editado em Dados do relatório › Etapa 2');
    expect(container.querySelector('.sum-status.is-blocking')).toBeNull();
    // The header counts and the foot reason.
    const summary = screen.getByRole('group', { name: 'Resumo do relatório' });
    expect(within(summary).getAllByRole('button').map((b) => b.textContent)).toEqual(['1 de 3 fichas concluídas', '0 NC abertos', '1 não ensaiada', '0 sugestões por confirmar']);
    expect(capa!.querySelector('.sum-status')).toHaveTextContent('Fim da parada em branco');
    expect(screen.getByText('Nada impede gerar.')).toHaveClass('btn-reason');
    expect(screen.getByRole('button', { name: 'Pré-visualizar' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Gerar relatório' })).toHaveAccessibleDescription('Nada impede gerar.');
    expect(screen.getByRole('button', { name: 'Mais opções do relatório' })).toBeVisible();
    expect(container.querySelector('.sheet-title')).toHaveTextContent('Cliente de Testes Ltda · Local de Testes');
    expect(container.querySelector('.sheet-meta')).toHaveTextContent('Em campo 06/09/2026');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers the Overflow per row kind and opens rows 1/3 on the setup and row 2 on the section text', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Definições' }));
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Adicionar abaixo', 'Subir', 'Descer', 'Duplicar', 'Remover']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Registro fotográfico' }));
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Subir', 'Descer']);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Objetivo' }));
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Adicionar abaixo', 'Descer', 'Duplicar', 'Remover']);
    await userEvent.keyboard('{Escape}');
    // Rows 7, 8, 10 and 11 have no `.sum-open` button; 1 and 3 open the setup, 2 the text.
    const [, , r1, , , , , , r7, r8, , r10, r11] = rows();
    for (const li of [r7, r8, r10, r11]) expect(li!.querySelector('button.sum-open')).toBeNull();
    await userEvent.click(within(r1!).getByRole('button', { name: /^Objetivo/ }));
    expect(await screen.findByTestId('setup-route')).toHaveTextContent('Setup 2');
    cleanup();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    await userEvent.click(within(rows()[3]!).getByRole('button', { name: /^Definições/ }));
    expect(await screen.findByTestId('secao-route')).toBeVisible();
  });

  it('"Capa e dados do relatório" opens the setup at Etapa 1; "Controle do documento" opens nothing', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const [capa, controle] = rows();
    expect(controle!.querySelector('button.sum-open')).toBeNull();
    await userEvent.click(within(capa!).getByRole('button', { name: /^Capa e dados do relatório/ }));
    expect(await screen.findByTestId('setup-route')).toHaveTextContent('Setup 1');
  });

  it('a Position box move writes one order_key op, renumbers, announces and offers Desfazer', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const box = screen.getByRole('textbox', { name: 'Número de Definições — digite outro para mover' });
    await userEvent.click(box);
    await userEvent.keyboard('{Control>}a{/Control}4{Enter}');
    await waitFor(async () => expect((await titles()).slice(2, 6)).toEqual(['Objetivo', 'Limite de escopo', 'Requisitos básicos', 'Definições']));
    await waitFor(() => expect(screen.getByTestId('sumario-announcer')).toHaveTextContent('Seção 2 movida para a posição 4 de 11'));
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.path)).toHaveLength(1);
    expect(ops[0]!.path).toMatch(/^block\/[0-9a-f-]{36}\/order_key$/);
    expect(rows().slice(2).map((li) => (li.querySelector('.pos-box') as HTMLInputElement).value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(await screen.findByText('Definições movida — numeração refeita')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await titles()).slice(2, 4)).toEqual(['Objetivo', 'Definições']));
    // E3-A8: the toast is gone, so the row that came back takes the focus, on its Position box.
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Número de Definições — digite outro para mover' })).toHaveFocus());
  });

  it('Q7: a section move is announced, with its toast, in the render that draws it, well before the settle fallback', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const box = screen.getByRole('textbox', { name: 'Número de Definições — digite outro para mover' });
    await userEvent.click(box);
    await userEvent.keyboard('{Control>}a{/Control}4{Enter}');
    await waitFor(() => expect(screen.getByTestId('sumario-announcer')).toHaveTextContent('Seção 2 movida para a posição 4 de 11'), { timeout: SETTLE_TIMEOUT_MS / 2 });
    expect((await titles()).slice(2, 6)).toEqual(['Objetivo', 'Limite de escopo', 'Requisitos básicos', 'Definições']);
    expect(screen.getByText('Definições movida — numeração refeita')).toBeVisible();
  });

  it('Remover tombstones the row, moves the focus to the row now in its slot and "Restaurar ficha removida" brings it back', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Recomendações gerais (NR-10)' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(() => expect(rows()).toHaveLength(12));
    expect(await screen.findByText('Seção removida deste relatório — numeração refeita')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de Verificações e ensaios aplicáveis' })).toHaveFocus());
    expect((rows()[6]!.querySelector('.pos-box') as HTMLInputElement).value).toBe('5');
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.kind)).toEqual(['remove']);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar ficha removida' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restaurar ficha removida' });
    expect(within(dialog).getByText('5 Recomendações gerais (NR-10)')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restaurar 5 Recomendações gerais (NR-10)' }));
    await waitFor(() => expect(rows()).toHaveLength(13));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de Recomendações gerais (NR-10)' })).toHaveFocus());
  });

  it('Em campo opens section 9 expanded on the path to the last sheet, scrolled once to its row; Rascunho opens it collapsed', async () => {
    database = await seeded();
    const chaveBlockId = portoSeguroSmall.log.find((op) => op.path.startsWith('block/'))!.path.split('/')[1]!;
    await database.local_prefs.put({ key: LAST_SHEET_PREF(RELATORIO), value: chaveBlockId });
    // jsdom has no `scrollIntoView`; the tree must call it on the last sheet's row, once.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    // The fixture is Em campo: section 9 opens expanded, on the cabine of the last sheet.
    expect(container.querySelector('.sumario')).not.toHaveClass('is-review');
    expect(container.querySelector('.sum-s9')).toHaveClass('is-open');
    const chevron = screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' });
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Organizados por local aqui; no documento, agrupados como no FO.SERV-03.')).toHaveClass('s9-note');
    const tree = screen.getByRole('list', { name: 'Locais do relatório' });
    const cabines = () => [...tree.querySelectorAll<HTMLElement>(':scope > li.s9-cabine')];
    expect(cabines()).toHaveLength(1);
    // The last-sheet pref is its own live query and lands a tick after the rows; the path to
    // it opens and its row says "você parou aqui".
    await waitFor(() => expect(cabines()[0]).toHaveClass('is-current'));
    await waitFor(() => expect(cabines()[0]).toHaveClass('is-open'));
    const here = await within(tree).findByText('você parou aqui');
    expect(here).toHaveClass('sum-here');
    const current = here.closest('li')!;
    expect(current).toHaveClass('s9-eq', 'is-current');
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(current).toHaveAttribute('data-block-id', chaveBlockId);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(scrollIntoView.mock.instances[0]).toBe(current);
    expect(cabines()[0]!.querySelector('.s9-cab-row .progress-counter')).toHaveTextContent('1 de 3');
    expect(cabines()[0]!.querySelector('.s9-cab-name')).toHaveTextContent('Cabine de Testes');
    // The chevron collapses it; a header count opens it again and moves the focus to the chevron.
    await userEvent.click(chevron);
    expect(container.querySelector('.sum-s9')).not.toHaveClass('is-open');
    expect(chevron).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', { name: '1 de 3 fichas concluídas' }));
    await waitFor(() => expect(container.querySelector('.sum-s9')).toHaveClass('is-open'));
    await waitFor(() => expect(chevron).toHaveFocus());
    cleanup();

    // The same relatório in Rascunho opens collapsed.
    const record = (await database.entities.get(['relatorio', RELATORIO]))!;
    await database.entities.put({ ...record, row: { ...(record.row as { status: string }), status: 'rascunho' } as never });
    const second = renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(second.container.querySelector('.sum-s9')).not.toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' })).toHaveAttribute('aria-expanded', 'false');
    // Opened collapsed: nothing scrolls, not even after an expand by hand; the cabine stays
    // collapsed and says "você parou aqui" for its row.
    await userEvent.click(screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' }));
    await waitFor(() => expect(second.container.querySelector('.s9-cabine.is-current')).not.toBeNull());
    expect(second.container.querySelector('.s9-cabine.is-current')).not.toHaveClass('is-open');
    expect(second.container.querySelector('.s9-cabine.is-current .s9-cab-name .sum-here')).toHaveTextContent('você parou aqui');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // @ts-expect-error jsdom's Element has no scrollIntoView; the mock above added it.
    delete Element.prototype.scrollIntoView;
  });

  it('12.2: arriving with openSection9 and focusBlockId opens section 9 on a Rascunho relatório and focuses that sheet\'s row', async () => {
    database = await seeded();
    const record = (await database.entities.get(['relatorio', RELATORIO]))!;
    await database.entities.put({ ...record, row: { ...(record.row as { status: string }), status: 'rascunho' } as never });
    const chaveBlockId = portoSeguroSmall.log.find((op) => op.path.startsWith('block/'))!.path.split('/')[1]!;
    const { container } = renderSumario(RELATORIO, syncState(), { openSection9: true, focusBlockId: chaveBlockId });
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(container.querySelector('.sum-s9')).toHaveClass('is-open');
    expect(screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' })).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(container.querySelector(`li.s9-eq[data-block-id="${chaveBlockId}"] [data-tree-open]`)).toHaveFocus());
  });

  it('"Desfazer" after Remover brings the row back and hands the focus to its Overflow trigger', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Recomendações gerais (NR-10)' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await waitFor(() => expect(rows()).toHaveLength(12));
    expect(await screen.findByText('Seção removida deste relatório — numeração refeita')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect((await titles())[6]).toBe('Recomendações gerais (NR-10)');
    expect((rows()[6]!.querySelector('.pos-box') as HTMLInputElement).value).toBe('5');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de Recomendações gerais (NR-10)' })).toHaveFocus());
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.kind)).toEqual(['remove', 'put']);
  });

  it('Em revisão draws the list read-only (`is-review`) and opens section 9 collapsed', async () => {
    database = await seeded();
    const record = (await database.entities.get(['relatorio', RELATORIO]))!;
    await database.entities.put({ ...record, row: { ...(record.row as { status: string }), status: 'em_revisao' } as never });
    const { container } = renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(container.querySelector('ol.sumario')).toHaveClass('is-review');
    expect(screen.getByRole('button', { name: 'Expandir ou recolher a seção 9' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('marks the parent cabine, and only it, when the last sheet sits in one of its colunas', async () => {
    database = await seeded();
    const cabineId = portoSeguroSmall.log.find((op) => op.path.startsWith('location/'))!.path.split('/')[1]!;
    const chaveBlockId = portoSeguroSmall.log.find((op) => op.path.startsWith('block/'))!.path.split('/')[1]!;
    const cabine = (await database.entities.get(['location', cabineId]))!.row as LocationRow;
    const COLUNA = '019966c1-000f-7000-8000-000000000001';
    const OTHER_CABINE = '019966c1-000f-7000-8000-000000000002';
    const coluna: LocationRow = { id: COLUNA, relatorio_id: RELATORIO, parent_id: cabineId, kind: 'coluna', name: 'Coluna 1', order_key: 'a0', removed_at: null };
    const other: LocationRow = { ...cabine, id: OTHER_CABINE, name: 'Cabine Dois', order_key: 'a1' };
    const chave = (await database.entities.get(['block', chaveBlockId]))!.row as BlockRow;
    await database.entities.bulkPut([
      toRecord(`location:${COLUNA}`, coluna),
      toRecord(`location:${OTHER_CABINE}`, other),
      toRecord(`block:${chaveBlockId}`, { ...chave, location_id: COLUNA }),
    ]);
    await database.local_prefs.put({ key: LAST_SHEET_PREF(RELATORIO), value: chaveBlockId });
    const { container } = renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const tree = screen.getByRole('list', { name: 'Locais do relatório' });
    expect(tree.querySelectorAll(':scope > li.s9-cabine')).toHaveLength(2);
    await waitFor(() => expect(container.querySelectorAll('.s9-cabine.is-current')).toHaveLength(1));
    expect(container.querySelector('.s9-cabine.is-current')).toHaveAttribute('data-location-id', cabineId);
    // The path opens down to the coluna, whose row holds the last sheet.
    await waitFor(() => expect(tree.querySelector('li.s9-eq.is-current')).not.toBeNull());
    const here = within(tree.querySelector<HTMLElement>('li.s9-eq.is-current')!).getByText('você parou aqui');
    expect(here.closest('li')).toHaveAttribute('data-block-id', chaveBlockId);
    expect(here.closest('li.s9-coluna')).toHaveAttribute('data-location-id', COLUNA);
    expect(here.closest('li.s9-cabine')).toHaveAttribute('data-location-id', cabineId);
  });

  it('"Restaurar ficha removida" names a removed sheet by its TAG and gives every Restaurar its own name', async () => {
    database = await seeded();
    const chaveBlockId = portoSeguroSmall.log.find((op) => op.path.startsWith('block/'))!.path.split('/')[1]!;
    const chave = (await database.entities.get(['block', chaveBlockId]))!.row as BlockRow;
    const section = sectionBlocksFor(RELATORIO).find((b) => b.block_type === 'section_5')!;
    await database.entities.bulkPut([
      toRecord(`block:${section.id}`, { ...section, removed_at: '2026-09-07T10:00:00.000Z' }),
      toRecord(`block:${chaveBlockId}`, { ...chave, removed_at: '2026-09-07T11:00:00.000Z' }),
    ]);
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(12));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar ficha removida' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restaurar ficha removida' });
    expect(within(dialog).getAllByRole('listitem').map((li) => li.querySelector('.rr-primary')?.textContent)).toEqual(['SEC-TEST', '5 Recomendações gerais (NR-10)']);
    // F-5: the sheet names where it was, and every Restaurar has a name of its own.
    expect(within(dialog).getAllByRole('listitem')[0]!.querySelector('.rr-secondary')).toHaveTextContent('Cabine de Testes');
    expect(within(dialog).getAllByRole('button', { name: /^Restaurar / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Restaurar SEC-TEST — Cabine de Testes',
      'Restaurar 5 Recomendações gerais (NR-10)',
    ]);
    expect(within(dialog).getByRole('button', { name: 'Restaurar SEC-TEST — Cabine de Testes' })).toHaveTextContent('Restaurar');
  });

  it('a blocking row draws its status line red and bold (`is-blocking`)', () => {
    const row: SumarioRow = {
      key: 'x',
      rowKey: 'section_10',
      kind: 'text',
      number: 10,
      title: 'Conclusão e parecer',
      meta: 'Parecer em branco',
      blocking: true,
      pending: true,
      blockId: null,
      blockType: 'section_10',
      expandable: false,
      position: 10,
      siblings: 11,
    };
    const { container } = render(<RowBody row={row} />);
    expect(container.querySelector('.sum-status')).toHaveClass('is-blocking');
    expect(container.querySelector('.sum-status')).toHaveTextContent('Parecer em branco');
  });

  it('pulls a relatório this device does not hold and says so when it never arrives', async () => {
    database = await freshDb();
    renderSumario('019966c1-000e-7000-8000-000000000001');
    expect(await screen.findByText('Relatório não encontrado neste aparelho.')).toBeVisible();
    expect(syncRelatorio).toHaveBeenCalledWith('019966c1-000e-7000-8000-000000000001');
  });

  it('says the download did not complete, with "Tentar de novo", when the company summary lists a relatório the pull left absent', async () => {
    database = await freshDb();
    const id = '019966c1-000e-7000-8000-000000000004';
    const summary = { id, project_id: portoSeguroSmall.projectId, status: 'em_campo' as const, template_id: null, seed_version: 'v1', updated_seq: 7 };
    renderSumario(id, syncState({ summaryRelatorios: [summary] }));
    expect(await screen.findByText('Não foi possível baixar o relatório neste aparelho.')).toBeVisible();
    expect(screen.queryByText('Relatório não encontrado neste aparelho.')).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar para o início' })).toBeVisible();
    expect(syncRelatorio).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(syncRelatorio).toHaveBeenCalledTimes(2));
    expect(syncRelatorio).toHaveBeenLastCalledWith(id);
    expect(await screen.findByText('Não foi possível baixar o relatório neste aparelho.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  });

  it('keeps the loading sentence while a cycle already runs (its pull would answer busy), then pulls once it ends', async () => {
    database = await freshDb();
    const id = '019966c1-000e-7000-8000-000000000002';
    const busy = vi.fn(async () => 'busy' as const);
    const { rerender } = renderSumario(id, syncState({ running: true, syncRelatorio: busy }));
    expect(await screen.findByText('Baixando o relatório…')).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Relatório não encontrado neste aparelho.')).toBeNull();
    expect(busy).not.toHaveBeenCalled();
    rerender(tree(id, syncState({ running: false })));
    expect(await screen.findByText('Relatório não encontrado neste aparelho.')).toBeVisible();
    expect(syncRelatorio).toHaveBeenCalledWith(id);
  });

  it('a busy answer goes back to idle and the pull is asked again', async () => {
    database = await freshDb();
    const id = '019966c1-000e-7000-8000-000000000003';
    const pull = vi.fn<() => Promise<'busy' | 'ran'>>().mockResolvedValueOnce('busy').mockResolvedValue('ran');
    renderSumario(id, syncState({ syncRelatorio: pull }));
    expect(await screen.findByText('Relatório não encontrado neste aparelho.')).toBeVisible();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it('4.8: "Gerar relatório" opens the Export dialog, and Esc returns the focus to it', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const trigger = screen.getByRole('button', { name: 'Gerar relatório' });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Gerar relatório' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.closest('.export-dialog') ?? dialog.querySelector('.export-dialog')).not.toBeNull();
    expect(within(dialog).getByText('Nenhuma revisão gerada ainda.')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Gerar relatório' })).toBeNull());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gerar relatório' })).toHaveFocus());
  });

  it('4.8: while a blocking row stands, "Gerar relatório" is aria-disabled with the foot reason and opens nothing', async () => {
    database = await seeded();
    render(
      <MemoryRouter>
        <SyncContext value={syncState()}>
          <ToastProvider>
            <p id="reason">Parecer não preenchido impede gerar.</p>
            <GenerateAction relatorioId={RELATORIO} reasonId="reason" blocked />
          </ToastProvider>
        </SyncContext>
      </MemoryRouter>,
    );
    const button = screen.getByRole('button', { name: 'Gerar relatório' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Parecer não preenchido impede gerar.');
    await userEvent.click(button);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('4.6 SumarioSurface: status transitions and the issued banner', () => {
  it('has no banner on a fresh Em campo relatório with no revision', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(screen.queryByText(/Relatório emitido em/)).toBeNull();
  });

  it('carries no backward-move item at Rascunho (nothing to move back to)', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({ ...relatorioRecord!, row: { ...(relatorioRecord!.row as RelatorioRow), status: 'rascunho' } });
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções do relatório' }));
    expect(within(await screen.findByRole('menu')).queryByRole('menuitem', { name: /Voltar para/ })).toBeNull();
  });

  it('the header Overflow offers "Voltar para Rascunho" from Em campo; confirming writes the put and returns focus to the trigger', async () => {
    database = await seeded();
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    const trigger = screen.getByRole('button', { name: 'Mais opções do relatório' });
    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Voltar para Rascunho' }));
    const dialog = await screen.findByRole('dialog', { name: 'Voltar para Rascunho' });
    expect(dialog).toHaveTextContent('O relatório volta de Em campo para Rascunho.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar para Rascunho' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(async () => {
      const row = await database!.entities.get(['relatorio', RELATORIO]);
      expect((row!.row as { status: string }).status).toBe('rascunho');
    });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('shows the issued banner with the issue date and revision numbers once a revision exists', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({ ...relatorioRecord!, row: { ...(relatorioRecord!.row as RelatorioRow), status: 'emitido' } });
    await database.entities.put(
      toRecord(`revision:019966c1-000f-7000-8000-000000000001`, {
        id: '019966c1-000f-7000-8000-000000000001',
        relatorio_id: RELATORIO,
        number: 2,
        snapshot_seq: 10,
        created_by: USER,
        docx_file_id: '019966c1-000f-7000-8000-000000000002',
        pdf_file_id: '019966c1-000f-7000-8000-000000000003',
        created_at: '2026-09-10T12:00:00.000Z',
      } as never),
    );
    renderSumario();
    expect(await screen.findByText('Relatório emitido em 10/09 (revisão 2). Alterações geram a revisão 3.')).toBeVisible();
    // Through the real Banner component (UX-DR11), not a plain paragraph.
    expect(screen.getByText('Relatório emitido em 10/09 (revisão 2). Alterações geram a revisão 3.').closest('.banner')).not.toBeNull();
  });

  it('hides the issued banner once backed all the way to Em campo, even though the revision row is still on record', async () => {
    database = await seeded();
    const relatorioRecord = await database.entities.get(['relatorio', RELATORIO]);
    await database.entities.put({ ...relatorioRecord!, row: { ...(relatorioRecord!.row as RelatorioRow), status: 'em_campo' } });
    await database.entities.put(
      toRecord(`revision:019966c1-000f-7000-8000-000000000001`, {
        id: '019966c1-000f-7000-8000-000000000001',
        relatorio_id: RELATORIO,
        number: 2,
        snapshot_seq: 10,
        created_by: USER,
        docx_file_id: '019966c1-000f-7000-8000-000000000002',
        pdf_file_id: '019966c1-000f-7000-8000-000000000003',
        created_at: '2026-09-10T12:00:00.000Z',
      } as never),
    );
    renderSumario();
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(screen.queryByText(/Relatório emitido em/)).toBeNull();
  });
});
