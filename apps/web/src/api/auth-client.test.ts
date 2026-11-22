import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInEmail = vi.fn();
const signOutCall = vi.fn();

vi.mock('better-auth/client', () => ({
  createAuthClient: () => ({ signIn: { email: signInEmail }, signOut: signOutCall }),
}));

const { isClientRejection, onReAuthRequired, publishReAuth, readSession, requestPasswordReset, resetPassword, signIn, signOut } = await import('./auth-client.ts');

const profile = {
  id: '0a000000-0000-7000-8000-0000000000a1',
  name: 'Ana Alves',
  email: 'a@teste.local',
  companyId: '0a000000-0000-7000-8000-00000000000a',
  companyName: 'Empresa A de Teste',
  council: 'crea',
  registrationNumber: 'SP 1',
  title: 'Eng. Eletricista',
};

describe('signIn classifies failures', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    signInEmail.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads a 401 as a credential rejection', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid' } });
    const result = await signIn('a@teste.local', 'wrong');
    expect(result).toMatchObject({ ok: false, reason: 'credentials' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('L10: reads a 429 as too many attempts, never as a wrong password', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 429, message: 'Too many requests' } });
    const result = await signIn('a@teste.local', 'right');
    expect(result).toEqual({ ok: false, reason: 'rate-limited', message: 'Muitas tentativas. Tente novamente em alguns minutos.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps a 400 and a 401 as the wrong-password text', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 400, message: 'Bad' } });
    expect(await signIn('a@teste.local', 'x')).toMatchObject({ ok: false, reason: 'credentials', message: 'E-mail ou senha incorretos.' });
  });

  it('reads a 500 as the server being unavailable, never as a wrong password or no connection', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 500, message: 'db down' } });
    const result = await signIn('a@teste.local', 'right');
    expect(result).toEqual({
      ok: false,
      reason: 'server',
      message: 'Não foi possível falar com o servidor. Tente de novo em instantes.',
    });
  });

  it('reads an error without a status (transport failure) while online as the server', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'server' });
  });

  it('reads a thrown request while online as the server', async () => {
    signInEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'server' });
  });

  it('reads a thrown request with no network as offline, with the offline sentence', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    signInEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await signIn('a@teste.local', 'right');
    expect(result).toMatchObject({ ok: false, reason: 'offline' });
    expect(result.ok ? '' : result.message).toMatch(/^Sem conexão/);
  });

  it('reads a failed account read after an accepted pair as the server', async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'server' });
  });

  it('returns the profile after an accepted pair', async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: profile, features: { ai: false } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await signIn('a@teste.local', 'right');
    expect(result).toMatchObject({ ok: true, user: { id: profile.id, council: 'crea' }, features: { ai: false } });
    // The account read goes through the contract route (AD-13), not a literal of its own.
    expect(fetchMock).toHaveBeenCalledWith('/api/account', expect.objectContaining({ method: 'GET' }));
  });

  it('isClientRejection is true only for 4xx', () => {
    expect(isClientRejection(400)).toBe(true);
    expect(isClientRejection(401)).toBe(true);
    expect(isClientRejection(500)).toBe(false);
    expect(isClientRejection(503)).toBe(false);
    expect(isClientRejection(undefined)).toBe(false);
  });

  it('26.11 reads the inactive code as a paused account, never as a wrong password', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, code: 'user_inactive', message: 'This user is not active.' } });
    const result = await signIn('a@teste.local', 'right');
    expect(result).toEqual({ ok: false, reason: 'inactive', message: 'Conta pausada. Fale com o administrador.' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('e26s-UNIT the account read tells a paused account from an ended session', () => {
  const fetchMock = vi.fn();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('401 user_inactive is inactive, any other 401 is no session, 200 is the profile, a 5xx throws', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: 'user_inactive', message: 'This user is not active.' }));
    expect(await readSession()).toBe('inactive');
    fetchMock.mockResolvedValueOnce(json(401, { code: 'unauthenticated', message: 'No session.' }));
    expect(await readSession()).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));
    expect(await readSession()).toBeNull();
    fetchMock.mockResolvedValueOnce(json(200, { user: profile, features: { ai: true } }));
    expect(await readSession()).toMatchObject({ user: { id: profile.id } });
    fetchMock.mockResolvedValueOnce(json(503, { code: 'internal_error' }));
    await expect(readSession()).rejects.toThrow();
  });

  it('a pair accepted for a user paused before the account read is the paused line', async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: profile.id } }, error: null });
    fetchMock.mockResolvedValueOnce(json(401, { code: 'user_inactive', message: 'This user is not active.' }));
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'inactive' });
  });
});

