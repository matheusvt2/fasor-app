import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/*
 * Story 16.4: the text of a PDF the api rendered (a preview, a revision), item by item, read
 * with the api's own pdfjs-dist (`apps/api/src/jobs/generate/rich-text.integration.test.ts`
 * reads it the same way). The package is a dependency of the api only, so it is resolved from
 * there; the e2e suite adds no dependency of its own.
 */

/** The slice of pdfjs this helper reads. */
interface Pdfjs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(source: { data: Uint8Array; useSystemFonts: boolean; verbosity: number }): {
    promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: readonly object[] }> }> }>;
    destroy(): Promise<void>;
  };
}

const fromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));

async function loadPdfjs(): Promise<Pdfjs> {
  const pdfjs = (await import(pathToFileURL(fromApi.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href)) as Pdfjs;
  // pdfjs falls back to an in-process "fake worker" in Node, loaded from this path.
  pdfjs.GlobalWorkerOptions.workerSrc = fromApi.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  return pdfjs;
}

/** Every non-blank text item of the PDF, page by page, in drawing order, trimmed. */
export async function pdfTextItems(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) {
        const text = 'str' in item && typeof item.str === 'string' ? item.str.trim() : '';
        if (text !== '') out.push(text);
      }
    }
    return out;
  } finally {
    await task.destroy();
  }
}
