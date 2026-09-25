import { capturedAtFrom, parseExif, toIso, type ExifData } from '@app/domain';
import { useCallback, useEffect, useRef } from 'react';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { commitPhotoCapture, type PhotoCaptureInput } from '../../db/file-commit.ts';
import { photoLocationEnabled, readPhotoSeq, writeGeolocationDenied, writePhotoSeqAtLeast } from '../../db/photo-store.ts';
import { deviceId } from '../../db/sync-store.ts';
import { reserveDirectSeq, sendPhotoDirect, sessionCaptureRescue, type RescueDeps } from '../../files/capture-rescue.ts';
import { browserPositionTracker, type PositionTracker } from '../../files/geolocation.ts';
import { encodePhoto, type EncodedPhoto } from '../../files/photo-encode.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { requestSyncCycle } from '../../state/sync.tsx';
import { requestStorageCheck } from '../../state/storage-reading.ts';
import { useToast } from '../../state/toast.tsx';
import { createBrowserSyncClient } from '../../sync/client.ts';

/*
 * Story 6.1 (FR-43, FR-44) and 6.2 (FR-57): what one shot does. The counter the camera
 * shows moves at the tap; the shot itself is re-encoded on the device, stamped with its
 * time (EXIF when the file has it, else the device clock) and, when the user allows it,
 * its position, then committed as one transaction (`commitPhotoCapture`). Shots commit one
 * after another, in the order they were taken. A browser that refuses to store a shot hands
 * it to the capture rescue (sent straight to the server online, held in memory offline).
 */

export interface CaptureTarget {
  /** The sheet, or null for a gallery shot ("Geral", Story 6.3). */
  blockId: string | null;
  itemKey: string | null;
  /** The kernel's `contextCaption`, fixed when the camera opened (null: no context). */
  caption: string | null;
}

const EXIF_HEAD_BYTES = 256 * 1024;
const NO_EXIF: Pick<ExifData, 'dateTimeOriginal' | 'offsetMinutes'> = { dateTimeOriginal: null, offsetMinutes: null };

export interface PhotoCapture {
  /** Reads the location setting and asks for a fix: called when the camera opens. */
  prepare: () => Promise<void>;
  /** Takes one shot; returns at once (the commit runs behind it). The hook owns an ImageBitmap it is given. */
  shoot: (source: Blob | ImageBitmap, target: CaptureTarget) => void;
  /** Waits for every pending commit and retries a held shot once; false when a shot is still held. */
  settle: () => Promise<boolean>;
  ready: boolean;
}

export function usePhotoCapture(relatorioId: string): PhotoCapture {
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const online = session.online;
  const { showToast } = useToast();
  const chain = useRef<Promise<void>>(Promise.resolve());
  const tracker = useRef<PositionTracker | null>(null);
  const locationEnabled = useRef(true);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const trackerOf = useCallback((): PositionTracker => {
    if (tracker.current === null) {
      tracker.current = browserPositionTracker(() => {
        if (db !== null) void writeGeolocationDenied(db).catch(() => undefined);
      });
    }
    return tracker.current;
  }, [db]);

  const rescueDeps = useCallback((): RescueDeps | null => {
    if (db === null) return null;
    return {
      isOnline: () => onlineRef.current,
      commit: (input) => commitPhotoCapture(db, input, { newId, now }),
      sendDirect: async (input) => {
        const device = await deviceId(db, newId);
        const localSeq = reserveDirectSeq(input.fileId, await readPhotoSeq(db));
        // Best effort (the device may be refusing writes): the next stored shot continues after it.
        await writePhotoSeqAtLeast(db, localSeq).catch(() => undefined);
        await sendPhotoDirect(input, { client: createBrowserSyncClient(), deviceId: device, localSeq, newId, now: now() });
      },
    };
  }, [db]);

  const prepare = useCallback(async () => {
    if (db === null || user === null) return;
    try {
      locationEnabled.current = await photoLocationEnabled(db, user.id);
    } catch {
      locationEnabled.current = true;
    }
    if (locationEnabled.current) trackerOf().warm();
  }, [db, user, trackerOf]);

  const shoot = useCallback(
    (source: Blob | ImageBitmap, target: CaptureTarget) => {
      const deps = rescueDeps();
      if (deps === null || user === null) return;
      const tappedAt = now();
      const deviceNow = toIso(tappedAt);
      const deviceOffset = -tappedAt.getTimezoneOffset();
      const withLocation = locationEnabled.current;
      // The position is asked at the tap, not when the queue reaches the shot.
      const fix = withLocation ? trackerOf().positionAtCapture() : Promise.resolve(null);
      const run = async () => {
        try {
          const exif = source instanceof Blob ? parseExif(new Uint8Array(await source.slice(0, EXIF_HEAD_BYTES).arrayBuffer())) : null;
          let encoded: EncodedPhoto;
          try {
            encoded = await encodePhoto(source);
          } finally {
            if (!(source instanceof Blob)) source.close();
          }
          const position = await fix;
          const time = capturedAtFrom(exif ?? NO_EXIF, deviceNow, deviceOffset);
          const exifCoords = withLocation && exif?.gps != null ? { ...exif.gps, accuracy_m: null, source: 'exif' as const } : null;
          const input: PhotoCaptureInput = {
            companyId: user.companyId,
            relatorioId,
            actorId: user.id,
            fileId: newId(),
            blockId: target.blockId,
            itemKey: target.itemKey,
            caption: target.caption,
            capturedAt: time.captured_at,
            tzOffset: time.tz_offset,
            coords: position ?? exifCoords,
            original: encoded.original,
            thumb: encoded.thumb,
            sha256: encoded.sha256,
          };
          // FR-57: a shot the browser refused earlier is tried again once, on this shot.
          if (sessionCaptureRescue.heldCount() > 0) await sessionCaptureRescue.retryHeld(deps);
          const outcome = await sessionCaptureRescue.save(input, deps);
          if (outcome === 'held') showToast(copy.photos.refusalToast);
          // E6-Q14: a saved shot goes out now when online, not on the next 60 s tick.
          else requestSyncCycle();
        } catch (error) {
          console.error('photo capture failed', error);
          showToast(copy.photos.failedToast);
        } finally {
          requestStorageCheck();
        }
      };
      chain.current = chain.current.then(run);
    },
    [rescueDeps, user, relatorioId, trackerOf, showToast],
  );

  const settle = useCallback(async () => {
    await chain.current;
    const deps = rescueDeps();
    if (deps === null || sessionCaptureRescue.heldCount() === 0) return true;
    const still = await sessionCaptureRescue.retryHeld(deps);
    requestStorageCheck();
    if (still > 0) showToast(copy.photos.refusalToast);
    return still === 0;
  }, [rescueDeps, showToast]);

  return { prepare, shoot, settle, ready: db !== null && user !== null };
}
