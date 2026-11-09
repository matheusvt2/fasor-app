import type { BaseEquipmentBlockType } from '../schemas/block-config.ts';
import { NETA_100_1, NETA_100_5 } from './criteria-tables.ts';
import type { BlockDefinition, ReportSeed, TestDef } from './schema.ts';
import { CABINE_PRIMARIA_V12 } from './v12.ts';

/*
 * Seed version 13 (Epic 23, Bruno's test base rev08 and Matheus's decisions of 2026-11-08): seed v12
 * plus, story by story, the keys that make the base what new relatórios are judged by. Every new
 * behaviour is reached through a v13 definition key, so a definition of v1 to v12 reads as before in
 * every reader (AD-21); no relatório migrates its seed.
 *
 * Batch e23a's first commit opens v13 equal to v12 (the version only), so batch e23b stacks on it.
 *
 * Derived from v12 rather than retyped, so the two differ only by what each story adds
 * (`seed.test.ts` pins the difference and `V12_HASH`).
 */

const v12 = CABINE_PRIMARIA_V12;

// --- batch e23a: Stories 23.2 and 23.4 (criteria from the NETA tables, the instrument-limit note) ---

type CriterionTableKey = NonNullable<TestDef['criterion_table']>;

/**
 * Story 23.2: the insulation test of each type the NETA tables judge, and how its rows pick their
 * row: the transformador de força by the winding each row tests and its medium (base rev08 TR-OL-02,
 * TR-SE-02), the TC by its primary voltage and medium (TC-02), the disjuntor, the seccionadora and
 * the para-raio by their class voltage (DJ-02, SC-02, PR-02). The TP (open item B-4) and the cables
 * (CB-02) keep the seeded criterion.
 */
const CRITERION_TABLES: Partial<Record<BaseEquipmentBlockType, () => CriterionTableKey>> = {
  transformador_forca: () => ({ table: structuredClone(NETA_100_5), voltage: 'winding', medium: 'oil_rule' }),
  tc: () => ({ table: structuredClone(NETA_100_5), voltage: { field: 'tensao_nominal_at' }, medium: 'oil_rule' }),
  disjuntor_mt: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_nominal' } }),
  chave_seccionadora: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_de_placa' } }),
  para_raio: () => ({ table: structuredClone(NETA_100_1), voltage: { field: 'tensao_nominal' } }),
};

/** Story 23.4: the eight FO.SERV-03 types whose insulation test prints the instrument-limit note (not the QGBT types). */
const LIMIT_NOTE_TYPES: readonly BaseEquipmentBlockType[] = ['cabos_entrada', 'para_raio', 'chave_seccionadora', 'disjuntor_mt', 'tp', 'tc', 'cabos_saida', 'transformador_forca'];

/** The type's insulation test with its v13 keys; the other tests as they were. */
function insulationV13(type: BaseEquipmentBlockType, definition: BlockDefinition): BlockDefinition {
  const table = CRITERION_TABLES[type];
  const note = LIMIT_NOTE_TYPES.includes(type);
  const tests = definition.tests.map((test): TestDef => {
    if (test.key !== 'isolacao') return test;
    return { ...test, ...(table === undefined ? {} : { criterion_table: table() }), ...(note ? { instrument_limit_note: true as const } : {}) };
  });
  return { ...definition, tests };
}

function cabinePrimariaV13(): ReportSeed {
  const seed = structuredClone(v12);
  const blocks = { ...seed.blocks };
  for (const type of LIMIT_NOTE_TYPES) blocks[type] = insulationV13(type, blocks[type]);
  return { ...seed, blocks };
}

export const CABINE_PRIMARIA_V13: ReportSeed = cabinePrimariaV13();
