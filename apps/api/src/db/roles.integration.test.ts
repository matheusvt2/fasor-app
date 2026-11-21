import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  ADMIN_ROLE_ID,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  keysOf,
  opSchema,
  roleRowSchema,
  SYSTEM_IDENTITY_ACTOR,
  SYSTEM_ROLE_ROW_IDS,
  syncPullResponseSchema,
  systemRoleRows,
  toIso,
  userRowSchema,
  type Op,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { applyServerBatch } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import { createDb } from './client.ts';
import { ensureCompany } from './repositories/companies.ts';
import { asCompanyId } from './repositories/company-id.ts';
import { upgradeRolesAndUsers } from './roles.ts';
import { entities, ops } from './schema.ts';
import { seedUser } from './seed.ts';
import { dropCompany } from './test-cleanup.ts';
import { TEST_SEED } from './test-seed.ts';

/**
 * 26.3-API-001 (Story 26.3, AD-29): the migration gives every company its five seeded roles and
 * every user the Admin role and the status `active`, and a second run writes nothing; the seed
 * CLI's `--role`; the company pull carries the roles and the user's role and status.
 */

const root = resolve(import.meta.dirname, '../../../..');
const apiUrl = process.env.API_URL ?? 'http://api:3000';
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS) });
const companies: string[] = [];

afterAll(async () => {
  for (const id of companies) await dropCompany(db, id);
  await sql.end();
});

/** A user row as a server before contract 55 projected it: no role, no status. */
function legacyUserCreate(companyId: string, userId: string, name: string): Op {
  const row = { id: userId, name, email: `${userId}@teste.local`, council: null, registration_number: null, title: null, photo_location_enabled: true };
  return serverOp({ opId: newId(), companyId, actorId: SYSTEM_IDENTITY_ACTOR, clientTs: toIso(now()), kind: 'create', path: `user/${userId}`, value: row, scope: 'company' });
}

async function rowsOf(companyId: string, entity: 'role' | 'user') {
  return db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, entity)))
    .orderBy(entities.id);
}

async function opCount(companyIds: string[]): Promise<number> {
  return (await db.select({ op_id: ops.op_id }).from(ops).where(inArray(ops.company_id, companyIds))).length;
}

describe('26.3-API-001 the migration of roles and users', () => {
  it('two companies, five users, migrated twice: five system roles each, every user an active Admin, nothing written the second time', async () => {
    const ids = [newId(), newId()];
    companies.push(...ids);
    const users: Record<string, string[]> = { [ids[0]!]: [newId(), newId(), newId()], [ids[1]!]: [newId(), newId()] };
    for (const id of ids) {
      await ensureCompany(db, asCompanyId(id), `Empresa da migração ${id}`);
      await applyServerBatch(db, asCompanyId(id), users[id]!.map((userId, n) => legacyUserCreate(id, userId, `Pessoa ${n + 1}`)), { now });
      expect(await rowsOf(id, 'role')).toEqual([]);
    }

    const first = await upgradeRolesAndUsers(db, { info: () => undefined });
    expect(first.roles_created).toBeGreaterThanOrEqual(10);
    expect(first.user_ops).toBeGreaterThanOrEqual(10);
    for (const id of ids) {
      const roles = (await rowsOf(id, 'role')).map((r) => roleRowSchema.parse(r.row));
      expect(roles.map((role) => role.id)).toEqual(Object.values(SYSTEM_ROLE_ROW_IDS).sort());
      expect([...roles].sort((a, b) => a.id.localeCompare(b.id))).toEqual(systemRoleRows());
      const migrated = (await rowsOf(id, 'user')).map((r) => userRowSchema.parse(r.row));
      expect(migrated).toHaveLength(users[id]!.length);
      for (const user of migrated) expect({ role_id: user.role_id, status: user.status }).toEqual({ role_id: ADMIN_ROLE_ID, status: 'active' });
    }

    const opsBefore = await opCount(ids);
    const second = await upgradeRolesAndUsers(db, { info: () => undefined });
    expect(second).toMatchObject({ roles_created: 0, user_ops: 0 });
    expect(await opCount(ids)).toBe(opsBefore);
    for (const id of ids) expect(await rowsOf(id, 'role')).toHaveLength(5);
  }, 120_000);

  it('the seed gives a new company its roles with its first user, the user is Admin by default, and a re-seed without a role keeps the role', async () => {
    const companyId = newId();
    companies.push(companyId);
    const input = { companyId, companyName: 'Empresa do seed', email: `seed-${companyId}@teste.local`, password: TEST_SEED.password, name: 'Sara Seed', council: 'crea' as const, registrationNumber: 'SP 26' };
    const seeded = await seedUser(db, auth, input);
    expect((await rowsOf(companyId, 'role')).map((r) => r.id)).toEqual(Object.values(SYSTEM_ROLE_ROW_IDS).sort());
    const user = () => rowsOf(companyId, 'user').then((rows) => userRowSchema.parse(rows.find((r) => r.id === seeded.userId)!.row));
    expect(await user()).toMatchObject({ role_id: ADMIN_ROLE_ID, status: 'active' });

    await seedUser(db, auth, { ...input, role: 'consulta' });
    expect((await user()).role_id).toBe(SYSTEM_ROLE_ROW_IDS.consulta);
    const opsBefore = await opCount([companyId]);
    await seedUser(db, auth, input);
    expect((await user()).role_id).toBe(SYSTEM_ROLE_ROW_IDS.consulta);
    expect(await opCount([companyId])).toBe(opsBefore);
  }, 60_000);
});

