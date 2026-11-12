import { describe, expect, it } from 'vitest';
import { equipmentTypesOf, getDefinition, SEED_VERSIONS } from '../seed/definitions.ts';
import type { BlockDefinition, TestDef } from '../seed/schema.ts';
import { plateCelsiusOf, plateTemperatureFields } from './plate-temperature.ts';

/*
 * Fix batch e25r (R-1 and E24-A1 item 2 of the Epic 24 retrospective): the one parse of a plate
 * temperature the sheet, the issue's `plate_measured` and the next visit's "like with like" rule share,
 * and the plate fields a definition reads a temperature from.
 */

const measured = (raw: unknown, state: unknown = 'measured') => ({ raw, unit: '°C', state });

describe('e25r-R1-UNIT-PARSE plateCelsiusOf: a plate temperature counts only as a finite number', () => {
  it.each([
    ['0', 0],
    ['40', 40],
    ['-5', -5],
    ['27.5', 27.5],
    ['-0.5', -0.5],
    ['110', 110],
  ])('a measured "%s" reads %s °C', (raw, celsius) => {
    expect(plateCelsiusOf(measured(raw))).toBe(celsius);
  });

  it.each([['abc'], [''], ['1e5'], ['NaN'], ['Infinity'], [' 40'], ['40 '], ['40,5'], ['+40'], ['40.'], ['.5'], ['- 5']])('a measured "%s" is no temperature', (raw) => {
    expect(plateCelsiusOf(measured(raw))).toBeNull();
  });

  it('a digit run too long to be a finite number is none', () => {
    expect(plateCelsiusOf(measured('9'.repeat(400)))).toBeNull();
  });

  it('a state other than measured, a raw that is no string, an array, null, undefined, a bare number or string are none', () => {
    for (const value of [measured('40', 'not_measured'), measured('40', 'over_range'), measured('40', 'not_applicable'), measured('40', undefined), measured(40), measured(null), [measured('40')], null, undefined, 40, '40', { raw: '40' }]) {
      expect(plateCelsiusOf(value), JSON.stringify(value) ?? 'undefined').toBeNull();
    }
  });
});

describe('e25r-R1-UNIT-FIELDS plateTemperatureFields: the plate fields a definition reads a temperature from', () => {
  it('the v13 and v14 transformer: TEMPERATURA DO ENROLAMENTO and DO ÓLEO, sorted, once (the insulation and the winding name both)', () => {
    for (const version of ['v13', 'v14']) {
      expect(plateTemperatureFields(getDefinition(version, 'cabine_primaria', 'transformador_forca')), version).toEqual(['temperatura_enrolamento_c', 'temperatura_oleo_c']);
    }
  });

  it('on v13 and v14 no other type names one (the disjuntor and the seccionadora take the solid factor at the cabine\'s ambient)', () => {
    for (const version of ['v13', 'v14']) {
      for (const type of equipmentTypesOf(version).filter((one) => one !== 'transformador_forca')) {
        expect(plateTemperatureFields(getDefinition(version, 'cabine_primaria', type)), `${version} ${type}`).toEqual([]);
      }
    }
  });

  it('no definition of v1 to v12 names one, so its entries keep their bytes', () => {
    const older = Object.keys(SEED_VERSIONS).filter((version) => Number(version.slice(1)) <= 12);
    expect(older.length).toBe(12);
    for (const version of older) {
      for (const type of equipmentTypesOf(version)) expect(plateTemperatureFields(getDefinition(version, 'cabine_primaria', type)), `${version} ${type}`).toEqual([]);
    }
  });

  it('reads each correction\'s oil and dry fields where they are named, a field named twice once', () => {
    const transformer = getDefinition('v14', 'cabine_primaria', 'transformador_forca');
    const insulation = transformer.tests.find((test) => test.key === 'isolacao')!;
    const onlyOil: TestDef = { ...insulation, temperature_correction: { to_c: 20, medium: 'oil_rule', oil_field: 'oleo_a' } };
    const solid: TestDef = { ...insulation, temperature_correction: { to_c: 20, medium: 'solid' } };
    const winding = transformer.measurement_tests!.find((test) => test.key === 'resistencia_enrolamento')!;
    const definition: Pick<BlockDefinition, 'tests' | 'measurement_tests'> = {
      tests: [onlyOil, solid],
      measurement_tests: [{ ...winding, winding_correction: { to_c: 75, material_field: 'material_enrolamento', dry_field: 'enrolamento_b' } }, { ...winding, key: 'outra', winding_correction: { to_c: 75, material_field: 'material_enrolamento', oil_field: 'oleo_a' } }],
    };
    expect(plateTemperatureFields(definition)).toEqual(['enrolamento_b', 'oleo_a']);
    expect(plateTemperatureFields({ tests: [solid] })).toEqual([]);
  });
});
