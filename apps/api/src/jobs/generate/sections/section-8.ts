import { ACTION_PLAN_COLUMNS, type ActionPlanRow, type LayoutSectionPoints } from '@app/domain';
import { BorderStyle, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType, type IBorderOptions } from 'docx';
import { CONTENT_WIDTH_TWIPS, text } from '../docx.ts';

/*
 * Story 7.3 (AC1): section 8, the points of attention, rendered from the kernel's
 * `LayoutSectionPoints`: one bulleted paragraph per bullet, its text exactly as
 * `resolveSection8` composed it (tokens already "Imagem N", derived groups already a
 * sentence). Story 11.10 (FR-52): directly after the last bullet, the action-plan table
 * (`resolveActionPlan`): a header row with the eight column titles, repeated on every page,
 * then one row per bullet, never split across pages, hairline-ruled like the document's
 * other tables. Every printed string is the layout's; this module only decides widths,
 * borders and sizes.
 */

const hairline: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
const borders = { top: hairline, bottom: hairline, left: hairline, right: hairline };

/** Relative column widths, in the order of `ACTION_PLAN_COLUMNS` (the two prose columns widest). */
const WEIGHTS = [5, 25, 15, 11, 10, 18, 10, 6];
/** 9 pt: eight columns across the A4 content width. */
const TABLE_TEXT_SIZE = 18;
const CELL_MARGINS = { top: 40, bottom: 40, left: 60, right: 60 };

function columnWidths(): number[] {
  const total = WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const widths = WEIGHTS.map((weight) => Math.floor((CONTENT_WIDTH_TWIPS * weight) / total));
  widths[1]! += CONTENT_WIDTH_TWIPS - widths.reduce((sum, width) => sum + width, 0);
  return widths;
}

function row(cells: readonly string[], widths: readonly number[], header: boolean): TableRow {
  return new TableRow({
    cantSplit: true,
    tableHeader: header,
    children: cells.map(
      (value, i) =>
        new TableCell({
          borders,
          margins: CELL_MARGINS,
          width: { size: widths[i]!, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: value, bold: header, size: TABLE_TEXT_SIZE })] })],
        }),
    ),
  });
}

const cellsOf = (plan: ActionPlanRow): string[] => [plan.number, plan.point, plan.local, plan.priority, plan.deadline, plan.action, plan.owner, plan.images];

/** The action-plan table: the header row, then one row per section 8 bullet. */
export function actionPlanTable(rows: readonly ActionPlanRow[]): Table {
  const widths = columnWidths();
  return new Table({
    width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [row(ACTION_PLAN_COLUMNS, widths, true), ...rows.map((plan) => row(cellsOf(plan), widths, false))],
  });
}

export function section8Children(section: LayoutSectionPoints): (Paragraph | Table)[] {
  const bullets = section.bullets.map((bullet) => new Paragraph({ children: [text(bullet)], bullet: { level: 0 }, spacing: { after: 80 } }));
  return [...bullets, actionPlanTable(section.table)];
}
