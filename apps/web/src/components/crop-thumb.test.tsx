import 'fake-indexeddb/auto';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { SessionState } from '../state/session.tsx';
import { SyncActionsContext, type SyncActions } from '../state/sync-actions.ts';
import { CropThumb } from './crop-thumb.tsx';

/*
 * W-11 (full review 2026-09-30): every CropThumb of one photo on screen (a plate's nine
 * fields) draws from one object URL of the source picture, so the full-size original is
 * decoded once; the URL is revoked when the last of them unmounts.
 */

let database: AppDatabase | null = null;
let counter = 0;

vi.mock('../state/session.tsx', () => ({
  useSession: (): Partial<SessionState> => ({ database }),
}));

const PHOTO = '019966b0-0076-7000-8000-000000000001';

async function freshDb(): Promise<AppDatabase> {
  const db = openDatabase(`crop-thumb-${++counter}`);
  await db.delete();
  return openDatabase(`crop-thumb-${counter}`);
}

let minted = 0;
const createObjectURL = vi.fn((): string => `blob:picture-${++minted}`);
const revokeObjectURL = vi.fn();

// jsdom has no object URLs: the two statics are provided for this file only.
const urlStatics = URL as unknown as Record<string, unknown>;

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  urlStatics.createObjectURL = createObjectURL;
  urlStatics.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
  cleanup();
  delete urlStatics.createObjectURL;
  delete urlStatics.revokeObjectURL;
  database?.close();
  database = null;
});

function actionsWith(fetchFile: SyncActions['fetchFile']): SyncActions {
  const unused = async () => {
    throw new Error('not used');
  };
  return { syncNow: unused, syncRelatorio: unused, resendDead: unused, fetchFile, generate: unused };
}

describe('W-11 CropThumb shares one source picture per photo', () => {
  it('nine fields of one plate: one fetch, one object URL, revoked once when the last one unmounts', async () => {
    database = await freshDb();
    const fetchFile = vi.fn(async () => new Blob(['plate-original'], { type: 'image/jpeg' }));
    const actions = actionsWith(fetchFile);
    const thumbs = (n: number) => (
      <SyncActionsContext value={actions}>
        {Array.from({ length: n }, (_, i) => (
          <CropThumb key={i} photoId={PHOTO} bbox={[0, 0, 0.5, 0.5]} label={`Campo ${i + 1}`} />
        ))}
      </SyncActionsContext>
    );
    const view = render(thumbs(9));
    await waitFor(() => expect(view.container.querySelectorAll('img')).toHaveLength(9));
    const sources = new Set([...view.container.querySelectorAll('img')].map((img) => img.getAttribute('src')));
    expect(sources.size).toBe(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchFile).toHaveBeenCalledTimes(1);

    // Eight of them go: the picture stays for the one left.
    view.rerender(thumbs(1));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('img')).toHaveLength(1);

    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith([...sources][0]);
  });
});
