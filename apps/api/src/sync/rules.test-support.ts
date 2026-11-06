import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  instantiateTemplate,
  makeOp,
  SERVER_DEVICE_ID,
  standardTemplate,
  syncPushResponseSchema,
  toIso,
  type JsonValue,
  type Op,
  type OpInput,
  type RelatorioStatus,
  type SyncPushResponse,
} from '@app/domain';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { expect } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { entities, ops, syncDevicePush } from '../db/schema.ts';
import { newId } from '../ids.ts';
import { applyOps } from './apply.ts';

/*
 * Stories 20.7 to 20.10 (contract 29): the harness the four business-rule suites share. Every push
 * goes through `POST /api/sync/ops` of the compose api with a real session of a seeded user, as a
 * device sends it; the state a device cannot write (an issue job, a revision, a colleague's own op)
 * is applied as the server writes it (`applyOps`, `origin: 'server'`). Every row a suite wrote is
 * removed afterwards, by the relatórios and obras it created and by the ids it pushed.
 */

export const apiUrl = process.env.API_URL ?? 'http://api:3000';
export type Company = (typeof TEST_SEED.companies)[number];
export const companyA = TEST_SEED.companies[0];
export const companyB = TEST_SEED.companies[1];

/** What one op draft names; the envelope's company, actor and device come from the harness. */
export interface DraftInput {
  kind: Op['kind'];
  path: string;
  value?: unknown;
  scope?: Op['scope'];
  relatorio_id?: string | null;
  project_id?: string | null;
  prev_op_id?: string | null;
  batch_id?: string | null;
  meta?: Op['meta'];
  actor_id?: string;
  device_id?: string;
}

/** A relatório of the standard template, pushed as one client batch with its obra. */
export interface SeededRelatorio {
  relatorioId: string;
  projectId: string;
  /** The equipment sheets, in template order. */
  blocks: { id: string; equipmentId: string; locationId: string; blockType: string }[];
  /** A cabine (local) of the relatório. */
  locationId: string;
  createOp: Op;
}

