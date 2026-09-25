import 'fake-indexeddb/auto';
import {
  makeOp,
  type FilePutResponse,
  type FileVariantName,
  type GenerateResponse,
  type Op,
  type OpInput,
  type SyncPullResponse,
  type SyncPushResponse,
} from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, EQUIPMENT_1_ID, PROJECT_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it, vi } from 'vitest';
import { commitOps } from '../db/commit.ts';
import { clearUploadError } from '../db/file-store.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { Timers } from '../input/field-commit.ts';
import { SyncRequestError, type SyncClient, type SyncFailure } from './client.ts';
import { followOnlineEvents } from './online.ts';
import { createSyncEngine, type EngineStatus, type SyncEngine, type SyncEngineDeps } from './engine.ts';

/*
 * The engine over an in-memory server and a controllable clock. The server
 * applies pushed ops in order, assigns seqs, rejects what its rules say and
 * serves the two streams by query, like apps/api does. The clock is injected
 * through the engine's `timers` (vitest's global fake timers would also freeze
 * the scheduling fake-indexeddb relies on).
 */

class FakeServer implements SyncClient {
  log: Op[] = [];
  pushes: Op[][] = [];
  pushAttempts = 0;
  pulls: string[] = [];
  reject: (op: Op) => string | null = () => null;
  failNext: { pushes: SyncFailure[]; pulls: SyncFailure[] } = { pushes: [], pulls: [] };
  /** Raw override for one company page, to serve an unparseable op. */
  companyPageOverride: ((since: number) => SyncPullResponse) | null = null;
  relatorios: { id: string; project_id: string; status: 'rascunho' | 'em_campo' | 'em_revisao' | 'emitido' }[] = [];

  private fail(kind: 'pushes' | 'pulls') {
    const failure = this.failNext[kind].shift();
    if (failure) throw new SyncRequestError(failure);
  }

  async pushOps(ops: readonly Op[]): Promise<SyncPushResponse> {
    this.pushAttempts++;
    this.fail('pushes');
    this.pushes.push([...ops]);
    const response: SyncPushResponse = { applied: [], rejected: [], superseded: [] };
    for (const op of ops) {
      const code = this.reject(op);
      if (code) {
        response.rejected.push({ op_id: op.op_id, code: code as 'op_invalid' });
        continue;
      }
      const existing = this.log.find((o) => o.op_id === op.op_id);
      if (existing) {
        response.applied.push({ op_id: op.op_id, seq: existing.seq! });
        continue;
      }
      const seq = this.log.length + 1;
      this.log.push({ ...op, seq });
      response.applied.push({ op_id: op.op_id, seq });
      if (op.path.startsWith('relatorio/') && op.kind === 'create') {
        const row = op.value as { id: string; project_id: string; status: 'rascunho' };
        this.relatorios.push({ id: row.id, project_id: row.project_id, status: row.status });
      }
    }
    return response;
  }

  private stream(filter: (op: Op) => boolean, since: number): { ops: Op[]; seq: number } {
    const all = this.log.filter(filter);
    return { ops: all.filter((op) => op.seq! > since).slice(0, 500), seq: all.at(-1)?.seq ?? 0 };
  }

  async pullCompany(since: number): Promise<SyncPullResponse> {
    this.pulls.push(`company:${since}`);
    this.fail('pulls');
    if (this.companyPageOverride) return this.companyPageOverride(since);
    return {
      ...this.stream((op) => op.scope === 'company', since),
      summary: {
        last_push_at: [{ user_id: USER_ID, device_id: 'tablet-a', at: '2026-09-21T15:00:00.000Z' }],
        relatorios: this.relatorios.map((r) => ({ ...r, template_id: null, seed_version: 'v1', updated_seq: 1 })),
      },
    };
  }

  /** `PUT /api/files/{id}`: stores the bytes and appends the `uploaded_at` server op. */
  uploads: string[] = [];
  fetches: string[] = [];
  private serverOpSeq = 0;
  uploadsInFlight = 0;
  maxUploadsInFlight = 0;
  failUpload: (id: string) => SyncFailure | null = () => null;

  async uploadFile(id: string, blob: Blob, sha256: string): Promise<FilePutResponse> {
    this.uploads.push(id);
    this.uploadsInFlight += 1;
    this.maxUploadsInFlight = Math.max(this.maxUploadsInFlight, this.uploadsInFlight);
    try {
      await Promise.resolve();
      const failure = this.failUpload(id);
      if (failure) throw new SyncRequestError(failure);
      const uploaded_at = '2026-09-21T16:05:00.000Z';
      const row = this.log.find((op) => op.path === `file/${id}`);
      if (!row) throw new SyncRequestError({ kind: 'http', status: 409, code: 'file_row_missing' });
      void blob;
      void sha256;
      this.log.push({
        ...row,
        op_id: `019966b0-00ff-7000-8000-${String(++this.serverOpSeq).padStart(12, '0')}`,
        kind: 'put',
        path: `file/${id}/uploaded_at`,
        value: uploaded_at,
        actor_id: 'system:files',
        device_id: 'server',
        seq: this.log.length + 1,
      });
      return { id, uploaded_at, variants: null };
    } finally {
      this.uploadsInFlight -= 1;
    }
  }

  async fetchFile(id: string, variant: FileVariantName): Promise<Blob> {
    this.fetches.push(id);
    return new Blob([`${id}:${variant}`]);
  }

  /** Story 4.8: the generate barrier is the Export dialog's, never the cycle's; the engine never calls it. */
  async generate(): Promise<GenerateResponse> {
    throw new Error('the sync engine never generates');
  }

  /** Epic 4 retro item 17: the project's own stream, its project-scope ops only. */
  async pullProject(id: string, since: number): Promise<SyncPullResponse> {
    this.pulls.push(`project:${id}:${since}`);
    this.fail('pulls');
    if (!this.log.some((op) => op.kind === 'create' && op.path === `project/${id}`)) throw new SyncRequestError({ kind: 'http', status: 404, code: 'not_found' });
    return this.stream((op) => op.scope === 'project' && op.project_id === id, since);
  }

