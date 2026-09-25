import 'fake-indexeddb/auto';
import { emptyTemplate, standardTemplate, type TemplateRow } from '@app/domain';
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
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
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
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
const colunaNames = (cabine: string) =>
  within(screen.getByRole('list', { name: `Colunas de ${cabine}` }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('.col-name')!.textContent);

async function outboxPaths(): Promise<string[]> {
  return (await database!.outbox.toArray()).map((op) => op.path);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

// E3-A4: one of four parts of the composer suite, split so they run in parallel (address, skeleton drawing and moves).

describe('3.4 composer: address', () => {
  it('says so when this device holds no live template of that id, with a way back', async () => {
    database = await freshDb(null);
    renderComposer('019966b0-0037-7000-8000-0000000000ff');
    expect(await screen.findByText('Template não encontrado.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar para Templates' })).toHaveAttribute('href', '/templates');
  });

  it('says so for a removed template too', async () => {
    database = await freshDb({ ...standardTemplate({ id: ID }), removed_at: '2026-09-22T10:00:00.000Z' });
    renderComposer();
    expect(await screen.findByText('Template não encontrado.')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Nome do template' })).toBeNull();
  });

  it('draws the standard template: name, totals, skeleton heading, sections and the autosave note, with no violations', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    const { container } = renderComposer();
    expect(await screen.findByRole('textbox', { name: 'Nome do template' })).toHaveValue('Cabine primária — padrão');
    expect(container.querySelector('.composer-meta')).toHaveTextContent(
      '25 seccionadoras · 21 disjuntores · 11 TP · 11 TC · 8 trafos · 4 cabos de entrada · 9 cabos de saída · 5 para-raios',
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Blocos · 9 seções' })).toBeVisible();
    expect(screen.getByText('Alterações são salvas automaticamente e não alteram relatórios já criados deste template.')).toBeVisible();
    const tags = [...container.querySelectorAll('.block-list[aria-label="Blocos do template"] .block-tag')].map((el) => el.textContent);
    expect(tags).toEqual(['1', '2', '3', '4', '5', '6', '8', '10', '11']);
    expect(within(palette()).getByText('Selecione uma cabine ou coluna.')).toBeVisible();
    // No Save bar: every edit saves itself.
    expect(screen.queryByRole('button', { name: 'Salvar template' })).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
    // axe over the whole standard template (94 blocks, 17 colunas) takes several seconds on
    // its own and outlasted the 15 s default under a loaded full `pnpm verify` run.
  }, 60_000);
});

describe('3.4 composer: skeleton', () => {
  it('adds a cabine and three colunas, renames one and reorders it every keyboard way, announcing each move', async () => {
    database = await freshDb(emptyTemplate(ID, 'v1'));
    renderComposer();
    const addColuna = await screen.findByRole('button', { name: 'Adicionar coluna' });
    expect(addColuna).toHaveAccessibleDescription('Adicione uma cabine primeiro.');

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar cabine' }));
    await screen.findByRole('list', { name: 'Cabines do template' });
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(addColuna).not.toHaveAttribute('aria-disabled'));
      await userEvent.click(addColuna);
      await waitFor(() => expect(screen.queryAllByText(`Coluna ${i + 1}`).length).toBeGreaterThan(0));
    }
    expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3']);

    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear Coluna 3' });
    const field = within(dialog).getByRole('textbox', { name: 'Nome' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Coluna 5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 5']));

    // Alt+Up from anywhere in the row.
    const posBox = screen.getByRole('textbox', { name: 'Posição de Coluna 5' });
    posBox.focus();
    fireEvent.keyDown(posBox, { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 5', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 2 de 3'));

    // The Position box: type a number and press Enter.
    await userEvent.clear(posBox);
    await userEvent.type(posBox, '1{Enter}');
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 5', 'Coluna 1', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 1 de 3'));

    // The Overflow: "Subir" is not offered at the top; "Descer" moves one down.
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções de Coluna 5' }));
    expect(screen.queryByRole('menuitem', { name: 'Subir' })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Descer' }));
    await waitFor(() => expect(colunaNames('Cabine 1')).toEqual(['Coluna 1', 'Coluna 5', 'Coluna 2']));
    await waitFor(() => expect(announcer()).toHaveTextContent('Coluna 5 movida para a posição 2 de 3'));

    const row = await templateRow(database, ID);
    expect(row!.skeleton.map((n) => n.name)).toEqual(['Cabine 1', 'Coluna 1', 'Coluna 5', 'Coluna 2']);
    expect((await outboxPaths()).every((path) => path === `template/${ID}/skeleton`)).toBe(true);
  });

  it('Alt+ArrowUp on a coluna moves the coluna only, never its cabine', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const cabines = () =>
      [...screen.getByRole('list', { name: 'Cabines do template' }).querySelectorAll(':scope > li .block-name')].map((el) => el.textContent);
    const before = await waitFor(() => {
      const names = cabines();
      expect(names).toHaveLength(6);
      return names;
    });
    fireEvent.keyDown(screen.getByRole('button', { name: /^Coluna 3/ }), { key: 'ArrowUp', altKey: true });
    await waitFor(() => expect(colunaNames('1° Subsolo').slice(0, 3)).toEqual(['Coluna 1', 'Coluna 3', 'Coluna 2']));
    expect(cabines()).toEqual(before);
    expect(announcer()).toHaveTextContent('Coluna 3 movida para a posição 2 de 17');
    const row = await templateRow(database, ID);
    expect(row!.skeleton.filter((n) => n.kind === 'cabine').map((n) => n.ref)).toEqual(
      standardTemplate({ id: ID }).skeleton.filter((n) => n.kind === 'cabine').map((n) => n.ref),
    );
  });

  it('a later edit takes the undo of a removal away, so "Desfazer" can never discard it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 3?' })).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText('Coluna 3 removida')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeVisible();

    const toggle = screen.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
    expect(screen.queryByText('Coluna 3 removida')).toBeNull();
  });

});
