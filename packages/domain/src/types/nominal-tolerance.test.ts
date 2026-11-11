import { describe, expect, it } from 'vitest';
import { DEFINITION_1 } from '../../fixtures/company-types/op-log.ts';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { makeOp } from '../ops/op.ts';
import { composeConclusion, conclusionFloor, effectiveConclusionPair } from '../relatorio/conclusion.ts';
import { worstReadings } from '../relatorio/reading-run.ts';
import { evaluateSheetMeasurements } from '../relatorio/measurement-evaluation.ts';
import { cellAddressesOf, evaluatedCells, evaluateSheetReadings } from '../relatorio/reading-evaluation.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import { emptySheet, type BlockRow, type EquipmentTypeRow } from '../schemas/entities.ts';
import { compareCriterion, formatCriterionValue, nominalBounds } from '../seed/criteria.ts';
import { asBlockDefinition } from './block-definition.ts';
import { companyTypeDefinitionSchema, COMPANY_CRITERION_OPERATORS, criterionRulesFor, type CompanyTypeDefinition } from './definition.ts';
import { CRITERION_RULE_WORDS, draftCriterionText, updateDraftCriterion } from './draft-edit.ts';
import { duplicateSeededType } from './duplicate.ts';
import { validateTypeDraft } from './validate.ts';

/*
 * Story 24.18 ("24.18-UNIT", batch e24c): a company criteria row may take "nominal ± %", a nominal
 * value and a tolerance in percent above zero, judged as the range it gives, both ends within, by
 * the code that judges `between`. The schema's refusal matrix, the judgement at each bound, the text,
 * `criterionRulesFor` and the draft edits. Values invented (a 220 V supply).
 */

const source = { name: 'Manual do fabricante', edition: null };
const TYPE_ID = '019a5c00-0000-7000-8000-00000000e241';
const VERSION_ID = '019a5c00-0000-7000-8000-00000000e242';

/** DEFINITION_1 with one measurement row in V whose criterion is 220 V ± 5 %. */
function nominalDefinition(criterion: Record<string, unknown> = { operator: 'nominal_pct', value: 220, tolerance_pct: 5 }): CompanyTypeDefinition {
  const base = structuredClone(DEFINITION_1);
  return {
    ...base,
    measurement_tests: [
      {
        ...base.measurement_tests![0]!,
        columns: [{ key: 'valor', label: 'Valor medido', kind: 'number', unit: 'V' }],
        rows: [{ key: 'alimentacao', label: 'Tensão de alimentação' }],
        criteria: [{ type: 'absolute', seeded: 'alimentacao', rows: ['alimentacao'], source }],
      },
    ],
    criteria: [base.criteria[0]!, { key: 'alimentacao', label: 'Tensão de alimentação', unit: 'V', type: 'deviation_between', source, ...criterion } as CompanyTypeDefinition['criteria'][number]],
  };
}

/** The same row as `entre 209 e 231 V`, the range the nominal gives. */
const betweenDefinition = () => nominalDefinition({ operator: 'between', value: 209, value_max: 231 });

const versionRow = (definition: CompanyTypeDefinition) => ({ id: VERSION_ID, type_id: TYPE_ID, version: 1, definition });

/** A sheet cell as the fold stores it. */
const stored = (value: unknown) => ({ value, source_suggestion_id: null, op_id: '019a5c00-0001-7000-8000-00000000e250' });

