import { buffer } from 'node:stream/consumers';
import type { S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import type { CompanyId } from '../../db/repositories/company-id.ts';
import { getObject, putObject } from '../../storage/s3.ts';

/*
 * Review fixes 2026-09-30: a certificate PDF is rasterized once. Its page images are kept
 * in the object store under a key made of the job's company id and the sha256 of the
 * certificate bytes the job read, so every later generation of any relatório of that
 * company reads the stored pages instead of running pdftoppm again. The key never comes
 * from client JSON: the company is the job's, and the hash is computed by the server.
 * One object holds every page: the magic line, then per page a 4-byte big-endian length and
 * the page bytes. An entry that does not parse, or whose pages sharp cannot read, is
 * ignored (and later rewritten by the rebuild).
 */

const MAGIC = Buffer.from('certificate-pages/1\n', 'latin1');
const SHA256 = /^[0-9a-f]{64}$/;
const PAGES_MIME = 'application/octet-stream';

/** `v1` names the encoding and the renderer (pdftoppm, 150 dpi); a change to either bumps it. */
export function certificatePagesKey(companyId: CompanyId, sha256: string): string {
  if (!SHA256.test(sha256)) throw new Error(`not a sha256: ${sha256}`);
  return `company/${companyId}/certificate-pages/v1/${sha256}`;
}

export function encodePages(pages: readonly Buffer[]): Buffer {
  const parts: Buffer[] = [MAGIC];
  for (const page of pages) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(page.byteLength);
    parts.push(length, page);
  }
  return Buffer.concat(parts);
}

/** The pages of a cache entry, or undefined when the entry is corrupt (bad framing, no page, or a page sharp cannot read). */
export async function decodePages(bytes: Buffer): Promise<Buffer[] | undefined> {
  if (bytes.byteLength < MAGIC.byteLength || !bytes.subarray(0, MAGIC.byteLength).equals(MAGIC)) return undefined;
  const pages: Buffer[] = [];
  let at = MAGIC.byteLength;
  while (at < bytes.byteLength) {
    if (at + 4 > bytes.byteLength) return undefined;
    const length = bytes.readUInt32BE(at);
    at += 4;
    if (length === 0 || at + length > bytes.byteLength) return undefined;
    pages.push(bytes.subarray(at, at + length));
    at += length;
  }
  if (pages.length === 0) return undefined;
  try {
    for (const page of pages) await sharp(page).metadata();
  } catch {
    return undefined;
  }
  return pages;
}

/** The cache of one company, as `loadCertificatePages` uses it. A read or write that throws is a store fault. */
export interface CertificatePagesCache {
  read(sha256: string): Promise<Buffer | undefined>;
  write(sha256: string, bytes: Buffer): Promise<void>;
}

export function s3PagesCache(s3: S3Client, bucket: string, companyId: CompanyId): CertificatePagesCache {
  return {
    read: async (sha256) => {
      const stored = await getObject(s3, bucket, certificatePagesKey(companyId, sha256));
      return stored === null ? undefined : buffer(stored.body);
    },
    write: (sha256, bytes) => putObject(s3, bucket, certificatePagesKey(companyId, sha256), bytes, PAGES_MIME),
  };
}
