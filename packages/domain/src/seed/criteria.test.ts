import { describe, expect, it } from 'vitest';
import { compareCriterion, criterionSeedSchema, formatCriterionValue, SEEDED_CRITERIA } from './criteria.ts';

const isolacao = SEEDED_CRITERIA.find((c) => c.key === 'isolacao')!;
const resistenciaContato = SEEDED_CRITERIA.find((c) => c.key === 'resistencia_contato')!;
const relacaoTransformacao = SEEDED_CRITERIA.find((c) => c.key === 'relacao_transformacao')!;

describe('SEEDED_CRITERIA', () => {
  it('has the three FO.SERV-03 criteria, each sourced "aceitável na ficha"', () => {
    expect(SEEDED_CRITERIA).toHaveLength(3);
    for (const c of SEEDED_CRITERIA) expect(c.source).toEqual({ name: 'aceitável na ficha', edition: null });
  });

  it('rejects a seed row missing operator, type or source', () => {
    const invalid = { key: 'x', label: 'X', value: 1, unit: null };
    expect(() => criterionSeedSchema.parse(invalid)).toThrow();
  });
});

describe('formatCriterionValue', () => {
  it('formats the operator, pt-BR decimal comma, and a space before the unit', () => {
    expect(formatCriterionValue(isolacao)).toBe('>400 MΩ');
    expect(formatCriterionValue(resistenciaContato)).toBe('<250 µΩ');
    expect(formatCriterionValue(relacaoTransformacao)).toBe('±0,5 %');
  });
});

describe('compareCriterion', () => {
  it('scales GΩ into MΩ before comparing (147 GΩ vs >400 MΩ passes)', () => {
    expect(compareCriterion({ value: 147, unit: 'GΩ' }, isolacao)).toBe(true);
  });

  it('fails at the µΩ boundary (251 µΩ vs <250 µΩ)', () => {
    expect(compareCriterion({ value: 251, unit: 'µΩ' }, resistenciaContato)).toBe(false);
  });

  it('passes just under the µΩ boundary', () => {
    expect(compareCriterion({ value: 249, unit: 'µΩ' }, resistenciaContato)).toBe(true);
  });

  it('checks a ± deviation without unit scaling', () => {
    expect(compareCriterion({ value: 0.4, unit: '%' }, relacaoTransformacao)).toBe(true);
    expect(compareCriterion({ value: -0.4, unit: '%' }, relacaoTransformacao)).toBe(true);
    expect(compareCriterion({ value: 0.6, unit: '%' }, relacaoTransformacao)).toBe(false);
  });

  it('compares directly when units already match', () => {
    expect(compareCriterion({ value: 500, unit: 'MΩ' }, isolacao)).toBe(true);
    expect(compareCriterion({ value: 300, unit: 'MΩ' }, isolacao)).toBe(false);
  });

  it('throws instead of silently comparing raw numbers when the measured unit is unitless but the criterion is not', () => {
    expect(() => compareCriterion({ value: 500, unit: null }, isolacao)).toThrow(/incompatible units/);
  });

  it('throws when the measured unit is outside the Ω scale table', () => {
    expect(() => compareCriterion({ value: 500, unit: 'A' }, isolacao)).toThrow(/incompatible units/);
  });
});
