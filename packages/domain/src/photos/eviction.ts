import { STORAGE_LOW_FREE_BYTES, type StorageReading } from '../checks/storage.ts';
import type { RelatorioStatus } from '../schemas/entities.ts';

/*
 * Story 6.2 (AR-6): which local originals the device may delete. Only an original the
 * server acknowledged is ever a candidate; a never-acked original is never evicted. All
 * the acked originals of a relatório that left Rascunho and Em campo go at once; under
 * storage pressure the oldest-acked go next, until the pressure is covered. Thumbs are
 * never in the plan (they live in their own table and are never evicted).
 */

export interface EvictionBlob {
  id: string;
  /** The server holds the bytes. */
  acked: boolean;
  /** When this device learnt it; null for a blob acked before the time was recorded. */
  acked_at: string | null;
  size: number;
  relatorio_id: string | null;
}

/** The statuses whose originals stay on the device: the relatório is still being filled here. */
const FIELD_STATUSES: readonly RelatorioStatus[] = ['rascunho', 'em_campo'];

/** Bytes to free so the origin is back above the low-storage threshold; 0 without pressure or reading. */
export function storagePressureBytes(reading: StorageReading | null, freeBytes: number = STORAGE_LOW_FREE_BYTES): number {
  if (reading === null || !Number.isFinite(reading.usage) || !Number.isFinite(reading.quota)) return 0;
  return Math.max(0, freeBytes - (reading.quota - reading.usage));
}

/**
 * The ids to delete, in order: the wholesale ones first, then the oldest-acked while the
 * freed bytes stay under `pressure`. A blob whose relatório is not on the device is never
 * evicted wholesale (its status is unknown).
 */
export function evictionPlan(input: {
  blobs: readonly EvictionBlob[];
  relatorioStatus: Readonly<Record<string, RelatorioStatus>>;
  /** Bytes to free (`storagePressureBytes`); 0 when there is no pressure. */
  pressure: number;
}): string[] {
  const acked = input.blobs.filter((blob) => blob.acked);
  const plan: string[] = [];
  const taken = new Set<string>();
  let freed = 0;
  for (const blob of acked) {
    if (blob.relatorio_id === null) continue;
    const status = input.relatorioStatus[blob.relatorio_id];
    if (status === undefined || FIELD_STATUSES.includes(status)) continue;
    plan.push(blob.id);
    taken.add(blob.id);
    freed += blob.size;
  }
  if (freed >= input.pressure) return plan;
  const oldestFirst = acked
    .filter((blob) => !taken.has(blob.id))
    .sort((a, b) => {
      const ta = a.acked_at ?? '';
      const tb = b.acked_at ?? '';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  for (const blob of oldestFirst) {
    if (freed >= input.pressure) break;
    plan.push(blob.id);
    freed += blob.size;
  }
  return plan;
}
