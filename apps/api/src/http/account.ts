import { registrationRequestSchema } from '@app/domain';
import { Hono } from 'hono';
import type { Database } from '../db/client.ts';
import { findUserProfile, updateUserRegistration } from '../db/repositories/users.ts';
import { type AppEnv, requireSession } from './session.ts';

/**
 * The signed-in user's own account. A short list of named server actions is allowed to
 * exist beside the op log (AD-9); the professional registration is one of them until the
 * `user/{id}/{field}` op family lands with Story 1.4.
 */
export function createAccountRoutes(db: Database): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get('/api/account', async (c) => {
    const session = requireSession(c);
    const profile = await findUserProfile(db, session.companyId, session.userId);
    if (profile === undefined) {
      return c.json({ code: 'user_not_found', message: 'This user is not in this company.' }, 404);
    }
    return c.json({ user: profile });
  });

  routes.put('/api/account/registration', async (c) => {
    const session = requireSession(c);
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = registrationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          // English, like every other envelope: the web maps `code` to its own pt-BR
          // string in `apps/web/src/copy`.
          code: 'registration_invalid',
          message: 'The professional registration is invalid.',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        400,
      );
    }
    const profile = await updateUserRegistration(
      db,
      session.companyId,
      session.userId,
      parsed.data,
    );
    if (profile === undefined) {
      return c.json({ code: 'user_not_found', message: 'This user is not in this company.' }, 404);
    }
    return c.json({ user: profile });
  });

  return routes;
}
