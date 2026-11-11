import type { BlockRow, EquipmentRow, LocationRow } from '../schemas/entities.ts';
import { blockDefinitionIn, type DefinitionContext } from '../seed/definitions.ts';
import { composeConclusion, conclusionStoredText, conclusionTextStatusOf } from './conclusion.ts';
import { visitContextOf } from './visit-context.ts';

/*
 * Fix batch e24y (P2 and P3 of the hands-on pass of 2026-11-11): what a rename of an equipment's
 * TAG carries along on the sheets of one relatório, in the same batch as the `equipment/{id}/tag`
 * put, so the rename never leaves a sheet stale.
 *
 * - P2: the TAG is part of the composed conclusion (`composeConclusion`), so a rename made a
 *   confirmed, unedited suggestion read `stale`, and `printedConclusionText` prints a stale
 *   confirmed text only when the floor adjusted the pair: the CONCLUSÃO boxes printed no text.
 *   A sheet whose stored text is `confirmed` and still the text composed with the old TAG gets
 *   the text composed with the new TAG and its basis (the status stays `confirmed`). An edited
 *   text is the engineer's own and is never written; a confirmed text already stale before the
 *   rename (another input moved it) is not written either (Design Notes N2 of the spec).
 * - P3: a sheet whose plate stores a TAG cell gets it rewritten with the new TAG, so the plate's
 *   TAG and the equipment's never differ after a rename. A sheet with no stored cell keeps
 *   showing the equipment's TAG through `nameplateTagPrefill`, so nothing is written there,
 *   unless the caller names it (`plateCellOf`: the plate field whose commit is the rename).
 *
 * Only the live sheets of `relatorioId` bound to the equipment are touched: another relatório's
 * sheets of the same equipment, and every TAG on reading or opening, stay as they are (N3).
 */

/** The rows the follow-up writes are composed from: the relatório's blocks, its locations and the project's equipment, before the rename. */
export interface TagRenameSource {
  blocks: readonly BlockRow[];
  locations: readonly LocationRow[];
  equipment: readonly EquipmentRow[];
  definitions: DefinitionContext;
  /** Fix batch e24x (D3): the relatório, whose visit date bounds the previous visit the text is composed under (`visitContextOf`). */
  relatorio?: { setup: { service_start?: string | null; service_end?: string | null } } | null;
}

/** What one sheet of the relatório writes with the rename. */
export interface TagRenameFollow {
  blockId: string;
  /** The conclusion text composed with the new TAG and its basis, or null when the stored text is not followed. */
  conclusion: { text: string; basis: string } | null;
  /** True when the sheet's plate TAG cell is written with the new TAG. */
  plateTag: boolean;
}

/** The nameplate field that holds the plate's TAG. */
const PLATE_TAG_KEY = 'tag';

/**
 * The writes a rename of `equipmentId` to `tag` carries on the live sheets of `relatorioId` bound to
 * it (see the header). `plateCellOf` names a sheet whose plate TAG cell is written even when it
 * stores none (the plate field the engineer committed). Empty when nothing follows.
 */
export function tagRenameFollows(source: TagRenameSource, relatorioId: string, equipmentId: string, tag: string, options: { plateCellOf?: string } = {}): TagRenameFollow[] {
  const row = source.equipment.find((one) => one.id === equipmentId);
  if (row === undefined) return [];
  const before = row.tag;
  const after = tag.trim();
  const out: TagRenameFollow[] = [];
  for (const block of source.blocks) {
    if (block.removed_at !== null || block.relatorio_id !== relatorioId || block.equipment_id !== equipmentId) continue;
    const definition = blockDefinitionIn(source.definitions, block);
    if (definition === null) continue;
    let conclusion: TagRenameFollow['conclusion'] = null;
    if (conclusionTextStatusOf(block) === 'confirmed') {
      const visit = visitContextOf(source, block);
      // Followed only while it is the suggestion as composed now with the old TAG: never an edited or an already stale text.
      if (conclusionStoredText(block) === composeConclusion(block, definition, before, visit).text) {
        const next = composeConclusion(block, definition, after, visit);
        conclusion = { text: next.text, basis: next.basis };
      }
    }
    const hasTagField = definition.nameplate.some((field) => field.key === PLATE_TAG_KEY);
    const stored = block.sheet.nameplate[PLATE_TAG_KEY];
    const plateTag = hasTagField && (options.plateCellOf === block.id || (stored !== undefined && stored.value !== after));
    if (conclusion !== null || plateTag) out.push({ blockId: block.id, conclusion, plateTag });
  }
  return out;
}
