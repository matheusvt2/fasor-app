import { describe, expect, it } from 'vitest';
import { checkFileCandidate, fileKindAccept, MAX_FILE_BYTES, objectKey, UPLOAD_FILE_KINDS } from './candidate.ts';
import { fileSizeText, fileTileLine } from './tile.ts';

const CID = '019966b0-0000-7000-8000-000000000001';
const FID = '019966b0-0000-7000-8000-00000000003c';

describe('2.2-UNIT-001 checkFileCandidate', () => {
  it('accepts each kind its own mime types', () => {
    expect(checkFileCandidate({ kind: 'certificate', mime: 'application/pdf', size: 3_000_000 })).toEqual({ ok: true });
    expect(checkFileCandidate({ kind: 'certificate', mime: 'image/png', size: 10 })).toEqual({ ok: true });
    expect(checkFileCandidate({ kind: 'logo', mime: 'image/svg+xml', size: 10 })).toEqual({ ok: true });
    expect(checkFileCandidate({ kind: 'cover_background', mime: 'image/jpeg', size: 10 })).toEqual({ ok: true });
  });

  it('refuses a mime the kind does not accept, with the kind pt-BR reason', () => {
    const gif = checkFileCandidate({ kind: 'certificate', mime: 'image/gif', size: 10 });
    expect(gif).toMatchObject({ ok: false, reason: 'mime' });
    expect(gif).toHaveProperty('text', expect.stringContaining('PDF'));
    const pdfAsLogo = checkFileCandidate({ kind: 'logo', mime: 'application/pdf', size: 10 });
    expect(pdfAsLogo).toMatchObject({ ok: false, reason: 'mime' });
    expect(pdfAsLogo).toHaveProperty('text', expect.stringContaining('SVG'));
  });

  it('refuses anything past 25 MB, and accepts exactly 25 MB', () => {
    expect(checkFileCandidate({ kind: 'certificate', mime: 'application/pdf', size: MAX_FILE_BYTES })).toEqual({ ok: true });
    expect(checkFileCandidate({ kind: 'certificate', mime: 'application/pdf', size: 26 * 1024 * 1024 })).toMatchObject({
      ok: false,
      reason: 'too_large',
    });
  });

  it('gives every kind a non-empty accept list and a refusal sentence', () => {
    for (const kind of UPLOAD_FILE_KINDS) {
      expect(fileKindAccept(kind).length).toBeGreaterThan(0);
      const refused = checkFileCandidate({ kind, mime: 'application/x-nope', size: 1 });
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.text.length).toBeGreaterThan(0);
    }
  });
});

describe('2.2-UNIT-002 objectKey', () => {
  it('builds the immutable original key and extends it by suffix for variants', () => {
    expect(objectKey(CID, 'certificate', FID)).toBe(`company/${CID}/certificate/${FID}`);
    expect(objectKey(CID, 'logo', FID, 'thumb')).toBe(`company/${CID}/logo/${FID}/thumb`);
    expect(objectKey(CID, 'logo', FID, 'print')).toBe(`company/${CID}/logo/${FID}/print`);
    // A variant key is always the original key plus a suffix: no key is ever overwritten.
    expect(objectKey(CID, 'logo', FID, 'thumb').startsWith(objectKey(CID, 'logo', FID))).toBe(true);
  });
});

describe('2.2-UNIT-003 tile lines', () => {
  it('formats sizes in pt-BR', () => {
    expect(fileSizeText(512)).toBe('512 B');
    expect(fileSizeText(1536)).toBe('1,5 kB');
    expect(fileSizeText(3 * 1024 * 1024)).toBe('3,0 MB');
  });

  it('names the file when this device picked it, and the format when it did not', () => {
    expect(fileTileLine({ name: '35102-25.pdf', mime: 'application/pdf', size: 1024, uploaded_at: null })).toBe(
      '35102-25.pdf · 1,0 kB · Envio pendente',
    );
    expect(fileTileLine({ name: null, mime: 'application/pdf', size: 1024, uploaded_at: '2026-09-22T10:00:00.000Z' })).toBe(
      'PDF · 1,0 kB · Enviado',
    );
  });
});
