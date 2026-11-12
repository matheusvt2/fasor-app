import { describe, expect, it } from 'vitest';
import { layoutLockEpic25Snapshot } from '../../fixtures/layout-lock/op-log.ts';
import { sheetPointFindings } from '../points/derived.ts';
import { testHistoryNote } from '../print/history-note.ts';
import { readingSlotsOf } from '../print/reading-slots.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell } from '../schemas/entities.ts';
import { blockDefinitionIn, EMPTY_DEFINITION_CONTEXT, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { restrictionSchema, type BlockDefinition } from '../seed/schema.ts';
import { TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { evaluateTest, type TestEvaluation } from './readings.ts';
import { newEquipmentBlock } from './tree.ts';
import { NO_VISIT_CONTEXT, visitContextOf, type VisitContext } from './visit-context.ts';

/*
 * 25.8-UNIT (batch e25c, Story 25.8, Bruno's answer 1 of 2026-11-11): on seed v15 a contact pole whose
 * rise since the previous visit equals the 50 % limit is restricted (`history_rise_at_limit_restricted`
 * beside `history_rise_out_pct`); above it stays out, below it nothing; v13 and v14 keep it within.
 * Every value is invented.
 */

const id = (n: number) => `019966b0-0258-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string) => ({ raw, unit: 'µΩ', state: 'measured' as const });

type ContactType = Extract<EquipmentBlockType, 'disjuntor_mt' | 'chave_seccionadora'>;

function poles(values: readonly string[], seedVersion: string, type: ContactType = 'disjuntor_mt'): BlockRow {
  const block = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
  }).block;
  const next = structuredClone(block);
  const test = next.sheet.test.resistencia_contato ?? { cells: {} };
  values.forEach((value, row) => {
    test.cells[String(row)] = { ...test.cells[String(row)], '0': cell(measured(value)) };
  });
  next.sheet.test.resistencia_contato = test;
  return next;
}

/** A previous visit issued on `previousSeed` with the contact poles `values`. */
function previous(values: readonly string[], previousSeed: string, type: ContactType = 'disjuntor_mt'): VisitContext {
  const keys = readingSlotsOf(getDefinition(previousSeed, 'cabine_primaria', type))
    .filter((slot) => slot.testKey === 'resistencia_contato')
    .map((slot) => slot.key);
  return {
    ambientC: null,
    previous: {
      relatorio_id: id(900),
      revision_number: 1,
      issued_at: '2026-11-05T15:00:00.000Z',
      seed_version: previousSeed,
      block_type: type,
      readings: Object.fromEntries(values.map((value, i) => [keys[i]!, measured(value)])),
    },
  };
}

const definitionOf = (block: BlockRow): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);
const contact = (block: BlockRow, visit: VisitContext): TestEvaluation => {
  const definition = definitionOf(block);
  return evaluateTest(block, definition, definition.tests.find((test) => test.key === 'resistencia_contato')!, visit);
};
const captures = (test: TestEvaluation) => test.tables.flatMap((table) => table.rows.map((row) => row.cells.find((one) => one.role === 'capture')!));
const verdicts = (test: TestEvaluation) => captures(test).map((one) => one.verdict);

/** Story 25.8's authored reason for pole A, 40 µΩ then 60 µΩ. */
const AT_LIMIT = 'alta de 50 % sobre 40 µΩ da manutenção anterior, rev. 1 de 05/11/2026, no limite de 50 %';

describe('25.8-UNIT a v15 contact rise of exactly 50 % is restricted; above it out; v13 and v14 within', () => {
  it.each(['v13', 'v14', 'v15'])('pole A 40 then 60 µΩ, previous visit on %s: restricted, Aprovado · Com restrições, the helper, the conclusion and the note line name it', (previousSeed) => {
    const block = poles(['60', '42', '41'], 'v15');
    const visit = previous(['40', '42', '41'], previousSeed);
    const test = contact(block, visit);
    expect(verdicts(test)).toEqual(['restricted', 'within', 'within']);
    const pole = captures(test)[0]!;
    expect(pole.rise).toBeUndefined();
    expect(pole.restriction).toEqual({ reason: AT_LIMIT, text: `${AT_LIMIT}. Dentro do aceitável; a conclusão sobe para Com restrições.`, history: AT_LIMIT });
    expect(conclusionFloor(block, definitionOf(block), visit)?.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(composeConclusion(block, definitionOf(block), 'DJ-1', visit).text).toContain(AT_LIMIT);
    expect(testHistoryNote('v15', test)).toBe(`Em relação à manutenção anterior: T1-T2, ${AT_LIMIT}.`);
  });

  it('the same pole at 60,4 µΩ is out and the ficha Reprovado, as today', () => {
    const block = poles(['60.4', '42', '41'], 'v15');
    const visit = previous(['40', '42', '41'], 'v15');
    const test = contact(block, visit);
    expect(verdicts(test)).toEqual(['out', 'within', 'within']);
    expect(captures(test)[0]!.rise!.reason).toBe('alta de 51 % sobre 40 µΩ da manutenção anterior, rev. 1 de 05/11/2026, acima do limite de 50 %');
    expect(conclusionFloor(block, definitionOf(block), visit)?.pair.result).toBe('reprovado');
  });

  it('the same pole at 59,6 µΩ: the rise rule flags nothing', () => {
    const test = contact(poles(['59.6', '42', '41'], 'v15'), previous(['40', '42', '41'], 'v15'));
    expect(verdicts(test)).toEqual(['within', 'within', 'within']);
    expect(captures(test)[0]!.restriction).toBeNull();
  });

  it('the limit holds within the rule\'s rounding tolerance only: a float a hair off the share is still at the limit', () => {
    // 0.3 / 0.2 carries float noise: (0.3 - 0.2) / 0.2 * 100 is 49.999999999999986.
    const test = contact(poles(['0.3', '0.21', '0.2'], 'v15'), previous(['0.2', '0.21', '0.2'], 'v15'));
    expect(verdicts(test)[0]).toBe('restricted');
  });

  it('the seccionadora too', () => {
    const block = poles(['60', '42', '41'], 'v15', 'chave_seccionadora');
    const test = contact(block, previous(['40', '42', '41'], 'v15', 'chave_seccionadora'));
    expect(verdicts(test)[0]).toBe('restricted');
    expect(captures(test)[0]!.restriction!.reason).toBe(AT_LIMIT);
  });

  it('a pole both at the limit and deviating from the lowest pole: restricted, both reasons named, the note line the rise alone (a restricted pole named by its row, as the drop rule names one)', () => {
    const test = contact(poles(['60', '39', '41'], 'v15'), previous(['40', '39', '41'], 'v15'));
    expect(verdicts(test)).toEqual(['restricted', 'within', 'within']);
    const pole = captures(test)[0]!;
    expect(pole.restriction!.reason).toBe(`${AT_LIMIT}; mais de 50 % acima do menor polo`);
    expect(pole.restriction!.history).toBe(AT_LIMIT);
    expect(testHistoryNote('v15', test)).toBe(`Em relação à manutenção anterior: T1-T2, ${AT_LIMIT}.`);
  });

  it('no previous visit, or one issued before v13: nothing', () => {
    expect(verdicts(contact(poles(['60', '42', '41'], 'v15'), NO_VISIT_CONTEXT))[0]).toBe('within');
    expect(verdicts(contact(poles(['60', '42', '41'], 'v15'), previous(['40', '42', '41'], 'v12')))[0]).toBe('within');
  });

  it.each(['v13', 'v14'])('a %s breaker with the 40 to 60 µΩ rise stays within, as today', (seed) => {
    const block = poles(['60', '42', '41'], seed);
    const visit = previous(['40', '42', '41'], seed);
    expect(verdicts(contact(block, visit))).toEqual(['within', 'within', 'within']);
    expect(conclusionFloor(block, definitionOf(block), visit)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
  });

  it('the seed: v15 carries the key on the breaker\'s and the switch\'s contact test only; v14 on none; the key needs the rise rule', () => {
    const carriers = (seed: string) =>
      (['disjuntor_mt', 'chave_seccionadora', 'transformador_forca', 'cabos_entrada', 'cabos_saida', 'para_raio'] as const).flatMap((type) =>
        getDefinition(seed, 'cabine_primaria', type)
          .tests.filter((test) => test.restriction?.history_rise_at_limit_restricted === true)
          .map((test) => `${type}.${test.key}`),
      );
    expect(carriers('v15')).toEqual(['disjuntor_mt.resistencia_contato', 'chave_seccionadora.resistencia_contato']);
    expect(carriers('v14')).toEqual([]);
    expect(restrictionSchema.safeParse({ history_rise_out_pct: 50, history_rise_at_limit_restricted: true, status: 'CONFIRMADO' }).success).toBe(true);
    expect(restrictionSchema.safeParse({ pole_deviation_pct: 50, history_rise_at_limit_restricted: true, status: 'CONFIRMADO' }).success).toBe(false);
  });

  it('the Epic 25 fixture\'s breaker (30 then 45 µΩ): on v15 restricted, its point names the rise at the limit; on v14 within, no note line', () => {
    const at = (version: string) => {
      const snapshot = layoutLockEpic25Snapshot(version);
      const ctx = snapshotDefinitionContext(snapshot);
      const block = snapshot.blocks.find((one) => {
        if (one.block_type !== 'disjuntor_mt' || one.removed_at !== null) return false;
        const definition = blockDefinitionIn(ctx, one)!;
        return captures(evaluateTest(one, definition, definition.tests.find((test) => test.key === 'resistencia_contato')!, visitContextOf(snapshot, one))).every((c) => c.raw === '45');
      })!;
      const definition = blockDefinitionIn(ctx, block)!;
      const test = evaluateTest(block, definition, definition.tests.find((one) => one.key === 'resistencia_contato')!, visitContextOf(snapshot, block));
      return { snapshot, block, test };
    };
    const v15 = at('v15');
    expect(verdicts(v15.test)).toEqual(['restricted', 'restricted', 'restricted']);
    expect(testHistoryNote('v15', v15.test)).toMatch(/^Em relação à manutenção anterior: T1-T2, alta de 50 % sobre 30 µΩ da manutenção anterior, rev\. 1 de [0-9/]+, no limite de 50 %; /);
    const finding = sheetPointFindings(v15.snapshot, v15.block.id).find((one) => one.testKey === 'resistencia_contato');
    expect(finding?.text).toContain('alta de 50 % sobre 30 µΩ da manutenção anterior');
    expect(finding?.text).toContain('no limite de 50 %');
    const v14 = at('v14');
    expect(verdicts(v14.test)).toEqual(['within', 'within', 'within']);
    expect(testHistoryNote('v14', v14.test)).toBeNull();
  });
});
