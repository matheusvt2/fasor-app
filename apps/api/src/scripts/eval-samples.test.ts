import { describe, expect, it } from 'vitest';
import { fieldsOf, partitionSamples, SYNTHETIC, unknownKeys, type Sample } from './eval-samples.ts';

/*
 * Fix batch e23z (item 6): the paid eval's synthetic set resolves against each sample's seed, and a sample whose
 * expected keys its seed's fields lack is skipped with one line while the others still run. No AWS call: only the
 * samples and the kernel's definitions are read.
 */

describe('e23z eval samples (bedrock-eval)', () => {
  it('every synthetic sample resolves against its seed: no expected key outside its fields', () => {
    for (const sample of SYNTHETIC) expect(unknownKeys(sample), sample.name).toEqual([]);
    expect(partitionSamples(SYNTHETIC)).toEqual({ runnable: SYNTHETIC, skipped: [] });
  });

  it('the oil plate is scored on seed v12, whose nameplate has TIPO DO ÓLEO', () => {
    const oil = SYNTHETIC.find((sample) => sample.name.startsWith('plate-transformador-oleo'))!;
    expect(oil.expected.seed_version).toBe('v12');
    expect(fieldsOf(oil.expected).some((field) => field.key === 'tipo_do_oleo')).toBe(true);
  });

  it('a fabricated sample with a key its seed lacks is skipped with one line; the good ones remain, in order', () => {
    const bad: Sample = { name: 'bad (fabricated)', path: '/nowhere.png', expected: { kind: 'plate', block_type: 'transformador_forca', seed_version: 'v13', values: { tipo_do_oleo: 'B' } } };
    const unknownType: Sample = { name: 'no type (fabricated)', path: '/nowhere.png', expected: { kind: 'plate', block_type: 'no_such_type', values: {} } };
    const { runnable, skipped } = partitionSamples([SYNTHETIC[0]!, bad, unknownType, SYNTHETIC[1]!]);
    expect(runnable).toEqual([SYNTHETIC[0], SYNTHETIC[1]]);
    expect(skipped).toHaveLength(2);
    expect(skipped[0]).toMatch(/^skipped bad \(fabricated\): expected key\(s\) tipo_do_oleo not in the transformador_forca nameplate of seed v13 \(/);
    expect(skipped[1]).toMatch(/^skipped no type \(fabricated\): /);
  });
});
