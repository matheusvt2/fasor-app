import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, userStatusPath, type AdminUserEvent, type SystemRoleId, type UserStatus } from '@app/domain';
import { and, eq, like } from 'drizzle-orm';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { now } from '../clock.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { asCompanyId } from '../db/repositories/company-id.ts';
import { roleOp } from '../db/roles.ts';
import { entities, verification } from '../db/schema.ts';
import { seedUser, TEST_SEED } from '../db/seed.ts';
import { dropCompany } from '../db/test-cleanup.ts';
import { clearFakeEmails } from '../email/fake-store.ts';
import { createApp, type AppOptions } from '../http/app.ts';
import { newId } from '../ids.ts';
import { createS3 } from '../storage/s3.ts';
import { applyServerBatch } from '../sync/apply.ts';
import { PASSWORD_LINK_PREFIX } from './password-links.ts';

/*
 * Stories 26.6 and 26.8, test setup only: the real auth, database and object store in process
 * (`app.request()`), the origin guard on, throwaway companies whose users the suites seed, and the
 * cleanup of what they leave (the company, its links, the stored messages of its addresses).
 */

export const apiUrl = process.env.API_URL ?? 'http://api:3000';
export const config = loadConfig();
export const { sql, db } = createDb(config.DATABASE_URL);
const trustedOrigins = parseTrustedOrigins(config.TRUSTED_ORIGINS);
export const auth = createAuth({ db, secret: config.SESSION_SECRET, baseURL: config.AUTH_BASE_URL, trustedOrigins });
export const APP_ORIGIN = 'https://app.example.com';
const s3 = createS3(config);

export interface Person {
  companyId: string;
  userId: string;
  email: string;
  name: string;
}

/** A harness over one in-process app; `options` overrides (limits, events, the e-mail provider). */
export function adminHarness(options: Partial<AppOptions> = {}) {
  const staticDir = mkdtempSync(join(tmpdir(), 'admin-'));
  const up = async () => undefined;
  const events: AdminUserEvent[] = [];
  const companies = new Set<string>();
  const addresses = new Set<string>();
  const app = createApp({
    originGuard: { trustedOrigins: [...trustedOrigins, apiUrl] },
    probes: { db: up, queue: up, storage: up, libreoffice: up },
    auth,
    db,
    s3,
    bucket: config.S3_BUCKET,
    staticDir,
    appOrigin: APP_ORIGIN,
    adminEvents: (event) => void events.push(event),
    ...options,
  });

  /** A request of the app's own: a trusted origin and the contract version (and a client address). */
  function call(path: string, init: RequestInit & { cookie?: string; from?: string } = {}): Promise<Response> {
    const { cookie, from, ...rest } = init;
    return Promise.resolve(
      app.request(path, {
        ...rest,
        headers: {
          origin: apiUrl,
          [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
          'x-forwarded-for': from ?? `10.26.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
          ...(cookie === undefined ? {} : { cookie }),
          ...(rest.headers as Record<string, string> | undefined),
        },
      }),
    );
  }

  /** A JSON request. */
  function json(path: string, body: unknown, init: { method?: string; cookie?: string; from?: string } = {}): Promise<Response> {
    const text = JSON.stringify(body);
    return call(path, {
      method: init.method ?? 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(text)) },
      body: text,
      ...(init.cookie === undefined ? {} : { cookie: init.cookie }),
      ...(init.from === undefined ? {} : { from: init.from }),
    });
  }

  /** Signs in; answers the raw response. */
  function signInRaw(email: string, password: string = TEST_SEED.password): Promise<Response> {
    return json('/api/auth/sign-in/email', { email, password });
  }

  /** Signs in and answers the cookie to replay. */
  async function signIn(email: string, password: string = TEST_SEED.password): Promise<string> {
    const res = await signInRaw(email, password);
    if (res.status !== 200) throw new Error(`sign-in of a test user answered ${res.status}: ${await res.text()}`);
    return res.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  }

  /** A new throwaway company id, dropped by `cleanup`. */
  function company(): string {
    const id = newId();
    companies.add(id);
    return id;
  }

  /** Seeds one user of `companyId` with a seeded role (the password is `TEST_SEED.password`). */
  async function seedPerson(companyId: string, role: SystemRoleId, name: string): Promise<Person> {
    const email = `${role}-${newId()}@teste.local`;
    addresses.add(email);
    const result = await seedUser(db, auth, { companyId, companyName: 'Empresa Exemplo', email, password: TEST_SEED.password, name, council: 'crea', registrationNumber: 'SP 26', role });
    return { companyId, userId: result.userId, email, name };
  }

  /** Puts a user's status as a server op, leaving his sessions (a stand-in for a change made elsewhere). */
  async function putStatus(person: Person, status: UserStatus): Promise<void> {
    const companyId = asCompanyId(person.companyId);
    await applyServerBatch(db, companyId, [roleOp(companyId, { kind: 'put', path: userStatusPath(person.userId), value: status })], { now });
  }

  /** The user's kernel row. */
  async function kernelOf(person: { companyId: string; userId: string }): Promise<Record<string, unknown> | undefined> {
    const [row] = await db
      .select({ row: entities.row })
      .from(entities)
      .where(and(eq(entities.company_id, person.companyId), eq(entities.entity, 'user'), eq(entities.id, person.userId)))
      .limit(1);
    return row?.row as Record<string, unknown> | undefined;
  }

  /** The user's password link rows. */
  async function linksOf(userId: string) {
    return db
      .select({ identifier: verification.identifier, expiresAt: verification.expiresAt, companyId: verification.companyId })
      .from(verification)
      .where(and(eq(verification.value, userId), like(verification.identifier, `${PASSWORD_LINK_PREFIX}%`)));
  }

  /** Remembers an address whose stored messages `cleanup` removes. */
  const remember = (address: string) => void addresses.add(address.toLowerCase());

  async function cleanup(): Promise<void> {
    for (const id of companies) await dropCompany(db, id);
    for (const address of addresses) await clearFakeEmails(db, { to: address });
    rmSync(staticDir, { recursive: true, force: true });
  }

  return { app, call, json, signIn, signInRaw, company, seedPerson, putStatus, kernelOf, linksOf, remember, events, cleanup };
}
