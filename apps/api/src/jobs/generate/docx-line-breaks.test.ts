import { buildSnapshot, layoutSpec, replay, type DocumentLayout, type LayoutSectionPoints } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { readZipEntries } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * e23f (the production check of Bruno's relatório, 2026-11-07, defect (a)): a section 8 bullet or
 * action-plan cell whose kernel text carries line breaks (a Reprovado sheet's OBSERVAÇÕES, a point
 * typed on several lines) prints each break as `<w:br/>`, never as a line feed inside `<w:t>`
 * (which LibreOffice prints as a space). A text with no break renders exactly as before.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';

function layout(): DocumentLayout {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  return layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
}

async function documentXml(of: DocumentLayout): Promise<string> {
  return readZipEntries(await buildDocx(of, { tocPages: placeholderPages(of) })).get('word/document.xml')!.toString('utf8');
}

const pointsOf = (of: DocumentLayout) => of.sections.find((s): s is LayoutSectionPoints => s.kind === 'points')!;
/** The `<w:p>` that holds `marker`. */
const paragraphWith = (xml: string, marker: string) => [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map((m) => m[0]).find((p) => p.includes(marker))!;
const LINES = ['Equipamento reprovado: TR-E23F. Item 1: oxidação nos terminais', 'Item 3: vazamento de óleo', 'Equipamento sem condições de operação.'];

describe('e23f (a) section 8 line breaks in the DOCX', () => {
  it('prints a bullet\'s and an action-plan cell\'s line breaks as <w:br/>, one bulleted paragraph and one cell paragraph', async () => {
    const base = layout();
    const broken = structuredClone(base);
    const points = pointsOf(broken);
    expect(points.bullets.length).toBeGreaterThan(0);
    points.bullets.push(LINES.join('\n'));
    // The cell's text as an imported text might carry it (Edge Case Hunter 6): CRLF breaks too.
    points.table.push({ ...points.table[0]!, number: String(points.table.length + 1), point: LINES.join('\r\n') });
    const xml = await documentXml(broken);

    // No line feed inside any text run of the document.
    expect([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].filter((m) => /[\r\n]/.test(m[1]!))).toEqual([]);
    const bullet = paragraphWith(xml, 'TR-E23F');
    expect(bullet).toContain('<w:numPr>');
    expect(bullet.match(/<w:br\/>/g)).toHaveLength(2);
    for (const line of LINES) expect(bullet).toContain(line);
    // The cell: its paragraph after the bullet's, the same three lines and two breaks.
    const cellXml = xml.slice(xml.indexOf(bullet) + bullet.length);
    const cell = paragraphWith(cellXml, 'TR-E23F');
    expect(cell).not.toContain('<w:numPr>');
    expect(cell.match(/<w:br\/>/g)).toHaveLength(2);
    for (const line of LINES) expect(cell).toContain(line);
    // Every line of the cell keeps the table's 9 pt (Verification Gap 4).
    expect(cell.match(/<w:sz w:val="18"\/>/g)).toHaveLength(3);
  });

  it('keeps each bullet of a section 8 with no line break one run with no break, as before', async () => {
    const base = layout();
    const points = pointsOf(base);
    expect(points.bullets.some((bullet) => bullet.includes('\n'))).toBe(false);
    const xml = await documentXml(base);
    // Each bullet is one run, as before the fix.
    for (const bullet of points.bullets) {
      const paragraph = paragraphWith(xml, bullet.slice(0, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      expect(paragraph.match(/<w:r>/g) ?? paragraph.match(/<w:r[ >]/g)).toHaveLength(1);
      expect(paragraph).not.toContain('<w:br/>');
    }
  });
});
