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

  it('ledger 1131 (contract 14): allows a caption put only on a photo with no reading and no context', () => {
    const plain = { kind: 'photo', reading_kind: null, reading_status: 'none', block_id: null, caption: null, people_in_photo: false };
    expect(clientReadingKindPutAllowed(plain, 'caption')).toBe(true);
    expect(clientReadingKindPutAllowed({ ...plain, caption: '   ' }, 'caption')).toBe(true);
    expect(clientReadingKindPutAllowed({ ...plain, people_in_photo: null }, 'caption')).toBe(true);
    // Context: a sheet, a caption, the "Pessoas na foto" mark.
    expect(clientReadingKindPutAllowed({ ...plain, block_id: 'b1' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, caption: 'Vista geral' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, people_in_photo: true }, 'caption')).toBe(false);
    // A reading already: panel, caption queued or done, any other kind.
    expect(clientReadingKindPutAllowed({ ...plain, reading_kind: 'panel', reading_status: 'queued' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, reading_kind: 'caption', reading_status: 'queued' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, reading_kind: 'caption', reading_status: 'done' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, reading_status: 'done' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed({ ...plain, reading_status: 'queued' }, 'caption')).toBe(false);
    // Not a photo, or no row.
    expect(clientReadingKindPutAllowed({ ...plain, kind: 'logo' }, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed(null, 'caption')).toBe(false);
    expect(clientReadingKindPutAllowed(undefined, 'caption')).toBe(false);
    // Other kinds stay refused on the same plain photo.
    for (const value of ['display', 'panel', 'nc_obs', 'plate']) expect(clientReadingKindPutAllowed(plain, value)).toBe(false);
  });

  it('queues a changed kind, keeps the status on the same kind, and leaves none on null', () => {
    expect(readingKindPutStatus({ reading_kind: 'panel' }, 'plate')).toEqual({ reading_status: 'queued' });
    expect(readingKindPutStatus({ reading_kind: 'plate' }, 'plate')).toEqual({});
    expect(readingKindPutStatus({ reading_kind: 'plate' }, null)).toEqual({ reading_status: 'none' });
    expect(readingKindPutStatus({ reading_kind: null }, 'panel')).toEqual({ reading_status: 'queued' });
  });
});
