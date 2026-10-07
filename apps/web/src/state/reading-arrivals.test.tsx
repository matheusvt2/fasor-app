import 'fake-indexeddb/auto';
import type { SuggestionRow } from '@app/domain';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import { CABINE_ID, COMPANY_ID, RELATORIO_ID as SMALL_RELATORIO, replaySmall } from '@app/domain/fixtures/replay-small';
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
