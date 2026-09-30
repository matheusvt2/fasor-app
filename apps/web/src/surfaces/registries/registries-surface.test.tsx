import 'fake-indexeddb/auto';
import { registryRowSchema, type RegistryRow } from '@app/domain';
import { cleanup, configure, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '../../copy/pt-br.ts';
import { toRecord } from '../../db/commit.ts';
import { readRegistryTab } from '../../db/prefs.ts';
import { openDatabase, REGISTRY_TAB_PREF, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { ToastProvider } from '../../state/toast.tsx';
import { RegistriesSurface } from './registries-surface.tsx';

/*
 * B5 (Story 2.1 test gap): Cadastros over a real device database -- the six tabs, the
 * remembered tab, the arrival that names its tab, and each tab's list, empty state and
 * add entry.
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
vi.mock('../../state/sync.tsx', async () => {
  const { makeSyncState } = await import('../../test/sync-state.ts');
  return { useSync: () => makeSyncState() };
});

configure({ asyncUtilTimeout: 5000 });

async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0073-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

const id = (n: number) => `019966b0-0074-7000-8000-${n.toString(16).padStart(12, '0')}`;

const ROWS: RegistryRow[] = [
  { id: id(1), kind: 'client', name: 'Hospital Central', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
  {
    id: id(2),
    kind: 'instrument',
    code: '2E',
    name: 'Microhmímetro',
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
  },
  { id: id(3), kind: 'manufacturer', name: 'WEG', gender: null, number: null, removed_at: null },
  { id: id(4), kind: 'voltage_class', name: '15', gender: null, number: null, removed_at: null },
].map((row) => registryRowSchema.parse(row));

async function seed(db: AppDatabase): Promise<void> {
  await db.entities.bulkPut(ROWS.map((row) => toRecord(`registry:${row.id}`, row)));
}

function renderSurface(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/cadastros', state }]}>
      <ToastProvider>
        <Routes>
          <Route path="/cadastros" element={<RegistriesSurface />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const tab = (name: string) => screen.getByRole('tab', { name });
const panel = () => screen.getByRole('tabpanel');

afterEach(() => {
  cleanup();
  database?.close();
  database = null;
});

describe('Cadastros tabs (B5)', () => {
  const r = copy.registries;

  it('opens on Instrumentos, lists six tabs and switches the panel with the tab', async () => {
    const user = userEvent.setup();
    database = await freshDb();
    renderSurface();

    const tabs = within(screen.getByRole('tablist', { name: r.tabsLabel })).getAllByRole('tab');
    expect(tabs.map((el) => el.textContent)).toEqual([
      r.tabEmpresa,
      r.tabClientes,
      r.tabInstrumentos,
      r.tabFabricantes,
      r.tabClassesTensao,
      r.tabCriterios,
    ]);
    expect(tab(r.tabInstrumentos)).toHaveAttribute('aria-selected', 'true');
    expect(await within(panel()).findByText(r.instrumentos.emptyText)).toBeInTheDocument();

    await user.click(tab(r.tabEmpresa));
    expect(tab(r.tabEmpresa)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByText(r.empresa.note)).toBeInTheDocument();

    await user.click(tab(r.tabCriterios));
    expect(within(panel()).getByText(r.criterios.note)).toBeInTheDocument();
    expect(within(panel()).getByRole('columnheader', { name: r.criterios.columnCriterion })).toBeInTheDocument();
    expect(within(panel()).getAllByRole('row').length).toBeGreaterThan(1);

    // Arrow keys move between tabs and the panel follows.
    tab(r.tabCriterios).focus();
    await user.keyboard('{ArrowLeft}');
    expect(tab(r.tabClassesTensao)).toHaveAttribute('aria-selected', 'true');
    expect(await within(panel()).findByText(r.classesTensao.emptyText)).toBeInTheDocument();
  });

  it('remembers the last tab on this device and opens on it next time', async () => {
    const user = userEvent.setup();
    database = await freshDb();
    const first = renderSurface();
    await user.click(tab(r.tabFabricantes));
    await waitFor(async () => expect(await readRegistryTab(database!)).toBe('fabricantes'));
    first.unmount();

    renderSurface();
    await waitFor(() => expect(tab(r.tabFabricantes)).toHaveAttribute('aria-selected', 'true'));
    expect(await within(panel()).findByText(r.fabricantes.emptyText)).toBeInTheDocument();
  });

  it('an arrival that names its tab wins over the remembered one, with a new instrument open', async () => {
    database = await freshDb();
    await database.local_prefs.put({ key: REGISTRY_TAB_PREF, value: 'clientes' });
    renderSurface({ tab: 'instrumentos', newInstrument: true, returnTo: '/relatorio/x/dados' });
    expect(tab(r.tabInstrumentos)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()).getByRole('heading', { name: r.instrumentos.newInstrument })).toBeInTheDocument();
    // The remembered tab is read and ignored.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(tab(r.tabInstrumentos)).toHaveAttribute('aria-selected', 'true');
  });

  it.each([
    ['clientes', r.tabClientes, r.clientes.emptyText, r.clientes.empty, r.clientes.newClient],
    ['instrumentos', r.tabInstrumentos, r.instrumentos.emptyText, r.instrumentos.empty, r.instrumentos.newInstrument],
    ['fabricantes', r.tabFabricantes, r.fabricantes.emptyText, r.fabricantes.empty, r.fabricantes.panel.newRow],
    ['classes-tensao', r.tabClassesTensao, r.classesTensao.emptyText, r.classesTensao.empty, r.classesTensao.panel.newRow],
  ])('%s: an empty registry shows its sentence and one action opening a new entry', async (id, tabName, emptyText, action, heading) => {
    const user = userEvent.setup();
    database = await freshDb();
    renderSurface();
    await user.click(tab(tabName));
    // The tab choice is written to `local_prefs` asynchronously; wait for it so the
    // teardown's `close()` never lands under that write (a DatabaseClosedError under load).
    await waitFor(async () => expect(await readRegistryTab(database!)).toBe(id));
    expect(await within(panel()).findByText(emptyText)).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: action }));
    expect(within(panel()).getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it.each([
    ['clientes', r.tabClientes, 'Hospital Central, CNPJ não informado', r.clientes.newClient, 'Hospital Central'],
    ['instrumentos', r.tabInstrumentos, '2E — Microhmímetro', r.instrumentos.newInstrument, '2E — Microhmímetro'],
    ['fabricantes', r.tabFabricantes, 'WEG', r.fabricantes.newRow, 'WEG'],
    ['classes-tensao', r.tabClassesTensao, '15 kV', r.classesTensao.newRow, '15 kV'],
  ])('%s: lists its rows, opens one, and adds from the toolbar', async (id, tabName, rowName, toolbarAction, rowHeading) => {
    const user = userEvent.setup();
    database = await freshDb();
    await seed(database);
    renderSurface();
    await user.click(tab(tabName));
    await waitFor(async () => expect(await readRegistryTab(database!)).toBe(id));

    const list = await within(panel()).findByRole('list', { name: tabName });
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(1));
    const row = within(list).getByRole('button', { name: rowName });
    await user.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(await within(panel()).findByRole('heading', { name: rowHeading })).toBeInTheDocument();

    await user.click(within(panel()).getByRole('button', { name: toolbarAction }));
    expect(row).toHaveAttribute('aria-pressed', 'false');
  });
});
