import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { makeOp, SERVER_DEVICE_ID, type Op, type OpInput, type RelatorioRow } from '@app/domain';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { applyServerBatch, CLEANUP_ACTOR } from '../sync/apply.ts';
import { companySummary, pullRelatorio } from '../sync/pull.ts';
import { createDb } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { sampleRelatorioIds, seedSampleRelatorio } from './sample-relatorio.ts';
import { company, entities, ops } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';
import { applyTombstone, findTombstoneCandidates, planTombstone, TombstoneRefused, type TombstoneInput } from './tombstone.ts';

/*
 * Fix batch fxrm (2026-10-29): the one-shot tombstone of test data, against the compose
 * Postgres. A company holds the sample relatório (its client, its project) plus the rows each
 * refusal needs: a second project of the same client, a second relatório of the same project,
 * and an emitido relatório on a project of its own. A neighbour company holds its own sample.
 * Every refusal writes nothing; the apply writes exactly three `system:cleanup` ops in one
 * batch, and the relatório stream carries the `remove`. The neighbour stays byte-identical.
 */

const root = resolve(import.meta.dirname, '../../../..');
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const deps = { now: () => new Date(), newId };

const companyId = newId();
const neighbourId = newId();
const created = [companyId, neighbourId];
const marker = `fxrm ${companyId.slice(-12)}`;

const { relatorioId, projectId } = sampleRelatorioIds(companyId);
let clientId = '';
/** A second project of the same client: makes the client "in use". */
const otherProjectId = newId();
/** A second relatório of the sample project: makes the project "in use". */
const otherRelatorioId = newId();
/** An emitido relatório on a project of its own, with no client. */
const emitidoProjectId = newId();
const emitidoRelatorioId = newId();

function serverOp(input: Omit<OpInput, 'company_id' | 'actor_id' | 'device_id' | 'prev_op_id' | 'batch_id' | 'meta' | 'project_id' | 'relatorio_id'> & Partial<OpInput>): Op {
  return makeOp(
    {
      company_id: companyId,
      actor_id: 'system:test',
      device_id: SERVER_DEVICE_ID,
      project_id: null,
      relatorio_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      ...input,
    },
    { newId, now: new Date() },
  );
}

const projectCreate = (id: string, client: string | null, name: string) =>
  serverOp({ kind: 'create', scope: 'company', path: `project/${id}`, value: { id, client_id: client, name, site: null, removed_at: null } });

const relatorioCreate = (id: string, project: string) =>
  serverOp({
    kind: 'create',
    scope: 'relatorio',
    relatorio_id: id,
    path: `relatorio/${id}`,
    value: {
      id,
      project_id: project,
      template_id: null,
      template_version: null,
      seed_version: 'v1',
      status: 'rascunho',
      setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
      export: { scheme: 'por_local_e_tipo' },
      preview_file_id: null,
      removed_at: null,
    },
  });

async function companyRows(id: string) {
  return {
    ops: await db.select().from(ops).where(eq(ops.company_id, id)).orderBy(asc(ops.seq)),
    entities: await db.select().from(entities).where(eq(entities.company_id, id)).orderBy(asc(entities.entity), asc(entities.id)),
  };
}

async function opCount(id: string): Promise<number> {
  return (await db.select({ id: ops.op_id }).from(ops).where(eq(ops.company_id, id))).length;
}

async function removedAt(entity: string, id: string): Promise<string | null> {
  const [row] = await db
    .select({ removed_at: entities.removed_at })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity), eq(entities.id, id)));
  return row?.removed_at ?? null;
}

const input = (overrides: Partial<TombstoneInput>): TombstoneInput => ({ companyId, ...overrides });

/** A refused input: the plan says why, the apply throws `TombstoneRefused`, and no op lands. */
async function expectRefused(given: TombstoneInput, reason: RegExp): Promise<void> {
  const before = await opCount(companyId);
  const plan = await planTombstone(db, given, deps);
  expect(plan.ok).toBe(false);
  if (!plan.ok) expect(plan.reason).toMatch(reason);
  await expect(applyTombstone(db, given, deps)).rejects.toThrow(TombstoneRefused);
  expect(await opCount(companyId)).toBe(before);
}

