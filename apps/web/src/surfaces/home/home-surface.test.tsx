import 'fake-indexeddb/auto';
import type { RelatorioRow, RelatorioStatus, RelatorioSummary } from '@app/domain';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { HomeSurface } from './home-surface.tsx';

/*
 * Home over a real device database: the board counts, the tile filter, the three device
 * states, the current-card ordering, the empty state and the cold-open offline toast.
 * Nothing here computes a count or a sentence — every assertion is against what the
 * kernel wrote.
 */

const ids = (() => {
  let n = 0;
  return () => `019966b0-0030-7000-8000-${(++n).toString(16).padStart(12, '0')}`;
})();

const PROJECT = ids();
const CLIENT = ids();
const TEMPLATE = ids();
const R_FIELD_HERE = ids();
const R_FIELD_AWAY = ids();
const R_DRAFT = ids();
const R_ISSUED = ids();

let database: AppDatabase | null = null;

const session = (): SessionState => ({
  status: 'signed-in',
  user: { id: 'u1', name: 'Bruno Matsui', email: 'b@teste.local', companyId: 'c1', companyName: 'Empresa', council: null, registrationNumber: null, title: null },
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

const syncRelatorio = vi.fn(async () => 'ran' as const);

function syncState(over: Partial<SyncState> = {}): SyncState {
  return {
    counts: { pending: 0, sent: 0, dead: 0, sheets_pending: 0, photos_pending: 0 },
    badgeState: 'ok',
    pendingText: '',
    pendingCount: 0,
    online: true,
    running: false,
    outdated: false,
    lastResult: 'ran',
    lastFailure: null,
    unreachable: null,
    lastSyncAt: null,
    lastPushAt: [],
    supersededCount: 0,
    deviceId: 'tablet-1',
    userNames: {},
    summaryRelatorios: [],
    syncNow: vi.fn(async () => 'ran' as const),
    syncRelatorio,
    resendDead: vi.fn(async () => {}),
    fetchFile: vi.fn(async () => new Blob()),
    ...over,
  };
}

function relatorio(id: string, status: RelatorioStatus, local: string, start: string | null): RelatorioRow {
  return {
    id,
    project_id: PROJECT,
    template_id: TEMPLATE,
    template_version: 1,
    seed_version: 'v1',
    status,
    setup: {
      service_start: start,
      service_end: start,
      atividade: null,
      local,
      responsible_user_id: null,
      cover_photo_file_id: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  };
}

const summary = (id: string, status: RelatorioStatus): RelatorioSummary => ({
  id,
  project_id: PROJECT,
  status,
  template_id: TEMPLATE,
  seed_version: 'v1',
  updated_seq: 5,
});

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0031-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

async function seedCompany(db: AppDatabase) {
  await db.entities.bulkPut([
    toRecord(`project:${PROJECT}`, { id: PROJECT, client_id: CLIENT, name: 'Porto Seguro', site: null, removed_at: null }),
    toRecord(`registry:${CLIENT}`, {
      id: CLIENT,
      kind: 'client',
      name: 'Porto Seguro',
      cnpj: null,
      address: null,
      removed_at: null,
    }),
    toRecord(`template:${TEMPLATE}`, {
      id: TEMPLATE,
      name: 'Cabine primária — padrão',
      version: 1,
      seed_version: 'v1',
      blocks: [],
      removed_at: null,
    }),
  ]);
}

const onDevice = (id: string, complete = true) => ({
  id,
  cursor_seq: 5,
  complete,
  files_pending: 0,
  downloaded_at: null,
  last_sync_at: '2026-09-08T00:40:00.000Z',
  last_push_at: [],
});

const renderHome = (sync: SyncState = syncState()) =>
  render(
    <MemoryRouter>
      <SyncContext value={sync}>
        <ToastProvider>
          <HomeSurface />
          <ToastOutlet />
        </ToastProvider>
      </SyncContext>
    </MemoryRouter>,
  );

const cards = () => screen.queryAllByTestId('relatorio-card');

beforeEach(() => {
  syncRelatorio.mockClear();
});

afterEach(() => {
  database?.close();
  database = null;
});

describe('Home: status board', () => {
  beforeEach(async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.bulkPut([
      toRecord(`relatorio:${R_DRAFT}`, relatorio(R_DRAFT, 'rascunho', 'Oxigênio', '2026-09-10')),
      toRecord(`relatorio:${R_FIELD_HERE}`, relatorio(R_FIELD_HERE, 'em_campo', 'Torres A e B', '2026-09-06')),
      toRecord(`relatorio:${R_ISSUED}`, relatorio(R_ISSUED, 'emitido', 'Subestação', '2026-07-18')),
    ]);
    await database.sync_state.bulkPut([onDevice(R_FIELD_HERE), onDevice(R_DRAFT)]);
  });

  it('shows four tiles in board order with live counts, zero included', async () => {
    renderHome(syncState({ summaryRelatorios: [summary(R_FIELD_AWAY, 'emitido')] }));
    const board = await screen.findByRole('group', { name: 'Relatórios por status' });
    await waitFor(() => expect(cards()).toHaveLength(4));

    const tiles = within(board).getAllByRole('button');
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'Rascunho, 1 relatório',
      'Em campo, 1 relatório',
      'Em revisão, 0 relatórios',
      'Emitido, 2 relatórios',
    ]);
    // The zero tile is marked, not hidden.
    expect(board.querySelectorAll('.tile-count.is-zero')).toHaveLength(1);
  });

  it('a tile filters the list and a second tap clears it', async () => {
    renderHome();
    await waitFor(() => expect(cards()).toHaveLength(3));

    const emCampo = screen.getByRole('button', { name: 'Em campo, 1 relatório' });
    await userEvent.click(emCampo);
    expect(emCampo).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rascunho, 1 relatório' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]).toHaveAttribute('data-relatorio', R_FIELD_HERE);

    await userEvent.click(emCampo);
    expect(emCampo).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(cards()).toHaveLength(3));
  });

  it('another tile takes over the filter', async () => {
    renderHome();
    await waitFor(() => expect(cards()).toHaveLength(3));
    await userEvent.click(screen.getByRole('button', { name: 'Em campo, 1 relatório' }));
    await userEvent.click(screen.getByRole('button', { name: 'Emitido, 1 relatório' }));
    expect(screen.getByRole('button', { name: 'Em campo, 1 relatório' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]).toHaveAttribute('data-relatorio', R_ISSUED);
  });
});

