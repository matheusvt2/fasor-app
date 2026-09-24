import { sectionHeading, type DocumentLayout } from '@app/domain';
import type { PdfOutline } from './pdf-outline.ts';

/*
 * AD-15's two-pass table of contents: pass 1 prints fixed-width placeholders, the PDF
 * outline says where each heading landed, pass 2 prints those pages; a third pass runs
 * when pass-2 pages differ from pass-1. Both helpers are pure over the outline.
 */

/** Section number -> page, `null` while a pass has not placed the heading yet. */
export type TocPages = Map<number, number | null>;

/** Every TOC entry unplaced: what pass 1 prints (`00`). */
export function placeholderPages(layout: DocumentLayout): TocPages {
  return new Map(layout.toc.map((entry) => [entry.number, null]));
}

/**
 * The page of each TOC entry, matched by its printed heading text ("1 OBJETIVO") against
 * the outline titles; `null` for a heading the outline does not carry (the job then fails
 * with `toc_outline_missing`).
 */
export function headingPages(outline: PdfOutline, layout: DocumentLayout): TocPages {
  const byTitle = new Map<string, number>();
  for (const heading of outline.headings) {
    const title = heading.title.trim();
    if (!byTitle.has(title)) byTitle.set(title, heading.page);
  }
  return new Map(layout.toc.map((entry) => [entry.number, byTitle.get(sectionHeading(entry)) ?? null]));
}

/** The section numbers whose page is still unknown. */
export function missingHeadings(pages: TocPages): number[] {
  return [...pages.entries()].filter(([, page]) => page === null).map(([number]) => number);
}

/** True when both passes placed every heading on the same page. */
export function tocConverged(a: TocPages, b: TocPages): boolean {
  if (a.size !== b.size) return false;
  for (const [number, page] of a) {
    if (page === null || b.get(number) !== page) return false;
  }
  return true;
}
