import { preIssue, progress, type PreIssueRow, type Progress, type RelatorioSnapshot, type SuggestionRow } from '@app/domain';
import { useMemo } from 'react';
import { now } from '../../clock.ts';
import { uploadErrorIds } from '../../db/file-store.ts';
import { useLiveQuery } from '../../db/live.ts';
import type { AppDatabase } from '../../db/schema.ts';
import { useSync } from '../../state/sync.tsx';

/*
 * Story 7.5: the one call of the kernel's `preIssue` both the Sumário rows and the Export
 * dialog render from (AD-2), with what only this device knows: the photos whose upload
 * stopped with an error, the clock reading, and, for the dialog, the rejected ops and the
 * other devices' last send (the `sync` rows no Sumário row draws). Story 8.6: the device's
 * pending suggestion rows (the snapshot holds only confirmed ones) give section 9's
 * "N fichas com sugestões por confirmar".
 */

const NO_ERRORS: ReadonlySet<string> = new Set();
const NO_PENDING: readonly SuggestionRow[] = [];

export function usePreIssue(
  db: AppDatabase | null,
  snapshot: RelatorioSnapshot | null,
  computed: Progress | null = null,
  pending: readonly SuggestionRow[] = NO_PENDING,
): PreIssueRow[] {
  const sync = useSync();
  const photoErrors = useLiveQuery(() => (db === null ? Promise.resolve(NO_ERRORS) : uploadErrorIds(db)), [db], NO_ERRORS);
  const { counts, lastPushAt, userNames, deviceId } = sync;
  const lastPushes = useMemo(
    () => lastPushAt.filter((push) => push.device_id !== deviceId).map((push) => ({ name: userNames[push.user_id] ?? push.user_id, at: push.at })),
    [lastPushAt, userNames, deviceId],
  );
  return useMemo(
    () =>
      snapshot === null
        ? []
        : preIssue(snapshot, computed ?? progress(snapshot, pending), { photoErrors, now: now(), rejected: counts.dead, lastPushes, pendingSuggestions: pending }),
    [snapshot, computed, photoErrors, counts.dead, lastPushes, pending],
  );
}
