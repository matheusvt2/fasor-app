import { readingWait, toIso } from '@app/domain';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TextButton } from '../../components/index.ts';
import { now } from '../../clock.ts';
import { copy } from '../../copy/pt-br.ts';
import { useLiveQuery } from '../../db/live.ts';
import { clearReadingCancelled, clearRereadAsked, readReadingCancelled, readRereadAsked, writeReadingCancelled, writeRereadAsked } from '../../db/prefs.ts';
import { discardCancelledReadings } from '../../db/suggestion-store.ts';
import { newId } from '../../ids.ts';
import { useSession } from '../../state/session.tsx';
import { requestSyncCycle, useSync } from '../../state/sync.tsx';
import { useToast } from '../../state/toast.tsx';

/*
 * Story 13.5 (WAIT-1, WAIT-2; review-field-ux-2026-10-06): the lines a pending or failed plate
 * or display reading shows, shared by the plate photo row (`plate-photo.tsx`) and the
 * "Ler visor" cells and environment fields (`read-display.tsx`).
 *
 * - `ReadingWaitLine`: "Lendo…" under 10 s; then "Lendo… 12 s", ticking, and "Cancelar"; from
 *   120 s the still-reading note (the device keeps polling every 60 s). The age and every
 *   threshold are the kernel's (`readingWait`). "Cancelar" records the cancel on this device
 *   (`reading_cancelled:{photo}`), discards what that reading already produced and hides the
 *   line at once; the post-pull sweep discards what it produces later. The photo stays.
 * - `FailedReading`: "Não foi possível ler", "Tentar novamente" (the reread route) and the
 *   way to type instead ("Preencher manualmente" on the plate, "Digitar" on a cell).
 */

/** Whether this device cancelled the photo's reading: null until read. */
export function useReadingCancelled(photoId: string): boolean | null {
  const db = useSession().database;
  return useLiveQuery(() => (db === null ? Promise.resolve(false) : readReadingCancelled(db, photoId).then((at) => at !== undefined)), [db, photoId], null) ?? null;
}