describe('Home: relatório cards', () => {
  it('the Em campo relatório on this device sorts first with is-current and its two actions', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.bulkPut([
      toRecord(`relatorio:${R_FIELD_AWAY}`, relatorio(R_FIELD_AWAY, 'em_campo', 'Longe', '2026-09-20')),
      toRecord(`relatorio:${R_FIELD_HERE}`, relatorio(R_FIELD_HERE, 'em_campo', 'Torres A e B', '2026-09-06')),
    ]);
    await database.sync_state.put(onDevice(R_FIELD_HERE));

    renderHome();
    await waitFor(() => expect(cards()).toHaveLength(2));
    const [first, second] = cards();
    expect(first).toHaveAttribute('data-relatorio', R_FIELD_HERE);
    expect(first).toHaveClass('is-current');
    expect(within(first!).getByRole('button', { name: 'Continuar' })).toHaveAttribute('aria-disabled', 'true');
    expect(within(first!).getByRole('button', { name: 'Continuar' })).toHaveAccessibleDescription(
      'Disponível em uma próxima etapa',
    );
    expect(within(first!).getByRole('button', { name: 'Ver sumário' })).toHaveAttribute('aria-disabled', 'true');
    expect(second).not.toHaveClass('is-current');
    expect(within(second!).queryByRole('button', { name: 'Continuar' })).toBeNull();
  });

  it('writes the four lines of a card from the kernel', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.put(
      toRecord(`relatorio:${R_FIELD_HERE}`, {
        ...relatorio(R_FIELD_HERE, 'em_campo', 'Torres A e B', '2026-09-06'),
        setup: { ...relatorio(R_FIELD_HERE, 'em_campo', 'Torres A e B', '2026-09-06').setup, service_end: '2026-09-08' },
      }),
    );
    await database.sync_state.put(onDevice(R_FIELD_HERE));

    renderHome();
    // The lines come from separate live queries (relatórios, projects, clients,
    // templates), which do not resolve in the same tick: a card can be on screen with
    // its title before the template name arrives, so the two joined lines are awaited
    // rather than read once the card exists.
    await waitFor(() => {
      expect(cards()).toHaveLength(1);
      expect(cards()[0]?.querySelector('.card-title')).toHaveTextContent('Porto Seguro · Torres A e B');
      expect(cards()[0]?.querySelector('.card-meta')).toHaveTextContent('06–08/09/2026 · Cabine primária — padrão');
    });
    const card = cards()[0]!;
    expect(card.querySelector('.card-state .status-pill')).toHaveAttribute('data-status', 'em-campo');
    expect(card.querySelector('.card-state .sync-badge')).toHaveClass('is-compact');
    // The stamp is from 07/09; the suite runs on a later day, so the kernel dates it.
    expect(card.querySelector('.card-device')).toHaveTextContent('No aparelho · atualizado 07/09 21:40');
    // "n de N fichas" waits for progress(snapshot) (AD-8): no counter is invented here.
    expect(card.querySelector('.progress-counter')).toBeNull();
  });

  it('reads "Baixando…" while a relatório is still coming down', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.put(toRecord(`relatorio:${R_DRAFT}`, relatorio(R_DRAFT, 'rascunho', 'Oxigênio', null)));
    await database.sync_state.put(onDevice(R_DRAFT, false));

    renderHome();
    await waitFor(() => expect(cards()[0]?.querySelector('.card-device')).toHaveTextContent('Baixando…'));
  });

  it('online, a relatório not on this device starts its pull when tapped', async () => {
    database = await freshDb();
    await seedCompany(database);
    renderHome(syncState({ summaryRelatorios: [summary(R_ISSUED, 'emitido')] }));

    await waitFor(() => expect(cards()).toHaveLength(1));
    const card = cards()[0]!;
    expect(card).not.toHaveClass('is-unavailable');
    expect(card.querySelector('.card-device')).toHaveTextContent('Não está neste aparelho · baixa ao abrir');
    await userEvent.click(within(card).getByRole('button'));
    expect(syncRelatorio).toHaveBeenCalledWith(R_ISSUED);
  });

  it('online but with the server unreachable, every card badge reads offline and the device words stay online (retro U5)', async () => {
    database = await freshDb();
    await seedCompany(database);
    renderHome(syncState({ unreachable: 'server', badgeState: 'offline', summaryRelatorios: [summary(R_ISSUED, 'emitido')] }));

    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
    for (const card of cards()) {
      expect(card.querySelector('[data-testid="sync-badge"]')).toHaveAttribute('data-state', 'offline');
    }
    const issued = cards().find((card) => card.getAttribute('data-relatorio') === R_ISSUED)!;
    expect(issued.querySelector('.card-device')).toHaveTextContent('Não está neste aparelho · baixa ao abrir');
  });

  it('offline, the same card is unavailable and every tap repeats the sentence', async () => {
    database = await freshDb();
    await seedCompany(database);
    renderHome(syncState({ online: false, badgeState: 'offline', summaryRelatorios: [summary(R_ISSUED, 'emitido')] }));

    await waitFor(() => expect(cards()).toHaveLength(1));
    const card = cards()[0]!;
    expect(card).toHaveClass('is-unavailable');
    expect(card.querySelector('.card-device')).toHaveTextContent('Não está neste aparelho — conecte para baixar');
    // Every tap answers, so the sentence goes through `showToast`; `showOnce` is only for
    // the cold-open sentence, and a tap that went silent the second time would look
    // broken. `toast.test.tsx` pins the difference between the two calls.
    await userEvent.click(within(card).getByRole('button'));
    expect(syncRelatorio).not.toHaveBeenCalled();
    expect(await screen.findByTestId('toast')).toHaveTextContent('Não está neste aparelho — conecte para baixar');
    await userEvent.click(within(card).getByRole('button'));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Não está neste aparelho — conecte para baixar');
    expect(syncRelatorio).not.toHaveBeenCalled();
  });
});

