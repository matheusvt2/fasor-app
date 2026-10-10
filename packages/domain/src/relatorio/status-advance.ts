import { formatDayMonthOfInstant } from '../format/datetime.ts';
import { countsAsEdit, countsAsFieldContent, type EditCandidate } from '../status/edited-since.ts';
import { manualMove, RELATORIO_STATUSES, statusLabel, statusTable } from '../status/table.ts';
import type { RelatorioStatus, RevisionRow } from '../schemas/entities.ts';
import { safeParsePath } from '../ops/path.ts';

/*
 * Story 4.6, AD-22 (table of 2026-10-10): the emitter that appends the status transition an
 * edit causes to any relatório-scoped batch (Emitido→Em revisão, and Rascunho→Em campo for
 * field work), and every sentence that says a status or a status change: the Sumário's and
 * the ficha's banners, the status toasts, and the header Overflow's backward move.
 */

/**
 * AD-22's edit emitter: `statusTable(status, 'edit')` when at least one draft in the batch
 * `countsAsEdit` and none of the drafts already targets `relatorio/status` itself (a manual
 * backward move the caller already intended). Called once per relatório id by
 * `commitBatch`/`buildBatch`, never by an individual surface (Design Notes).
 *
 * Decisions 1 and 3 of 2026-10-10 (Matheus): only field content moves Rascunho to Em campo
 * (`countsAsFieldContent`: a sheet value, a cabine's data fields, a photo, a point). Neither a
 * `relatorio/setup` edit nor the tree's structure does: the office fills Setup and prepares
 * the tree in Rascunho, and "Concluir dados do relatório" stays the other way out. From
 * Emitido the full `editedSince` family set counts, unchanged.
 */
export function advanceOnEdit(status: RelatorioStatus, drafts: readonly EditCandidate[]): RelatorioStatus | null {
  const alreadySetsStatus = drafts.some((draft) => safeParsePath(draft.path)?.family === 'relatorio/status');
  if (alreadySetsStatus) return null;
  const counts = status === 'rascunho' ? countsAsFieldContent : countsAsEdit;
  if (!drafts.some((draft) => counts(draft))) return null;
  return statusTable(status, 'edit');
}

type RevisionStamp = Pick<RevisionRow, 'number' | 'created_at'>;

/**
 * The Sumário's banner once a revision exists (UX-DR11, EXPERIENCE.md l.389/579, "dd/mm", no
 * year). Emitido: "Relatório emitido em 09/09 (revisão 2). Alterações geram a revisão 3.".
 * Em revisão (2026-10-10: a revision was generated and the client does not have the current
 * content): the revision generated and not yet sent while nothing was edited since it, else
 * that the changes go into the next one. `edited` is "anything edited since the latest
 * revision" (`editedSince`); it defaults to false. Null with no revision yet, and null once
 * the status has been backed to Em campo or Rascunho (the relatório is being redone, not
 * merely revised).
 */
export function issuedBannerText(status: RelatorioStatus, revision: RevisionStamp | null, edited = false): string | null {
  if (revision === null) return null;
  const date = formatDayMonthOfInstant(revision.created_at);
  if (status === 'emitido') return `Relatório emitido em ${date} (revisão ${revision.number}). Alterações geram a revisão ${revision.number + 1}.`;
  if (status !== 'em_revisao') return null;
  // authored: 2026-10-10, the Em revisão wording (no mock draws it).
  if (edited) return `Há alterações desde a revisão ${revision.number} (${date}). Elas entram na revisão ${revision.number + 1}.`;
  return `Revisão ${revision.number} gerada em ${date}, ainda não enviada ao cliente.`;
}

/**
 * The ficha's banner on an Emitido relatório: editing reopens it. Null in every other
 * status and with no revision on record.
 */
export function fichaIssuedBannerText(status: RelatorioStatus, revision: Pick<RevisionRow, 'number'> | null): string | null {
  if (status !== 'emitido' || revision === null) return null;
  // authored: 2026-10-10.
  return `Relatório emitido (revisão ${revision.number}). Editar esta ficha reabre o relatório como ${statusLabel('em_revisao')} e gera a revisão ${revision.number + 1}.`;
}

/**
 * What caused a status change: the edit emitter (`advanceOnEdit`) appending it to an edit's
 * batch, an action the user asked for ("Concluir", a generate, "Marcar como enviado ao
 * cliente", a backward move), or "Desfazer" putting the earlier status back.
 */
export type StatusChangeCause = 'edit' | 'action' | 'undo';

export interface StatusChange {
  from: RelatorioStatus;
  to: RelatorioStatus;
  cause: StatusChangeCause;
  /** The newest revision's number, or null with none. */
  latestNumber: number | null;
}

/** The toast of one status change, whatever caused it. Null when nothing changed, and for a status this kernel has no sentence for. */
export function statusChangeToastText({ from, to, cause, latestNumber }: StatusChange): string | null {
  if (from === to) return null;
  // authored: 2026-10-10, every sentence below.
  if (cause === 'edit' && from === 'emitido') {
    return latestNumber === null ? 'Relatório reaberto em revisão' : `Relatório reaberto em revisão. A próxima emissão gera a revisão ${latestNumber + 1}.`;
  }
  if (cause === 'undo' || manualMove(from, to) !== null) return `Relatório voltou para ${statusLabel(to)}`;
  if (to === 'emitido') {
    return latestNumber === null ? 'Relatório emitido' : `Revisão ${latestNumber} marcada como enviada ao cliente. Relatório emitido.`;
  }
  if (to === 'em_campo') return 'Relatório em campo';
  // A status outside the ones named here (a newer bundle's) is not given a sentence it does not have.
  return to === 'em_revisao' ? 'Relatório em revisão' : null;
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
