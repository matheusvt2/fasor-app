import {
  makeOp,
  projectFieldPath,
  registryFieldPath,
  relatorioRemovedAtPath,
  SERVER_DEVICE_ID,
  toIso,
  type Clock,
  type NewId,
  type Op,
  type ProjectRow,
  type RelatorioRow,
} from '@app/domain';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { applyServerBatch, CLEANUP_ACTOR, type Tx } from '../sync/apply.ts';
import type { Db } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { company, entities } from './schema.ts';

/*
 * Fix batch fxrm (2026-10-29, Matheus's decision on the production pass): the one-shot removal
 * of test data from a company. `findTombstoneCandidates` reads; `planTombstone` checks the ids
 * against each other and builds the ops; `applyTombstone` writes them in ONE `applyServerBatch`
 * (actor `system:cleanup`, one `batch_id`) after re-running every check inside the batch's
 * transaction, under the company lock, so a change between the dry run and the apply writes
 * nothing. `applyOp` stays the only reducer: the rows become tombstones through ops, never an
 * `entities` update, and a device learns the removal from those ops alone (AD-13). Nothing is
 * purged; a put of null on the same path restores a row. The CLI is `tombstone-cli.ts`.
 */

export interface TombstoneInput {
  companyId: string;
  relatorioId?: string;
  projectId?: string;
  clientId?: string;
}

export interface TombstoneCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export type TombstonePlan =
  | { ok: true; checks: TombstoneCheck[]; ops: Op[] }
  | { ok: false; checks: TombstoneCheck[]; reason: string };

export interface TombstoneDeps {
  now: Clock;
  newId: NewId;
}

export interface TombstoneCandidate {
  company_id: string;
  company_name: string;
  entity: 'client' | 'project' | 'relatorio';
  id: string;
  /** The client's or the project's name; for a relatório, "⟨local⟩ / ⟨atividade⟩" as stored. */
  name: string;
  status?: string;
  project_id?: string;
}

/** A check failed: nothing was written. */
export class TombstoneRefused extends Error {
  readonly checks: TombstoneCheck[];
  constructor(reason: string, checks: TombstoneCheck[] = []) {
    super(reason);
    this.name = 'TombstoneRefused';
    this.checks = checks;
  }
}

type Reader = Db | Tx;

interface EntityRecord {
  id: string;
  row: unknown;
  removed_at: string | null;
}

/** Case-insensitive "contains", with no LIKE wildcard in the operator's text. */
const contains = (column: SQL, text: string): SQL => sql`position(lower(${text}) in lower(coalesce(${column}, ''))) > 0`;

/**
 * Live client registry rows and projects whose name contains `text`, and live relatórios whose
 * `setup.local` or `setup.atividade` contains it or whose project matched, in every company.
 */
export async function findTombstoneCandidates(db: Reader, text: string): Promise<TombstoneCandidate[]> {
  const live = isNull(entities.removed_at);
  const names = new Map((await db.select({ id: company.id, name: company.name }).from(company)).map((c) => [c.id, c.name]));
  const clients = await db
    .select({ company_id: entities.company_id, id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.entity, 'registry'), live, sql`${entities.row}->>'kind' = 'client'`, contains(sql`${entities.row}->>'name'`, text)))
    .orderBy(asc(entities.company_id), asc(entities.id));
  const projects = await db
    .select({ company_id: entities.company_id, id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.entity, 'project'), live, contains(sql`${entities.row}->>'name'`, text)))
    .orderBy(asc(entities.company_id), asc(entities.id));
  const matchedProjects = new Set(projects.map((p) => `${p.company_id}/${p.id}`));
  const relatorios = (
    await db
      .select({ company_id: entities.company_id, id: entities.id, row: entities.row })
      .from(entities)
      .where(and(eq(entities.entity, 'relatorio'), live))
      .orderBy(asc(entities.company_id), asc(entities.id))
  ).filter(({ company_id, row }) => {
    const r = row as RelatorioRow;
    const needle = text.toLowerCase();
    const hit = (value: string | null | undefined) => typeof value === 'string' && value.toLowerCase().includes(needle);
    return hit(r.setup.local) || hit(r.setup.atividade) || matchedProjects.has(`${company_id}/${r.project_id}`);
  });
  const companyName = (id: string) => names.get(id) ?? '(no company row)';
  return [
    ...clients.map((c) => ({ company_id: c.company_id, company_name: companyName(c.company_id), entity: 'client' as const, id: c.id, name: String((c.row as { name?: unknown }).name ?? '') })),
    ...projects.map((p) => ({ company_id: p.company_id, company_name: companyName(p.company_id), entity: 'project' as const, id: p.id, name: (p.row as ProjectRow).name })),
    ...relatorios.map((r) => {
      const row = r.row as RelatorioRow;
      return {
        company_id: r.company_id,
        company_name: companyName(r.company_id),
        entity: 'relatorio' as const,
        id: r.id,
        name: `${row.setup.local ?? ''} / ${row.setup.atividade ?? ''}`,
        status: row.status,
        project_id: row.project_id,
      };
    }),
  ];
}

