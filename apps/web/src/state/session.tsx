import type { Registration, UserProfile } from '@app/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as authClient from '../api/auth-client.ts';
import {
  closeDeviceDatabase,
  deviceDatabaseName,
  openDeviceDatabase,
  type DeviceDatabase,
} from '../db/database.ts';
import { clearLastSession, readLastSession, writeLastSession } from './last-session.ts';

/**
 * Session context (AD-8, AD-9). Boots from the cookie, holds the signed-in user, the
 * online flag and the re-auth flag, and owns the handle to this user's Dexie database.
 *
 * A 401 mid-use raises `reAuthRequired` and nothing else: the database and every store
 * stay exactly as they are.
 */

export type SessionStatus = 'booting' | 'signed-out' | 'signed-in';

export interface SessionState {
  status: SessionStatus;
  user: UserProfile | null;
  online: boolean;
  reAuthRequired: boolean;
  database: DeviceDatabase | null;
  signIn: (email: string, password: string) => Promise<authClient.SignInResult>;
  signOut: () => Promise<void>;
  saveRegistration: (registration: Registration) => Promise<void>;
  dismissReAuth: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [online, setOnline] = useState<boolean>(readOnline);
  const [reAuthRequired, setReAuthRequired] = useState(false);
  const [database, setDatabase] = useState<DeviceDatabase | null>(null);
  const databaseRef = useRef<DeviceDatabase | null>(null);

  /**
   * Opening IndexedDB can be refused outright (private mode, blocked site data). That
   * must never hold up the session: the handle stays null, the failure is logged, and
   * the app signs in anyway. Story 1.8 owns what a missing store means for capture.
   */
  const attachDatabase = useCallback(async (userId: string) => {
    if (databaseRef.current?.name === deviceDatabaseName(userId)) return;
    if (databaseRef.current !== null) closeDeviceDatabase(databaseRef.current);
    databaseRef.current = null;
    setDatabase(null);
    try {
      const opened = await openDeviceDatabase(userId);
      databaseRef.current = opened;
      setDatabase(opened);
    } catch (error) {
      console.warn('could not open the device database', error);
    }
  }, []);

  // Cold open. The cached pointer decides first, so a tab reopened days later with the
  // network down reaches Home from the cookie and the local database with no sign-in
  // prompt and no network wait; the server read only confirms or expires it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = readLastSession();
      if (cached !== null) {
        setUser(cached);
        await attachDatabase(cached.id);
        if (cancelled) return;
        setStatus('signed-in');
      }

      let fresh: UserProfile | null | 'unreachable';
      try {
        fresh = await authClient.readSession();
      } catch {
        fresh = 'unreachable';
      }
      if (cancelled) return;

      if (fresh === 'unreachable') {
        // Offline. A cached session keeps working; without one there is nothing to show
        // but Login, which will explain that signing in needs a connection.
        if (cached === null) setStatus('signed-out');
        return;
      }

      if (fresh === null) {
        // The server dropped the session. Local data is untouched either way.
        clearLastSession();
        if (cached === null) {
          setUser(null);
          setStatus('signed-out');
          return;
        }
        setReAuthRequired(true);
        return;
      }

      writeLastSession(fresh);
      setUser(fresh);
      await attachDatabase(fresh.id);
      if (cancelled) return;
      setStatus('signed-in');
    })();
    return () => {
      cancelled = true;
    };
  }, [attachDatabase]);

  useEffect(() => {
    const update = () => setOnline(readOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => authClient.onReAuthRequired(() => setReAuthRequired(true)), []);

  const doSignIn = useCallback(
    async (email: string, password: string) => {
      const result = await authClient.signIn(email, password);
      if (result.ok) {
        writeLastSession(result.user);
        setUser(result.user);
        await attachDatabase(result.user.id);
        setReAuthRequired(false);
        setStatus('signed-in');
      }
      return result;
    },
    [attachDatabase],
  );

  /**
   * Throws when the server could not be reached, and then clears nothing: the caller
   * shows the failure and the user stays signed in. Only a confirmed sign-out drops the
   * local session state, and never the database itself.
   */
  const doSignOut = useCallback(async () => {
    await authClient.signOut();
    clearLastSession();
    // The handle is closed, the database is kept: `Dexie.delete` is never called.
    if (databaseRef.current !== null) closeDeviceDatabase(databaseRef.current);
    databaseRef.current = null;
    setDatabase(null);
    setUser(null);
    setReAuthRequired(false);
    setStatus('signed-out');
  }, []);

  const doSaveRegistration = useCallback(async (registration: Registration) => {
    const updated = await authClient.saveRegistration(registration);
    writeLastSession(updated);
    setUser(updated);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      status,
      user,
      online,
      reAuthRequired,
      database,
      signIn: doSignIn,
      signOut: doSignOut,
      saveRegistration: doSaveRegistration,
      dismissReAuth: () => setReAuthRequired(false),
    }),
    [status, user, online, reAuthRequired, database, doSignIn, doSignOut, doSaveRegistration],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
