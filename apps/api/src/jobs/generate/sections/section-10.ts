import type { LayoutSection10 } from '@app/domain';
import { AlignmentType, BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, type IBorderOptions } from 'docx';

/*
 * Story 7.4 (FR-72): section 10 as the `docx` library draws it, from the kernel's
 * `LayoutSection10` (`packages/domain/src/print/section-10.ts`). No string is composed here:
 * the Parecer box is a bordered one-cell table with the verdict word as its bold title and
 * the confirmed summary under it, then the section's fixed bullets, the validity line and
 * the signature block (name, printed title, registration), centred. No signature image.
 */

const border: IBorderOptions = { style: BorderStyle.SINGLE, size: 8, color: '404040' };
const borders = { top: border, bottom: border, left: border, right: border };

/** Renders section 10's body (everything under its heading), inside a content width in twips. */
export function section10Children(section: LayoutSection10, contentWidthTwips: number): (Paragraph | Table)[] {
  const boxChildren: Paragraph[] = [new Paragraph({ children: [new TextRun({ text: section.parecer.title, bold: true, size: 24 })], spacing: { after: 80 } })];
  if (section.parecer.text !== null) boxChildren.push(new Paragraph({ children: [new TextRun({ text: section.parecer.text })], spacing: { after: 60 } }));
  const box = new Table({
    width: { size: contentWidthTwips, type: WidthType.DXA },
    columnWidths: [contentWidthTwips],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: contentWidthTwips, type: WidthType.DXA },
            margins: { top: 120, bottom: 120, left: 160, right: 160 },
            children: boxChildren,
          }),
        ],
      }),
    ],
  });

  const out: (Paragraph | Table)[] = [box, new Paragraph({ spacing: { after: 120 } })];
  for (const bullet of section.bullets) out.push(new Paragraph({ children: [new TextRun({ text: bullet })], bullet: { level: 0 }, spacing: { after: 60 } }));
  out.push(new Paragraph({ children: [new TextRun({ text: section.validityLine })], spacing: { before: 240, after: 120 } }));

  const signature = [
    { text: section.signature.name, bold: true },
    { text: section.signature.title, bold: false },
    { text: section.signature.registration, bold: false },
  ].filter((line) => line.text !== '');
  signature.forEach((line, index) => {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: index === 0 ? { before: 720 } : undefined,
        keepNext: index < signature.length - 1,
        children: [new TextRun({ text: line.text, bold: line.bold })],
      }),
    );
  });
  return out;
}
