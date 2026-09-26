import type { InstrumentRow } from '@app/domain';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../state/toast.tsx';
import type { SessionState } from '../../state/session.tsx';
import { InstrumentPanel } from './instrument-panel.tsx';

/*
 * Review finding (Story 2.1 internal review): AC4's "referenced instrument offers only
 * Arquivar, unreferenced offers Remover behind a Confirm dialog" branch had no test
 * exercising the panel's actual conditional rendering (only the pure kernel predicate
 * `isInstrumentReferenced` was covered). `database: null` keeps every commit handler a
 * no-op (each returns before touching Dexie/toast), so this only needs to assert what
 * renders and what the Confirm dialog gates — never a real op commit.
 */

const session: SessionState = {
  status: 'signed-in',
  user: {
    id: '0a000000-0000-7000-8000-0000000000a1',
    name: 'Ana Alves',
    email: 'a@teste.local',
    companyId: '0a000000-0000-7000-8000-00000000000a',
    companyName: 'Empresa A de Teste',
    council: null,
    registrationNumber: null,
    title: null,
  },
  online: true,
  reAuthRequired: false,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  dismissReAuth: vi.fn(),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../state/sync.tsx', async () => {
  const { makeSyncState } = await import('../../test/sync-state.ts');
  return { useSync: () => makeSyncState() };
});

const instrument: InstrumentRow = {
  id: '0a000000-0000-7000-8000-0000000000b1',
  kind: 'instrument',
  code: '2E',
  name: 'Megôhmetro digital',
  manufacturer: null,
  model: null,
  serial: null,
  cert_number: null,
  laboratory: null,
  calibrated_at: null,
  calibration_interval_months: null,
  rbc_accredited: null,
  test_isolacao: null,
  test_resistencia_contato: null,
  test_relacao_transformacao: null,
  certificate_file_id: null,
  removed_at: null,
};

function renderPanel(referenced: boolean) {
  return render(
    <ToastProvider>
      <InstrumentPanel instrumentId={instrument.id} instrument={instrument} referenced={referenced} onClose={vi.fn()} />
    </ToastProvider>,
  );
}

afterEach(cleanup);

describe('InstrumentPanel — AC4 referenced vs unreferenced deletion', () => {
  it('offers only Arquivar, with the reason line, and no Remover button when referenced', () => {
    renderPanel(true);
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remover$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/referenciado em fichas/)).toBeInTheDocument();
  });

  it('offers Remover (not Arquivar) and gates it behind a Confirm dialog when unreferenced', async () => {
    const user = userEvent.setup();
    renderPanel(false);
    expect(screen.queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument();
    const removeButton = screen.getByRole('button', { name: /^Remover$/ });

    // No dialog until the button is pressed.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(removeButton);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Remover 2E?');
  });
});