describe('26.3-API-001 seed-users --role and the company pull', () => {
  function seedUsers(args: string[]) {
    return spawnSync('pnpm', ['exec', 'tsx', 'scripts/seed-users.ts', ...args], { cwd: root, encoding: 'utf8' });
  }

  it('refuses an unknown role before touching the database', () => {
    const result = seedUsers(['--company', 'X', '--email', 'x@teste.local', '--password', 'x', '--name', 'X', '--council', 'crea', '--number', '1', '--role', 'auditor']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--role must be one of admin, engenheiro_de_campo, gestor_do_projeto, responsavel_tecnico, consulta');
  }, 60_000);

  it('with --role engenheiro_de_campo the user signs in and the device pulls its role, its keys and its status', async () => {
    const companyId = newId();
    companies.push(companyId);
    const email = `campo-${companyId}@teste.local`;
    const run = seedUsers(['--company-id', companyId, '--company', 'Empresa do campo', '--email', email, '--password', TEST_SEED.password, '--name', 'Carla Campos', '--council', 'crea', '--number', 'SP 27', '--role', 'engenheiro_de_campo']);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain('with role engenheiro_de_campo');
    const userId = /as user (\S+) in company/.exec(run.stdout)?.[1];

    const headers = { 'content-type': 'application/json', origin: apiUrl, [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION) };
    const signIn = await fetch(`${apiUrl}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email, password: TEST_SEED.password }) });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const cookie = signIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const pull = await fetch(`${apiUrl}/api/sync/company?since=0`, { headers: { ...headers, cookie } });
    expect(pull.status, await pull.clone().text()).toBe(200);
    const pulled = syncPullResponseSchema.parse(await pull.json()).ops.map((op) => opSchema.parse(op));

    const roleCreates = pulled.filter((op) => op.kind === 'create' && op.path.startsWith('role/'));
    expect(roleCreates.map((op) => op.path).sort()).toEqual(Object.values(SYSTEM_ROLE_ROW_IDS).map((id) => `role/${id}`).sort());
    for (const op of roleCreates) expect(op.actor_id).toBe('system:admin');
    const userCreate = pulled.find((op) => op.path === `user/${userId}`);
    const userRow = userRowSchema.parse(userCreate?.value);
    expect(userRow).toMatchObject({ role_id: SYSTEM_ROLE_ROW_IDS.engenheiro_de_campo, status: 'active' });
    const role = roleRowSchema.parse(roleCreates.find((op) => op.path === `role/${userRow.role_id}`)?.value);
    expect(keysOf(role)).toEqual(['relatorio.view', 'relatorio.fill']);

    // A re-run with another role puts the new one, and the pull carries the put.
    const again = seedUsers(['--company-id', companyId, '--company', 'Empresa do campo', '--email', email, '--password', TEST_SEED.password, '--name', 'Carla Campos', '--council', 'crea', '--number', 'SP 27', '--role', 'consulta']);
    expect(again.status, `${again.stdout}\n${again.stderr}`).toBe(0);
    const cookie2 = (await fetch(`${apiUrl}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email, password: TEST_SEED.password }) })).headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const later = syncPullResponseSchema.parse(await (await fetch(`${apiUrl}/api/sync/company?since=0`, { headers: { ...headers, cookie: cookie2 } })).json()).ops.map((op) => opSchema.parse(op));
    const rolePut = later.filter((op) => op.path === `user/${userId}/role_id`).at(-1);
    expect(rolePut).toMatchObject({ kind: 'put', value: SYSTEM_ROLE_ROW_IDS.consulta, actor_id: 'system:admin' });
  }, 180_000);
});
