import { describe, expect, it } from 'vitest';
import { capturedAtFrom, parseExif } from './exif.ts';

/*
 * 6.1-UNIT: the EXIF reader over hand-built JPEG APP1 segments, both byte orders.
 */

interface Field {
  tag: number;
  type: 2 | 3 | 4 | 5 | 13;
  /** ASCII text, one SHORT/LONG, or rationals as [num, den] pairs. */
  value: string | number | [number, number][];
}

/** A TIFF block: IFD0 (orientation + pointers), the Exif IFD and the GPS IFD. */
function tiff(little: boolean, ifd0: Field[], exif: Field[], gps: Field[], pointerType: 4 | 13 = 4): Uint8Array {
  const buffer = new ArrayBuffer(1024);
  const view = new DataView(buffer);
  const u16 = (at: number, v: number) => view.setUint16(at, v, little);
  const u32 = (at: number, v: number) => view.setUint32(at, v, little);
  view.setUint16(0, little ? 0x4949 : 0x4d4d, false);
  u16(2, 0x2a);
  u32(4, 8);
  let heap = 600;
  const size = (f: Field) => (f.type === 2 ? (f.value as string).length + 1 : f.type === 5 ? (f.value as [number, number][]).length * 8 : f.type === 3 ? 2 : 4);
  const count = (f: Field) => (f.type === 2 ? (f.value as string).length + 1 : f.type === 5 ? (f.value as [number, number][]).length : 1);
  const writeValue = (at: number, f: Field) => {
    if (f.type === 2) {
      const text = f.value as string;
      for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
      view.setUint8(at + text.length, 0);
    } else if (f.type === 3) u16(at, f.value as number);
    else if (f.type === 4 || f.type === 13) u32(at, f.value as number);
    else (f.value as [number, number][]).forEach(([n, d], i) => {
      u32(at + i * 8, n);
      u32(at + i * 8 + 4, d);
    });
  };
  const writeIfd = (at: number, fields: Field[]): number => {
    u16(at, fields.length);
    fields.forEach((f, i) => {
      const base = at + 2 + i * 12;
      u16(base, f.tag);
      u16(base + 2, f.type);
      u32(base + 4, count(f));
      if (size(f) <= 4) writeValue(base + 8, f);
      else {
        u32(base + 8, heap);
        writeValue(heap, f);
        heap += size(f) + (size(f) % 2);
      }
    });
    u32(at + 2 + fields.length * 12, 0);
    return at + 2 + fields.length * 12 + 4;
  };
  const exifAt = 200;
  const gpsAt = 400;
  writeIfd(8, [...ifd0, { tag: 0x8769, type: pointerType, value: exifAt }, { tag: 0x8825, type: pointerType, value: gpsAt }]);
  writeIfd(exifAt, exif);
  writeIfd(gpsAt, gps);
  return new Uint8Array(buffer, 0, heap);
}

/** SOI, an APP0 to skip, the APP1 Exif segment, then SOS. */
function jpeg(tiffBytes: Uint8Array): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const length = 2 + header.length + tiffBytes.length;
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xe1, length >> 8, length & 0xff, ...header, ...tiffBytes, 0xff, 0xda, 0x00, 0x02]);
}

const FULL = (little: boolean) =>
  jpeg(
    tiff(
      little,
      [{ tag: 0x0112, type: 3, value: 6 }],
      [
        { tag: 0x9003, type: 2, value: '2026:09:06 08:12:30' },
        { tag: 0x9011, type: 2, value: '-03:00' },
      ],
      [
        { tag: 0x0001, type: 2, value: 'S' },
        { tag: 0x0002, type: 5, value: [[23, 1], [33, 1], [1818, 100]] },
        { tag: 0x0003, type: 2, value: 'W' },
        { tag: 0x0004, type: 5, value: [[46, 1], [37, 1], [5988, 100]] },
      ],
    ),
  );

describe('6.1-UNIT-003 parseExif', () => {
  for (const little of [true, false]) {
    it(`reads time, offset, GPS and orientation (${little ? 'little' : 'big'} endian)`, () => {
      const exif = parseExif(FULL(little));
      expect(exif.dateTimeOriginal).toBe('2026-09-06T08:12:30');
      expect(exif.offsetMinutes).toBe(-180);
      expect(exif.orientation).toBe(6);
      expect(exif.gps?.lat).toBeCloseTo(-(23 + 33 / 60 + 18.18 / 3600), 6);
      expect(exif.gps?.lng).toBeCloseTo(-(46 + 37 / 60 + 59.88 / 3600), 6);
    });
  }

  it('reads all nulls from a JPEG without Exif, a truncated file and a non-JPEG', () => {
    const none = { dateTimeOriginal: null, offsetMinutes: null, gps: null, orientation: null };
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toEqual(none);
    expect(parseExif(FULL(true).slice(0, 30))).toEqual(none);
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toEqual(none);
    expect(parseExif(new Uint8Array(0))).toEqual(none);
  });

  it('follows Exif and GPS pointers stored with the IFD type (13)', () => {
    const bytes = jpeg(
      tiff(
        true,
        [],
        [{ tag: 0x9003, type: 2, value: '2026:09:06 08:12:30' }],
        [
          { tag: 0x0001, type: 2, value: 'S' },
          { tag: 0x0002, type: 5, value: [[23, 1], [0, 1], [0, 1]] },
          { tag: 0x0003, type: 2, value: 'W' },
          { tag: 0x0004, type: 5, value: [[46, 1], [0, 1], [0, 1]] },
        ],
        13,
      ),
    );
    const exif = parseExif(bytes);
    expect(exif.dateTimeOriginal).toBe('2026-09-06T08:12:30');
    expect(exif.gps).toEqual({ lat: -23, lng: -46 });
  });

  it('leaves a missing offset null', () => {
    const bytes = jpeg(tiff(true, [], [{ tag: 0x9003, type: 2, value: '2026:09:06 08:12:30' }], []));
    expect(parseExif(bytes)).toEqual({ dateTimeOriginal: '2026-09-06T08:12:30', offsetMinutes: null, gps: null, orientation: null });
  });
});

describe('6.1-UNIT-004 capturedAtFrom', () => {
  it('reads the EXIF wall time at its own offset (São Paulo = -180)', () => {
    expect(capturedAtFrom({ dateTimeOriginal: '2026-09-06T08:12:30', offsetMinutes: -180 }, '2026-09-25T12:00:00.000Z', 0)).toEqual({
      captured_at: '2026-09-06T11:12:30.000Z',
      tz_offset: -180,
    });
  });

  it('uses the device offset when the file has none', () => {
    expect(capturedAtFrom({ dateTimeOriginal: '2026-09-06T08:12:30', offsetMinutes: null }, '2026-09-25T12:00:00.000Z', -180)).toEqual({
      captured_at: '2026-09-06T11:12:30.000Z',
      tz_offset: -180,
    });
  });

  it('falls back to the device clock when the file carries no time', () => {
    expect(capturedAtFrom({ dateTimeOriginal: null, offsetMinutes: null }, '2026-09-25T12:00:00.000Z', -180)).toEqual({
      captured_at: '2026-09-25T12:00:00.000Z',
      tz_offset: -180,
    });
  });
});
