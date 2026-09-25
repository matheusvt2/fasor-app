/*
 * Story 6.1 (AD-7, AR-16): the EXIF a photo carries, read on the device. Only what the
 * photo entity stores or the re-encode needs: DateTimeOriginal (+ OffsetTimeOriginal), the
 * GPS position and the orientation. Pure: bytes in, values out; a file with no APP1 Exif
 * segment (a canvas capture, a PNG) reads as all nulls, never as an error.
 */

export interface ExifData {
  /** Local wall-clock time of the shot, `YYYY-MM-DDTHH:MM:SS`, or null. */
  dateTimeOriginal: string | null;
  /** OffsetTimeOriginal in minutes east of UTC, or null when the camera did not record it. */
  offsetMinutes: number | null;
  gps: { lat: number; lng: number } | null;
  orientation: number | null;
}

const NONE: ExifData = { dateTimeOriginal: null, offsetMinutes: null, gps: null, orientation: null };

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

/** The byte sizes of the TIFF field types this reader understands. */
const TYPE_SIZE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

interface Entry {
  type: number;
  count: number;
  /** Absolute offset (within the TIFF view) of the value bytes. */
  valueAt: number;
}

class Tiff {
  constructor(
    private readonly view: DataView,
    private readonly little: boolean,
  ) {}

  u16(at: number): number {
    return this.view.getUint16(at, this.little);
  }

  u32(at: number): number {
    return this.view.getUint32(at, this.little);
  }

  inBounds(at: number, size: number): boolean {
    return at >= 0 && at + size <= this.view.byteLength;
  }

  /** One IFD's entries by tag; an IFD that runs past the segment reads as empty. */
  ifd(at: number): Map<number, Entry> {
    const entries = new Map<number, Entry>();
    if (!this.inBounds(at, 2)) return entries;
    const count = this.u16(at);
    for (let i = 0; i < count; i++) {
      const base = at + 2 + i * 12;
      if (!this.inBounds(base, 12)) break;
      const tag = this.u16(base);
      const type = this.u16(base + 2);
      const n = this.u32(base + 4);
      const size = (TYPE_SIZE[type] ?? 0) * n;
      const valueAt = size <= 4 ? base + 8 : this.u32(base + 8);
      if (size === 0 || !this.inBounds(valueAt, size)) continue;
      entries.set(tag, { type, count: n, valueAt });
    }
    return entries;
  }

  ascii(entry: Entry | undefined): string | null {
    if (entry === undefined || entry.type !== 2) return null;
    let text = '';
    for (let i = 0; i < entry.count; i++) {
      const code = this.view.getUint8(entry.valueAt + i);
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text.trim();
  }

  short(entry: Entry | undefined): number | null {
    if (entry === undefined) return null;
    if (entry.type === 3) return this.u16(entry.valueAt);
    if (entry.type === 4) return this.u32(entry.valueAt);
    return null;
  }

  /** Three unsigned rationals (degrees, minutes, seconds) as decimal degrees. */
  degrees(entry: Entry | undefined): number | null {
    if (entry === undefined || entry.type !== 5 || entry.count < 3) return null;
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const num = this.u32(entry.valueAt + i * 8);
      const den = this.u32(entry.valueAt + i * 8 + 4);
      if (den === 0) return null;
      total += num / den / 60 ** i;
    }
    return total;
  }
}

/** "2026:09:06 08:12:30" as "2026-09-06T08:12:30", or null when it is not that shape. */
function normalizeDateTime(raw: string | null): string | null {
  const match = raw === null ? null : /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (match === null) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

/** "-03:00" as -180; null when it is not that shape. */
function parseOffset(raw: string | null): number | null {
  const match = raw === null ? null : /^([+-])(\d{2}):(\d{2})$/.exec(raw);
  if (match === null) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** The TIFF block of the first APP1 Exif segment of a JPEG, or null. */
function exifSegment(bytes: Uint8Array): DataView | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // Start of scan or end of image: no metadata segment comes after these.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2) return null;
    const start = at + 4;
    if (
      marker === 0xe1 &&
      start + 6 <= bytes.length &&
      bytes[start] === 0x45 && // E
      bytes[start + 1] === 0x78 && // x
      bytes[start + 2] === 0x69 && // i
      bytes[start + 3] === 0x66 && // f
      bytes[start + 4] === 0 &&
      bytes[start + 5] === 0
    ) {
      const tiffStart = start + 6;
      const end = Math.min(at + 2 + length, bytes.length);
      if (end <= tiffStart) return null;
      return new DataView(bytes.buffer, bytes.byteOffset + tiffStart, end - tiffStart);
    }
    at += 2 + length;
  }
  return null;
}

/** Reads DateTimeOriginal, OffsetTimeOriginal, GPS and orientation; all null when absent or unreadable. */
export function parseExif(bytes: Uint8Array): ExifData {
  const view = exifSegment(bytes);
  if (view === null || view.byteLength < 8) return NONE;
  const order = view.getUint16(0, false);
  if (order !== 0x4949 && order !== 0x4d4d) return NONE;
  const tiff = new Tiff(view, order === 0x4949);
  if (tiff.u16(2) !== 0x002a) return NONE;
  const ifd0 = tiff.ifd(tiff.u32(4));

  const orientation = tiff.short(ifd0.get(TAG_ORIENTATION));
  const exifPointer = tiff.short(ifd0.get(TAG_EXIF_IFD));
  const exifIfd = exifPointer === null ? new Map<number, Entry>() : tiff.ifd(exifPointer);
  const gpsPointer = tiff.short(ifd0.get(TAG_GPS_IFD));
  const gpsIfd = gpsPointer === null ? new Map<number, Entry>() : tiff.ifd(gpsPointer);

  let gps: ExifData['gps'] = null;
  const lat = tiff.degrees(gpsIfd.get(TAG_GPS_LAT));
  const lng = tiff.degrees(gpsIfd.get(TAG_GPS_LNG));
  if (lat !== null && lng !== null) {
    const latRef = tiff.ascii(gpsIfd.get(TAG_GPS_LAT_REF));
    const lngRef = tiff.ascii(gpsIfd.get(TAG_GPS_LNG_REF));
    gps = { lat: latRef === 'S' ? -lat : lat, lng: lngRef === 'W' ? -lng : lng };
  }

  return {
    dateTimeOriginal: normalizeDateTime(tiff.ascii(exifIfd.get(TAG_DATETIME_ORIGINAL))),
    offsetMinutes: parseOffset(tiff.ascii(exifIfd.get(TAG_OFFSET_TIME_ORIGINAL))),
    gps,
    orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
  };
}

/**
 * The photo's `captured_at` (UTC, wire form) and `tz_offset` (minutes east of UTC): the EXIF
 * DateTimeOriginal read at its own offset (else the device's), or the device clock when the
 * file carries no time.
 */
export function capturedAtFrom(
  exif: Pick<ExifData, 'dateTimeOriginal' | 'offsetMinutes'>,
  deviceNowIso: string,
  deviceOffset: number,
): { captured_at: string; tz_offset: number } {
  if (exif.dateTimeOriginal !== null) {
    const offset = exif.offsetMinutes ?? deviceOffset;
    const wall = Date.parse(`${exif.dateTimeOriginal}.000Z`);
    if (Number.isFinite(wall)) return { captured_at: new Date(wall - offset * 60_000).toISOString(), tz_offset: offset };
  }
  return { captured_at: deviceNowIso, tz_offset: deviceOffset };
}
