import { describe, expect, it } from 'vitest';
import { orderUploads } from './upload-order.ts';

describe('6.2-UNIT-001 orderUploads', () => {
  it('puts a waiting reading first, then photos by captured_at, then the other kinds', () => {
    const items = [
      { id: 'c', kind: 'certificate' },
      { id: 'p2', kind: 'photo', captured_at: '2026-09-06T11:20:00.000Z', reading_status: 'none' },
      { id: 'p1', kind: 'photo', captured_at: '2026-09-06T11:10:00.000Z', reading_status: 'none' },
      { id: 'pr', kind: 'photo', captured_at: '2026-09-06T11:30:00.000Z', reading_status: 'queued' },
      { id: 'l', kind: 'logo' },
    ];
    expect(orderUploads(items).map((item) => item.id)).toEqual(['pr', 'p1', 'p2', 'c', 'l']);
  });

  it('breaks a captured_at tie by id, and treats a running reading like a queued one', () => {
    const items = [
      { id: 'b', kind: 'photo', captured_at: '2026-09-06T11:10:00.000Z', reading_status: 'none' },
      { id: 'a', kind: 'photo', captured_at: '2026-09-06T11:10:00.000Z', reading_status: 'none' },
      { id: 'r', kind: 'photo', captured_at: '2026-09-06T12:00:00.000Z', reading_status: 'running' },
    ];
    expect(orderUploads(items).map((item) => item.id)).toEqual(['r', 'a', 'b']);
  });

  it('31.3-UNIT-005 sends an audio with the waiting readings, before the other photos, by id inside that rank', () => {
    const items = [
      { id: '019966b0-0002', kind: 'photo', captured_at: '2026-09-06T11:10:00.000Z', reading_status: 'none' },
      { id: '019966b0-0005', kind: 'audio', captured_at: null, reading_status: null },
      { id: '019966b0-0001', kind: 'certificate' },
      { id: '019966b0-0004', kind: 'photo', captured_at: '2026-09-06T11:30:00.000Z', reading_status: 'queued' },
      { id: '019966b0-0003', kind: 'audio', captured_at: null, reading_status: null },
    ];
    expect(orderUploads(items).map((item) => item.id)).toEqual(['019966b0-0003', '019966b0-0004', '019966b0-0005', '019966b0-0002', '019966b0-0001']);
  });

  it('never mutates its input', () => {
    const items = [
      { id: 'c', kind: 'certificate' },
      { id: 'p', kind: 'photo', captured_at: '2026-09-06T11:10:00.000Z' },
    ];
    orderUploads(items);
    expect(items.map((item) => item.id)).toEqual(['c', 'p']);
  });
});
