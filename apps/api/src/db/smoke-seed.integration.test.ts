import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { makeOp, SERVER_DEVICE_ID } from '@app/domain';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { applyOps } from '../sync/apply.ts';
import { createDb } from './client.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { sampleRelatorioIds, seedSampleRelatorio } from './sample-relatorio.ts';
import { entities, ops, readingRuns, syncDevicePush, user } from './schema.ts';
import { seedUser } from './seed.ts';
import { resetAndSeedSmokeCompany, SmokeSeedRefused, type SmokeSeedInput } from './smoke-seed.ts';
import { dropCompany } from './test-cleanup.ts';

/*
 * Story 14.10 part 6: the production smoke's reset against the compose Postgres. A neighbour
 * company with a user and a relatório stands beside the smoke company; the reset runs twice
 * (fresh, then over a run's leftovers) and must bring the smoke company back to its seeded
 * state while every neighbour row stays byte-identical. A company holding another user, or an
 * e-mail of another company, is refused with nothing written. The CLI runs once for real and
 * once with a bad id, which it refuses before opening the database.
 */

const root = resolve(import.meta.dirname, '../../../..');
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});

const PASSWORD = 'smoke-integration-password-0001';
const smokeId = newId();
const neighbourId = newId();
const created: string[] = [smokeId, neighbourId];

const input = (overrides: Partial<SmokeSeedInput> = {}): SmokeSeedInput => ({
  companyId: smokeId,
  companyName: 'Empresa de teste automatizado',
  email: `smoke-${smokeId}@teste.local`,
  name: 'Teste automatizado',
  password: PASSWORD,
  ...overrides,
});

/** Every row of `companyId` in the tables the reset touches, in a stable order. */
async function companyRows(companyId: string) {
  return {
    ops: await db.select().from(ops).where(eq(ops.company_id, companyId)).orderBy(asc(ops.seq)),
    entities: await db.select().from(entities).where(eq(entities.company_id, companyId)).orderBy(asc(entities.entity), asc(entities.id)),
    push: await db.select().from(syncDevicePush).where(eq(syncDevicePush.company_id, companyId)).orderBy(asc(syncDevicePush.device_id)),
    runs: await db.select().from(readingRuns).where(eq(readingRuns.company_id, companyId)).orderBy(asc(readingRuns.id)),
    users: await db.select().from(user).where(eq(user.companyId, companyId)).orderBy(asc(user.id)),
  };
}

/** The smoke company's state as the reset promises it: entity counts by type, and the ids that are not minted per run. */
async function seededShape(companyId: string) {
  const rows = await db.select({ entity: entities.entity, id: entities.id }).from(entities).where(eq(entities.company_id, companyId));
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.entity] = (counts[row.entity] ?? 0) + 1;
  // The template and the voltage classes get fresh ids on every seed; every other row keeps its id.
  const stable = rows.filter((row) => row.entity !== 'template' && row.entity !== 'registry').map((row) => `${row.entity}/${row.id}`).sort();
  const opCount = (await db.select({ id: ops.op_id }).from(ops).where(eq(ops.company_id, companyId))).length;
  return { counts, stable, opCount };
}

let neighbourBefore: Awaited<ReturnType<typeof companyRows>>;

beforeAll(async () => {
  const neighbour = await seedUser(db, auth, {
    companyId: neighbourId,
    companyName: 'Empresa vizinha',
    email: `vizinha-${neighbourId}@teste.local`,
    password: PASSWORD,
    name: 'Vera Vizinha',
    council: 'crea',
    registrationNumber: 'SP 1',
  });
  await seedSampleRelatorio(db, neighbourId, { responsibleUserId: neighbour.userId });
  await db.insert(syncDevicePush).values({ company_id: neighbourId, user_id: neighbour.userId, device_id: 'neighbour-device', last_push_at: new Date().toISOString() });
  neighbourBefore = await companyRows(neighbourId);
}, 120_000);

afterAll(async () => {
  for (const id of created) await dropCompany(db, id);
  await sql.end();
});

