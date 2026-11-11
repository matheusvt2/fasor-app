import { getDefinition, layoutSpec } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockSnapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 24.13-INT (Story 24.13, seed v14, batch e24s): the DOCX of the synthetic v14 relatório (one sheet of every
 * type v14 offers, filled by rule, `@app/domain/fixtures/layout-lock`) prints the No-break de comando under
 * the local's "Outros equipamentos", after the other library types and before the Malha de aterramento, with
 * its plate, its six-row checklist and its conclusion; the v13 relatório has no such sheet.
 */

/** The version's synthetic relatório, its cabine grouped by type, so "Outros equipamentos" is its own group (the Malha last). */
async function structureOf(version: string) {
  const plain = layoutLockSnapshot(version, { epic24: false });
  const snapshot = { ...plain, locations: plain.locations.map((location) => (location.kind === 'cabine' ? { ...location, agrupar_por_tipo: true } : location)) };
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) }));
}

describe('24.13-INT the DOCX of a v14 relatório prints the No-break de comando under "Outros equipamentos", before the Malha', () => {
  it('its title, its plate, its six rows and its conclusion, in its group and order; v13 prints none', async () => {
    const noBreak = getDefinition('v14', 'cabine_primaria', 'no_break_comando');
    const v14 = await structureOf('v14');
    const title = v14.paragraphs.findIndex((paragraph) => paragraph.startsWith('NO-BREAK DE COMANDO '));
    expect(title).toBeGreaterThan(-1);
    const inspection = v14.paragraphs.findIndex((paragraph) => paragraph.startsWith('INSPEÇÃO DE QGBT '));
    const malha = v14.paragraphs.findIndex((paragraph) => paragraph.startsWith('MALHA DE ATERRAMENTO '));
    expect(inspection).toBeGreaterThan(-1);
    expect(inspection).toBeLessThan(title);
    expect(title).toBeLessThan(malha);
    const outros = v14.headings.filter((heading) => heading.level === 2 && heading.text.includes('Outros equipamentos'));
    expect(outros.length).toBeGreaterThan(0);
    const checklist = v14.tables.find((table) => table[0]?.[0] === 'VERIFICAÇÕES GERAIS' && table[2]?.[0] === `1. ${noBreak.checklist![0]!.label}`)!;
    expect(checklist.slice(2).map((row) => row[0])).toEqual(noBreak.checklist!.map((item, n) => `${n + 1}. ${item.label}`));
    const plate = v14.tables.find((table) => table[0]?.[0] === 'DADOS DO EQUIPAMENTO' && JSON.stringify(table).includes('BATERIAS: CAPACIDADE'))!;
    expect(JSON.stringify(plate)).toContain('AUTONOMIA NOMINAL');
    const v13 = await structureOf('v13');
    expect(v13.paragraphs.some((paragraph) => paragraph.startsWith('NO-BREAK DE COMANDO '))).toBe(false);
  }, 120_000);
});
