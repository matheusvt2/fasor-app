import 'fake-indexeddb/auto';
import { keysOf, PERMISSION_KEYS, SCREEN_UNAVAILABLE_TEXT, SYSTEM_ROLE_IDS, systemRoleRow, type PermissionKey, type RoleRow } from '@app/domain';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { permissionsStatus, PermissionsProvider, RequirePermission, useCan, usePermissions } from './permissions.tsx';
import type { SessionState } from './session.tsx';
import { ToastOutlet, ToastProvider } from './toast.tsx';

/*
 * Story 26.5: the provider reads the signed-in user's role from the device store, live, and
 * answers the kernel's `can`; the guard waits while the role is unknown, renders an allowed
 * screen, and sends a refused one to Home with one Toast.
 */

const USER = '019966c1-0526-7000-8000-000000000001';
const COMPANY = '019966c1-0526-7000-8000-0000000000c0';

let database: AppDatabase | null = null;
let online = true;
let lastResult: 'ran' | null = null;
let counter = 0;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({
    status: 'signed-in',
    user: { id: USER, name: 'Carla', email: 'c@t', companyId: COMPANY, companyName: 'B', council: null, registrationNumber: null, title: null },
    online,
    database,
  }),
}));

vi.mock('./sync.tsx', () => ({
  useSync: () => ({ lastResult }),
}));

async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`019966c1-0526-7000-8000-${(++counter + 0x100).toString(16).padStart(12, '0')}`);
  await db.open();
  return db;
}

async function putRole(db: AppDatabase, row: RoleRow): Promise<void> {
  await db.entities.put({ entity: 'role', id: row.id, relatorio_id: null, project_id: null, removed_at: null, row: row as never });
}

async function putUser(db: AppDatabase, roleId: string): Promise<void> {
  await db.entities.put({
    entity: 'user',
    id: USER,
    relatorio_id: null,
    project_id: null,
    removed_at: null,
    row: { id: USER, name: 'Carla', email: 'c@t', council: null, registration_number: null, title: null, photo_location_enabled: false, role_id: roleId } as never,
  });
}

/** The keys the hook answers yes to, and the provider's status, as text. */
function Probe() {
  const state = usePermissions();
  const held = PERMISSION_KEYS.filter((key) => state?.can(key) ?? true);
  return (
    <p data-testid="probe" data-status={state?.status ?? 'none'}>
      {held.join(',')}
    </p>
  );
}

function HookProbe({ keyName }: { keyName: PermissionKey }) {
  return <p data-testid="hook">{String(useCan(keyName))}</p>;
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function mount(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <PermissionsProvider>
          <Probe />
          <Routes>
            <Route element={<RequirePermission />}>
              <Route path="/" element={<p data-testid="screen">home</p>} />
              <Route path="/templates" element={<p data-testid="screen">templates</p>} />
              <Route path="/relatorio/:id" element={<p data-testid="screen">sumario</p>} />
            </Route>
          </Routes>
          <Where />
        </PermissionsProvider>
        <ToastOutlet />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  online = true;
  lastResult = null;
  database = await freshDb();
});

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('26.5-UNIT-003 the provider', () => {
  it('the pure status: unanswered is loading; a role is ready; no role waits for a cycle or for offline', () => {
    const role = systemRoleRow('consulta');
    expect(permissionsStatus(undefined, true, true)).toBe('loading');
    expect(permissionsStatus(role, false, true)).toBe('ready');
    expect(permissionsStatus(null, false, true)).toBe('loading');
    expect(permissionsStatus(null, true, true)).toBe('ready');
    expect(permissionsStatus(null, false, false)).toBe('ready');
  });

  it('with no provider mounted every key is allowed (a surface rendered alone)', () => {
    render(
      <>
        {PERMISSION_KEYS.map((key) => (
          <HookProbe key={key} keyName={key} />
        ))}
      </>,
    );
    expect(screen.getAllByTestId('hook').map((node) => node.textContent)).toEqual(PERMISSION_KEYS.map(() => 'true'));
  });

  it.each(SYSTEM_ROLE_IDS.map((system) => [system]))('the hook answers the kernel per key for the seeded role %s', async (system) => {
    const role = systemRoleRow(system);
    await putRole(database!, role);
    await putUser(database!, role.id);
    mount('/');
    await waitFor(() => expect(screen.getByTestId('probe').dataset.status).toBe('ready'));
    expect(screen.getByTestId('probe').textContent).toBe(keysOf(role).join(','));
  });

  it('a role row changed by a pull changes the answer with no remount', async () => {
    const campo = systemRoleRow('engenheiro_de_campo');
    const gestor = systemRoleRow('gestor_do_projeto');
    await putRole(database!, campo);
    await putRole(database!, gestor);
    await putUser(database!, campo.id);
    mount('/');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe(keysOf(campo).join(',')));
    expect(screen.getByTestId('probe').textContent).not.toContain('template.edit');
    await act(async () => putUser(database!, gestor.id));
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toContain('template.edit'));
  });

  it('no role on the device after a completed cycle holds no key (fail closed)', async () => {
    lastResult = 'ran';
    mount('/');
    await waitFor(() => expect(screen.getByTestId('probe').dataset.status).toBe('ready'));
    expect(screen.getByTestId('probe').textContent).toBe('');
  });
});

describe('26.5-UNIT-004 the route guard', () => {
  it('renders a screen the role opens', async () => {
    const campo = systemRoleRow('engenheiro_de_campo');
    await putRole(database!, campo);
    await putUser(database!, campo.id);
    mount('/relatorio/019966c1-0526-7000-8000-0000000000aa');
    expect(await screen.findByTestId('screen')).toHaveTextContent('sumario');
  });

  it('sends a refused screen to Home with one Toast', async () => {
    const campo = systemRoleRow('engenheiro_de_campo');
    await putRole(database!, campo);
    await putUser(database!, campo.id);
    mount('/templates');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    expect(screen.getByTestId('screen')).toHaveTextContent('home');
    expect(screen.getAllByText(SCREEN_UNAVAILABLE_TEXT)).toHaveLength(1);
  });

  it('waits while the role is not known, online and before any cycle: it never bounces', async () => {
    mount('/templates');
    await waitFor(() => expect(screen.getByTestId('probe').dataset.status).toBe('loading'));
    expect(screen.getByText(/^Carregando /)).toBeTruthy();
    expect(screen.getByTestId('where')).toHaveTextContent('/templates');
    expect(screen.queryByTestId('screen')).toBeNull();
  });

  it('Home needs no key: it renders while the role is still read', async () => {
    mount('/');
    expect(await screen.findByTestId('screen')).toHaveTextContent('home');
  });
});
