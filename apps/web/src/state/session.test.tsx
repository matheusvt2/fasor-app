import 'fake-indexeddb/auto';
import type { AccountResponse, UserProfile } from '@app/domain';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseExists, databaseName, openDatabase } from '../db/schema.ts';
import {
  addPendingWipe,
  clearLastSession,
  readAiFeatures,
  readLastSession,
  readPendingWipes,
  readReAuthRequired,
  writeAiFeatures,
  writeLastSession,
  writeReAuthRequired,
} from './last-session.ts';
import { BOOT_SESSION_WAIT_MS, SessionProvider, useSession, withUnsentRegistration, type SessionState } from './session.tsx';
import { aiFeaturesOn, setAiFeaturesValue } from './ai-features.tsx';

/*
 * The session's contracts with the device (retro A2, A8, Story 20.11): a 401 at boot keeps the
 * last-session pointer and the database but lands on Login, so the next offline cold open
 * reaches the local data behind the re-auth banner and the same user's sign-in reaches the
 * outbox again; an offline boot opens only a database that exists; a confirmed sign-out
 * deletes the database; and the registration is saved as the user's own ops on the device,
 * with no network call.
 */

// E13-A2: the waits here end on the provider's boot, which opens the user's Dexie database
// on fake-indexeddb; on a loaded gate host that took longer than Testing Library's 1 s
// ("booting" at 1 s). A legitimately slow path, so this file, not the shared setup, gets 5 s.
configure({ asyncUtilTimeout: 5_000 });

const readSession = vi.fn<() => Promise<AccountResponse | null>>();
const signIn = vi.fn();
const signOut = vi.fn<() => Promise<void>>();
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
  signOut: () => {
    order.push('server sign-out');
    return signOut();
  },
}));

/** Story 20.11 (review): what sign-out did, in order (the usage-event flush and the server's sign-out). */
const order: string[] = [];
const flushTelemetry = vi.fn(async (db: { name: string; isOpen: () => boolean }) => {
  order.push(`flush ${db.name} ${db.isOpen() ? 'open' : 'closed'}`);
});
vi.mock('../telemetry/flush.ts', () => ({ flushTelemetry: (db: { name: string; isOpen: () => boolean }) => flushTelemetry(db) }));

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

/** Story 20.11: an offline boot opens only a database that exists, so these tests make it first. */
async function seedDatabase(userId: string = profile.id): Promise<void> {
  const db = openDatabase(userId);
  await db.open();
  db.close();
}

const exists = (userId: string = profile.id) => databaseExists(databaseName(userId));

