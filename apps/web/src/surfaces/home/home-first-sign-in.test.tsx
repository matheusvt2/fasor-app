import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { PermissionsProvider } from '../../state/permissions.tsx';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { HomeSurface } from './home-surface.tsx';

/*
 * Fix batch e30h, item 6 (Story 30.5's `settled`): a first sign-in behind a dead network that the browser still calls
 * online. The device holds no role yet (the company pull never landed), so the permissions read is `loading` until a
 * sync cycle completes. The engine ends a failed cycle as `ran` (`sync/engine.ts`, the cycle's `finally`; every request
 * is bounded by `requestHeadersTimeoutMs`), so the permissions read ends and the Home leaves its loading note: it never
 * stays on "Carregando relatórios…" forever. What it draws then is the fail-closed Home of Story 26.5 (a role it does
 * not know holds no key), recorded here as it is.
 */

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: '019966b0-0031-7000-8000-0000000000e3', name: 'Bruno Matsui', email: 'b@teste.local', companyId: 'c1', companyName: 'Empresa', council: null, registrationNumber: null, title: null },
  online: true,
  reAuthRequired: false,
  aiFeatures: true,
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  settled: true,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));

function Shell({ sync }: { sync: SyncState }) {
  return (
    <MemoryRouter>
      <SyncContext value={sync}>
        <PermissionsProvider>
          <ToastProvider>
            <HomeSurface />
            <ToastOutlet />
          </ToastProvider>
        </PermissionsProvider>
      </SyncContext>
    </MemoryRouter>
  );
}

afterEach(async () => {
  database?.close();
  await database?.delete();
  database = null;
});

describe('e30h-UNIT-006 Home on a first sign-in whose first sync cycle fails while the browser says online', () => {
  it('leaves the loading note once the failed cycle ends, and never draws "Novo relatório" for a role it does not hold', async () => {
    database = openDatabase('019966b0-0031-7000-8000-0000000000e3');
    await database.delete();
    database = openDatabase('019966b0-0031-7000-8000-0000000000e3');
    // The first cycle is running: nothing has completed in this session.
    const running = makeSyncState({ running: true, lastResult: null, lastFailure: null });
    const { rerender } = render(<Shell sync={running} />);
    await waitFor(() => expect(screen.getByText('Carregando relatórios…')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Novo relatório' })).toBeNull();

    // The cycle ends failed (the network never answered): the engine reports it as `ran`, with its failure.
    await act(async () => rerender(<Shell sync={makeSyncState({ running: false, lastResult: 'ran', lastFailure: { kind: 'network' } })} />));
    await waitFor(() => expect(screen.queryByText('Carregando relatórios…')).toBeNull());
    // Fail closed (Story 26.5): with no role on the device no key is held, so neither the list nor its button is drawn.
    expect(screen.queryByRole('button', { name: 'Novo relatório' })).toBeNull();
  });
});