describe('26.11 the re-auth cause and the sign-out with no session on the server', () => {
  beforeEach(() => {
    signOutCall.mockReset();
  });

  it('a listener hears the cause the publisher names, expired by default', () => {
    const heard: unknown[] = [];
    const stop = onReAuthRequired((cause) => heard.push(cause));
    publishReAuth('paused');
    publishReAuth();
    stop();
    publishReAuth('paused');
    expect(heard).toEqual(['paused', 'expired']);
  });

  it('a confirmed sign-out resolves', async () => {
    signOutCall.mockResolvedValue({ data: { success: true }, error: null });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('a server that holds no session (401, or 400 with the cookie gone) signs out', async () => {
    signOutCall.mockResolvedValue({ data: null, error: { status: 401, message: 'Unauthorized' } });
    await expect(signOut()).resolves.toBeUndefined();
    signOutCall.mockResolvedValue({ data: null, error: { status: 400, code: 'FAILED_TO_GET_SESSION', message: 'Failed to get session' } });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('any other failure still throws, so the session is kept', async () => {
    signOutCall.mockResolvedValue({ data: null, error: { status: 500, message: 'db down' } });
    await expect(signOut()).rejects.toMatchObject({ name: 'ApiError', status: 500 });
    signOutCall.mockResolvedValue({ data: null, error: { status: 403, message: 'origin' } });
    await expect(signOut()).rejects.toMatchObject({ status: 403 });
  });
});

describe('26.6 the two password routes', () => {
  const fetchMock = vi.fn();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requestPasswordReset posts the address as JSON and reads any 200 as sent', async () => {
    fetchMock.mockResolvedValue(json(200, { status: true, message: 'If this email exists...' }));
    expect(await requestPasswordReset('a@teste.local')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/request-password-reset',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@teste.local' }), headers: expect.objectContaining({ 'content-type': 'application/json' }) }),
    );
  });

  it('requestPasswordReset tells the limit, the server and no network apart', async () => {
    fetchMock.mockResolvedValue(json(429, { code: 'rate_limited', message: 'Too many' }));
    expect(await requestPasswordReset('a@teste.local')).toEqual({ ok: false, reason: 'rate-limited' });
    fetchMock.mockResolvedValue(json(503, { code: 'internal_error', message: 'down' }));
    expect(await requestPasswordReset('a@teste.local')).toEqual({ ok: false, reason: 'server' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await requestPasswordReset('a@teste.local')).toEqual({ ok: false, reason: 'server' });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await requestPasswordReset('a@teste.local')).toEqual({ ok: false, reason: 'offline' });
  });

  it('resetPassword posts the token and the password, and maps each answer', async () => {
    fetchMock.mockResolvedValue(json(200, { status: true }));
    expect(await resetPassword('tok', 'segredo-novo')).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/reset-password', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'tok', newPassword: 'segredo-novo' }) }));
    fetchMock.mockResolvedValue(json(400, { code: 'INVALID_TOKEN', message: 'invalid token' }));
    expect(await resetPassword('tok', 'segredo-novo')).toEqual({ ok: false, reason: 'invalid-link' });
    fetchMock.mockResolvedValue(json(400, { code: 'PASSWORD_TOO_SHORT', message: 'short' }));
    expect(await resetPassword('tok', 'curta')).toEqual({ ok: false, reason: 'too-short' });
    fetchMock.mockResolvedValue(json(400, { code: 'PASSWORD_TOO_LONG', message: 'long' }));
    expect(await resetPassword('tok', 'x'.repeat(129))).toEqual({ ok: false, reason: 'too-long' });
    fetchMock.mockResolvedValue(json(429, { code: 'rate_limited', message: 'Too many' }));
    expect(await resetPassword('tok', 'segredo-novo')).toEqual({ ok: false, reason: 'rate-limited' });
    fetchMock.mockResolvedValue(new Response('down', { status: 502 }));
    expect(await resetPassword('tok', 'segredo-novo')).toEqual({ ok: false, reason: 'server' });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await resetPassword('tok', 'segredo-novo')).toEqual({ ok: false, reason: 'server' });
  });
});