/** A block of the type with one reading in the measurement row. */
function blockWith(cell: { raw: string; unit: string; state: 'measured' | 'over_range' }): BlockRow {
  const sheet = emptySheet();
  sheet.test.tensoes_medidas = { cells: { '0': { '0': stored(cell) } } } as never;
  return {
    id: '019a5c00-0000-7000-8000-00000000e243',
    relatorio_id: '019a5c00-0000-7000-8000-00000000e244',
    location_id: '019a5c00-0000-7000-8000-00000000e245',
    equipment_id: '019a5c00-0000-7000-8000-00000000e246',
    block_type: companyBlockType(TYPE_ID),
    config: { block_type: companyBlockType(TYPE_ID), sub_blocks: Object.fromEntries(['nameplate', 'checklist', 'isolacao', 'tensoes_medidas', 'observations', 'conclusion'].map((key) => [key, { enabled: true }])), na_defaults: [], type_version: 1, type_version_id: VERSION_ID },
    seed_version: 'v13',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    concluded_at: null,
    removed_at: null,
    sheet,
  } as unknown as BlockRow;
}

function cellOf(definition: CompanyTypeDefinition, cell: { raw: string; unit: string; state: 'measured' | 'over_range' }) {
  const [test] = evaluateSheetMeasurements(blockWith(cell), asBlockDefinition(versionRow(definition)));
  return test!.rows[0]!.cells[0]!;
}

describe('24.18-UNIT: the schema', () => {
  it('takes "nominal ± %" after "entre" with a tolerance above zero, and the definition publishes', () => {
    expect(COMPANY_CRITERION_OPERATORS).toEqual(['>', '<', '>=', '<=', 'between', 'nominal_pct', '±', 'pass_fail']);
    expect(companyTypeDefinitionSchema.safeParse(nominalDefinition()).success).toBe(true);
    expect(validateTypeDraft(nominalDefinition())).toEqual([]);
  });

  it('refuses a tolerance of zero, empty, negative or not a number, a missing nominal, a maximum, and a tolerance on another rule: one issue naming the row and the field, on Critérios', () => {
    const at = (criterion: Record<string, unknown>) => validateTypeDraft(nominalDefinition(criterion));
    const one = (criterion: Record<string, unknown>, leaf: string, message: string) => {
      const issues = at(criterion);
      expect(issues, message).toHaveLength(1);
      expect(issues[0]).toMatchObject({ path: ['criteria', 1, leaf], part: 'criterios', message });
      expect(companyTypeDefinitionSchema.safeParse(nominalDefinition(criterion)).success).toBe(false);
    };
    one({ operator: 'nominal_pct', value: 220, tolerance_pct: 0 }, 'tolerance_pct', 'Tensão de alimentação: a tolerância (%) precisa ser maior que zero.');
    one({ operator: 'nominal_pct', value: 220, tolerance_pct: -5 }, 'tolerance_pct', 'Tensão de alimentação: a tolerância (%) precisa ser maior que zero.');
    one({ operator: 'nominal_pct', value: 220 }, 'tolerance_pct', 'Tensão de alimentação: informe a tolerância (%).');
    one({ operator: 'nominal_pct', value: 220, tolerance_pct: Number.NaN }, 'tolerance_pct', 'Tensão de alimentação: informe a tolerância (%).');
    one({ operator: 'nominal_pct', tolerance_pct: 5 }, 'value', 'Tensão de alimentação: informe o valor nominal.');
    one({ operator: 'nominal_pct', value: 220, tolerance_pct: 5, value_max: 231 }, 'value_max', 'Tensão de alimentação: só a regra "entre" tem valor máximo.');
    one({ operator: 'between', value: 209, value_max: 231, tolerance_pct: 5 }, 'tolerance_pct', 'Tensão de alimentação: só a regra "nominal ± %" tem tolerância.');
    expect(at({ operator: 'nominal_pct', value: 220, tolerance_pct: 0 })[0]!.summary).toBe('Critérios › Tensão de alimentação com tolerância zero ou negativa');
    expect(at({ operator: 'nominal_pct', value: 220 })[0]!.summary).toBe('Critérios › Tensão de alimentação sem tolerância');
  });

  it('is offered wherever "entre" is and never on the ratio deviation, which keeps ±; the strict schema refuses it there and the fold refuses the version', () => {
    const ratio = duplicateSeededType('v12', 'tc').draft;
    const ratioKey = ratio.tests.find((test) => test.key === 'relacao_transformacao')!.criterion_key;
    expect(criterionRulesFor(nominalDefinition(), 'alimentacao')).toEqual(['>', '<', '>=', '<=', 'between', 'nominal_pct']);
    expect(criterionRulesFor(DEFINITION_1, 'isolacao')).toContain('nominal_pct');
    expect(criterionRulesFor(ratio, ratioKey)).toEqual(['>', '<', '>=', '<=', 'between', '±']);
    expect(criterionRulesFor(null, 'x')).toContain('nominal_pct');
    const onRatio: CompanyTypeDefinition = {
      ...ratio,
      criteria: ratio.criteria.map((criterion) => (criterion.key === ratioKey ? { ...criterion, operator: 'nominal_pct' as const, value: 1, tolerance_pct: 0.5 } : criterion)),
    };
    const index = onRatio.criteria.findIndex((criterion) => criterion.key === ratioKey);
    expect(validateTypeDraft(onRatio)).toEqual([
      {
        path: ['criteria', index, 'operator'],
        part: 'criterios',
        message: `${onRatio.criteria[index]!.label}: a regra "nominal ± %" julga uma leitura, não o desvio da relação de transformação; escolha outra regra.`,
        summary: `Critérios › ${onRatio.criteria[index]!.label} com regra nominal ± %`,
      },
    ]);
    const type: EquipmentTypeRow = { id: TYPE_ID, derived_from: null, draft: null, retired_at: null, removed_at: null, latest_version: 0 };
    const state: EntityState = new Map([[entityKey('equipment_type', TYPE_ID), type]]);
    const valid = makeOp(
      {
        kind: 'create',
        scope: 'company',
        company_id: '019a5c00-0000-7000-8000-00000000e247',
        project_id: null,
        relatorio_id: null,
        path: `equipment_type_version/${VERSION_ID}`,
        value: { id: VERSION_ID, type_id: TYPE_ID, version: 1, definition: nominalDefinition(), published_by: '019a5c00-0000-7000-8000-00000000e248', published_at: '2026-11-11T10:00:00.000Z' },
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: '019a5c00-0000-7000-8000-00000000e248',
        device_id: 'tablet-a',
      },
      { newId: () => '019a5c00-0001-7000-8000-00000000e249', now: new Date('2026-11-11T10:00:00.000Z') },
    );
    // Built valid and then given the definition: `opSchema` would refuse one the strict schema refuses.
    const publish = (definition: CompanyTypeDefinition) => ({ ...valid, value: { ...(valid.value as object), definition } as typeof valid.value });
    expect(() => applyOp(state, publish(onRatio))).toThrow(/nominal ± %/);
    expect(applyOp(state, publish(nominalDefinition())).get(entityKey('equipment_type_version', VERSION_ID))).toBeDefined();
  });
});

