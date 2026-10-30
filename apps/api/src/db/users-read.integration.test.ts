import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.ts';
import { newId } from '../ids.ts';
import { createDb } from './client.ts';
import { company, session, user } from './schema.ts';
import { dropCompany } from './test-cleanup.ts';
import { readUsers } from './users-read.ts';

/*
 * E18-A2: the users read behind the dashboard's `user_id` values, against the compose
 * Postgres. A company holds two users, one with two sessions (one expired) and one who never
 * signed in; a neighbour company holds one user with one session. The company filter must
 * never show the neighbour; without a filter both appear, by company name then user name.
 */

const root = resolve(import.meta.dirname, '../../../..');
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);

const companyId = newId();
const neighbourId = newId();
const tag = companyId.slice(-12);
const u1 = `user-${tag}-ana`;
const u2 = `user-${tag}-bia`;
const u3 = `user-${tag}-neighbour`;

beforeAll(async () => {
  await db.insert(company).values([
    { id: companyId, name: `ZZ Users Read ${tag}` },
    { id: neighbourId, name: `AA Neighbour ${tag}` },
  ]);
  await db.insert(user).values([
    { id: u1, companyId, name: `Ana ${tag}`, email: `ana-${tag}@teste.local` },
    { id: u2, companyId, name: `Bia ${tag}`, email: `bia-${tag}@teste.local` },
    { id: u3, companyId: neighbourId, name: `Caio ${tag}`, email: `caio-${tag}@teste.local` },
  ]);
  await db.insert(session).values([
    { id: `s1-${tag}`, companyId, userId: u1, token: `t1-${tag}`, expiresAt: new Date('2026-01-02T00:00:00Z'), createdAt: new Date('2026-01-01T10:00:00Z') },
    { id: `s2-${tag}`, companyId, userId: u1, token: `t2-${tag}`, expiresAt: new Date('2099-01-01T00:00:00Z'), createdAt: new Date('2026-03-01T08:30:00Z') },
    { id: `s3-${tag}`, companyId: neighbourId, userId: u3, token: `t3-${tag}`, expiresAt: new Date('2099-01-01T00:00:00Z'), createdAt: new Date('2026-02-01T09:00:00Z') },
  ]);
});

afterAll(async () => {
  await dropCompany(db, companyId);
  await dropCompany(db, neighbourId);
  await sql.end();
});

describe('readUsers', () => {
  it('lists the users of one company with their sessions and last sign-in, never the neighbour', async () => {
    const rows = await readUsers(db, companyId);
    expect(rows.map((row) => row.user_id)).toEqual([u1, u2]);
    expect(rows[0]).toMatchObject({
      company_id: companyId,
      company_name: `ZZ Users Read ${tag}`,
      name: `Ana ${tag}`,
      email: `ana-${tag}@teste.local`,
      sessions: 2,
      last_session_at: '2026-03-01T08:30:00.000Z',
    });
    expect(rows[1]).toMatchObject({ user_id: u2, sessions: 0, last_session_at: null });
    expect(typeof rows[0]!.created_at).toBe('string');
  });

  it('lists every company without a filter, by company name then user name', async () => {
    const rows = (await readUsers(db)).filter((row) => row.company_id === companyId || row.company_id === neighbourId);
    expect(rows.map((row) => row.user_id)).toEqual([u3, u1, u2]);
    expect(rows[0]).toMatchObject({ company_name: `AA Neighbour ${tag}`, sessions: 1, last_session_at: '2026-02-01T09:00:00.000Z' });
  });

  it('reads a company with no users as an empty list', async () => {
    expect(await readUsers(db, newId())).toEqual([]);
  });
});

describe('users-read-cli', () => {
  const cli = (args: string[]) => spawnSync('pnpm', ['exec', 'tsx', 'apps/api/src/db/users-read-cli.ts', ...args], { cwd: root, encoding: 'utf8' });

  it('prints one JSON line per user of the company and a closing count', () => {
    const run = cli(['--company', companyId]);
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    const parsed = run.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const users = parsed.filter((line) => line.msg === 'users read');
    expect(users.map((line) => line.user_id)).toEqual([u1, u2]);
    expect(users[0]).toMatchObject({ company_id: companyId, name: `Ana ${tag}`, email: `ana-${tag}@teste.local`, sessions: 2 });
    expect(parsed.at(-1)).toMatchObject({ msg: 'users read done', users: 2, company_id: companyId });
    expect(run.stdout).not.toContain(`Caio ${tag}`);
  });

  it('refuses a bad id, a flag without a value and an unknown flag, with nothing on stdout', () => {
    for (const args of [['--company', 'not-an-id'], ['--company'], ['--all']]) {
      const run = cli(args);
      expect(run.status, args.join(' ')).toBe(1);
      expect(run.stdout).toBe('');
      expect(run.stderr).toContain('refused');
    }
  });
});
