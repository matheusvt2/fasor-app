import { describe, expect, it } from 'vitest';
import { clientReadingKindPutAllowed, readingKindPutStatus } from './retarget.ts';

describe('E9-Q2 the client reading_kind put', () => {
  it('allows the 9.2 re-target (panel -> plate, whatever the panel reading status) and the undo (null) only', () => {
    const photo = (reading_kind: string | null) => ({ kind: 'photo', reading_kind });
    expect(clientReadingKindPutAllowed(photo('panel'), 'plate')).toBe(true);
    for (const kind of ['plate', 'display', 'caption', 'nc_obs', null]) expect(clientReadingKindPutAllowed(photo(kind), 'plate')).toBe(false);
    for (const value of ['display', 'caption', 'panel', 'nc_obs', 'bogus', 1]) expect(clientReadingKindPutAllowed(photo('panel'), value)).toBe(false);
    for (const kind of ['plate', 'panel', null]) expect(clientReadingKindPutAllowed(photo(kind), null)).toBe(true);
    // No row (another company's id, or a photo this server never saw): only the null put.
    expect(clientReadingKindPutAllowed(null, 'plate')).toBe(false);
    expect(clientReadingKindPutAllowed(undefined, null)).toBe(true);
    expect(clientReadingKindPutAllowed({ kind: 'logo', reading_kind: 'panel' }, 'plate')).toBe(false);
  });

  it('queues a changed kind, keeps the status on the same kind, and leaves none on null', () => {
    expect(readingKindPutStatus({ reading_kind: 'panel' }, 'plate')).toEqual({ reading_status: 'queued' });
    expect(readingKindPutStatus({ reading_kind: 'plate' }, 'plate')).toEqual({});
    expect(readingKindPutStatus({ reading_kind: 'plate' }, null)).toEqual({ reading_status: 'none' });
    expect(readingKindPutStatus({ reading_kind: null }, 'panel')).toEqual({ reading_status: 'queued' });
  });
});
