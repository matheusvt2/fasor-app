import { describe, expect, it } from 'vitest';
import { formatBytes, storageLine } from './storage.ts';

describe('formatBytes', () => {
  it('reads 0 B at zero and for a negative or unusable number', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-1)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('keeps whole units below a megabyte', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('never renders a rounded value back into its own unit at a boundary', () => {
    // 1_048_575 B is 1023.999... KB: rounding it must step up, not print "1024 KB".
    expect(formatBytes(1024 * 1024 - 1)).toBe('1,0 MB');
    // Bytes are exact, so the last whole-byte value keeps its own unit.
    expect(formatBytes(1024 - 1)).toBe('1023 B');
    expect(formatBytes(1024 ** 3 - 1)).toBe('1,0 GB');
    expect(formatBytes(1024 ** 4 - 1)).toBe('1,0 TB');
    // The largest unit has nowhere to step up to and keeps its number.
    expect(formatBytes(2048 * 1024 ** 4)).toBe('2048,0 TB');
  });

  it('uses one comma decimal from a megabyte up', () => {
    expect(formatBytes(1_288_490_188)).toBe('1,2 GB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(formatBytes(3 * 1024 ** 4)).toBe('3,0 TB');
  });
});

describe('storageLine', () => {
  it('writes the size and the two counts', () => {
    expect(storageLine({ usage_bytes: 1_288_490_188, relatorios: 2, photos: 0 })).toEqual({
      value: '1,2 GB',
      detail: '· 2 relatórios · 0 fotos',
    });
  });

  it('uses the singular forms', () => {
    expect(storageLine({ usage_bytes: 1024, relatorios: 1, photos: 1 }).detail).toBe('· 1 relatório · 1 foto');
  });

  it('says so when the browser has no estimate', () => {
    expect(storageLine({ usage_bytes: null, relatorios: 2, photos: 3 })).toEqual({
      value: 'Indisponível neste navegador',
      detail: '',
    });
  });
});
