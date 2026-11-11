import { describe, expect, it } from 'vitest';
import { companyBlockType, type EquipmentBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type Cell } from '../schemas/entities.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, getDefinition, type DefinitionContext } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import type { CompanyTypeDefinition } from '../types/definition.ts';
import { addDraftTest } from '../types/draft-edit.ts';
import { duplicateSeededType, typeVersionRow } from '../types/duplicate.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { evaluateSheetMeasurements, type EvaluatedMeasurementCell, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * The conclusion paragraph never says "dentro dos critérios de aceitação" while a measured reading
 * was judged by no criterion (Epic 23 retrospective R-1):
 * - R-1a: a live measurement test judged by the deviation between phases with a measured cell it
 *   could not judge (`unjudged`): the paragraph reads "com leitura a conferir", and each such cell
 *   carries a "Conferir:" helper (verdict null, not `toCheck`);
 * - R-1b: a seeded test with no criterion (Story 14.9's band picked from no TENSÃO NOMINAL) holding a
 *   measured capture beside a judged one reads the same; with nothing judged the "sem comparação"
 *   text stays.
 * The basis keeps its bytes (the spec's Design Notes D1). Every value is invented.
 */

const id = (n: number) => `019966b0-0e24-7000-8000-${n.toString(16).padStart(12, '0')}`;
const OP = id(90_000);
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: OP });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const ohm = (raw: string) => measured(raw, 'Ω');

const TO_CHECK = 'valores medidos com leitura a conferir';
const WITHIN = 'valores medidos dentro dos critérios de aceitação';
const NOT_COMPARED = 'valores medidos sem comparação com o critério de aceitação';

function sheet(type: EquipmentBlockType): BlockRow {
  return newEquipmentBlock({ definitions: EMPTY_DEFINITION_CONTEXT, blockId: id(1), equipmentId: id(2), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(4), type, tag: 'T1', seedVersion: 'v13', orderKey: 'a0' }).block;
}
const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

function cells(block: BlockRow, testKey: string, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

function switchedOff(block: BlockRow, ...keys: string[]): BlockRow {
  const next = structuredClone(block);
  const config = next.config as { sub_blocks: Record<string, { enabled: boolean }> };
  for (const key of keys) config.sub_blocks[key] = { enabled: false };
  return next;
}

const measurementOf = (block: BlockRow, testKey: string): MeasurementTestEvaluation => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === testKey)!;
const cellAt = (test: MeasurementTestEvaluation, row: number, col: number): EvaluatedMeasurementCell => test.rows[row]!.cells.find((one) => one.address.row === row && one.address.col === col)!;
const measuredCells = (test: MeasurementTestEvaluation) => test.rows.flatMap((row) => row.cells.filter((one) => one.kind === 'number' && one.fixed === null && one.state === 'measured'));

const quietSeccionadora = () => switchedOff(plate(sheet('chave_seccionadora'), { tipo_seccionadora: 'SOB CARGA COM FUSÍVEIS' }), 'isolacao', 'resistencia_contato', 'termografia');
const fuses = (values: Record<string, unknown>) => cells(quietSeccionadora(), 'resistencia_fusiveis', values);
const quietTransformer = (values: Record<string, unknown>) =>
  switchedOff(plate(sheet('transformador_forca'), { material_enrolamento: 'Cu', ...values }), 'isolacao', 'relacao_transformacao', 'termografia', 'coleta_oleo');
const textOf = (block: BlockRow) => composeConclusion(block, definitionOf(block), 'T1').text;

