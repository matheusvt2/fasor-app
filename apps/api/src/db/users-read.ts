import { asc, count, eq, max } from 'drizzle-orm';
import type { Db } from './client.ts';
import { company, session, user } from './schema.ts';

/*
 * E18-A2 (2026-10-30, Matheus: "controlar os usuários logados"): the users of a company, or
 * of every company, with how often they signed in. Read-only (one SELECT). The usage events
 * carry the user as an opaque id (AD-28; the Conta sentence promises no name in the 90-day
 * log), so the dashboard's `users` view shows ids and this read maps them to people for the
 * reader of the digest. Its output is the account data an administrator already holds (name,
 * e-mail, sign-ins), never a relatório value.
 */

export interface UserRow {
  company_id: string;
  company_name: string;
  user_id: string;
  name: string;
  email: string;
  created_at: string;
  /** Sessions ever opened (rows of the `session` table, expired ones included). */
  sessions: number;
  /** When the latest session was opened, or null for a user who never signed in. */
  last_session_at: string | null;
}

/** The users of `companyId`, or of every company when it is undefined, by company name then user name. */
export async function readUsers(db: Db, companyId?: string): Promise<UserRow[]> {
  const query = db
    .select({
      companyId: user.companyId,
      companyName: company.name,
      userId: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      sessions: count(session.id),
      lastSessionAt: max(session.createdAt),
    })
    .from(user)
    .innerJoin(company, eq(company.id, user.companyId))
    .leftJoin(session, eq(session.userId, user.id))
    .groupBy(user.id, company.id)
    .orderBy(asc(company.name), asc(user.name), asc(user.id));
  const rows = companyId === undefined ? await query : await query.where(eq(user.companyId, companyId));
  return rows.map((row) => ({
    company_id: row.companyId,
    company_name: row.companyName,
    user_id: row.userId,
    name: row.name,
    email: row.email,
    created_at: row.createdAt.toISOString(),
    sessions: row.sessions,
    last_session_at: row.lastSessionAt === null ? null : row.lastSessionAt.toISOString(),
  }));
}