describe('24.18-UNIT: the judgement and the text', () => {
  it('writes "220 V ±5 %" (B-9 open), with a comma for decimals and without a unit when the row has none', () => {
    expect(formatCriterionValue({ operator: 'nominal_pct', value: 220, tolerance_pct: 5, unit: 'V' })).toBe('220 V ±5 %');
    expect(formatCriterionValue({ operator: 'nominal_pct', value: 13.8, tolerance_pct: 2.5, unit: 'kV' })).toBe('13,8 kV ±2,5 %');
    expect(formatCriterionValue({ operator: 'nominal_pct', value: 220, tolerance_pct: 5, unit: null })).toBe('220 ±5 %');
    expect(CRITERION_RULE_WORDS.nominal_pct).toBe('nominal ± %');
  });

  it('gives the range exact to 12 significant digits, ordered for a negative nominal', () => {
    expect(nominalBounds(220, 5)).toEqual({ min: 209, max: 231 });
    expect(nominalBounds(13.8, 5)).toEqual({ min: 13.11, max: 14.49 });
    expect(nominalBounds(-220, 5)).toEqual({ min: -231, max: -209 });
    expect(nominalBounds(125, 10)).toEqual({ min: 112.5, max: 137.5 });
  });

  it('judges both ends within, one step outside out, across Ω units', () => {
    const c = { operator: 'nominal_pct', value: 220, tolerance_pct: 5, unit: 'V' };
    for (const [value, within] of [[209, true], [231, true], [209.1, true], [230.9, true], [208.9, false], [231.1, false], [220, true]] as const) {
      expect(compareCriterion({ value, unit: 'V' }, c), String(value)).toBe(within);
    }
    expect(compareCriterion({ value: 13.11, unit: 'kV' }, { operator: 'nominal_pct', value: 13.8, tolerance_pct: 5, unit: 'kV' })).toBe(true);
    expect(compareCriterion({ value: 14.49, unit: 'kV' }, { operator: 'nominal_pct', value: 13.8, tolerance_pct: 5, unit: 'kV' })).toBe(true);
    expect(compareCriterion({ value: 14.4901, unit: 'kV' }, { operator: 'nominal_pct', value: 13.8, tolerance_pct: 5, unit: 'kV' })).toBe(false);
    // 0,095 GΩ is 95 MΩ, inside 100 MΩ ± 10 %; 0,111 GΩ is 111 MΩ, outside.
    expect(compareCriterion({ value: 0.095, unit: 'GΩ' }, { operator: 'nominal_pct', value: 100, tolerance_pct: 10, unit: 'MΩ' })).toBe(true);
    expect(compareCriterion({ value: 0.111, unit: 'GΩ' }, { operator: 'nominal_pct', value: 100, tolerance_pct: 10, unit: 'MΩ' })).toBe(false);
    expect(() => compareCriterion({ value: 220, unit: 'V' }, { operator: 'nominal_pct', value: 220, unit: 'V' })).toThrow();
  });

  it('reads as a range row with its own text for every reader', () => {
    const definition = asBlockDefinition(versionRow(nominalDefinition()));
    const criterion = definition.measurement_tests![0]!.criteria[0]!;
    expect(criterion).toMatchObject({ seeded_criterion: { operator: 'between', value: 209, value_max: 231, unit: 'V', text: '220 V ±5 %' } });
    expect(JSON.stringify(definition)).not.toContain('tolerance_pct');
    expect(formatCriterionValue(definition.criteria!.find((row) => row.key === 'alimentacao')!)).toBe('220 V ±5 %');
  });

  it('judges 209 V and 231 V within and 208,9 V and 231,1 V out, each helper naming "220 V ±5 %", as the range row judges them', () => {
    for (const [raw, verdict] of [['209', 'within'], ['231', 'within'], ['208.9', 'out'], ['231.1', 'out']] as const) {
      const cell = cellOf(nominalDefinition(), { raw, unit: 'V', state: 'measured' });
      expect(cell.verdict, raw).toBe(verdict);
      const range = cellOf(betweenDefinition(), { raw, unit: 'V', state: 'measured' });
      expect(cell.verdict, raw).toBe(range.verdict);
      expect(cell.excess, raw).toBe(range.excess);
      if (verdict === 'out') {
        expect(cell.criterionText).toBe('220 V ±5 %');
        expect(cell.helperText).toContain('220 V ±5 %');
        expect(cell.helperText).toBe(range.helperText!.replace('entre 209 e 231 V', '220 V ±5 %'));
      }
    }
  });

  it('judges a reading above the instrument\'s limit as the range row does', () => {
    const cell = cellOf(nominalDefinition(), { raw: '250', unit: 'V', state: 'over_range' });
    const range = cellOf(betweenDefinition(), { raw: '250', unit: 'V', state: 'over_range' });
    // Fix batch e24x (C1): a limit above the upper end proves the reading out of the range.
    expect(cell.verdict).toBe('out');
    expect(cell.verdict).toBe(range.verdict);
    expect(cell.overRange).toEqual(range.overRange);
  });

  it('floors the ficha on an out reading as a range row out of its criterion does', () => {
    for (const raw of ['208.9', '231.1', '220']) {
      const nominal = effectiveConclusionPair(blockWith({ raw, unit: 'V', state: 'measured' }), asBlockDefinition(versionRow(nominalDefinition())));
      const range = effectiveConclusionPair(blockWith({ raw, unit: 'V', state: 'measured' }), asBlockDefinition({ ...versionRow(betweenDefinition()), id: `${VERSION_ID.slice(0, -1)}3` }));
      expect(nominal, raw).toEqual(range);
    }
  });

  it('judges a seeded-grammar reading (an insulation test) by the rule, its out helper naming the range', () => {
    const definition = structuredClone(DEFINITION_1);
    definition.criteria[0] = { ...definition.criteria[0]!, operator: 'nominal_pct', value: 500, tolerance_pct: 10, type: 'deviation_between' };
    expect(validateTypeDraft(definition)).toEqual([]);
    const block = asBlockDefinition({ id: VERSION_ID, type_id: TYPE_ID, version: 1, definition });
    const row = blockWith({ raw: '0', unit: 'V', state: 'measured' });
    const address = cellAddressesOf(block, 'isolacao', row)[0]!;
    const at = (raw: string) => {
      row.sheet.test.isolacao = { cells: { [String(address.row)]: { [String(address.col)]: stored({ raw, unit: 'MΩ', state: 'measured' }) } } } as never;
      return evaluatedCells(evaluateSheetReadings(row, block)).find((cell) => cell.address.row === address.row && cell.address.col === address.col)!;
    };
    expect(at('450').verdict).toBe('within');
    expect(at('550').verdict).toBe('within');
    expect(at('449').verdict).toBe('out');
    expect(at('449').helperText).toBe('Fora do aceitável (500 MΩ ±10 %)');
  });
});

