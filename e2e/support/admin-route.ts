import { adminUserRoutePath, adminUserResponseSchema, type AdminUserResponse, type AdminUserRouteName } from '@app/domain';
import { expect, type APIRequestContext } from '@playwright/test';
import { SEED_PASSWORD, timed } from './merged-fixtures.ts';

/*
 * Stories 26.6 and 26.11: the Admin's user routes (`/api/admin/users`, Story 26.8) called from the
 * test runner with an Admin's own session, as the Usuários screen would call them. The session
 * cookie is `Secure` and the preview server is plain http, so the cookie is read off the sign-in
 * answer and sent by hand on each call (the same reason as `signInForDurability`); every POST names
 * the app's origin and carries a JSON body, as the origin guard asks.
 */

/** The e2e base URL (`playwright.config.ts` `use.baseURL`). */
const ORIGIN = 'http://localhost:5200';

export interface AdminApi {
  /** `POST /api/admin/users`: the user is born invited with the role and the invitation leaves. */
  create(body: { name: string; email: string; role_id: string }): Promise<AdminUserResponse>;
  /** One action route (`pause`, `reactivate`, `remove`, `resend_invitation`, `send_reset`) on one user. */
  act(route: Exclude<AdminUserRouteName, 'list' | 'create' | 'edit'>, userId: string): Promise<AdminUserResponse>;
}

/** Signs `email` in through the auth route and returns the Admin routes as that user. */
export function adminApi(request: APIRequestContext, email: string, password: string = SEED_PASSWORD): Promise<AdminApi> {
  return timed('adminApi', async () => {
    const signIn = await request.post('/api/auth/sign-in/email', { headers: { origin: ORIGIN }, data: { email, password } });
    expect(signIn.ok(), `the Admin's sign-in answered ${signIn.status()}`).toBe(true);
    const header = (await signIn.headersArray()).find((entry) => entry.name.toLowerCase() === 'set-cookie');
    expect(header, 'the sign-in set no cookie').toBeDefined();
    const cookie = header!.value.split(';')[0]!;
    const headers = { origin: ORIGIN, cookie };

    async function post(path: string, data: unknown): Promise<AdminUserResponse> {
      const response = await request.post(path, { headers, data });
      expect(response.ok(), `POST ${path} answered ${response.status()}: ${await response.text()}`).toBe(true);
      return adminUserResponseSchema.parse(await response.json());
    }

    return {
      create: (body) => post(adminUserRoutePath('create'), body),
      act: (route, userId) => post(adminUserRoutePath(route, userId), {}),
    };
  });
}
