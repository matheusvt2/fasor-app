import { ACTION_PLAN_COLUMNS, type ActionPlanRow, type LayoutSectionPoints } from '@app/domain';
import { BorderStyle, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type IBorderOptions } from 'docx';
import { CONTENT_WIDTH_TWIPS, text } from '../docx.ts';

/*
 * Story 7.3 (AC1): section 8, the points of attention, rendered from the kernel's
 * `LayoutSectionPoints`: one bulleted paragraph per bullet, its text exactly as
 * `resolveSection8` composed it (tokens already "Imagem N"; fix batch e24h: the stored points
 * only, ~~derived groups already a sentence~~). Story 11.10 (FR-52): directly after the last bullet, the action-plan table
 * (`resolveActionPlan`): a header row with the eight column titles, repeated on every page,
 * then one row per bullet (a body row may split across pages; the header never does), hairline-ruled like the document's
 * other tables. Every printed string is the layout's; this module only decides widths, line breaks (e23f),
 * borders and sizes.
 */

const hairline: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: hairline, bottom: hairline, left: hairline, right: hairline };

/**
 * Relative column widths, in the order of `ACTION_PLAN_COLUMNS` (the two prose columns
 * widest). E11-Q4: every header word fits its cell at 9 pt bold, so LibreOffice never breaks
 * "Responsável" or "Imagens" mid-word (`docx.test.ts` measures it); Prazo keeps the width a
 * dd/mm/aaaa date needs on one line.
 */
const WEIGHTS = [5, 22, 13, 11, 10, 16, 13, 10];
/** 9 pt: eight columns across the A4 content width. */
const TABLE_TEXT_SIZE = 18;
const CELL_MARGINS = { top: 40, bottom: 40, left: 60, right: 60 };

function columnWidths(): number[] {
  const total = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const widths = WEIGHTS.map((weight) => Math.floor((CONTENT_WIDTH_TWIPS * weight) / total));
  widths[1]! += CONTENT_WIDTH_TWIPS - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function row(cells: readonly string[], widths: readonly number[], header: boolean, keepWhole = false): TableRow {
  return new TableRow({
    // The header row never splits and repeats on every page. Batch e24p (Story 24.17, seed v14,
    // `keepRowsWhole`): a body row never splits either (a row taller than a page still breaks).
    ...(header ? { cantSplit: true, tableHeader: true } : keepWhole ? { cantSplit: true } : {}),
    children: cells.map(
      (value, i) =>
        new TableCell({
          borders,
          margins: CELL_MARGINS,
          width: { size: widths[i]!, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: lineRuns(
                value,
                (line) => new TextRun({ text: line, bold: header, size: TABLE_TEXT_SIZE }),
                (line) => new TextRun({ text: line, bold: header, size: TABLE_TEXT_SIZE, break: 1 }),
              ),
            }),
          ],
        }),
    ),
  });
}

/**
 * e23f (the production check of 2026-11-07, defect (a)): a text's runs, a line break of the
 * kernel's text (a Reprovado sheet's OBSERVAÇÕES, a point typed on several lines) printed as a
 * break (`<w:br/>`) before the next line, inside the same paragraph, never as a line feed in a
 * run (which LibreOffice prints as a space). A text with no line break is the one run it was.
 */
export function lineRuns(value: string, first: (line: string) => TextRun, next: (line: string) => TextRun): TextRun[] {
  return value.split(/\r\n?|\n/).map((line, i) => (i === 0 ? first(line) : next(line)));
}

const cellsOf = (plan: ActionPlanRow): string[] => [plan.number, plan.point, plan.local, plan.priority, plan.deadline, plan.action, plan.owner, plan.images];

/** The action-plan table: the header row, then one row per section 8 bullet (each kept whole with `keepRowsWhole`, batch e24p). */
export function actionPlanTable(rows: readonly ActionPlanRow[], keepRowsWhole = false): Table {
  const widths = columnWidths();
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [row(ACTION_PLAN_COLUMNS, widths, true), ...rows.map((plan) => row(cellsOf(plan), widths, false, keepRowsWhole))],
  });
}

export function section8Children(section: LayoutSectionPoints): (Paragraph | Table)[] {
  const bullets = section.bullets.map(
    (bullet) => new Paragraph({ children: lineRuns(bullet, (line) => text(line), (line) => new TextRun({ text: line, break: 1 })), bullet: { level: 0 }, spacing: { after: 80 } }),
  );
  return [...bullets, actionPlanTable(section.table, section.keepRowsWhole === true)];
}
