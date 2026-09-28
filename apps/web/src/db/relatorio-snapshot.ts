import { createSnapshotBuilder, type EntityState, type RelatorioSnapshot } from '@app/domain';
import { useMemo } from 'react';

/*
 * E7-A1/E8-A1 (AD-13, AD-15): the one snapshot builder every surface of the device reads
 * after a commit. It is the kernel's incremental builder (`createSnapshotBuilder`), whose
 * output equals `buildSnapshot` for the same state; shared by every surface, so a row one
 * surface already parsed is not parsed again by the next, and a commit to one block leaves
 * every other row of the snapshot the same object. The export and preview path
 * (`db/snapshot.ts`) keeps the full `buildSnapshot`: it runs once per export.
 */
const build = createSnapshotBuilder();

/** The relatório's snapshot from a state, through the shared incremental builder. */
export function relatorioSnapshotOf(state: EntityState, relatorioId: string): RelatorioSnapshot {
  return build(state, relatorioId);
}

/** `relatorioSnapshotOf` memoized on the state and id; null while the state is not there. */
export function useRelatorioSnapshot(state: EntityState, relatorioId: string): RelatorioSnapshot;
export function useRelatorioSnapshot(state: EntityState | null | undefined, relatorioId: string): RelatorioSnapshot | null;
export function useRelatorioSnapshot(state: EntityState | null | undefined, relatorioId: string): RelatorioSnapshot | null {
  return useMemo(() => (state === undefined || state === null ? null : build(state, relatorioId)), [state, relatorioId]);
}
