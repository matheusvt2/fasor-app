import { describe, expect, it } from 'vitest';
import { normalizeReadingValue } from '../reading/value.ts';
import type { BlockRow, Cell, EquipmentRow, JsonValue } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { testApplicability } from './applicability.ts';
import { drySubtypeOfInsulation, isDryBlock, isNameplateFieldExcused } from './dry-insulation.ts';
import { lastNameplateCopy, nameplateCopyFields } from './nameplate-copy.ts';
import { isOilUnit, oilDerivedNaKeys, oilFieldExcusedReason } from './oil-rule.ts';
import { mediumOf } from './temperature-correction.ts';

/*
 * 25.19-UNIT, the readers (Story 25.19, the "A SECO" half, seed v16): every reader of the dry option of TIPO DE
 * ISOLAÇÃO on the transformer, the TP and the TC reads "A SECO" and its alias "Á SECO" as the dry option, and gives
 * on v16 what "Á SECO" gives on v15: the copy from the last visit and "Igual à", the oil state and the oil items NA
 * (`oilStateOf`), the medium of the temperature correction (`mediumOf`), the dry subtype (`dry-insulation.ts`), a
 * plate reading, the oil sampling's condition and the reason under an oil field. The oil option is not touched
 * (question B-4). Values invented.
 */

const TYPES = ['transformador_forca', 'tp', 'tc'] as const;
type Type = (typeof TYPES)[number];

const cell = (value: JsonValue): Cell => ({ value, source_suggestion_id: null, op_id: '019a6100-0000-7000-8000-000000000001' });

/** A sheet of `type` on `version` whose TIPO DE ISOLAÇÃO stores `insulation` (nothing else filled, no subtype). */
function block(version: string, type: Type, insulation: string | null): Pick<BlockRow, 'seed_version' | 'block_type' | 'config' | 'sheet'> {
  return {
    seed_version: version,
    block_type: type,
    config: { sub_blocks: {} } as unknown as BlockRow['config'],
    sheet: { nameplate: insulation === null ? {} : { tipo_de_isolacao: cell(insulation) }, checklist: {}, test: {}, conclusion: {}, observations: null } as unknown as BlockRow['sheet'],
  };
}

