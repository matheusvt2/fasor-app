import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockDefinition, FieldDef, NotTestedReason, ReportSeed } from './schema.ts';
import { CABINE_PRIMARIA_V1 } from './v1.ts';

/*
 * Seed version 2 (AR-20; journey review 2026-09-24, `source-deltas.md` rows 50 and 56):
 * seed v1 as it shipped, plus
 * - `per_unit: true` on the nameplate fields of one physical unit, IDENTIFICAÇÃO, Nº SÉRIE
 *   and TAG, on every block type that carries them (D-3: "Igual à ⟨TAG⟩?" never copies
 *   them; "Copiar da última visita" of the same equipment still does);
 * - a third standard Não ensaiado reason, "Equipamento inacessível", before "Outro".
 * Derived from v1 rather than retyped, so the two differ only by what is listed here
 * (`seed.test.ts` pins the difference). FROZEN once merged, like v1.
 */

/** The nameplate keys that name one physical unit, never copied from another block. */
const PER_UNIT_KEYS: ReadonlySet<string> = new Set(['identificacao', 'n_serie', 'tag']);

function withPerUnit(field: FieldDef): FieldDef {
  return PER_UNIT_KEYS.has(field.key) ? { ...field, per_unit: true } : { ...field };
}

function blockV2(definition: BlockDefinition): BlockDefinition {
  return { ...structuredClone(definition), nameplate: definition.nameplate.map(withPerUnit) };
}

const BLOCKS_V2 = Object.fromEntries(
  Object.entries(CABINE_PRIMARIA_V1.blocks).map(([type, definition]) => [type, blockV2(definition)]),
) as Record<EquipmentBlockType, BlockDefinition>;

/** `source-deltas.md` row 56: the third standard reason; its justification awaits Bruno's reading. */
const EQUIPAMENTO_INACESSIVEL: NotTestedReason = {
  key: 'equipamento_inacessivel',
  label: 'Equipamento inacessível',
  // authored: the printed justification of the third reason (open question for Bruno).
  justification: 'Os ensaios não foram realizados devido à impossibilidade de acesso ao equipamento.',
};

/** v1's reasons with the third standard one inserted before "Outro" (the free text stays last). */
function notTestedReasonsV2(): NotTestedReason[] {
  const reasons = structuredClone(CABINE_PRIMARIA_V1.not_tested_reasons);
  const outro = reasons.findIndex((reason) => reason.key === 'outro');
  reasons.splice(outro === -1 ? reasons.length : outro, 0, EQUIPAMENTO_INACESSIVEL);
  return reasons;
}

export const CABINE_PRIMARIA_V2: ReportSeed = {
  ...structuredClone(CABINE_PRIMARIA_V1),
  blocks: BLOCKS_V2,
  not_tested_reasons: notTestedReasonsV2(),
};
