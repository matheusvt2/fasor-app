import 'fake-indexeddb/auto';
import { addCabine, addColuna, addPainel, emptyTemplate, setQuantity, standardTemplate, type TemplateRow } from '@app/domain';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from '../../test-axe.ts';
import { toRecord } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplateComposerSurface } from './template-composer.tsx';

/*
 * Story 14.2: the Template composer over Local › Painel › Coluna, on a real device database.
 * Every edit is one `template/{id}/skeleton` put (a removal adds `blocks`), computed by the
 * kernel; every rename and reorder is said and offers "Desfazer".
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const ID = '019966b0-0037-7000-8000-000000000142';

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

async function freshDb(row: TemplateRow): Promise<AppDatabase> {
  const user = `019966b0-0142-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  await fresh.entities.put(toRecord(`template:${row.id}`, row));
  return fresh;
}

function renderComposer() {
  return render(
    <MemoryRouter initialEntries={[`/templates/${ID}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/templates/:id" element={<TemplateComposerSurface />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

/**
 * One local "Cabine de transformação" (Função transformação) with two transformers directly
 * on it and two painéis: "Painel de média tensão" with Coluna 1 to 3 (one seccionadora
 * each) and "Painel B" with none; then a second local, "Geradores".
 */
function composed(): TemplateRow {
  let skeleton = addCabine([], 'loc', 'Cabine de transformação', 'transformacao');
  skeleton = addPainel(skeleton, 'loc', 'P1', 'Painel de média tensão');
  for (const n of [1, 2, 3]) skeleton = addColuna(skeleton, 'P1', `c${n}`, `Coluna ${n}`);
  skeleton = addPainel(skeleton, 'loc', 'P2', 'Painel B');
  skeleton = addCabine(skeleton, 'ger', 'Geradores');
  let row: TemplateRow = { ...emptyTemplate(ID, 'v3'), skeleton };
  row = { ...row, blocks: setQuantity(row, 'loc', 'transformador_forca', 2) };
  for (const n of [1, 2, 3]) row = { ...row, blocks: setQuantity(row, `c${n}`, 'chave_seccionadora', 1) };
  return row;
}

