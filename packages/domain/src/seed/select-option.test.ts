import { describe, expect, it } from 'vitest';
import { lastNameplateCopy } from '../relatorio/nameplate-copy.ts';
import { VECTOR_GROUP_CODES } from '../relatorio/vector-group.ts';
import { getDefinition } from './definitions.ts';
import { selectOptionFor } from './select-option.ts';

/*
 * Story 21.1 (seed v11): the vector-group fallback of `selectOptionFor`. The transformer's v11
 * LIGAÇÃO SECUNDÁRIA is a select of the 47 codes; a value written on v9/v10 as free text ("DYN1",
 * "Y/yn0"), a plate reading or "Copiar da última visita" lands on it as its canonical code.
 */

const v11 = getDefinition('v11', 'cabine_primaria', 'transformador_forca');
const v11Field = v11.nameplate.find((field) => field.key === 'ligacao_secundaria')!;

describe('21.1-UNIT selectOptionFor on the vector-group select', () => {
  it('maps every spelling the parser reads onto its code', () => {
    expect(selectOptionFor(v11Field, 'Dyn1')).toBe('Dyn1');
    expect(selectOptionFor(v11Field, 'DYN1')).toBe('Dyn1');
    expect(selectOptionFor(v11Field, 'Dyn 1')).toBe('Dyn1');
    expect(selectOptionFor(v11Field, 'D/yn1')).toBe('Dyn1');
    expect(selectOptionFor(v11Field, 'YYN0')).toBe('Yyn0');
    expect(selectOptionFor(v11Field, 'Y/yn0')).toBe('Yyn0');
    expect(selectOptionFor(v11Field, 'ynyn0')).toBe('YNyn0');
    for (const code of VECTOR_GROUP_CODES) expect(selectOptionFor(v11Field, code.toUpperCase()), code).toBe(code);
  });

  it('a value that names no group is not carried over', () => {
    for (const value of ['Y', 'DYN', 'Estrela', '', null, 3]) expect(selectOptionFor(v11Field, value), String(value)).toBeNull();
  });

  it('a select of other options never reads a vector group', () => {
    const medium = getDefinition('v11', 'cabine_primaria', 'disjuntor_mt').nameplate.find((field) => field.key === 'meio_de_extincao')!;
    expect(selectOptionFor(medium, 'Dyn1')).toBeNull();
    // Only the full list of the 47 codes is the vector-group select; a shorter list matches as any select.
    expect(selectOptionFor({ options: ['Dyn1', 'Yyn0'] }, 'DYN1')).toBe('Dyn1');
    expect(selectOptionFor({ options: ['Dyn1', 'Yyn0'] }, 'D/yn1')).toBeNull();
  });

  it('"Copiar da última visita" of a v10 transformer typed "DYN1" fills the v11 select with "Dyn1"; "Y" is not copied', () => {
    const plate = (ligacao: string) => ({
      last_nameplate: { relatorio_id: '019966b0-0099-7000-8000-000000000001', revision_number: 1, issued_at: '2026-10-01T10:00:00.000Z', seed_version: 'v10', block_type: 'transformador_forca', fields: { ligacao_secundaria: ligacao } },
    });
    expect(lastNameplateCopy(plate('DYN1'), v11)).toEqual([{ fieldKey: 'ligacao_secundaria', value: 'Dyn1' }]);
    expect(lastNameplateCopy(plate('Y'), v11)).toEqual([]);
    // TP and TC keep the text as it is.
    expect(lastNameplateCopy(plate('DYN1'), getDefinition('v11', 'cabine_primaria', 'tp'))).toEqual([{ fieldKey: 'ligacao_secundaria', value: 'DYN1' }]);
  });
});
