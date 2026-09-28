import type { LayoutSectionCertificates } from '@app/domain';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { loadCertificatePages, type StoredOriginal } from './section-11.ts';

/*
 * 7.3-UNIT-009: the image branch of `loadCertificatePages` (no LibreOffice): a JPEG or PNG
 * certificate becomes one page through sharp, EXIF orientation applied and the size capped
 * at A4 150 dpi; a certificate the server does not hold, or of a type that cannot print,
 * is left out so the section prints its placeholder.
 */

const section = (ids: (string | null)[]): LayoutSectionCertificates => ({
  number: 11,
  title: 'CERTIFICADOS',
  kind: 'certificates',
  certificates: ids.map((id, i) => ({ instrumentId: `instrument-${i}`, certificateFileId: id, placeholder: `Certificado não anexado: ${i}` })),
});

describe('7.3-UNIT-009 image certificates', () => {
  it('prints a JPEG (EXIF orientation applied, capped) and a PNG as one page each; skips the missing and the unprintable', async () => {
    // 3000 x 1000 landscape pixels, tagged orientation 6: upright it is 1000 wide by 3000 tall.
    const jpeg = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#336699' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const stored = new Map<string, StoredOriginal>([
      ['jpeg', { bytes: jpeg, mime: 'image/jpeg' }],
      ['png', { bytes: png, mime: 'image/png' }],
      ['text', { bytes: Buffer.from('not a certificate'), mime: 'text/plain' }],
    ]);
    const pages = await loadCertificatePages(section(['jpeg', 'png', 'text', 'absent', null]), async (id) => stored.get(id), { jobId: 'job-images' });

    expect([...pages.keys()].sort()).toEqual(['jpeg', 'png']);
    expect(pages.get('jpeg')).toHaveLength(1);
    const upright = await sharp(pages.get('jpeg')![0]!).metadata();
    expect(upright.format).toBe('jpeg');
    expect(upright.width).toBeLessThan(upright.height!);
    expect(upright.height).toBeLessThanOrEqual(1754);
    expect(upright.width).toBeLessThanOrEqual(1240);
    const small = await sharp(pages.get('png')![0]!).metadata();
    expect(small.format).toBe('png');
    // Never enlarged.
    expect([small.width, small.height]).toEqual([800, 600]);
  });

  it('never throws when the reader throws: the certificate is left out', async () => {
    const pages = await loadCertificatePages(section(['boom']), async () => {
      throw new Error('s3 down');
    }, { jobId: 'job-throw' });
    expect(pages.size).toBe(0);
  });

  it('returns nothing without a section', async () => {
    expect((await loadCertificatePages(undefined, async () => undefined, { jobId: 'job-none' })).size).toBe(0);
  });
});
