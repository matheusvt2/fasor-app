import {
  audioFileRowSchema,
  audioPermissionPath,
  can,
  isHoldingAudioStatus,
  permissionForPath,
  attributionIssue,
  createProjectOf,
  entityKey,
  historyClaimHolds,
  latestRevision,
  lowerBoundIssue,
  referenceRowVerdict,
  RELATORIO_BUDGET_SERVER_ENTITIES,
  RELATORIO_MAX_BYTES,
  relatorioBudgetGrowth,
  relatorioBudgetRowBytes,
  relatorioBudgetVerdict,
  relatorioRemovalVerdict,
  relatorioStatusSchema,
  reopenNeed,
  responsibleUserIdOf,
  statusMoveFacts,
  statusMoveVerdict,
  statusSeen,
  targetLookupOf,
  targetRowVerdict,
  valueReferencesOf,
  type Clock,
  type Entity,
  type EntityKey,
  type EntityRow,
  type HistoryClaim,
  type Op,
  type OpPath,
  type OpRejectCode,
  type RelatorioRow,
  type RelatorioStatus,
  type RoleRow,
  type StatusMoveInput,
  vectorGroupPublishIssue,
} from '@app/domain';
import { and, desc, eq, isNull, ne, notInArray, sql } from 'drizzle-orm';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { liveRevisions } from '../db/repositories/revisions.ts';
import { roleOfUser } from '../db/roles.ts';
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
  /** e20f: a relatório's stored bytes, read once, then moved by the growth of each op that passes the budget (E20-A1). */
  relatorioBytes: Map<string, number>;
  /** Story 26.4: the actor's role (null for none), read once per push. */
  roles: Map<string, RoleRow | null>;
  /**
   * e26r (2026-11-22): a relatório's status as the server holds it, read once for an actor that
   * does not issue; forgotten at each `relatorio/status` op, the one family that moves it.
   */
  statuses?: Map<string, RelatorioStatus | null>;
}

