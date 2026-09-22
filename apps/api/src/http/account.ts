import { ACCOUNT_ROUTES } from '@app/domain';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import { findUserProfile } from '../db/repositories/users.ts';
import { type AppEnv, requireSession } from './session.ts';

/**
 * The signed-in user's own account, read-only. The profile is identity (name, e-mail,
 * company) composed with the registration fields of the user's kernel `user` entity;
 * the registration itself is written only as `user/{id}/{field}` ops through the sync
 * push (AD-1, AD-3), so there is no account write route.
 */
export function createAccountRoutes(db: Db): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get(ACCOUNT_ROUTES.read.path, async (c) => {
    const session = requireSession(c);
    const profile = await findUserProfile(db, session.companyId, session.userId);
    if (profile === undefined) {
      return c.json({ code: 'user_not_found', message: 'This user is not in this company.' }, 404);
    }
    return c.json({ user: profile });
  });

  return routes;
}