/** DEFINITION_1 with its insulation row ruled 100 MΩ ±20 % (80 to 120 MΩ): a seeded-grammar test judged by a range. */
function insulationRangeType() {
  const definition = structuredClone(DEFINITION_1);
  definition.criteria[0] = { ...definition.criteria[0]!, operator: 'nominal_pct', value: 100, tolerance_pct: 20, type: 'deviation_between' };
  return asBlockDefinition({ id: VERSION_ID, type_id: TYPE_ID, version: 1, definition });
}

/** A sheet of `insulationRangeType` holding only the given insulation captures (the measurement table empty). */
function insulationSheet(definition: ReturnType<typeof insulationRangeType>, readings: readonly { raw: string; state: 'measured' | 'over_range' }[]): BlockRow {
  const row = blockWith({ raw: '0', unit: 'V', state: 'measured' });
  delete row.sheet.test.tensoes_medidas;
  const cells: Record<string, Record<string, unknown>> = {};
  readings.forEach((reading, n) => {
    const address = cellAddressesOf(definition, 'isolacao', row)[n]!;
    cells[String(address.row)] = { ...cells[String(address.row)], [String(address.col)]: stored({ raw: reading.raw, unit: 'MΩ', state: reading.state }) };
  });
  row.sheet.test.isolacao = { cells } as never;
  return row;
}

