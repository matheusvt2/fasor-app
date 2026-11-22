// @vitest-environment node
import { ADMIN_ROLE_ID, CONTRACT_VERSION, CONTRACT_VERSION_HEADER } from '@app/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminUserAction, createAdminUser, editAdminUser, listAdminUsers, type AdminUserActionRoute } from './admin-users-client.ts';

/*
 * Story 26.9: the wire of the Usuários screen. A stubbed `fetch` reads what each call sends and
 * answers what the Admin routes of Story 26.8 answer; every call resolves to a result.
 */

const ID = '019966b0-0269-7000-8000-0000000000e1';
const view = { id: ID, name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br', role: { id: ADMIN_ROLE_ID, name: 'Admin' }, status: 'active', last_sign_in: null };

type FetchCall = [input: string, init: RequestInit];

function stub(status: number, body: unknown) {
  const fetch = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('26.9-UNIT-010 the Admin user routes on the wire', () => {
  it('lists with a GET, same-origin, the contract header and no body', async () => {
    const fetch = stub(200, { users: [view] });
    await expect(listAdminUsers()).resolves.toEqual({ ok: true, value: [view] });
    const [input, init] = fetch.mock.calls[0] as FetchCall;
    expect(input).toBe('/api/admin/users');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)[CONTRACT_VERSION_HEADER]).toBe(String(CONTRACT_VERSION));
  });

  it('creates with a JSON POST of name, e-mail and role', async () => {
    const fetch = stub(201, { user: { ...view, status: 'invited' }, invitation: 'sent' });
    const result = await createAdminUser({ name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br', role_id: ADMIN_ROLE_ID });
    expect(result).toEqual({ ok: true, value: { user: { ...view, status: 'invited' }, invitation: 'sent' } });
    const [input, init] = fetch.mock.calls[0] as FetchCall;
    expect(input).toBe('/api/admin/users');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Eduardo Prado', email: 'eduardo@exemplo.com.br', role_id: ADMIN_ROLE_ID });
  });

  it('edits with a PATCH on the user, and every action is a POST of {} on its path', async () => {
    const fetch = stub(200, { user: view });
    await editAdminUser(ID, { role_id: ADMIN_ROLE_ID });
    expect(fetch.mock.calls[0]?.[0]).toBe(`/api/admin/users/${ID}`);
    expect(fetch.mock.calls[0]?.[1].method).toBe('PATCH');
    const paths: Record<AdminUserActionRoute, string> = {
      pause: 'pause',
      reactivate: 'reactivate',
      remove: 'remove',
      resend_invitation: 'resend-invitation',
      send_reset: 'password-reset',
    };
    for (const [action, segment] of Object.entries(paths)) {
      fetch.mockClear();
      await adminUserAction(action as AdminUserActionRoute, ID);
      const [input, init] = fetch.mock.calls[0] as FetchCall;
      expect(input).toBe(`/api/admin/users/${ID}/${segment}`);
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
      expect(init.body).toBe('{}');
    }
  });

  it('a refusal carries the envelope\'s code and details', async () => {
    stub(409, { code: 'user_email_taken', message: 'taken', details: { user_id: ID, status: 'removed' } });
    await expect(createAdminUser({ name: 'X', email: 'x@exemplo.com.br', role_id: ADMIN_ROLE_ID })).resolves.toEqual({
      ok: false,
      failure: { kind: 'refused', status: 409, code: 'user_email_taken', details: { user_id: ID, status: 'removed' } },
    });
    stub(409, { code: 'last_admin', message: 'last' });
    await expect(adminUserAction('remove', ID)).resolves.toEqual({ ok: false, failure: { kind: 'refused', status: 409, code: 'last_admin' } });
    stub(429, { code: 'rate_limited', message: 'slow down' });
    await expect(adminUserAction('send_reset', ID)).resolves.toEqual({ ok: false, failure: { kind: 'refused', status: 429, code: 'rate_limited' } });
  });

  it('a network error is offline; a 5xx or a body off the contract is server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(listAdminUsers()).resolves.toEqual({ ok: false, failure: { kind: 'offline' } });
    stub(503, undefined);
    await expect(listAdminUsers()).resolves.toEqual({ ok: false, failure: { kind: 'server', status: 503 } });
    stub(200, { users: [{ id: ID }] });
    await expect(listAdminUsers()).resolves.toEqual({ ok: false, failure: { kind: 'server', status: 200 } });
  });
});