export function routeHarness(deviceId: string) {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
  const written = { opIds: new Set<string>(), entityIds: new Set<string>(), streams: new Set<string>(), devices: new Set<string>([deviceId]) };
  const cookies = new Map<string, string>();

  function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin: apiUrl,
      [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
      ...(init.headers as Record<string, string> | undefined),
    };
    return fetch(`${apiUrl}${path}`, { ...init, redirect: 'manual', headers });
  }

  async function cookieFor(company: Company, fresh = false): Promise<string> {
    const cached = cookies.get(company.email);
    if (cached !== undefined && !fresh) return cached;
    const res = await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: company.email, password: TEST_SEED.password }) });
    expect(res.status, await res.clone().text()).toBe(200);
    const cookie = res.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    cookies.set(company.email, cookie);
    return cookie;
  }

  /** An authenticated call that signs in again once on a 401 (another suite may have re-seeded the users). */
  async function authed(company: Company, path: string, init: RequestInit = {}): Promise<Response> {
    const attempt = async (fresh: boolean) => call(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie: await cookieFor(company, fresh) } });
    const first = await attempt(false);
    return first.status === 401 ? attempt(true) : first;
  }

  function track(batch: readonly Op[]): void {
    for (const op of batch) {
      written.opIds.add(op.op_id);
      if (op.device_id !== SERVER_DEVICE_ID) written.devices.add(op.device_id);
      if (op.relatorio_id != null) written.streams.add(op.relatorio_id);
      if (op.project_id != null) written.streams.add(op.project_id);
      if (op.kind === 'create') written.entityIds.add(op.path.split('/').at(-1)!);
    }
  }

  /** The raw answer of a push of `body` (an object, or a string sent as it is). */
  async function pushRaw(company: Company, body: unknown): Promise<Response> {
    return authed(company, '/api/sync/ops', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  }

  /** A push the server answers 200; its answer, parsed. */
  async function push(company: Company, batch: readonly Op[]): Promise<SyncPushResponse> {
    track(batch);
    const res = await pushRaw(company, { ops: batch });
    expect(res.status, await res.clone().text()).toBe(200);
    return syncPushResponseSchema.parse(await res.json());
  }

  /** A client op of `company`'s user from this harness's device (or `input.device_id`). */
  function clientOp(company: Company, input: DraftInput, at: Date = new Date()): Op {
    const draft: OpInput = {
      kind: input.kind,
      scope: input.scope ?? 'relatorio',
      company_id: company.companyId,
      project_id: input.project_id ?? null,
      relatorio_id: input.relatorio_id ?? null,
      path: input.path,
      value: (input.value ?? null) as JsonValue,
      prev_op_id: input.prev_op_id ?? null,
      batch_id: input.batch_id ?? null,
      meta: input.meta ?? null,
      actor_id: input.actor_id ?? company.userId,
      device_id: input.device_id ?? deviceId,
    };
    return makeOp(draft, { newId, now: at });
  }

  /** Applies ops as the server writes them (an issue job, a revision, a colleague's own op): never checked. */
  async function serverApply(company: Company, batch: readonly Op[]): Promise<void> {
    track(batch);
    const result = await applyOps(db, asCompanyId(company.companyId), batch, { origin: 'server', now: () => new Date() });
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
  }

  /** A relatório of the standard template and its obra, pushed as one client batch at `at` (Rascunho). */
  async function seedRelatorio(company: Company, at: Date = new Date()): Promise<SeededRelatorio> {
    const projectId = newId();
    const project = clientOp(company, { kind: 'create', scope: 'company', path: `project/${projectId}`, value: { id: projectId, client_id: null, name: 'Obra das regras', site: null, removed_at: null } }, at);
    const { relatorioId, drafts } = instantiateTemplate(
      standardTemplate({ id: newId() }),
      { id: projectId },
      { service_start: '2026-11-01', service_end: '2026-11-02', existingEquipment: [], responsible_user_id: null },
      { newId, actorId: company.userId, companyId: company.companyId },
    );
    const batchId = newId();
    const created = drafts.map((draft) => makeOp({ ...draft, batch_id: batchId, device_id: deviceId }, { newId, now: at }));
    const result = await push(company, [project, ...created]);
    expect(result.rejected, JSON.stringify(result.rejected)).toEqual([]);
    written.streams.add(projectId);
    const rows = (prefix: string) => created.filter((op) => op.kind === 'create' && op.path.startsWith(prefix)).map((op) => op.value as Record<string, unknown>);
    const blocks = rows('block/')
      .filter((row) => row.equipment_id !== null)
      .map((row) => ({ id: row.id as string, equipmentId: row.equipment_id as string, locationId: row.location_id as string, blockType: row.block_type as string }));
    const cabine = rows('location/').find((row) => row.kind === 'cabine')!;
    return { relatorioId, projectId, blocks, locationId: cabine.id as string, createOp: created.find((op) => op.path === `relatorio/${relatorioId}`)! };
  }

  /** The server's row of an entity, or undefined. */
  async function rowOf<T>(company: Company, entity: string, id: string): Promise<T | undefined> {
    const [found] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, company.companyId), eq(entities.entity, entity), eq(entities.id, id)));
    return found?.row as T | undefined;
  }

  /** Whether the log holds an op of that id (in any company). */
  async function logged(opId: string): Promise<boolean> {
    return (await db.select({ seq: ops.seq }).from(ops).where(eq(ops.op_id, opId))).length > 0;
  }

  /** The latest `relatorio/status` op the server holds for the relatório (what a device saw last). */
  async function latestStatusOp(company: Company, relatorioId: string): Promise<{ op_id: string; value: unknown } | undefined> {
    const [found] = await db
      .select({ op_id: ops.op_id, value: ops.value })
      .from(ops)
      .where(and(eq(ops.company_id, company.companyId), eq(ops.relatorio_id, relatorioId), eq(ops.path, 'relatorio/status')))
      .orderBy(desc(ops.seq))
      .limit(1);
    return found;
  }

  /** The newest seq of the company's log. */
  async function headSeq(company: Company): Promise<number> {
    const [found] = await db.select({ seq: ops.seq }).from(ops).where(eq(ops.company_id, company.companyId)).orderBy(desc(ops.seq)).limit(1);
    return found?.seq ?? 0;
  }

  /** An issue `generation_job` created as the generate route creates one (a generate was queued). */
  async function queueIssueJob(company: Company, relatorioId: string): Promise<void> {
    const id = newId();
    const at = new Date();
    await serverApply(company, [
      makeOp(
        {
          kind: 'create',
          scope: 'relatorio',
          company_id: company.companyId,
          project_id: null,
          relatorio_id: relatorioId,
          path: `generation_job/${id}`,
          value: { id, relatorio_id: relatorioId, kind: 'issue', status: 'queued', error: null, result_file_id: null, result: null, created_at: toIso(at), started_at: null },
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:generate',
          device_id: SERVER_DEVICE_ID,
        },
        { newId, now: at },
      ),
    ]);
  }

  /** A revision row, as the generate job cuts one, frozen at the log's head now. */
  async function cutRevision(company: Company, relatorioId: string, number = 1): Promise<void> {
    const id = newId();
    const at = new Date();
    const snapshotSeq = await headSeq(company);
    await serverApply(company, [
      makeOp(
        {
          kind: 'create',
          scope: 'relatorio',
          company_id: company.companyId,
          project_id: null,
          relatorio_id: relatorioId,
          path: `revision/${id}`,
          value: { id, relatorio_id: relatorioId, number, snapshot_seq: snapshotSeq, created_by: company.userId, docx_file_id: newId(), pdf_file_id: newId(), created_at: toIso(at) },
          prev_op_id: null,
          batch_id: null,
          meta: null,
          actor_id: 'system:generate',
          device_id: SERVER_DEVICE_ID,
        },
        { newId, now: at },
      ),
    ]);
  }

  /** A client status put of `company`'s user, stamped with the status op the device saw last. */
  function statusOp(company: Company, relatorioId: string, to: RelatorioStatus, prevOpId: string | null, extra: Partial<DraftInput> = {}, at?: Date): Op {
    return clientOp(company, { kind: 'put', path: 'relatorio/status', relatorio_id: relatorioId, value: to, prev_op_id: prevOpId, ...extra }, at);
  }

  async function setup(): Promise<void> {
    await seedTestCompanies(db, auth);
  }

  async function cleanup(): Promise<void> {
    const opIds = [...written.opIds];
    const entityIds = [...written.entityIds];
    const streams = [...written.streams];
    if (streams.length > 0) {
      await db.delete(ops).where(or(inArray(ops.relatorio_id, streams), inArray(ops.project_id, streams)));
      await db.delete(entities).where(or(inArray(entities.relatorio_id, streams), inArray(entities.project_id, streams)));
    }
    if (opIds.length > 0) await db.delete(ops).where(inArray(ops.op_id, opIds));
    if (entityIds.length > 0) await db.delete(entities).where(inArray(entities.id, entityIds));
    await db
      .delete(syncDevicePush)
      .where(and(inArray(syncDevicePush.company_id, [companyA.companyId, companyB.companyId]), inArray(syncDevicePush.device_id, [...written.devices])));
    await sql.end();
  }

  return { db, setup, cleanup, authed, push, pushRaw, clientOp, serverApply, seedRelatorio, rowOf, logged, latestStatusOp, queueIssueJob, cutRevision, statusOp, headSeq, track };
}
