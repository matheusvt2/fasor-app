import type { LastPushAt, Op, RelatorioRow, RelatorioSummary, SyncSummary } from '@app/domain';
import { and, asc, desc, eq, gt, isNull, max, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';

/*
 * AD-24: the two streams are queries over the one log, never a stored fan-out.
 * Company stream: `scope = company`. Relatorio stream: ops with that
 * `relatorio_id` united with the project-scope ops of its project, so a
 * relatorio created later receives its project's whole history. Every function
 * takes the session's `CompanyId` (AD-10).
 */

export const SYNC_PULL_PAGE = 500;

export interface PulledPage {
  ops: Op[];
  /** The stream head at the time of the pull, so the device knows whether to continue. */
  head: number;
}

type OpRow = typeof ops.$inferSelect;

function toOp(row: OpRow): Op {
  return {
    op_id: row.op_id,
    kind: row.kind as Op['kind'],
    scope: row.scope as Op['scope'],
    company_id: row.company_id,
    project_id: row.project_id,
    relatorio_id: row.relatorio_id,
    path: row.path,
    value: row.value as Op['value'],
    prev_op_id: row.prev_op_id,
    batch_id: row.batch_id,
    meta: row.meta as Op['meta'],
    actor_id: row.actor_id,
    device_id: row.device_id,
    client_ts: row.client_ts,
    seq: row.seq,
  };
}

type StreamFilter = ReturnType<typeof and>;

async function page(db: Db, filter: StreamFilter, since: number, limit: number): Promise<PulledPage> {
  const [rows, [headRow]] = await Promise.all([
    db.select().from(ops).where(and(filter, gt(ops.seq, since))).orderBy(asc(ops.seq)).limit(limit),
    db.select({ head: max(ops.seq) }).from(ops).where(filter),
  ]);
  return { ops: rows.map(toOp), head: headRow?.head ?? 0 };
}

export function pullCompany(db: Db, companyId: CompanyId, since: number, limit: number = SYNC_PULL_PAGE): Promise<PulledPage> {
  return page(db, and(eq(ops.company_id, companyId), eq(ops.scope, 'company')), since, limit);
}

/** `null` when the relatorio is unknown to this company (the route answers 404). */
export async function pullRelatorio(
  db: Db,
  companyId: CompanyId,
  relatorioId: string,
  since: number,
  limit: number = SYNC_PULL_PAGE,
): Promise<PulledPage | null> {
  const [relatorio] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
  if (!relatorio) return null;
  const projectId = (relatorio.row as RelatorioRow).project_id;
  const filter = and(
    eq(ops.company_id, companyId),
    or(eq(ops.relatorio_id, relatorioId), and(eq(ops.scope, 'project'), eq(ops.project_id, projectId))),
  );
  return page(db, filter, since, limit);
}

/**
 * Epic 4 retro item 17: a project's own stream, its project-scope ops only (the obra's
 * equipment), so a device can reuse the equipment of relatórios it never pulled before it
 * creates another relatório of the obra. `null` when the project is unknown to this
 * company (the route answers 404).
 */
export async function pullProject(
  db: Db,
  companyId: CompanyId,
  projectId: string,
  since: number,
  limit: number = SYNC_PULL_PAGE,
): Promise<PulledPage | null> {
  const [project] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'project'), eq(entities.id, projectId)));
  if (!project) return null;
  const filter = and(eq(ops.company_id, companyId), eq(ops.scope, 'project'), eq(ops.project_id, projectId));
  return page(db, filter, since, limit);
}

/** AD-8: `last_push_at` rows plus the company's live relatorio rows in the summary shape. */
export async function companySummary(db: Db, companyId: CompanyId): Promise<SyncSummary> {
  const [pushes, relatorios] = await Promise.all([
    db
      .select({ user_id: syncDevicePush.user_id, device_id: syncDevicePush.device_id, at: syncDevicePush.last_push_at })
      .from(syncDevicePush)
      .where(eq(syncDevicePush.company_id, companyId))
      // Most recent push first: the order "Último envio" lists them in.
      .orderBy(desc(syncDevicePush.last_push_at), asc(syncDevicePush.user_id), asc(syncDevicePush.device_id)),
    db
      .select({ id: entities.id, row: entities.row, updated_seq: entities.updated_seq })
      .from(entities)
      .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), isNull(entities.removed_at)))
      .orderBy(asc(entities.updated_seq)),
  ]);
  const last_push_at: LastPushAt[] = pushes.map((p) => ({ user_id: p.user_id, device_id: p.device_id, at: p.at }));
  const list: RelatorioSummary[] = relatorios.map(({ id, row, updated_seq }) => {
    const r = row as RelatorioRow;
    return {
      id,
      project_id: r.project_id,
      status: r.status,
      template_id: r.template_id,
      seed_version: r.seed_version,
      updated_seq,
    };
  });
  return { last_push_at, relatorios: list };
}

/** Upsert of `last_push_at` for `(user_id, device_id)`; called once per push that applied at least one op. */
export async function recordPush(db: Db, companyId: CompanyId, userId: string, deviceId: string, at: string): Promise<void> {
  await db
    .insert(syncDevicePush)
    .values({ company_id: companyId, user_id: userId, device_id: deviceId, last_push_at: at })
    .onConflictDoUpdate({
      target: [syncDevicePush.company_id, syncDevicePush.user_id, syncDevicePush.device_id],
      set: { last_push_at: sql`excluded.last_push_at` },
    });
}
