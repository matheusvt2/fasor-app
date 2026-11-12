import { layoutSpec, type RelatorioSnapshot } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Snapshot } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it, vi } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.6-INT (batch e25c, Story 25.6, seed v15 `no_measurement_refuses_aprovado`): the DOCX of a v15 relatório
 * holding a cabos de entrada whose every reading is "Não medido" and whose pair was stored Aprovado · Sem
 * restrições (the Epic 25 fixture, `layoutLockEpic25Fixture`). Section 9 prints its CONCLUSÃO boxes empty and
 * no paragraph (the pair reads as not concluded); the v14 relatório with the same answers prints APROVADO and
 * SEM as before. Every other table of the two documents is the same.
 *
 * So that a later Epic 25 flag never moves this comparison, v15 reads v14's rule flags here plus this story's
 * own (`seedRule` is the one reader of a flag, mocked as `docx-layout-lock.test.ts` mocks it).
 */
vi.mock('../../../../../packages/domain/src/seed/definitions.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../packages/domain/src/seed/definitions.ts')>();
  return {
    ...actual,
    seedRule: (version: string, flag: Parameters<typeof actual.seedRule>[1]) =>
      version === 'v15' && flag !== 'no_measurement_refuses_aprovado' ? actual.seedRule('v14', flag) : actual.seedRule(version, flag),
  };
});

async function tablesOf(version: string): Promise<{ snapshot: RelatorioSnapshot; tables: string[][][] }> {
  const snapshot = layoutLockEpic25Snapshot(version);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return { snapshot, tables: extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) })).tables };
}

/** The TAG of the fixture's first cabos de entrada: the sheet whose every reading is "Não medido". */
function cableTag(snapshot: RelatorioSnapshot): string {
  const block = snapshot.blocks.find((row) => row.block_type === 'cabos_entrada' && row.removed_at === null)!;
  return snapshot.equipment.find((row) => row.id === block.equipment_id)!.tag;
}

const BOXES = (aprovado: string, reprovado: string, sem: string, com: string) => ['APROVADO', aprovado, 'REPROVADO', reprovado, 'SEM RESTRIÇÕES', sem, 'COM RESTRIÇÕES (VER OBSERVAÇÕES)', com];
const isConclusion = (table: string[][]) => table[0]?.[0] === 'CONCLUSÃO';

describe('25.6-INT the DOCX of a v15 relatório with a sheet on which nothing was measured', () => {
  it('section 9: the cabos de entrada prints its CONCLUSÃO boxes empty and no paragraph on v15, APROVADO and SEM on v14; section 10 counts it not concluded; every other table the same', async () => {
    const [v14, v15] = await Promise.all([tablesOf('v14'), tablesOf('v15')]);
    const tag = cableTag(v14.snapshot);
    const subject = `Os cabos de entrada ${tag}`;
    // v14: the cable's CONCLUSÃO table, found by its paragraph's subject.
    const at = v14.tables.findIndex((table) => isConclusion(table) && (table[2]?.[0] ?? '').startsWith(subject));
    expect(at).toBeGreaterThan(-1);
    expect(v14.tables[at]![1]).toEqual(BOXES('X', '', 'X', ''));
    // v15: no CONCLUSÃO table names the cable (its paragraph is not printed), the same tables otherwise.
    expect(cableTag(v15.snapshot)).toBe(tag);
    expect(v15.tables.some((table) => isConclusion(table) && (table[2]?.[0] ?? '').startsWith(subject))).toBe(false);
    expect(v15.tables).toHaveLength(v14.tables.length);
    const differing = v15.tables.flatMap((table, n) => (JSON.stringify(table) === JSON.stringify(v14.tables[n]) ? [] : [n]));
    // Section 10's Parecer box (found by its summary's opening) counts the cable as not concluded on v15.
    const parecer = v14.tables.findIndex((table) => (table[0]?.[0] ?? '').includes('Foram registradas'));
    expect(parecer).toBeGreaterThan(-1);
    expect(differing).toEqual([at, parecer]);
    expect(isConclusion(v15.tables[at]!)).toBe(true);
    expect(v15.tables[at]![1]).toEqual(BOXES('', '', '', ''));
    expect(v15.tables[at]!.slice(2).flat().join('').trim()).toBe('');
    expect(v14.tables[parecer]![0]![0]).toContain('Foram registradas 16 fichas de ensaio: 3 concluídas e 13 ainda não concluídas.');
    expect(v15.tables[parecer]![0]![0]).toContain('Foram registradas 16 fichas de ensaio: 2 concluídas e 14 ainda não concluídas.');
    // Nothing else of the box moves: the verdict and the rest of its summary.
    expect(v15.tables[parecer]![0]![0]!.replace('2 concluídas e 14', '3 concluídas e 13')).toBe(v14.tables[parecer]![0]![0]);
  }, 120_000);
});