describe('e24x-UNIT C1 a reading above the instrument\'s limit on a range criterion', () => {
  const definitionOf = (definition: CompanyTypeDefinition) => asBlockDefinition(versionRow(definition));
  const TO_CHECK = 'valores medidos com leitura a conferir';
  const WITHIN = 'valores medidos dentro dos critérios de aceitação';

  it('a measurement row (220 V ±5 %, entre 209 e 231 V): a limit at or above the upper end is out, the floor fails the ficha and the paragraph names it', () => {
    for (const definition of [nominalDefinition(), betweenDefinition()]) {
      for (const raw of ['250', '231']) {
        const block = blockWith({ raw, unit: 'V', state: 'over_range' });
        const cell = cellOf(definition, { raw, unit: 'V', state: 'over_range' });
        expect(cell.verdict, raw).toBe('out');
        expect(conclusionFloor(block, definitionOf(definition))?.pair.result, raw).toBe('reprovado');
        expect(effectiveConclusionPair(block, definitionOf(definition)).result, raw).toBe('reprovado');
        const text = composeConclusion(block, definitionOf(definition), 'NB-01').text;
        expect(text, raw).toContain(`> ${raw} V`);
        expect(text, raw).not.toContain(WITHIN);
      }
    }
  });

  it('a measurement row: a limit inside the range (> 220 V) has no verdict, no floor, and the paragraph reads "a conferir"', () => {
    for (const definition of [nominalDefinition(), betweenDefinition()]) {
      const block = blockWith({ raw: '220', unit: 'V', state: 'over_range' });
      expect(cellOf(definition, { raw: '220', unit: 'V', state: 'over_range' }).verdict).toBeNull();
      expect(conclusionFloor(block, definitionOf(definition))).toBeNull();
      const text = composeConclusion(block, definitionOf(definition), 'NB-01').text;
      expect(text).toContain(TO_CHECK);
      expect(text).not.toContain(WITHIN);
    }
  });

  it('a seeded-grammar test (100 MΩ ±20 %): "> 200 MΩ" is out and fails the ficha; "> 100 MΩ" has no verdict, no floor and reads "a conferir"', () => {
    const definition = insulationRangeType();
    const out = insulationSheet(definition, [{ raw: '200', state: 'over_range' }]);
    expect(evaluatedCells(evaluateSheetReadings(out, definition)).find((cell) => cell.state === 'over_range')!.verdict).toBe('out');
    expect(conclusionFloor(out, definition)?.pair.result).toBe('reprovado');
    // The out clause names the limit as the instrument's ("acima de 200 MΩ (limite do instrumento)").
    expect(composeConclusion(out, definition, 'NB-01').text).toContain('acima de 200 MΩ (limite do instrumento)');
    expect(composeConclusion(out, definition, 'NB-01').text).not.toContain('dentro dos critérios');
    // At the upper end exactly: the true value is above it, so out.
    const atEnd = insulationSheet(definition, [{ raw: '120', state: 'over_range' }]);
    expect(evaluatedCells(evaluateSheetReadings(atEnd, definition)).find((cell) => cell.state === 'over_range')!.verdict).toBe('out');
    const inside = insulationSheet(definition, [{ raw: '100', state: 'over_range' }, { raw: '100', state: 'measured' }]);
    expect(evaluatedCells(evaluateSheetReadings(inside, definition)).find((cell) => cell.state === 'over_range')!.verdict).toBeNull();
    expect(conclusionFloor(inside, definition)).toBeNull();
    const text = composeConclusion(inside, definition, 'NB-01').text;
    expect(text).toContain(TO_CHECK);
    expect(text).not.toContain(WITHIN);
    // Alone, with no other capture judged, it still reads "a conferir", never "dentro dos critérios".
    const alone = insulationSheet(definition, [{ raw: '100', state: 'over_range' }]);
    expect(composeConclusion(alone, definition, 'NB-01').text).toContain(TO_CHECK);
  });
});