describe('Home: empty state and shortcuts', () => {
  it('says so and offers a disabled "Novo relatório" when nothing is on the device', async () => {
    database = await freshDb();
    await seedCompany(database);
    const { container } = renderHome();

    expect(await screen.findByText('Nenhum relatório ainda.')).toBeVisible();
    expect(cards()).toHaveLength(0);
    const novo = screen.getByRole('button', { name: 'Novo relatório' });
    expect(novo).toHaveAttribute('aria-disabled', 'true');
    expect(novo).toHaveAccessibleDescription('Disponível em uma próxima etapa');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the two shortcut cards with live sub-lines and no badge', async () => {
    database = await freshDb();
    await seedCompany(database);
    const { container } = renderHome();

    await waitFor(() => expect(screen.getByText('1 template')).toBeVisible());
    expect(screen.getByText('Clientes · Instrumentos · Fabricantes · Classes de tensão')).toBeVisible();
    const row = container.querySelector('.shortcut-row')!;
    expect(row.querySelectorAll('.shortcut-card')).toHaveLength(2);
    expect(row.querySelectorAll('.sync-badge')).toHaveLength(0);
    // Templates still belongs to Epic 3; Cadastros opens the Registries surface (Story 2.1).
    const templates = screen.getByText('Templates').closest('.shortcut-card')!;
    expect(templates).toHaveAttribute('aria-disabled', 'true');
    expect(templates).toHaveAccessibleDescription('Disponível em uma próxima etapa');
    const cadastros = screen.getByText('Cadastros').closest('.shortcut-card')!;
    expect(cadastros).not.toHaveAttribute('aria-disabled');
    expect(cadastros).toHaveAttribute('href', '/cadastros');
  });
});

