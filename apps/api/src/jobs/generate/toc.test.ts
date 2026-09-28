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
  sections: [],
} as unknown as DocumentLayout;

/** E7-A4: a layout whose section 9 prints two subsections, which the ÍNDICE lists at level 2. */
const withSubsections = {
  toc: [
    { number: 8, title: 'PONTOS' },
    { number: 9, title: 'RELATÓRIOS DOS ENSAIOS' },
    { number: 10, title: 'CONCLUSÃO' },
  ],
  sections: [{ number: 9, title: 'RELATÓRIOS DOS ENSAIOS', kind: 'sheets', subsections: [{ heading: '9.1 Cubículo Enel', sheets: [] }, { heading: '9.2 Oxigênio', sheets: [] }], warnings: [] }],
} as unknown as DocumentLayout;

const outline = (headings: PdfOutline['headings']): PdfOutline => ({ pages: 9, headings });
const pages = (entries: [number, number | null][]): TocPages => new Map(entries.map(([key, page]) => [String(key), page]));

describe('placeholderPages', () => {
  it('lists every TOC entry unplaced', () => {
    expect([...placeholderPages(layout)]).toEqual([
      ['1', null],
      ['2', null],
      ['3', null],
    ]);
  });

  it('lists section 9\'s subsections after it, keyed by their printed number (E7-A4)', () => {
    expect([...placeholderPages(withSubsections).keys()]).toEqual(['8', '9', '9.1', '9.2', '10']);
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
      ['1', 4],
      ['2', 4],
      ['3', null],
    ]);
  });

  it('places the subsections from the outline\'s Heading 2 titles (E7-A4)', () => {
    const result = headingPages(
      outline([
        { title: '8 PONTOS', page: 12 },
        { title: '9 RELATÓRIOS DOS ENSAIOS', page: 13 },
        { title: '9.1 Cubículo Enel', page: 13 },
        { title: '9.2 Oxigênio', page: 20 },
        { title: '10 CONCLUSÃO', page: 90 },
      ]),
      withSubsections,
    );
    expect([...result]).toEqual([
      ['8', 12],
      ['9', 13],
      ['9.1', 13],
      ['9.2', 20],
      ['10', 90],
    ]);
  });
});

describe('missingHeadings', () => {
  it('lists exactly the unplaced entries', () => {
    expect(missingHeadings(pages([[1, 4], [2, null], [3, null]]))).toEqual(['2', '3']);
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