describe('e24x-UNIT C2 the worst reading of a range criterion is the one furthest outside its nearer end', () => {
  const worstOf = (readings: readonly string[]) => {
    const definition = insulationRangeType();
    const block = insulationSheet(definition, readings.map((raw) => ({ raw, state: 'measured' as const })));
    return worstReadings(evaluateSheetReadings(block, definition)).find((reading) => reading.testKey === 'isolacao')!;
  };

  it('20 MΩ (60 below the lower end of 80) is worse than 125 MΩ (5 above the upper end of 120)', () => {
    expect(worstOf(['20', '125'])).toMatchObject({ valueText: '20 MΩ', verdict: 'out' });
    expect(worstOf(['125', '20'])).toMatchObject({ valueText: '20 MΩ', verdict: 'out' });
    expect(worstOf(['78', '150'])).toMatchObject({ valueText: '150 MΩ', verdict: 'out' });
  });

  it('a reading inside the range ranks below any outside one; inside, the nearer an end the worse', () => {
    expect(worstOf(['100', '125'])).toMatchObject({ valueText: '125 MΩ', verdict: 'out' });
    expect(worstOf(['100', '85'])).toMatchObject({ valueText: '85 MΩ', verdict: 'within' });
    expect(worstOf(['118', '100'])).toMatchObject({ valueText: '118 MΩ', verdict: 'within' });
  });
});

