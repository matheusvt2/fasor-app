import type { RelatorioStatus } from '../schemas/entities.ts';
import { relatoriosCount } from '../text/plural.ts';

/*
 * AD-22: `packages/domain/status` is the one home of the relatório status table.
 * Every transition is a client op on `relatorio/status`; the server never writes
 * it, and no surface decides a transition itself — it asks `statusTable`.
 *
 * This story ships the table and its tests only: the emitters live in the Setup
 * surface (Epic 4) and the Export dialog (Epic 7).
 */

/** Board order of the Home status tiles (UX-DR63) and the forward order of the table. */
export const RELATORIO_STATUSES = ['rascunho', 'em_campo', 'em_revisao', 'emitido'] as const;

/** The pt-BR word for a status, from `20-home.html`'s status pills. */
const STATUS_LABELS: Readonly<Record<RelatorioStatus, string>> = {
  rascunho: 'Rascunho',
  em_campo: 'Em campo',
  em_revisao: 'Em revisão',
  emitido: 'Emitido',
};

export function statusLabel(status: RelatorioStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * The accessible name of one Home status tile: "Rascunho, 1 relatório". The mock
 * hard-codes that sentence per tile; this is the same sentence with the live count.
 */
export function statusTileLabel(status: RelatorioStatus, count: number): string {
  return `${statusLabel(status)}, ${relatoriosCount(count)}`;
}

/**
 * AD-8: a relatório in Rascunho or Em campo is pulled automatically; Em revisão and
 * Emitido are pulled only when opened on this device.
 */
export function isAutoPulled(status: RelatorioStatus): boolean {
  return status === 'rascunho' || status === 'em_campo';
}

/**
 * The `.status-pill[data-status]` vocabulary of `components.css`, which spells the
 * two-word states with a hyphen where the kernel value uses an underscore. The
 * mapping lives here so no surface writes a `data-status` string of its own.
 */
export type StatusPillId = 'rascunho' | 'em-campo' | 'em-revisao' | 'emitido';

const PILL_IDS: Readonly<Record<RelatorioStatus, StatusPillId>> = {
  rascunho: 'rascunho',
  em_campo: 'em-campo',
  em_revisao: 'em-revisao',
  emitido: 'emitido',
};

export function statusPillId(status: RelatorioStatus): StatusPillId {
  return PILL_IDS[status] ?? 'rascunho';
}

/** The four events of AD-22's table. */
export type StatusEvent = 'setup_complete' | 'generate' | 'issue' | 'edit';

export const STATUS_EVENTS = ['setup_complete', 'generate', 'issue', 'edit'] as const;

/**
 * AD-22's forward rows (table changed by Matheus on 2026-10-10), and nothing else:
 *   Rascunho  --setup_complete--> Em campo
 *   Rascunho  --edit------------>  Em campo     (field content only: `countsAsFieldContent`)
 *   Rascunho  --generate-------->  Em revisão
 *   Em campo  --generate-------->  Em revisão
 *   Em revisão --issue---------->  Emitido      ("Marcar como enviado ao cliente")
 *   Emitido   --edit------------>  Em revisão
 *   Emitido   --generate-------->  Em revisão   (2026-10-13, Matheus: a queued generate only)
 *
 * Em revisão is informational: a revision was generated and not yet sent to the client.
 * `issue` is never emitted by a revision's arrival; it is the explicit mark-as-sent.
 *
 * 2026-10-13 (Matheus, review of PR #125): three routes leave an Emitido relatório holding
 * content the client does not have with no status op (an older "Desfazer" pressed after
 * "Marcar como enviado ao cliente", a second device editing while its own row still says
 * Em revisão, an edit and its undo). The next generate then builds revision N+1, which nobody
 * marked as sent, so the row above moves it to Em revisão. The emitter is `advanceOnGenerate`
 * (`relatorio/status-advance.ts`): it applies this row when the generate is queued (a new
 * revision will be built) and never when the server answers `unchanged` (the revision the
 * client already has).
 *
 * Every other `(state, event)` pair returns null — no transition, never a throw,
 * so a caller outside the union (a pulled row from a newer bundle) is inert.
 */
const TABLE: Readonly<Record<RelatorioStatus, Partial<Record<StatusEvent, RelatorioStatus>>>> = {
  rascunho: { setup_complete: 'em_campo', edit: 'em_campo', generate: 'em_revisao' },
  em_campo: { generate: 'em_revisao' },
  em_revisao: { issue: 'emitido' },
  emitido: { edit: 'em_revisao', generate: 'em_revisao' },
};

export function statusTable(state: RelatorioStatus, event: StatusEvent): RelatorioStatus | null {
  return TABLE[state]?.[event] ?? null;
}

/**
 * AD-22: "manual backward moves allowed from any state through the confirm dialog".
 * A forward move (or a move to the same state) is refused, so the only way forward
 * is an event the table knows.
 */
export function manualMove(from: RelatorioStatus, to: RelatorioStatus): RelatorioStatus | null {
  const fromIndex = RELATORIO_STATUSES.indexOf(from);
  const toIndex = RELATORIO_STATUSES.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return null;
  return toIndex < fromIndex ? to : null;
}
