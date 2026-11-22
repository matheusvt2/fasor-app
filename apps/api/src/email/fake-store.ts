import { tokenFromFragment } from '@app/domain';
import { and, asc, eq, gte, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { fakeEmail } from '../db/schema.ts';
import type { EmailPurpose } from './types.ts';

/*
 * Story 26.6, test support: the messages the `fake` provider stored, read by the api tests and the
 * e2e helper (`e2e/support/fake-email.ts`). Stories 26.8, 26.9 and 26.11 reuse it.
 */

export interface FakeEmail {
  id: string;
  created_at: Date;
  to: string;
  purpose: EmailPurpose;
  subject: string;
  text: string;
  html: string;
}

export interface FakeEmailFilter {
  to?: string;
  purpose?: EmailPurpose;
  /** Only messages stored at or after this instant. */
  since?: Date;
}

function where(filter: FakeEmailFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.to !== undefined) conditions.push(eq(fakeEmail.to_email, filter.to.trim().toLowerCase()));
  if (filter.purpose !== undefined) conditions.push(eq(fakeEmail.purpose, filter.purpose));
  if (filter.since !== undefined) conditions.push(gte(fakeEmail.created_at, filter.since));
  return conditions.length === 0 ? undefined : and(...conditions);
}

/** The stored messages that match, oldest first. */
export async function readFakeEmails(db: Db, filter: FakeEmailFilter = {}): Promise<FakeEmail[]> {
  const rows = await db.select().from(fakeEmail).where(where(filter)).orderBy(asc(fakeEmail.created_at), asc(fakeEmail.id));
  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    to: row.to_email,
    purpose: row.purpose as EmailPurpose,
    subject: row.subject,
    text: row.text_body,
    html: row.html_body,
  }));
}

/** The latest matching message, waiting for it up to `timeoutMs` (default 10 s); throws past it. */
export async function waitForFakeEmail(db: Db, filter: FakeEmailFilter & { to: string; timeoutMs?: number }): Promise<FakeEmail> {
  const deadline = Date.now() + (filter.timeoutMs ?? 10_000);
  for (;;) {
    const found = (await readFakeEmails(db, filter)).at(-1);
    if (found !== undefined) return found;
    if (Date.now() >= deadline) throw new Error(`no e-mail (${filter.purpose ?? 'any purpose'}) was stored for the address in time`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The set-password link a message carries (the first `/definir-senha#` link of its text). */
export function fakeEmailLink(message: Pick<FakeEmail, 'text'>): string {
  const match = /https?:\/\/\S+\/definir-senha#[A-Za-z0-9_-]+/.exec(message.text);
  if (match === null) throw new Error('the message carries no set-password link');
  return match[0];
}

/** The token of the message's link. */
export function fakeEmailToken(message: Pick<FakeEmail, 'text'>): string {
  const token = tokenFromFragment(new URL(fakeEmailLink(message)).hash);
  if (token === null) throw new Error('the link carries no token');
  return token;
}

/** Removes the stored messages, of one address or all. */
export async function clearFakeEmails(db: Db, filter: { to?: string } = {}): Promise<void> {
  await db.delete(fakeEmail).where(where(filter));
}