describe('24.18-UNIT: the draft edits', () => {
  const draft = nominalDefinition({ operator: 'between', value: 198, value_max: 242 });

  it('a change to "nominal ± %" keeps the value as the nominal, drops the maximum and leaves the tolerance to be typed', () => {
    const next = updateDraftCriterion(draft, 1, { operator: 'nominal_pct' });
    expect(next.criteria![1]).toMatchObject({ operator: 'nominal_pct', value: 198, type: 'deviation_between' });
    expect(next.criteria![1]).not.toHaveProperty('value_max');
    expect(next.criteria![1]).not.toHaveProperty('tolerance_pct');
    expect(validateTypeDraft(next).map((issue) => issue.message)).toEqual(['Tensão de alimentação: informe a tolerância (%).']);
    const typed = updateDraftCriterion(updateDraftCriterion(next, 1, { value: 220 }), 1, { tolerance_pct: 5 });
    expect(typed.criteria![1]).toMatchObject({ operator: 'nominal_pct', value: 220, tolerance_pct: 5 });
    expect(validateTypeDraft(typed)).toEqual([]);
    expect(draftCriterionText(typed.criteria![1])).toBe('220 V ±5 %');
    expect(draftCriterionText(next.criteria![1])).toBeNull();
    expect(updateDraftCriterion(typed, 1, { tolerance_pct: null }).criteria![1]).not.toHaveProperty('tolerance_pct');
  });

  it('a change from "nominal ± %" to "entre" drops the tolerance and asks for the two bounds', () => {
    const nominal = nominalDefinition();
    const between = updateDraftCriterion(nominal, 1, { operator: 'between' });
    expect(between.criteria![1]).toMatchObject({ operator: 'between', value: 220 });
    expect(between.criteria![1]).not.toHaveProperty('tolerance_pct');
    expect(between.criteria![1]).not.toHaveProperty('value_max');
    expect(validateTypeDraft(between).map((issue) => issue.message)).toEqual(['Tensão de alimentação: informe o valor máximo.']);
    // Any other rule drops the tolerance too, and a tolerance typed on another rule is ignored.
    expect(updateDraftCriterion(nominal, 1, { operator: '>=' }).criteria![1]).not.toHaveProperty('tolerance_pct');
    expect(updateDraftCriterion(draft, 1, { tolerance_pct: 5 }).criteria![1]).not.toHaveProperty('tolerance_pct');
  });

  it('every type published before the rule evaluates as before: no row of DEFINITION_1 changes its reader shape', () => {
    const before = asBlockDefinition({ id: VERSION_ID, type_id: TYPE_ID, version: 1, definition: structuredClone(DEFINITION_1) });
    expect(before.criteria!.map((row) => row.text)).toEqual([undefined, undefined, undefined]);
    expect(before.criteria!.find((row) => row.key === 'tensao_saida')).toMatchObject({ operator: 'between', value: 118, value_max: 132 });
  });
});
