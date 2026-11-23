import { accessSync, constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import { cellAddressesOf, getDefinition, layoutSpec, newPointRow, overRangeNoteText, type BlockRow, type Cell, type PointRow, type RelatorioSnapshot } from '@app/domain';
import { layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { convertToPdf } from './libreoffice.ts';
import { placeholderPages } from './toc.ts';

/*
 * 28.5-INT-001, 28.7-INT-001 and 28.8-INT-001 (batch e28b; B-8, B-6, B-7, Matheus's Q-6 and Q-7): the DOCX of the Epic 25
 * synthetic relatório on seed v18, issued on 2026-12-10: section 8's action plan prints a suggested deadline counted from the
 * issue date and a typed one as typed; a breaker's insulation reading above the limit prints "> 2 TΩ" and Bruno's line under
 * the test; the second visit's notes are by Bruno's numbers (the oil transformer one line, the company sheet the short form).
 * The v17 twin prints none of it. The PDF half needs LibreOffice, which the api image carries and the tools image does not:
 *   podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/e28b-v18-print.integration.test.ts
 * Where no `soffice` is on the PATH it is skipped. Every value is invented.
 */

const ISSUED_AT = '2026-12-10T15:00:00.000Z';
const NBSP = /\u00a0/gu;

const sofficeOnPath = (process.env.PATH ?? '').split(delimiter).some((dir) => {
  try {
    accessSync(join(dir, 'soffice'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

GlobalWorkerOptions.workerSrc = createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

/** A UUIDv7 minted at `iso`. */
function v7At(iso: string, tail: string): string {
  const hex = Date.parse(iso).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${tail}`;
}

/** The fixture with two points (P1 suggested on 2026-12-01, P2 typed) and the breaker's first insulation reading above the limit. */
function relatorio(version: 'v17' | 'v18'): RelatorioSnapshot {
  const base = layoutLockEpic25Snapshot(version);
  const breaker = base.blocks.find((block) => block.block_type === 'disjuntor_mt' && base.equipment.find((row) => row.id === block.equipment_id)?.last_results != null)!;
  const block = structuredClone(breaker) as BlockRow;
  const [first] = cellAddressesOf(getDefinition(version, 'cabine_primaria', 'disjuntor_mt'), 'isolacao');
  const cells = block.sheet.test.isolacao!.cells;
  cells[String(first!.row)] = { ...cells[String(first!.row)], [String(first!.col)]: { value: { raw: '2', unit: 'TΩ', state: 'over_range' }, source_suggestion_id: null, op_id: v7At('2026-12-01T15:00:00Z', '0000000000f1') } as Cell };
  let points: PointRow[] = [...base.points];
  const add = (fields: Partial<PointRow>, tail: string) => {
    const row = newPointRow({ id: v7At('2026-12-01T15:00:00Z', tail), relatorioId: base.relatorio.id, text: `Ponto ${tail}`, equipmentId: null, origin: 'manual', action: 'Ação' }, points);
    points = [...points, { ...row, ...fields }];
  };
  add({ priority: 'P1', deadline: '2026-12-31' }, '0000000000a1');
  add({ priority: 'P2', deadline: '2027-02-15' }, '0000000000a2');
  return { ...base, points, blocks: base.blocks.map((row) => (row.id === breaker.id ? block : row)) };
}

async function docxOf(version: 'v17' | 'v18'): Promise<Buffer> {
  const layout = layoutSpec(relatorio(version), { revisionNumber: 1, issuedAt: ISSUED_AT });
  return buildDocx(layout, { tocPages: placeholderPages(layout) });
}

const plain = (text: string) => text.replace(NBSP, ' ');

describe('28.5-INT-001, 28.7-INT-001, 28.8-INT-001 the v18 DOCX', () => {
  it('v18: the deadlines from the issue date, Bruno\'s line under the insulation, the notes by his numbers', async () => {
    const structure = extractStructure(await docxOf('v18'));
    const plan = structure.tables.find((table) => table[0]?.[0] === 'Nº' && table[0]?.[4] === 'Prazo')!;
    const deadlines = plan.slice(1).filter((cells) => /^Ponto 0000000000a/.test(cells[1] ?? '')).map((cells) => cells[4]);
    // P1 suggested on 2026-12-01, issued on 2026-12-10: 2027-01-09; the typed one as typed.
    expect(deadlines).toEqual(['09/01/2027', '15/02/2027']);
    const paragraphs = structure.paragraphs.map(plain);
    expect(paragraphs).toContain(plain(overRangeNoteText('2', 'TΩ')));
    expect(paragraphs.some((text) => text.startsWith('Valores de resistência de isolamento'))).toBe(false);
    expect(structure.tables.flat().flat().map(plain)).toContain('> 2 TΩ');
    const notes = paragraphs.filter((text) => text.startsWith('Em relação à manutenção anterior:'));
    expect(notes).toContain('Em relação à manutenção anterior: 15 variações relevantes (Ensaio de isolação: 3; Resistência ôhmica dos enrolamentos: 12).');
    expect(notes).toContain('Em relação à manutenção anterior: Tensão de saída passou a dentro do critério (antes 114,3 Vcc, fora do critério); Tensão de flutuação passou a dentro do critério (antes 112,5 Vcc, fora do critério).');
  }, 120_000);

  it('v17: the stored deadlines, Story 23.4\'s note, Story 24.16\'s lines', async () => {
    const structure = extractStructure(await docxOf('v17'));
    const plan = structure.tables.find((table) => table[0]?.[0] === 'Nº' && table[0]?.[4] === 'Prazo')!;
    expect(plan.slice(1).filter((cells) => /^Ponto 0000000000a/.test(cells[1] ?? '')).map((cells) => cells[4])).toEqual(['31/12/2026', '15/02/2027']);
    const paragraphs = structure.paragraphs.map(plain);
    expect(paragraphs.some((text) => text.startsWith('Valores de resistência de isolação'))).toBe(false);
    expect(paragraphs).toContain('Valores de resistência de isolamento superiores a 2 TΩ, limite de leitura do instrumento.');
    expect(paragraphs.some((text) => text.includes('variações relevantes'))).toBe(false);
  }, 120_000);
});

async function pdfText(pdf: Buffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const parts: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      for (const item of content.items) if ('str' in item) parts.push(item.str);
    }
    return parts.join(' ').replace(/\s+/gu, ' ');
  } finally {
    await task.destroy();
  }
}

describe.skipIf(!sofficeOnPath)('28.7-INT-001 and 28.8-INT-001 the v18 PDF', () => {
  it('reads Bruno\'s line and the one-line note, each value with its unit', async () => {
    const text = await pdfText(await convertToPdf(await docxOf('v18'), { jobId: `e28b-v18-print-${Date.now()}` }));
    expect(text).toContain('Valores de resistência de isolação superiores a 2 TΩ');
    expect(text).toContain('limite de leitura do instrumento na tensão de ensaio aplicada.');
    expect(text).toContain('15 variações relevantes');
  }, 240_000);
});