describe('resetAndSeedSmokeCompany', () => {
  it('seeds a fresh smoke company, and a second run over a run\'s leftovers brings it back to the same state; the neighbour is untouched', async () => {
    const first = await resetAndSeedSmokeCompany(db, auth, input());
    expect(first.companyId).toBe(smokeId);
    expect(first.relatorioId).toBe(sampleRelatorioIds(smokeId).relatorioId);
    expect(first.templateId).not.toBeNull();
    expect(first.removed).toEqual({ ops: 0, entities: 0, syncDevicePush: 0, readingRuns: 0 });
    const seeded = await seededShape(smokeId);
    expect(seeded.counts).toMatchObject({ user: 1, template: 1, relatorio: 1, project: 1 });
    expect(seeded.counts.block).toBeGreaterThan(0);
    const [relatorio] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, smokeId), eq(entities.entity, 'relatorio'), eq(entities.id, first.relatorioId)));
    expect((relatorio!.row as { setup: { responsible_user_id: string } }).setup.responsible_user_id).toBe(first.userId);

    // What a smoke run leaves: an edit, a device's push mark and a reading run.
    const at = new Date();
    const edit = makeOp(
      {
        kind: 'put',
        scope: 'relatorio',
        company_id: smokeId,
        project_id: null,
        relatorio_id: first.relatorioId,
        path: 'relatorio/setup/additional_info',
        value: 'Editado pelo teste de fumaça',
        prev_op_id: null,
        batch_id: null,
        meta: null,
        actor_id: first.userId,
        device_id: SERVER_DEVICE_ID,
      },
      { newId, now: at },
    );
    const applied = await applyOps(db, asCompanyId(smokeId), [edit], { origin: 'server', now: () => at });
    expect(applied.rejected).toEqual([]);
    await db.insert(syncDevicePush).values({ company_id: smokeId, user_id: first.userId, device_id: 'smoke-device', last_push_at: at.toISOString() });
    await db.insert(readingRuns).values({
      id: newId(),
      company_id: smokeId,
      photo_id: newId(),
      relatorio_id: first.relatorioId,
      reading_kind: 'plate',
      attempt: 1,
      outcome: 'ok',
      ocr_provider: 'fake',
      duration_ms: 1,
      created_at: at.toISOString(),
    });

    const second = await resetAndSeedSmokeCompany(db, auth, input());
    expect(second.userId).toBe(first.userId);
    expect(second.relatorioId).toBe(first.relatorioId);
    expect(second.removed.ops).toBe(seeded.opCount + 1);
    expect(second.removed.entities).toBe(Object.values(seeded.counts).reduce((sum, n) => sum + n, 0));
    expect(second.removed.syncDevicePush).toBe(1);
    expect(second.removed.readingRuns).toBe(1);
    expect(await seededShape(smokeId)).toEqual(seeded);
    const [reset] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, smokeId), eq(entities.entity, 'relatorio'), eq(entities.id, first.relatorioId)));
    expect((reset!.row as { setup: { additional_info: string | null } }).setup.additional_info).toBeNull();
    expect(await db.select().from(syncDevicePush).where(eq(syncDevicePush.company_id, smokeId))).toEqual([]);
    expect(await db.select().from(readingRuns).where(eq(readingRuns.company_id, smokeId))).toEqual([]);

    // The neighbour, byte for byte.
    expect(await companyRows(neighbourId)).toEqual(neighbourBefore);
  }, 120_000);

  it('refuses a company that holds a user other than the smoke e-mail, writing nothing', async () => {
    const before = await companyRows(neighbourId);
    const refused = resetAndSeedSmokeCompany(db, auth, input({ companyId: neighbourId }));
    await expect(refused).rejects.toThrow(SmokeSeedRefused);
    await expect(resetAndSeedSmokeCompany(db, auth, input({ companyId: neighbourId }))).rejects.toThrow(
      `refusing: company ${neighbourId} holds users other than smoke-${smokeId}@teste.local`,
    );
    expect(await companyRows(neighbourId)).toEqual(before);
  });

  it('refuses an e-mail that belongs to another company, writing nothing', async () => {
    const otherId = newId();
    created.push(otherId);
    const neighbourEmail = `vizinha-${neighbourId}@teste.local`;
    await expect(resetAndSeedSmokeCompany(db, auth, input({ companyId: otherId, email: neighbourEmail }))).rejects.toThrow(
      `refusing: ${neighbourEmail} belongs to company ${neighbourId}, not ${otherId}`,
    );
    expect(await companyRows(otherId)).toEqual({ ops: [], entities: [], push: [], runs: [], users: [] });
    expect(await companyRows(neighbourId)).toEqual(neighbourBefore);
  });
});

describe('smoke-seed-cli', () => {
  const cli = (env: Record<string, string>) =>
    spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/db/smoke-seed-cli.ts'], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });

  it('refuses a bad company id before it opens the database, naming it', () => {
    // An unreachable database: a CLI that opened it would fail on the connection instead.
    const run = cli({
      DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none',
      SMOKE_COMPANY_ID: '01a14081-aa50-4697-855b-72450e7ed851',
      SMOKE_COMPANY_NAME: 'x',
      SMOKE_USER_EMAIL: 'x@teste.local',
      SMOKE_USER_NAME: 'x',
      SMOKE_USER_PASSWORD: PASSWORD,
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(1);
    expect(run.stderr).toContain('SMOKE_COMPANY_ID must be a uuidv7, got \\"01a14081-aa50-4697-855b-72450e7ed851\\"');
    expect(`${run.stdout}${run.stderr}`).not.toContain(PASSWORD);
  }, 60_000);

  it('resets and seeds the smoke company, logging the ids and never the password', async () => {
    const run = cli({
      SMOKE_COMPANY_ID: smokeId,
      SMOKE_COMPANY_NAME: 'Empresa de teste automatizado',
      SMOKE_USER_EMAIL: `smoke-${smokeId}@teste.local`,
      SMOKE_USER_NAME: 'Teste automatizado',
      SMOKE_USER_PASSWORD: PASSWORD,
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('smoke company reset and seeded');
    expect(run.stdout).toContain(smokeId);
    expect(run.stdout).toContain(sampleRelatorioIds(smokeId).relatorioId);
    expect(`${run.stdout}${run.stderr}`).not.toContain(PASSWORD);
    expect(await companyRows(neighbourId)).toEqual(neighbourBefore);
  }, 120_000);
});
