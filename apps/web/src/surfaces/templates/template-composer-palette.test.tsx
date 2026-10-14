import 'fake-indexeddb/auto';
import { emptyTemplate, removeNode, standardTemplate, templateRowSchema, type TemplateRow } from '@app/domain';
import { act, cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { templateRow } from '../../db/home-store.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { TemplateComposerSurface } from './template-composer.tsx';

/*
 * Story 3.4: the Template composer over a real device database. Every edit is one batch
 * of `template/{id}/*` puts computed by the kernel, moves are announced, removals confirm
 * and undo, and an orphan block (left by two devices' writes) is invisible.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const ID = '019966b0-0037-7000-8000-000000000001';

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
  status: 'signed-in',
  user: {
    id: USER,
    name: 'Bento Braga',
    email: 'b@teste.local',
    companyId: COMPANY,
    companyName: 'Empresa B de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
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
// The real reader, wrapped so one test can hand an edit a row another device already changed.
vi.mock('../../db/home-store.ts', async (original) => {
  const actual = await original<typeof import('../../db/home-store.ts')>();
  return { ...actual, templateRow: vi.fn(actual.templateRow) };
});

// Each edit is an IndexedDB write plus a live-query round trip; under a full parallel run
// that can outlast the one-second default.
configure({ asyncUtilTimeout: 5000 });

async function freshDb(row: TemplateRow | null): Promise<AppDatabase> {
  const user = `019966b0-0038-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  const fresh = openDatabase(user);
  if (row !== null) await fresh.entities.put(toRecord(`template:${row.id}`, row));
  return fresh;
}

function renderComposer(id = ID) {
  return render(
    <MemoryRouter initialEntries={[`/templates/${id}`]}>
      <ToastProvider>
        {/* Stands in for the App bar's back button, which the shell draws. */}
        <Link to="/templates">Sair do composer</Link>
        <Routes>
          <Route path="/templates/:id" element={<TemplateComposerSurface />} />
          <Route path="/templates" element={<p>Lista</p>} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const palette = () => screen.getByRole('complementary', { name: 'Paleta de blocos' });
const announcer = () => screen.getByTestId('composer-announcer');

