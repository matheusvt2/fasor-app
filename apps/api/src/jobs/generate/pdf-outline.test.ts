import { describe, expect, it, vi } from 'vitest';

/*
 * Review 2026-09-30, A-16: a PDF pdfjs cannot open still has its loading task destroyed
 * (the worker and its buffers released), in `readOutline` as in `readPageSizes`. pdfjs is
 * replaced by a loading task whose promise rejects.
 */

const destroy = vi.fn(async () => undefined);

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.reject(new Error('Invalid PDF structure')), destroy }),
}));

const { readOutline, readPageSizes } = await import('./pdf-outline.ts');

describe('A-16 the loading task is destroyed when the PDF does not open', () => {
  it('readOutline', async () => {
    destroy.mockClear();
    await expect(readOutline(Buffer.from('not a pdf'))).rejects.toThrow('Invalid PDF structure');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('readPageSizes', async () => {
    destroy.mockClear();
    await expect(readPageSizes(Buffer.from('not a pdf'))).rejects.toThrow('Invalid PDF structure');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
