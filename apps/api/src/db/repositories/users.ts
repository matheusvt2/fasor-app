import { councilSchema, type Registration, type UserProfile } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.ts';
import { company, user } from '../schema.ts';
import type { CompanyId } from './company-id.ts';

/**
 * Every exported function takes `companyId: CompanyId` first and every query filters on
 * it (AD-10). A call that omits it, or passes a plain string, does not compile.
 */

function toProfile(row: {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
  council: string | null;
  registrationNumber: string | null;
  title: string | null;
}): UserProfile {
  const council = councilSchema.safeParse(row.council);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    companyId: row.companyId,
    companyName: row.companyName,
    council: council.success ? council.data : null,
    registrationNumber: row.registrationNumber,
    title: row.title,
  };
}

const profileColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  companyId: user.companyId,
  companyName: company.name,
  council: user.council,
  registrationNumber: user.registrationNumber,
  title: user.title,
};

/** The signed-in user's profile, scoped to the company the session resolved. */
export async function findUserProfile(
  db: Database,
  companyId: CompanyId,
  userId: string,
): Promise<UserProfile | undefined> {
  const rows = await db
    .select(profileColumns)
    .from(user)
    .innerJoin(company, eq(company.id, user.companyId))
    .where(and(eq(user.companyId, companyId), eq(user.id, userId)))
    .limit(1);
  const row = rows[0];
  return row === undefined ? undefined : toProfile(row);
}

/** Every user of one company. Used by the cross-tenant test and by provisioning. */
export async function listUserProfiles(
  db: Database,
  companyId: CompanyId,
): Promise<UserProfile[]> {
  const rows = await db
    .select(profileColumns)
    .from(user)
    .innerJoin(company, eq(company.id, user.companyId))
    .where(eq(user.companyId, companyId));
  return rows.map(toProfile);
}

/** Writes the professional registration of one user of this company. */
export async function updateUserRegistration(
  db: Database,
  companyId: CompanyId,
  userId: string,
  registration: Registration,
): Promise<UserProfile | undefined> {
  const updated = await db
    .update(user)
    .set({
      council: registration.council,
      registrationNumber: registration.registrationNumber,
      title: registration.title,
      updatedAt: new Date(),
    })
    .where(and(eq(user.companyId, companyId), eq(user.id, userId)))
    .returning({ id: user.id });
  if (updated[0] === undefined) return undefined;
  return findUserProfile(db, companyId, userId);
}
