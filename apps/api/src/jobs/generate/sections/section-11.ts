import type { LayoutSectionCertificates } from '@app/domain';
import { AlignmentType, Paragraph } from 'docx';
import sharp from 'sharp';
import { logError } from '../../../log.ts';
import { CONTENT_WIDTH_TWIPS, image, PX_PER_CM, sizedImage, text } from '../docx.ts';
import { CERTIFICATE_RASTERIZE_BUDGET_MS, DEFAULT_CONVERT_TIMEOUT_MS, rasterizePdfPages } from '../libreoffice.ts';

/*
 * Story 7.3 (AC2): section 11, the calibration certificates, rendered from the kernel's
 * `LayoutSectionCertificates`. Each certificate prints as full-page images, one per page:
 * a PDF rasterized page by page at 150 dpi by LibreOffice (`rasterizePdfPages`), a JPEG or
 * PNG through sharp (EXIF orientation applied). No caption above the pages, as in the
 * source. A certificate with no file, one the server does not hold, or one that cannot be
 * rasterized prints the kernel's placeholder line; the failure is logged and never fails the
 * revision. A read of a stored certificate that throws (the store or the pool failing) fails
 * the job instead, like a photo read (review 2026-09-30, A-4).
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
  timeoutMs?: number;
  /**
   * A-5: the time all the certificates of the section may spend rasterizing together;
   * default `CERTIFICATE_RASTERIZE_BUDGET_MS`. A certificate past it prints its placeholder
   * (open question, review 2026-09-30: should it fail the issue job instead?).
   */
  budgetMs?: number;
  /** Fields every log line carries (company, relatório, job). */
  context?: Record<string, unknown>;
}

async function imagePages(bytes: Buffer, mime: string): Promise<Buffer[]> {
  const oriented = sharp(bytes).rotate().resize({ ...IMAGE_MAX_PX, fit: 'inside', withoutEnlargement: true });
  return [await (mime === 'image/jpeg' ? oriented.jpeg({ quality: 90 }) : oriented.png()).toBuffer()];
}

/**
 * The page images of every attached certificate of the section, by certificate file id.
 * A certificate the server does not hold, whose type is neither PDF nor image, or whose
 * pages cannot be produced is left out (and logged): the section prints its placeholder.
 * A `readOriginal` that throws rejects the load (A-4).
 */
export async function loadCertificatePages(
  section: LayoutSectionCertificates | undefined,
  readOriginal: (fileId: string) => Promise<StoredOriginal | undefined>,
  options: CertificateLoadOptions,
): Promise<Map<string, Buffer[]>> {
  const out = new Map<string, Buffer[]>();
  if (section === undefined) return out;
  const context = options.context ?? {};
  const deadline = Date.now() + (options.budgetMs ?? CERTIFICATE_RASTERIZE_BUDGET_MS);
  for (const certificate of section.certificates) {
    const fileId = certificate.certificateFileId;
    if (fileId === null || out.has(fileId)) continue;
    const stored = await readOriginal(fileId);
    if (stored === undefined) {
      logError('generate certificate not on the server', { ...context, instrument_id: certificate.instrumentId, file_id: fileId });
      continue;
    }
    try {
      let pages: Buffer[];
      if (stored.mime === 'application/pdf' || stored.bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
        pages = await rasterizePdfPages(stored.bytes, { jobId: options.jobId, timeoutMs: options.timeoutMs ?? DEFAULT_CONVERT_TIMEOUT_MS, deadline });
      } else if (stored.mime.startsWith('image/')) {
        pages = await imagePages(stored.bytes, stored.mime);
      } else {
        logError('generate certificate type not printable', { ...context, instrument_id: certificate.instrumentId, file_id: fileId, mime: stored.mime });
        continue;
      }
      if (pages.length > 0) out.set(fileId, pages);
    } catch (error) {
      // A PDF LibreOffice cannot rasterize (in time or at all), or an image sharp cannot read.
      logError('generate certificate unreadable', { ...context, instrument_id: certificate.instrumentId, file_id: fileId, error: String(error) });
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
