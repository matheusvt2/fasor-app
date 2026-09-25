import { describe, expect, it } from 'vitest';
import { STORAGE_LOW_FREE_BYTES } from '../checks/storage.ts';
import { evictionPlan, storagePressureBytes, type EvictionBlob } from './eviction.ts';

const MB = 1024 * 1024;
const R_FIELD = 'r-field';
const R_DONE = 'r-done';

function blob(id: string, acked: boolean, ackedAt: string | null, relatorioId: string | null, size = 2 * MB): EvictionBlob {
  return { id, acked, acked_at: ackedAt, size, relatorio_id: relatorioId };
}

const blobs = [
  blob('unacked', false, null, R_FIELD),
  blob('new', true, '2026-09-06T12:00:00.000Z', R_FIELD),
  blob('old', true, '2026-09-06T10:00:00.000Z', R_FIELD),
  blob('mid', true, '2026-09-06T11:00:00.000Z', R_FIELD),
  blob('done-1', true, '2026-09-06T13:00:00.000Z', R_DONE),
  blob('unacked-done', false, null, R_DONE),
];

describe('6.2-UNIT-002 evictionPlan', () => {
  it('evicts nothing without pressure while the relatório is still in the field', () => {
    expect(evictionPlan({ blobs, relatorioStatus: { [R_FIELD]: 'em_campo', [R_DONE]: 'rascunho' }, pressure: 0 })).toEqual([]);
  });

  it('evicts every acked original of a relatório that left Rascunho and Em campo, never an unacked one', () => {
    expect(evictionPlan({ blobs, relatorioStatus: { [R_FIELD]: 'em_campo', [R_DONE]: 'em_revisao' }, pressure: 0 })).toEqual(['done-1']);
    expect(evictionPlan({ blobs, relatorioStatus: { [R_FIELD]: 'emitido', [R_DONE]: 'emitido' }, pressure: 0 }).sort()).toEqual(
      ['done-1', 'mid', 'new', 'old'].sort(),
    );
  });

  it('under pressure evicts the oldest-acked first until the pressure is covered', () => {
    expect(evictionPlan({ blobs, relatorioStatus: { [R_FIELD]: 'em_campo', [R_DONE]: 'em_campo' }, pressure: 3 * MB })).toEqual(['old', 'mid']);
  });

  it('counts the wholesale bytes toward the pressure', () => {
    expect(evictionPlan({ blobs, relatorioStatus: { [R_FIELD]: 'em_campo', [R_DONE]: 'emitido' }, pressure: 3 * MB })).toEqual(['done-1', 'old']);
  });

  it('never evicts an unacked original, whatever the pressure', () => {
    const plan = evictionPlan({ blobs, relatorioStatus: {}, pressure: 1_000 * MB });
    expect(plan).not.toContain('unacked');
    expect(plan).not.toContain('unacked-done');
    expect(plan).toHaveLength(4);
  });

  it('never evicts wholesale when the relatório status is unknown here', () => {
    expect(evictionPlan({ blobs, relatorioStatus: {}, pressure: 0 })).toEqual([]);
  });
});

describe('6.2-UNIT-003 storagePressureBytes', () => {
  it('is the deficit under the threshold, 0 above it or without a reading', () => {
    expect(storagePressureBytes({ usage: 0, quota: 10_000 * MB })).toBe(0);
    expect(storagePressureBytes({ usage: 900 * MB, quota: 1_000 * MB })).toBe(STORAGE_LOW_FREE_BYTES - 100 * MB);
    expect(storagePressureBytes(null)).toBe(0);
  });
});