describe('25.19-UNIT the readers of the dry option on v16 read "A SECO" and "Á SECO" as v15 reads "Á SECO"', () => {
  it.each(TYPES)('%s: "Copiar da última visita" of a v15 (and a v13) visit that stored "Á SECO" writes "A SECO"', (type) => {
    const definition = getDefinition('v16', 'cabine_primaria', type);
    for (const visit of ['Á SECO', 'á seco', 'A SECO']) {
      const equipment: Pick<EquipmentRow, 'last_nameplate'> = { last_nameplate: { fields: { tipo_de_isolacao: visit } } as unknown as EquipmentRow['last_nameplate'] };
      expect(lastNameplateCopy(equipment, definition).find((one) => one.fieldKey === 'tipo_de_isolacao')?.value, visit).toBe('A SECO');
    }
    // On v15 the same visit lands on "Á SECO", as before.
    const equipment = { last_nameplate: { fields: { tipo_de_isolacao: 'Á SECO' } } } as unknown as Pick<EquipmentRow, 'last_nameplate'>;
    expect(lastNameplateCopy(equipment, getDefinition('v15', 'cabine_primaria', type)).find((one) => one.fieldKey === 'tipo_de_isolacao')?.value).toBe('Á SECO');
  });

  it.each(TYPES)('%s: "Igual à" from a v15 sheet holding "Á SECO" writes "A SECO" on a v16 sheet', (type) => {
    const source = block('v15', type, 'Á SECO') as BlockRow;
    expect(nameplateCopyFields(source, getDefinition('v16', 'cabine_primaria', type)).find((one) => one.fieldKey === 'tipo_de_isolacao')?.value).toBe('A SECO');
  });

  it.each(TYPES)('%s: the oil state, the oil items NA and the dry block read "A SECO" (and a stored "Á SECO") as v15 reads "Á SECO"', (type) => {
    const ctx = EMPTY_DEFINITION_CONTEXT;
    const v15 = block('v15', type, 'Á SECO');
    for (const value of ['A SECO', 'Á SECO']) {
      const v16 = block('v16', type, value);
      expect(isOilUnit(v16, ctx), value).toBe(false);
      expect(isOilUnit(v16, ctx)).toBe(isOilUnit(v15, ctx));
      expect([...oilDerivedNaKeys(v16, ctx)].sort(), value).toEqual([...oilDerivedNaKeys(v15, ctx)].sort());
      expect([...oilDerivedNaKeys(v16, ctx)].length).toBeGreaterThan(0);
      expect(isDryBlock(v16, ctx), value).toBe(true);
      for (const field of getDefinition('v16', 'cabine_primaria', type).oil_rule!.fields) {
        expect(isNameplateFieldExcused(v16, field, ctx), `${value} ${field}`).toBe(isNameplateFieldExcused(v15, field, ctx));
      }
    }
    // The oil option still reads oil (its name is v15's, B-4 open).
    const oil = getDefinition('v16', 'cabine_primaria', type).oil_rule!.oil_values[0]!;
    expect(isOilUnit(block('v16', type, oil), ctx)).toBe(true);
  });

  it.each(TYPES)('%s: the temperature correction\'s medium is dry for "A SECO" and "Á SECO", oil for the oil option, as on v15', (type) => {
    const v16 = getDefinition('v16', 'cabine_primaria', type);
    const v15 = getDefinition('v15', 'cabine_primaria', type);
    expect(mediumOf(v16, block('v16', type, 'A SECO'))).toBe('dry');
    expect(mediumOf(v16, block('v16', type, 'Á SECO'))).toBe('dry');
    expect(mediumOf(v15, block('v15', type, 'Á SECO'))).toBe('dry');
    expect(mediumOf(v16, block('v16', type, v16.oil_rule!.oil_values[0]!))).toBe(mediumOf(v15, block('v15', type, v15.oil_rule!.oil_values[0]!)));
  });

  it.each(TYPES)('%s: the dry subtype a value names is `a_seco` for "A SECO" and "Á SECO" on v16, as for "Á SECO" on v15', (type) => {
    expect(drySubtypeOfInsulation(getDefinition('v16', 'cabine_primaria', type), 'A SECO')?.key).toBe('a_seco');
    expect(drySubtypeOfInsulation(getDefinition('v16', 'cabine_primaria', type), 'Á SECO')?.key).toBe('a_seco');
    expect(drySubtypeOfInsulation(getDefinition('v15', 'cabine_primaria', type), 'Á SECO')?.key).toBe('a_seco');
    expect(drySubtypeOfInsulation(getDefinition('v16', 'cabine_primaria', type), 'EPÓXI')?.key).toBe('epoxi');
    expect(drySubtypeOfInsulation(getDefinition('v16', 'cabine_primaria', type), getDefinition('v16', 'cabine_primaria', type).oil_rule!.oil_values[0]!)).toBeNull();
  });

  it.each(TYPES)('%s: a plate reading of "Á SECO" or "A SECO" is suggested as "A SECO" on v16, "Á SECO" on v15', (type) => {
    const field = (version: string) => getDefinition(version, 'cabine_primaria', type).nameplate.find((one) => one.key === 'tipo_de_isolacao')!;
    for (const printed of ['Á SECO', 'A SECO', 'a seco']) {
      expect(normalizeReadingValue(field('v16'), printed), printed).toEqual({ ok: true, value: 'A SECO', verify: false });
      expect(normalizeReadingValue(field('v15'), printed), printed).toEqual({ ok: true, value: 'Á SECO', verify: false });
    }
  });

  it('the oil sampling does not apply to a dry transformer on v16, as on v15, and applies to the oil option', () => {
    const v16 = getDefinition('v16', 'cabine_primaria', 'transformador_forca');
    const v15 = getDefinition('v15', 'cabine_primaria', 'transformador_forca');
    expect(testApplicability(block('v16', 'transformador_forca', 'A SECO'), v16, 'coleta_oleo').state).toBe('na');
    expect(testApplicability(block('v16', 'transformador_forca', 'Á SECO'), v16, 'coleta_oleo').state).toBe('na');
    expect(testApplicability(block('v15', 'transformador_forca', 'Á SECO'), v15, 'coleta_oleo').state).toBe('na');
    expect(testApplicability(block('v16', 'transformador_forca', v16.oil_rule!.oil_values[0]!), v16, 'coleta_oleo').state).toBe('met');
  });

  it.each(TYPES)('%s: the reason under an oil field of a dry unit names "A SECO", also for a stored "Á SECO"; v15 names "Á SECO"', (type) => {
    const ctx = EMPTY_DEFINITION_CONTEXT;
    const field = getDefinition('v16', 'cabine_primaria', type).oil_rule!.fields[0]!;
    expect(oilFieldExcusedReason(block('v16', type, 'A SECO'), field, ctx)).toBe('Não se aplica: TIPO DE ISOLAÇÃO é A SECO.');
    expect(oilFieldExcusedReason(block('v16', type, 'Á SECO'), field, ctx)).toBe('Não se aplica: TIPO DE ISOLAÇÃO é A SECO.');
    expect(oilFieldExcusedReason(block('v15', type, 'Á SECO'), field, ctx)).toBe('Não se aplica: TIPO DE ISOLAÇÃO é Á SECO.');
  });
});
