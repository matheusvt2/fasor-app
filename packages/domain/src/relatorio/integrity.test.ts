import { describe, expect, it } from 'vitest';
import { integrityFindings } from './integrity.ts';

const E1 = '019966b0-0041-7000-8000-000000000001';
const E2 = '019966b0-0041-7000-8000-000000000002';
const E3 = '019966b0-0041-7000-8000-000000000003';
const E4 = '019966b0-0041-7000-8000-000000000004';

describe('4.1-UNIT integrityFindings duplicate_tag', () => {
  it('names a tag two live rows share, both ids, and never a removed row', () => {
    const findings = integrityFindings({
      equipment: [
        { id: E1, tag: 'SEC-C05', removed_at: null },
        { id: E2, tag: 'sec-c05', removed_at: null },
        { id: E3, tag: 'SEC-C05', removed_at: '2026-09-07T10:00:00.000Z' },
        { id: E4, tag: 'DJ-C05', removed_at: null },
      ],
    });
    expect(findings).toEqual([{ kind: 'duplicate_tag', tag: 'SEC-C05', equipment_ids: [E1, E2] }]);
  });

  it('is empty when every live tag is unique', () => {
    expect(
      integrityFindings({
        equipment: [
          { id: E1, tag: 'SEC-C05', removed_at: null },
          { id: E2, tag: 'SEC-C05-2', removed_at: null },
        ],
      }),
    ).toEqual([]);
  });
});
