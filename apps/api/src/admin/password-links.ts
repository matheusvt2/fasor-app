import { randomBytes } from 'node:crypto';
import { and, eq, like, ne } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import type { CompanyId } from '../db/repositories/company-id.ts';
import { verification } from '../db/schema.ts';
import { newId as mintId } from '../ids.ts';
import type { Tx } from '../sync/apply.ts';

/*
 * Story 26.6 (AD-9): a password link is a better-auth verification row, `identifier =
 * reset-password:<token>`, `value =` the user's id, so better-auth's own `POST
 * /api/auth/reset-password` consumes it (deletes it, refuses it once expired). The invitation (72
 * hours) and the reset (1 hour) differ only in `expires_at`. A user holds at most one live link:
 * issuing one purges the others.
 */

/** The identifier prefix better-auth gives a reset row. */
export const PASSWORD_LINK_PREFIX = 'reset-password:';

/** Deletes the user's password links, except the one whose token is `keep`. */
export async function purgePasswordLinks(reader: Db | Tx, userId: string, keep?: string): Promise<void> {
  const ofUser = and(eq(verification.value, userId), like(verification.identifier, `${PASSWORD_LINK_PREFIX}%`));
  await reader.delete(verification).where(keep === undefined ? ofUser : and(ofUser, ne(verification.identifier, `${PASSWORD_LINK_PREFIX}${keep}`)));
}

export interface IssuePasswordLinkInput {
  companyId: CompanyId;
  userId: string;
  /** How long the link lives (`INVITATION_LINK_HOURS` or `RESET_LINK_HOURS`). */
  hours: number;
  now: Date;
  newId?: () => string;
}

/** Purges the user's links and inserts one that lives `hours` from `now`; answers its token. */
export async function issuePasswordLink(reader: Db | Tx, input: IssuePasswordLinkInput): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await purgePasswordLinks(reader, input.userId);
  await reader.insert(verification).values({
    id: (input.newId ?? mintId)(),
    companyId: input.companyId,
    identifier: `${PASSWORD_LINK_PREFIX}${token}`,
    value: input.userId,
    expiresAt: new Date(input.now.getTime() + input.hours * 3600 * 1000),
    createdAt: input.now,
    updatedAt: input.now,
  });
  return token;
}
