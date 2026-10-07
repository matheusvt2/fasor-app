import { describe, expect, it } from 'vitest';
import { registryRowSchema } from '../schemas/entities.ts';
import { parseVoltageClassKv, wordRegistryRowText } from '../registry/word-row.ts';
import { SEEDED_VOLTAGE_CLASSES, seededVoltageClassRow } from './voltage-classes.ts';

describe('F-09 (D4) the seeded voltage classes', () => {
  it('are 13,8 · 15 · 24,2 · 36,2 kV, stored as the kV number the Classes de tensão form stores', () => {
    expect(SEEDED_VOLTAGE_CLASSES).toEqual(['13,8', '15', '24,2', '36,2']);
    for (const name of SEEDED_VOLTAGE_CLASSES) expect(parseVoltageClassKv(name)).toBe(name);
  });

  it('build schema-valid voltage_class rows that read with their unit', () => {
    const row = seededVoltageClassRow('019966b0-0f09-7000-8000-000000000001', '13,8');
    expect(registryRowSchema.parse(row)).toEqual(row);
    expect(wordRegistryRowText(row)).toEqual({ primary: '13,8 kV' });
  });
});
