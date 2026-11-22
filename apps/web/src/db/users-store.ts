import { roleRowSchema, userRowSchema, type RoleRow, type UserRow } from '@app/domain';
import type { AppDatabase } from './schema.ts';

/*
 * Story 26.9: what the Usuários screen reads from the device store, the company's `user` and `role`
 * rows the company pull brings. A row that does not parse is left out rather than shown half.
 */

export interface UserDirectoryRows {
  users: UserRow[];
  roles: RoleRow[];
}

/** The company's user and role rows on this device. */
export async function localUserDirectory(db: AppDatabase): Promise<UserDirectoryRows> {
  const [userRecords, roleRecords] = await Promise.all([db.entities.where('entity').equals('user').toArray(), db.entities.where('entity').equals('role').toArray()]);
  const users: UserRow[] = [];
  for (const record of userRecords) {
    const parsed = userRowSchema.safeParse(record.row);
    if (parsed.success) users.push(parsed.data);
  }
  const roles: RoleRow[] = [];
  for (const record of roleRecords) {
    const parsed = roleRowSchema.safeParse(record.row);
    if (parsed.success) roles.push(parsed.data);
  }
  return { users, roles };
}
