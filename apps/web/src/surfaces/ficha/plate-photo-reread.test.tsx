import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoTile } from '../../db/photo-store.ts';
import { readReadingCancelled, readRereadAsked, readRereadAt, writeReadingCancelled } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
import { AiFeaturesContext } from '../../state/ai-features.tsx';
import { SyncRequestError } from '../../sync/client.ts';
import { SyncContext, type SyncState } from '../../state/sync.tsx';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { makeSyncState } from '../../test/sync-state.ts';
import { PlatePhotoRow } from './plate-photo.tsx';

/*
 * E9 sweep B16: "Tentar novamente" on a failed plate reading is recorded in `local_prefs`
 * with the photo's reading status op current at the press, so a reload (a fresh mount over
 * the same device database) before the next status op keeps the button disabled with its
 * asked reason; a new status op brings it back.
 */

const session: { database: AppDatabase | null; user: null; online: boolean } = { database: null, user: null, online: true };
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));

const PHOTO = '019966b0-00b6-7000-8000-000000000001';
const OP_A = '019966b0-00b6-7000-8000-0000000000a1';
const OP_B = '019966b0-00b6-7000-8000-0000000000a2';

const failedTile = (opId: string | null): PhotoTile => ({
  id: PHOTO,
  block_id: '019966b0-00b6-7000-8000-000000000002',
  item_key: null,
  caption: 'placa de identificação',
  captured_at: '2026-09-06T13:20:00.000Z',
  local_seq: 3,
  coords: null,
  uploaded_at: null,
  thumb: null,
  upload_error: null,
  reading_kind: 'plate',
  reading_status: 'failed',
  reading_status_op_id: opId,
});

function row(opId: string | null, sync: SyncState): ReactNode {
  return (
    <SyncContext value={sync}>
      <ToastProvider>
        <PlatePhotoRow tile={failedTile(opId)} number={3} view="failed" onOpen={vi.fn()} onFillManually={vi.fn()} />
        <ToastOutlet />
      </ToastProvider>
    </SyncContext>
  );
}