beforeEach(() => {
  window.localStorage.clear();
  readSession.mockReset();
  signIn.mockReset();
  signOut.mockReset();
  signOut.mockResolvedValue(undefined);
  flushTelemetry.mockClear();
  order.length = 0;
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

describe('boot with a session the server dropped (retro A8, Story 20.11)', () => {
  it('online: lands signed out without opening the database; the pointer, the 401 and the database stay', async () => {
    await seedDatabase();
    const seeded = openDatabase(profile.id);
    await seeded.outbox.put({ op_id: 'op-1', status: 'pending', path: 'x/y' } as never);
    seeded.close();
    writeLastSession(profile);
    readSession.mockResolvedValue(null);
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(current?.database).toBeNull();
    expect(current?.settled).toBe(true);
    expect(readLastSession()).toEqual(profile);
    expect(readReAuthRequired()).toBe(true);
    expect(await exists()).toBe(true);
    const kept = openDatabase(profile.id);
    expect(await kept.outbox.count()).toBe(1);
    kept.close();

    // The same user signs in: the database with its outbox is the one attached.
    signIn.mockResolvedValue({ ok: true, user: profile, features: { ai: true } });
    await act(async () => {
      await current!.signIn(profile.email, 'senha');
    });
    expect(current?.status).toBe('signed-in');
    expect(await current!.database!.outbox.count()).toBe(1);
    expect(readReAuthRequired()).toBe(false);
  });

  it('a second cold open, offline this time, reaches the local data with the banner still up', async () => {
    await seedDatabase();
    writeLastSession(profile);
    readSession.mockResolvedValue(null);
    const first = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
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

  it('offline with a pointer whose database is gone (S2): Login, and no database is created', async () => {
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(current?.database).toBeNull();
    expect(await exists()).toBe(false);
    // The pointer stays, so AD-8's recovery still runs once a valid cookie answers online.
    expect(readLastSession()).toEqual(profile);
  });

  it(
    'a server slower than the wait: Home from the pointer, then a late 401 closes the database and lands on Login',
    async () => {
      await seedDatabase();
      writeLastSession(profile);
      let answer: (account: AccountResponse | null) => void = () => {};
      readSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      renderSession();
      expect(screen.getByTestId('probe')).toHaveTextContent('booting');
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`), {
        timeout: BOOT_SESSION_WAIT_MS + 3_000,
      });
      expect(current?.database?.name).toBe(databaseName(profile.id));
      expect(current?.settled).toBe(false);
      await act(async () => {
        answer(null);
      });
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
      expect(current?.database).toBeNull();
      expect(readLastSession()).toEqual(profile);
      expect(readReAuthRequired()).toBe(true);
      expect(await exists()).toBe(true);
    },
    BOOT_SESSION_WAIT_MS + 8_000,
  );
});

describe('sign-out deletes the device data (Story 20.11)', () => {
  it('server first, then the database, then the pointer', async () => {
    await seedDatabase();
    writeLastSession(profile);
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
    await current!.database!.outbox.put({ op_id: 'op-1', status: 'pending', path: 'x/y' } as never);
    await act(async () => {
      await current!.signOut();
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none');
    expect(current?.database).toBeNull();
    expect(await exists()).toBe(false);
    expect(readLastSession()).toBeNull();
    expect(readPendingWipes()).toEqual([]);
  });

  it('a server that does not confirm clears nothing', async () => {
    await seedDatabase();
    writeLastSession(profile);
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
    signOut.mockRejectedValue(new Error('network'));
    await act(async () => {
      await expect(current!.signOut()).rejects.toThrow('network');
    });
    expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`);
    expect(current?.database?.name).toBe(databaseName(profile.id));
    expect(readLastSession()).toEqual(profile);
    expect(await exists()).toBe(true);
  });

  it(
    'a delete another connection blocks: the sign-out completes and the wipe runs at the next boot before any open',
    async () => {
      await seedDatabase();
      writeLastSession(profile);
      readSession.mockResolvedValue({ user: profile, features: { ai: true } });
      const view = renderSession();
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
      // Another tab's raw connection that never answers `versionchange` holds the delete.
      const holder = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName(profile.id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await act(async () => {
        await current!.signOut();
      });
      expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none');
      expect(readLastSession()).toBeNull();
      expect(readPendingWipes()).toEqual([databaseName(profile.id)]);
      holder.close();
      view.unmount();

      // The next boot deletes it first; a pointer put back by hand opens nothing.
      writeLastSession(profile);
      readSession.mockRejectedValue(new TypeError('Failed to fetch'));
      renderSession();
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
      expect(readPendingWipes()).toEqual([]);
      expect(await exists()).toBe(false);
    },
    20_000,
  );

  it('offers the queued usage events with the open database before the server ends the session', async () => {
    await seedDatabase();
    writeLastSession(profile);
    readSession.mockResolvedValue({ user: profile, features: { ai: true } });
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
    await act(async () => {
      await current!.signOut();
    });
    expect(order).toEqual([`flush ${databaseName(profile.id)} open`, 'server sign-out']);
  });

  it(
    'a form sign-in of the same user clears the wipe a blocked sign-out left, so the reboot keeps the database and its outbox',
    async () => {
      await seedDatabase();
      writeLastSession(profile);
      readSession.mockResolvedValue({ user: profile, features: { ai: true } });
      const view = renderSession();
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
      // Another tab's raw connection holds the delete past the wait: the wipe stays pending.
      const holder = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName(profile.id));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await act(async () => {
        await current!.signOut();
      });
      expect(readPendingWipes()).toEqual([databaseName(profile.id)]);
      holder.close();

      // The same user signs in again through the form and writes to the outbox.
      signIn.mockResolvedValue({ ok: true, user: profile, features: { ai: true } });
      await act(async () => {
        await current!.signIn(profile.email, 'senha');
      });
      expect(readPendingWipes()).toEqual([]);
      await current!.database!.outbox.put({ op_id: 'op-after', status: 'pending', path: 'x/y' } as never);
      current?.database?.close();
      view.unmount();

      // The reboot finds no wipe to run: the database and its outbox survive.
      readSession.mockRejectedValue(new TypeError('Failed to fetch'));
      renderSession();
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent(`signed-in|ok|${profile.id}`));
      expect(await exists()).toBe(true);
      expect(await current!.database!.outbox.get('op-after')).toMatchObject({ status: 'pending' });
    },
    20_000,
  );

  it('the boot deletes a recorded wipe before it opens anything', async () => {
    await seedDatabase();
    addPendingWipe(databaseName(profile.id));
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(await exists()).toBe(false);
    expect(readPendingWipes()).toEqual([]);
  });

  it('E20-A1 (R-4b): a recorded wipe also clears the user\'s browser-storage keys a sign-out stopped part way left; with no wipe they stay', async () => {
    window.localStorage.setItem('relatorio-altitude-asked:019966c1-0000-7000-8000-0000000000a1', '{"altitude":812}');
    window.sessionStorage.setItem('ficha:legend-first', '019966c1-0000-7000-8000-0000000000b1');
    addPendingWipe(databaseName(profile.id));
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    const view = renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(window.localStorage.getItem('relatorio-altitude-asked:019966c1-0000-7000-8000-0000000000a1')).toBeNull();
    expect(window.sessionStorage.getItem('ficha:legend-first')).toBeNull();
    view.unmount();

    // A boot with no wipe recorded leaves them (the user is still signed in on this device).
    window.localStorage.setItem('relatorio-altitude-asked:019966c1-0000-7000-8000-0000000000a2', '{"altitude":null}');
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(window.localStorage.getItem('relatorio-altitude-asked:019966c1-0000-7000-8000-0000000000a2')).toBe('{"altitude":null}');
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
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
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
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('signed-out|ok|none'));
    expect(current).not.toHaveProperty('dismissReAuth');
    expect(readReAuthRequired()).toBe(true);
  });
});

describe('boot with a registration saved offline and not pushed yet (retro A5 item 8a)', () => {
  it('keeps the device values over the older server profile until the push lands', async () => {
    await seedDatabase();
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
    await seedDatabase();
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
    await seedDatabase();
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
    await seedDatabase();
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
    await seedDatabase();
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    writeLastSession(profile);
    renderSession();
    await waitFor(() => expect(current?.status).toBe('signed-in'));
    expect(current?.aiFeatures).toBe(true);
  });
});

describe('fix batch fxpw G1: the boot read settles before the engine may run', () => {
  const other: UserProfile = { ...profile, id: '0b000000-0000-7000-8000-0000000000b1', email: 'b@teste.local', companyId: '0b000000-0000-7000-8000-00000000000b' };

  afterEach(async () => {
    await openDatabase(other.id).delete();
  });

  it("a pointer left by another user: unsettled on that user's database, settled on the confirmed one", async () => {
    await seedDatabase();
    writeLastSession(profile);
    let answer: (account: AccountResponse | null) => void = () => {};
    readSession.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderSession();
    // Story 20.11: online, the pointer's database opens once the server is slower than the wait.
    await waitFor(() => expect(current?.database?.name).toBe(databaseName(profile.id)), { timeout: BOOT_SESSION_WAIT_MS + 3_000 });
    expect(current?.status).toBe('signed-in');
    expect(current?.settled).toBe(false);
    await act(async () => {
      answer({ user: other, features: { ai: true } });
    });
    await waitFor(() => expect(current?.settled).toBe(true));
    expect(current?.database?.name).toBe(databaseName(other.id));
    expect(current?.user?.id).toBe(other.id);
    // The confirmed user's store did not exist: the evicted-origin screen (AD-8).
    expect(current?.recoveryNeeded).toBe(true);
  });

  it("an offline boot settles on the cached user's database", async () => {
    await seedDatabase();
    writeLastSession(profile);
    readSession.mockRejectedValue(new TypeError('Failed to fetch'));
    renderSession();
    await waitFor(() => expect(current?.settled).toBe(true));
    expect(current?.database?.name).toBe(databaseName(profile.id));
    expect(current?.status).toBe('signed-in');
  });

  it('a boot with no pointer and no session settles signed out; a form sign-in leaves it settled', async () => {
    readSession.mockResolvedValue(null);
    renderSession();
    await waitFor(() => expect(current?.status).toBe('signed-out'));
    expect(current?.settled).toBe(true);
    signIn.mockResolvedValue({ ok: true, user: profile, features: { ai: true } });
    await act(async () => {
      await current!.signIn('a@teste.local', 'x');
    });
    expect(current?.status).toBe('signed-in');
    expect(current?.settled).toBe(true);
    expect(current?.database?.name).toBe(databaseName(profile.id));
  });
});
