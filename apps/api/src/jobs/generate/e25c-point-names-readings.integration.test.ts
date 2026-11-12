import { cellAddressesOf, getDefinition, layoutSpec, newPointRow, sheetPointFindings, type BlockRow, type Cell, type RelatorioSnapshot } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.10-INT (batch e25c, Story 25.10, seed v15 `names_every_reading_out`; M14): section 8 of a v15 relatório. The
 * Epic 25 fixture's chave seccionadora gets its three contact poles at 273, 266 and 548 µΩ against < 250 µΩ; a
 * point is stored as "Criar ponto de atenção" then "Concluir" stores one (origin `reading`, the test's key, the
 * text the kernel starts it with). Section 8 of the DOCX, found by its own heading, prints the three readings in
 * the point's bullet and in its action-plan row. The v14 twin's point names the worst pole alone. Every value is
 * invented.
 */

const POLES = ['273', '266', '548'];
const POINT_ID = '019966b0-2510-7400-8000-000000000001';

/** The fixture on `version` with its seccionadora's poles at `POLES` and the point the tap would store. */
function withPoint(version: string): { snapshot: RelatorioSnapshot; text: string } {
  const base = layoutLockEpic25Snapshot(version);
  const target = base.blocks.find((block) => block.block_type === 'chave_seccionadora' && block.removed_at === null)!;
  const block: BlockRow = structuredClone(target);
  const addresses = cellAddressesOf(getDefinition(version, 'cabine_primaria', 'chave_seccionadora'), 'resistencia_contato');
  const test = { cells: {} as Record<string, Record<string, Cell>> };
  POLES.forEach((raw, i) => {
    const { row, col } = addresses[i]!;
    test.cells[row] = { ...test.cells[row], [col]: { value: { raw, unit: 'µΩ', state: 'measured' }, source_suggestion_id: null, op_id: `019966b0-2510-7500-8000-00000000000${i}` } };
  });
  block.sheet.test.resistencia_contato = test as BlockRow['sheet']['test'][string];
  const edited: RelatorioSnapshot = { ...base, blocks: base.blocks.map((one) => (one.id === block.id ? block : one)) };
  const finding = sheetPointFindings(edited, block.id).find((one) => one.testKey === 'resistencia_contato')!;
  const point = newPointRow(
    { id: POINT_ID, relatorioId: edited.relatorio.id, text: finding.text, equipmentId: block.equipment_id, origin: 'reading', action: finding.action === '' ? null : finding.action, testKey: 'resistencia_contato' },
    edited.points,
  );
  return { snapshot: { ...edited, points: [...edited.points, point] }, text: finding.text };
}

/** Section 8's paragraphs and its action-plan table, read by the section's own heading. */
async function section8(snapshot: RelatorioSnapshot): Promise<{ paragraphs: string[]; plan: string[][] }> {
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  const structure = extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
  const level1 = structure.headings.filter((heading) => heading.level === 1).map((heading) => heading.text);
  const heading = level1.find((text) => / PONTOS DE ATENÇÃO/.test(text));
  expect(heading, JSON.stringify(level1)).toBeDefined();
  const next = level1[level1.indexOf(heading!) + 1];
  const from = structure.paragraphs.lastIndexOf(heading!);
  const to = next === undefined ? structure.paragraphs.length : structure.paragraphs.lastIndexOf(next);
  const plan = structure.tables.find((table) => table[0]?.[1] === 'Ponto de atenção' && table[0]?.[5] === 'Ação recomendada');
  expect(plan, 'the action plan').toBeDefined();
  return { paragraphs: structure.paragraphs.slice(from, to), plan: plan! };
}

describe('25.10-INT section 8 of a v15 relatório prints every reading a point names', () => {
  it('v15: the point started from the switch\'s contact test names the three poles in row order, and section 8 prints them in its bullet and its action-plan row', async () => {
    const { snapshot, text } = withPoint('v15');
    expect(text).toMatch(/^Ensaio de resistência ôhmica de contato fora do critério \(<250 µΩ\): .+ 273 µΩ; .+ 266 µΩ; .+ 548 µΩ\.$/);
    const { paragraphs, plan } = await section8(snapshot);
    expect(paragraphs.some((paragraph) => paragraph.includes(text)), JSON.stringify(paragraphs)).toBe(true);
    expect(plan.slice(1).map((cells) => cells[1])).toContain(text);
  });

  it('v14: the same poles start a point naming the worst one, as today', async () => {
    const { snapshot, text } = withPoint('v14');
    expect(text).toMatch(/^Ensaio de resistência ôhmica de contato: 548 µΩ em .+ \(critério: <250 µΩ\)$/);
    const { paragraphs } = await section8(snapshot);
    expect(paragraphs.some((paragraph) => paragraph.includes(text))).toBe(true);
    expect(paragraphs.some((paragraph) => paragraph.includes('273 µΩ'))).toBe(false);
  });
});
