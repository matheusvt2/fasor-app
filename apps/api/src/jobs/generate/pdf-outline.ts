import { createRequire } from 'node:module';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

/*
 * AD-15: the heading pages the two-pass table of contents is written from are read from
 * the PDF outline LibreOffice exports for every Heading 1 paragraph. pdfjs-dist's legacy
 * build runs in Node without a browser; only the outline and the page index of each
 * destination are read, never a rendered page.
 */

// pdfjs falls back to an in-process "fake worker" in Node, loaded from this path.
GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

export interface OutlineHeading {
  title: string;
  /** 1-based page number. */
  page: number;
}

export interface PdfOutline {
  pages: number;
  /** Every outline entry, depth first, in document order. */
  headings: OutlineHeading[];
}

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

function flatten(nodes: readonly OutlineNode[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const node of nodes) {
    out.push(node);
    if (node.items?.length) out.push(...flatten(node.items));
  }
  return out;
}

/** The page count and the outline headings with their pages. */
export async function readOutline(pdf: Buffer): Promise<PdfOutline> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const outline = ((await doc.getOutline()) ?? []) as OutlineNode[];
    const headings: OutlineHeading[] = [];
    for (const node of flatten(outline)) {
      const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
      if (!Array.isArray(dest) || dest.length === 0) continue;
      const ref = dest[0];
      let index: number | null = null;
      if (typeof ref === 'number') index = ref;
      else if (ref !== null && typeof ref === 'object') index = await doc.getPageIndex(ref as { num: number; gen: number });
      if (index === null) continue;
      headings.push({ title: node.title, page: index + 1 });
    }
    return { pages: doc.numPages, headings };
  } finally {
    await task.destroy();
  }
}