export function clientCheckCache(): ClientCheckCache {
  return { relatorios: new Map(), projects: new Set(), createdAt: new Map(), relatorioBytes: new Map(), roles: new Map(), statuses: new Map() };
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
 * Story 26.4: first of all, the actor's role must hold the op's key (`roleIssue`, `op_forbidden`).
 * Story 27.1: then a create of a second live `empresa` row is refused `op_forbidden` (`holdsOtherEmpresa`).
 * Story 24.20: then, a published version whose ratio table can never compute
 * (`vectorGroupPublishIssue`) is refused `op_invalid`, the code a strict-schema refusal of a publish
 * gets; the rule is the push route's, not the fold's, so a version published before it still folds.
 */
export async function checkClientOp(tx: Tx, companyId: CompanyId, target: Target, deps: ClientCheckDeps): Promise<OpRejectCode | null> {
  const { op, path } = target;
  // Story 26.4 (AD-29): the actor's role must hold the key the op needs, first of all.
  const forbidden = await roleIssue(tx, companyId, op, path, deps.state, deps.cache);
  if (forbidden !== null) return forbidden;
  // e31f: a dismiss needs the key of the audio's own field, and an audio already transcribed is not dismissed.
  const dismiss = await audioDismissIssue(tx, companyId, op, path, deps.state, deps.cache);
  if (dismiss !== null) return dismiss;
  // Story 27.1 (F1, contract 56): beside the role's check, a company holds one live `empresa` row.
  const revived = revivedEmpresaId(op, path);
  if (revived !== null && (await holdsOtherEmpresa(tx, companyId, revived))) return 'op_forbidden';
  if (path.family === 'equipment_type_version' && op.kind === 'create' && op.value !== null && typeof op.value === 'object' && vectorGroupPublishIssue((op.value as { definition?: object }).definition) !== null) return 'op_invalid';
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

  const attribution = await attributionStateIssue(tx, companyId, op, path, deps.now, deps.cache);
  if (attribution !== null) return attribution;
  return budgetIssue(tx, companyId, op, deps.state, deps.cache);
}

/**
 * Story 26.4 (AD-29): `op_forbidden` when the key the op needs (`permissionForPath`) is one the
 * actor's role does not hold (`can`). The role is the row the actor's user row names, read once
 * per push inside its transaction (`cache.roles`); a user with no role, or a role the company does
 * not hold, holds no key (fail closed). An op that needs no key passes.
 *
 * 2026-11-22 (Matheus, "sim nos dois", e26r): leaving Emitido needs `relatorio.issue`. For an actor
 * whose role does not issue, an op into a relatório the server holds as Emitido that would reopen it
 * (a status move away, or an edit AD-22 counts, `reopenNeed`) is refused `op_forbidden` too, judged
 * by the status the server holds, never the op's claim. A role that issues reads nothing more.
 */
async function roleIssue(
  tx: Tx,
  companyId: CompanyId,
  op: Op,
  path: OpPath,
  state: ReadonlyMap<EntityKey, EntityRow>,
  cache: ClientCheckCache | undefined,
): Promise<OpRejectCode | null> {
  const need = permissionForPath(path, op);
  if (need === 'none') return null;
  let role = cache?.roles.get(op.actor_id);
  if (role === undefined) {
    role = (await roleOfUser(tx, companyId, op.actor_id)).role;
    cache?.roles.set(op.actor_id, role);
  }
  if (!can(role, need)) return 'op_forbidden';
  if (op.relatorio_id == null || can(role, 'relatorio.issue')) return null;
  const status = await serverRelatorioStatus(tx, companyId, op.relatorio_id, state, cache);
  // A status op moves the status: the next op of the push reads it again.
  if (path.family === 'relatorio/status') cache?.statuses?.delete(op.relatorio_id);
  return reopenNeed(op, status) === 'none' ? null : 'op_forbidden';
}

/**
 * e31f (review of Epic 31): a device's "Dispensar" (`file/{id}/audio_status` put of `dismissed`, the
 * only client value `clientReadingPutIsValid` lets through) is judged on the audio the server holds:
 * it needs the key of the audio's own field (`audioPermissionPath`, as its create did), not only the
 * `file/field` family's `relatorio.fill` (`op_forbidden`); and it is accepted from every status that
 * holds or from `dismissed` again, never on an audio already `done` (`op_invalid`). A put on a row
 * that is not an audio is the fold's no-op and passes.
 */
async function audioDismissIssue(
  tx: Tx,
  companyId: CompanyId,
  op: Op,
  path: OpPath,
  state: ReadonlyMap<EntityKey, EntityRow>,
  cache: ClientCheckCache | undefined,
): Promise<OpRejectCode | null> {
  if (op.kind !== 'put' || path.family !== 'file/field' || path.field !== 'audio_status') return null;
  const parsed = audioFileRowSchema.safeParse(state.get(entityKey('file', path.id)));
  if (!parsed.success) return null;
  const audio = parsed.data;
  const need = permissionForPath(audioPermissionPath(audio.audio_target), { kind: 'put', value: null });
  if (need !== 'none') {
    let role = cache?.roles.get(op.actor_id);
    if (role === undefined) {
      role = (await roleOfUser(tx, companyId, op.actor_id)).role;
      cache?.roles.set(op.actor_id, role);
    }
    if (!can(role, need)) return 'op_forbidden';
  }
  return isHoldingAudioStatus(audio.audio_status) || audio.audio_status === 'dismissed' ? null : 'op_invalid';
}

/** e26r: the status of a relatório as the server holds it (null when it holds none). */
async function serverRelatorioStatus(
  tx: Tx,
  companyId: CompanyId,
  relatorioId: string,
  state: ReadonlyMap<EntityKey, EntityRow>,
  cache: ClientCheckCache | undefined,
): Promise<RelatorioStatus | null> {
  const known = cache?.statuses?.get(relatorioId);
  if (known !== undefined) return known;
  const row = (state.get(entityKey('relatorio', relatorioId)) ?? (await rowOf(tx, companyId, 'relatorio', relatorioId))) as RelatorioRow | undefined;
  const parsed = relatorioStatusSchema.safeParse(row?.status);
  const status = parsed.success ? parsed.data : null;
  cache?.statuses?.set(relatorioId, status);
  return status;
}

/**
 * Story 27.1 (F1, contract 56): the id of the `empresa` registry row an op would make live, or null: its create, and
 * (fix batch e27a-review, R5) the restore of a removed one, a put of null on
 * `registry/empresa/{id}/removed_at` (the registry panels' "Desfazer" of a removal writes that put).
 */
function revivedEmpresaId(op: Op, path: OpPath): string | null {
  if (path.family === 'registry') return path.kind === 'empresa' && op.kind === 'create' ? path.id : null;
  if (path.family === 'registry/field') return path.kind === 'empresa' && path.field === 'removed_at' && op.kind === 'put' && op.value === null ? path.id : null;
  return null;
}

/**
 * Story 27.1 (F1, contract 56): whether the company already holds a live `empresa` registry row
 * with another id than `id`. A create of a second one is refused `op_forbidden` (no code added),
 * so the first row stays the company's only one; a create of the same id (a re-sent op) and every
 * put on the row still apply. Two rows written before the rule are read through `pickEmpresa`.
 * Fix batch e27a-review (R5): the restore of a removed row is refused the same way while another
 * live one exists (`revivedEmpresaId`); the restore of the company's only row still applies.
 */
async function holdsOtherEmpresa(tx: Tx, companyId: CompanyId, id: string): Promise<boolean> {
  const [found] = await tx
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        eq(entities.entity, 'registry'),
        isNull(entities.removed_at),
        ne(entities.id, id),
        sql`${entities.row}->>'kind' = 'empresa'`,
      ),
    )
    .limit(1);
  return found !== undefined;
}

