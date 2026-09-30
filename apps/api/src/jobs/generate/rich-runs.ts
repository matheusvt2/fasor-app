import type { LayoutRun } from '@app/domain';
import { AlignmentType, LevelFormat, TextRun } from 'docx';

/*
 * Story 11.4: the formatted text's pieces shared by `docx.ts` and the section renderers
 * (`sections/section-10.ts`), in a leaf module neither of them imports back: the runs as
 * `TextRun`s and the decimal list numbered items print in.
 */

/**
 * A paragraph's runs as `TextRun`s, bold and italic from the kernel's runs (a heading is
 * bold throughout). A plain run is written exactly as `text()` writes it, so a text without
 * formatting renders byte for byte as before.
 */
export function richRuns(runs: readonly LayoutRun[], options: { bold?: boolean } = {}): TextRun[] {
  return runs.map((run) => new TextRun({ text: run.text, bold: options.bold === true || run.bold === true ? true : undefined, italics: run.italic }));
}

/** The decimal list a numbered item prints in (1., 2., 3.), one `instance` per list. */
export const NUMBERED_LIST_REFERENCE = 'rich-numbered';

export const NUMBERED_LIST_CONFIG = {
  reference: NUMBERED_LIST_REFERENCE,
  levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
};

/**
 * The numbered lists of one document: each list (its item numbered 1 starts one) gets its
 * own `instance`, so it restarts at 1; `used` says whether the document needs the
 * numbering definition at all.
 */
export interface NumberedLists {
  instance: number;
  used: boolean;
}

export function newNumberedLists(): NumberedLists {
  return { instance: 0, used: false };
}

/** The `numbering` option of a numbered item at position `number` of its list. */
export function numberedItem(lists: NumberedLists, number: number | undefined): { reference: string; level: 0; instance: number } {
  lists.used = true;
  if (number === 1 || lists.instance === 0) lists.instance++;
  return { reference: NUMBERED_LIST_REFERENCE, level: 0, instance: lists.instance };
}
