import { buildSnapshot, layoutSpec, replay, type DocumentLayout, type LayoutSectionSheets } from '@app/domain';
import { portoSeguro } from '@app/domain/fixtures/porto-seguro';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { readZipEntries } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * e22g (review B1): a reading table the kernel prints one step smaller (`PrintTable.textHalfPoints`)
 * has every run of its cells at that size in the DOCX, and every other table keeps the sheet text
 * style's size with no size of its own, so the document is byte-for-byte the same where no table
 * steps down.
 */

const ISSUED_AT = '2026-09-23T12:00:00.000Z';

function layout(): DocumentLayout {
  const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
  return layoutSpec(snapshot, { revisionNumber: 1, issuedAt: ISSUED_AT });
}

async function documentXml(of: DocumentLayout): Promise<string> {
  return readZipEntries(await buildDocx(of, { tocPages: placeholderPages(of) })).get('word/document.xml')!.toString('utf8');
}

const runsAt = (xml: string, halfPoints: number) => xml.match(new RegExp(`<w:sz w:val="${halfPoints}"/>`, 'g'))?.length ?? 0;

describe('e22g B1 a stepped-down reading table in the DOCX', () => {
  it('prints each run of the table at its size, and nothing else changes size', async () => {
    const base = layout();
    const stepped = structuredClone(base);
    const sheets = stepped.sections.find((s): s is LayoutSectionSheets => s.kind === 'sheets')!;
    const part = sheets.subsections.flatMap((s) => s.sheets).flatMap((sheet) => sheet.parts).find((one) => one.kind === 'table' && one.table.rows[0]!.cells[0]!.text === 'PONTO DE ENSAIO/CONEXÃO');
    expect(part?.kind).toBe('table');
    if (part?.kind !== 'table') return;
    expect(part.table.textHalfPoints).toBeUndefined();
    part.table.textHalfPoints = 15;
    const lines = part.table.rows.flatMap((row) => row.cells.flatMap((cell) => cell.text.split('\n').filter((line) => line !== ''))).length;

    const [before, after] = await Promise.all([documentXml(base), documentXml(stepped)]);
    // The Porto Seguro document has no run at 7,5 pt of its own; the stepped table brings one per non-empty cell line.
    expect(runsAt(before, 15)).toBe(0);
    expect(runsAt(after, 15)).toBe(lines);
    // Every other size is untouched.
    for (const size of [16, 17, 18, 20, 22]) expect(runsAt(after, size), `${size}`).toBe(runsAt(before, size));
  });
});
