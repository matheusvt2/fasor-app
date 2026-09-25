import type { Page } from '@playwright/test';
import { jpegFromPage } from '../../support/photos.ts';

/*
 * Stories 6.3-6.5: the import fixtures, generated synthetically at test time (no client
 * material): a JPEG drawn in the page, the same JPEG with an EXIF APP1 segment carrying
 * DateTimeOriginal, OffsetTimeOriginal and a GPS position, and a PNG. Each comes as the
 * `{ name, mimeType, buffer }` a file chooser or a drop takes.
 */

export interface FilePayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ExifStamp {
  /** `YYYY:MM:DD HH:MM:SS`, the camera's wall clock. */
  dateTimeOriginal: string;
  /** `±HH:MM`. */
  offset: string;
  lat: number;
  lng: number;
}

/** Degrees as three EXIF rationals: degrees, minutes, seconds x 100. */
function dms(value: number): [number, number][] {
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60 * 100);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 100],
  ];
}

/** A big-endian TIFF block: IFD0 with the Exif and GPS pointers, then both IFDs and their values. */
function exifSegment(stamp: ExifStamp): Buffer {
  const tiff = Buffer.alloc(512);
  let heap = 300;
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.writeUInt16BE(tag, at);
    tiff.writeUInt16BE(type, at + 2);
    tiff.writeUInt32BE(count, at + 4);
    tiff.writeUInt32BE(value, at + 8);
  };
  const text = (value: string): number => {
    const at = heap;
    tiff.write(`${value}\0`, at, 'latin1');
    heap += value.length + 2;
    return at;
  };
  const rationals = (pairs: [number, number][]): number => {
    const at = heap;
    pairs.forEach(([n, d], i) => {
      tiff.writeUInt32BE(n, at + i * 8);
      tiff.writeUInt32BE(d, at + i * 8 + 4);
    });
    heap += pairs.length * 8;
    return at;
  };
  tiff.write('MM', 0, 'latin1');
  tiff.writeUInt16BE(0x2a, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(2, 8);
  entry(10, 0x8769, 4, 1, 100);
  entry(22, 0x8825, 4, 1, 200);
  tiff.writeUInt32BE(0, 34);
  tiff.writeUInt16BE(2, 100);
  entry(102, 0x9003, 2, stamp.dateTimeOriginal.length + 1, text(stamp.dateTimeOriginal));
  entry(114, 0x9011, 2, stamp.offset.length + 1, text(stamp.offset));
  tiff.writeUInt32BE(0, 126);
  tiff.writeUInt16BE(4, 200);
  entry(202, 0x0001, 2, 2, (stamp.lat < 0 ? 0x53 : 0x4e) << 24);
  entry(214, 0x0002, 5, 3, rationals(dms(stamp.lat)));
  entry(226, 0x0003, 2, 2, (stamp.lng < 0 ? 0x57 : 0x45) << 24);
  entry(238, 0x0004, 5, 3, rationals(dms(stamp.lng)));
  tiff.writeUInt32BE(0, 250);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff.subarray(0, heap)]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([header, body]);
}

/** A plain JPEG (no EXIF), drawn in the page. */
export async function plainJpeg(page: Page, name = 'foto-sem-exif.jpg'): Promise<FilePayload> {
  return { name, mimeType: 'image/jpeg', buffer: await jpegFromPage(page, 640, 480) };
}

/** A JPEG with EXIF time and GPS: the APP1 segment right after SOI. */
export async function exifJpeg(page: Page, stamp: ExifStamp, name = 'foto-com-exif.jpg'): Promise<FilePayload> {
  const jpeg = await jpegFromPage(page, 640, 480);
  return { name, mimeType: 'image/jpeg', buffer: Buffer.concat([jpeg.subarray(0, 2), exifSegment(stamp), jpeg.subarray(2)]) };
}

/** A PNG drawn in the page. */
export async function png(page: Page, name = 'tela.png'): Promise<FilePayload> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(320, 240);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#5a7';
    context.fillRect(0, 0, 320, 240);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