let counter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-00b6-7000-8000-${(++counter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

afterEach(async () => {
  cleanup();
  await session.database?.close();
  session.database = null;
});

const retry = () => screen.getByRole('button', { name: 'Tentar novamente' });

describe('E9 sweep B16: "Tentar novamente" survives a reload', () => {
  it('records the press with its status op; a remount keeps it disabled with "Nova leitura pedida" until a new status op', async () => {
    session.database = await freshDb();
    const sync = makeSyncState();
    const first = render(row(OP_A, sync));
    await waitFor(() => expect(retry()).not.toHaveAttribute('aria-disabled'), { timeout: 5000 });
    await userEvent.click(retry());
    await waitFor(() => expect(sync.rereadPhoto).toHaveBeenCalledWith(PHOTO));
    expect(await readRereadAsked(session.database, PHOTO)).toBe(OP_A);
    first.unmount();

    // The reload: a fresh mount, no component state, the same status op.
    const reloaded = makeSyncState();
    const second = render(row(OP_A, reloaded));
    // Before the record is read the button is already disabled: a fast tap starts nothing.
    expect(retry()).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(retry());
    await waitFor(() => expect(retry()).toHaveAttribute('aria-disabled', 'true'));
    expect(retry()).toHaveAccessibleDescription('Nova leitura pedida');
    await userEvent.click(retry());
    expect(reloaded.rereadPhoto).not.toHaveBeenCalled();
    second.unmount();

    // The reading failed again (a new status op): the button is back.
    render(row(OP_B, reloaded));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(retry()).not.toHaveAttribute('aria-disabled');
    await userEvent.click(retry());
    await waitFor(() => expect(reloaded.rereadPhoto).toHaveBeenCalledOnce());
  });

  it('a refused reread clears the record, so a reload offers the button again', async () => {
    session.database = await freshDb();
    const sync = makeSyncState({ rereadPhoto: vi.fn(async () => Promise.reject(new Error('503'))) });
    const first = render(row(null, sync));
    await waitFor(() => expect(retry()).not.toHaveAttribute('aria-disabled'), { timeout: 5000 });
    await userEvent.click(retry());
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Não foi possível pedir a nova leitura'));
    await waitFor(async () => expect(await readRereadAsked(session.database!, PHOTO)).toBeUndefined());
    first.unmount();

    render(row(null, makeSyncState()));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(retry()).not.toHaveAttribute('aria-disabled');
  });
});

describe('13.5: "Tentar novamente" after a cancel', () => {
  it('clears the cancel record before asking, so the new run\'s suggestions show', async () => {
    session.database = await freshDb();
    await writeReadingCancelled(session.database, PHOTO, '2026-10-07T12:00:00.000Z');
    expect(await readReadingCancelled(session.database, PHOTO)).toBe('2026-10-07T12:00:00.000Z');
    const sync = makeSyncState();
    render(row(OP_A, sync));
    await waitFor(() => expect(retry()).not.toHaveAttribute('aria-disabled'), { timeout: 5000 });
    await userEvent.click(retry());
    await waitFor(() => expect(sync.rereadPhoto).toHaveBeenCalledWith(PHOTO));
    expect(await readReadingCancelled(session.database, PHOTO)).toBeUndefined();
  });
});

describe('review F-07 (Q-3): "Ler de novo" after a cancel', () => {
  const runningTile = (): PhotoTile => ({ ...failedTile(OP_A), reading_status: 'running', reading_status_at: new Date(Date.now() - 20_000).toISOString() });
  const running = (sync: SyncState, ai = true): ReactNode => (
    <AiFeaturesContext value={ai}>
      <SyncContext value={sync}>
        <ToastProvider>
          <PlatePhotoRow tile={runningTile()} number={3} view="running" onOpen={vi.fn()} onFillManually={vi.fn()} />
          <ToastOutlet />
        </ToastProvider>
      </SyncContext>
    </AiFeaturesContext>
  );
  const again = () => screen.getByRole('button', { name: 'Ler de novo' });
  const CANCELLED_AT = '2026-10-07T12:00:00.000Z';

  afterEach(() => {
    session.online = true;
  });

  it('a cancelled reading shows "Ler de novo" instead of the wait line; the press clears the cancel, asks the reread route, and the wait line returns', async () => {
    session.database = await freshDb();
    await writeReadingCancelled(session.database, PHOTO, CANCELLED_AT);
    const sync = makeSyncState();
    const { container } = render(running(sync));
    await waitFor(() => expect(again()).toBeInTheDocument(), { timeout: 5000 });
    expect(container.querySelector('.reading-wait')).toBeNull();
    await userEvent.click(again());
    await waitFor(() => expect(sync.rereadPhoto).toHaveBeenCalledWith(PHOTO));
    await waitFor(() => expect(container.querySelector('.reading-wait')).not.toBeNull());
    expect(await readReadingCancelled(session.database, PHOTO)).toBeUndefined();
    expect(screen.queryByRole('button', { name: 'Ler de novo' })).toBeNull();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('Epic 13 re-check N-1: after "Ler de novo" the wait counts from the press, not from the earlier status op (no age, no "Cancelar" yet), and the press instant is recorded', async () => {
    session.database = await freshDb();
    await writeReadingCancelled(session.database, PHOTO, CANCELLED_AT);
    const { container } = render(running(makeSyncState()));
    await waitFor(() => expect(again()).toBeInTheDocument(), { timeout: 5000 });
    const before = Date.now();
    await userEvent.click(again());
    await waitFor(() => expect(container.querySelector('.reading-wait')).not.toBeNull());
    // The tile's newest status op is 20 s old: counted from it, the line would read "Lendo… 20 s" with "Cancelar".
    await waitFor(() => expect(container.querySelector('.reading-wait .reading-line')).toHaveTextContent(/^Lendo…$/));
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    const at = await readRereadAt(session.database, PHOTO);
    expect(at).toBeDefined();
    expect(Date.parse(at!)).toBeGreaterThanOrEqual(before - 1000);
  });

  it('a 409 reading_running or not_caught_up answer is success: the cancel stays cleared, no error toast', async () => {
    for (const code of ['reading_running', 'not_caught_up']) {
      session.database = await freshDb();
      await writeReadingCancelled(session.database, PHOTO, CANCELLED_AT);
      const sync = makeSyncState({ rereadPhoto: vi.fn(async () => Promise.reject(new SyncRequestError({ kind: 'http', status: 409, code }))) });
      const { container, unmount } = render(running(sync));
      await waitFor(() => expect(again()).toBeInTheDocument(), { timeout: 5000 });
      await userEvent.click(again());
      await waitFor(() => expect(container.querySelector('.reading-wait')).not.toBeNull());
      expect(await readReadingCancelled(session.database, PHOTO)).toBeUndefined();
      expect(screen.queryByTestId('toast')).toBeNull();
      unmount();
      await session.database.close();
    }
  });

  it('any other failure records the cancel again and says "Não foi possível pedir a nova leitura"', async () => {
    session.database = await freshDb();
    await writeReadingCancelled(session.database, PHOTO, CANCELLED_AT);
    const sync = makeSyncState({ rereadPhoto: vi.fn(async () => Promise.reject(new SyncRequestError({ kind: 'http', status: 503 }))) });
    render(running(sync));
    await waitFor(() => expect(again()).toBeInTheDocument(), { timeout: 5000 });
    await userEvent.click(again());
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Não foi possível pedir a nova leitura'));
    await waitFor(async () => expect(await readReadingCancelled(session.database!, PHOTO)).toBe(CANCELLED_AT));
    await waitFor(() => expect(again()).not.toHaveAttribute('aria-disabled'));
  });

  it('offline it is disabled with "Sem conexão"; with AI features off it is not offered', async () => {
    session.database = await freshDb();
    await writeReadingCancelled(session.database, PHOTO, CANCELLED_AT);
    session.online = false;
    const sync = makeSyncState({ online: false });
    const offline = render(running(sync));
    await waitFor(() => expect(again()).toHaveAttribute('aria-disabled', 'true'), { timeout: 5000 });
    expect(again()).toHaveAccessibleDescription('Sem conexão');
    await userEvent.click(again());
    expect(sync.rereadPhoto).not.toHaveBeenCalled();
    offline.unmount();

    session.online = true;
    const { container } = render(running(makeSyncState(), false));
    await waitFor(() => expect(container.querySelector('.reading-wait')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: 'Ler de novo' })).toBeNull();
  });
});
