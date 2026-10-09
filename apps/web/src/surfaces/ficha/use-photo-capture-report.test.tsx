import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppDatabase } from '../../db/schema.ts';
import { ToastOutlet, ToastProvider } from '../../state/toast.tsx';
import { usePhotoCapture } from './use-photo-capture.ts';

/*
 * R8CAP-UNIT (review 2026-10-08, FLD-V1): a shot whose save throws is told to its camera
 * (`report('failed')`); the camera that says it itself (answers true) gets no toast under its
 * scrim, one that does not (a closed or closing camera, answers false) leaves the toast.
 */

const session = vi.hoisted(() => ({
  database: {} as unknown as AppDatabase,
  user: { id: '019966b0-0000-7000-8000-0000000000u1', companyId: '019966b0-0000-7000-8000-0000000000c1' },
  online: false,
}));
vi.mock('../../state/session.tsx', () => ({ useSession: () => session }));
vi.mock('../../files/photo-encode.ts', () => ({ encodePhoto: vi.fn(async () => Promise.reject(new Error('e2e: encode failed'))) }));
vi.mock('../../files/geolocation.ts', () => ({ browserPositionTracker: () => ({ warm: () => undefined, positionAtCapture: async () => null }) }));
vi.mock('../../state/storage-reading.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../state/storage-reading.ts')>()),
  requestStorageCheck: () => undefined,
}));

const TARGET = { blockId: null, itemKey: null, caption: null };

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastOutlet />
    </ToastProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function shootFailing(answer: boolean) {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { result } = renderHook(() => usePhotoCapture('019966b0-0000-7000-8000-0000000000r1'), { wrapper });
  const report = vi.fn(() => answer);
  await act(async () => {
    result.current.shoot(new Blob(['jpeg'], { type: 'image/jpeg' }), TARGET, report);
    await result.current.settle();
  });
  return report;
}

describe('R8CAP-UNIT usePhotoCapture tells a failed save to its camera', () => {
  it('a camera that says it (report answers true) hears "failed" and no toast is raised', async () => {
    const report = await shootFailing(true);
    expect(report).toHaveBeenCalledExactlyOnceWith('failed');
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('a camera that does not say it (report answers false) leaves the toast', async () => {
    const report = await shootFailing(false);
    expect(report).toHaveBeenCalledExactlyOnceWith('failed');
    expect(await screen.findByTestId('toast')).toHaveTextContent('Não foi possível salvar a foto. Tente de novo.');
  });
});
