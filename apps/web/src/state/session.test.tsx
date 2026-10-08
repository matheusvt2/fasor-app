import 'fake-indexeddb/auto';
import type { AccountResponse, UserProfile } from '@app/domain';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseName, openDatabase } from '../db/schema.ts';
import { clearLastSession, readAiFeatures, readLastSession, readReAuthRequired, writeAiFeatures, writeLastSession, writeReAuthRequired } from './last-session.ts';
import { SessionProvider, useSession, withUnsentRegistration, type SessionState } from './session.tsx';
import { aiFeaturesOn, setAiFeaturesValue } from './ai-features.tsx';

/*
 * The session's two contracts with the device (retro A2, A8): a 401 at boot keeps the
 * last-session pointer, so the next cold open (offline too) reaches the local data behind
 * the re-auth banner; and the registration is saved as the user's own ops on the device,
 * with no network call.
 */

const readSession = vi.fn<() => Promise<AccountResponse | null>>();
const signIn = vi.fn();
/** The listener the provider registers for a 401 mid-use (the sync engine publishes it). */
let reAuthListener: (() => void) | null = null;

vi.mock('../api/auth-client.ts', () => ({
  readSession: () => readSession(),
  onReAuthRequired: (listener: () => void) => {
    reAuthListener = listener;
    return () => {
      reAuthListener = null;
    };
  },
  signIn: (email: string, password: string) => signIn(email, password),
  signOut: vi.fn(),
}));

const profile: UserProfile = {
  id: '0a000000-0000-7000-8000-0000000000a1',
  name: 'Ana Alves',
  email: 'a@teste.local',
  companyId: '0a000000-0000-7000-8000-00000000000a',
  companyName: 'Empresa A de Teste',
  council: 'crea',
  registrationNumber: 'SP 1000000001',
  title: 'Eng. Eletricista',
};

let current: SessionState | null = null;

function Probe() {
  const session = useSession();
  current = session;
  return (
    <p data-testid="probe">
      {session.status}|{session.reAuthRequired ? 're-auth' : 'ok'}|{session.user?.id ?? 'none'}
    </p>
  );
}

const renderSession = () =>
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  readSession.mockReset();
  signIn.mockReset();
  reAuthListener = null;
  current = null;
});

afterEach(async () => {
  // E13-A2: unmount first. This hook runs before the setup file's `cleanup()` (after-hooks
  // run in reverse order), so the provider of the test that just ended was still mounted
  // while its database was deleted: a boot still in flight under load reopened it ("Another
  // connection wants to delete database") and wrote into the next test's device state.
  cleanup();
  current?.database?.close();
  await openDatabase(profile.id).delete();
});

describe('boot with a session the server dropped (retro A8)', () => {
  it('keeps the pointer, stays on the local data and raises the re-auth banner', async () => {
    writeLastSession(profile);
    readSession.mockResolvedValue(null);
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|re-auth|${profile.id}`));
    expect(readLastSession()).toEqual(profile);
    expect(current?.database?.name).toBe(databaseName(profile.id));
  });

  it('a second cold open, offline this time, reaches the local data with the banner still up', async () => {
    writeLastSession(profile);
    readSession.mockResolvedValue(null);
    const first = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|re-auth'));
    current?.database?.close();
    first.unmount();

    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|re-auth|${profile.id}`));
    expect(readLastSession()).toEqual(profile);
    expect(readReAuthRequired()).toBe(true);
  });

  it('a later boot the server confirms clears the remembered 401', async () => {
    writeLastSession(profile);
    writeReAuthRequired(true);
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
    expect(readReAuthRequired()).toBe(false);
  });

  it('without a pointer, a 401 is Login', async () => {
    readSession.mockResolvedValue(null);
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(readLastSession()).toBeNull();
  });
});