let neighbourBefore: Awaited<ReturnType<typeof companyRows>>;

beforeAll(async () => {
  await db.insert(company).values([
    { id: companyId, name: 'Empresa da limpeza' },
    { id: neighbourId, name: 'Empresa vizinha' },
  ]);
  await seedSampleRelatorio(db, companyId);
  await seedSampleRelatorio(db, neighbourId);
  const [project] = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'project'), eq(entities.id, projectId)));
  clientId = (project!.row as { client_id: string }).client_id;
  await applyServerBatch(
    db,
    asCompanyId(companyId),
    [
      serverOp({ kind: 'put', scope: 'relatorio', relatorio_id: relatorioId, path: 'relatorio/setup/local', value: `Local ${marker}` }),
      projectCreate(otherProjectId, clientId, 'Segunda obra do cliente'),
      relatorioCreate(otherRelatorioId, projectId),
      projectCreate(emitidoProjectId, null, 'Obra emitida'),
      relatorioCreate(emitidoRelatorioId, emitidoProjectId),
      serverOp({ kind: 'put', scope: 'relatorio', relatorio_id: emitidoRelatorioId, path: 'relatorio/status', value: 'emitido' }),
    ],
    { now: () => new Date() },
  );
  neighbourBefore = await companyRows(neighbourId);
}, 120_000);

afterAll(async () => {
  for (const id of created) await dropCompany(db, id);
  await sql.end();
});

describe('findTombstoneCandidates', () => {
  it('lists the live client, projects and relatórios whose name, local or project matches, case-insensitive', async () => {
    const found = (await findTombstoneCandidates(db, 'DE TESTES')).filter((row) => row.company_id === companyId);
    expect(found.every((row) => row.company_name === 'Empresa da limpeza')).toBe(true);
    expect(found.filter((row) => row.entity === 'client').map((row) => row.id)).toEqual([clientId]);
    expect(found.filter((row) => row.entity === 'project').map((row) => row.id)).toEqual([projectId]);
    const relatorios = found.filter((row) => row.entity === 'relatorio');
    expect(relatorios.map((row) => row.id).sort()).toEqual([relatorioId, otherRelatorioId].sort());
    expect(relatorios.find((row) => row.id === relatorioId)).toMatchObject({ status: 'em_campo', project_id: projectId });

    const byLocal = await findTombstoneCandidates(db, marker.toUpperCase());
    expect(byLocal.map((row) => [row.entity, row.id])).toEqual([['relatorio', relatorioId]]);
    expect(await findTombstoneCandidates(db, `nothing ${newId()}`)).toEqual([]);
  });
});

describe('planTombstone and applyTombstone refusals', () => {
  it('a dry run of consistent ids passes every check and writes nothing', async () => {
    const before = await opCount(companyId);
    const plan = await planTombstone(db, input({ relatorioId: otherRelatorioId }), deps);
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.checks.length).toBeGreaterThan(0);
      expect(plan.checks.every((check) => check.ok)).toBe(true);
      expect(plan.ops.map((op) => [op.kind, op.path])).toEqual([['remove', 'relatorio/removed_at']]);
    }
    expect(await opCount(companyId)).toBe(before);
  });

  it('refuses an id that is not in the company', async () => {
    await expectRefused(input({ relatorioId: newId() }), /relatório .* not found/);
    await expectRefused(input({ relatorioId: sampleRelatorioIds(neighbourId).relatorioId }), /relatório .* not found/);
    await expectRefused(input({ projectId: newId() }), /project .* not found/);
    await expectRefused(input({ clientId: newId() }), /client .* not found/);
    await expectRefused({ companyId: newId(), relatorioId }, /company .* not found/);
  });

  it('refuses ids that do not belong to each other', async () => {
    await expectRefused(input({ relatorioId, projectId: otherProjectId }), /not of project/);
    await expectRefused(input({ projectId: emitidoProjectId, clientId }), /not of client/);
    await expectRefused(input({ relatorioId: emitidoRelatorioId, clientId }), /not of client/);
  });

  it('refuses an emitido relatório', async () => {
    await expectRefused(input({ relatorioId: emitidoRelatorioId }), /emitido/);
  });

  it('refuses a project another live relatório still belongs to', async () => {
    await expectRefused(input({ relatorioId, projectId }), new RegExp(`project ${projectId} is in use by relatório ${otherRelatorioId}`));
  });

  it('refuses a client another live project still references', async () => {
    await expectRefused(input({ projectId: otherProjectId, clientId }), new RegExp(`client ${clientId} is in use by project ${projectId}`));
  });

  it('a partial target applies alone, and an already removed row is refused after it', async () => {
    const result = await applyTombstone(db, input({ projectId: otherProjectId }), deps);
    expect(result.ops.map((op) => op.path)).toEqual([`project/${otherProjectId}/removed_at`]);
    expect(await removedAt('project', otherProjectId)).not.toBeNull();
    await expectRefused(input({ projectId: otherProjectId }), /already removed/);
    await applyTombstone(db, input({ relatorioId: otherRelatorioId }), deps);
    expect(await removedAt('relatorio', otherRelatorioId)).not.toBeNull();
  });
});