describe('Home: cold open offline', () => {
  it('shows the offline toast once for the page session', async () => {
    database = await freshDb();
    await seedCompany(database);
    const offline = syncState({ online: false, badgeState: 'offline' });

    // Navigating away and back unmounts Home; the shell's providers stay, which is what
    // "once for the page session" is anchored on. The 6 s timeout is fired by hand so
    // the second visit starts from an empty region.
    const queue: (() => void)[] = [];
    const timers = {
      setTimeout: (cb: () => void) => {
        queue.push(cb);
        return queue.length;
      },
      clearTimeout: () => {},
    };

    function Session() {
      const [onHome, setOnHome] = useState(true);
      return (
        <MemoryRouter>
          <SyncContext value={offline}>
            <ToastProvider timers={timers}>
              <button type="button" onClick={() => setOnHome((v) => !v)}>
                alternar
              </button>
              {onHome ? <HomeSurface /> : <p>outra tela</p>}
              <ToastOutlet />
            </ToastProvider>
          </SyncContext>
        </MemoryRouter>
      );
    }

    render(<Session />);
    expect(await screen.findByTestId('toast')).toHaveTextContent('Sem conexão. Tudo fica salvo neste aparelho.');
    act(() => {
      for (const cb of queue.splice(0)) cb();
    });
    expect(screen.queryByTestId('toast')).toBeNull();

    await userEvent.click(screen.getByText('alternar'));
    await userEvent.click(screen.getByText('alternar'));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Relatórios por status' })).toBeVisible());
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
