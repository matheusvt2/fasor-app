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
import { dropDraft, listDrafts, readDraft, saveDrafts, type DraftWrite } from '../db/drafts.ts';
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
  /** True while at least one `drafts` row from an earlier launch is still on offer and not dismissed. */
  draftFound: boolean;
  /** Registers one source; the returned function unregisters it. */
  register: (source: DraftSource) => () => void;
  /** Writes every source whose value is uncommitted. The hide listeners and the tests call it. */
  persistAll: () => Promise<void>;
  /**
   * Writes one target's value now, by `persistAll`'s rule: null drops the row, except
   * while that row is the one on offer. `useDraftSource` hands it to its surface (E6-R1).
   * Story 25.2: with `offerOnReturn`, a value written as its surface leaves the screen (a
   * reading that does not parse) is offered again when a source of the same key registers.
   * Fix batch e25x (A3, A4): with `committed`, the source has just saved its own value.
   */
  persistOne: (target: DraftTarget, value: unknown, options?: PersistOptions) => Promise<void>;
}

export interface PersistOptions {
  /** Story 25.2: offer this draft ("Rascunho encontrado — Recuperar") when its surface is opened again in this session. */
  offerOnReturn?: boolean;
  /**
   * Fix batch e25x (A4): this source has just committed a value through its own commit path, and the
   * write succeeded. With an empty value (nothing typed since) the row of this key is older text of
   * the same field, which "Recuperar" would write over the newer saved value, so it is dropped; with
   * a non-empty one (the field is dirty again) nothing happens. A row on offer is dropped this way
   * only with `answersOffer` (Design Notes D2 of the e25x spec).
   */
  committed?: boolean;
  /**
   * Fix batch e25x (A3), with `committed`: the commit answers the offer of this key too (the number
   * input's commit is one whole value given by a blur, an Enter or a leave). The key leaves the
   * offer, and the "Rascunho encontrado" toast goes once no key is left.
   */
  answersOffer?: boolean;
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
  const { toast, showToast, withdrawToast } = useToast();
  const sources = useRef<Map<string, DraftSource>>(new Map());
  const [offer, setOffer] = useState<Offer | null>(null);
  /**
   * The user put the offer away (the toast's close control or Esc). The rows stay in the
   * store, and the offer is not raised again for the rest of this page session: the next
   * launch offers it again.
   */
  const [declined, setDeclined] = useState(false);
  /** The dismissal as `register` reads it (its identity stays stable). */
  const declinedRef = useRef(declined);
  declinedRef.current = declined;
  // `recover` is called from a toast button, outside a render: it reads the current
  // offer through a ref so its identity stays stable and no side effect runs inside a
  // state updater (which React invokes twice under StrictMode).
  const offerRef = useRef<Offer | null>(null);
  offerRef.current = offer;
  /**
   * Story 25.2 (M02): the keys whose draft was written as their surface left the screen in this
   * session (`persistOne` with `offerOnReturn`); the next source of such a key to register makes
   * it an offer, so going back to the sheet offers it without a reload.
   */
  const returnOffers = useRef<Set<string>>(new Set());
  /**
   * Fix batch e25x (A3): the keys offered on return in this session (`register` moved them from
   * `returnOffers` to the offer). "Fechar" drops their rows when their field is on screen and
   * holds nothing typed; a row of an earlier launch is never dropped by it (retro U7).
   */
  const offeredOnReturn = useRef<Set<string>>(new Set());
  /**
   * Fix batch e25x (A3, A4): the keys that may hold a row, the launch list and every non-empty
   * write of this session, so a committed drop of any other key touches no store. Until the
   * launch list has been read (`launchRead`), every committed drop goes to the store.
   */
  const knownKeys = useRef<Set<string>>(new Set());
  const launchRead = useRef(false);

  const register = useCallback((source: DraftSource) => {
    const key = draftKey(source);
    sources.current.set(key, source);
    if (returnOffers.current.delete(key)) {
      offeredOnReturn.current.add(key);
      if (declinedRef.current) {
        // The person put the earlier offer away: only the draft that came back is offered, not the rows dismissed.
        setOffer([key]);
        setDeclined(false);
      } else {
        setOffer((current) => (current === null ? [key] : current.includes(key) ? current : [...current, key]));
      }
    }
    return () => {
      // Only drop this registration: a remount may already have replaced it.
      if (sources.current.get(key) === source) sources.current.delete(key);
    };
  }, []);

  const persistAll = useCallback(async () => {
    if (db === null) return;
    const at = now();
    const offered = new Set(offerRef.current ?? []);
    // Every value is read in this tick, before anything is awaited: the tab is going
    // away, and a source read after the first await may already be gone.
    const writes: DraftWrite[] = [];
    for (const [key, source] of sources.current.entries()) {
      const value = source.read();
      // A source holding nothing uncommitted reads null, and `saveDraft` then drops
      // whatever row was there: a draft equal to the committed value is not a draft.
      //
      // Except while that row is the one on offer. Backgrounding the app — switching to
      // the camera, which is what `visibilitychange` is here for — must not delete the
      // draft the toast is still offering: the surface is showing the committed value
      // precisely because the user has not pressed "Recuperar" yet.
      const empty = value === null || value === undefined || value === '';
      if (offered.has(key) && empty) continue;
      if (!empty) knownKeys.current.add(key);
      writes.push({ target: source, value });
    }
    try {
      // One transaction for all of them, so a discarded tab cannot keep the first draft
      // and lose the rest.
      await saveDrafts(db, writes, at);
    } catch (error) {
      // The page is going away and there is nobody left to tell; logged once so a
      // refused write is still visible in a field trial's console.
      console.warn('could not persist the drafts', error);
    }
  }, [db]);