describe('applyTombstone', () => {
  it('re-runs the checks inside the batch transaction: a relatório emitido after the plan passed is refused and nothing of the tombstone lands', async () => {
    const raceProject = newId();
    const raceRelatorio = newId();
    await applyServerBatch(db, asCompanyId(companyId), [projectCreate(raceProject, null, 'Obra da corrida'), relatorioCreate(raceRelatorio, raceProject)], { now: () => new Date() });
    const given = input({ relatorioId: raceRelatorio, projectId: raceProject });
    expect((await planTombstone(db, given, deps)).ok).toBe(true);
    const before = await opCount(companyId);
    const afterPlan = async () => {
      await applyServerBatch(db, asCompanyId(companyId), [serverOp({ kind: 'put', scope: 'relatorio', relatorio_id: raceRelatorio, path: 'relatorio/status', value: 'emitido' })], { now: () => new Date() });
    };
    await expect(applyTombstone(db, given, { ...deps, afterPlan })).rejects.toThrow(/emitido/);
    // Only the racing status put landed.
    expect(await opCount(companyId)).toBe(before + 1);
    expect(await removedAt('relatorio', raceRelatorio)).toBeNull();
    expect(await removedAt('project', raceProject)).toBeNull();
  }, 60_000);

  it('writes the three ops in one batch as system:cleanup; the stream carries the remove; the summary drops the relatório', async () => {
    const before = await opCount(companyId);
    const dry = await planTombstone(db, input({ relatorioId, projectId, clientId }), deps);
    expect(dry.ok, JSON.stringify(dry)).toBe(true);
    if (dry.ok) expect(dry.ops.map((op) => op.path)).toEqual(['relatorio/removed_at', `project/${projectId}/removed_at`, `registry/client/${clientId}/removed_at`]);
    expect(await opCount(companyId)).toBe(before);
    const result = await applyTombstone(db, input({ relatorioId, projectId, clientId }), deps);
    const written = await db.select().from(ops).where(eq(ops.company_id, companyId)).orderBy(asc(ops.seq));
    expect(written).toHaveLength(before + 3);
    const last = written.slice(-3);
    expect(last.map((row) => [row.kind, row.path, row.actor_id, row.device_id])).toEqual([
      ['remove', 'relatorio/removed_at', CLEANUP_ACTOR, SERVER_DEVICE_ID],
      ['put', `project/${projectId}/removed_at`, CLEANUP_ACTOR, SERVER_DEVICE_ID],
      ['put', `registry/client/${clientId}/removed_at`, CLEANUP_ACTOR, SERVER_DEVICE_ID],
    ]);
    expect(CLEANUP_ACTOR).toBe('system:cleanup');
    expect(new Set(last.map((row) => row.batch_id)).size).toBe(1);
    expect(last[0]!.batch_id).toBe(result.batchId);
    expect(last.map((row) => row.op_id)).toEqual(result.ops.map((op) => op.op_id));

    for (const [entity, id] of [['relatorio', relatorioId], ['project', projectId], ['registry', clientId]] as const) {
      expect(await removedAt(entity, id), `${entity} ${id}`).not.toBeNull();
    }
    const [row] = await db.select({ row: entities.row }).from(entities).where(and(eq(entities.company_id, companyId), eq(entities.entity, 'relatorio'), eq(entities.id, relatorioId)));
    expect((row!.row as RelatorioRow).removed_at).toBe(result.ops[0]!.client_ts);

    const summary = await companySummary(db, asCompanyId(companyId));
    expect(summary.relatorios.map((entry) => entry.id)).not.toContain(relatorioId);
    const page = await pullRelatorio(db, asCompanyId(companyId), relatorioId, last[0]!.seq - 1);
    expect(page!.ops.map((op) => [op.kind, op.path, op.actor_id])).toContainEqual(['remove', 'relatorio/removed_at', CLEANUP_ACTOR]);

    expect(await companyRows(neighbourId)).toEqual(neighbourBefore);
  }, 60_000);
});

