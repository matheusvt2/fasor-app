import 'fake-indexeddb/auto';
import { registryRowSchema, type InstrumentRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { InstrumentosTab } from './instrumentos-tab.tsx';

/*
 * B5 (Story 2.1 test gap): the Instrumentos tab over a real device database -- the row's
 * code, its calibration due-date state (expired first, amber clause; valid; none yet), the
 * empty state's one action, and a row or "Novo instrumento" opening the edit panel.
 */

let database: AppDatabase | null = null;
let counter = 0;

const session = (): SessionState => ({
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
  database,
  signIn: vi.fn(),
  signOut: vi.fn(async () => {}),
  saveRegistration: vi.fn(async () => {}),
  recoveryNeeded: false,
  dismissRecovery: vi.fn(),
});

vi.mock('../../state/session.tsx', () => ({ useSession: () => session() }));
vi.mock('../../state/sync.tsx', async () => {
  const { makeSyncState } = await import('../../test/sync-state.ts');
  return { useSync: () => makeSyncState() };
});

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0071-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const instrument = (id: string, extra: Partial<InstrumentRow>): InstrumentRow =>
  registryRowSchema.parse({
    id,
    kind: 'instrument',
    code: 'X',
    name: 'Instrumento',
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
    ...extra,
  }) as InstrumentRow;

// Far from any run date: valid until 2021 is expired, valid until 2066 is not near expiry.
const EXPIRED = instrument('019966b0-0072-7000-8000-000000000001', {
  code: '7M',
  name: 'Megôhmetro digital',
  model: 'MI-10',
  manufacturer: 'Minipa',
  serial: 'S-77',
  calibrated_at: '2020-01-15',
  calibration_interval_months: 12,
});
const VALID = instrument('019966b0-0072-7000-8000-000000000002', {
  code: '2E',
  name: 'Microhmímetro',
  calibrated_at: '2026-01-10',
  calibration_interval_months: 480,
});
const UNCALIBRATED = instrument('019966b0-0072-7000-8000-000000000003', { code: '1A', name: 'Terrômetro' });
const REMOVED = instrument('019966b0-0072-7000-8000-000000000004', {
  code: '0Z',
  name: 'Arquivado',
  removed_at: '2026-09-01T12:00:00.000Z',
});

async function seed(db: AppDatabase, rows: InstrumentRow[]): Promise<void> {
  await db.entities.bulkPut(rows.map((row) => toRecord(`registry:${row.id}`, row)));
}

function renderTab(props: Parameters<typeof InstrumentosTab>[0] = {}) {
  return render(
    <ToastProvider>
      <InstrumentosTab {...props} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('InstrumentosTab (B5)', () => {
  const t = copy.registries.instrumentos;

  it('lists live instruments expired first, each with its code and due-date state', async () => {
    database = await freshDb();
    await seed(database, [VALID, UNCALIBRATED, EXPIRED, REMOVED]);
    renderTab();

    const list = await screen.findByRole('list', { name: copy.registries.tabInstrumentos });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(3));
    const rows = within(list).getAllByRole('button');
    // Expired first, then by code; the removed one is not listed.
    expect(rows.map((row) => row.querySelector('strong')?.textContent)).toEqual(['7M', '1A', '2E']);

    const [expired, uncalibrated, valid] = rows as [HTMLElement, HTMLElement, HTMLElement];
    expect(expired.querySelector('.rr-primary')).toHaveTextContent('7M — Megôhmetro digital MI-10');
    expect(expired.querySelector('.rr-secondary')).toHaveTextContent('Minipa · série S-77 · Vencida em 15/01/2021');
    expect(expired.querySelector('.rr-expired')).toHaveTextContent('Vencida em 15/01/2021');
    expect(expired).toHaveAccessibleName('7M — Megôhmetro digital MI-10, Vencida em 15/01/2021');

    expect(valid.querySelector('.rr-secondary')).toHaveTextContent('Válida até 10/01/2066');
    expect(valid.querySelector('.rr-expired')).toBeNull();

    // No calibration data yet: no clause, never flagged.
    expect(uncalibrated.querySelector('.rr-secondary')).toHaveTextContent(/^$/);
    expect(uncalibrated).toHaveAccessibleName('1A — Terrômetro');

    // With rows, the toolbar's "Novo instrumento" is the action and there is no empty state.
    expect(screen.getByRole('button', { name: t.newInstrument })).toBeInTheDocument();
    expect(screen.queryByText(t.emptyText)).toBeNull();
    for (const row of rows) expect(row).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the panel of the row pressed, by tap and by keyboard', async () => {
    const user = userEvent.setup();
    database = await freshDb();
    await seed(database, [VALID, EXPIRED]);
    renderTab();

    const expired = await screen.findByRole('button', { name: /^7M/ });
    await user.click(expired);
    expect(await screen.findByRole('heading', { name: '7M — Megôhmetro digital' })).toBeInTheDocument();
    expect(expired).toHaveAttribute('aria-pressed', 'true');

    const valid = screen.getByRole('button', { name: /^2E/ });
    valid.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { name: '2E — Microhmímetro' })).toBeInTheDocument();
    expect(valid).toHaveAttribute('aria-pressed', 'true');
    expect(expired).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: t.close }));
    expect(screen.queryByRole('heading', { name: '2E — Microhmímetro' })).toBeNull();
    expect(valid).toHaveAttribute('aria-pressed', 'false');

    // "Novo instrumento" opens an empty panel for a new one.
    await user.click(screen.getByRole('button', { name: t.newInstrument }));
    expect(screen.getByRole('heading', { name: t.newInstrument })).toBeInTheDocument();
  });

  it('an empty registry shows its sentence and one action, which opens a new panel', async () => {
    const user = userEvent.setup();
    database = await freshDb();
    renderTab();

    expect(await screen.findByText(t.emptyText)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: copy.registries.tabInstrumentos })).toBeNull();
    expect(screen.queryByRole('button', { name: t.newInstrument })).toBeNull();
    await user.click(screen.getByRole('button', { name: t.empty }));
    expect(screen.getByRole('heading', { name: t.newInstrument })).toBeInTheDocument();
  });

  it('an arrival asking for a new instrument opens its panel at once', async () => {
    database = await freshDb();
    renderTab({ openNew: true });
    expect(screen.getByRole('heading', { name: t.newInstrument })).toBeInTheDocument();
  });
});