  /**
   * Fix batch e25x (A3): `keys` leave the offer at once (the ref too, so a tab-hide right after
   * no longer protects them), and with `withdraw` the "Rascunho encontrado" toast goes once no key
   * is left (not when the toast is being closed by its own "Fechar").
   */
  const leaveOffer = useCallback(
    (keys: readonly string[], withdraw: boolean) => {
      const current = offerRef.current;
      if (current === null) return;
      const rest = current.filter((candidate) => !keys.includes(candidate));
      if (rest.length === current.length) return;
      offerRef.current = rest.length === 0 ? null : rest;
      setOffer(offerRef.current);
      if (withdraw && rest.length === 0) withdrawToast(copy.draft.foundText);
    },
    [withdrawToast],
  );

  const persistOne = useCallback(
    async (target: DraftTarget, value: unknown, options: PersistOptions = {}) => {
      if (db === null) return;
      const empty = value === null || value === undefined || value === '';
      const key = draftKey(target);
      if (options.committed === true) {
        // Fix batch e25x (A3, A4): the field is dirty again, so what it holds is newer than the commit.
        if (!empty) return;
        const offered = (offerRef.current ?? []).includes(key);
        // An offered row is answered only by a commit that is one whole value (the number input).
        if (offered && options.answersOffer !== true) return;
        // No row can be there: nothing to drop, no store touched.
        if (!offered && launchRead.current && !knownKeys.current.has(key)) return;
        knownKeys.current.delete(key);
        returnOffers.current.delete(key);
        offeredOnReturn.current.delete(key);
        if (offered) leaveOffer([key], true);
        try {
          await dropDraft(db, target);
        } catch (error) {
          console.warn('could not drop the draft', error);
        }
        return;
      }
      if (!empty) knownKeys.current.add(key);
      // Story 25.2: noted before the write, so a surface opened again at once still finds it.
      if (options.offerOnReturn === true) {
        if (empty) returnOffers.current.delete(key);
        else returnOffers.current.add(key);
      }
      // The row on offer is never dropped by a surface showing the committed value (see above).
      if (empty && (offerRef.current ?? []).includes(key)) return;
      try {
        await saveDrafts(db, [{ target, value }], now());
      } catch (error) {
        console.warn('could not persist the draft', error);
      }
    },
    [db, leaveOffer],
  );

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
    // Fix batch e25x: another database is another set of rows; committed drops go to the store until it is read.
    launchRead.current = false;
    knownKeys.current = new Set();
    if (db === null) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void listDrafts(db).then(
      (rows) => {
        if (cancelled) return;
        for (const row of rows) knownKeys.current.add(row.key);
        launchRead.current = true;
        if (rows.length === 0) return;
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
    offeredOnReturn.current.delete(key);
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
  // error cannot take "Recuperar" away for the rest of the page session. Only the user
  // dismissing it ends that, and dismissing never drops a row of an earlier launch (retro U7).
  //
  // Fix batch e25x (A3): "Fechar" answers a draft offered on return in this session (always a
  // reading that did not parse) when its field is on screen holding nothing typed: the person saw
  // the offer beside the field and closed it, so that row is dropped and leaves the offer.
  const dismiss = useCallback(() => {
    setDeclined(true);
    if (db === null) return;
    const answered: DraftSource[] = [];
    for (const key of offerRef.current ?? []) {
      if (!offeredOnReturn.current.has(key)) continue;
      const source = sources.current.get(key);
      if (source === undefined) continue;
      const value = source.read();
      if (value !== null && value !== undefined && value !== '') continue;
      answered.push(source);
    }
    if (answered.length === 0) return;
    const keys = answered.map((source) => draftKey(source));
    for (const key of keys) {
      offeredOnReturn.current.delete(key);
      knownKeys.current.delete(key);
    }
    leaveOffer(keys, false);
    void saveDrafts(
      db,
      answered.map((target) => ({ target, value: null })),
      now(),
    ).catch((error: unknown) => {
      console.warn('could not drop the drafts', error);
    });
  }, [db, leaveOffer]);

  useEffect(() => {
    if (offer === null || declined || toast !== null) return;
    showToast(copy.draft.foundText, {
      action: { label: copy.draft.recoverAction, onPress: recover },
      onDismiss: dismiss,
      // Raised on its own, not by a press: it waits behind a job outcome on screen (R-1).
      arrival: true,
    });
  }, [offer, declined, toast, showToast, recover, dismiss]);

  const value = useMemo<DraftsState>(
    () => ({ draftFound: offer !== null && !declined, register, persistAll, persistOne }),
    [offer, declined, register, persistAll, persistOne],
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
export function useDraftSource(options: DraftSourceOptions): (persist?: PersistOptions) => Promise<void> {
  const { register, persistOne } = useDrafts();
  const { surface, entityId, field, read, apply } = options;
  // `read` and `apply` are called at hide time and at recovery time, so the registration
  // holds a stable indirection instead of re-registering on every render.
  const latest = useRef({ read, apply });
  latest.current = { read, apply };
  const target = useRef({ surface, entityId, field });
  target.current = { surface, entityId, field };
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
  // E6-R1: writes this source's draft now, by the same rule as a tab-hide, for a surface
  // that keeps its draft while the person types (a reload fires no hide first). It reads
  // the latest values, so it still works from a timer that fires after an unmount.
  return useCallback(
    (persist?: PersistOptions) => {
      const { surface: s, entityId: id, field: f } = target.current;
      return persistOne({ surface: s, entity_id: id, ...(f === undefined ? {} : { field: f }) }, latest.current.read(), persist);
    },
    [persistOne],
  );
}
