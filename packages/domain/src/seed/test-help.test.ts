import { describe, expect, it } from 'vitest';
import { TEXT_CAPS } from '../ops/value-limits.ts';
import { SEED_VERSIONS } from './definitions.ts';
import { measurementTestSchema } from './measurement.ts';
import { seedBundleSchema, testDefSchema } from './schema.ts';
import {
  recommendedPointText,
  TEST_HELP_KEYS,
  TEST_TEXT_MAX_LENGTH,
  testHelpEntries,
  testHelpMetaText,
  testHelpOf,
  testHelpSchema,
  testRecommendationOf,
  testRecommendationSchema,
  type TestHelp,
} from './test-help.ts';

/*
 * Batch e23h (Stories 23.10 and 23.11): the two optional text keys of a test definition. Every
 * text below is synthetic (M-1: the base's texts never enter git).
 */

const FULL: Required<TestHelp> = {
  objective: 'Objetivo de exemplo.',
  instrument: 'Instrumento de exemplo.',
  voltage: 'Tensão de exemplo.',
  connections: 'Ligações de exemplo.',
  procedure: 'Procedimento de exemplo.',
  criterion: 'Critério de exemplo.',
  standard: 'Norma de exemplo.',
  nr10: 'Pré-requisito de exemplo.',
};

describe('e23h-UNIT the help keys and the cap', () => {
  it('orders the eight headings as DESIGN.md does', () => {
    expect(TEST_HELP_KEYS).toEqual(['objective', 'instrument', 'voltage', 'connections', 'procedure', 'criterion', 'standard', 'nr10']);
  });

  it('caps a text at TEXT_CAPS.medium', () => {
    expect(TEST_TEXT_MAX_LENGTH).toBe(TEXT_CAPS.medium);
  });

  it('accepts a text at the cap and refuses one over it, a blank one and a non-string; an unknown heading is refused', () => {
    const atCap = 'a'.repeat(TEST_TEXT_MAX_LENGTH);
    expect(testHelpSchema.safeParse({ objective: atCap }).success).toBe(true);
    expect(testHelpSchema.safeParse({ objective: `${atCap}a` }).success).toBe(false);
    expect(testHelpSchema.safeParse({ objective: '' }).success).toBe(false);
    expect(testHelpSchema.safeParse({ objective: '   \n' }).success).toBe(false);
    expect(testHelpSchema.safeParse({ objective: 3 }).success).toBe(false);
    expect(testHelpSchema.safeParse({ outro: 'texto' }).success).toBe(false);
    expect(testHelpSchema.safeParse({}).success).toBe(true);
    expect(testRecommendationSchema.safeParse(atCap).success).toBe(true);
    expect(testRecommendationSchema.safeParse(`${atCap}a`).success).toBe(false);
    expect(testRecommendationSchema.safeParse(' ').success).toBe(false);
  });

  it('keeps a text as written (never trimmed)', () => {
    expect(testHelpSchema.parse({ objective: '  Verificar.  ' })).toEqual({ objective: '  Verificar.  ' });
  });

  it('a seeded test and a measurement test both take the two keys', () => {
    const blocks = Object.values(SEED_VERSIONS.v13!.report_types.cabine_primaria.blocks);
    const seeded = blocks.find((block) => block.tests.length > 0)!.tests[0]!;
    expect(testDefSchema.safeParse({ ...seeded, help: { objective: 'Texto.' }, recommendation: 'Agir.' }).success).toBe(true);
    expect(testDefSchema.safeParse({ ...seeded, help: { objective: 'a'.repeat(TEST_TEXT_MAX_LENGTH + 1) } }).success).toBe(false);
    const measured = blocks.find((block) => (block.measurement_tests ?? []).length > 0)!.measurement_tests![0]!;
    expect(measurementTestSchema.safeParse({ ...measured, help: { procedure: 'Texto.' }, recommendation: 'Agir.' }).success).toBe(true);
    expect(measurementTestSchema.safeParse({ ...measured, recommendation: 'a'.repeat(TEST_TEXT_MAX_LENGTH + 1) }).success).toBe(false);
  });

  it('seeds v1 to v13 carry neither key and parse to the bytes they are served with', () => {
    for (const [version, bundle] of Object.entries(SEED_VERSIONS)) {
      for (const block of Object.values(bundle.report_types.cabine_primaria.blocks)) {
        for (const test of [...block.tests, ...(block.measurement_tests ?? [])]) {
          expect('help' in test, `${version} ${block.block_type} ${test.key}`).toBe(false);
          expect('recommendation' in test, `${version} ${block.block_type} ${test.key}`).toBe(false);
        }
      }
      const json = JSON.stringify(bundle);
      expect(JSON.stringify(seedBundleSchema.parse(JSON.parse(json))), version).toBe(json);
    }
  });
});