/** The device clock as an ISO string, read again every `everyMs` while mounted. */
function useNowIso(everyMs: number): string {
  const [iso, setIso] = useState(() => toIso(now()));
  useEffect(() => {
    const timer = setInterval(() => setIso(toIso(now())), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return iso;
}

export interface ReadingWaitLineProps {
  photoId: string;
  /** Where the age counts from (`readingStartedAt`). */
  startedAt: string;
  /** `plate`: the `.reading-line` under the photo; `display`: the `.queued-banner` under a cell or field. */
  variant: 'plate' | 'display';
}

/**
 * The wait line of a reading the server has or is about to run. `aria-busy` keeps the
 * ticking seconds from being announced every second; the line is a live region still, so
 * screen readers read it when asked and once it settles.
 */
export function ReadingWaitLine({ photoId, startedAt, variant }: ReadingWaitLineProps) {
  const t = copy.readingWait;
  const session = useSession();
  const db = session.database;
  const user = session.user;
  const cancelled = useReadingCancelled(photoId);
  const [hidden, setHidden] = useState(false);
  const wait = readingWait(startedAt, useNowIso(1000));
  if (hidden || cancelled === true) return null;

  const cancel = () => {
    setHidden(true);
    if (db === null) return;
    const author = user === null ? null : { id: user.id, companyId: user.companyId };
    void writeReadingCancelled(db, photoId, toIso(now()))
      // What this reading already brought is discarded now; what it brings later, by the sweep.
      .then(() => (author === null ? [] : discardCancelledReadings(db, author, { newId, now }, photoId)))
      .then((discarded) => {
        if (discarded.length > 0) requestSyncCycle();
      })
      .catch((error: unknown) => console.error('reading cancel failed', error));
  };

  const text =
    variant === 'plate' ? (
      <p className="reading-line" role="status" aria-busy="true">
        {wait.text}
      </p>
    ) : (
      <span className="queued-banner" role="status" aria-busy="true">
        <svg className="ico" aria-hidden="true">
          <use href="/sprite.svg#i-image" />
        </svg>
        {wait.text}
      </span>
    );
  return (
    <div className="reading-wait" data-photo-id={photoId}>
      {text}
      {wait.cancellable ? <TextButton onPress={cancel}>{t.cancel}</TextButton> : null}
      {wait.stillReading ? <p className="reading-note">{t.stillReading}</p> : null}
    </div>
  );
}

/** `FailedReading`'s record of a reread press: not read yet, or read and none recorded (never an op id). */
const NOT_READ = 'not-read';
const NOT_ASKED = 'not-asked';

export interface FailedReadingProps {
  photoId: string;
  /** The photo's newest status op (`PhotoTile.reading_status_op_id`); the caller keys this component by it. */
  statusOpId: string | null;
  /** Story 11.8 follow-up: false while the server's AI features are off (a reread would be refused); only the fallback stays. */
  canRetry: boolean;
  /** The way to type instead: "Preencher manualmente" on the plate, "Digitar" on a cell. */
  onFallback: () => void;
  fallbackLabel: ReactNode;
}

/**
 * "Não foi possível ler": the photo stays and nothing was written. "Tentar novamente" asks the
 * server for a new reading (offline it is disabled with its reason); the fallback takes the
 * engineer to typing. E78-Q5: from the tap the button stays disabled until the photo's reading
 * status moves (the caller remounts this on every status op) or the request fails, so a second
 * tap never starts a second run. E9 sweep B16: the press is also recorded in `local_prefs` with
 * the status op it answered (`statusOpId`), so a reload before the next status op arrives keeps
 * the button disabled with its asked reason. Story 13.5: a cancel recorded for the photo is
 * cleared before asking, so the new run's suggestions show.
 */
export function FailedReading({ photoId, statusOpId, canRetry, onFallback, fallbackLabel }: FailedReadingProps) {
  const t = copy.ficha.nameplate;
  const sync = useSync();
  const session = useSession();
  const online = session.online;
  const db = session.database;
  const { showToast } = useToast();
  const [asking, setAsking] = useState(false);
  // `null` until the recorded press has been read: right after a reload a fast tap must not
  // start a second reread before the record says whether one was already asked.
  const recorded = useLiveQuery(
    () => (db === null ? Promise.resolve(NOT_ASKED) : readRereadAsked(db, photoId).then((opId) => (opId === undefined ? NOT_ASKED : opId))),
    [db, photoId],
    NOT_READ,
  );
  // With no database there is no record to wait for.
  const loading = db !== null && recorded === NOT_READ;
  const asked = asking || (recorded !== NOT_READ && recorded !== NOT_ASKED && recorded === statusOpId);
  const retry = () => {
    if (asked || loading || sync.rereadPhoto === undefined) return;
    const rereadPhoto = sync.rereadPhoto;
    setAsking(true);
    void (db === null ? Promise.resolve() : clearReadingCancelled(db, photoId).then(() => writeRereadAsked(db, photoId, statusOpId)))
      .then(() => rereadPhoto(photoId))
      // The server moves the reading on (`running`, then suggestions or `failed` again); the
      // next pull brings it, now.
      .then(() => requestSyncCycle())
      .catch(() => {
        setAsking(false);
        if (db !== null) void clearRereadAsked(db, photoId).catch(() => undefined);
        showToast(t.retryFailed);
      });
  };
  return (
    <>
      <p className="reading-line" role="status">
        {t.readFailed}
      </p>
      <div className="row-wrap">
        {canRetry ? (
          <TextButton isDisabled={!online || asked || loading} disabledReason={!online ? t.retryOffline : asked ? t.retryAsked : loading ? copy.common.loading : undefined} onPress={retry}>
            {t.retryRead}
          </TextButton>
        ) : null}
        <TextButton onPress={onFallback}>{fallbackLabel}</TextButton>
      </div>
    </>
  );
}

/**
 * WAIT-2: a failed display reading under its empty cell or environment field: the failed line
 * with "Digitar", which focuses the input of the cell or field the line sits in.
 */
export function DisplayFailedLine({ photoId, statusOpId, canRetry }: { photoId: string; statusOpId: string | null; canRetry: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const typeInstead = () => {
    const input = host.current?.closest('.ficha-cell, [data-field-key]')?.querySelector<HTMLInputElement>('input');
    input?.focus();
  };
  return (
    <div className="reading-failed" ref={host} data-photo-id={photoId}>
      {/* E78-Q5: keyed by the newest status op, so a tap waits for the next one. */}
      <FailedReading key={statusOpId ?? 'create'} photoId={photoId} statusOpId={statusOpId} canRetry={canRetry} onFallback={typeInstead} fallbackLabel={copy.readingWait.typeInstead} />
    </div>
  );
}
