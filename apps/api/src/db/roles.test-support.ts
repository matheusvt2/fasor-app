import { SYSTEM_IDENTITY_ACTOR, SYSTEM_ROLE_ROW_IDS, systemRoleRow, toIso, type RoleRow, type SystemRoleId, type UserRow } from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { applyServerBatch } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import type { Db } from './client.ts';
import type { CompanyId } from './repositories/company-id.ts';
import { ensureSystemRoles } from './roles.ts';
import { entities } from './schema.ts';

/*
 * Story 26.4, test setup only: since the push refuses an op whose key the actor's role lacks
 * (`checkClientOp`, fail closed), a suite that pushes as a user of a throwaway company gives that
 * user a kernel row and a role first. Every existing suite's actor is an Admin, as before roles.
 */

/** The seeded role row a stand-in session carries (`SessionContext.role`). */
export function standInRole(system: SystemRoleId = 'admin'): RoleRow {
  return systemRoleRow(system);
}

/**
 * The company's five roles and a `user/{id}` row for `userId` with that role (Admin by default),
 * through server ops; idempotent (an existing user row is left as it is).
 */
export async function seedRoleActor(db: Db, companyId: CompanyId, userId: string, system: SystemRoleId = 'admin', name = 'Ator de Teste'): Promise<void> {
  await ensureSystemRoles(db, companyId);
  const [existing] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, userId)))
    .limit(1);
  if (existing !== undefined) return;
  const row: UserRow = {
    id: userId,
    name,
    email: `ator-${userId}@teste.local`,
    council: null,
    registration_number: null,
    title: null,
    photo_location_enabled: true,
    role_id: SYSTEM_ROLE_ROW_IDS[system],
    status: 'active',
  };
  const op = serverOp({ opId: newId(), companyId, actorId: SYSTEM_IDENTITY_ACTOR, clientTs: toIso(now()), kind: 'create', path: `user/${userId}`, value: row, scope: 'company' });
  await applyServerBatch(db, companyId, [op], { now });
}