/**
 * e20f (aggregate), E20-A1 (R-1): the relatório's budget of stored bytes (`relatorioBudgetVerdict`).
 * The op is judged by its growth (`relatorioBudgetGrowth`, over the rows it targets, tombstoned
 * ones included), so a shrinking put applies and a restore counts the row it revives. Only an op
 * that grows the relatório reads the stored side: its live rows of client kinds, read once per
 * push through the live-rows index and each measured in JS by the same serializer as the op side
 * (`relatorioBudgetRowBytes`; Postgres' `jsonb` text adds a space after every `,` and `:`, so its
 * `octet_length` overstates the stored rows). The push's cache then moves by each passing op's
 * growth, so a push cannot cross the budget op by op.
 */
async function budgetIssue(tx: Tx, companyId: CompanyId, op: Op, state: ReadonlyMap<EntityKey, EntityRow>, cache: ClientCheckCache | undefined): Promise<OpRejectCode | null> {
  if (op.relatorio_id == null) return null;
  const relatorioId = op.relatorio_id;
  const growth = relatorioBudgetGrowth(state, op);
  const known = cache?.relatorioBytes.get(relatorioId);
  // Allowed even on a full relatório (it adds nothing, or it is a put of null): nothing to read.
  if (relatorioBudgetVerdict(op, RELATORIO_MAX_BYTES, growth) === 'allowed') {
    if (known !== undefined) cache?.relatorioBytes.set(relatorioId, known + growth);
    return null;
  }
  const stored = known ?? (await storedRelatorioBytes(tx, companyId, relatorioId));
  if (relatorioBudgetVerdict(op, stored, growth) === 'refused') return 'op_value_invalid';
  cache?.relatorioBytes.set(relatorioId, stored + growth);
  return null;
}

/** The bytes the relatório's live rows of client kinds hold (`relatorioBudgetRowBytes` summed). */
async function storedRelatorioBytes(tx: Tx, companyId: CompanyId, relatorioId: string): Promise<number> {
  const rows = await tx
    .select({ entity: entities.entity, row: entities.row })
    .from(entities)
    .where(
      and(
        eq(entities.company_id, companyId),
        eq(entities.relatorio_id, relatorioId),
        isNull(entities.removed_at),
        notInArray(entities.entity, [...RELATORIO_BUDGET_SERVER_ENTITIES]),
      ),
    );
  let bytes = 0;
  for (const { entity, row } of rows) bytes += relatorioBudgetRowBytes(entity as Entity, row, relatorioId);
  return bytes;
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
