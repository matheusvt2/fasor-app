import { createHash } from 'node:crypto';
import type { LayoutSectionCertificates } from '@app/domain';
import { AlignmentType, Paragraph } from 'docx';
import sharp from 'sharp';
import { log, logError } from '../../../log.ts';
import { decodePages, encodePages, type CertificatePagesCache } from '../certificate-cache.ts';
import { CONTENT_WIDTH_TWIPS, image, PX_PER_CM, sizedImage, text } from '../docx.ts';
import { CERTIFICATE_RASTERIZE_BUDGET_MS, CertificateUnreadableError, DEFAULT_RASTERIZE_TIMEOUT_MS, rasterizePdfPages, type Rasterizer } from '../pdf-raster.ts';

/*
 * Story 7.3 (AC2): section 11, the calibration certificates, rendered from the kernel's
 * `LayoutSectionCertificates`. Each certificate prints as full-page images, one per page:
 * a PDF rasterized at 150 dpi by pdftoppm (`rasterizePdfPages`), a JPEG or PNG through
 * sharp (EXIF orientation applied). No caption above the pages, as in the source.
 *
 * Matheus, 2026-09-30: a certificate with no file, one the server does not hold, or one
 * whose file is permanently unreadable (not a PDF pdftoppm can read, an image sharp cannot
 * decode) prints the kernel's placeholder line, logged, because waiting cannot fix it. A
 * certificate whose pages cannot be produced in time (the run's timeout or the job's
 * budget), or whose stored bytes cannot be read (the store or the pool failing, A-4),
 * FAILS the issue job like a photo read: `render_failed`, no revision number consumed.
 *
 * A PDF's pages are cached by the sha256 of its bytes in the company's object store
 * (`certificate-cache.ts`): a hit skips pdftoppm, a miss rasterizes and writes the entry,
 * a corrupt entry is ignored and rebuilt. A cache write that fails is logged only.
 */

/** The certificate box: the content width by about 23 cm, so a page image never spills onto the next page. */
const CERTIFICATE_MAX_HEIGHT_CM = 23;
/** The first page image shares its page with the section heading. */
const CERTIFICATE_FIRST_MAX_HEIGHT_CM = 21;
/** An image certificate is scaled into A4 at 150 dpi before it is embedded. */
const IMAGE_MAX_PX = { width: 1240, height: 1754 } as const;

export interface StoredOriginal {
  bytes: Buffer;
  mime: string;
}

export interface CertificateLoadOptions {
  jobId: string;
  /** Per pdftoppm run; default `DEFAULT_RASTERIZE_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** A-5: the time all the certificates of the section may spend rasterizing together; default `CERTIFICATE_RASTERIZE_BUDGET_MS`. */
  budgetMs?: number;
  /** Fields every log line carries (company, relatório, job). */
  context?: Record<string, unknown>;
  /** The company's page cache; absent, every PDF is rasterized. */
  cache?: CertificatePagesCache;
  /** Default `rasterizePdfPages`; tests inject a spy or a failing one. */
  rasterize?: Rasterizer;
}

/** A certificate's pages could not be produced in time (or pdftoppm could not run): the issue job fails. */
export class CertificatePagesError extends Error {
  constructor(fileId: string, instrumentId: string, cause: unknown) {
    super(`certificate ${fileId} of instrument ${instrumentId}: pages not produced: ${String(cause)}`, { cause });
    this.name = 'CertificatePagesError';
  }
}

async function imagePages(bytes: Buffer, mime: string): Promise<Buffer[]> {
  const oriented = sharp(bytes).rotate().resize({ ...IMAGE_MAX_PX, fit: 'inside', withoutEnlargement: true });
  return [await (mime === 'image/jpeg' ? oriented.jpeg({ quality: 90 }) : oriented.png()).toBuffer()];
}

const isPdf = (stored: StoredOriginal) => stored.mime === 'application/pdf' || stored.bytes.subarray(0, 5).toString('latin1') === '%PDF-';

/**
 * The page images of every attached certificate of the section, by certificate file id.
 * A certificate the server does not hold, whose type is neither PDF nor image, or whose
 * file is permanently unreadable is left out (and logged): the section prints its
 * placeholder. A `readOriginal` or cache read that throws, or a PDF whose pages cannot be
 * produced in time, rejects the load (the job fails, A-4).
 */
