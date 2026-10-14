import { describe, expect, it } from 'vitest';
import { pointDraftValue } from './point-writes.ts';

/*
 * Story 14.3: a point editor's draft keeps the local of a point created from a site item
 * ("Verificações do local"), so "Recuperar" after a reload still creates a point of that
 * local. A draft written before the field, or of any other point, reads with no local.
 */

const REL = '019966c1-0150-7000-8000-000000000001';
const LOCAL = '019966c1-0150-7000-8000-000000000002';
const base = { relatorio_id: REL, text: '[[foto:x]]', action: '', owner: '', is_new: true, equipmentId: null, origin: 'manual', pending: {} };

describe('14.3-UNIT pointDraftValue', () => {
  it('reads back the local of a site item\'s point', () => {
    expect(pointDraftValue({ ...base, locationId: LOCAL })).toEqual({ ...base, locationId: LOCAL });
  });

  it('reads a draft with no local (written before the field, or a point of an equipment) without the key', () => {
    const read = pointDraftValue(base);
    expect(read).toEqual(base);
    expect(read).not.toHaveProperty('locationId');
    expect(pointDraftValue({ ...base, locationId: null })).not.toHaveProperty('locationId');
    expect(pointDraftValue({ ...base, locationId: 7 })).not.toHaveProperty('locationId');
  });

  it('still refuses a value that is not a point draft', () => {
    expect(pointDraftValue({ ...base, equipmentId: 3 })).toBeNull();
    expect(pointDraftValue({ ...base, origin: 'site' })).toBeNull();
  });
});
