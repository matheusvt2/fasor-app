import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInEmail = vi.fn();

vi.mock('better-auth/client', () => ({
  createAuthClient: () => ({ signIn: { email: signInEmail }, signOut: vi.fn() }),
}));

const { isClientRejection, signIn } = await import('./auth-client.ts');

const profile = {
  id: 'u-1',
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
  });

  it('reads a 401 as a credential rejection', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 401, message: 'Invalid' } });
    const result = await signIn('a@teste.local', 'wrong');
    expect(result).toMatchObject({ ok: false, reason: 'credentials' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a 500 as the server being unreachable, never as a wrong password', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { status: 500, message: 'db down' } });
    const result = await signIn('a@teste.local', 'right');
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });

  it('reads an error without a status (transport failure) as unreachable', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'network' });
  });

  it('reads a thrown request as unreachable', async () => {
    signInEmail.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await signIn('a@teste.local', 'right')).toMatchObject({ ok: false, reason: 'network' });
  });

  it('returns the profile after an accepted pair', async () => {
    signInEmail.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ user: profile }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await signIn('a@teste.local', 'right');
    expect(result).toMatchObject({ ok: true, user: { id: 'u-1', council: 'crea' } });
  });

  it('isClientRejection is true only for 4xx', () => {
    expect(isClientRejection(400)).toBe(true);
    expect(isClientRejection(401)).toBe(true);
    expect(isClientRejection(500)).toBe(false);
    expect(isClientRejection(503)).toBe(false);
    expect(isClientRejection(undefined)).toBe(false);
  });
});
