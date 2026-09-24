import { formatDayMonthOfInstant } from '../format/datetime.ts';
import { countsAsEdit, type EditCandidate } from '../status/edited-since.ts';
import { manualMove, RELATORIO_STATUSES, statusLabel, statusTable } from '../status/table.ts';
import type { RelatorioStatus, RevisionRow } from '../schemas/entities.ts';
import { safeParsePath } from '../ops/path.ts';

/*
 * Story 4.6, AD-22: the emitter that appends the Emitido→Em revisão transition to any
 * relatório-scoped batch that edits the relatório after it was issued, and the texts of
 * the Sumário's issued banner and its header Overflow's backward move.
 */

/**
 * AD-22's edited-since emitter: `statusTable(status, 'edit')` when at least one draft in
 * the batch `countsAsEdit` and none of the drafts already targets `relatorio/status`
 * itself (a manual backward move the caller already intended). Called once per relatório
 * id by `commitBatch`/`buildBatch`, never by an individual surface (Design Notes).
 */
export function advanceOnEdit(status: RelatorioStatus, drafts: readonly EditCandidate[]): RelatorioStatus | null {
  const alreadySetsStatus = drafts.some((draft) => safeParsePath(draft.path)?.family === 'relatorio/status');
  if (alreadySetsStatus) return null;
  if (!drafts.some((draft) => countsAsEdit(draft))) return null;
  return statusTable(status, 'edit');
}

/**
 * The Sumário's issued banner: "Relatório emitido em 09/09 (revisão 2). Alterações geram
 * a revisão 3." (UX-DR11, EXPERIENCE.md l.389/579 -- "dd/mm", no year). Null with no
 * revision yet (an ordinary first Em campo → Em revisão pass, never issued), and null once
 * the status has been backed all the way to Em campo or Rascunho (the AC scopes the banner
 * to "Emitido or Em revisão after an issue"; a manual backward move that far means the
 * relatório is being redone, not merely revised, and the earlier issue no longer applies).
 */
export function issuedBannerText(status: RelatorioStatus, revision: Pick<RevisionRow, 'number' | 'created_at'> | null): string | null {
  if (revision === null) return null;
  if (status !== 'emitido' && status !== 'em_revisao') return null;
  const date = formatDayMonthOfInstant(revision.created_at);
  return `Relatório emitido em ${date} (revisão ${revision.number}). Alterações geram a revisão ${revision.number + 1}.`;
}

/** The header Overflow's backward-move item: the immediate previous status, or null at Rascunho. */
export function backwardMoveLabel(from: RelatorioStatus): { to: RelatorioStatus; label: string } | null {
  const index = RELATORIO_STATUSES.indexOf(from);
  if (index <= 0) return null;
  const to = RELATORIO_STATUSES[index - 1]!;
  if (manualMove(from, to) === null) return null;
  return { to, label: `Voltar para ${statusLabel(to)}` };
}

/** The Confirm dialog's description: "O relatório volta de ⟨from⟩ para ⟨to⟩. Nada preenchido em campo é apagado." */
export function backwardMoveConsequenceText(from: RelatorioStatus, to: RelatorioStatus): string {
  return `O relatório volta de ${statusLabel(from)} para ${statusLabel(to)}. Nada preenchido em campo é apagado.`;
}
