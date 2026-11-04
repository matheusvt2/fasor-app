import {
  attributionIssue,
  entityKey,
  historyClaimHolds,
  latestRevision,
  lowerBoundIssue,
  relatorioRemovalVerdict,
  relatorioStatusSchema,
  responsibleUserIdOf,
  statusMoveFacts,
  statusMoveVerdict,
  statusSeen,
  targetLookupOf,
  targetRowVerdict,
  type Clock,
  type EntityKey,
  type EntityRow,
  type HistoryClaim,
  type Op,
  type OpPath,
  type OpRejectCode,
  type RelatorioRow,
  type StatusMoveInput,
} from '@app/domain';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { liveRevisions } from '../db/repositories/revisions.ts';
import { entities, ops } from '../db/schema.ts';
import type { Tx } from './apply.ts';
import { editedAfter } from './edited-after.ts';

/*
 * Stories 20.7 to 20.10 (2026-11-03, contract 29): the server-state half of the business rules a
 * client op must keep. Every rule is the kernel's (`statusMoveVerdict`, `relatorioRemovalVerdict`,
 * `targetRowVerdict`, `historyClaimHolds`, `lowerBoundIssue`); this file only loads, inside the
 * push's transaction and under the company lock, what each rule needs: the rows `targetsOf` names,
 * the status op a device saw, the jobs and revisions of the relatório, its creation instant, the
 * users of the company and the history of a path. A row an earlier op of the same push created is
 * there, since every op of a push applies in one transaction in array order. Server ops are never
 * checked here (`applyOneIn` calls this for `origin: 'client'` only).
 */

/** What `checkClientOp` reads besides the transaction. */
export interface ClientCheckDeps {
  /** The rows `targetsOf(op)` names, loaded under the push's lock before the op is logged. */
  state: ReadonlyMap<EntityKey, EntityRow>;
  now: Clock;
}

/** A pathed op (after the merge redirect), as `applyOneIn` holds it. */
interface Target {
  op: Op;
  path: OpPath;
}

/**
 * The refusal code of a client op under the rules that read server state, or null when it may
 * apply. In order: the target (Story 20.10), the status move (20.7), the removal of an Emitido
 * relatório (20.10), the responsible user (20.10), then the attribution history and the lower bound
 * of its instants (20.8). A refused op writes nothing.
 */
export async function checkClientOp(tx: Tx, companyId: CompanyId, target: Target, deps: ClientCheckDeps): Promise<OpRejectCode | null> {
  const { op, path } = target;
  if (!(await targetHolds(tx, companyId, op, path, deps.state))) return 'op_target_missing';

  if (path.family === 'relatorio/status' && op.kind === 'put') {
    const code = await statusIssue(tx, companyId, op, deps.state);
    if (code !== null) return code;
  }

  if (path.family === 'relatorio/removed_at' && op.kind !== 'create') {
    const row = relatorioOf(op, deps.state);
    if (row !== undefined && relatorioRemovalVerdict(row.status, { kind: op.kind, value: op.value }) === 'refused') return 'op_forbidden';
  }

  const responsible = responsibleUserIdOf(op, path);
  if (responsible !== null && !(await isCompanyUser(tx, companyId, responsible))) return 'op_value_invalid';

  return attributionStateIssue(tx, companyId, op, path, deps.now);
}

function relatorioOf(op: Op, state: ReadonlyMap<EntityKey, EntityRow>): RelatorioRow | undefined {
  return op.relatorio_id == null ? undefined : (state.get(entityKey('relatorio', op.relatorio_id)) as RelatorioRow | undefined);
}

/** Story 20.10: the op's target exists in the relatório (or obra) it names. */
async function targetHolds(tx: Tx, companyId: CompanyId, op: Op, path: OpPath, state: ReadonlyMap<EntityKey, EntityRow>): Promise<boolean> {
  const lookup = targetLookupOf(op, path);
  switch (lookup.kind) {
    case 'none':
      return true;
    case 'refused':
      return false;
    case 'relatorio':
      return (state.get(entityKey('relatorio', lookup.id)) ?? (await rowOf(tx, companyId, 'relatorio', lookup.id))) !== undefined;
    case 'row':
      return targetRowVerdict(op, lookup.entity, state.get(entityKey(lookup.entity, lookup.id))) === 'allowed';
  }
}

async function rowOf(tx: Tx, companyId: CompanyId, entity: string, id: string): Promise<EntityRow | undefined> {
  const [found] = await tx
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)))
    .limit(1);
  return found?.row;
}

async function isCompanyUser(tx: Tx, companyId: CompanyId, userId: string): Promise<boolean> {
  return (await rowOf(tx, companyId, 'user', userId)) !== undefined;
}

