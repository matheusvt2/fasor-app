import type { JsonValue } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { enabledSubBlocksOf, isCellFilled, isEquipmentBlock } from '../relatorio/sheet-state.ts';
import type { EquipmentRow } from '../schemas/entities.ts';

/*
 * Story 7.5 (AD-25): the `last_nameplate` projection an issued revision leaves on each
 * equipment row, so the next visit's empty sheet offers "Copiar da última visita (⟨TAG⟩)"
 * (`relatorio/nameplate-copy.ts` `lastNameplateCopy`). Computed from the frozen snapshot the
 * revision printed; the issue job writes one `equipment/{id}/last_nameplate` put per entry
 * in the same batch as the revision. Only filled cells are kept, keyed by the definition's
 * field keys; the TAG prefill (`nameplateTagPrefill`) is shown, never stored, so it is never
 * copied here either.
 */

export type LastNameplateValue = NonNullable<EquipmentRow['last_nameplate']>;

export interface LastNameplateEntry {
  equipmentId: string;
  value: LastNameplateValue;
}

function definitionOf(seedVersion: string, blockType: string): BlockDefinition | null {
  try {
    return getDefinition(seedVersion, 'cabine_primaria', blockType);
  } catch {
    return null;
  }
}

/**
 * One entry per live equipment block whose definition has an enabled nameplate and whose plate holds
 * a filled cell, in snapshot order.
 */
export function lastNameplates(snapshot: RelatorioSnapshot, input: { revisionNumber: number; issuedAt: string }): LastNameplateEntry[] {
  const out: LastNameplateEntry[] = [];
  for (const block of snapshot.blocks) {
    if (block.removed_at !== null || block.equipment_id === null || !isEquipmentBlock(block)) continue;
    // A disabled nameplate does not print; its stale cells are not the last visit's plate.
    if (!enabledSubBlocksOf(block).has('nameplate')) continue;
    const definition = definitionOf(block.seed_version, block.block_type);
    if (definition === null || definition.nameplate.length === 0) continue;
    const fields: Record<string, JsonValue> = {};
    for (const field of definition.nameplate) {
      const cell = block.sheet.nameplate[field.key];
      if (cell !== undefined && isCellFilled(cell)) fields[field.key] = cell.value as JsonValue;
    }
    if (Object.keys(fields).length === 0) continue;
    out.push({
      equipmentId: block.equipment_id,
      value: {
        relatorio_id: snapshot.relatorio.id,
        revision_number: input.revisionNumber,
        issued_at: input.issuedAt,
        seed_version: block.seed_version,
        block_type: block.block_type,
        fields,
      },
    });
  }
  return out;
}
