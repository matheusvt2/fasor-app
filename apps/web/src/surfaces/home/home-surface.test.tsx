import 'fake-indexeddb/auto';
import { newEquipmentBlock, type LocationRow, type RelatorioRow, type RelatorioStatus, type RelatorioSummary } from '@app/domain';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '../../test-axe.ts';
import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toRecord } from '../../db/commit.ts';
import { HOME_PAGE_SIZE_PREF, writeLastSheet } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import type { SessionState } from '../../state/session.tsx';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
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

const syncRelatorio = vi.fn(async () => 'ran' as const);

const syncState = (over: Partial<SyncState> = {}): SyncState => makeSyncState({ syncRelatorio, ...over });

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
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_na: false,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
    parecer: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  };
}

const summary = (id: string, status: RelatorioStatus, updated_seq = 5): RelatorioSummary => ({
  id,
  project_id: PROJECT,
  status,
  template_id: TEMPLATE,
  seed_version: 'v1',
  updated_seq,
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
    toRecord(`project:${PROJECT}`, { id: PROJECT, client_id: CLIENT, name: 'Seguradora Exemplo', site: 'Blocos Norte e Sul', removed_at: null }),
    toRecord(`registry:${CLIENT}`, {
      id: CLIENT,
      kind: 'client',
      name: 'Seguradora Exemplo',
      cnpj: null,
      contact_name: null,
      contact_phone: null,
      sites: [],
      removed_at: null,
    }),
    toRecord(`template:${TEMPLATE}`, {
      id: TEMPLATE,
      name: 'Cabine primária — padrão',
      version: 1,
      seed_version: 'v1',
      blocks: [],
      skeleton: [],
      archived_at: null,
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

/** Where the router is, so a test sees where a press navigated. */
function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const renderHome = (sync: SyncState = syncState()) =>
  render(
    <MemoryRouter>
      <SyncContext value={sync}>
        <ToastProvider>
          <Where />
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
      toRecord(`relatorio:${R_FIELD_HERE}`, relatorio(R_FIELD_HERE, 'em_campo', 'Blocos Norte e Sul', '2026-09-06')),
      toRecord(`relatorio:${R_ISSUED}`, relatorio(R_ISSUED, 'emitido', 'Subestação', '2026-07-18')),
    ]);
    await database.sync_state.bulkPut([onDevice(R_FIELD_HERE), onDevice(R_DRAFT)]);
  });

  it('shows four tiles in board order with live counts, zero included', async () => {
    renderHome(syncState({ summaryRelatorios: [summary(R_FIELD_AWAY, 'emitido')] }));
    const board = await screen.findByRole('group', { name: 'Relatórios por status' });
    // Story 19.2: with no tile pressed the list holds the active relatórios only; the board counts every one.
    await waitFor(() => expect(cards()).toHaveLength(2));

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
    await waitFor(() => expect(cards()).toHaveLength(2));

    const emCampo = screen.getByRole('button', { name: 'Em campo, 1 relatório' });
    await userEvent.click(emCampo);
    expect(emCampo).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rascunho, 1 relatório' })).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]).toHaveAttribute('data-relatorio', R_FIELD_HERE);

    await userEvent.click(emCampo);
    expect(emCampo).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(cards()).toHaveLength(2));
  });

  it('another tile takes over the filter', async () => {
    renderHome();
    await waitFor(() => expect(cards()).toHaveLength(2));
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
      toRecord(`relatorio:${R_FIELD_HERE}`, relatorio(R_FIELD_HERE, 'em_campo', 'Blocos Norte e Sul', '2026-09-06')),
    ]);
    await database.sync_state.put(onDevice(R_FIELD_HERE));

    renderHome();
    // "On this device" comes from the sync_state live query, not the relatório rows' one:
    // on a loaded machine both cards can be on screen in date order before it answers,
    // so the wait is on the order itself, not on the card count (wave-1 gate, 2026-10-08).
    await waitFor(() => {
      expect(cards()).toHaveLength(2);
      expect(cards()[0]).toHaveAttribute('data-relatorio', R_FIELD_HERE);
      expect(cards()[0]).toHaveClass('is-current');
    });
    const [first, second] = cards();
    // Story 12.2: "Continuar" is live; with no sheet on the relatório it opens the Sumário.
    expect(within(first!).getByRole('button', { name: 'Continuar' })).not.toHaveAttribute('aria-disabled');
    expect(first!.querySelector('.btn-reason')).toBeNull();
    // Story 4.3: "Ver sumário" opens the Sumário like the card's own tap.
    expect(within(first!).getByRole('button', { name: 'Ver sumário' })).not.toHaveAttribute('aria-disabled');
    expect(second).not.toHaveClass('is-current');
    expect(within(second!).queryByRole('button', { name: 'Continuar' })).toBeNull();
    await userEvent.click(within(first!).getByRole('button', { name: 'Continuar' }));
    expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${R_FIELD_HERE}`);
  });

  it('12.2: "Continuar: ⟨TAG⟩ · n de N" opens the last sheet, else the first sheet still missing something; the card counts its sheets', async () => {
    database = await freshDb();
    await seedCompany(database);
    const cabineId = ids();
    const cabine: LocationRow = {
      id: cabineId,
      relatorio_id: R_FIELD_HERE,
      parent_id: null,
      kind: 'cabine',
      name: 'Cabine 1',
      order_key: 'a0',
      removed_at: null,
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
      agrupar_por_tipo: false,
    };
    const sheet = (tag: string, orderKey: string) =>
      newEquipmentBlock({
        blockId: ids(),
        equipmentId: ids(),
        relatorioId: R_FIELD_HERE,
        projectId: PROJECT,
        locationId: cabineId,
        type: 'chave_seccionadora',
        tag,
        seedVersion: 'v1',
        orderKey: orderKey,
      });
    const first = sheet('SEC-01', 'a0');
    const second = sheet('SEC-02', 'a1');
    const done = { ...first.block, concluded_by: { actor_id: 'u1', at: '2026-09-07T11:00:00.000Z' } };
    await database.entities.bulkPut([
      toRecord(`relatorio:${R_FIELD_HERE}`, relatorio(R_FIELD_HERE, 'em_campo', 'Blocos Norte e Sul', '2026-09-06')),
      toRecord(`location:${cabineId}`, cabine),
      toRecord(`block:${done.id}`, done),
      toRecord(`block:${second.block.id}`, second.block),
      toRecord(`equipment:${first.equipment.id}`, first.equipment),
      toRecord(`equipment:${second.equipment.id}`, second.equipment),
    ]);
    await database.sync_state.put(onDevice(R_FIELD_HERE));

    renderHome();
    // No pointer: the first sheet still missing something (SEC-01 is concluded).
    const next = await screen.findByRole('button', { name: 'Continuar: SEC-02 · 1 de 2' });
    expect(next.querySelector('.tabular')).toHaveTextContent('SEC-02 · 1 de 2');
    const card = cards()[0]!;
    // The counter is Home's blocks live query, not the "Continuar" target's: either can land first.
    await waitFor(() => {
      expect(card.querySelector('.card-state .progress-counter')).toHaveTextContent('1 de 2 fichas');
      expect(card.querySelector('.card-state .progress-counter')).toHaveAttribute('data-state', 'pending');
      expect(card.querySelector('.card-title')).toHaveAttribute('aria-label', 'Seguradora Exemplo · Blocos Norte e Sul, Em campo, 1 de 2 fichas');
    });

    // The pointer wins, live.
    await writeLastSheet(database, R_FIELD_HERE, done.id);
    const last = await screen.findByRole('button', { name: 'Continuar: SEC-01 · 1 de 2' });
    await userEvent.click(last);
    expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${R_FIELD_HERE}/ficha/${done.id}`);
  });

  it('writes the four lines of a card from the kernel', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.put(
      toRecord(`relatorio:${R_FIELD_HERE}`, {
        ...relatorio(R_FIELD_HERE, 'em_campo', 'Blocos Norte e Sul', '2026-09-06'),
        setup: { ...relatorio(R_FIELD_HERE, 'em_campo', 'Blocos Norte e Sul', '2026-09-06').setup, service_end: '2026-09-08' },
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
      expect(cards()[0]?.querySelector('.card-title')).toHaveTextContent('Seguradora Exemplo · Blocos Norte e Sul');
      expect(cards()[0]?.querySelector('.card-meta')).toHaveTextContent('06–08/09/2026 · Cabine primária — padrão');
      // The device line is the sync_state live query's, another one again (wave-1 gate, 2026-10-08).
      // The stamp is from 07/09; the suite runs on a later day, so the kernel dates it.
      expect(cards()[0]?.querySelector('.card-device')).toHaveTextContent('No aparelho · atualizado 07/09 21:40');
    });
    const card = cards()[0]!;
    expect(card.querySelector('.card-state .status-pill')).toHaveAttribute('data-status', 'em-campo');
    expect(card.querySelector('.card-state .sync-badge')).toHaveClass('is-compact');
    // Story 12.2: a relatório on this device carries its "n de N fichas" (none here). Its
    // own live query can land after the card's first lines on a loaded machine (E3-A4).
    await waitFor(() => expect(card.querySelector('.progress-counter')).toHaveTextContent('0 de 0 fichas'));
  });

  it('reads "Baixando…" while a relatório is still coming down', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.put(toRecord(`relatorio:${R_DRAFT}`, relatorio(R_DRAFT, 'rascunho', 'Oxigênio', null)));
    await database.sync_state.put(onDevice(R_DRAFT, false));

    renderHome();
    await waitFor(() => expect(cards()[0]?.querySelector('.card-device')).toHaveTextContent('Baixando…'));
  });

  it('10.4 (ledger 166): counts the sheets held against the summary progress while it comes down', async () => {
    database = await freshDb();
    await seedCompany(database);
    await database.entities.put(toRecord(`relatorio:${R_DRAFT}`, relatorio(R_DRAFT, 'rascunho', 'Oxigênio', null)));
    const sheet = (tag: string) =>
      newEquipmentBlock({
        blockId: ids(),
        equipmentId: ids(),
        relatorioId: R_DRAFT,
        projectId: PROJECT,
        locationId: ids(),
        type: 'chave_seccionadora',
        tag,
        seedVersion: 'v1',
        orderKey: 'a0',
      }).block;
    const photoId = ids();
    const held = [sheet('SEC-01'), sheet('SEC-02')];
    await database.entities.bulkPut(held.map((block) => toRecord(`block:${block.id}`, block)));
    await database.entities.put({ entity: 'file', id: photoId, relatorio_id: R_DRAFT, project_id: null, removed_at: null, row: { id: photoId, kind: 'photo', relatorio_id: R_DRAFT, removed_at: null } as never });
    await database.sync_state.put(onDevice(R_DRAFT, false));

    renderHome(syncState({ summaryRelatorios: [{ ...summary(R_DRAFT, 'rascunho'), progress: { sheets: 30, photos: 20 } }] }));
    await waitFor(() => expect(cards()[0]?.querySelector('.card-device')).toHaveTextContent(/^Baixando… 2 de 30 fichas$/));
  });

  it('online, a relatório not on this device starts its pull when tapped', async () => {
    database = await freshDb();
    await seedCompany(database);
    renderHome(syncState({ summaryRelatorios: [summary(R_ISSUED, 'emitido')] }));
    // Story 19.2: an emitted relatório sits behind the Emitido tile.
    await userEvent.click(await screen.findByRole('button', { name: 'Emitido, 1 relatório' }));

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
    await userEvent.click(await screen.findByRole('button', { name: 'Emitido, 1 relatório' }));

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
    await userEvent.click(await screen.findByRole('button', { name: 'Emitido, 1 relatório' }));

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

describe('Home: the active list and its page (Story 19.2)', () => {
  /** `n` summary-only relatórios of `status`, sequences counting down from `top` (most recent first). */
  function many(status: RelatorioStatus, n: number, top: number): RelatorioSummary[] {
    return Array.from({ length: n }, (_, i) => summary(ids(), status, top - i));
  }
  const listIds = () => cards().map((card) => card.getAttribute('data-relatorio'));
  const pageChips = () => screen.queryByRole('radiogroup', { name: 'Relatórios por página' });
  const note = () => document.querySelector('.home-list-note .section-note');

  beforeEach(async () => {
    database = await freshDb();
    await seedCompany(database);
  });

  it('default list: the active relatórios most recent first, the Emitido tile counts the rest and toggles them', async () => {
    const draft = summary(ids(), 'rascunho', 30);
    const field = summary(ids(), 'em_campo', 50);
    const review = summary(ids(), 'em_revisao', 40);
    const issued = many('emitido', 9, 100);
    renderHome(syncState({ summaryRelatorios: [draft, review, ...issued, field] }));

    await waitFor(() => expect(listIds()).toEqual([field.id, review.id, draft.id]));
    expect(note()).toBeNull();
    expect(pageChips()).toBeNull();

    const emitido = screen.getByRole('button', { name: 'Emitido, 9 relatórios' });
    expect(emitido).toHaveAttribute('data-telemetry', 'home.status_chip');
    await userEvent.click(emitido);
    await waitFor(() => expect(listIds()).toEqual(issued.map((entry) => entry.id)));
    await userEvent.click(emitido);
    await waitFor(() => expect(listIds()).toEqual([field.id, review.id, draft.id]));
  });

  it('cap: 12 in the selection shows 10, the note and the chips; 50 shows all, is stored, and survives a remount', async () => {
    const drafts = many('rascunho', 12, 100);
    const sync = syncState({ summaryRelatorios: drafts });
    const { unmount } = renderHome(sync);

    await waitFor(() => expect(listIds()).toEqual(drafts.slice(0, 10).map((entry) => entry.id)));
    await waitFor(() => expect(note()).toHaveTextContent(/^Mostrando 10 de 12 relatórios$/));
    const group = pageChips()!;
    const chips = within(group).getAllByRole('radio');
    expect(chips.map((chip) => chip.textContent)).toEqual(['10', '20', '50', '100']);
    expect(chips.map((chip) => chip.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false']);
    for (const chip of chips) expect(chip).toHaveAttribute('data-telemetry', 'home.page_size');

    await userEvent.click(within(group).getByRole('radio', { name: '50' }));
    await waitFor(() => expect(cards()).toHaveLength(12));
    expect(note()).toHaveTextContent(/^Mostrando 12 de 12 relatórios$/);
    await waitFor(async () => expect((await database!.local_prefs.get(HOME_PAGE_SIZE_PREF))?.value).toBe(50));

    unmount();
    renderHome(sync);
    await waitFor(() => expect(within(pageChips()!).getByRole('radio', { name: '50' })).toHaveAttribute('aria-checked', 'true'));
    expect(cards()).toHaveLength(12);
  });

  it('with 50 stored, the first list drawn already holds 12 cards, never a frame of 10', async () => {
    await database!.local_prefs.put({ key: HOME_PAGE_SIZE_PREF, value: 50 });
    const counts: number[] = [];
    const observer = new MutationObserver(() => {
      const n = cards().length;
      if (n > 0 && counts.at(-1) !== n) counts.push(n);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    renderHome(syncState({ summaryRelatorios: many('rascunho', 12, 100) }));
    await waitFor(() => expect(cards()).toHaveLength(12));
    observer.disconnect();
    expect(counts).toEqual([12]);
  });

  it('a stored value that is not a page size reads as 10', async () => {
    await database!.local_prefs.put({ key: HOME_PAGE_SIZE_PREF, value: 15 });
    renderHome(syncState({ summaryRelatorios: many('em_revisao', 11, 100) }));
    await waitFor(() => expect(cards()).toHaveLength(10));
    expect(within(pageChips()!).getByRole('radio', { name: '10' })).toHaveAttribute('aria-checked', 'true');
  });

  it('10 or fewer in the selection: no note, no chips', async () => {
    renderHome(syncState({ summaryRelatorios: many('rascunho', 10, 100) }));
    await waitFor(() => expect(cards()).toHaveLength(10));
    expect(note()).toBeNull();
    expect(pageChips()).toBeNull();
  });

  it('no active relatório: the kernel sentence points at the Emitido tile', async () => {
    renderHome(syncState({ summaryRelatorios: many('emitido', 7, 100) }));
    expect(await screen.findByText('Nenhum relatório em andamento. 7 emitidos: toque em Emitido.')).toBeVisible();
    expect(cards()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Emitido, 7 relatórios' })).toBeVisible();
  });

  it('a pressed tile with nothing keeps its sentence', async () => {
    renderHome(syncState({ summaryRelatorios: many('emitido', 2, 100) }));
    await userEvent.click(await screen.findByRole('button', { name: 'Em revisão, 0 relatórios' }));
    expect(await screen.findByText('Nenhum relatório neste status.')).toBeVisible();
  });
});

describe('Home: empty state and shortcuts', () => {
  it('says so and offers "Novo relatório", which asks for the client and the obra (Story 4.1)', async () => {
    database = await freshDb();
    await seedCompany(database);
    const { container } = renderHome();

    expect(await screen.findByText('Nenhum relatório ainda.')).toBeVisible();
    expect(cards()).toHaveLength(0);
    const novo = screen.getByRole('button', { name: 'Novo relatório' });
    expect(novo).not.toHaveAttribute('aria-disabled');
    expect(await axe(container)).toHaveNoViolations();

    await userEvent.click(novo);
    const dialog = await screen.findByRole('dialog', { name: 'Novo relatório' });
    expect(within(dialog).getByRole('combobox', { name: 'Cliente' })).toBeVisible();
    const site = within(dialog).getByRole('combobox', { name: 'Local (obra)' });
    expect(site).toHaveAttribute('aria-disabled', 'true');
    const proceed = within(dialog).getByRole('button', { name: 'Continuar' });
    expect(proceed).toHaveAttribute('aria-disabled', 'true');
    expect(proceed).toHaveAccessibleDescription('Continuar: falta o cliente');
    // E9-Q14: the reason is said once on screen, beside "Continuar"; the Local field points at it.
    expect(within(dialog).getAllByText('Continuar: falta o cliente')).toHaveLength(1);
    expect(site).toHaveAccessibleDescription('Continuar: falta o cliente');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the two shortcut cards with live sub-lines and no badge', async () => {
    database = await freshDb();
    await seedCompany(database);
    const { container } = renderHome();

    await waitFor(() => expect(screen.getByText('1 template')).toBeVisible());
    expect(screen.getByText('Empresa · Clientes · Instrumentos · Fabricantes · Frases de NC · Classes de tensão · Critérios')).toBeVisible();
    const row = container.querySelector('.shortcut-row')!;
    expect(row.querySelectorAll('.shortcut-card')).toHaveLength(2);
    expect(row.querySelectorAll('.sync-badge')).toHaveLength(0);
    // Templates opens the Templates surface (Story 3.2); Cadastros the Registries surface (Story 2.1).
    const templates = screen.getByText('Templates').closest('.shortcut-card')!;
    expect(templates).not.toHaveAttribute('aria-disabled');
    expect(templates).toHaveAttribute('href', '/templates');
    const cadastros = screen.getByText('Cadastros').closest('.shortcut-card')!;
    expect(cadastros).not.toHaveAttribute('aria-disabled');
    expect(cadastros).toHaveAttribute('href', '/cadastros');
  });

  it('puts the shortcut row between the Status board and the list (Story 19.1)', async () => {
    database = await freshDb();
    await seedCompany(database);
    const { container } = renderHome();

    await waitFor(() => expect(container.querySelector('.status-board')).not.toBeNull());
    const board = container.querySelector('.status-board')!;
    const row = container.querySelector('.shortcut-row')!;
    const head = container.querySelector('.home-head')!;
    // `DOCUMENT_POSITION_FOLLOWING` on `a.compareDocumentPosition(b)`: b comes after a.
    expect(board.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(row.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
