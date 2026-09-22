import { draftKey, type DraftTarget } from '@app/domain';
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
import { now } from '../clock.ts';
import { copy } from '../copy/pt-br.ts';
import { dropDraft, listDrafts, readDraft, saveDraft } from '../db/drafts.ts';
import { useSession } from './session.tsx';
import { useToast } from './toast.tsx';

/*
 * AD-2/FR-61: "uncommitted field text and unsaved dialog state are persisted to a
 * per-user `drafts` table (keyed by surface and entity) on `visibilitychange`/`pagehide`
 * and offered on reopen as 'Rascunho encontrado — Recuperar', never applied silently".
 *
 * One listener pair for the whole app, over a registry of sources. A source says what it
 * currently holds (`read`, null when nothing is uncommitted) and what to do with a
 * recovered value (`apply`). This provider never writes an entity row and never commits
 * an op: applying a draft hands the value back to the surface, which commits it through
 * the ordinary field-commit path, so the op log stays the only write path (AD-1).
 */

export interface DraftSource extends DraftTarget {
  /** The uncommitted value, or null when the surface holds nothing the outbox does not. */
  read: () => unknown;
  /** Hands a recovered value back to the surface. */
  apply: (value: unknown) => void;
}

export interface DraftsState {
  /** True while at least one `drafts` row from an earlier launch is still on offer. */
  draftFound: boolean;
  /** Registers one source; the returned function unregisters it. */
  register: (source: DraftSource) => () => void;
  /** Writes every source whose value is uncommitted. The hide listeners and the tests call it. */
  persistAll: () => Promise<void>;
}

/** Exported so a surface test can supply the state without the provider's Dexie work. */
export const DraftsContext = createContext<DraftsState | null>(null);

/**
 * The keys still on offer, never their values: the row is read from the store at the
 * moment "Recuperar" is pressed, so a later tab-hide that rewrote it cannot make the
 * offer hand back text older than what is on the device.
 */
type Offer = readonly string[];

export function DraftProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const db = session.database;
  const { toast, showToast } = useToast();
  const sources = useRef<Map<string, DraftSource>>(new Map());
  const [offer, setOffer] = useState<Offer | null>(null);
  // `recover` is called from a toast button, outside a render: it reads the current
  // offer through a ref so its identity stays stable and no side effect runs inside a
  // state updater (which React invokes twice under StrictMode).
  const offerRef = useRef<Offer | null>(null);
  offerRef.current = offer;

  const register = useCallback((source: DraftSource) => {
    const key = draftKey(source);
    sources.current.set(key, source);
    return () => {
      // Only drop this registration: a remount may already have replaced it.
      if (sources.current.get(key) === source) sources.current.delete(key);
    };
  }, []);

  const persistAll = useCallback(async () => {
    if (db === null) return;
    const at = now();
    const offered = new Set(offerRef.current ?? []);
    for (const [key, source] of [...sources.current.entries()]) {
      try {
        const value = source.read();
        // A source holding nothing uncommitted reads null, and `saveDraft` then drops
        // whatever row was there: a draft equal to the committed value is not a draft.
        //
        // Except while that row is the one on offer. Backgrounding the app — switching
        // to the camera, which is what `visibilitychange` is here for — must not delete
        // the draft the toast is still offering: the surface is showing the committed
        // value precisely because the user has not pressed "Recuperar" yet.
        if (offered.has(key) && (value === null || value === undefined || value === '')) continue;
        await saveDraft(db, source, value, at);
      } catch (error) {
        // The page is going away and there is nobody left to tell; logged once so a
        // refused write is still visible in a field trial's console.
        console.warn('could not persist a draft', error);
      }
    }
  }, [db]);

  // One `visibilitychange` and one `pagehide` listener for the whole app. `pagehide` is
  // the event iOS Safari fires when it discards the tab; `visibilitychange` covers
  // switching away to the camera or another app, which is what a field engineer does.
  useEffect(() => {
    if (db === null) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void persistAll();
    };
    const onPageHide = () => void persistAll();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [db, persistAll]);

  // On mount, a row left by an earlier launch becomes an offer. Nothing is applied.
  useEffect(() => {
    if (db === null) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void listDrafts(db).then(
      (rows) => {
        if (cancelled || rows.length === 0) return;
        setOffer(rows.map((row) => row.key));
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [db]);

  const recover = useCallback(() => {
    if (db === null) return;
    const current = offerRef.current;
    if (current === null) return;
    // Prefer a key whose surface is mounted; with none mounted the row is kept and the
    // offer stands (the toast slot frees and the effect below raises it again).
    const key = current.find((candidate) => sources.current.has(candidate));
    if (key === undefined) return;
    const source = sources.current.get(key)!;
    // The key leaves the offer now, not when the read comes back: the toast is dismissed
    // by its own action, and an offer that still held this key would be raised again in
    // the meantime.
    const rest = current.filter((candidate) => candidate !== key);
    setOffer(rest.length === 0 ? null : rest);
    void readDraft(db, source).then(async (row) => {
      // Read now, not at boot: a tab-hide in between may have rewritten the row, and the
      // newest uncommitted text is the one the user means.
      if (row === undefined) return;
      source.apply(row.value);
      await dropDraft(db, source);
    }, () => {});
  }, [db]);

  // The offer is the persistent toast of `key-sheet-states.html`: it carries an action,
  // so `showToast` sets no timer. It is raised again whenever the single toast slot
  // frees while the offer still stands, so a "Sem conexão" line or a refused-write
  // error cannot take "Recuperar" away for the rest of the page session.
  useEffect(() => {
    if (offer === null || toast !== null) return;
    showToast(copy.draft.foundText, {
      action: { label: copy.draft.recoverAction, onPress: recover },
    });
  }, [offer, toast, showToast, recover]);

  const value = useMemo<DraftsState>(
    () => ({ draftFound: offer !== null, register, persistAll }),
    [offer, register, persistAll],
  );

  return <DraftsContext value={value}>{children}</DraftsContext>;
}

export function useDrafts(): DraftsState {
  const value = useContext(DraftsContext);
  if (value === null) throw new Error('useDrafts must be used inside DraftProvider');
  return value;
}

export interface DraftSourceOptions extends Omit<DraftSource, 'entity_id'> {
  entityId: string;
}

/**
 * Registers one draft source for the life of the calling component. Epic 5's sheets,
 * dialogs and field surfaces each call this with their own surface name; nothing in the
 * store or in this provider changes when they do.
 */
export function useDraftSource(options: DraftSourceOptions): void {
  const { register } = useDrafts();
  const { surface, entityId, field, read, apply } = options;
  // `read` and `apply` are called at hide time and at recovery time, so the registration
  // holds a stable indirection instead of re-registering on every render.
  const latest = useRef({ read, apply });
  latest.current = { read, apply };
  useEffect(
    () =>
      register({
        surface,
        entity_id: entityId,
        ...(field === undefined ? {} : { field }),
        read: () => latest.current.read(),
        apply: (value) => latest.current.apply(value),
      }),
    [register, surface, entityId, field],
  );
}