export async function loadCertificatePages(
  section: LayoutSectionCertificates | undefined,
  readOriginal: (fileId: string) => Promise<StoredOriginal | undefined>,
  options: CertificateLoadOptions,
): Promise<Map<string, Buffer[]>> {
  const out = new Map<string, Buffer[]>();
  if (section === undefined) return out;
  const context = options.context ?? {};
  const rasterize = options.rasterize ?? rasterizePdfPages;
  const deadline = Date.now() + (options.budgetMs ?? CERTIFICATE_RASTERIZE_BUDGET_MS);
  for (const certificate of section.certificates) {
    const fileId = certificate.certificateFileId;
    if (fileId === null || out.has(fileId)) continue;
    const fields = { ...context, instrument_id: certificate.instrumentId, file_id: fileId };
    const stored = await readOriginal(fileId);
    if (stored === undefined) {
      logError('generate certificate not on the server', fields);
      continue;
    }
    if (isPdf(stored)) {
      const sha256 = createHash('sha256').update(stored.bytes).digest('hex');
      let pages: Buffer[] | undefined;
      const cached = options.cache === undefined ? undefined : await options.cache.read(sha256);
      if (cached !== undefined) {
        pages = await decodePages(cached);
        if (pages === undefined) logError('generate certificate cache entry corrupt, rebuilt', { ...fields, sha256 });
      }
      if (pages === undefined) {
        const started = Date.now();
        try {
          pages = await rasterize(stored.bytes, { jobId: options.jobId, timeoutMs: options.timeoutMs ?? DEFAULT_RASTERIZE_TIMEOUT_MS, deadline });
        } catch (error) {
          if (error instanceof CertificateUnreadableError) {
            logError('generate certificate unreadable', { ...fields, error: String(error) });
            continue;
          }
          logError('generate certificate pages not produced', { ...fields, error: String(error) });
          throw new CertificatePagesError(fileId, certificate.instrumentId, error);
        }
        log('generate certificate rasterized', { ...fields, sha256, pages: pages.length, duration_ms: Date.now() - started });
        if (options.cache !== undefined) {
          await options.cache
            .write(sha256, encodePages(pages))
            .catch((error: unknown) => logError('generate certificate cache not written', { ...fields, sha256, error: String(error) }));
        }
      }
      if (pages.length > 0) out.set(fileId, pages);
    } else if (stored.mime.startsWith('image/')) {
      try {
        out.set(fileId, await imagePages(stored.bytes, stored.mime));
      } catch (error) {
        logError('generate certificate unreadable', { ...fields, error: String(error) });
      }
    } else {
      logError('generate certificate type not printable', { ...fields, mime: stored.mime });
    }
  }
  return out;
}

/**
 * Section 11's body: each certificate's pages, one per page, or its placeholder line. The
 * section's first page image sits under the heading (Heading 1 keeps with it), a little
 * shorter so both fit; every later page image starts its own page, so the heading never
 * stands alone at the foot of a page.
 */
export async function section11Children(section: LayoutSectionCertificates, pages: ReadonlyMap<string, readonly Buffer[]>): Promise<Paragraph[]> {
  const maxWidth = Math.round((CONTENT_WIDTH_TWIPS / 1440) * 96);
  const maxHeight = Math.round(CERTIFICATE_MAX_HEIGHT_CM * PX_PER_CM);
  const firstMaxHeight = Math.round(CERTIFICATE_FIRST_MAX_HEIGHT_CM * PX_PER_CM);
  const children: Paragraph[] = [];
  for (const certificate of section.certificates) {
    const images = certificate.certificateFileId === null ? undefined : pages.get(certificate.certificateFileId);
    let printed = false;
    for (const page of images ?? []) {
      const underHeading = children.length === 0;
      const one = await sizedImage(page, maxWidth, underHeading ? firstMaxHeight : maxHeight);
      if (one === null) continue;
      children.push(new Paragraph({ pageBreakBefore: !underHeading, alignment: AlignmentType.CENTER, children: [image(one)] }));
      printed = true;
    }
    if (!printed) children.push(new Paragraph({ children: [text(certificate.placeholder)], spacing: { after: 120 } }));
  }
  return children;
}
