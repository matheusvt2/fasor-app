import type { DocumentLayout } from '@app/domain';
import { describe, expect, it } from 'vitest';
import type { PdfOutline } from './pdf-outline.ts';
import { headingPages, missingHeadings, placeholderPages, tocConverged, type TocPages } from './toc.ts';

/* The two-pass TOC helpers over hand-built outlines; no PDF and no LibreOffice involved. */

const layout = {
  toc: [
    { number: 1, title: 'OBJETIVO' },
    { number: 2, title: 'DEFINIÇÕES' },
    { number: 3, title: 'LIMITE DE ESCOPO' },
  ],
} as unknown as DocumentLayout;

const outline = (headings: PdfOutline['headings']): PdfOutline => ({ pages: 9, headings });
const pages = (entries: [number, number | null][]): TocPages => new Map(entries);

describe('placeholderPages', () => {
  it('lists every TOC entry unplaced', () => {
    expect([...placeholderPages(layout)]).toEqual([
      [1, null],
      [2, null],
      [3, null],
    ]);
  });
});

describe('headingPages', () => {
  it('matches each entry by its printed heading, trimmed, first match wins on duplicates, null when absent', () => {
    const result = headingPages(
      outline([
        { title: ' 1 OBJETIVO ', page: 4 },
        { title: '2 DEFINIÇÕES', page: 4 },
        { title: '2 DEFINIÇÕES', page: 8 },
        { title: 'Documentação', page: 5 },
      ]),
      layout,
    );
    expect([...result]).toEqual([
      [1, 4],
      [2, 4],
      [3, null],
    ]);
  });
});

describe('missingHeadings', () => {
  it('lists exactly the unplaced entries', () => {
    expect(missingHeadings(pages([[1, 4], [2, null], [3, null]]))).toEqual([2, 3]);
    expect(missingHeadings(pages([[1, 4], [2, 5]]))).toEqual([]);
  });
});

describe('tocConverged', () => {
  it('is true when every heading sits on the same page in both passes', () => {
    expect(tocConverged(pages([[1, 4], [2, 5]]), pages([[1, 4], [2, 5]]))).toBe(true);
  });

  it('is false when a page moved, when a page is unknown, or when the sizes differ', () => {
    expect(tocConverged(pages([[1, 4], [2, 5]]), pages([[1, 4], [2, 6]]))).toBe(false);
    expect(tocConverged(pages([[1, 4], [2, null]]), pages([[1, 4], [2, null]]))).toBe(false);
    expect(tocConverged(pages([[1, 4], [2, 5]]), pages([[1, 4]]))).toBe(false);
    expect(tocConverged(pages([[1, 4]]), pages([[1, 4], [2, 5]]))).toBe(false);
  });
});