describe('e23h-UNIT the helpers', () => {
  it('lists only the filled headings, in the fixed order', () => {
    const help: TestHelp = { nr10: 'D', objective: 'A', procedure: 'C', instrument: 'B', criterion: '  ' };
    expect(testHelpEntries(help)).toEqual([
      { key: 'objective', text: 'A' },
      { key: 'instrument', text: 'B' },
      { key: 'procedure', text: 'C' },
      { key: 'nr10', text: 'D' },
    ]);
    expect(testHelpEntries(FULL).map((entry) => entry.key)).toEqual([...TEST_HELP_KEYS]);
    expect(testHelpEntries(null)).toEqual([]);
  });

  it('finds a test\'s help in tests then measurement tests; null without a filled heading', () => {
    const definition = {
      tests: [{ key: 'isolacao', help: { objective: 'A' }, recommendation: 'Trocar.' }, { key: 'resistencia_contato', help: {} }],
      measurement_tests: [{ key: 'tensoes', help: FULL }, { key: 'vazio' }],
    };
    expect(testHelpOf(definition, 'isolacao')).toEqual({ objective: 'A' });
    expect(testHelpOf(definition, 'resistencia_contato')).toBeNull();
    expect(testHelpOf(definition, 'tensoes')).toEqual(FULL);
    expect(testHelpOf(definition, 'vazio')).toBeNull();
    expect(testHelpOf(definition, 'nenhum')).toBeNull();
    expect(testRecommendationOf(definition, 'isolacao')).toBe('Trocar.');
    expect(testRecommendationOf(definition, 'tensoes')).toBeNull();
  });

  it('the meta line: with the count below eight, without it at eight', () => {
    expect(testHelpMetaText('Transformador de força', 5)).toBe('Do tipo Transformador de força · abre sem conexão · não sai no relatório · 5 de 8 tópicos preenchidos');
    expect(testHelpMetaText('Transformador de força', 8)).toBe('Do tipo Transformador de força · abre sem conexão · não sai no relatório');
    expect(testHelpMetaText('No-break', 1)).toBe('Do tipo No-break · abre sem conexão · não sai no relatório · 1 de 8 tópicos preenchidos');
  });

  it('the recommended point text: a period appended unless the recommendation ends in one, "!" or "?"; the composed text alone without one', () => {
    const composed = 'Tensões medidas: 250 Vca em Tensão de entrada (critério: entre 198 e 242 Vca)';
    expect(recommendedPointText('Verificar o carregador', composed)).toBe(`Verificar o carregador. ${composed}`);
    expect(recommendedPointText('Verificar o carregador.', composed)).toBe(`Verificar o carregador. ${composed}`);
    expect(recommendedPointText('Verificar já!', composed)).toBe(`Verificar já! ${composed}`);
    expect(recommendedPointText('Trocar?', composed)).toBe(`Trocar? ${composed}`);
    expect(recommendedPointText('  Verificar  ', composed)).toBe(`Verificar. ${composed}`);
    expect(recommendedPointText(null, composed)).toBe(composed);
    expect(recommendedPointText('  ', composed)).toBe(composed);
  });
});
