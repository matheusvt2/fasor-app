import { registrationOfUserRow, userRowSchema, uuidV7Schema, type UserProfile, type UserRow } from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../client.ts';
import { company, entities, user } from '../schema.ts';
import type { CompanyId } from './company-id.ts';

/**
 * Every exported function takes `companyId: CompanyId` first and every query filters on
 * it (AD-10). A call that omits it, or passes a plain string, does not compile.
 *
 * A profile is composed from two homes: identity (name, e-mail, company) from the
 * better-auth tables, and the CAP-6 registration from the kernel `user` entity the op
 * log materializes. The registration has no column in the identity table.
 */

interface IdentityRow {
  id: string;
  name: string;
  email: string;
  companyId: string;
  companyName: string;
}

const identityColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  companyId: user.companyId,
  companyName: company.name,
};

const NO_REGISTRATION = { council: null, registrationNumber: null, title: null } as const;

/** The materialized `user` rows of this company, by id; ids that are not uuidv7 have none. */
async function userEntities(db: Db, companyId: CompanyId, ids: readonly string[]) {
  const keys = ids.filter((id) => uuidV7Schema.safeParse(id).success);
  const byId = new Map<string, UserRow>();
  if (keys.length === 0) return byId;
  const rows = await db
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), inArray(entities.id, keys)));
  for (const row of rows) {
    const parsed = userRowSchema.safeParse(row.row);
    if (parsed.success) byId.set(row.id, parsed.data);
  }
  return byId;
}

async function compose(db: Db, companyId: CompanyId, identities: readonly IdentityRow[]): Promise<UserProfile[]> {
  const rows = await userEntities(
    db,
    companyId,
    identities.map((i) => i.id),
  );
  return identities.map((identity) => {
    const entity = rows.get(identity.id);
    return { ...identity, ...(entity === undefined ? NO_REGISTRATION : registrationOfUserRow(entity)) };
  });
}

/** The signed-in user's profile, scoped to the company the session resolved. */
export async function findUserProfile(
  db: Db,
  companyId: CompanyId,
  userId: string,
): Promise<UserProfile | undefined> {
  const rows = await db
    .select(identityColumns)
    .from(user)
    .innerJoin(company, eq(company.id, user.companyId))
    .where(and(eq(user.companyId, companyId), eq(user.id, userId)))
    .limit(1);
  const [profile] = await compose(db, companyId, rows);
  return profile;
}

/** Every user of one company. Used by the cross-tenant test and by provisioning. */
export async function listUserProfiles(
  db: Db,
  companyId: CompanyId,
): Promise<UserProfile[]> {
  const rows = await db
    .select(identityColumns)
    .from(user)
    .innerJoin(company, eq(company.id, user.companyId))
    .where(eq(user.companyId, companyId));
  return compose(db, companyId, rows);
}