async function entityRecord(db: Reader, companyId: string, entity: string, id: string): Promise<EntityRecord | null> {
  const [record] = await db
    .select({ id: entities.id, row: entities.row, removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return record ?? null;
}

async function liveRows<T>(db: Reader, companyId: string, entity: string): Promise<Array<{ id: string; row: T }>> {
  const rows = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), isNull(entities.removed_at)))
    .orderBy(asc(entities.id));
  return rows.map((r) => ({ id: r.id, row: r.row as T }));
}

/**
 * Every check of `input`, in order: each given row exists in the company and is live, then the
 * rows belong to each other, then the rules (no emitido relatório, no project or client another
 * live row still uses). The first failing check is the refusal; the checks after it do not run.
 */
async function runChecks(db: Reader, input: TombstoneInput): Promise<TombstoneCheck[]> {
  const checks: TombstoneCheck[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
    return ok;
  };
  const { companyId, relatorioId, projectId, clientId } = input;
  if (relatorioId === undefined && projectId === undefined && clientId === undefined) {
    check('target', false, 'no target: give at least one of relatório, project, client');
    return checks;
  }
  const [companyRow] = await db.select({ id: company.id, name: company.name }).from(company).where(eq(company.id, companyId));
  if (!check('company', companyRow !== undefined, companyRow ? `company ${companyId} "${companyRow.name}"` : `company ${companyId} not found`)) return checks;

  /** A row of the company, present and live; `null` once a check failed. */
  const present = async (label: string, entity: string, id: string, kind?: string): Promise<EntityRecord | null> => {
    const record = await entityRecord(db, companyId, entity, id);
    const found = record !== null && (kind === undefined || (record.row as { kind?: unknown }).kind === kind);
    if (!check(`${label} exists`, found, found ? `${label} ${id} found` : `${label} ${id} not found in company ${companyId}`)) return null;
    const live = record!.removed_at === null;
    if (!check(`${label} live`, live, live ? `${label} ${id} is live` : `${label} ${id} already removed at ${record!.removed_at}`)) return null;
    return record;
  };

  // 1. Each given row exists in the company and is live.
  let relatorio: RelatorioRow | null = null;
  if (relatorioId !== undefined) {
    const record = await present('relatório', 'relatorio', relatorioId);
    if (record === null) return checks;
    relatorio = record.row as RelatorioRow;
  }
  let project: ProjectRow | null = null;
  if (projectId !== undefined) {
    const record = await present('project', 'project', projectId);
    if (record === null) return checks;
    project = record.row as ProjectRow;
  }
  if (clientId !== undefined && (await present('client', 'registry', clientId, 'client')) === null) return checks;

  // 2. The given rows belong to each other.
  if (relatorio !== null && projectId !== undefined) {
    const same = relatorio.project_id === projectId;
    if (!check('relatório of project', same, same ? `relatório ${relatorioId} is of project ${projectId}` : `relatório ${relatorioId} is not of project ${projectId} (its project is ${relatorio.project_id})`)) return checks;
  }
  if (clientId !== undefined && (project !== null || relatorio !== null)) {
    // The client of the given project, or else of the given relatório's project.
    let owner = project;
    if (owner === null) {
      const projectRecord = await entityRecord(db, companyId, 'project', relatorio!.project_id);
      owner = projectRecord === null ? null : (projectRecord.row as ProjectRow);
    }
    const same = owner !== null && owner.client_id === clientId;
    const subject = project !== null ? `project ${projectId}` : `relatório ${relatorioId}`;
    if (!check('target of client', same, same ? `${subject} is of client ${clientId}` : `${subject} is not of client ${clientId} (its client is ${owner?.client_id ?? 'none'})`)) return checks;
  }

  // 3. The rules.
  if (relatorio !== null) {
    const issued = relatorio.status === 'emitido';
    if (!check('relatório not emitido', !issued, issued ? `relatório ${relatorioId} is emitido: an emitido relatório is never removed` : `relatório ${relatorioId} status ${relatorio.status}`)) return checks;
  }
  if (projectId !== undefined) {
    // Conservative (spec Design Notes, open for veto): a project another live relatório belongs to stays.
    const others = (await liveRows<RelatorioRow>(db, companyId, 'relatorio')).filter((r) => r.row.project_id === projectId && r.id !== relatorioId);
    if (!check('project not in use', others.length === 0, others.length === 0 ? `no other live relatório of project ${projectId}` : `project ${projectId} is in use by relatório ${others.map((r) => r.id).join(', ')}`)) return checks;
  }
  if (clientId !== undefined) {
    const others = (await liveRows<ProjectRow>(db, companyId, 'project')).filter((p) => p.row.client_id === clientId && p.id !== projectId);
    if (!check('client not in use', others.length === 0, others.length === 0 ? `no other live project of client ${clientId}` : `client ${clientId} is in use by project ${others.map((p) => p.id).join(', ')}`)) return checks;
  }
  return checks;
}