describe('tombstone-cli', () => {
  const cli = (args: string[], env: Record<string, string> = {}) =>
    spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/db/tombstone-cli.ts', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });

  it('--find lists the matches and exits 0', () => {
    const run = cli(['--find', 'Obra emitida']);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain(emitidoProjectId);
    expect(run.stdout).toContain(emitidoRelatorioId);
    expect(run.stdout).toContain('Empresa da limpeza');
  }, 60_000);

  it('--find with no match prints no match and exits 0', () => {
    const run = cli(['--find', `nothing ${newId()}`]);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('no match');
  }, 60_000);

  it('a refused --apply exits 1, says why and writes nothing', async () => {
    const before = await opCount(companyId);
    const run = cli(['--company', companyId, '--relatorio', emitidoRelatorioId, '--apply']);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(1);
    expect(`${run.stdout}${run.stderr}`).toContain('emitido');
    expect(await opCount(companyId)).toBe(before);
  }, 60_000);

  it('a dry run of consistent ids exits 0 and writes nothing; the same ids with --apply write the tombstones', async () => {
    const cliProject = newId();
    const cliRelatorio = newId();
    await applyServerBatch(db, asCompanyId(companyId), [projectCreate(cliProject, null, 'Obra da CLI'), relatorioCreate(cliRelatorio, cliProject)], { now: () => new Date() });
    const args = ['--company', companyId, '--relatorio', cliRelatorio, '--project', cliProject];
    const before = await opCount(companyId);
    const dry = cli(args);
    expect(dry.status, `${dry.stdout}\n${dry.stderr}`).toBe(0);
    expect(dry.stdout).toContain('dry run');
    expect(dry.stdout).toContain('relatorio/removed_at');
    expect(await opCount(companyId)).toBe(before);
    expect(await removedAt('relatorio', cliRelatorio)).toBeNull();
    const applied = cli([...args, '--apply']);
    expect(applied.status, `${applied.stdout}\n${applied.stderr}`).toBe(0);
    expect(await opCount(companyId)).toBe(before + 2);
    expect(await removedAt('relatorio', cliRelatorio)).not.toBeNull();
    expect(await removedAt('project', cliProject)).not.toBeNull();
  }, 120_000);

  it('refuses --find given twice and an argument named after an object key', () => {
    const twice = cli(['--find', 'a', '--find', 'b'], { DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' });
    expect(twice.status, `${twice.stdout}\n${twice.stderr}`).toBe(1);
    expect(twice.stderr).toContain('--find given twice');
    const proto = cli(['--company', companyId, 'constructor', relatorioId], { DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' });
    expect(proto.status, `${proto.stdout}\n${proto.stderr}`).toBe(1);
    expect(proto.stderr).toContain('unknown argument');
  }, 60_000);

  it('refuses a malformed id before it opens the database', () => {
    const run = cli(['--company', 'not-a-uuid', '--relatorio', relatorioId], { DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(1);
    expect(run.stderr).toContain('--company must be a uuidv7');
  }, 60_000);
});
