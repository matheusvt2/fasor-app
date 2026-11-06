import { describe, expect, it } from 'vitest';
import { withCaptionOrdinals } from './caption-ordinal.ts';

/* Story 22.3: a caption repeated inside one photo block takes " (2)", " (3)" before its closing period. */

describe('22.3 withCaptionOrdinals', () => {
  it('leaves the first caption as it is and suffixes the repeats in order', () => {
    const caption = 'Ensaio de resistência de isolamento — TR-1';
    expect(withCaptionOrdinals([caption, caption, caption])).toEqual([caption, `${caption} (2)`, `${caption} (3)`]);
  });

  it('puts the suffix before a final period and compares trimmed, a final "." ignored', () => {
    expect(withCaptionOrdinals(['Vista geral.', ' Vista geral ', 'Vista geral.  '])).toEqual(['Vista geral.', 'Vista geral (2)', 'Vista geral (3).']);
  });

  it('never suffixes or counts an uncaptioned photo, and counts each caption apart', () => {
    expect(withCaptionOrdinals([null, 'A', '  ', 'B', null, 'A', 'B', 'A'])).toEqual([null, 'A', '  ', 'B', null, 'A (2)', 'B (2)', 'A (3)']);
  });

  it('is case- and accent-exact: a different caption is no repeat', () => {
    expect(withCaptionOrdinals(['Placa', 'placa', 'Placa!'])).toEqual(['Placa', 'placa', 'Placa!']);
  });

  it('returns an empty list for an empty block', () => {
    expect(withCaptionOrdinals([])).toEqual([]);
  });
});
