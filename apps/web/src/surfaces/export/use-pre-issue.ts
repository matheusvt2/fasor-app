import { issueConfirmation, latestPushPerUser, liveRegistryInstruments, preIssue, progress, sheetsUnderRemovedLocals, type EntityState, type InstrumentRow, type IssueConfirmation, type PreIssueRow, type Progress, type RelatorioSnapshot, type SuggestionRow } from '@app/domain';
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
const NO_NAMES: readonly string[] = [];
const NO_INSTRUMENTS: readonly InstrumentRow[] = [];

export function usePreIssue(
  db: AppDatabase | null,
  snapshot: RelatorioSnapshot | null,
  computed: Progress | null = null,
  pending: readonly SuggestionRow[] = NO_PENDING,
  state: EntityState | null = null,
): PreIssueRow[] {
  // Story 25.12: the sheets under a removed local, which only the whole state holds.
  const relatorioId = snapshot?.relatorio.id ?? null;
  const removedLocalSheets = useMemo(() => (state === null || relatorioId === null ? NO_NAMES : sheetsUnderRemovedLocals(state, relatorioId)), [state, relatorioId]);
  // Story 25.13: the company's live instruments, for a certificate number shared with another row.
  const registryInstruments = useMemo(() => (state === null ? NO_INSTRUMENTS : liveRegistryInstruments(state)), [state]);
  const sync = useSync();
  const photoErrors = useLiveQuery(() => (db === null ? Promise.resolve(NO_ERRORS) : uploadErrorIds(db)), [db], NO_ERRORS);
  const { counts, lastPushAt, userNames, deviceId } = sync;
  const lastPushes = useMemo(
    // Walk-through 2026-10-09 (m2): one line per user, the newest of that user's other devices.
    () => latestPushPerUser(lastPushAt.filter((push) => push.device_id !== deviceId)).map((push) => ({ name: userNames[push.user_id] ?? push.user_id, at: push.at })),
    [lastPushAt, userNames, deviceId],
  );
  return useMemo(
    () =>
      snapshot === null
        ? []
        : preIssue(snapshot, computed ?? progress(snapshot, pending), { photoErrors, now: now(), rejected: counts.dead, lastPushes, pendingSuggestions: pending, removedLocalSheets, registryInstruments }),
    [snapshot, computed, photoErrors, counts.dead, lastPushes, pending, removedLocalSheets, registryInstruments],
  );
}

/**
 * F-03 (D1): what issuing would print blank, the counts "Gerar relatório" asks to confirm
 * (`issueConfirmation`); null until the snapshot is read.
 */
export function useIssueConfirmation(snapshot: RelatorioSnapshot | null): IssueConfirmation | null {
  return useMemo(() => (snapshot === null ? null : issueConfirmation(snapshot, { now: now() })), [snapshot]);
}
