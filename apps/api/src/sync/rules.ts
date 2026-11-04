import {
  attributionIssue,
  createProjectOf,
  entityKey,
  historyClaimHolds,
  latestRevision,
  lowerBoundIssue,
  referenceRowVerdict,
  relatorioRemovalVerdict,
  relatorioStatusSchema,
  responsibleUserIdOf,
  statusMoveFacts,
  statusMoveVerdict,
  statusSeen,
  targetLookupOf,
  targetRowVerdict,
  valueReferencesOf,
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

/**
 * What the checks of one push learned of its relatórios and obras, so a push of a few hundred ops
 * naming the same relatório reads its row and its creation instant once: a relatório found to
 * exist (with its obra), an obra found to exist, and a relatório's creation instant once read.
 * Something not found is never remembered (an earlier op of the same push may create it).
 * Replaced when a batch's savepoint rolls back, since the rows it names may be gone (`applyOps`).
 */
export interface ClientCheckCache {
  /** Relatório id to its obra (`project_id`). */
  relatorios: Map<string, string>;
  projects: Set<string>;
  createdAt: Map<string, string>;
}

export function clientCheckCache(): ClientCheckCache {
  return { relatorios: new Map(), projects: new Set(), createdAt: new Map() };
}

/** What `checkClientOp` reads besides the transaction. */
export interface ClientCheckDeps {
  /** The rows `targetsOf(op)` names, loaded under the push's lock before the op is logged. */
  state: ReadonlyMap<EntityKey, EntityRow>;
  now: Clock;
  /** The push's own cache (`clientCheckCache`); absent, every lookup reads the database. */
  cache?: ClientCheckCache;
}

/** A pathed op (after the merge redirect), as `applyOneIn` holds it. */
interface Target {
  op: Op;
  path: OpPath;
}

/**
 * The refusal code of a client op under the rules that read server state, or null when it may
 * apply. In order: the target and the obra a create files its row under (Story 20.10), the status
 * move (20.7), the removal of an Emitido relatório (20.10), the responsible user (`op_value_invalid`)
 * and, e20f, every other row the op names (`op_target_missing`), then
 * the attribution history and the lower bound of its instants (20.8). A refused op writes nothing.
 */
export async function checkClientOp(tx: Tx, companyId: CompanyId, target: Target, deps: ClientCheckDeps): Promise<OpRejectCode | null> {
  const { op, path } = target;
  if (!(await targetHolds(tx, companyId, op, path, deps.state, deps.cache))) return 'op_target_missing';
  const project = createProjectOf(op, path);
  if (project !== null && !(await projectExists(tx, companyId, project, deps.cache))) return 'op_target_missing';

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
  // e20f: every other id the op names (REFERENCE_FIELDS) exists where the op is filed.
  if (!(await referencesHold(tx, companyId, op, path, deps.state, deps.cache))) return 'op_target_missing';

  return attributionStateIssue(tx, companyId, op, path, deps.now, deps.cache);
}

function relatorioOf(op: Op, state: ReadonlyMap<EntityKey, EntityRow>): RelatorioRow | undefined {
  return op.relatorio_id == null ? undefined : (state.get(entityKey('relatorio', op.relatorio_id)) as RelatorioRow | undefined);
}

/** The obra of a relatório the company holds (live or tombstoned), or null when it holds none of that id. */
async function relatorioProjectOf(tx: Tx, companyId: CompanyId, relatorioId: string, state: ReadonlyMap<EntityKey, EntityRow>, cache: ClientCheckCache | undefined): Promise<string | null> {
  const known = cache?.relatorios.get(relatorioId);
  if (known !== undefined) return known;
  const row = (state.get(entityKey('relatorio', relatorioId)) ?? (await rowOf(tx, companyId, 'relatorio', relatorioId))) as RelatorioRow | undefined;
  if (row === undefined) return null;
  cache?.relatorios.set(relatorioId, row.project_id);
  return row.project_id;
}

/** Story 20.10: the op's target exists in the relatório (or obra) it names. */
async function targetHolds(tx: Tx, companyId: CompanyId, op: Op, path: OpPath, state: ReadonlyMap<EntityKey, EntityRow>, cache: ClientCheckCache | undefined): Promise<boolean> {
  const lookup = targetLookupOf(op, path);
  switch (lookup.kind) {
    case 'none':
      return true;
    case 'refused':
      return false;
    case 'relatorio':
      return (await relatorioProjectOf(tx, companyId, lookup.id, state, cache)) !== null;
    case 'row':
      return targetRowVerdict(op, lookup.entity, state.get(entityKey(lookup.entity, lookup.id))) === 'allowed';
  }
}

/** Story 20.10 (review): the obra an equipment or relatório create names is a project of the company. */
async function projectExists(tx: Tx, companyId: CompanyId, projectId: string, cache: ClientCheckCache | undefined): Promise<boolean> {
  if (cache?.projects.has(projectId) === true) return true;
  const exists = (await rowOf(tx, companyId, 'project', projectId)) !== undefined;
  if (exists) cache?.projects.add(projectId);
  return exists;
}

/**
 * Story 20.10 (review), widened by e20f: every row the op names by id (`REFERENCE_FIELDS`: a
 * point's equipment or local, a photo's block or local, a block's local, equipment or feeding
 * block, a local's parent, the cover photo, the instruments, the client, the brand
 * files, the confirmed suggestion) exists and belongs where the op is filed (`referenceRowVerdict`).
 */
async function referencesHold(tx: Tx, companyId: CompanyId, op: Op, path: OpPath, state: ReadonlyMap<EntityKey, EntityRow>, cache: ClientCheckCache | undefined): Promise<boolean> {
  const references = valueReferencesOf(op, path);
  if (references.length === 0) return true;
  const relatorioProject = op.relatorio_id == null ? null : await relatorioProjectOf(tx, companyId, op.relatorio_id, state, cache);
  for (const reference of references) {
    const row = state.get(entityKey(reference.entity, reference.id)) ?? (await rowOf(tx, companyId, reference.entity, reference.id));
    if (referenceRowVerdict(op, reference, row, relatorioProject) === 'refused') return false;
  }
  return true;
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
  const seen = statusSeen({ prevOpId, logged });
  // Review: a move from a status op the log does not hold (one the server refused) has no basis.
  if (seen === null) return 'op_status_transition';
  const base = { server: row.status, seen, to: to.data };
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
async function attributionStateIssue(tx: Tx, companyId: CompanyId, op: Op, path: OpPath, now: Clock, cache: ClientCheckCache | undefined): Promise<OpRejectCode | null> {
  const check = attributionIssue(op, path, now());
  // The stateless half refused this op already in the push route's validation.
  if (!check.ok) return 'op_attribution';
  for (const claim of check.pending.history) {
    if (!historyClaimHolds(claim, await historyOf(tx, companyId, op, claim))) return 'op_attribution';
  }
  if (check.pending.bounded.length === 0 || op.relatorio_id == null) return null;
  let createdAt = cache?.createdAt.get(op.relatorio_id) ?? null;
  if (createdAt === null) {
    createdAt = await relatorioCreatedAt(tx, companyId, op.relatorio_id);
    if (createdAt !== null) cache?.createdAt.set(op.relatorio_id, createdAt);
  }
  return createdAt !== null && lowerBoundIssue(check.pending.bounded, createdAt) !== null ? 'op_attribution' : null;
}

/**
 * The earlier logged op a history claim's rule needs: the colleague's op on the op's path (for
 * `same_path_value`, one whose value holds the same id at the claim's pointer, filtered in SQL so an
 * older one is found however many ops the path holds), or any colleague's op in the relatório.
 */
async function historyOf(tx: Tx, companyId: CompanyId, op: Op, claim: HistoryClaim): Promise<{ actor_id: string; value: unknown }[]> {
  if (claim.rule === 'same_relatorio_actor') {
    if (op.relatorio_id == null) return [];
    return tx
      .select({ actor_id: ops.actor_id, value: ops.value })
      .from(ops)
      .where(and(eq(ops.company_id, companyId), eq(ops.relatorio_id, op.relatorio_id), eq(ops.actor_id, claim.actorId)))
      .limit(1);
  }
  // The pointer's keys are the table's own (`actor_id`, `by`, `concluded_by`): a text[] path for `#>>`.
  const holdsSameId = claim.rule === 'same_path_value' ? sql`${ops.value} #>> ${`{${claim.pointer.join(',')}}`}::text[] = ${claim.actorId}` : undefined;
  return tx
    .select({ actor_id: ops.actor_id, value: ops.value })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, op.path), eq(ops.actor_id, claim.actorId), op.relatorio_id == null ? undefined : eq(ops.relatorio_id, op.relatorio_id), holdsSameId))
    .limit(1);
}

/**
 * The relatório's creation instant: the earlier of its `relatorio/{id}` create's `client_ts` and the
 * instant the server received it (a creating device's clock may itself run up to the skew fast), or null.
 */
async function relatorioCreatedAt(tx: Tx, companyId: CompanyId, relatorioId: string): Promise<string | null> {
  const [create] = await tx
    .select({ client_ts: ops.client_ts, received_at: ops.received_at })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, `relatorio/${relatorioId}`), eq(ops.kind, 'create')))
    .orderBy(ops.seq)
    .limit(1);
  if (create === undefined) return null;
  return Date.parse(create.received_at) < Date.parse(create.client_ts) ? create.received_at : create.client_ts;
}