describe('the remembered 401 (retro A8)', () => {
  /** Unmounts, then cold-opens again with no network. */
  async function offlineReopen(view: { unmount: () => void }) {
    current?.database?.close();
    view.unmount();
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    return renderSession();
  }

  it('a 401 mid-use is remembered, so an offline reopen shows the banner', async () => {
    writeLastSession(profile);
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    const view = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|ok'));
    act(() => reAuthListener?.());
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|re-auth'));
    expect(readReAuthRequired()).toBe(true);
    await offlineReopen(view);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|re-auth|${profile.id}`));
  });

  it('a sign-in clears it, so an offline reopen is fine', async () => {
    writeLastSession(profile);
    writeReAuthRequired(true);
    readSession.mockResolvedValue(null);
    const view = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|re-auth'));
    signIn.mockResolvedValue({ ok: true, user: profile, features: { ai: true } });
    await act(() => current!.signIn(profile.email, 'senha').then(() => undefined));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|ok'));
    expect(readReAuthRequired()).toBe(false);
    await offlineReopen(view);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
  });

  it('offers no dismissal: only a sign-in clears it, so the engine never resumes early', async () => {
    writeLastSession(profile);
    readSession.mockResolvedValue(null);
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in|re-auth'));
    expect(current).not.toHaveProperty('dismissReAuth');
    expect(readReAuthRequired()).toBe(true);
  });
});

describe('boot with a registration saved offline and not pushed yet (retro A5 item 8a)', () => {
  it('keeps the device values over the older server profile until the push lands', async () => {
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const first = renderSession();
    await waitFor(() => expect(current?.database).not.toBeNull());
    const saved = { council: 'crt' as const, registrationNumber: 'SP 7777', title: 'Técnico(a) em Eletrotécnica' };
    await act(() => current!.saveRegistration(saved));
    current?.database?.close();
    first.unmount();

    // Reload online: the server answers with the profile it had before the save, and the
    // company pull has not brought the user row yet.
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    const second = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
    await waitFor(() => expect(current!.user).toMatchObject(saved));
    expect(readLastSession()).toMatchObject(saved);

    // Once the ops are acknowledged, the server's profile is the truth again.
    const db = current!.database!;
    await db.outbox.toCollection().modify({ status: 'acked' });
    db.close();
    second.unmount();
    renderSession();
    await waitFor(() => expect(current!.user).toMatchObject({ council: 'crea', registrationNumber: 'SP 1000000001' }));
  });

  it('a re-auth sign-in through the form keeps them too', async () => {
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(current?.database).not.toBeNull());
    const saved = { council: 'crt' as const, registrationNumber: 'SP 7777', title: 'Técnico(a) em Eletrotécnica' };
    await act(() => current!.saveRegistration(saved));

    // The server answers the sign-in with the profile it had before the save.
    signIn.mockResolvedValue({ ok: true, user: profile, features: { ai: true } });
    await act(async () => {
      await current!.signIn(profile.email, 'senha');
    });
    expect(current!.user).toMatchObject(saved);
    expect(readLastSession()).toMatchObject(saved);
  });

  it('withUnsentRegistration ignores values that do not parse', () => {
    expect(withUnsentRegistration(profile, { council: 'oab', registration_number: 7, title: 'X' })).toEqual({
      ...profile,
      title: 'X',
    });
  });
});

describe('saveRegistration (retro A2)', () => {
  it("commits the three user ops to the outbox with this device's id and no network call", async () => {
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      renderSession();
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-in'));
      await waitFor(() => expect(current?.database).not.toBeNull());
      await act(() =>
        current!.saveRegistration({ council: 'crt', registrationNumber: 'SP 7777', title: 'Técnico(a) em Eletrotécnica' }),
      );
      const db = current!.database!;
      const outbox = await db.outbox.toArray();
      expect(outbox.map((row) => [row.path, row.value]).sort()).toEqual(
        [
          [`user/${profile.id}/council`, 'crt'],
          [`user/${profile.id}/registration_number`, 'SP 7777'],
          [`user/${profile.id}/title`, 'Técnico(a) em Eletrotécnica'],
        ].sort(),
      );
      const device = (await db.local_prefs.get('device_id'))?.value;
      for (const row of outbox) {
        expect(row).toMatchObject({ status: 'pending', actor_id: profile.id, company_id: profile.companyId, device_id: device });
      }
      expect(fetchSpy).not.toHaveBeenCalled();
      // Optimistic: the session profile and the pointer carry the saved values at once.
      const saved = { council: 'crt' as const, registrationNumber: 'SP 7777', title: 'Técnico(a) em Eletrotécnica' };
      expect(current!.user).toMatchObject(saved);
      expect(readLastSession()).toMatchObject(saved);

      // The same values again commit nothing; one changed field commits one op, chained
      // to this device's earlier op on that path (AD-3 prev_op_id).
      await act(() => current!.saveRegistration(saved));
      expect(await db.outbox.count()).toBe(3);
      await act(() => current!.saveRegistration({ ...saved, registrationNumber: 'SP 8888' }));
      const after = await db.outbox.toArray();
      expect(after).toHaveLength(4);
      const earlier = outbox.find((row) => row.path === `user/${profile.id}/registration_number`)!;
      const latest = after.find((row) => row.value === 'SP 8888')!;
      expect(latest.prev_op_id).toBe(earlier.op_id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the server AI features flag (Story 11.8 follow-up)', () => {
  it('defaults on, takes the fresh read and caches it', async () => {
    readSession.mockResolvedValue({ user: profile, features: { ai: false } });
    renderSession();
    await waitFor(() => expect(current?.status).toBe('signed-in'));
    expect(current?.aiFeatures).toBe(false);
    expect(readAiFeatures()).toBe(false);
    // The value photo creates read is the session's own, even with the cache gone.
    window.localStorage.clear();
    expect(aiFeaturesOn()).toBe(false);
    setAiFeaturesValue(null);
  });

  it('an offline boot uses the cached flag; sign-out clears it', async () => {
    writeLastSession(profile);
    writeAiFeatures(false);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(current?.status).toBe('signed-in'));
    expect(current?.aiFeatures).toBe(false);
    clearLastSession();
    expect(readAiFeatures()).toBeNull();
  });

  it('with no read and no cache the flag is on', async () => {
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    writeLastSession(profile);
    renderSession();
    await waitFor(() => expect(current?.status).toBe('signed-in'));
    expect(current?.aiFeatures).toBe(true);
  });
});
