import { describe, expect, it } from 'vitest';
import { BLOCK_1_ID, BLOCK_2_ID, companyTypes, DEFINITION_1, RELATORIO_ID, VERSION_1_ID, VERSION_2_ID } from '../../fixtures/company-types/op-log.ts';
import { replay } from '../ops/replay.ts';
import { resolveSection8 } from '../print/section-8.ts';
import { cellAddressesOf } from '../relatorio/reading-evaluation.ts';
import type { BlockRow, Cell, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { hasPointSource } from './derived.ts';

/*
 * Fix batch e24h (Matheus, 2026-11-10): no derived entry lists or prints any more, so the cases below
 * that read an entry's recommended text went with `derivedPoints`; what stays is that a recommended
 * test out of its criterion, or a Reprovado chosen by hand, prints nothing in section 8 until the
 * technician creates a point. The recommendation starts no point now (no create path for a reading;
 * an open question of spec e24h, D4). Struck below: the Story 23.11 rule.
 * ~~Story 23.11 (batch e23h): a `reading` derived entry starts with its test's recommendation, in
 * both grammars; without one it is byte-equal to the generic text; ~~the `reprovado` entry never
 * takes one~~ (fix batch e23z, item 2: the `reprovado` entry starts with the in-force tests' ones). The company-types fixture: block 1 (version 1) reads 131 Vcc on the flutuação row,
 * below its 132 Vcc criterion; here its insulation also reads 50 MΩ, below 100 MΩ. Synthetic texts.~~
 */

const base = buildSnapshot(replay(companyTypes.log), RELATORIO_ID);
const cell = (value: Cell['value']): Cell => ({ value, source_suggestion_id: null, op_id: '019a5c00-0e23-7000-8000-000000000001' });

/** Block 1 with an out insulation reading too (its first cell, 50 MΩ). */
function withInsulationOut(snapshot: RelatorioSnapshot): RelatorioSnapshot {
  const version = snapshot.equipment_types!.find((row) => row.id === VERSION_1_ID)!;
  const [first] = cellAddressesOf(asBlockDefinition(version), 'isolacao');
  const blocks = snapshot.blocks.map((block): BlockRow =>
    block.id !== BLOCK_1_ID
      ? block
      : { ...block, sheet: { ...block.sheet, test: { ...block.sheet.test, isolacao: { cells: { [String(first!.row)]: { [String(first!.col)]: cell({ raw: '50', unit: 'MΩ', state: 'measured' }) } } } } } },
  );
  return { ...snapshot, blocks };
}

/** The snapshot with the given recommendations on version `versionId`'s tests (by test key). */
function recommending(snapshot: RelatorioSnapshot, versionId: string, recommendations: Readonly<Record<string, string>>): RelatorioSnapshot {
  const patch = <T extends { key: string }>(test: T): T => (recommendations[test.key] === undefined ? test : { ...test, recommendation: recommendations[test.key] });
  const equipmentTypes = snapshot.equipment_types!.map((row): EquipmentTypeVersionRow => {
    if (row.id !== versionId) return row;
    const definition: CompanyTypeDefinition = { ...row.definition, tests: row.definition.tests.map(patch), measurement_tests: row.definition.measurement_tests?.map(patch) };
    return { ...row, definition };
  });
  return { ...snapshot, equipment_types: equipmentTypes };
}

describe('23.11-UNIT a recommended test out of its criterion (fix batch e24h: no automatic point)', () => {
  const plain = withInsulationOut(base);

  it('both grammars out and recommending: the findings stand, section 8 prints none of them', () => {
    const snapshot = recommending(plain, VERSION_1_ID, { isolacao: 'Limpar e secar as buchas', tensoes_medidas: 'Verificar o carregador e o banco de baterias.' });
    expect(DEFINITION_1.tests.every((test) => test.recommendation === undefined)).toBe(true);
    expect(hasPointSource(snapshot)).toBe(true);
    const printed = resolveSection8(snapshot, new Map()).map((bullet) => bullet.text).join(' ');
    expect(printed).not.toContain('Limpar e secar as buchas');
    expect(printed).not.toContain('Verificar o carregador');
    expect(printed).not.toContain('Ensaio fora do critério');
  });

  it('a Reprovado the engineer chose, its version recommending: no bullet', () => {
    const chosen: RelatorioSnapshot = {
      ...base,
      blocks: base.blocks.map((block) => (block.id === BLOCK_2_ID ? { ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, result: cell('reprovado') } } } : block)),
    };
    const snapshot = recommending(chosen, VERSION_2_ID, { isolacao: 'Trocar', tensoes_medidas: 'Trocar' });
    expect(resolveSection8(snapshot, new Map()).some((bullet) => bullet.text.includes('Trocar') || bullet.text.includes('Equipamento reprovado'))).toBe(false);
  });
});
