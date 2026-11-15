import { applyOp, buildSnapshot, entityKey, getDefinition, layoutSpec, makeOp, replay, sheetTestRowCellPath, sheetTestRowPath, type BlockRow, type EntityState, type EquipmentRow, type JsonValue, type Op } from '@app/domain';
import { LAYOUT_LOCK_ISSUED_AT, layoutLockEpic25Fixture } from '@app/domain/fixtures/layout-lock';
import { describe, expect, it } from 'vitest';
import { buildDocx } from './docx.ts';
import { extractStructure } from './docx-structure.test-support.ts';
import { placeholderPages } from './toc.ts';

/*
 * 25.16-INT (batch e25s, Story 25.16; Bruno's answer 6, M30): the DOCX of a v16 relatório whose Malha de
 * aterramento holds two continuity points the technician added (Story 25.14's paths, folded over the layout lock's
 * Epic 25 relatório, its five rows within): "Cerca metálica" at 0,3 Ω and "Estrutura do portão" at 0,8 Ω. The
 * continuity table prints the five rows, then the two points in the order they were added, with their names in the
 * first column, each with the test's criterion and its result; the sheet concludes Reprovado and its paragraph names
 * the point out. The same relatório on v15 prints its five rows only. Values invented.
 */

const TEST = 'continuidade_malha';
const NBSP = ' ';
const rowId = (n: number) => `019a6100-2518-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCount = 0;

/** The Epic 25 relatório of `version`, with `points` (`[name, ohms]`) added to its Malha's continuity test. */
function relatorioWith(version: 'v15' | 'v16', points: readonly (readonly [string, string])[]) {
  const fixture = layoutLockEpic25Fixture(version);
  let state: EntityState = replay(fixture.log);
  const block = [...state.values()].find((row) => (row as BlockRow).block_type === 'malha_aterramento' && (row as BlockRow).relatorio_id === fixture.relatorioId) as BlockRow;
  const put = (path: string, value: JsonValue): Op => {
    opCount += 1;
    return makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: '019a6100-0000-7000-8000-000000000001',
        project_id: null,
        relatorio_id: fixture.relatorioId,
        path,
        value,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: '019a6100-0000-7000-8000-000000000002',
        device_id: 'tablet-e25s-2516-int',
      },
      { newId: () => `019a6100-2519-7000-8000-${opCount.toString(16).padStart(12, '0')}`, now: new Date(Date.parse('2026-11-15T11:00:00.000Z') + opCount * 1000) },
    );
  };
  points.forEach(([name, raw], n) => {
    state = applyOp(state, put(sheetTestRowPath(block.id, TEST, rowId(n + 1), 'name'), name));
    state = applyOp(state, put(sheetTestRowCellPath(block.id, TEST, rowId(n + 1), 0), { raw, unit: 'Ω', state: 'measured' }));
  });
  const tag = (state.get(entityKey('equipment', block.equipment_id!)) as EquipmentRow).tag;
  return { snapshot: buildSnapshot(state, fixture.relatorioId), tag };
}

async function structureOf(version: 'v15' | 'v16', points: readonly (readonly [string, string])[]) {
  const { snapshot, tag } = relatorioWith(version, points);
  const layout = layoutSpec(snapshot, { revisionNumber: 1, issuedAt: LAYOUT_LOCK_ISSUED_AT });
  return { structure: extractStructure(await buildDocx(layout, { tocPages: placeholderPages(layout) })), tag };
}

const clean = (text: string) => text.replaceAll(NBSP, ' ');
const continuityTables = (tables: string[][][]) => tables.filter((table) => clean(table[0]?.[0] ?? '').includes('CONTINUIDADE E EQUIPOTENCIALIZAÇÃO'));
const FIVE = ['CARCAÇAS', 'PORTAS', 'NEUTRO DO TRANSFORMADOR', 'PARA-RAIOS', 'BLINDAGENS'];

describe('25.16-INT the DOCX of a v16 Malha de aterramento with two added continuity points', () => {
  it('prints the five rows, then "Cerca metálica" and "Estrutura do portão" with the criterion and their results; the paragraph names the point out', async () => {
    const { structure, tag } = await structureOf('v16', [
      ['Cerca metálica', '0.3'],
      ['Estrutura do portão', '0.8'],
    ]);
    const tables = continuityTables(structure.tables);
    expect(tables, JSON.stringify(structure.tables.map((table) => table[0]?.[0]))).toHaveLength(1);
    const rows = tables[0]!.map((row) => row.map(clean));
    const firsts = rows.map((row) => row[0]);
    const at = firsts.indexOf('CARCAÇAS');
    expect(at).toBeGreaterThan(-1);
    expect(firsts.slice(at)).toEqual([...FIVE, 'CERCA METÁLICA', 'ESTRUTURA DO PORTÃO']);
    const fence = rows.find((row) => row[0] === 'CERCA METÁLICA')!;
    const gate = rows.find((row) => row[0] === 'ESTRUTURA DO PORTÃO')!;
    expect(fence.join(' | ')).toContain('0,3');
    expect(gate.join(' | ')).toContain('0,8');
    expect(fence.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'SATISFATÓRIO']);
    expect(gate.slice(-2)).toEqual(['≤ 0,5 Ω entre pontos', 'INSATISFATÓRIO']);
    // The sheet's conclusion: Reprovado, and its paragraph names the point out of its criterion.
    const title = structure.paragraphs.findIndex((paragraph) => paragraph.startsWith(`${getDefinition('v16', 'cabine_primaria', 'malha_aterramento').label.toLocaleUpperCase('pt-BR')} ${tag}`));
    expect(title).toBeGreaterThan(-1);
    const after = structure.paragraphs.slice(title);
    expect(after.some((paragraph) => paragraph.includes('Estrutura do portão'))).toBe(true);
    expect(JSON.stringify(structure.tables)).toContain('REPROVADO');
  }, 120_000);

  it('the v15 Malha prints its five rows only', async () => {
    const { structure } = await structureOf('v15', []);
    const tables = continuityTables(structure.tables);
    expect(tables).toHaveLength(1);
    const firsts = tables[0]!.map((row) => clean(row[0] ?? ''));
    expect(firsts.slice(firsts.indexOf('CARCAÇAS'))).toEqual(FIVE);
  }, 120_000);
});
