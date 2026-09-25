import 'fake-indexeddb/auto';
import { standardTemplate, type TemplateRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
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


async function outboxPaths(): Promise<string[]> {
  return (await database!.outbox.toArray()).map((op) => op.path);
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

// E3-A4: one of four parts of the composer suite, split so they run in parallel (skeleton removals, undo and focus).

describe('3.4 composer: skeleton', () => {
  it('leaving the composer takes its removal undo away, so a later visit\'s edits can never be discarded by it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 2?' })).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByRole('button', { name: 'Desfazer' })).toBeVisible();

    await userEvent.click(screen.getByRole('link', { name: 'Sair do composer' }));
    expect(await screen.findByText('Lista')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull());
    expect(screen.queryByText('Coluna 2 removida')).toBeNull();
  });

  it('an undo pressed while an edit is queued runs after it, never racing it', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 2' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remover Coluna 2?' })).getByRole('button', { name: 'Remover' }));
    const undo = await screen.findByRole('button', { name: 'Desfazer' });
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 16 colunas · 89 blocos' });
    // Hold the next edit's read of the row, so the edit sits in the queue.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const actual = vi.mocked(templateRow).getMockImplementation()!;
    vi.mocked(templateRow).mockImplementationOnce(async (db, id) => {
      await gate;
      return actual(db, id);
    });
    const toggle = screen.getByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    await userEvent.click(toggle);
    await userEvent.click(undo);
    // Nothing of the undo lands before the queued edit.
    expect((await database.outbox.toArray()).filter((op) => op.path.endsWith('/skeleton'))).toHaveLength(1);
    release();
    await waitFor(async () => expect(await database!.outbox.count()).toBe(5));
    const ops = (await database.outbox.toArray()).sort((a, b) => (a.client_ts < b.client_ts ? -1 : a.client_ts > b.client_ts ? 1 : a.op_id < b.op_id ? -1 : 1));
    // removal (skeleton, blocks), the toggle (skeleton), then the undo (blocks, skeleton).
    expect(ops[2]!.batch_id).not.toBe(ops[3]!.batch_id);
    expect(ops[2]!.path).toBe(`template/${ID}/skeleton`);
    expect(ops[2]!.value).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'enel', agrupar_por_tipo: true })]));
  });

  it('stores Agrupar por tipo on the skeleton cabine', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const toggle = await screen.findByRole('switch', { name: 'Agrupar por tipo Cubículo Enel' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    const row = await templateRow(database, ID);
    expect(row!.skeleton.find((n) => n.ref === 'enel')).toMatchObject({ agrupar_por_tipo: true });
    expect(await outboxPaths()).toEqual([`template/${ID}/skeleton`]);

    // Tapping the row label toggles too (EXPERIENCE.md › Toggle).
    const enel = toggle.closest('li')!;
    await userEvent.click(within(enel).getByText('Agrupar por tipo'));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(await outboxPaths()).toEqual([`template/${ID}/skeleton`, `template/${ID}/skeleton`]);
  });

  it('after a removal the focus goes to the next row\'s Overflow, else the previous one\'s, else the heading', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    const removeVia = async (trigger: string, title: string) => {
      await userEvent.click(await screen.findByRole('button', { name: trigger }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
      const dialog = await screen.findByRole('dialog', { name: `Remover ${title}?` });
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    };

    // A coluna in the middle of its cabine: the coluna after it.
    const coluna3 = (await screen.findByRole('button', { name: 'Mais opções de Coluna 3' })).closest('li')!;
    const after = (coluna3.nextElementSibling as HTMLElement).querySelector('.col-name')!.textContent!;
    await removeVia('Mais opções de Coluna 3', 'Coluna 3');
    await waitFor(() => expect(screen.getByRole('button', { name: `Mais opções de ${after}` })).toHaveFocus());

    // The last section: the one before it.
    const sections = screen.getByRole('list', { name: 'Blocos do template' });
    await removeVia('Mais opções de 11 Certificados', '11 Certificados');
    await waitFor(() => expect(within(sections).getAllByRole('listitem')).toHaveLength(8));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mais opções de 10 Conclusão' })).toHaveFocus());
  });

  it('removes a coluna with its blocks after a Confirm dialog, in one batch, and "Desfazer" restores both fields', async () => {
    database = await freshDb(standardTemplate({ id: ID }));
    renderComposer();
    await userEvent.click(await screen.findByRole('button', { name: 'Mais opções de Coluna 3' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Remover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remover Coluna 3?' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 16 colunas · 87 blocos' });
    const ops = await database.outbox.toArray();
    expect(ops.map((op) => op.path).sort()).toEqual([`template/${ID}/blocks`, `template/${ID}/skeleton`]);
    expect(new Set(ops.map((op) => op.batch_id)).size).toBe(1);

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await screen.findByRole('heading', { level: 2, name: 'Esqueleto de locais · 6 cabines · 17 colunas · 94 blocos' });
    // D-4: the two puts of the removal and the two of the undo each bumped the version.
    expect(await templateRow(database, ID)).toEqual({ ...standardTemplate({ id: ID }), version: 5 });
  });
});
