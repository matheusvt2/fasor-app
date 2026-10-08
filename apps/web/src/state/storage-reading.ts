import type { StorageReading } from '@app/domain';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { storageHeadroom } from '../device/storage-estimate.ts';
import { sessionCaptureRescue, type CaptureRescue } from '../files/capture-rescue.ts';

/*
 * Story 6.2 (FR-57): the storage reading behind the global low-storage banner. Read on
 * mount, after each capture (`requestStorageCheck`) and after each sync cycle (the caller
 * passes the engine's `running` flag; a cycle ending re-reads). The kernel decides whether
 * the reading is low (`storageLow`).
 */

const listeners = new Set<() => void>();

/** Asks every mounted reader to measure again (the camera calls it after a shot). */
export function requestStorageCheck(): void {
  for (const listener of listeners) listener();
}

export function useStorageReading(cycleRunning: boolean, read: () => Promise<StorageReading | null> = storageHeadroom): StorageReading | null {
  const [reading, setReading] = useState<StorageReading | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // A cycle that just ended may have freed space (eviction) or filled it (pulled thumbs).
  const wasRunning = useRef(cycleRunning);
  useEffect(() => {
    if (wasRunning.current && !cycleRunning) setTick((n) => n + 1);
    wasRunning.current = cycleRunning;
  }, [cycleRunning]);

  useEffect(() => {
    let cancelled = false;
    void read().then(
      (value) => {
        if (!cancelled) setReading(value);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [tick, read]);

  return reading;
}

/**
 * Story 13.6 (CAP-4): a shot this tab took is held in memory because the browser refused to
 * store it (the capture rescue's held list is not empty). While it is, the camera blocks the
 * next shot and the shell shows the storage banner. Per tab: it ends with a retry that stores
 * or sends every held shot, or with the tab.
 */
export function useCaptureRefused(rescue: CaptureRescue = sessionCaptureRescue): boolean {
  return useSyncExternalStore(
    rescue.subscribe,
    () => rescue.heldCount() > 0,
    () => false,
  );
}
