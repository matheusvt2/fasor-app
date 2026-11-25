import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Snapshot, layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { layoutSpec } from '../print/layout.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition, SEED_VERSIONS } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { composeConclusion } from './conclusion.ts';
import { evaluateSheetMeasurements, type MeasurementTestEvaluation } from './measurement-evaluation.ts';
import { evaluateSheetReadings } from './readings.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Batch e30b, Epic 30, Story 30.3 (seed v19): the three texts that follow Bruno on v19 only, each red on the opened
 * v19 (equal to v18) before its fence in `seed/v19.ts` and green after it, and each proven unchanged on v18 and older:
 *   30.3-UNIT-A  a seeded criterion reads "≥ 0,5 MΩ", "> 400 MΩ", "< 250 µΩ", "± 0,5 %" (was ">=0,5 MΩ", ">400 MΩ",
 *                "<250 µΩ", "±0,5 %"), on the sheet and in section 9 alike;
 *   30.3-UNIT-B  a type with no checklist (the Malha de aterramento) concludes with no clause about checked items;
 *   30.3-UNIT-C  the default of the Malha's maximum names the block its field is in, "Dados da malha".
 * Every value is invented.
 */

const id = (n: number) => `019966b0-0303-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function sheet(type: EquipmentBlockType, seedVersion: string): BlockRow {
  return newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'MA-1',
    seedVersion,
    orderKey: 'a0',
  }).block;
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

const measurement = (block: BlockRow, key: string): MeasurementTestEvaluation => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === key)!;
const grid = (version: string, ohm: string): BlockRow => cells(sheet('malha_aterramento', version), 'resistencia_malha', { '0/0': measured(ohm, 'Ω') });
const OLDER = Object.keys(SEED_VERSIONS).filter((version) => version !== 'v19');
/** The versions that offer the Malha de aterramento (v13 and later), v19 aside. */
const OLDER_WITH_GRID = OLDER.filter((version) => Number(version.slice(1)) >= 13);

/** Every text of the printed layout of a locked fixture on `version`, as one string. */
const printed = (version: string, snapshotOf: (version: string) => ReturnType<typeof layoutLockSnapshot> = layoutLockSnapshot): string =>
  JSON.stringify(layoutSpec(snapshotOf(version), { revisionNumber: 1, issuedAt: '2026-11-08T12:00:00.000Z' }));

describe('30.3-UNIT-A seed v19: a seeded criterion is written with "≥", "≤" and a space after every operator', () => {
  /** The ratio's criterion of a TP sheet, and the insulation's of a quadro elétrico of 380 V (NBR 5410's band). */
  const ratioText = (version: string) => evaluateSheetReadings(sheet('tp', version), definitionOf(sheet('tp', version))).find((test) => test.testKey === 'relacao_transformacao')!.criterionText;
  const bandText = (version: string) => {
    const block = plate(sheet('quadro_eletrico', version), { tensao_nominal: measured('380', 'V') });
    return evaluateSheetReadings(block, definitionOf(block)).find((test) => test.testKey === 'isolacao')!.criterionText;
  };

  it('on a v19 sheet the tolerance reads "± 0,5 %" and the band\'s minimum "≥ 0,5 MΩ"', () => {
    expect(ratioText('v19')).toBe('± 0,5 %');
    expect(bandText('v19')).toBe('≥ 0,5 MΩ');
  });

  it('the same sheets on v18 read as they did: "±0,5 %" and ">=0,5 MΩ"', () => {
    expect(ratioText('v18')).toBe('±0,5 %');
    expect(bandText('v18')).toBe('>=0,5 MΩ');
    for (const version of OLDER.filter((one) => Number(one.slice(1)) >= 6)) expect(bandText(version), version).toBe('>=0,5 MΩ');
  });

  it('section 9 of a v19 relatório prints "> 400 MΩ", "< 250 µΩ" and "± 0,5 %", never the glued forms', () => {
    for (const snapshotOf of [layoutLockSnapshot, layoutLockEpic25Snapshot]) {
      const text = printed('v19', snapshotOf);
      expect(text).toContain('> 400 MΩ');
      expect(text).toContain('< 250 µΩ');
      expect(text).toContain('± 0,5 %');
      expect(text).not.toContain('>400 MΩ');
      expect(text).not.toContain('<250 µΩ');
      expect(text).not.toMatch(/±\d/);
      // A criterion with its own text (a NETA row) and a nominal with its tolerance are unchanged.
      expect(text).toContain('≥ 5.000 MΩ');
    }
  });

  it('section 9 of a v18 relatório prints the glued forms as it did', () => {
    for (const snapshotOf of [layoutLockSnapshot, layoutLockEpic25Snapshot]) {
      const text = printed('v18', snapshotOf);
      expect(text).toContain('>400 MΩ');
      expect(text).toContain('<250 µΩ');
      expect(text).toContain('±0,5 %');
      expect(text).not.toContain('> 400 MΩ');
      expect(text).not.toContain('< 250 µΩ');
      expect(text).not.toContain('± 0,5 %');
    }
  });
});

describe('30.3-UNIT-B seed v19: a type with no checklist concludes with no clause about checked items', () => {
  const CLAUSE = ', sem itens verificados registrados';
  const conclusionOf = (version: string) => {
    const block = grid(version, '4');
    return composeConclusion(block, definitionOf(block), 'MA-1').text;
  };

  it('the Malha de aterramento has no checklist on every version that offers it', () => {
    for (const version of [...OLDER_WITH_GRID, 'v19']) expect(definitionOf(sheet('malha_aterramento', version)).checklist, version).toBeNull();
  });

  it('a v19 Malha with a reading within its criterion concludes "{verbo} {leituras}." and nothing about items', () => {
    const text = conclusionOf('v19');
    expect(text).not.toContain('itens verificados');
    expect(text.endsWith('apresentou valores medidos dentro dos critérios de aceitação.')).toBe(true);
  });

  it('the same sheet on v13 to v18 keeps ", sem itens verificados registrados"', () => {
    for (const version of OLDER_WITH_GRID) {
      const text = conclusionOf(version);
      expect(text.endsWith(`apresentou valores medidos dentro dos critérios de aceitação${CLAUSE}.`), `${version}: ${text}`).toBe(true);
    }
    // Besides the clause, v18's sentence is v19's.
    expect(conclusionOf('v18').replace(CLAUSE, '')).toBe(conclusionOf('v19'));
  });

  it('a v19 type with a checklist and readings but no item answered still says so (the clause is true of it)', () => {
    const breaker = structuredClone(layoutLockEpic25Snapshot('v19').blocks.find((block) => block.block_type === 'disjuntor_mt')!);
    breaker.sheet.checklist = {};
    expect(definitionOf(breaker).checklist).not.toBeNull();
    expect(composeConclusion(breaker, definitionOf(breaker), 'DJ-1').text).toContain(CLAUSE);
  });
});

describe('30.3-UNIT-C seed v19: the default of the Malha\'s maximum names the block its field is in', () => {
  it('a v19 Malha with VALOR DE PROJETO empty reads "Sem VALOR DE PROJETO em Dados da malha, vale ≤ 5 Ω."', () => {
    expect(definitionOf(sheet('malha_aterramento', 'v19')).nameplate_title).toBe('Dados da malha');
    expect(measurement(grid('v19', '5.1'), 'resistencia_malha').notes).toEqual(['Sem VALOR DE PROJETO em Dados da malha, vale ≤ 5 Ω.']);
  });

  it('the same sheet on v13 to v18 keeps "na placa"', () => {
    for (const version of OLDER_WITH_GRID) expect(measurement(grid(version, '5.1'), 'resistencia_malha').notes, version).toEqual(['Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω.']);
  });

  it('a v19 type that does not rename its plate block keeps "na placa"', () => {
    const block = grid('v19', '5.1');
    const plain = structuredClone(definitionOf(block));
    delete plain.nameplate_title;
    expect(evaluateSheetMeasurements(block, plain).find((test) => test.testKey === 'resistencia_malha')!.notes).toEqual(['Sem VALOR DE PROJETO na placa, vale ≤ 5 Ω.']);
  });

  it('with the design value on the plate no default is said, on v19 as on v18', () => {
    for (const version of ['v18', 'v19']) {
      const block = cells(plate(sheet('malha_aterramento', version), { valor_projeto_ohm: measured('2', 'Ω') }), 'resistencia_malha', { '0/0': measured('3', 'Ω') });
      expect(measurement(block, 'resistencia_malha').notes, version).toBeUndefined();
    }
  });
});
