import 'fake-indexeddb/auto';
import type { SuggestionRow } from '@app/domain';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { BLOCK_1_ID, BLOCK_2_ID, CABINE_ID, COMPANY_ID, RELATORIO_ID as SMALL_RELATORIO, replaySmall } from '@app/domain/fixtures/replay-small';
import { applyPulled } from '../db/sync-store.ts';
import { arrivalStep, arrivalTarget, ReadingArrivals } from './reading-arrivals.tsx';
import { makeSyncState } from '../test/sync-state.ts';
import { SyncContext } from './sync.tsx';
import { ToastOutlet, ToastProvider } from './toast.tsx';

/*
 * 8.2-UNIT: the arrival toast. Suggestions the device already held when the watcher first
 * looked never announce themselves; rows that arrive afterwards do, once, counted by their
 * reading runs, and "Ver" leads to where they wait.
 */

const session: { database: AppDatabase | null } = { database: null };
vi.mock('./session.tsx', () => ({ useSession: () => session }));

const RELATORIO = '019966b0-0089-7000-8000-000000000001';
const PHOTO = '019966b0-0089-7000-8000-000000000002';
let seq = 0x10;
const nextId = () => `019966b0-0089-7000-8000-${(++seq).toString(16).padStart(12, '0')}`;

function row(run: string, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return {
    id: nextId(),
    relatorio_id: RELATORIO,
    target_path: `sheet/${PHOTO}/nameplate/tipo`,
    value: 'X',
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0.1, 0.1, 0.2, 0.2], ocr_token_ids: [], reading_run_id: run },
    status: 'pending',
    prompt_version: 'test-1',
    hint: null,
    ...extra,
  };
}

