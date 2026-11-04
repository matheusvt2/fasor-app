/*
 * AD-7: the one place a file candidate is judged and the one place an object key
 * is built. Both apps import this module, so the device's inline refusal and the
 * server's own check can never drift, and the immutable key
 * `company/{cid}/{kind}/{id}` (a photo: `company/{cid}/relatorio/{rid}/photo/{id}`,
 * plus `/{variant}`) has a single spelling.
 */

/** Epic 2 context: "25 MB limit, refused inline before upload". */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Story 20.12 (security pass S6): the most pixels (width times height, every page counted)
 * an uploaded image may declare. The server refuses a larger one with `413 file_too_large`
 * and `details: {limit: 'pixels', max_pixels}` before decoding it, and every decode of
 * uploaded bytes is capped at it.
 */
export const MAX_IMAGE_PIXELS = 120_000_000;

/** The `details` of a `413 file_too_large` the pixel limit gave. */
export interface PixelLimitDetails {
  limit: 'pixels';
  max_pixels: number;
}

/**
 * Story 20.12: why the server refused an upload for good, when the device can say it better
 * than "Erro": the pixel limit. Null for any other refusal.
 */
export function uploadRefusedText(code: string | null | undefined, details?: unknown): string | null {
  if (code !== 'file_too_large') return null;
  const limit = typeof details === 'object' && details !== null ? (details as { limit?: unknown }).limit : undefined;
  if (limit !== 'pixels') return null;
  // authored: 2026-11-04, Story 20.12.
  return `A imagem passa de ${MAX_IMAGE_PIXELS / 1_000_000} megapixels e não pode ser enviada.`;
}

/**
 * The kinds this story uploads and the mime types each accepts (Epic 2 context:
 * certificate pdf/jpeg/png, logo png/svg, cover_background jpeg/png; Story 4.2 adds the
 * relatório's own cover_photo jpeg/png; Story 6.2 adds the photo, re-encoded to JPEG on
 * the device). The render outputs are not here: Epic 7 owns their route.
 */
export const FILE_KIND_MIME = {
  certificate: ['application/pdf', 'image/jpeg', 'image/png'],
  logo: ['image/png', 'image/svg+xml'],
  cover_background: ['image/jpeg', 'image/png'],
  cover_photo: ['image/jpeg', 'image/png'],
  photo: ['image/jpeg'],
} as const satisfies Record<string, readonly string[]>;

export type UploadFileKind = keyof typeof FILE_KIND_MIME;

export const UPLOAD_FILE_KINDS = Object.keys(FILE_KIND_MIME) as UploadFileKind[];

export function isUploadFileKind(kind: string): kind is UploadFileKind {
  return Object.prototype.hasOwnProperty.call(FILE_KIND_MIME, kind);
}

/** The `accept` attribute of the kind's file input, in the table's order. */
export function fileKindAccept(kind: UploadFileKind): string {
  return FILE_KIND_MIME[kind].join(',');
}

export interface FileCandidate {
  kind: UploadFileKind;
  mime: string;
  size: number;
}

export type FileCandidateCheck =
  | { ok: true }
  | { ok: false; reason: 'too_large' | 'mime'; text: string };

/** pt-BR, per kind: the formats the picker would have accepted. */
const MIME_REFUSAL: Record<UploadFileKind, string> = {
  certificate: 'Formato não aceito. Envie PDF, JPG ou PNG.',
  logo: 'Formato não aceito. Envie PNG ou SVG.',
  cover_background: 'Formato não aceito. Envie JPG ou PNG.',
  cover_photo: 'Formato não aceito. Envie JPG ou PNG.',
  photo: 'Formato não aceito. Envie JPG.',
};

const TOO_LARGE_TEXT = 'Arquivo acima de 25 MB. Escolha um menor.';

/**
 * The single verdict both apps use: the mime the kind accepts, then the size limit.
 * A refusal carries the pt-BR sentence the surface shows inline (AGENTS.md "Derived
 * text goes in packages/domain").
 */
export function checkFileCandidate(candidate: FileCandidate): FileCandidateCheck {
  const accepted: readonly string[] = FILE_KIND_MIME[candidate.kind] ?? [];
  if (!accepted.includes(candidate.mime)) {
    return { ok: false, reason: 'mime', text: MIME_REFUSAL[candidate.kind] };
  }
  if (candidate.size > MAX_FILE_BYTES) return { ok: false, reason: 'too_large', text: TOO_LARGE_TEXT };
  return { ok: true };
}

/** The stored variants of an uploaded file; `original` is the bytes as they were sent. */
export type FileVariant = 'original' | 'thumb' | 'print';

/**
 * AD-7: object keys are immutable and never deleted. The original is
 * `company/{cid}/{kind}/{id}`; a derived variant extends it by suffix
 * (`company/{cid}/{kind}/{id}/thumb`), so no key is ever overwritten. A photo lives under
 * its relatório (Story 6.2): `company/{cid}/relatorio/{rid}/photo/{id}` whenever the row
 * names one.
 */
export function objectKey(
  companyId: string,
  kind: string,
  id: string,
  variant: FileVariant = 'original',
  relatorioId: string | null = null,
): string {
  const base =
    kind === 'photo' && relatorioId !== null
      ? `company/${companyId}/relatorio/${relatorioId}/photo/${id}`
      : `company/${companyId}/${kind}/${id}`;
  return variant === 'original' ? base : `${base}/${variant}`;
}
