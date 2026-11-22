import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { clearFakeEmails, fakeEmailLink, fakeEmailToken, waitForFakeEmail } from '../../apps/api/src/email/fake-store.ts';
import type { EmailPurpose } from '../../apps/api/src/email/types.ts';

/*
 * Story 26.6: the e-mails the api's `fake` provider stored (`fake_email`), read from the test
 * runner against the compose Postgres. A thin wrapper over `apps/api/src/email/fake-store.ts`, the
 * one reader the api tests share; Stories 26.6 (web half), 26.9 and 26.11 use it in their specs.
 */

export interface StoredEmail {
  subject: string;
  /** The set-password link the message carries. */
  link: string;
  /** The link's token (its fragment). */
  token: string;
}

/** The latest message to `to` (of `purpose` when given) stored at or after `since`, waiting up to `timeoutMs`. */
export async function waitForEmail(to: string, purpose?: EmailPurpose, options: { since?: Date; timeoutMs?: number } = {}): Promise<StoredEmail> {
  const { sql, db } = createDb(loadConfig().DATABASE_URL);
  try {
    const message = await waitForFakeEmail(db, {
      to,
      ...(purpose === undefined ? {} : { purpose }),
      ...(options.since === undefined ? {} : { since: options.since }),
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    return { subject: message.subject, link: fakeEmailLink(message), token: fakeEmailToken(message) };
  } finally {
    await sql.end();
  }
}

/** Removes the stored messages of one address. */
export async function clearEmails(to: string): Promise<void> {
  const { sql, db } = createDb(loadConfig().DATABASE_URL);
  try {
    await clearFakeEmails(db, { to });
  } finally {
    await sql.end();
  }
}
