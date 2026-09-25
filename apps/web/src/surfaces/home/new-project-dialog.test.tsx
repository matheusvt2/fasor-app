import 'fake-indexeddb/auto';
import type { ClientRow, ProjectRow } from '@app/domain';
import { configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { clientRows, projectRows } from '../../db/home-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { NewProjectDialog } from './new-project-dialog.tsx';

/*
 * Story 4.1: Home's "Novo relatório" dialog over a real device database, read through the
 * same live queries Home passes it, so an inline create shows up in the options at once. A
 * new client is one `registry/client/{id}` create, a new obra one `project/{id}` create; a
 * name typed like an existing entry picks that entry instead of writing a duplicate.
 */

const COMPANY = '0b000000-0000-7000-8000-00000000000b';
const USER = '0b000000-0000-7000-8000-0000000000b1';
const CLIENT_A = '019966b0-0064-7000-8000-000000000001';
const CLIENT_B = '019966b0-0064-7000-8000-000000000002';
const PROJECT_A1 = '019966b0-0064-7000-8000-000000000011';
const PROJECT_A2_REMOVED = '019966b0-0064-7000-8000-000000000012';
const PROJECT_B1 = '019966b0-0064-7000-8000-000000000021';

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

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0065-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const client = (id: string, name: string): ClientRow => ({ id, kind: 'client', name, cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null });
const project = (id: string, clientId: string, site: string, removed_at: string | null = null): ProjectRow => ({ id, client_id: clientId, name: site, site, removed_at });

async function seed(db: AppDatabase) {
  await db.entities.bulkPut([
    toRecord(`registry:${CLIENT_A}`, client(CLIENT_A, 'Seguradora Exemplo S.A.')),
    toRecord(`registry:${CLIENT_B}`, client(CLIENT_B, 'Condomínio Beta')),
    toRecord(`project:${PROJECT_A1}`, project(PROJECT_A1, CLIENT_A, 'Blocos Norte e Sul')),
    toRecord(`project:${PROJECT_A2_REMOVED}`, project(PROJECT_A2_REMOVED, CLIENT_A, 'Anexo demolido', '2026-09-01T00:00:00.000Z')),
    toRecord(`project:${PROJECT_B1}`, project(PROJECT_B1, CLIENT_B, 'Torre Norte')),
  ]);
}

const NO_CLIENTS: ClientRow[] = [];
const NO_PROJECTS: ProjectRow[] = [];

/** Home's side of the dialog: the live registry and project rows of the device. */
function Harness({ onClose }: { onClose: () => void }) {
  const db = database!;
  const clients = useLiveQuery(() => clientRows(db), [db], NO_CLIENTS);
  const projects = useLiveQuery(() => projectRows(db), [db], NO_PROJECTS);
  return <NewProjectDialog clients={clients} projects={projects} onClose={onClose} />;
}

/** Where "Continuar" went, and with which history state. */
function ProjectProbe() {
  const location = useLocation();
  return (
    <p data-testid="project-route">
      {location.pathname} {JSON.stringify(location.state)}
    </p>
  );
}

function renderDialog() {
  const onClose = vi.fn();
  render(
    <MemoryRouter initialEntries={['/']}>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Harness onClose={onClose} />} />
          <Route path="/project/:id" element={<ProjectProbe />} />
        </Routes>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
  return onClose;
}

const dialog = () => screen.getByRole('dialog', { name: 'Novo relatório' });
const clientBox = () => within(dialog()).getByRole('combobox', { name: 'Cliente' });
const siteBox = () => within(dialog()).getByRole('combobox', { name: 'Local (obra)' });
const proceed = () => within(dialog()).getByRole('button', { name: 'Continuar' });
/** Opens one of the two lists by its chevron: 0 the client's, 1 the obra's. */
const openList = (which: 0 | 1) => userEvent.click(within(dialog()).getAllByRole('button', { name: /Abrir lista/ })[which]!);
const optionNames = async () => (await screen.findAllByRole('option')).map((option) => option.textContent);

/**
 * Closes an option list an inline create left open: React Aria reopens a focused Combobox
 * when its options change under an uncommitted input value, which the live query does the
 * moment the created row lands. A click beside the field is what a person does next.
 */
async function settleLists() {
  await userEvent.click(within(dialog()).getByText('Novo relatório', { selector: 'h2' }));
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
}

async function pickClient(name: string) {
  await openList(0);
  await userEvent.click(await screen.findByRole('option', { name }));
  await waitFor(() => expect(clientBox()).toHaveValue(name));
}

afterEach(() => {
  database?.close();
  database = null;
});

describe('4.1 NewProjectDialog', () => {
  it('creates a client inline as one registry/client create of company scope and says so', async () => {
    database = await freshDb();
    await seed(database);
    renderDialog();
    await userEvent.type(clientBox(), 'Condomínio Teste');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Condomínio Teste”' }));
    expect(await screen.findByText('Cliente criado no cadastro de Clientes')).toBeVisible();
    await waitFor(() => expect(clientBox()).toHaveValue('Condomínio Teste'));
    await settleLists();
    const ops = await database.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'create', scope: 'company', company_id: COMPANY, actor_id: USER });
    expect(ops[0]!.path).toMatch(/^registry\/client\/[0-9a-f-]{36}$/);
    expect(ops[0]!.value).toMatchObject({ kind: 'client', name: 'Condomínio Teste' });
    // The new client is chosen: the obra field is open for it, and the row is in the list.
    await waitFor(() => expect(siteBox()).not.toHaveAttribute('aria-disabled'));
    await openList(0);
    expect(await optionNames()).toContain('Condomínio Teste');
  });

  it('creates an obra inline as one project create under the chosen client and continues with openNew', async () => {
    database = await freshDb();
    await seed(database);
    const onClose = renderDialog();
    await pickClient('Seguradora Exemplo S.A.');
    await userEvent.type(siteBox(), 'Torre Sul');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “Torre Sul”' }));
    await waitFor(() => expect(siteBox()).toHaveValue('Torre Sul'));
    await settleLists();
    const ops = await database.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]!.path).toMatch(/^project\/[0-9a-f-]{36}$/);
    expect(ops[0]).toMatchObject({ kind: 'create', scope: 'company' });
    expect(ops[0]!.value).toMatchObject({ client_id: CLIENT_A, site: 'Torre Sul', name: 'Torre Sul', removed_at: null });
    const projectId = ops[0]!.path.split('/')[1]!;
    await waitFor(() => expect(proceed()).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(proceed());
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByTestId('project-route')).toHaveTextContent(`/project/${projectId} {"openNew":true}`);
  });

  it('lists only the chosen client\'s live obras and starts the obra over when the client changes', async () => {
    database = await freshDb();
    await seed(database);
    renderDialog();
    expect(siteBox()).toHaveAttribute('aria-disabled', 'true');
    await pickClient('Seguradora Exemplo S.A.');
    await openList(1);
    expect(await optionNames()).toEqual(['Blocos Norte e Sul']);
    await userEvent.click(screen.getByRole('option', { name: 'Blocos Norte e Sul' }));
    await waitFor(() => expect(siteBox()).toHaveValue('Blocos Norte e Sul'));
    expect(proceed()).not.toHaveAttribute('aria-disabled');

    await pickClient('Condomínio Beta');
    expect(siteBox()).toHaveValue('');
    expect(proceed()).toHaveAttribute('aria-disabled', 'true');
    expect(proceed()).toHaveAccessibleDescription('Continuar: falta a obra');
    await openList(1);
    expect(await optionNames()).toEqual(['Torre Norte']);
  });

  it('an existing client and obra continue to the Project with no openNew state and no op', async () => {
    database = await freshDb();
    await seed(database);
    const onClose = renderDialog();
    await pickClient('Seguradora Exemplo S.A.');
    await openList(1);
    await userEvent.click(await screen.findByRole('option', { name: 'Blocos Norte e Sul' }));
    await waitFor(() => expect(proceed()).not.toHaveAttribute('aria-disabled'));
    await userEvent.click(proceed());
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByTestId('project-route')).toHaveTextContent(`/project/${PROJECT_A1} null`);
    expect(await database.outbox.count()).toBe(0);
  });

  it('a name typed exactly like an existing client picks that client instead of creating a second one', async () => {
    database = await freshDb();
    await seed(database);
    renderDialog();
    await userEvent.type(clientBox(), 'seguradora exemplo s.a.');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “seguradora exemplo s.a.”' }));
    await waitFor(() => expect(clientBox()).toHaveValue('Seguradora Exemplo S.A.'));
    expect(screen.queryByText('Cliente criado no cadastro de Clientes')).toBeNull();
    expect(await database.outbox.count()).toBe(0);
    expect(siteBox()).not.toHaveAttribute('aria-disabled');
    // The same for an obra of that client.
    await userEvent.type(siteBox(), 'blocos norte e sul ');
    await userEvent.click(await screen.findByRole('option', { name: 'Criar “blocos norte e sul”' }));
    await waitFor(() => expect(siteBox()).toHaveValue('Blocos Norte e Sul'));
    await settleLists();
    expect(await database.outbox.count()).toBe(0);
    expect(proceed()).not.toHaveAttribute('aria-disabled');
  });
});
