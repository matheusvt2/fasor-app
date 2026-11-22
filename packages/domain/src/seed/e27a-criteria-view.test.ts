import { describe, expect, it } from 'vitest';
import { rowCriterion } from '../relatorio/reading-evaluation.ts';
import type { BlockRow } from '../schemas/entities.ts';
import { criteriaTablesView, seededCriterionAppliesText } from './criteria-view.ts';
import { SEEDED_CRITERIA } from './criteria.ts';
import { getDefinition, SEED_VERSION } from './definitions.ts';

/*
 * 27.6-UNIT (batch e27a, Story 27.6, F10 of the 2026-11-21 pass): the rows Cadastros › Critérios lists beside
 * the seeded criteria are the ANSI/NETA tables the fichas judge insulation by, as the ficha writes them.
 */

describe('27.6-UNIT criteriaTablesView', () => {
  it('the Tabela 100.1: its source, equipment, applies line and every row', () => {
    const [apparatus] = criteriaTablesView();
    expect(apparatus).toMatchObject({ key: 'neta_100_1', title: 'ANSI/NETA MTS-2023, Tabela 100.1', columns: ['min'] });
    expect(apparatus!.appliesText).toMatch(/^Vale quando a placa informa a tensão nominal: /);
    expect(apparatus!.equipmentText).toContain('Disjuntor MT');
    expect(apparatus!.rows[0]).toEqual({ ratedText: 'até 250 V', testVoltageText: '500 V', minimums: ['≥ 25 MΩ'] });
    expect(apparatus!.rows.find((row) => row.ratedText === 'até 15 kV')).toEqual({ ratedText: 'até 15 kV', testVoltageText: '2,5 kV', minimums: ['≥ 5.000 MΩ'] });
    expect(apparatus!.rows.at(-2)!.ratedText).toBe('até 34,5 kV');
    expect(apparatus!.rows.at(-1)).toEqual({ ratedText: 'acima de 34,5 kV', testVoltageText: '5 kV', minimums: ['≥ 100.000 MΩ'] });
  });

  it('the Tabela 100.5: one minimum per medium', () => {
    const winding = criteriaTablesView()[1]!;
    expect(winding).toMatchObject({ key: 'neta_100_5', title: 'ANSI/NETA MTS-2023, Tabela 100.5', columns: ['oil', 'dry'] });
    expect(winding.appliesText).toMatch(/^Vale quando a placa informa a tensão nominal e o tipo de isolação: /);
    expect(winding.rows.map((row) => row.minimums)).toEqual([
      ['≥ 100 MΩ', '≥ 500 MΩ'],
      ['≥ 1.000 MΩ', '≥ 5.000 MΩ'],
      ['≥ 5.000 MΩ', '≥ 25.000 MΩ'],
    ]);
  });

  it('a disjuntor whose plate reads 15 kV is judged by a criterion the view lists', () => {
    const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'disjuntor_mt');
    const test = definition.tests.find((candidate) => candidate.criterion_table !== undefined)!;
    const field = test.criterion_table!.voltage === 'winding' ? null : test.criterion_table!.voltage.field;
    // TENSÃO NOMINAL is a voltage class (kV), stored as its text.
    const block = { sheet: { nameplate: { [field!]: { value: '15', source_suggestion_id: null, op_id: 'x' } }, checklist: {}, test: {} } } as unknown as BlockRow;
    const judged = rowCriterion(block, definition, test, 0);
    expect(judged.kind).toBe('table');
    const listed = criteriaTablesView().flatMap((view) => view.rows.flatMap((row) => row.minimums));
    expect(listed).toContain(judged.criterion!.text);
  });

  it('each seeded criterion says when it applies', () => {
    expect(SEEDED_CRITERIA.map((criterion) => seededCriterionAppliesText(criterion))).toEqual([
      'Vale quando a placa não informa a tensão nominal, nos cabos e nos relatórios anteriores às tabelas ANSI/NETA.',
      'Vale em toda ficha com este ensaio.',
      'Vale em toda ficha com este ensaio.',
    ]);
  });
});
