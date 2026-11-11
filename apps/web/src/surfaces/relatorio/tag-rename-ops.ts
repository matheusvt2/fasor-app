import { tagRenameFollows, type DefinitionContext, type OpDraft, type TagRenameSource } from '@app/domain';
import { conclusionOp, nameplateOp } from '../ficha/ficha-ops.ts';
import { putEquipmentTagOp, type Author } from './relatorio-ops.ts';

/*
 * Fix batch e24y (P2 and P3): the one write of a TAG rename, shared by every path that renames an
 * equipment ("Renomear TAG" in the tree, the sheet's pencil, the Sumário's dialog, "Manter as duas"
 * of the sync conflict, "Mover para…" with its new TAG, and the plate's TAG field): the
 * `equipment/{id}/tag` put and, in the same batch, what the kernel says follows on the relatório's
 * sheets (`tagRenameFollows`): an unedited, current conclusion text composed with the new TAG and its
 * basis (the status stays `confirmed`; the text put carries `meta: { composed: true }`, contract 16),
 * and a stored plate TAG cell rewritten. One "Desfazer" undoes them together.
 */

/** The rows the rename reads, before it: the relatório's blocks, its locations and the project's equipment, with the type versions. */
export interface TagRenameRows {
  blocks: TagRenameSource['blocks'];
  locations: TagRenameSource['locations'];
  equipment: TagRenameSource['equipment'];
  definitions: DefinitionContext;
  /** Fix batch e24x (D3): the relatório, as every conclusion composer passes it to `visitContextOf`. */
  relatorio?: TagRenameSource['relatorio'];
}

/** The ops of renaming `equipmentId` to `tag` (trimmed) with what follows on the sheets of `relatorioId`. */
export function renameEquipmentOps(author: Author, input: { projectId: string; relatorioId: string; rows: TagRenameRows }, equipmentId: string, tag: string, options: { plateCellOf?: string } = {}): OpDraft[] {
  const next = tag.trim();
  const ops: OpDraft[] = [putEquipmentTagOp(author, input.projectId, equipmentId, next)];
  for (const follow of tagRenameFollows(input.rows, input.relatorioId, equipmentId, next, options)) {
    if (follow.conclusion !== null) {
      ops.push(conclusionOp(author, input.relatorioId, follow.blockId, 'text', follow.conclusion.text, { composed: true }));
      ops.push(conclusionOp(author, input.relatorioId, follow.blockId, 'text_basis', follow.conclusion.basis));
    }
    if (follow.plateTag) ops.push(nameplateOp(author, input.relatorioId, follow.blockId, 'tag', next));
  }
  return ops;
}
