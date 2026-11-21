import {
  ADMIN_ROLE_ID,
  canonicalJson,
  rolePath,
  roleRowSchema,
  SYSTEM_ADMIN_ACTOR,
  SYSTEM_ROLE_ROW_IDS,
  systemRoleRows,
  toIso,
  userRolePath,
  userStatusPath,
  uuidV7Schema,
  type Op,
  type RoleRow,
  type SystemRoleId,
} from '@app/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { now } from '../clock.ts';
import { newId } from '../ids.ts';
import { log, type LogFields } from '../log.ts';
import { applyServerBatch, type Tx } from '../sync/apply.ts';
import { serverOp } from '../sync/server-op.ts';
import type { Db } from './client.ts';
import { asCompanyId, type CompanyId } from './repositories/company-id.ts';
import { company, entities } from './schema.ts';

/*
 * Stories 26.3 and 26.4 (AD-29): a company's roles and its users' role and status are company
 * data in the op log, written only as server ops (actor `system:admin`, device `server`) through
 * `applyServerBatch`, never by a direct write to `entities`.
 *
 * - `ensureSystemRoles`: the five seeded roles a company holds (`systemRoleRows`, constant ids),
 *   each created when absent. The seed calls it with every user, so a new company gets its roles
 *   with its first user, and a test company emptied by a reset gets them back on its next seed.
 * - `upgradeRolesAndUsers`: the data step that runs after the migrations (the api's boot and
 *   `migrate-cli`, beside `upgradeTemplateSeeds`): for every company, its five roles, then every
 *   user row without a role gets the Admin role, and every one without a status gets `active`
 *   (decision 6 of 2026-11-21: every user that exists today becomes Admin).
 *
 * Both decide outside the company lock, then decide again under it (the batch's `before`); a
 * decision the lock shows stale is recomputed once. Idempotent: a second run writes no op.
 */

/** Thrown under the company lock when another writer changed what this step decided. */
class DecisionChanged extends Error {}

/** One server op of the role families, `system:admin`, company scope. */
export function roleOp(companyId: CompanyId, input: { kind: Op['kind']; path: string; value: unknown; batchId?: string | null }): Op {
  return serverOp({
    opId: newId(),
    companyId,
    actorId: SYSTEM_ADMIN_ACTOR,
    clientTs: toIso(now()),
    kind: input.kind,
    path: input.path,
    value: input.value,
    scope: 'company',
    batchId: input.batchId ?? null,
  });
}

/** What one decision would write, comparable across the two reads (paths and values, not op ids). */
type Writes = ReadonlyArray<{ kind: Op['kind']; path: string; value: unknown }>;

const signature = (writes: Writes): string => canonicalJson(writes.map((w) => [w.kind, w.path, w.value]));

/**
 * Applies what `decide` answers as one server batch under the company lock, decided again there.
 * Answers how many ops it wrote.
 */
export async function applyDecidedWrites(db: Db, companyId: CompanyId, decide: (reader: Db | Tx) => Promise<Writes>, what: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    const writes = await decide(db);
    if (writes.length === 0) return 0;
    const batchId = writes.length > 1 ? newId() : null;
    const batch = writes.map((write) => roleOp(companyId, { ...write, batchId }));
    try {
      await applyServerBatch(db, companyId, batch, {
        now,
        before: async (tx: Tx) => {
          if (signature(await decide(tx)) !== signature(writes)) throw new DecisionChanged();
        },
      });
      return batch.length;
    } catch (error) {
      if (error instanceof DecisionChanged && attempt === 1) continue;
      if (error instanceof DecisionChanged) throw new Error(`could not write ${what} of company ${companyId}: another writer changed it twice while this one ran`, { cause: error });
      throw error;
    }
  }
}

/** The seeded role rows the company lacks (absent rows only; a stored row is never rewritten). */
async function missingSystemRoles(reader: Db | Tx, companyId: CompanyId): Promise<RoleRow[]> {
  const ids = Object.values(SYSTEM_ROLE_ROW_IDS);
  const present = await reader
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'role'), inArray(entities.id, ids)));
  const held = new Set(present.map((row) => row.id));
  return systemRoleRows().filter((row) => !held.has(row.id));
}

/** Story 26.3: the five seeded roles of the company, each created when absent. Answers how many it created. */
export async function ensureSystemRoles(db: Db, companyId: CompanyId): Promise<number> {
  return applyDecidedWrites(
    db,
    companyId,
    async (reader) => (await missingSystemRoles(reader, companyId)).map((row) => ({ kind: 'create' as const, path: rolePath(row.id), value: row })),
    'the system roles',
  );
}

/** The role and status puts that bring every user row of the company to a role and a status. */
async function userDefaults(reader: Db | Tx, companyId: CompanyId): Promise<Writes> {
  const rows = await reader
    .select({ id: entities.id, row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user')))
    .orderBy(entities.id);
  const writes: { kind: Op['kind']; path: string; value: unknown }[] = [];
  for (const { id, row } of rows) {
    const user = row as { role_id?: unknown; status?: unknown };
    if (user.role_id === undefined) writes.push({ kind: 'put', path: userRolePath(id), value: ADMIN_ROLE_ID });
    if (user.status === undefined) writes.push({ kind: 'put', path: userStatusPath(id), value: 'active' });
  }
  return writes;
}

/** What `upgradeRolesAndUsers` did, for the boot log and the deploy record. */
export interface RolesUpgradeResult {
  companies: number;
  roles_created: number;
  user_ops: number;
}

/**
 * Story 26.3: for every company, its five seeded roles, then every user without a role becomes
 * Admin and every one without a status `active`. Idempotent: a second run writes nothing.
 */
export async function upgradeRolesAndUsers(db: Db, deps: { info?: (msg: string, fields?: LogFields) => void } = {}): Promise<RolesUpgradeResult> {
  const info = deps.info ?? log;
  const companies = await db.select({ id: company.id }).from(company).orderBy(company.id);
  const result: RolesUpgradeResult = { companies: companies.length, roles_created: 0, user_ops: 0 };
  for (const { id } of companies) {
    const companyId = asCompanyId(id);
    const created = await ensureSystemRoles(db, companyId);
    const userOps = await applyDecidedWrites(db, companyId, (reader) => userDefaults(reader, companyId), 'the users\' role and status');
    if (created + userOps > 0) info('roles upgraded', { company_id: id, roles_created: created, user_ops: userOps });
    result.roles_created += created;
    result.user_ops += userOps;
  }
  return result;
}

/** The role row a user row names in the company, or null (no `role_id`, no such row, a row that does not parse). */
export async function roleOfUser(reader: Db | Tx, companyId: CompanyId, userId: string): Promise<{ user: Record<string, unknown> | null; role: RoleRow | null }> {
  // An id of no kernel shape names no user row (and would not cast to the uuid column).
  if (!uuidV7Schema.safeParse(userId).success) return { user: null, role: null };
  const [userRecord] = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'user'), eq(entities.id, userId)))
    .limit(1);
  const user = (userRecord?.row as Record<string, unknown> | undefined) ?? null;
  const roleId = user?.role_id;
  if (typeof roleId !== 'string') return { user, role: null };
  const [roleRecord] = await reader
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'role'), eq(entities.id, roleId)))
    .limit(1);
  const parsed = roleRecord === undefined ? null : roleRowSchema.safeParse(roleRecord.row);
  return { user, role: parsed !== null && parsed.success ? parsed.data : null };
}

/** The row id of a seeded role. */
export function systemRoleId(system: SystemRoleId): string {
  return SYSTEM_ROLE_ROW_IDS[system];
}
