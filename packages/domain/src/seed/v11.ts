import { VECTOR_GROUP_CODES, VECTOR_GROUP_FIELD } from '../relatorio/vector-group.ts';
import type { BlockDefinition, FieldDef, ReportSeed, TestDef } from './schema.ts';
import { CABINE_PRIMARIA_V10 } from './v10.ts';

/*
 * Seed version 11 (Epic 21, Bruno's WhatsApp of 2026-11-05; contract 30): seed v10 plus
 *
 * - Story 21.1: the transformador de força's LIGAÇÃO SECUNDÁRIA becomes a select of the 47 vector
 *   groups (`VECTOR_GROUP_CODES`, the manual's order; label unchanged), and its ratio table's
 *   `ratio_factor` becomes `vector_group`: VAL CALCULADO is U1 · k / U2 with the group's k, the
 *   three captures read the group's terminal pairs, and with no group there is no VAL CALCULADO.
 *   The seed's capture column labels (`H1-H3 / X1-X0`...) stay: storage is addressed by column
 *   index and the labels shown and printed come from the group. TP and TC keep LIGAÇÃO
 *   SECUNDÁRIA as text and their plain U1/U2.
 *
 * Derived from v10 rather than retyped, so the two differ only by this (`seed.test.ts` pins the
 * difference). Relatórios on v1 to v10 keep their fields; on v9 and v10 a LIGAÇÃO SECUNDÁRIA that
 * names a group applies it (`reading-evaluation.ts`).
 */

const v10 = CABINE_PRIMARIA_V10;

function vectorGroupField(field: FieldDef): FieldDef {
  return { key: field.key, label: field.label, kind: 'select', options: [...VECTOR_GROUP_CODES] };
}

function transformadorForcaV11(definition: BlockDefinition): BlockDefinition {
  const nameplate = definition.nameplate.map((field) => (field.key === VECTOR_GROUP_FIELD ? vectorGroupField(field) : field));
  const tests = definition.tests.map((test): TestDef =>
    test.key === 'relacao_transformacao' ? { ...test, tables: test.tables.map((table) => ({ ...table, ratio_factor: 'vector_group' as const })) } : test,
  );
  return { ...definition, nameplate, tests };
}

function cabinePrimariaV11(): ReportSeed {
  const seed = structuredClone(v10);
  return { ...seed, blocks: { ...seed.blocks, transformador_forca: transformadorForcaV11(seed.blocks.transformador_forca) } };
}

export const CABINE_PRIMARIA_V11: ReportSeed = cabinePrimariaV11();