async function outboxPaths(): Promise<string[]> {
  return (await database!.outbox.toArray()).map((op) => op.path);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

// E3-A4: one of four parts of the composer suite, split so they run in parallel (quantities, sections, concurrent edits, name).

describe('3.4 composer: quantities per node', () => {
  it('sets a quantity on the current coluna from the palette; the coluna lists it and the totals follow', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: /^Coluna 9/ }));
    // Story 14.2 (`.pal-target`): the palette names where it adds, the coluna with what holds it.
    expect(palette().querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Coluna 9 · 1° Subsolo');

    const stepper = within(palette()).getByRole('group', { name: 'Seccionadoras, 0' });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 2' })).toBeVisible());

    const body = container.querySelector('.column-row.is-open .col-body')!;
    await waitFor(() => expect(within(body as HTMLElement).getByRole('group', { name: 'Seccionadoras, 2' })).toBeVisible());
    expect(container.querySelector('.composer-meta')).toHaveTextContent(/^27 seccionadoras · 21 disjuntores/);

    // "−" to zero from the coluna body: the row leaves and the palette count reads "—".
    const inBody = within(body as HTMLElement).getByRole('group', { name: 'Seccionadoras, 2' });
    await userEvent.click(within(inBody).getByRole('button', { name: 'Menos um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 1' })).toBeVisible());
    await userEvent.click(within(within(palette()).getByRole('group', { name: 'Seccionadoras, 1' })).getByRole('button', { name: 'Menos um' }));
    await waitFor(() => expect(within(palette()).getByRole('group', { name: 'Seccionadoras, 0' })).toBeVisible());
    expect(within(within(palette()).getByRole('group', { name: 'Seccionadoras, 0' })).getByRole('textbox')).toHaveValue('—');
    await waitFor(() => expect(container.querySelector('.column-row.is-open .qty-row')).toBeNull());
    // D-4: every `blocks` put bumped the version; the composition itself is back where it was.
    expect(await templateRow(database, ID)).toEqual({ ...standardTemplate({ id: ID }), version: expect.any(Number) });
    expect((await templateRow(database, ID))!.version).toBeGreaterThan(1);
    expect((await outboxPaths()).every((path) => path === `template/${ID}/blocks`)).toBe(true);
  });

  it('heads the palette with the current node', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    expect(container.querySelector('.composer-palette .palette-head')).toHaveTextContent('Blocos');
    await userEvent.click(screen.getByRole('button', { name: /^Coluna 9/ }));
    await waitFor(() => expect(container.querySelector('.composer-palette .palette-head')).toHaveTextContent('Coluna 9'));
  });

  it('"−" to zero from the keyboard in the open coluna moves the focus to its head', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    const head = await screen.findByRole('button', { name: /^Coluna 5/ });
    await userEvent.click(head);
    const body = await waitFor(() => {
      const el = container.querySelector('.column-row.is-open .col-body');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const minus = within(within(body).getByRole('group', { name: 'Seccionadoras, 1' })).getByRole('button', { name: 'Menos um' });
    minus.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(within(body).queryByRole('group', { name: /^Seccionadoras/ })).toBeNull());
    await waitFor(() => expect(head).toHaveFocus());
  });

  it('writes nothing when the node was removed elsewhere before the write, and the stepper keeps its count', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: /^Coluna 9/ }));
    const stepper = within(palette()).getByRole('group', { name: 'Seccionadoras, 0' });
    // The row this device reads at the moment of the write no longer has Coluna 9.
    const stale = standardTemplate({ id: ID });
    vi.mocked(templateRow).mockImplementationOnce(async () => ({ ...stale, ...removeNode(stale, 'subsolo-1/coluna-9') }));
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(within(stepper).getByRole('textbox')).toHaveValue('—'));
    expect(await outboxPaths()).toEqual([]);
    expect(screen.queryByText('Não foi possível salvar. Tente de novo.')).toBeNull();
  });

  it('a local made current by "Adicionar equipamento" holds blocks with no coluna, and lists them under "Equipamentos no local"', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    const card = (await screen.findByRole('button', { name: /^Local Cubículo Enel/ })).closest('li') as HTMLElement;
    const add = within(card).getByRole('button', { name: 'Adicionar equipamento' });
    expect(add).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(add);
    // jsdom lays nothing out, so the inline palette counts as hidden and the drawer opens on the local.
    const drawer = await screen.findByRole('dialog', { name: 'Cubículo Enel' });
    expect(drawer.querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cubículo Enel, direto no local');
    expect(within(drawer).getByRole('group', { name: 'Para-raios, 2' })).toBeVisible();
    // A new type lands on the local itself: one `blocks` put, the block's ref the local's.
    const stepper = within(drawer).getByRole('group', { name: 'Transformadores, 0' });
    await userEvent.click(within(stepper).getByRole('button', { name: 'Mais um' }));
    await waitFor(() => expect(within(drawer).getByRole('group', { name: 'Transformadores, 1' })).toBeVisible());
    const row = await templateRow(database, ID);
    expect(row!.blocks.filter((b) => b.block_type === 'transformador_forca' && b.skeleton_location_ref === 'enel').map((b) => b.quantity)).toEqual([1]);
    expect(await outboxPaths()).toEqual([`template/${ID}/blocks`]);

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(add).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveClass('is-current');
    expect(palette().querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cubículo Enel, direto no local');
    const own = container.querySelector('.local-card.is-current > .block-expand > .loc-direct') as HTMLElement;
    expect(within(own).getByText('Equipamentos no local')).toBeVisible();
    expect(within(own).getByRole('group', { name: 'Para-raios, 2' })).toBeVisible();
    expect(within(own).getByRole('group', { name: 'Transformadores, 1' })).toBeVisible();
    // Coordinator review 2026-10-13: with the palette in the drawer (not beside the composition), a press on
    // the local that is already the target opens the drawer again and keeps the target; it never releases it.
    await userEvent.click(add);
    const again = await screen.findByRole('dialog', { name: 'Cubículo Enel' });
    expect(again.querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cubículo Enel, direto no local');
    expect(within(again).getByRole('group', { name: 'Transformadores, 1' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(add).toHaveAttribute('aria-pressed', 'true');
    expect(card).toHaveClass('is-current');
  });

  it('a local just added is the target already: one tap on its "Adicionar equipamento" opens the drawer on it, and one more after closing reopens it', async () => {
    database = await freshDb(emptyTemplate(ID, 'v3'));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar local' }));
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar local' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Transformação' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar local' }));
    await waitFor(() => expect(announcer()).toHaveTextContent('Cabine de transformação adicionada'));
    const card = (await screen.findByRole('button', { name: /^Local Cabine de transformação/ })).closest('li') as HTMLElement;
    // The new local is the palette's target before anything is tapped on it.
    await waitFor(() => expect(card).toHaveClass('is-current'));
    const add = within(card).getByRole('button', { name: 'Adicionar equipamento' });
    expect(add).toHaveAttribute('aria-pressed', 'true');
    expect(palette().querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cabine de transformação, direto no local');

    // The first tap, then one more after the drawer was closed.
    for (let tap = 0; tap < 2; tap++) {
      await userEvent.click(add);
      const drawer = await screen.findByRole('dialog', { name: 'Cabine de transformação' });
      expect(drawer.querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cabine de transformação, direto no local');
      expect(within(drawer).getByRole('group', { name: 'Transformadores, 0' })).toBeVisible();
      expect(card).toHaveClass('is-current');
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(add).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('with the palette beside the composition (from 1024 px) a second press on the local releases it and no drawer opens: the mock toggle', async () => {
    // jsdom lays nothing out, so every `offsetParent` is null; a laid-out page is stood in for here.
    const offsetParent = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(() => document.body);
    try {
      database = await freshDb(standardTemplate({ id: ID }));
      renderComposer();
      const card = (await screen.findByRole('button', { name: /^Local Cubículo Enel/ })).closest('li') as HTMLElement;
      const add = within(card).getByRole('button', { name: 'Adicionar equipamento' });
      await userEvent.click(add);
      expect(add).toHaveAttribute('aria-pressed', 'true');
      expect(card).toHaveClass('is-current');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(palette().querySelector('.pal-target')).toHaveTextContent('Toque para adicionar em: Cubículo Enel, direto no local');
      // A second press releases the local: the palette asks for a target again.
      await userEvent.click(add);
      expect(add).toHaveAttribute('aria-pressed', 'false');
      expect(card).not.toHaveClass('is-current');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(palette().querySelector('.pal-target')).toHaveTextContent('Selecione um local ou uma coluna.');
    } finally {
      offsetParent.mockRestore();
    }
  });
});

describe('3.4 composer: section blocks', () => {
  const tags = (container: HTMLElement) =>
    [...container.querySelectorAll('.block-list[aria-label="Blocos do template"] .block-tag')].map((el) => el.textContent);

  it('moves, duplicates and removes sections through the Overflow, with the Confirm dialog and "Desfazer"', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Adicionar abaixo',
      'Descer',
      'Duplicar',
      'Editar texto',
      'Remover',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '4', '5', '6', '8', '10', '11']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Seção 1 movida para a posição 2 de 9'));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 3 Limite de escopo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '8', '10', '11']));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 8 Pontos de atenção' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover 8 Pontos de atenção?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '10', '11']));
    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(tags(container)).toEqual(['2', '1', '3', '3', '4', '5', '6', '8', '10', '11']));
    expect((await outboxPaths()).every((path) => path === `template/${ID}/blocks`)).toBe(true);
  });

  it('adds a section from the palette at the end, and "Adicionar abaixo" places the next one under its card', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    const { container } = renderComposer();
    await screen.findByRole('complementary', { name: 'Paleta de blocos' });
    await userEvent.click(within(palette()).getByRole('button', { name: '1 Objetivo' }));
    await userEvent.click(within(palette()).getByRole('button', { name: '11 Certificados' }));
    await waitFor(() => expect(tags(container)).toEqual(['1', '11']));

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Adicionar abaixo' }));
    // jsdom lays nothing out, so the inline palette counts as hidden and the drawer opens.
    const drawer = await screen.findByRole('dialog', { name: 'Blocos' });
    expect(within(drawer).getByText('A próxima seção tocada entra abaixo de 1 Objetivo.')).toBeVisible();
    await userEvent.click(within(drawer).getByRole('button', { name: '2 Definições' }));
    await waitFor(() => expect(tags(container)).toEqual(['1', '2', '11']));
  });
});

describe('3.4 composer: concurrent edits', () => {
  it('ignores an orphan block, and the next blocks write drops it', async () => {
    const base = standardTemplate({ id: ID });
    const orphan = { ...base.blocks.find((b) => b.block_type === 'tp')!, skeleton_location_ref: 'gone' };
    const row = templateRowSchema.parse({ ...base, blocks: [...base.blocks, orphan] });
    database = await freshDb(row);
    renderComposer();
    expect(await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 locais · 17 colunas · 94 blocos' })).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de 1 Objetivo' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(async () => expect((await templateRow(database!, ID))!.blocks.some((b) => b.skeleton_location_ref === 'gone')).toBe(false));
  });
});

describe('3.4 composer: name', () => {
  it('commits the name on blur as one template/{id}/name put', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const name = await screen.findByRole('textbox', { name: 'Nome do template' });
    await userEvent.clear(name);
    // One paste, not 31 keystrokes: on a loaded machine the gap between two typed keys can
    // outlast the field's idle commit, which then writes a correct but second put of the
    // partial name before the blur writes the rest.
    await userEvent.paste('  Seguradora Exemplo — Blocos Norte e Sul  ');
    await act(async () => {
      name.blur();
    });
    await waitFor(async () => expect((await templateRow(database!, ID))!.name).toBe('Seguradora Exemplo — Blocos Norte e Sul'));
    expect(await outboxPaths()).toEqual([`template/${ID}/name`]);
    // D-4: a rename is a content edit, so the row's version is bumped on this device too.
    expect((await templateRow(database!, ID))!.version).toBe(2);
  });
});
