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

/*
 * Story 20.7 (2026-11-03, contract 29, security pass S1): the server checks every client
 * `relatorio/status` op against this table, against the status it holds when the op applies.
 * The emitters stay `advanceOnEdit` and `advanceOnGenerate` (`relatorio/status-advance.ts`) and
 * the surfaces' actions; the server never writes the status (AD-22). There are no roles: every
 * member of the company keeps every move (coordinator's reading).
 */

/** What a status move needs to know of the server's log besides the three statuses (`statusMoveFacts`). */
export type StatusMoveFact = 'issueJobSinceLastStatus' | 'unchangedRevision' | 'hasRevision';

export interface StatusMoveInput {
  /** The status the server holds when the op applies. */
  server: RelatorioStatus;
  /** The status the device saw when it wrote the op (`statusSeen`). */
  seen: RelatorioStatus;
  /** The status the op writes. */
  to: RelatorioStatus;
  /**
   * An issue `generation_job` was created after the relatório's latest status op (with no status
   * op yet, after seq 0): a generate was queued since the device last moved the status.
   */
  issueJobSinceLastStatus?: boolean;
  /**
   * The relatório has a latest revision and nothing was edited after its snapshot (AD-15): the
   * generate route's `unchanged` answer, which `advanceOnGenerate` also turns into Em revisão.
   */
  unchangedRevision?: boolean;
  /** The relatório has a revision. */
  hasRevision?: boolean;
}

export type StatusVerdict = 'allowed' | 'refused';

/**
 * The status the device saw when it wrote a status op: the value of the op its `prev_op_id`
 * names when the server log holds that op on this relatório's `relatorio/status` (`logged`), and
 * Rascunho when `prev_op_id` is null (a relatório is born Rascunho, and no status op was seen).
 * Null when `prev_op_id` names an op the log does not hold there: a device stamps the last op it
 * applied on the path, never a dead one, and its ops reach the server in commit order, so such a
 * move was made on top of a status op the server refused (a "Desfazer" committed before the
 * refusal came back). It has no basis and is refused too (`op_status_transition`).
 */
export function statusSeen(input: { prevOpId: string | null; logged: unknown }): RelatorioStatus | null {
  if (input.prevOpId === null) return 'rascunho';
  const logged = input.logged;
  return typeof logged === 'string' && (RELATORIO_STATUSES as readonly string[]).includes(logged) ? (logged as RelatorioStatus) : null;
}

/**
 * True when the move is backward both from the status the server holds and from the one the
 * device saw (e20f, 2026-11-04). The device's `prev_op_id` is its claim, so `seen` may only
 * narrow a move: a status op naming an old Emitido op of a relatório now in Rascunho is not a
 * move back to Em revisão, it is a forward move from Rascunho and needs its generate.
 */
function isBackwardIntent(server: RelatorioStatus, seen: RelatorioStatus, to: RelatorioStatus): boolean {
  return manualMove(server, to) !== null && manualMove(seen, to) !== null;
}

/** True when some event of AD-22's table moves `server` to `to`. */
function isForwardRow(server: RelatorioStatus, to: RelatorioStatus): boolean {
  return STATUS_EVENTS.some((event) => statusTable(server, event) === to);
}

/**
 * The facts of the server's log `statusMoveVerdict` reads for this move, so the server reads
 * nothing it does not need: a forward move to Em revisão from Rascunho or Em campo needs to know
 * whether a generate was queued since the last status op (or, failing that, whether the latest
 * revision is unchanged); a forward move to Emitido needs to know whether a revision exists.
 * Every other move needs none.
 */
export function statusMoveFacts(input: Pick<StatusMoveInput, 'server' | 'seen' | 'to'>): readonly StatusMoveFact[] {
  const { server, seen, to } = input;
  if (isBackwardIntent(server, seen, to) || to === server || !isForwardRow(server, to)) return [];
  if (to === 'em_revisao' && (server === 'rascunho' || server === 'em_campo')) return ['issueJobSinceLastStatus', 'unchangedRevision'];
  if (to === 'emitido') return ['hasRevision'];
  return [];
}

/**
 * Story 20.7: whether a client `relatorio/status` op may apply, from the status the server holds.
 * - A backward move (`manualMove` from the server's status and from what the device saw, e20f)
 *   is always allowed (AD-22: manual backward moves from any state, Emitido to Em revisão on an
 *   edit, every "Desfazer" that steps back). The device's `seen` only narrows: forging
 *   `prev_op_id` gains nothing.
 * - `to === server` is allowed: an idempotent duplicate (two devices completing setup).
 * - Anything else is a forward intent and must be a row of the table from the server's status,
 *   with its precondition: to Em revisão from Rascunho or Em campo needs a generate queued since
 *   the last status op or an unchanged latest revision; to Emitido needs the server at Em revisão
 *   and a revision. A fact the caller did not give counts as false.
 * Two devices with a stale status: one marks a revision as sent while the other, which still sees
 * Rascunho, makes its first field edit; whichever arrives second meets a status from which its
 * move is no row, so the server applies one and refuses the other, in either order.
 */
export function statusMoveVerdict(input: StatusMoveInput): StatusVerdict {
  const { server, seen, to } = input;
  if (isBackwardIntent(server, seen, to)) return 'allowed';
  if (to === server) return 'allowed';
  if (!isForwardRow(server, to)) return 'refused';
  if (to === 'em_revisao' && (server === 'rascunho' || server === 'em_campo')) {
    return input.issueJobSinceLastStatus === true || input.unchangedRevision === true ? 'allowed' : 'refused';
  }
  if (to === 'emitido') return server === 'em_revisao' && input.hasRevision === true ? 'allowed' : 'refused';
  return 'allowed';
}

/** Story 20.7: a relatório is born Rascunho; a `relatorio/{id}` create of any other status is refused. */
export function statusCreateVerdict(status: unknown): StatusVerdict {
  return status === 'rascunho' ? 'allowed' : 'refused';
}

/**
 * Story 20.10 (coordinator's reading, 2026-11-03): an Emitido relatório cannot be removed. A
 * `relatorio/removed_at` remove, or a put of an instant, on a relatório the server holds as
 * Emitido is refused (`op_forbidden`); the office moves it back to Em revisão first, then
 * removes it. A put of null (the restore) is always allowed. This is the one removal rule; who
 * may remove, and roles in general, wait for a dated decision.
 */
export function relatorioRemovalVerdict(server: RelatorioStatus, write: { kind: 'put' | 'remove'; value: unknown }): StatusVerdict {
  const removes = write.kind === 'remove' || write.value !== null;
  return removes && server === 'emitido' ? 'refused' : 'allowed';
}
