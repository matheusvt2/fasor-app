import { tocLines, type DocumentLayout } from '@app/domain';
import type { PdfOutline } from './pdf-outline.ts';

/*
 * AD-15's two-pass table of contents: pass 1 prints fixed-width placeholders, the PDF
 * outline says where each heading landed, pass 2 prints those pages; a third pass runs
 * when pass-2 pages differ from pass-1. Both helpers are pure over the outline.
 */

/**
 * Printed number of an ÍNDICE line ("9", "9.1", `tocLines`) -> page, `null` while a pass
 * has not placed the heading yet. E7-A4: keyed by the printed number string, since the
 * ÍNDICE lists section 9's subsections too.
 */
export type TocPages = Map<string, number | null>;

/** Every ÍNDICE line unplaced: what pass 1 prints (`00`). */
export function placeholderPages(layout: Pick<DocumentLayout, 'toc' | 'sections'>): TocPages {
  return new Map(tocLines(layout).map((line) => [line.key, null]));
}

/**
 * The page of each ÍNDICE line, matched by its printed heading text ("1 OBJETIVO", "9.1
 * Cubículo Enel") against the outline titles (Heading 1 and Heading 2 alike); `null` for a
 * heading the outline does not carry (the job then fails with `toc_outline_missing`).
 */
export function headingPages(outline: PdfOutline, layout: Pick<DocumentLayout, 'toc' | 'sections'>): TocPages {
  const byTitle = new Map<string, number>();
  for (const heading of outline.headings) {
    const title = heading.title.trim();
    if (!byTitle.has(title)) byTitle.set(title, heading.page);
  }
  return new Map(tocLines(layout).map((line) => [line.key, byTitle.get(line.text) ?? null]));
}

/** The printed numbers whose page is still unknown. */
export function missingHeadings(pages: TocPages): string[] {
  return [...pages.entries()].filter(([, page]) => page === null).map(([number]) => number);
}

/** True when both passes placed every heading on the same page. */
export function tocConverged(a: TocPages, b: TocPages): boolean {
  if (a.size !== b.size) return false;
  for (const [key, page] of a) {
    if (page === null || b.get(key) !== page) return false;
  }
  return true;
}
