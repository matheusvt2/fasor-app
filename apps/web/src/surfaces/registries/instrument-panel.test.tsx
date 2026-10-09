import 'fake-indexeddb/auto';
import type { InstrumentRow } from '@app/domain';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBatch } from '../../db/commit.ts';
import { openDatabase } from '../../db/schema.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
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
  aiFeatures: true,
  database: null,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  savePhotoLocation: vi.fn(async () => {}),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
};

vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
// Ledger 310: a test can refuse one write (a pending, refused value); every other write goes through.
vi.mock('../../db/commit.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db/commit.ts')>();
  return { ...actual, commitBatch: vi.fn(actual.commitBatch) };
});
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

afterEach(() => {
  cleanup();
  session.database = null;
});

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

describe('InstrumentPanel — ledger 310, another device edits the open instrument', () => {
  const panel = (row: InstrumentRow) => (
    <ToastProvider>
      <InstrumentPanel instrumentId={row.id} instrument={row} referenced={false} onClose={vi.fn()} />
    </ToastProvider>
  );

  it('re-seeds the fields nobody is editing from the live row; the field being edited keeps its text', async () => {
    const user = userEvent.setup();
    const { rerender } = render(panel(instrument));
    const model = screen.getByRole('textbox', { name: 'Tipo / modelo' });
    const serial = screen.getByRole('textbox', { name: 'Nº de série' });
    await user.click(model);
    await user.keyboard('MD-5060');

    rerender(panel({ ...instrument, name: 'Megôhmetro', model: 'DMG10Ki', serial: 'IN919021' }));
    expect(screen.getByRole('textbox', { name: 'Nome' })).toHaveValue('Megôhmetro');
    expect(serial).toHaveValue('IN919021');
    expect(model).toHaveValue('MD-5060');
  });
  it('re-seeds a number field and a test default field nobody is editing', () => {
    const { rerender } = render(panel({ ...instrument, calibration_interval_months: 12 }));
    const interval = screen.getByRole('spinbutton', { name: /^Intervalo de calibração \(meses\)/ });
    expect(interval).toHaveValue(12);
    rerender(panel({ ...instrument, calibration_interval_months: 24, test_isolacao: { raw: '5', unit: 'kV' } }));
    expect(interval).toHaveValue(24);
    expect(screen.getByRole('textbox', { name: 'Padrão de ensaio — Isolação — Valor' })).toHaveValue('5');
    expect(screen.getByRole('textbox', { name: 'Padrão de ensaio — Isolação — Unidade' })).toHaveValue('kV');
  });

  it('a change that lands while the field is focused but untouched is applied when the field is left', async () => {
    const user = userEvent.setup();
    const { rerender } = render(panel({ ...instrument, serial: 'A-1' }));
    const serial = screen.getByRole('textbox', { name: 'Nº de série' });
    await user.click(serial);
    rerender(panel({ ...instrument, serial: 'B-2' }));
    expect(serial).toHaveValue('A-1');
    await user.tab();
    expect(serial).toHaveValue('B-2');
  });

  it('a left field holding a refused write keeps its text over the live row', async () => {
    const user = userEvent.setup();
    const database = openDatabase('0a000000-0000-7000-8000-0000000000c9');
    await database.delete();
    session.database = openDatabase('0a000000-0000-7000-8000-0000000000c9');
    vi.mocked(commitBatch).mockRejectedValueOnce(Object.assign(new Error('refused'), { name: 'UnknownError' }));
    const withToasts = (row: InstrumentRow) => (
      <ToastProvider>
        <InstrumentPanel instrumentId={row.id} instrument={row} referenced={false} onClose={vi.fn()} />
        <ToastOutlet />
      </ToastProvider>
    );
    const { rerender } = render(withToasts(instrument));
    const model = screen.getByRole('textbox', { name: 'Tipo / modelo' });
    await user.click(model);
    await user.keyboard('MD-5060');
    await user.tab();
    await waitFor(() => expect(screen.getByText('Não foi possível salvar. Tente de novo.')).toBeInTheDocument());

    rerender(withToasts({ ...instrument, model: 'DMG10Ki' }));
    expect(model).toHaveValue('MD-5060');
    session.database.close();
  });
});

describe('R8LAY DH-3 a stored manufacturer Fabricantes does not hold', () => {
  it('shows the name and "Criar Hi-Tech?"; the tap writes the registry word only, then the chip is selected', async () => {
    const user = userEvent.setup();
    const name = '0a000000-0000-7000-8000-0000000000d3';
    await openDatabase(name).delete();
    session.database = openDatabase(name);
    vi.mocked(commitBatch).mockClear();
    render(
      <ToastProvider>
        <InstrumentPanel instrumentId={instrument.id} instrument={{ ...instrument, manufacturer: 'Hi-Tech' }} referenced={false} onClose={vi.fn()} />
      </ToastProvider>,
    );
    const line = screen.getByText('Hi-Tech', { selector: '.word-unregistered-name' });
    expect(line.closest('.word-unregistered')).toHaveClass('helper');
    await user.click(screen.getByRole('button', { name: 'Criar Hi-Tech?' }));
    expect(vi.mocked(commitBatch)).toHaveBeenCalledTimes(1);
    const ops = vi.mocked(commitBatch).mock.calls[0]![1];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: 'create', value: { kind: 'manufacturer', name: 'Hi-Tech' } });
    expect(ops[0]!.path).toMatch(/^registry\/manufacturer\//);
    expect(screen.queryByRole('button', { name: 'Criar Hi-Tech?' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hi-Tech', pressed: true })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Criar Hi-Tech?' })).toBeNull();
    session.database.close();
  });

  it('the Combobox focused, then "Criar Hi-Tech?" tapped: exactly one registry create', async () => {
    const user = userEvent.setup();
    const name = '0a000000-0000-7000-8000-0000000000d4';
    await openDatabase(name).delete();
    session.database = openDatabase(name);
    vi.mocked(commitBatch).mockClear();
    render(
      <ToastProvider>
        <InstrumentPanel instrumentId={instrument.id} instrument={{ ...instrument, manufacturer: 'Hi-Tech' }} referenced={false} onClose={vi.fn()} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Outro…' }));
    expect(screen.getByRole('combobox', { name: 'Fabricante' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Criar Hi-Tech?' }));
    await waitFor(() => expect(vi.mocked(commitBatch)).toHaveBeenCalledTimes(1));
    const creates = vi.mocked(commitBatch).mock.calls.flatMap((call) => call[1]).filter((op) => op.kind === 'create' && op.path.startsWith('registry/manufacturer/'));
    expect(creates).toHaveLength(1);
    session.database.close();
  });

  it('a manufacturer the registry holds shows no such line', () => {
    renderPanel(false);
    expect(document.querySelector('.word-unregistered')).toBeNull();
  });
});
