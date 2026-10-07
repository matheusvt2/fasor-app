import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PhotoTile } from '../../db/photo-store.ts';
import { readReadingCancelled, readRereadAsked, writeReadingCancelled } from '../../db/prefs.ts';
import { openDatabase, type AppDatabase } from '../../db/schema.ts';
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
