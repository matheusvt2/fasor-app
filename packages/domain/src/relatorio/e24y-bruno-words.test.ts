import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { getDefinition } from '../seed/definitions.ts';
import { conclusionSuggestionText } from './conclusion.ts';
import { evaluateSheetMeasurements, measurementTestsUnnumbered } from './measurement-evaluation.ts';
import { visitContextOf } from './visit-context.ts';

/*
 * Fix batch e24y, P8b and P9 (Bruno's answers of 2026-11-11, through the coordinator): the conclusion's
 * preview pill reads "Marcar como …?", and the v14 Inspeção de QGBT's thermography is titled
 * "TERMOGRAFIA" as the eight types title it, on the sheet and in print; the Malha and every other
 * library type keep their "E1 ·", and v13 prints as before. Every relatório is the layout lock's.
 */

describe('e24y-P8b-UNIT the preview pill asks "Marcar como …?"', () => {
  it('names the pair after "Marcar como", the Reprovado alone and each restriction', () => {
    expect(conclusionSuggestionText({ result: 'reprovado', restriction: null })).toBe('Marcar como Reprovado?');
    expect(conclusionSuggestionText({ result: 'aprovado', restriction: 'sem_restricoes' })).toBe('Marcar como Aprovado · Sem restrições?');
    expect(conclusionSuggestionText({ result: 'reprovado', restriction: 'com_restricoes' })).toBe('Marcar como Reprovado · Com restrições?');
  });
});

describe('e24y-P9-UNIT the v14 Inspeção de QGBT\'s thermography is "TERMOGRAFIA"', () => {
  it('reads unnumbered on v14; the Malha (v13 and v14) and the v13 inspection keep their numbering', () => {
    expect(measurementTestsUnnumbered(getDefinition('v14', 'cabine_primaria', 'inspecao_qgbt'))).toBe(true);
    expect(measurementTestsUnnumbered(getDefinition('v13', 'cabine_primaria', 'inspecao_qgbt'))).toBe(false);
    expect(measurementTestsUnnumbered(getDefinition('v14', 'cabine_primaria', 'malha_aterramento'))).toBe(false);
    expect(measurementTestsUnnumbered(getDefinition('v13', 'cabine_primaria', 'malha_aterramento'))).toBe(false);
  });

  it('titles the v14 inspection\'s test "Termografia" with no "E1 ·" (section 9 prints it upper case); the Malha keeps "E1 ·" on v13 and v14', () => {
    const titleOf = (version: string, type: string, key: string) => {
      const snapshot = layoutLockSnapshot(version);
      const block = snapshot.blocks.find((one) => one.block_type === type && one.removed_at === null && one.equipment_id !== null)!;
      return evaluateSheetMeasurements(block, getDefinition(version, 'cabine_primaria', type), visitContextOf(snapshot, block)).find((test) => test.testKey === key)!.title;
    };
    expect(titleOf('v14', 'inspecao_qgbt', 'termografia')).toBe('Termografia');
    expect(titleOf('v14', 'malha_aterramento', 'resistencia_malha')).toMatch(/^E1 · /u);
    expect(titleOf('v13', 'malha_aterramento', 'resistencia_malha')).toMatch(/^E1 · /u);
  });
});
