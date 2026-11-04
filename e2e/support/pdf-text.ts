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
  return (await pdfPageTexts(pdf)).flat();
}

/**
 * Stories 20.5 and 20.6: the same non-blank, trimmed text items, one list per page (page n is
 * index n - 1), so a test can say what shares a page and what starts one.
 */
export async function pdfPageTexts(pdf: Uint8Array): Promise<string[][]> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const pages: string[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      const out: string[] = [];
      for (const item of content.items) {
        const text = 'str' in item && typeof item.str === 'string' ? item.str.trim() : '';
        if (text !== '') out.push(text);
      }
      pages.push(out);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

/** The 0-based page of the last item `match` accepts (a heading's body occurrence, after the ÍNDICE's), or -1. */
export function lastPageOf(pages: readonly (readonly string[])[], match: (text: string) => boolean): number {
  return pages.findLastIndex((items) => items.some(match));
}

/** Words only a ficha or a local block prints: none of them may stand before a ficha's title on its own page (Story 20.6). */
export const SHEET_CONTENT_MARKS: readonly string[] = ['DADOS DO EQUIPAMENTO', 'VERIFICAÇÕES GERAIS', 'OBSERVAÇÕES', 'CONCLUSÃO', 'VERIFICAÇÕES DO LOCAL', 'CARACTERÍSTICAS DA SE', 'AMBIENTE DE ENSAIO'];

/**
 * Story 20.6: where the ficha whose TAG is `tag` starts. Its title bar is the upper-case item
 * ending in " ⟨tag⟩"; `before` is what of a ficha, a local block or a photo line precedes it
 * on that page, which is nothing when the ficha starts its page (a heading may precede it).
 */
export function fichaStart(pages: readonly (readonly string[])[], tag: string): { page: number; before: string[] } {
  const isTitle = (text: string) => text.endsWith(` ${tag}`) && text === text.toLocaleUpperCase('pt-BR');
  const page = lastPageOf(pages, isTitle);
  if (page < 0) throw new Error(`no ficha title ending in "${tag}" in the PDF`);
  const items = pages[page]!;
  const before = items.slice(0, items.findIndex(isTitle)).filter((text) => SHEET_CONTENT_MARKS.includes(text) || /^Imagem \d+[.:]/.test(text));
  return { page, before };
}