async function put(db: AppDatabase, suggestion: SuggestionRow): Promise<void> {
  await db.entities.put({ entity: 'suggestion', id: suggestion.id, relatorio_id: suggestion.relatorio_id, project_id: null, removed_at: null, row: suggestion as never });
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

afterEach(() => {
  cleanup();
  session.database?.close();
  session.database = null;
});

const idle = { running: false, synced: true };

describe('8.2-UNIT arrivalStep', () => {
  it('records the first observation without arrivals, then reports only the rows never seen', () => {
    const a = row(PHOTO);
    const first = arrivalStep(null, [a], idle);
    expect(first.arrived).toEqual([]);
    const b = row(PHOTO);
    const second = arrivalStep(first.state, [a, b], idle);
    expect(second.arrived.map((r) => r.id)).toEqual([b.id]);
    expect(arrivalStep(second.state, [a, b], idle).arrived).toEqual([]);
  });

  it('waits for the cycle to end and announces only the new rows still pending then (the sweep confirmed the rest)', () => {
    const start = arrivalStep(null, [], { running: true, synced: true });
    const run = nextId();
    const kept = row(run);
    const autoConfirmed = row(run);
    // Pulled mid-cycle: nothing said yet.
    const pulled = arrivalStep(start.state, [kept, autoConfirmed], { running: true, synced: true });
    expect(pulled.arrived).toEqual([]);
    // The sweep confirmed one before the cycle ended: only the other is announced, once.
    const ended = arrivalStep(pulled.state, [kept], idle);
    expect(ended.arrived.map((r) => r.id)).toEqual([kept.id]);
    expect(arrivalStep(ended.state, [kept], idle).arrived).toEqual([]);
    // Everything confirmed by the sweep: nothing to announce.
    const all = arrivalStep(start.state, [row(run)], { running: true, synced: true });
    expect(arrivalStep(all.state, [], idle).arrived).toEqual([]);
  });

  it('keeps the first sync of a fresh device as baseline, then announces what later pulls bring', () => {
    const empty = arrivalStep(null, [], { running: true, synced: false });
    const backlog = [row(nextId()), row(nextId())];
    const first = arrivalStep(empty.state, backlog, { running: true, synced: false });
    const done = arrivalStep(first.state, backlog, { running: false, synced: true });
    expect(done.arrived).toEqual([]);
    const later = row(nextId());
    expect(arrivalStep(done.state, [...backlog, later], idle).arrived.map((r) => r.id)).toEqual([later.id]);
  });
});

describe('8.2-UNIT ReadingArrivals', () => {
  it('never announces the rows present at mount; announces a pulled reading once, and "Ver" opens where it waits', async () => {
    const db = openDatabase('reading-arrivals-1');
    await db.delete();
    session.database = openDatabase('reading-arrivals-1');
    await put(session.database, row(nextId()));
    render(
      <SyncContext value={makeSyncState({ lastSyncAt: '2026-09-27T10:00:00.000Z' })}>
        <MemoryRouter initialEntries={['/']}>
          <ToastProvider>
            <ReadingArrivals />
            <ToastOutlet />
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </SyncContext>,
    );
    // Give the first observation time to land: nothing is said about what was already there.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(screen.queryByTestId('toast')).toBeNull();

    // A pull brings one reading of three fields (one run): one toast, in the singular.
    const run = nextId();
    await act(async () => {
      for (const key of ['tipo', 'n_serie', 'tap_atual']) await put(session.database!, row(run, { target_path: `sheet/${PHOTO}/nameplate/${key}` }));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    // No relatório row on this device: "Ver" falls back to its Sumário.
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}`));
  });
});

describe('13.5-UNIT arrivalTarget and a panel suggestion', () => {
  const PANEL_PHOTO = '019966b0-0089-7000-8000-0000000000f1';

  async function deviceWithPanelPhoto(name: string, photo: Record<string, unknown> = {}): Promise<{ db: AppDatabase; suggestion: SuggestionRow }> {
    const db = openDatabase(name);
    await db.delete();
    const fresh = openDatabase(name);
    await applyPulled(
      fresh,
      replaySmall.log.map((op, i) => ({ ...op, seq: i + 1 })),
    );
    const photoRow = {
      id: PANEL_PHOTO,
      company_id: COMPANY_ID,
      relatorio_id: SMALL_RELATORIO,
      sha256: 'ab'.repeat(32),
      mime: 'image/jpeg',
      size: 10,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      kind: 'photo',
      captured_at: '2026-10-07T12:00:00.000Z',
      tz_offset: -180,
      coords: null,
      local_seq: 1,
      block_id: null,
      item_key: null,
      caption: null,
      reading_kind: 'panel',
      reading_target: { location_id: CABINE_ID },
      reading_status: 'done',
      people_in_photo: false,
      ...photo,
    };
    await fresh.entities.put({ entity: 'file', id: PANEL_PHOTO, relatorio_id: SMALL_RELATORIO, project_id: null, removed_at: (photoRow.removed_at as string | null) ?? null, row: photoRow as never });
    const suggestion = row(nextId(), {
      relatorio_id: SMALL_RELATORIO,
      target_path: `file/${PANEL_PHOTO}/block_id`,
      value: { block_type: 'chave_seccionadora', column: 9, column_text: 'C09' },
      source: { photo_id: PANEL_PHOTO, bbox: [0.1, 0.1, 0.2, 0.2], ocr_token_ids: [], reading_run_id: nextId() },
    });
    return { db: fresh, suggestion };
  }

  it('opens the Sumário with ?panel= for a waiting panel photo; the plain route once it is removed or re-kinded to a plate', async () => {
    const waiting = await deviceWithPanelPhoto('arrivals-panel-1');
    expect(await arrivalTarget(waiting.db, SMALL_RELATORIO, waiting.suggestion)).toBe(`/relatorio/${SMALL_RELATORIO}?panel=${PANEL_PHOTO}`);
    waiting.db.close();

    const removed = await deviceWithPanelPhoto('arrivals-panel-2', { removed_at: '2026-10-07T12:05:00.000Z' });
    expect(await arrivalTarget(removed.db, SMALL_RELATORIO, removed.suggestion)).not.toContain('?panel=');
    removed.db.close();

    const plate = await deviceWithPanelPhoto('arrivals-panel-3', { reading_kind: 'plate', reading_target: { block_id: CABINE_ID, block_type: 'chave_seccionadora' } });
    expect(await arrivalTarget(plate.db, SMALL_RELATORIO, plate.suggestion)).not.toContain('?panel=');
    plate.db.close();
  });
});

describe('Review fixes 2026-10-08 (DC-4, DB-5, DE-5, DG-3): what an arrival announces, and when it leaves', () => {
  const OTHER_BLOCK = '019966b0-0089-7000-8000-0000000000b1';

  /** Moves the router to `to` when "Ir" is pressed. */
  function Go({ to }: { to: string }) {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => void navigate(to)}>
        Ir
      </button>
    );
  }

  async function mount(name: string, at: string, page: ReactNode = null, to = '/') {
    const db = openDatabase(name);
    await db.delete();
    session.database = openDatabase(name);
    render(
      <SyncContext value={makeSyncState({ lastSyncAt: '2026-09-27T10:00:00.000Z' })}>
        <MemoryRouter initialEntries={[at]}>
          <ToastProvider>
            <ReadingArrivals />
            <ToastOutlet />
            <Go to={to} />
            {page}
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </SyncContext>,
    );
    // The first observation lands as baseline.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    return session.database;
  }

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

  it('a reading for the open ficha announces nothing; one for another sheet does, and leaves once its sheet is open', async () => {
    const db = await mount('reading-arrivals-screen-1', `/relatorio/${RELATORIO}/ficha/${PHOTO}`, null, `/relatorio/${RELATORIO}/ficha/${OTHER_BLOCK}`);
    await act(async () => {
      await put(db, row(nextId()));
    });
    await settle();
    expect(screen.queryByTestId('toast')).toBeNull();

    await act(async () => {
      await put(db, row(nextId(), { target_path: `sheet/${OTHER_BLOCK}/nameplate/tipo` }));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await userEvent.click(screen.getByRole('button', { name: 'Ir' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}/ficha/${OTHER_BLOCK}`));
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
  });

  it('withdraws the announcement once none of its rows is pending', async () => {
    const db = await mount('reading-arrivals-screen-2', '/');
    const arrived = row(nextId());
    await act(async () => {
      await put(db, arrived);
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await act(async () => {
      await put(db, { ...arrived, status: 'confirmed' });
    });
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
  });

  it('a caption arrival is its own toast, "N legendas sugeridas", whose "Ver" opens the gallery; none while the gallery is on screen', async () => {
    const db = await mount('reading-arrivals-captions-1', '/');
    // Both in one transaction: one pull, one observation.
    await act(async () => {
      const rows = [row(nextId(), { target_path: `file/${PHOTO}/caption` }), row(nextId(), { target_path: `file/${PHOTO}/caption` })];
      await db.entities.bulkPut(rows.map((suggestion) => ({ entity: 'suggestion', id: suggestion.id, relatorio_id: suggestion.relatorio_id, project_id: null, removed_at: null, row: suggestion as never })));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('2 legendas sugeridas'));
    expect(screen.getByTestId('toast')).not.toHaveTextContent('leitura');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}/fotos`));
    cleanup();
    session.database?.close();

    const gallery = await mount('reading-arrivals-captions-2', `/relatorio/${RELATORIO}/fotos`);
    await act(async () => {
      await put(gallery, row(nextId(), { target_path: `file/${PHOTO}/caption` }));
    });
    await settle();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('"Ver" on the address already shown scrolls to and focuses the first pending suggestion, with no navigation', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const page = (
      <>
        {/* A nameplate cell already confirmed keeps its suggestion id: never the one "Ver" leads to. */}
        <div className="field" data-suggestion-id="s0" data-state="confirmed">
          <button type="button">Confirmada</button>
        </div>
        <span className="suggestion-alt" data-suggestion-id="s1">
          Sugerido: 15 kV
          <button type="button">Substituir</button>
        </span>
      </>
    );
    // No relatório on this device: "Ver" leads to its Sumário, the address shown.
    const db = await mount('reading-arrivals-ver-1', `/relatorio/${RELATORIO}`, page);
    await act(async () => {
      await put(db, row(nextId()));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Substituir' })).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}`);
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('Review fixes 2026-10-08 (DC-4): a toast names only its own rows; a ficha draws its cabine only while the block is open', () => {
  const OTHER_BLOCK = '019966b0-0089-7000-8000-0000000000b2';
  const ANOTHER_BLOCK = '019966b0-0089-7000-8000-0000000000b3';

  async function smallDevice(name: string): Promise<AppDatabase> {
    const old = openDatabase(name);
    await old.delete();
    const fresh = openDatabase(name);
    await applyPulled(
      fresh,
      replaySmall.log.map((op, i) => ({ ...op, seq: i + 1 })),
    );
    return fresh;
  }

  it('an env reading for the open ficha\'s cabine is not announced (the cabine read off the device\'s relatório)', async () => {
    const name = 'arrivals-env-cabine';
    session.database = await smallDevice(name);
    render(
      <SyncContext value={makeSyncState({ lastSyncAt: '2026-09-27T10:00:00.000Z' })}>
        <MemoryRouter initialEntries={[`/relatorio/${SMALL_RELATORIO}/ficha/${BLOCK_1_ID}`]}>
          <ToastProvider>
            <ReadingArrivals />
            <ToastOutlet />
          </ToastProvider>
        </MemoryRouter>
      </SyncContext>,
    );
    // The first observation of the fixture's store lands as baseline.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    // One pull brings two readings: one for the open ficha's own cabine (drawn on it) and one for
    // a location it does not draw. Only the second is announced.
    const env = (location: string) => row(nextId(), { relatorio_id: SMALL_RELATORIO, target_path: `location/${location}/env/temperature_c`, value: { raw: '24', unit: '°C', state: 'measured' } });
    await act(async () => {
      const rows = [env(CABINE_ID), env(OTHER_BLOCK)];
      await session.database!.entities.bulkPut(rows.map((suggestion) => ({ entity: 'suggestion', id: suggestion.id, relatorio_id: suggestion.relatorio_id, project_id: null, removed_at: null, row: suggestion as never })));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(/^1 leitura pronta para confirmar/));
  });

  it('on another ficha of a complete cabine (its block collapsed, the env fields not drawn), an env reading for the cabine is announced', async () => {
    const name = 'arrivals-env-collapsed';
    const db = await smallDevice(name);
    const m = (raw: string, unit: string) => ({ raw, unit, state: 'measured' });
    const record = (await db.entities.get(['location', CABINE_ID]))!;
    const cabine = record.row as Record<string, unknown>;
    await db.entities.put({
      ...record,
      row: { ...cabine, se: { type: 'abrigada', primary_kv: m('13.8', 'kV'), secondary_kv: m('380', 'V'), installed_kva: m('500', 'kVA') }, env: { altitude_m: null, temperature_c: m('27', '°C'), humidity_pct: m('60', '%') } } as never,
    });
    session.database = db;
    render(
      <SyncContext value={makeSyncState({ lastSyncAt: '2026-09-27T10:00:00.000Z' })}>
        <MemoryRouter initialEntries={[`/relatorio/${SMALL_RELATORIO}/ficha/${BLOCK_2_ID}`]}>
          <ToastProvider>
            <ReadingArrivals />
            <ToastOutlet />
          </ToastProvider>
        </MemoryRouter>
      </SyncContext>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await act(async () => {
      await put(db, row(nextId(), { relatorio_id: SMALL_RELATORIO, target_path: `location/${CABINE_ID}/env/temperature_c`, value: { raw: '24', unit: '°C', state: 'measured' } }));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(/^1 leitura pronta para confirmar/));
  });

  it('a same-text toast after a dismissed one names only its own rows: opening its sheet withdraws it', async () => {
    const name = 'arrivals-same-text';
    const old = openDatabase(name);
    await old.delete();
    session.database = openDatabase(name);
    function Go() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate(`/relatorio/${RELATORIO}/ficha/${ANOTHER_BLOCK}`)}>
          Ir
        </button>
      );
    }
    render(
      <SyncContext value={makeSyncState({ lastSyncAt: '2026-09-27T10:00:00.000Z' })}>
        <MemoryRouter initialEntries={['/']}>
          <ToastProvider>
            <ReadingArrivals />
            <ToastOutlet />
            <Go />
            <Routes>
              <Route path="*" element={<Where />} />
            </Routes>
          </ToastProvider>
        </MemoryRouter>
      </SyncContext>,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    await act(async () => {
      await put(session.database!, row(nextId(), { target_path: `sheet/${OTHER_BLOCK}/nameplate/tipo` }));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
    // The first reading stays pending off screen; a second one, same text, for another sheet.
    await act(async () => {
      await put(session.database!, row(nextId(), { target_path: `sheet/${ANOTHER_BLOCK}/nameplate/tipo` }));
    });
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('1 leitura pronta para confirmar'));
    await userEvent.click(screen.getByRole('button', { name: 'Ir' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(`/relatorio/${RELATORIO}/ficha/${ANOTHER_BLOCK}`));
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
  });
});
