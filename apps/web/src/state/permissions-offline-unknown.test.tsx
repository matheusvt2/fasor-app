import 'fake-indexeddb/auto';
import { ROLE_UNKNOWN_TEXT, screenNeedsKnownRole, systemRoleRow } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { PermissionsProvider, RequirePermission } from './permissions.tsx';
import type { SessionState } from './session.tsx';
import { ToastProvider } from './toast.tsx';

/*
 * Story 26.10 (deferred row of Story 26.5, `e2e/home.spec.ts` 1.6-E2E-003): offline, with the user's own
 * role not on the device, a screen says that his access loads when the device is connected, instead of an
 * empty main; Conta and Sync status stay open; a known role renders as before.
 */

const USER = '019966c1-0528-7000-8000-000000000001';
const COMPANY = '019966c1-0528-7000-8000-0000000000c0';

let database: AppDatabase | null = null;
let online = false;
let counter = 0;

vi.mock('./session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({
    status: 'signed-in',
    user: { id: USER, name: 'Carla', email: 'c@t', companyId: COMPANY, companyName: 'B', council: null, registrationNumber: null, title: null },
    online,
    database,
  }),
}));

vi.mock('./sync.tsx', () => ({ useSync: () => ({ lastResult: null }) }));

function mount(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ToastProvider>
        <PermissionsProvider>
          <Routes>
            <Route element={<RequirePermission />}>
              <Route path="/" element={<p data-testid="screen">home</p>} />
              <Route path="/account" element={<p data-testid="screen">conta</p>} />
              <Route path="/sync" element={<p data-testid="screen">sync</p>} />
            </Route>
          </Routes>
        </PermissionsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(async () => {
  online = false;
  database = openDatabase(`019966c1-0528-7000-8000-${(++counter + 0x300).toString(16).padStart(12, '0')}`);
  await database.open();
});

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('26.10-WEB-OFFLINE the role is unknown while offline', () => {
  it('Home says the access loads when connected, never an empty main', async () => {
    mount('/');
    expect(await screen.findByText(ROLE_UNKNOWN_TEXT)).toBeTruthy();
    expect(screen.getByText(ROLE_UNKNOWN_TEXT)).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('screen')).toBeNull();
  });

  it('Conta and Sync status stay open without a role', async () => {
    mount('/account');
    expect(await screen.findByTestId('screen')).toHaveTextContent('conta');
    cleanup();
    mount('/sync');
    expect(await screen.findByTestId('screen')).toHaveTextContent('sync');
    expect(screen.queryByText(ROLE_UNKNOWN_TEXT)).toBeNull();
  });

  it('a role the device holds renders the screen as before', async () => {
    const campo = systemRoleRow('engenheiro_de_campo');
    await database!.entities.put({ entity: 'role', id: campo.id, relatorio_id: null, project_id: null, removed_at: null, row: campo as never });
    await database!.entities.put({
      entity: 'user',
      id: USER,
      relatorio_id: null,
      project_id: null,
      removed_at: null,
      row: { id: USER, name: 'Carla', email: 'c@t', council: null, registration_number: null, title: null, photo_location_enabled: false, role_id: campo.id } as never,
    });
    mount('/');
    expect(await screen.findByTestId('screen')).toHaveTextContent('home');
    expect(screen.queryByText(ROLE_UNKNOWN_TEXT)).toBeNull();
  });

  it('online, the notice is never drawn (the loading note and the fail-closed rule are the provider\'s)', async () => {
    online = true;
    mount('/');
    await waitFor(() => expect(screen.queryByText(ROLE_UNKNOWN_TEXT)).toBeNull());
  });

  it('the kernel names the screens that open with no role', () => {
    expect(['/', '/project/x', '/cadastros', '/relatorio/x'].every(screenNeedsKnownRole)).toBe(true);
    expect(['/account', '/sync', '/login', '/account/', '/__fixture/field'].some(screenNeedsKnownRole)).toBe(false);
  });
});