/** The ops of `input` in order (relatório, project, client), one shared `batch_id`. */
function buildOps(input: TombstoneInput, deps: TombstoneDeps): Op[] {
  const at = deps.now();
  const removedAt = toIso(at);
  const batchId = deps.newId();
  const base = {
    company_id: input.companyId,
    project_id: null,
    prev_op_id: null,
    batch_id: batchId,
    meta: null,
    actor_id: CLEANUP_ACTOR,
    device_id: SERVER_DEVICE_ID,
  };
  const made: Op[] = [];
  const opDeps = { newId: deps.newId, now: at };
  if (input.relatorioId !== undefined) {
    made.push(makeOp({ ...base, kind: 'remove', scope: 'relatorio', relatorio_id: input.relatorioId, path: relatorioRemovedAtPath(), value: null }, opDeps));
  }
  if (input.projectId !== undefined) {
    made.push(makeOp({ ...base, kind: 'put', scope: 'company', relatorio_id: null, path: projectFieldPath(input.projectId, 'removed_at'), value: removedAt }, opDeps));
  }
  if (input.clientId !== undefined) {
    made.push(makeOp({ ...base, kind: 'put', scope: 'company', relatorio_id: null, path: registryFieldPath('client', input.clientId, 'removed_at'), value: removedAt }, opDeps));
  }
  return made;
}

/** The dry run: every check with its result and, when all pass, the ops the apply would write. Writes nothing. */
export async function planTombstone(db: Reader, input: TombstoneInput, deps: TombstoneDeps): Promise<TombstonePlan> {
  const checks = await runChecks(db, input);
  const failed = checks.find((c) => !c.ok);
  if (failed !== undefined) return { ok: false, checks, reason: failed.detail };
  return { ok: true, checks, ops: buildOps(input, deps) };
}

/**
 * Writes the plan's ops in one server batch. The checks run again inside the batch's
 * transaction, after the company lock, and a failing one throws `TombstoneRefused` there, so
 * nothing is written. Throws `TombstoneRefused` before any write when the plan fails.
 */
export async function applyTombstone(db: Db, input: TombstoneInput, deps: TombstoneDeps): Promise<{ batchId: string; ops: Op[]; applied: Array<{ op_id: string; seq: number }> }> {
  const plan = await planTombstone(db, input, deps);
  if (!plan.ok) throw new TombstoneRefused(plan.reason, plan.checks);
  const result = await applyServerBatch(db, asCompanyId(input.companyId), plan.ops, {
    now: deps.now,
    before: async (tx) => {
      const checks = await runChecks(tx, input);
      const failed = checks.find((c) => !c.ok);
      if (failed !== undefined) throw new TombstoneRefused(failed.detail, checks);
    },
  });
  return { batchId: plan.ops[0]!.batch_id!, ops: plan.ops, applied: result.applied };
}
