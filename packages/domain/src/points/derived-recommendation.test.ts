import { describe, expect, it } from 'vitest';
import { BLOCK_1_ID, BLOCK_2_ID, companyTypes, DEFINITION_1, RELATORIO_ID, VERSION_1_ID, VERSION_2_ID } from '../../fixtures/company-types/op-log.ts';
import { replay } from '../ops/replay.ts';
import { resolveSection8 } from '../print/section-8.ts';
import { cellAddressesOf } from '../relatorio/reading-evaluation.ts';
import type { BlockRow, Cell, EquipmentTypeVersionRow } from '../schemas/entities.ts';
import { buildSnapshot, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { derivedPoints, derivedPointSeed } from './derived.ts';

/*
 * Story 23.11 (batch e23h): a `reading` derived entry starts with its test's recommendation, in
 * both grammars; without one it is byte-equal to the generic text; ~~the `reprovado` entry never
 * takes one~~ (fix batch e23z, item 2: the `reprovado` entry starts with the in-force tests' ones). The company-types fixture: block 1 (version 1) reads 131 Vcc on the flutuação row,
 * below its 132 Vcc criterion; here its insulation also reads 50 MΩ, below 100 MΩ. Synthetic texts.
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

const readingsOf = (snapshot: RelatorioSnapshot) => derivedPoints(snapshot).filter((entry) => entry.kind === 'reading' && entry.block_id === BLOCK_1_ID);

describe('23.11-UNIT the recommendation as the derived point\'s initial text', () => {
  const plain = withInsulationOut(base);
  const generic = readingsOf(plain);

  it('the fixture derives one reading entry per grammar, with the generic text', () => {
    expect(generic.map((entry) => entry.test_key)).toEqual(['isolacao', 'tensoes_medidas']);
    expect(generic[0]!.text).toMatch(/: 50 MΩ em .+ \(critério: .+\)$/);
    expect(generic[1]!.text).toMatch(/^Tensões medidas: 131 Vcc em Tensão de flutuação do banco \(critério: .+\)$/);
  });

  it('each grammar\'s entry starts with its own test\'s recommendation: a period appended when it has none, kept when it has one', () => {
    const recommended = readingsOf(recommending(plain, VERSION_1_ID, { isolacao: 'Limpar e secar as buchas', tensoes_medidas: 'Verificar o carregador e o banco de baterias.' }));
    expect(recommended.map((entry) => entry.text)).toEqual([`Limpar e secar as buchas. ${generic[0]!.text}`, `Verificar o carregador e o banco de baterias. ${generic[1]!.text}`]);
    // One grammar recommending leaves the other's text byte-equal.
    const one = readingsOf(recommending(plain, VERSION_1_ID, { tensoes_medidas: 'Refazer a medição' }));
    expect(one[0]!.text).toBe(generic[0]!.text);
    expect(one[1]!.text).toBe(`Refazer a medição. ${generic[1]!.text}`);
  });

  it('without a recommendation the text is byte-equal to the generic one (the fixture as published)', () => {
    expect(DEFINITION_1.tests.every((test) => test.recommendation === undefined)).toBe(true);
    expect(readingsOf(recommending(plain, VERSION_1_ID, {})).map((entry) => entry.text)).toEqual(generic.map((entry) => entry.text));
  });

  it('"Editar" starts the point with the recommended text, and section 8 prints it', () => {
    const snapshot = recommending(plain, VERSION_1_ID, { tensoes_medidas: 'Verificar o carregador' });
    const entry = readingsOf(snapshot)[1]!;
    expect(derivedPointSeed(entry)).toMatchObject({ text: `Verificar o carregador. ${generic[1]!.text}`, origin: 'reading', testKey: 'tensoes_medidas' });
    expect(resolveSection8(snapshot, new Map()).some((bullet) => bullet.text.includes(`Verificar o carregador. ${generic[1]!.text}`))).toBe(true);
  });

  // Fix batch e23z (item 2, Bruno 2026-11-09): the Reprovado entry now starts with the in-force tests' recommendations.
  it('a Reprovado the engineer chose with no failing test keeps its own text with no recommendation, and starts with each in-force test\'s once its version recommends', () => {
    const chosen: RelatorioSnapshot = {
      ...base,
      blocks: base.blocks.map((block) => (block.id === BLOCK_2_ID ? { ...block, sheet: { ...block.sheet, conclusion: { ...block.sheet.conclusion, result: cell('reprovado') } } } : block)),
    };
    const reprovado = (snapshot: RelatorioSnapshot) => derivedPoints(snapshot).filter((entry) => entry.kind === 'reprovado' && entry.block_id === BLOCK_2_ID);
    expect(reprovado(chosen).map((entry) => entry.text)).toEqual(['Concluído como Reprovado na ficha']);
    expect(reprovado(recommending(chosen, VERSION_2_ID, { isolacao: 'Trocar', tensoes_medidas: 'Trocar' })).map((entry) => entry.text)).toEqual(['Trocar. Concluído como Reprovado na ficha']);
    expect(reprovado(recommending(chosen, VERSION_2_ID, { isolacao: 'Trocar', tensoes_medidas: 'Revisar o banco.' })).map((entry) => entry.text)).toEqual(['Trocar. Revisar o banco. Concluído como Reprovado na ficha']);
  });
});