describe('e24f-UNIT R-1a a measured cell the deviation between phases could not judge reads "a conferir"', () => {
  it('fuses A = 0, B = 10, C = 10 mΩ: no floor, the paragraph reads "a conferir", cell A carries a helper', () => {
    const block = fuses({ '0/0': measured('0', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    const test = measurementOf(block, 'resistencia_fusiveis');
    expect(test.unjudged).toBe(true);
    expect(conclusionFloor(block, definitionOf(block))).toBeNull();
    const text = textOf(block);
    expect(text).toContain(TO_CHECK);
    expect(text).not.toContain('dentro dos critérios');
    const a = cellAt(test, 0, 0);
    expect(a.verdict).toBeNull();
    expect(a.toCheck).toBe(false);
    expect(a.helperText).toMatch(/^Conferir: /);
    for (const row of [1, 2]) {
      const other = cellAt(test, row, 0);
      expect(other.verdict, `row ${row}`).toBe('within');
      expect(other.helperText, `row ${row}`).toBeNull();
    }
  });

  it('a lone positive phase, and every cell while the medium is unknown: "a conferir", each unjudged cell with its helper', () => {
    const lone = fuses({ '0/0': measured('10', 'mΩ') });
    const medium = cells(quietTransformer({}), 'resistencia_enrolamento', { '0/0': ohm('10'), '0/1': ohm('10'), '0/2': ohm('20') });
    for (const [block, key] of [
      [lone, 'resistencia_fusiveis'],
      [medium, 'resistencia_enrolamento'],
    ] as const) {
      const test = measurementOf(block, key);
      expect(test.unjudged, key).toBe(true);
      expect(textOf(block), key).toContain(TO_CHECK);
      const open = measuredCells(test).filter((one) => one.verdict === null && !one.toCheck);
      expect(open.length, key).toBeGreaterThan(0);
      for (const one of open) expect(one.helperText, `${key} ${one.address.row}/${one.address.col}`).toMatch(/^Conferir: /);
    }
  });

  it('every cell judged (A = 10): "dentro dos critérios", no helper; an out reading names its clause before any "a conferir"', () => {
    const fine = fuses({ '0/0': measured('10', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    expect('unjudged' in measurementOf(fine, 'resistencia_fusiveis')).toBe(false);
    expect(textOf(fine)).toContain(WITHIN);
    for (const one of measuredCells(measurementOf(fine, 'resistencia_fusiveis'))) expect(one.helperText).toBeNull();
    const out = fuses({ '0/0': measured('0', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('12', 'mΩ') });
    const outText = textOf(out);
    expect(outText).toContain('fora do critério');
    expect(outText).not.toContain(TO_CHECK);
  });

  it('the basis keeps its bytes: the same sheets give the basis they gave before the fix', () => {
    // Pinned on the baseline 1528183f (the fix changes the composed text only, Design Notes D1).
    const zero = fuses({ '0/0': measured('0', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    const fine = fuses({ '0/0': measured('10', 'mΩ'), '1/0': measured('10', 'mΩ'), '2/0': measured('10', 'mΩ') });
    expect([composeConclusion(zero, definitionOf(zero), 'T1').basis, composeConclusion(fine, definitionOf(fine), 'T1').basis]).toEqual([BASIS_ZERO, BASIS_FINE]);
  });
});

// The bases of the two sheets above on the baseline (see the test).
const BASIS_ZERO = '8e3e4180';
const BASIS_FINE = 'ab0f8a70';

describe('e24f-UNIT R-1b a seeded test with no criterion holding a capture beside a judged one reads "a conferir"', () => {
  /** A company copy of the Quadro elétrico with a contact-resistance test added (both through the editor's kernel helpers), published as version 1. */
  function quadroWithContact(): { definition: BlockDefinition; ctx: DefinitionContext; blockType: ReturnType<typeof companyBlockType> } {
    const added = addDraftTest(duplicateSeededType('v12', 'quadro_eletrico').draft, 'resistencia_contato', 'v12')!;
    const row = typeVersionRow({ id: id(500), type: { id: id(600), latest_version: 0 }, definition: added.draft as CompanyTypeDefinition, publishedBy: id(9), publishedAt: '2026-11-10T12:00:00.000Z' });
    return { definition: asBlockDefinition(row), ctx: definitionContext([row]), blockType: companyBlockType(id(600)) };
  }
  function block(test: BlockRow['sheet']['test']): { b: BlockRow; definition: BlockDefinition } {
    const { definition, ctx, blockType } = quadroWithContact();
    const created = newEquipmentBlock({ definitions: ctx, blockId: id(1), equipmentId: id(2), relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: id(4), type: blockType, tag: 'QD-1', seedVersion: 'v12', orderKey: 'a0', typeVersion: 1 }).block;
    return { b: { ...created, sheet: { ...created.sheet, test } }, definition };
  }
  const insulation = { cells: Object.fromEntries([0, 1, 2, 3].map((row) => [String(row), { '1': cell(measured('50', 'MΩ')) }])) };
  const contact = { cells: Object.fromEntries([0, 1, 2].map((row) => [String(row), { '0': cell(measured('120', 'µΩ')) }])) };

  it('no TENSÃO NOMINAL (no band), insulation measured and contact judged within: no floor, "a conferir"', () => {
    const { b, definition } = block({ isolacao: insulation, resistencia_contato: contact });
    expect(conclusionFloor(b, definition)).toBeNull();
    const text = composeConclusion(b, definition, 'QD-1').text;
    expect(text).toContain(TO_CHECK);
    expect(text).not.toContain('dentro dos critérios');
  });

  it('with nothing judged, the "sem comparação" text stays', () => {
    const { b, definition } = block({ isolacao: insulation });
    expect(composeConclusion(b, definition, 'QD-1').text).toContain(NOT_COMPARED);
  });
});

describe('e24f-UNIT R-1 a v11 ratio table waiting for its vector group, beside a judged reading, reads "a conferir"', () => {
  const TRAFO = getDefinition('v11', 'cabine_primaria', 'transformador_forca');
  const at = (raw: string, unit: string | null) => cell(measured(raw, unit));
  function trafo(ligacao: string | null): BlockRow {
    const sheet = emptySheet();
    if (ligacao !== null) sheet.nameplate.ligacao_secundaria = cell(ligacao);
    sheet.test.relacao_transformacao = { cells: { '0': { '0': at('13.8', 'kV'), '1': at('380', 'V'), '3': at('36.3', null), '4': at('36.3', null), '5': at('36.3', null) } } };
    sheet.test.isolacao = { cells: Object.fromEntries([0, 1, 2].map((row) => [String(row), { '1': at('147', 'GΩ') }])) };
    return { id: id(1), relatorio_id: TEST_RELATORIO, location_id: null, equipment_id: id(2), block_type: 'transformador_forca', config: defaultBlockConfig('v11', 'transformador_forca'), seed_version: 'v11', order_key: 'a0', feeds_block_id: null, not_tested: null, concluded_by: null, sheet, created_by: null, first_edited_at: null, last_modified_by: null, last_modified_at: null, removed_at: null } as BlockRow;
  }

  it('no DESLOCAMENTO ANGULAR: no floor and "a conferir"; with the group, "dentro dos critérios" as before', () => {
    const waiting = trafo(null);
    expect(conclusionFloor(waiting, TRAFO)).toBeNull();
    expect(composeConclusion(waiting, TRAFO, 'TR-1').text).toContain(TO_CHECK);
    const grouped = trafo('Yyn0');
    expect(conclusionFloor(grouped, TRAFO)!.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(composeConclusion(grouped, TRAFO, 'TR-1').text).toContain(WITHIN);
  });
});