const announcer = () => screen.getByTestId('composer-announcer');
const card = async (name: RegExp) => (await screen.findByRole('button', { name })).closest('li') as HTMLElement;
const names = (list: HTMLElement, selector: string) => [...list.querySelectorAll(`:scope > li ${selector}`)].map((el) => el.textContent);
const outbox = async () => (await database!.outbox.toArray()).sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1));
const skeletonOf = async () => (await templateRow(database!, ID))!.skeleton;

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('14.2 composer: the three levels', () => {
  it('draws a local card with its kicker, flag and sub-line, its own equipment, its painel cards and their colunas; no string calls the root "cabine"', async () => {
    database = await freshDb(composed());
    const { container } = renderComposer();
    expect(await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 2 locais · 2 painéis · 3 colunas · 5 blocos' })).toBeVisible();
    expect(screen.getByText('Local › painel › coluna. Cada bloco nasce no local ou na sua coluna, com a TAG final')).toHaveClass('section-note');

    const local = await card(/^Local Cabine de transformação/);
    expect(local).toHaveClass('local-card', 'is-open');
    expect(local.querySelector(':scope > .block-body .level-kicker')).toHaveTextContent('Local');
    expect(local.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('2 painéis · 3 colunas · 5 blocos');
    expect(local.querySelector(':scope > .block-body .block-sub')).toHaveTextContent('Função: transformação · Agrupar por tipo: desativado');
    // "Equipamentos no local": the local's own steppers.
    const direct = local.querySelector(':scope > .block-expand > .loc-direct') as HTMLElement;
    expect(direct).not.toHaveClass('is-empty');
    expect(within(direct).getByText('Equipamentos no local')).toHaveClass('table-title');
    expect(within(direct).getByRole('group', { name: 'Transformadores, 2' })).toBeVisible();

    const paineis = within(local).getByRole('list', { name: 'Painéis de Cabine de transformação' });
    expect(paineis).toHaveClass('painel-list');
    expect(names(paineis, '.block-name')).toEqual(['Painel de média tensão', 'Painel B']);
    const mt = await card(/^Painel Painel de média tensão/);
    expect(mt).toHaveClass('painel-card', 'is-open');
    expect(mt.querySelector(':scope > .block-body .level-kicker')).toHaveTextContent('Painel');
    expect(mt.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('3 colunas · 3 blocos');
    expect(mt.querySelector(':scope > .block-body .block-sub')).toHaveTextContent('3 seccionadoras');
    const colunas = within(mt).getByRole('list', { name: 'Colunas de Painel de média tensão em Cabine de transformação' });
    expect(names(colunas, '.col-name')).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']);

    // A local with nothing: "sem painéis", and its empty "Equipamentos no local" hidden until it is the target.
    const geradores = await card(/^Local Geradores/);
    expect(geradores.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('sem painéis · 0 blocos');
    expect(geradores.querySelector(':scope > .block-body .block-sub')).toHaveTextContent('Agrupar por tipo: desativado');
    expect(geradores.querySelector(':scope > .block-expand > .loc-direct')).toHaveClass('is-empty');
    expect(within(geradores).getByText('Nenhum equipamento direto neste local. Toque em um tipo da paleta para adicionar.')).toHaveClass('loc-none');

    expect(screen.getByRole('list', { name: 'Locais do template' })).toBeVisible();
    expect(screen.getByText('Locais, painéis e colunas podem ser renomeados depois, no relatório, pela árvore')).toHaveClass('btn-reason');
    // The stored names say "Cabine"; no label, heading, note or button of the surface does.
    for (const el of container.querySelectorAll('.block-name')) el.textContent = '';
    expect(container.querySelector('.composer-main')).not.toHaveTextContent(/cabine/i);
    expect(screen.getByRole('complementary', { name: 'Paleta de blocos' })).not.toHaveTextContent(/cabine/i);
  });

  it('has no violations with the three levels drawn', async () => {
    database = await freshDb(composed());
    const { container } = renderComposer();
    await card(/^Painel Painel B/);
    expect(await axe(container)).toHaveNoViolations();
  }, 60_000);

  it('a painel with no coluna says why it takes no equipment and offers "Adicionar coluna"; the coluna added is the palette target', async () => {
    database = await freshDb(composed());
    renderComposer();
    const painelB = await card(/^Painel Painel B/);
    expect(painelB.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('sem colunas · 0 blocos');
    expect(painelB.querySelector(':scope > .block-body .block-sub')).toHaveTextContent('Novo · nomeie-o pelo menu e adicione a primeira coluna');
    const note = within(painelB).getByRole('note');
    expect(note).toHaveClass('pnl-empty');
    expect(note).toHaveTextContent('Este painel ainda não tem colunas. Um painel só agrupa colunas e não recebe equipamento direto: adicione uma coluna e coloque os equipamentos nela.');
    // No stepper anywhere on the painel itself, and it is never the palette's target.
    expect(within(painelB).queryByRole('group')).toBeNull();
    expect(within(painelB).queryByRole('button', { name: 'Adicionar equipamento' })).toBeNull();

    await userEvent.click(within(painelB).getByRole('button', { name: 'Adicionar coluna' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 1 adicionada'));
    await waitFor(() => expect(within(painelB).queryByRole('note')).toBeNull());
    const colunas = within(painelB).getByRole('list', { name: 'Colunas de Painel B em Cabine de transformação' });
    expect(names(colunas, '.col-name')).toEqual(['Coluna 1']);
    expect(colunas.querySelector(':scope > li')).toHaveClass('is-open');
    expect(screen.getByRole('complementary', { name: 'Paleta de blocos' }).querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Coluna 1 · Painel B');
    expect((await skeletonOf()).map((n) => [n.kind, n.name])).toEqual([
      ['cabine', 'Cabine de transformação'],
      ['painel', 'Painel de média tensão'],
      ['coluna', 'Coluna 1'],
      ['coluna', 'Coluna 2'],
      ['coluna', 'Coluna 3'],
      ['painel', 'Painel B'],
      ['coluna', 'Coluna 1'],
      ['cabine', 'Geradores'],
    ]);
    expect((await outbox()).map((op) => op.path)).toEqual([`template/${ID}/skeleton`]);
  });

  it('"Adicionar painel" names it after its siblings, from the card and from the local menu', async () => {
    database = await freshDb(composed());
    renderComposer();
    const geradores = await card(/^Local Geradores/);
    await userEvent.click(within(geradores).getByRole('button', { name: 'Adicionar painel' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel 1 adicionado'));
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Geradores' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar painel' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel 2 adicionado'));
    expect(names(within(geradores).getByRole('list', { name: 'Painéis de Geradores' }), '.block-name')).toEqual(['Painel 1', 'Painel 2']);
    // The painel menu adds a coluna too.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel 2' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Renomear', 'Subir', 'Adicionar coluna', 'Remover']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Adicionar coluna' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 1 adicionada'));
    expect((await skeletonOf()).filter((n) => n.kind !== 'cabine' && n.parent_ref !== 'loc' && !n.parent_ref.startsWith('P')).map((n) => [n.kind, n.name])).toEqual([
      ['painel', 'Painel 1'],
      ['painel', 'Painel 2'],
      ['coluna', 'Coluna 1'],
    ]);
  });

  it('a local from before the painel level keeps its colunas directly under it and its "Adicionar coluna"; a local with none does not offer it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const subsolo = await card(/^Local 1° Subsolo/);
    expect(subsolo.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('17 colunas · 49 blocos');
    expect(names(within(subsolo).getByRole('list', { name: 'Colunas de 1° Subsolo' }), '.col-name')).toHaveLength(17);
    expect(within(subsolo).queryByRole('list', { name: 'Painéis de 1° Subsolo' })).toBeNull();
    await userEvent.click(within(subsolo).getByRole('button', { name: 'Adicionar coluna' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 18 adicionada'));
    expect((await skeletonOf()).find((n) => n.name === 'Coluna 18')).toMatchObject({ kind: 'coluna', parent_ref: 'subsolo-1' });
    const enel = await card(/^Local Cubículo Enel/);
    expect(enel.querySelector(':scope > .block-body .loc-flag')).toHaveTextContent('sem painéis · 9 blocos');
    expect(within(enel).queryByRole('button', { name: 'Adicionar coluna' })).toBeNull();
    expect(within(enel).getByRole('button', { name: 'Adicionar painel' })).toBeVisible();
  });
});

describe('14.2 composer: rename, reorder and remove at each level', () => {
  it('moves a painel by Alt+arrow, the menu and the Position box, each one skeleton put, said and undone by "Desfazer"', async () => {
    database = await freshDb(composed());
    renderComposer();
    const local = await card(/^Local Cabine de transformação/);
    const paineis = () => names(within(local).getByRole('list', { name: 'Painéis de Cabine de transformação' }), '.block-name');
    const posBox = within(await card(/^Painel Painel B/)).getByRole('textbox', { name: 'Posição de Painel B' });
    expect(posBox).toHaveValue('2');

    // Alt+Up from anywhere in the row.
    posBox.focus();
    fireEvent.keyDown(posBox, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(paineis()).toEqual(['Painel B', 'Painel de média tensão']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel B movido para a posição 1 de 2'));
    expect(await screen.findByText('Painel B movido para a posição 1 de 2', { selector: '.toast *, .toast' })).toBeVisible();
    // The colunas travelled with their painel; the local did not move.
    expect((await skeletonOf()).map((n) => n.ref)).toEqual(['loc', 'P2', 'P1', 'c1', 'c2', 'c3', 'ger']);

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(paineis()).toEqual(['Painel de média tensão', 'Painel B']));
    expect((await skeletonOf()).map((n) => n.ref)).toEqual(['loc', 'P1', 'c1', 'c2', 'c3', 'P2', 'ger']);

    // The Overflow: "Descer" on the first painel.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel de média tensão' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Renomear', 'Descer', 'Adicionar coluna', 'Remover']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(paineis()).toEqual(['Painel B', 'Painel de média tensão']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão movido para a posição 2 de 2'));

    // The Position box: type a number and press Enter.
    const box = within(await card(/^Painel Painel de média tensão/)).getByRole('textbox', { name: 'Posição de Painel de média tensão' });
    await userEvent.clear(box);
    await userEvent.type(box, '1{Enter}');
    await waitFor(() => expect(paineis()).toEqual(['Painel de média tensão', 'Painel B']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de média tensão movido para a posição 1 de 2'));
    expect((await outbox()).every((op) => op.path === `template/${ID}/skeleton`)).toBe(true);
  });

  it('moves a local with everything under it, said in the masculine ("Local Geradores movido"), and "Desfazer" puts it back', async () => {
    database = await freshDb(composed());
    renderComposer();
    const locais = () => names(screen.getByRole('list', { name: 'Locais do template' }), '.block-name').filter((name) => !name!.startsWith('Painel'));
    await card(/^Local Geradores/);
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Geradores' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Função e nome', 'Subir', 'Adicionar painel', 'Remover']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Subir' }));
    await waitFor(() => expect(locais()[0]).toBe('Geradores'));
    await waitFor(() => expect(announcer()).toHaveTextContent('Local Geradores movido para a posição 1 de 2'));
    expect((await skeletonOf()).map((n) => n.ref)).toEqual(['ger', 'loc', 'P1', 'c1', 'c2', 'c3', 'P2']);
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(locais()[0]).toBe('Cabine de transformação'));
    // A local whose name leads with "Cabine" is read by its own name, in the feminine.
    const box = within(await card(/^Local Cabine de transformação/)).getByRole('textbox', { name: 'Posição de Cabine de transformação' });
    await userEvent.clear(box);
    await userEvent.type(box, '2{Enter}');
    await waitFor(() => expect(announcer()).toHaveTextContent('Cabine de transformação movida para a posição 2 de 2'));
  });

  it('renames a painel through "Renomear": one skeleton put, said, and "Desfazer" restores the name', async () => {
    database = await freshDb(composed());
    renderComposer();
    await card(/^Painel Painel B/);
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel B' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Painel B' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Painel de baixa tensão');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Painel de baixa tensão renomeado'));
    expect((await skeletonOf()).find((n) => n.ref === 'P2')).toMatchObject({ kind: 'painel', name: 'Painel de baixa tensão' });
    expect((await outbox()).map((op) => op.path)).toEqual([`template/${ID}/skeleton`]);
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await skeletonOf()).find((n) => n.ref === 'P2')).toMatchObject({ name: 'Painel B' }));
  });

  it('"Função e nome" opens the Função dialog filled in and writes the Função and the name in one skeleton put, undone together', async () => {
    database = await freshDb(composed());
    renderComposer();
    await card(/^Local Geradores/);
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Geradores' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Função e nome' }));
    const dialog = await screen.findByRole('dialog', { name: 'Função e nome' });
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Geradores');
    expect(within(dialog).getAllByRole('radio').every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Distribuição' }));
    // The name of a local being edited is its own: it does not follow the Função.
    expect(within(dialog).getByRole('textbox', { name: 'Nome' })).toHaveValue('Geradores');
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Nome' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Nome' }), 'Sala dos geradores');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Local Sala dos geradores atualizado'));
    const local = await card(/^Local Sala dos geradores/);
    expect(local.querySelector(':scope > .block-body .block-sub')).toHaveTextContent('Função: distribuição · Agrupar por tipo: desativado');
    expect((await skeletonOf()).find((n) => n.ref === 'ger')).toEqual({ ref: 'ger', kind: 'cabine', parent_ref: null, name: 'Sala dos geradores', agrupar_por_tipo: false, funcao: 'distribuicao' });
    const ops = await outbox();
    expect(ops.map((op) => op.path)).toEqual([`template/${ID}/skeleton`]);

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(async () => expect((await skeletonOf()).find((n) => n.ref === 'ger')).toEqual({ ref: 'ger', kind: 'cabine', parent_ref: null, name: 'Geradores', agrupar_por_tipo: false }));
    // Opened again on the local that holds a Função: the radio is checked.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de transformação' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Função e nome' }));
    expect(within(await screen.findByRole('dialog', { name: 'Função e nome' })).getByRole('radio', { name: 'Transformação' })).toHaveAttribute('aria-checked', 'true');
  });

  it('removes a painel with its colunas and their blocks after its own Confirm, and a local with everything under it; "Desfazer" restores both fields', async () => {
    database = await freshDb(composed());
    renderComposer();
    await card(/^Painel Painel de média tensão/);
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Painel de média tensão' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const painelDialog = await screen.findByRole('dialog', { name: 'Remover Painel de média tensão?' });
    expect(within(painelDialog).getByText('O painel e as colunas dele, com os equipamentos que elas levam, saem do template.')).toBeVisible();
    await userEvent.click(within(painelDialog).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Painel de média tensão removido')).toBeVisible();
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 2 locais · 1 painel · 2 blocos' });
    let row = (await templateRow(database, ID))!;
    expect(row.skeleton.map((n) => n.ref)).toEqual(['loc', 'P2', 'ger']);
    expect(row.blocks.map((b) => b.skeleton_location_ref)).toEqual(['loc']);
    const ops = await outbox();
    expect(ops.map((op) => op.path).sort()).toEqual([`template/${ID}/blocks`, `template/${ID}/skeleton`]);
    expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);
    // The focus went to the row now at its place.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de Painel B' })).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 2 locais · 2 painéis · 3 colunas · 5 blocos' });

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Cabine de transformação' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const localDialog = await screen.findByRole('dialog', { name: 'Remover Cabine de transformação?' });
    expect(within(localDialog).getByText('O local, os equipamentos, os painéis e as colunas dele saem do template.')).toBeVisible();
    await userEvent.click(within(localDialog).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Cabine de transformação removida')).toBeVisible();
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 1 local' });
    row = (await templateRow(database, ID))!;
    expect(row.skeleton.map((n) => n.ref)).toEqual(['ger']);
    expect(row.blocks).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 2 locais · 2 painéis · 3 colunas · 5 blocos' });
    expect((await templateRow(database, ID))!.blocks).toHaveLength(4);
  });

  it('a coluna inside a painel keeps its menu and moves among the colunas of its own painel only', async () => {
    database = await freshDb(composed());
    renderComposer();
    const mt = await card(/^Painel Painel de média tensão/);
    const colunas = () => names(within(mt).getByRole('list', { name: 'Colunas de Painel de média tensão em Cabine de transformação' }), '.col-name');
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 3' }));
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Renomear', 'Subir', 'Remover']);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Subir' }));
    await waitFor(() => expect(colunas()).toEqual(['Coluna 1', 'Coluna 3', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 3 movida para a posição 2 de 3'));
    expect((await skeletonOf()).map((n) => n.ref)).toEqual(['loc', 'P1', 'c1', 'c3', 'c2', 'P2', 'ger']);
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(colunas()).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']));
  });
});