  async pullRelatorio(id: string, since: number): Promise<SyncPullResponse> {
    this.pulls.push(`${id}:${since}`);
    this.fail('pulls');
    const relatorio = this.relatorios.find((r) => r.id === id);
    if (!relatorio) throw new SyncRequestError({ kind: 'http', status: 404, code: 'relatorio_not_found' });
    return this.stream(
      (op) => op.relatorio_id === id || (op.scope === 'project' && op.project_id === relatorio.project_id),
      since,
    );
  }
}

/** A clock the test advances by hand; callbacks due by the target time fire in order. */
function fakeClock(): { timers: Timers; advance(ms: number): Promise<void>; now(): number } {
  let now = 0;
  let seq = 0;
  const pending = new Map<number, { at: number; cb: () => void }>();
  return {
    now: () => now,
    timers: {
      setTimeout(cb, ms) {
        const id = ++seq;
        pending.set(id, { at: now + ms, cb });
        return id;
      },
      clearTimeout(handle) {
        pending.delete(handle as number);
      },
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, p]) => p.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        pending.delete(due[0]);
        due[1].cb();
        await settle();
      }
      now = target;
      await settle();
    },
  };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Lets the async work behind a fired callback (IDB requests, fetches) run for a while. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await tick();
}

async function waitFor(condition: () => boolean | Promise<boolean>, label: string): Promise<void> {
  for (let i = 0; i < 5000; i++) {
    if (await condition()) return;
    await tick();
  }
  throw new Error(`timed out waiting for ${label}`);
}

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0010-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function ids(prefix = '019966b0-0011-7000-8000-') {
  let n = 0;
  return () => `${prefix}${(++n).toString(16).padStart(12, '0')}`;
}

interface Harness {
  db: AppDatabase;
  server: FakeServer;
  engine: SyncEngine;
  clock: ReturnType<typeof fakeClock>;
  changes: EngineStatus[];
  online: { value: boolean };
  onReAuth: ReturnType<typeof vi.fn>;
  onOutdated: ReturnType<typeof vi.fn>;
  fireOnline: () => void;
}

async function harness(overrides: Partial<SyncEngineDeps> = {}): Promise<Harness> {
  const db = await freshDb();
  const server = new FakeServer();
  const clock = fakeClock();
  const changes: EngineStatus[] = [];
  const online = { value: true };
  const onReAuth = vi.fn();
  const onOutdated = vi.fn();
  let onlineListener: (() => void) | null = null;
  let t = Date.parse('2026-09-21T16:00:00.000Z');
  const engine = createSyncEngine({
    db,
    client: server,
    timers: clock.timers,
    random: () => 0,
    now: () => new Date((t += 1000)),
    newId: ids('019966b0-0012-7000-8000-'),
    isOnline: () => online.value,
    onReAuth,
    onOutdated,
    onChange: (s) => changes.push(s),
    subscribeOnline: (listener) => {
      onlineListener = listener;
      return () => {
        onlineListener = null;
      };
    },
    ...overrides,
  });
  return { db, server, engine, clock, changes, online, onReAuth, onOutdated, fireOnline: () => onlineListener?.() };
}

const seedLog = () => {
  const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
  return replaySmall.log.slice(0, upTo + 1).map((op) => ({ ...op, seq: undefined }));
};

function localPut(newId: () => string, value: string, extra: Partial<OpInput> = {}): Op {
  return makeOp(
    {
      kind: 'put',
      scope: 'relatorio',
      company_id: COMPANY_ID,
      relatorio_id: RELATORIO_ID,
      project_id: null,
      prev_op_id: null,
      batch_id: null,
      meta: null,
      path: `sheet/${BLOCK_1_ID}/nameplate/fabricacao`,
      value,
      actor_id: USER_ID,
      device_id: 'tablet-a',
      ...extra,
    },
    { newId, now: new Date('2026-09-21T16:30:00.000Z') },
  );
}

const companyPulls = (h: Harness) => h.server.pulls.filter((p) => p.startsWith('company:'));