/** Story 20.7: the status move a client `relatorio/status` put makes, judged from the server's status. */
async function statusIssue(tx: Tx, companyId: CompanyId, op: Op, state: ReadonlyMap<EntityKey, EntityRow>): Promise<OpRejectCode | null> {
  const row = relatorioOf(op, state);
  const to = relatorioStatusSchema.safeParse(op.value);
  // No row: the target check refused already. No status: the row schema refuses it in applyOp (op_invalid).
  if (row === undefined || !to.success) return null;
  const relatorioId = row.id;
  const prevOpId = op.prev_op_id ?? null;
  const logged = prevOpId === null ? undefined : await loggedStatusValue(tx, companyId, relatorioId, prevOpId);
  const base = { server: row.status, seen: statusSeen({ prevOpId, logged, server: row.status }), to: to.data };
  const needs = statusMoveFacts(base);
  const facts: Partial<Pick<StatusMoveInput, 'issueJobSinceLastStatus' | 'unchangedRevision' | 'hasRevision'>> = {};
  if (needs.includes('issueJobSinceLastStatus')) facts.issueJobSinceLastStatus = await issueJobSinceLastStatus(tx, companyId, relatorioId);
  // Only asked when the queued generate did not settle it (the verdict reads either one).
  if (needs.includes('unchangedRevision') && facts.issueJobSinceLastStatus !== true) facts.unchangedRevision = await unchangedRevision(tx, companyId, relatorioId, row.project_id);
  if (needs.includes('hasRevision')) facts.hasRevision = (await liveRevisions(tx, companyId, relatorioId)).length > 0;
  return statusMoveVerdict({ ...base, ...facts }) === 'allowed' ? null : 'op_status_transition';
}

/** The value of the status op `prev_op_id` names, when the log holds it on this relatório's `relatorio/status`. */
async function loggedStatusValue(tx: Tx, companyId: CompanyId, relatorioId: string, opId: string): Promise<unknown> {
  const [found] = await tx
    .select({ value: ops.value })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.op_id, opId), eq(ops.path, 'relatorio/status'), eq(ops.relatorio_id, relatorioId)))
    .limit(1);
  return found?.value;
}

/** An issue `generation_job` was created after the relatório's latest status op (with none yet, after seq 0). */
async function issueJobSinceLastStatus(tx: Tx, companyId: CompanyId, relatorioId: string): Promise<boolean> {
  const [job] = await tx
    .select({ seq: ops.seq })
    .from(ops)
    .where(
      and(
        eq(ops.company_id, companyId),
        eq(ops.relatorio_id, relatorioId),
        eq(ops.kind, 'create'),
        sql`${ops.path} like 'generation\_job/%'`,
        sql`${ops.value}->>'kind' = 'issue'`,
      ),
    )
    .orderBy(desc(ops.seq))
    .limit(1);
  if (job === undefined) return false;
  const [status] = await tx
    .select({ seq: ops.seq })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.relatorio_id, relatorioId), eq(ops.path, 'relatorio/status')))
    .orderBy(desc(ops.seq))
    .limit(1);
  return job.seq > (status?.seq ?? 0);
}

/** The relatório's latest revision exists and nothing was edited after its snapshot: the generate route's `unchanged`. */
async function unchangedRevision(tx: Tx, companyId: CompanyId, relatorioId: string, projectId: string): Promise<boolean> {
  const latest = latestRevision(await liveRevisions(tx, companyId, relatorioId));
  return latest !== null && !(await editedAfter(tx, companyId, relatorioId, projectId, latest.snapshot_seq));
}

/** Story 20.8: the history claims and the lower bound of a client op's attribution. */
async function attributionStateIssue(tx: Tx, companyId: CompanyId, op: Op, path: OpPath, now: Clock): Promise<OpRejectCode | null> {
  const check = attributionIssue(op, path, now());
  // The stateless half refused this op already in the push route's validation.
  if (!check.ok) return 'op_attribution';
  for (const claim of check.pending.history) {
    if (!historyClaimHolds(claim, await historyOf(tx, companyId, op, claim))) return 'op_attribution';
  }
  if (check.pending.bounded.length === 0 || op.relatorio_id == null) return null;
  const createdAt = await relatorioCreatedAt(tx, companyId, op.relatorio_id);
  return createdAt !== null && lowerBoundIssue(check.pending.bounded, createdAt) !== null ? 'op_attribution' : null;
}

/** The earlier logged ops a history claim's rule reads: the colleague's ops on the op's path, or in its relatório. */
async function historyOf(tx: Tx, companyId: CompanyId, op: Op, claim: HistoryClaim): Promise<{ actor_id: string; value: unknown }[]> {
  if (claim.rule === 'same_relatorio_actor') {
    if (op.relatorio_id == null) return [];
    return tx
      .select({ actor_id: ops.actor_id, value: ops.value })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.relatorio_id, op.relatorio_id), eq(ops.actor_id, claim.actorId)))
      .limit(1);
  }
  return tx
    .select({ actor_id: ops.actor_id, value: ops.value })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, op.path), eq(ops.actor_id, claim.actorId), op.relatorio_id == null ? undefined : eq(ops.relatorio_id, op.relatorio_id)))
    .orderBy(desc(ops.seq))
    .limit(100);
}

/** The relatório's creation instant: the `client_ts` of its `relatorio/{id}` create in the log, or null. */
async function relatorioCreatedAt(tx: Tx, companyId: CompanyId, relatorioId: string): Promise<string | null> {
  const [create] = await tx
    .select({ client_ts: ops.client_ts })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, `relatorio/${relatorioId}`), eq(ops.kind, 'create')))
    .orderBy(ops.seq)
    .limit(1);
  return create?.client_ts ?? null;
}