describe('sync engine', () => {
  it('runs push, pull company and pull each relatorio in one cycle and records sync_state', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const pendingBefore = await h.db.outbox.where('status').equals('pending').count();
    expect(pendingBefore).toBeGreaterThan(0);

    expect(await h.engine.runCycle()).toBe('ran');

    // Every row acked with its seq; the pushed batch is in commit order.
    expect(await h.db.outbox.where('status').equals('acked').count()).toBe(pendingBefore);
    expect(h.server.pushes).toHaveLength(1);
    expect(h.server.pushes[0]!.map((o) => o.op_id)).toEqual(seedLog().map((o) => o.op_id));
    // The company stream, then the relatorio stream (rascunho), each to its head.
    expect(h.server.pulls[0]).toBe('company:0');
    expect(h.server.pulls.some((p) => p.startsWith(`${RELATORIO_ID}:`))).toBe(true);
    const company = (await h.db.sync_state.get('company'))!;
    const companyHead = h.server.log.filter((o) => o.scope === 'company').at(-1)!.seq!;
    expect(company).toMatchObject({ cursor_seq: companyHead, complete: true });
    expect(company.last_sync_at).not.toBeNull();
    expect(company.last_push_at).toEqual([{ user_id: USER_ID, device_id: 'tablet-a', at: '2026-09-21T15:00:00.000Z' }]);
    const relatorio = (await h.db.sync_state.get(RELATORIO_ID))!;
    expect(relatorio).toMatchObject({ cursor_seq: h.server.log.at(-1)!.seq, complete: true });
    // The server log came back into remote_ops; the project-scope equipment op landed once.
    expect(await h.db.remote_ops.count()).toBe(h.server.log.length);
    expect(await h.db.entities.get(['equipment', EQUIPMENT_1_ID])).toBeDefined();
    expect((await h.db.entities.get(['relatorio', RELATORIO_ID]))?.project_id).toBe(PROJECT_ID);
    expect(h.engine.status()).toMatchObject({ running: false, outdated: false, lastResult: 'ran', supersededCount: 0 });
    h.db.close();
  });

  it('a concurrent runCycle is a no-op that answers busy', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const first = h.engine.runCycle();
    expect(await h.engine.runCycle()).toBe('busy');
    expect(h.engine.status().running).toBe(true);
    expect(await first).toBe('ran');
    expect(h.changes.some((s) => s.running)).toBe(true);
    h.db.close();
  });

  it('answers offline without touching the network, and runs on the online event', async () => {
    const h = await harness();
    h.online.value = false;
    h.engine.start();
    await waitFor(() => h.engine.status().lastResult === 'offline', 'offline result');
    expect(h.server.pulls).toEqual([]);
    h.online.value = true;
    h.fireOnline();
    await waitFor(() => h.server.pulls.length > 0, 'the online cycle');
    expect(h.server.pulls[0]).toBe('company:0');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    h.engine.stop();
    h.db.close();
  });

  it('the online event pushes at once even when the app flag had not caught up yet (retro U3)', async () => {
    // The browser shape of the bug: one event target, the app's flag still false when the
    // engine's listener runs. `followOnlineEvents` is registered first, as SyncProvider does.
    const target = new EventTarget();
    const flag = { current: false };
    const stopFollowing = followOnlineEvents(flag, target);
    const h = await harness({
      isOnline: () => flag.current,
      subscribeOnline: (listener) => {
        target.addEventListener('online', listener);
        return () => target.removeEventListener('online', listener);
      },
    });
    await commitOps(h.db, seedLog());
    h.engine.start();
    await waitFor(() => h.engine.status().lastResult === 'offline', 'offline result');
    expect(h.server.pushAttempts).toBe(0);

    target.dispatchEvent(new Event('online'));
    await waitFor(() => h.server.pushes.length === 1, 'the push on the online event');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    expect(await h.db.outbox.where('status').equals('pending').count()).toBe(0);
    // The event did it, not the 60 s timer: no fake time has passed.
    expect(h.clock.now()).toBe(0);

    target.dispatchEvent(new Event('offline'));
    expect(flag.current).toBe(false);
    stopFollowing();
    h.engine.stop();
    h.db.close();
  });

  it('an online event during a running cycle runs one more cycle as soon as it ends (retro U3)', async () => {
    const h = await harness();
    h.engine.start();
    await waitFor(() => !h.engine.status().running, 'the launch cycle');
    // The next cycle is past its (empty) push and waiting out a pull retry...
    h.server.failNext.pulls = [{ kind: 'network' }];
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pulls.length >= 2, 'the failed pull');
    expect(h.engine.status().running).toBe(true);
    // ...when work is committed and the online event arrives.
    await commitOps(h.db, seedLog());
    h.fireOnline();
    await h.clock.advance(1_000);
    expect(await cycle).toBe('ran');
    expect(h.server.pushes).toHaveLength(0);
    await h.clock.advance(0);
    await waitFor(() => h.server.pushes.length === 1, 'the follow-up push');
    await waitFor(() => !h.engine.status().running, 'the follow-up cycle');
    h.engine.stop();
    h.db.close();
  });

  it('a push that hit 503 stays the cycle failure when a later relatório pull answers 404', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    // A relatório this device follows and the server no longer knows.
    const gone = '019966b0-0099-7000-8000-000000000001';
    await h.engine.syncRelatorio(gone);
    await commitOps(h.db, [localPut(ids('019966b0-0013-7000-8000-'), 'depois')]);
    const unavailable: SyncFailure = { kind: 'http', status: 503 };
    h.server.failNext.pushes = [unavailable, unavailable, unavailable];
    const base = h.server.pushAttempts;
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === base + 1, 'the first attempt');
    await h.clock.advance(1_000);
    await waitFor(() => h.server.pushAttempts === base + 2, 'the second attempt');
    await h.clock.advance(2_000);
    expect(await cycle).toBe('ran');
    expect(h.server.pulls.some((p) => p.startsWith(`${gone}:`))).toBe(true);
    expect(h.engine.status().lastFailure).toEqual(unavailable);
    h.db.close();
  });

  it('a cycle cut by going offline keeps the previous unreachable verdict', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const unavailable: SyncFailure = { kind: 'http', status: 503 };
    h.server.failNext.pushes = [unavailable, unavailable, unavailable];
    const first = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 1, 'the first attempt');
    await h.clock.advance(1_000);
    await waitFor(() => h.server.pushAttempts === 2, 'the second attempt');
    await h.clock.advance(2_000);
    await first;
    expect(h.engine.status().lastFailure).toEqual(unavailable);

    // The next cycle fails once more, then the device goes offline before the retry.
    h.server.failNext.pushes = [{ kind: 'network' }];
    const second = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 4, 'the next cycle attempt');
    h.online.value = false;
    await h.clock.advance(10_000);
    expect(await second).toBe('ran');
    // Nothing in it said the server answered, so the badge must not turn "Sincronizado".
    expect(h.engine.status().lastFailure).toEqual(unavailable);

    // Back online, a clean cycle clears it.
    h.online.value = true;
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.engine.status().lastFailure).toBeNull();
    h.db.close();
  });

  it('stop drops a follow-up cycle an online event asked for while a cycle ran', async () => {
    const h = await harness();
    h.engine.start();
    await waitFor(() => !h.engine.status().running, 'the launch cycle');
    h.server.failNext.pulls = [{ kind: 'network' }];
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pulls.length >= 2, 'the failed pull');
    h.fireOnline();
    h.engine.stop();
    await h.clock.advance(1_000);
    await cycle;
    const pulls = h.server.pulls.length;
    await h.clock.advance(0);
    await settle();
    expect(h.server.pulls.length).toBe(pulls);
    h.db.close();
  });

  it('a cycle that could not reach the server keeps its failure until a later cycle runs clean', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const unavailable: SyncFailure = { kind: 'http', status: 503 };
    h.server.failNext.pushes = [unavailable, unavailable, unavailable];
    const first = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 1, 'the first attempt');
    await h.clock.advance(1_000);
    await waitFor(() => h.server.pushAttempts === 2, 'the second attempt');
    await h.clock.advance(2_000);
    expect(await first).toBe('ran');
    expect(h.engine.status().lastFailure).toEqual(unavailable);

    // While the next cycle runs, the last finished cycle's failure stands: the badge must
    // not flash back to ok before the server has answered.
    const second = h.engine.runCycle();
    expect(h.engine.status().running).toBe(true);
    expect(h.engine.status().lastFailure).toEqual(unavailable);
    expect(await second).toBe('ran');
    expect(h.engine.status().lastFailure).toBeNull();
    h.db.close();
  });

  it('start runs a cycle at once and every 60 s after, until stop', async () => {
    const h = await harness();
    h.engine.start();
    await waitFor(() => companyPulls(h).length === 1, 'the launch cycle');
    await h.clock.advance(59_000);
    expect(companyPulls(h)).toHaveLength(1);
    await h.clock.advance(1_000);
    await waitFor(() => companyPulls(h).length === 2, 'the 60 s cycle');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    await h.clock.advance(60_000);
    await waitFor(() => companyPulls(h).length === 3, 'the 120 s cycle');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    h.engine.stop();
    await h.clock.advance(120_000);
    expect(companyPulls(h)).toHaveLength(3);
    h.db.close();
  });

  it('going offline mid-cycle ends the phase without retries; the online event resumes', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    h.server.failNext.pushes = [{ kind: 'network' }];
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 1, 'attempt 1');
    h.online.value = false;
    await h.clock.advance(10_000);
    expect(await cycle).toBe('ran');
    expect(h.server.pushAttempts).toBe(1);
    expect(h.server.pulls).toEqual([]);
    // Going offline is the device, not the server: nothing may say the server failed once
    // the connection is back (retro U5).
    expect(h.engine.status().lastFailure).toBeNull();
    expect(await h.db.outbox.where('status').equals('sent').count()).toBe(seedLog().length);

    h.engine.start();
    h.online.value = true;
    h.fireOnline();
    await waitFor(() => h.server.pushes.length === 1, 'the online push');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    expect(await h.db.outbox.where('status').equals('acked').count()).toBe(seedLog().length);
    h.engine.stop();
    h.db.close();
  });

  it('stop ends the in-flight cycle at its next step and reports nothing more', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    h.server.failNext.pushes = [{ kind: 'network' }];
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 1, 'attempt 1');
    const emitted = h.changes.length;
    h.engine.stop();
    await h.clock.advance(1_000);
    expect(await cycle).toBe('ran');
    expect(h.server.pushAttempts).toBe(1);
    expect(h.server.pulls).toEqual([]);
    expect(h.changes).toHaveLength(emitted);
    expect(await h.engine.runCycle()).toBe('paused');
    h.db.close();
  });

  it('retries network and 5xx with backoff, then waits for the next trigger', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    h.server.failNext.pushes = [{ kind: 'network' }, { kind: 'http', status: 503 }, { kind: 'network' }];
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.pushAttempts === 1, 'attempt 1');
    await h.clock.advance(999);
    expect(h.server.pushAttempts).toBe(1);
    await h.clock.advance(1);
    await waitFor(() => h.server.pushAttempts === 2, 'attempt 2');
    await h.clock.advance(2_000);
    await waitFor(() => h.server.pushAttempts === 3, 'attempt 3');
    expect(await cycle).toBe('ran');
    // Three attempts failed: nothing applied, rows stay `sent` for the next cycle, the pull still ran.
    expect(h.server.pushes).toHaveLength(0);
    expect(await h.db.outbox.where('status').equals('sent').count()).toBeGreaterThan(0);
    expect(h.engine.status().lastFailure).toEqual({ kind: 'network' });
    expect(h.server.pulls[0]).toBe('company:0');

    // The next trigger pushes the `sent` rows again (crash recovery path) and the server dedupes.
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pushes).toHaveLength(1);
    expect(await h.db.outbox.where('status').equals('acked').count()).toBe(seedLog().length);
    h.db.close();
  });

  it('a 4xx stops the push without retry and without marking anything dead', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    h.server.failNext.pushes = [{ kind: 'http', status: 400, code: 'sync_batch_invalid' }];
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pushAttempts).toBe(1);
    expect(h.server.pushes).toHaveLength(0);
    expect(await h.db.outbox.where('status').equals('dead').count()).toBe(0);
    expect(h.engine.status().lastFailure).toEqual({ kind: 'http', status: 400, code: 'sync_batch_invalid' });
    h.db.close();
  });

  it('a 401 raises re-auth, pauses the engine and leaves the outbox intact', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const before = await h.db.outbox.toArray();
    h.server.failNext.pushes = [{ kind: 'http', status: 401, code: 'unauthenticated' }];
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.onReAuth).toHaveBeenCalledTimes(1);
    expect(h.engine.status().paused).toBe(true);
    expect(await h.engine.runCycle()).toBe('paused');
    expect(h.server.pulls).toEqual([]);
    const after = await h.db.outbox.toArray();
    expect(after.map((r) => r.op_id)).toEqual(before.map((r) => r.op_id));
    expect(after.map((r) => r.value)).toEqual(before.map((r) => r.value));
    expect(after.every((r) => r.status === 'sent' || r.status === 'pending')).toBe(true);
    // Signing in again resumes and runs a cycle.
    h.engine.resume();
    await waitFor(() => h.server.pushes.length === 1, 'the resumed push');
    await waitFor(() => !h.engine.status().running, 'the cycle to end');
    h.db.close();
  });

  it('a 426 flags outdated, never moves the cursor and keeps pushing on later cycles', async () => {
    const h = await harness();
    h.server.failNext.pulls = [{ kind: 'http', status: 426, code: 'contract_outdated' }];
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.onOutdated).toHaveBeenCalledTimes(1);
    expect(h.engine.status().outdated).toBe(true);
    expect(await h.db.sync_state.get('company')).toBeUndefined();

    const newId = ids();
    await commitOps(h.db, seedLog());
    await commitOps(h.db, [localPut(newId, 'WEG')]);
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pushes).toHaveLength(1);
    expect(h.server.pulls).toHaveLength(1);
    expect(await h.db.sync_state.get('company')).toBeUndefined();
    expect(h.onOutdated).toHaveBeenCalledTimes(1);
    h.db.close();
  });

  it('an unparseable pulled op stops the cursor before it; the next cycle retries from there', async () => {
    const h = await harness();
    const companyOps = replaySmall.log.filter((op) => op.scope === 'company').slice(0, 4);
    h.server.log = companyOps.map((op, i) => ({ ...op, seq: i + 1 }));
    const bad = { ...h.server.log[2]!, path: 'nonsense/family' };
    h.server.companyPageOverride = (since) => ({
      ops: [h.server.log[0]!, h.server.log[1]!, bad, h.server.log[3]!].filter((op) => op.seq! > since),
      seq: 4,
    });
    expect(await h.engine.runCycle()).toBe('ran');
    const state = (await h.db.sync_state.get('company'))!;
    expect(state).toMatchObject({ cursor_seq: 2, complete: false });
    expect(await h.db.remote_ops.count()).toBe(2);

    // The server fixes the op: the next cycle continues from seq 2.
    h.server.companyPageOverride = null;
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pulls.at(-1)).toBe('company:2');
    expect(await h.db.sync_state.get('company')).toMatchObject({ cursor_seq: 4, complete: true });
    expect(await h.db.remote_ops.count()).toBe(4);
    h.db.close();
  });

  it('a pulled op the row schema refuses ends the stream with the cursor untouched and never throws out of the cycle', async () => {
    const h = await harness();
    const create = replaySmall.log.find((op) => op.path.startsWith('registry/client/') && op.kind === 'create')!;
    const clientId = (create.value as { id: string }).id;
    h.server.log = [{ ...create, seq: 1 }];
    expect(await h.engine.runCycle()).toBe('ran');
    expect(await h.db.sync_state.get('company')).toMatchObject({ cursor_seq: 1, complete: true });

    // `contact_name` is `string | null`: applyOp refuses the row, materialization throws.
    h.server.log.push({
      ...create,
      op_id: '019966b0-0014-7000-8000-000000000001',
      kind: 'put',
      path: `registry/client/${clientId}/contact_name`,
      value: 42,
      seq: 2,
    });
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.engine.status().lastFailure).toEqual({ kind: 'apply' });
    expect(await h.db.sync_state.get('company')).toMatchObject({ cursor_seq: 1 });
    expect(await h.db.remote_ops.count()).toBe(1);
    // Nothing escaped: a later call resolves the same way instead of rejecting.
    await expect(h.engine.runCycle()).resolves.toBe('ran');
    expect(h.engine.status().lastFailure).toEqual({ kind: 'apply' });
    h.db.close();
  });

  it('keeps following the stream of a relatorio opened before, whatever its status now', async () => {
    const h = await harness();
    h.server.relatorios.push({ id: RELATORIO_ID, project_id: PROJECT_ID, status: 'em_revisao' });
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pulls.some((p) => p.startsWith(`${RELATORIO_ID}:`))).toBe(false);

    // A sync_state row means the relatorio was opened on this device before.
    await h.db.sync_state.put({
      id: RELATORIO_ID,
      cursor_seq: 0,
      complete: false,
      files_pending: 0,
      downloaded_at: null,
      last_sync_at: null,
      last_push_at: [],
    });
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pulls).toContain(`${RELATORIO_ID}:0`);
    h.db.close();
  });

  it('keeps the company summary on the company sync_state row (AD-8)', async () => {
    const h = await harness();
    h.server.relatorios.push({ id: RELATORIO_ID, project_id: PROJECT_ID, status: 'emitido' });
    expect(await h.engine.runCycle()).toBe('ran');

    const company = (await h.db.sync_state.get('company'))!;
    expect(company.relatorios).toEqual([
      { id: RELATORIO_ID, project_id: PROJECT_ID, status: 'emitido', template_id: null, seed_version: 'v1', updated_seq: 1 },
    ]);
    // Only the company row carries it: a relatorio stream has no summary of its own.
    await h.engine.syncRelatorio(RELATORIO_ID);
    expect((await h.db.sync_state.get(RELATORIO_ID))!.relatorios).toBeUndefined();
    h.db.close();
  });

  it('syncRelatorio starts following an Emitido relatorio and pulls it now (AD-8, "pulled on open")', async () => {
    const h = await harness();
    h.server.relatorios.push({ id: RELATORIO_ID, project_id: PROJECT_ID, status: 'emitido' });
    expect(await h.engine.runCycle()).toBe('ran');
    // Not Rascunho or Em campo, so the automatic rule left it alone.
    expect(h.server.pulls.some((p) => p.startsWith(`${RELATORIO_ID}:`))).toBe(false);

    expect(await h.engine.syncRelatorio(RELATORIO_ID)).toBe('ran');
    expect(h.server.pulls).toContain(`${RELATORIO_ID}:0`);
    expect(await h.db.sync_state.get(RELATORIO_ID)).toMatchObject({ complete: true });

    // From then on the existing "already holds a sync_state row" rule keeps it fresh.
    const before = h.server.pulls.length;
    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.pulls.slice(before).some((p) => p.startsWith(`${RELATORIO_ID}:`))).toBe(true);
    h.db.close();
  });

  it('E4 retro item 17: syncProject follows the project stream through the project route, never as a relatório', async () => {
    // Another device wrote the relatório (Emitido, so no automatic pull) and its equipment.
    const other = await harness();
    await commitOps(other.db, seedLog());
    expect(await other.engine.runCycle()).toBe('ran');
    other.db.close();
    const fresh = await harness();
    fresh.server.log = other.server.log;
    fresh.server.relatorios = [{ id: RELATORIO_ID, project_id: PROJECT_ID, status: 'emitido' }];
    expect(await fresh.engine.runCycle()).toBe('ran');
    expect(await fresh.db.entities.get(['equipment', EQUIPMENT_1_ID])).toBeUndefined();

    expect(await fresh.engine.syncProject(PROJECT_ID)).toBe('ran');
    expect(fresh.server.pulls).toContain(`project:${PROJECT_ID}:0`);
    // The project's equipment is here, the relatório's own rows are not.
    expect(await fresh.db.entities.get(['equipment', EQUIPMENT_1_ID])).toBeDefined();
    expect(await fresh.db.entities.get(['relatorio', RELATORIO_ID])).toBeUndefined();
    expect(await fresh.db.sync_state.get(`project:${PROJECT_ID}`)).toMatchObject({ complete: true });
    expect(fresh.server.pulls.some((p) => p.startsWith(`${RELATORIO_ID}:`))).toBe(false);

    // Every later cycle keeps following it.
    const before = fresh.server.pulls.length;
    expect(await fresh.engine.runCycle()).toBe('ran');
    expect(fresh.server.pulls.slice(before).some((p) => p.startsWith(`project:${PROJECT_ID}:`))).toBe(true);
    fresh.db.close();
  });

  it('E4 retro item 17: syncProject asked during a running cycle runs one more cycle after it', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    const running = h.engine.runCycle();
    const project = h.engine.syncProject(PROJECT_ID);
    expect(await running).toBe('ran');
    expect(await project).toBe('ran');
    expect(await h.db.sync_state.get(`project:${PROJECT_ID}`)).toMatchObject({ complete: true });
    h.db.close();
  });

  it('syncRelatorio does not reset the cursor of a relatorio already followed', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    expect(await h.engine.runCycle()).toBe('ran');
    const cursor = (await h.db.sync_state.get(RELATORIO_ID))!.cursor_seq;
    expect(cursor).toBeGreaterThan(0);
    await h.engine.syncRelatorio(RELATORIO_ID);
    expect((await h.db.sync_state.get(RELATORIO_ID))!.cursor_seq).toBe(cursor);
    h.db.close();
  });

  it('pages a long stream and advances the cursor each page', async () => {
    const h = await harness();
    const base = replaySmall.log.find((op) => op.scope === 'company')!;
    const clientId = '019966b0-0000-7000-8000-000000000003';
    h.server.log = Array.from({ length: 1200 }, (_, i) => ({
      ...base,
      op_id: `019966b0-0013-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
      kind: 'put' as const,
      path: `registry/client/${clientId}/contact_name`,
      value: `Contato ${i}`,
      seq: i + 1,
    }));
    expect(await h.engine.runCycle()).toBe('ran');
    expect(companyPulls(h)).toEqual(['company:0', 'company:500', 'company:1000']);
    expect(await h.db.sync_state.get('company')).toMatchObject({ cursor_seq: 1200, complete: true });
    h.db.close();
  });

  it('marks rejected ops dead with their code and counts superseded', async () => {
    const h = await harness();
    await commitOps(h.db, seedLog());
    await h.engine.runCycle();
    const newId = ids();
    const bad = localPut(newId, 'BAD');
    const good = localPut(newId, 'GOOD', { meta: { auto: true } });
    await commitOps(h.db, [bad, good]);
    h.server.reject = (op) => (op.op_id === bad.op_id ? 'op_invalid' : null);
    const original = h.server.pushOps.bind(h.server);
    h.server.pushOps = async (ops) => {
      const res = await original(ops);
      res.superseded.push({ op_id: good.op_id, over_op_id: bad.op_id });
      return res;
    };
    expect(await h.engine.runCycle()).toBe('ran');
    expect(await h.db.outbox.get(bad.op_id)).toMatchObject({ status: 'dead', error_code: 'op_invalid', value: 'BAD' });
    expect(await h.db.outbox.get(good.op_id)).toMatchObject({ status: 'acked' });
    expect(h.engine.status().supersededCount).toBe(1);
    const block = (await h.db.entities.get(['block', BLOCK_1_ID]))!.row as { sheet: { nameplate: Record<string, { value: unknown }> } };
    expect(block.sheet.nameplate.fabricacao?.value).toBe('GOOD');
    h.db.close();
  });
});

describe('2.2 upload phase', () => {
  /** A `file/{id}` create op plus its Blob, committed the way `commitFileBatch` does. */
  async function pickFile(h: Harness, id: string, sha = 'abc123'): Promise<void> {
    const op = makeOp(
      {
        kind: 'create',
        scope: 'company',
        company_id: COMPANY_ID,
        relatorio_id: null,
        project_id: null,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        path: `file/${id}`,
        value: {
          id,
          company_id: COMPANY_ID,
          relatorio_id: null,
          kind: 'certificate',
          sha256: sha,
          mime: 'application/pdf',
          size: 4,
          uploaded_at: null,
          variants: null,
          removed_at: null,
        },
        actor_id: USER_ID,
        device_id: 'tablet-a',
      },
      { newId: ids(`019966b0-00${id.slice(-2)}-7000-8000-`), now: new Date('2026-09-21T16:30:00.000Z') },
    );
    await commitOps(h.db, [op]);
    await h.db.files.put({ id, variant: 'original', blob: new Blob(['abcd']), acked: false, created_at: '2026-09-21T16:30:00.000Z' });
  }

  const FILE_A = '019966b0-0000-7000-8000-0000000000a1';
  const FILE_B = '019966b0-0000-7000-8000-0000000000b2';
  const FILE_C = '019966b0-0000-7000-8000-0000000000c3';

  it('uploads after the push and before the pull, and the row carries uploaded_at afterwards', async () => {
    const h = await harness();
    await pickFile(h, FILE_A);
    expect(await h.engine.runCycle()).toBe('ran');

    expect(h.server.uploads).toEqual([FILE_A]);
    // The pull ran after the upload, so the server op came back in the same cycle.
    const row = (await h.db.entities.get(['file', FILE_A]))!.row as { uploaded_at: string | null };
    expect(row.uploaded_at).toBe('2026-09-21T16:05:00.000Z');
    expect((await h.db.files.get(FILE_A))!.acked).toBe(true);
    expect((await h.db.sync_state.get('company'))!.files_pending).toBe(0);
    h.db.close();
  });

  it('does not upload before the create op is acked, and never prefetches an original', async () => {
    const h = await harness();
    await pickFile(h, FILE_A);
    // A push the server accepts but does not ack: the outbox row stays `sent`, so the
    // route's precondition is not met and the uploader leaves the file alone.
    const real = h.server.pushOps.bind(h.server);
    h.server.pushOps = async () => ({ applied: [], rejected: [], superseded: [] });
    await h.engine.runCycle();
    expect(h.server.uploads).toEqual([]);

    h.server.pushOps = real;
    await h.engine.runCycle();
    expect(h.server.uploads).toEqual([FILE_A]);
    // AC 2.2-3: a full cycle downloads no file bytes, ever.
    expect(h.server.fetches).toEqual([]);
    h.db.close();
  });

  it('keeps two uploads in flight and isolates one failure from the rest', async () => {
    const h = await harness();
    await pickFile(h, FILE_A);
    await pickFile(h, FILE_B);
    await pickFile(h, FILE_C);
    // The middle file answers a permanent verdict; the other two still upload.
    h.server.failUpload = (id) => (id === FILE_B ? { kind: 'http', status: 409, code: 'file_sha_mismatch' } : null);

    expect(await h.engine.runCycle()).toBe('ran');
    expect(h.server.maxUploadsInFlight).toBeLessThanOrEqual(2);
    expect((await h.db.files.get(FILE_A))!.acked).toBe(true);
    expect((await h.db.files.get(FILE_C))!.acked).toBe(true);
    expect((await h.db.files.get(FILE_B))!.acked).toBe(false);
    expect((await h.db.sync_state.get('company'))!.files_pending).toBe(1);
    // One unusable file is not a verdict on the cycle: the push and the pull both
    // finished, so nothing may claim the server was unreachable (the eviction-recovery
    // screen dismisses on exactly this).
    expect(h.engine.status().lastFailure).toBeNull();

    // Permanent: the next cycle does not try it again, but its blob is still unacked
    // work on the device, so it stays counted.
    const before = h.server.uploads.length;
    await h.engine.runCycle();
    expect(h.server.uploads.slice(before)).toEqual([]);
    expect((await h.db.sync_state.get('company'))!.files_pending).toBe(1);
    h.db.close();
  });

  it('counts the files it never reached when the phase is cut short by a 401', async () => {
    const h = await harness();
    await pickFile(h, FILE_A);
    await pickFile(h, FILE_B);
    await pickFile(h, FILE_C);
    // Every upload answers 401, so the first two workers end the phase at once and the
    // third file is never attempted at all -- it is still waiting, and must be counted.
    h.server.failUpload = () => ({ kind: 'http', status: 401 });

    await h.engine.runCycle();
    expect(h.onReAuth).toHaveBeenCalled();
    expect((await h.db.sync_state.get('company'))!.files_pending).toBe(3);
    h.db.close();
  });

  it('leaves a file pending on 409 file_row_missing and retries it next cycle', async () => {
    const h = await harness();
    await pickFile(h, FILE_A);
    let missing = true;
    h.server.failUpload = () => (missing ? { kind: 'http', status: 409, code: 'file_row_missing' } : null);

    await h.engine.runCycle();
    expect(h.server.uploads).toEqual([FILE_A]);
    expect((await h.db.files.get(FILE_A))!.acked).toBe(false);
    // Retryable: nothing is recorded as a server failure.
    expect(h.engine.status().lastFailure).toBeNull();

    missing = false;
    await h.engine.runCycle();
    expect(h.server.uploads).toEqual([FILE_A, FILE_A]);
    expect((await h.db.files.get(FILE_A))!.acked).toBe(true);
    h.db.close();
  });
});

describe('6.2 photo uploads', () => {
  const PHOTO_1 = '019966b0-0000-7000-8000-0000000006a1';
  const PHOTO_2 = '019966b0-0000-7000-8000-0000000006b2';
  const PHOTO_3 = '019966b0-0000-7000-8000-0000000006c3';
  const CERT = '019966b0-0000-7000-8000-0000000006d4';

  /** A photo's create op plus its original, committed the way `commitPhotoCapture` does. */
  async function shoot(h: Harness, id: string, capturedAt: string, readingStatus: 'none' | 'queued' = 'none'): Promise<void> {
    const op = makeOp(
      {
        kind: 'create',
        scope: 'relatorio',
        company_id: COMPANY_ID,
        relatorio_id: RELATORIO_ID,
        project_id: null,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        path: `file/${id}`,
        value: {
          id,
          company_id: COMPANY_ID,
          relatorio_id: RELATORIO_ID,
          kind: 'photo',
          sha256: 'abc',
          mime: 'image/jpeg',
          size: 4,
          uploaded_at: null,
          variants: null,
          removed_at: null,
          captured_at: capturedAt,
          tz_offset: -180,
          coords: null,
          local_seq: 1,
          block_id: BLOCK_1_ID,
          item_key: null,
          caption: null,
          reading_kind: readingStatus === 'none' ? null : 'plate',
          reading_target: null,
          reading_status: readingStatus,
        },
        actor_id: USER_ID,
        device_id: 'tablet-a',
      },
      { newId: ids(`019966b0-00${id.slice(-2)}-7000-8000-`), now: new Date('2026-09-21T16:30:00.000Z') },
    );
    await commitOps(h.db, [op]);
    await h.db.files.put({ id, variant: 'original', blob: new Blob(['abcd']), acked: false, created_at: '2026-09-21T16:30:00.000Z' });
  }

  async function certificate(h: Harness, id: string): Promise<void> {
    const op = makeOp(
      {
        kind: 'create',
        scope: 'company',
        company_id: COMPANY_ID,
        relatorio_id: null,
        project_id: null,
        prev_op_id: null,
        batch_id: null,
        meta: null,
        path: `file/${id}`,
        value: { id, company_id: COMPANY_ID, relatorio_id: null, kind: 'certificate', sha256: 'abc', mime: 'application/pdf', size: 4, uploaded_at: null, variants: null, removed_at: null },
        actor_id: USER_ID,
        device_id: 'tablet-a',
      },
      { newId: ids(`019966b0-00${id.slice(-2)}-7000-8000-`), now: new Date('2026-09-21T16:29:00.000Z') },
    );
    await commitOps(h.db, [op]);
    await h.db.files.put({ id, variant: 'original', blob: new Blob(['abcd']), acked: false, created_at: '2026-09-21T16:29:00.000Z' });
  }

  /** A second engine over the same database and server: the tab reloaded. */
  function reload(h: Harness): SyncEngine {
    let t = Date.parse('2026-09-21T17:00:00.000Z');
    return createSyncEngine({
      db: h.db,
      client: h.server,
      timers: h.clock.timers,
      random: () => 0,
      now: () => new Date((t += 1000)),
      newId: ids('019966b0-0014-7000-8000-'),
      isOnline: () => h.online.value,
      onReAuth: () => {},
      onOutdated: () => {},
      onChange: () => {},
      subscribeOnline: () => () => {},
    });
  }

  it('uploads a waiting reading first, then photos by captured_at, then the other kinds', async () => {
    const h = await harness();
    await certificate(h, CERT);
    await shoot(h, PHOTO_2, '2026-09-21T16:20:00.000Z');
    await shoot(h, PHOTO_1, '2026-09-21T16:10:00.000Z');
    await shoot(h, PHOTO_3, '2026-09-21T16:25:00.000Z', 'queued');
    // One upload at a time is enough to read the order off the server.
    await h.engine.runCycle();
    expect(h.server.uploads).toEqual([PHOTO_3, PHOTO_1, PHOTO_2, CERT]);
    h.db.close();
  });

  it('persists a permanent refusal as dead: a reload does not retry it, the others upload, and a cleared error retries', async () => {
    const h = await harness();
    await shoot(h, PHOTO_1, '2026-09-21T16:10:00.000Z');
    await shoot(h, PHOTO_2, '2026-09-21T16:20:00.000Z');
    h.server.failUpload = (id) => (id === PHOTO_1 ? { kind: 'http', status: 413, code: 'file_too_large' } : null);

    await h.engine.runCycle();
    expect((await h.db.files.get(PHOTO_1))!.upload_error).toMatchObject({ state: 'dead', code: 'file_too_large' });
    expect((await h.db.files.get(PHOTO_2))!.acked).toBe(true);
    expect(h.engine.status().lastFailure).toBeNull();

    const again = reload(h);
    const before = h.server.uploads.length;
    await again.runCycle();
    expect(h.server.uploads.slice(before)).toEqual([]);
    expect((await h.db.sync_state.get('company'))!.files_pending).toBe(1);

    // The tile's "Erro — Tentar novamente": the error is cleared and the next cycle sends it.
    h.server.failUpload = () => null;
    await clearUploadError(h.db, PHOTO_1);
    await again.runCycle();
    expect(h.server.uploads.slice(before)).toEqual([PHOTO_1]);
    expect((await h.db.files.get(PHOTO_1))!.acked).toBe(true);
    expect((await h.db.files.get(PHOTO_1))!.upload_error).toBeUndefined();
    h.db.close();
  });

  it('marks retries run out as failed, retries it next cycle and clears it on success', async () => {
    const h = await harness();
    await shoot(h, PHOTO_1, '2026-09-21T16:10:00.000Z');
    let down = true;
    h.server.failUpload = () => (down ? { kind: 'http', status: 503 } : null);
    const cycle = h.engine.runCycle();
    await waitFor(() => h.server.uploads.length === 1, 'the first attempt');
    await h.clock.advance(1_000);
    await waitFor(() => h.server.uploads.length === 2, 'the second attempt');
    await h.clock.advance(2_000);
    await cycle;
    expect(h.server.uploads).toEqual([PHOTO_1, PHOTO_1, PHOTO_1]);
    expect((await h.db.files.get(PHOTO_1))!.upload_error).toMatchObject({ state: 'failed', code: '503' });

    down = false;
    await h.engine.runCycle();
    expect((await h.db.files.get(PHOTO_1))!.acked).toBe(true);
    expect((await h.db.files.get(PHOTO_1))!.upload_error).toBeUndefined();
    h.db.close();
  });

  it('runs the eviction pass after the cycle: under pressure the acked original goes, the unacked one and every thumb stay', async () => {
    const MB = 1024 * 1024;
    let low = false;
    const h = await harness({ readStorage: async () => (low ? { usage: 10_000 * MB - 100 * MB, quota: 10_000 * MB } : { usage: 0, quota: 10_000 * MB }) });
    await shoot(h, PHOTO_1, '2026-09-21T16:10:00.000Z');
    await shoot(h, PHOTO_2, '2026-09-21T16:20:00.000Z');
    for (const id of [PHOTO_1, PHOTO_2]) await h.db.thumbs.put({ id, blob: new Blob(['t']), source: 'server', created_at: '2026-09-21T16:30:00.000Z' });
    h.server.failUpload = (id) => (id === PHOTO_2 ? { kind: 'http', status: 413, code: 'file_too_large' } : null);
    await h.engine.runCycle();
    expect((await h.db.files.get(PHOTO_1))!.acked).toBe(true);
    // Its `uploaded_at` as the relatório pull would bring it.
    const record = (await h.db.entities.get(['file', PHOTO_1]))!;
    await h.db.entities.put({ ...record, row: { ...record.row, uploaded_at: '2026-09-21T16:05:00.000Z' } as never });
    // No pressure, relatório still in the field: nothing is evicted.
    await h.engine.runCycle();
    expect(await h.db.files.get(PHOTO_1)).toBeDefined();

    low = true;
    await h.engine.runCycle();
    expect(await h.db.files.get(PHOTO_1)).toBeUndefined();
    expect((await h.db.files.get(PHOTO_2))!.acked).toBe(false);
    expect(await h.db.thumbs.count()).toBe(2);
    h.db.close();
  });

  it('swaps the device thumb for the server one once the variants arrive, and fetches no original', async () => {
    const h = await harness();
    await shoot(h, PHOTO_1, '2026-09-21T16:10:00.000Z');
    await h.db.thumbs.put({ id: PHOTO_1, blob: new Blob(['device']), source: 'device', created_at: '2026-09-21T16:30:00.000Z' });
    await h.engine.runCycle();
    expect(h.server.fetches).toEqual([]);

    // The pulled `variants` op, as the device would hold it.
    const record = (await h.db.entities.get(['file', PHOTO_1]))!;
    await h.db.entities.put({ ...record, row: { ...record.row, uploaded_at: '2026-09-21T16:05:00.000Z', variants: { thumb: 'k/thumb', print: 'k/print' } } as never });
    await h.engine.runCycle();
    expect(h.server.fetches).toEqual([PHOTO_1]);
    expect(await h.db.thumbs.get(PHOTO_1)).toMatchObject({ source: 'server' });
    // Once swapped, never asked again.
    await h.engine.runCycle();
    expect(h.server.fetches).toEqual([PHOTO_1]);
    h.db.close();
  });
});
