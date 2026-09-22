import 'fake-indexeddb/auto';
import { makeOp, type Op, type OpInput, type SyncPullResponse, type SyncPushResponse } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, EQUIPMENT_1_ID, PROJECT_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it, vi } from 'vitest';
import { commitOps } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { Timers } from '../input/field-commit.ts';
import { SyncRequestError, type SyncClient, type SyncFailure } from './client.ts';
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
      path: `sheet/${BLOCK_1_ID}/nameplate/fabricante`,
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

    // `address` is `string | null`: applyOp refuses the row, materialization throws.
    h.server.log.push({
      ...create,
      op_id: '019966b0-0014-7000-8000-000000000001',
      kind: 'put',
      path: `registry/client/${clientId}/address`,
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

  it('pages a long stream and advances the cursor each page', async () => {
    const h = await harness();
    const base = replaySmall.log.find((op) => op.scope === 'company')!;
    const clientId = '019966b0-0000-7000-8000-000000000003';
    h.server.log = Array.from({ length: 1200 }, (_, i) => ({
      ...base,
      op_id: `019966b0-0013-7000-8000-${(i + 1).toString(16).padStart(12, '0')}`,
      kind: 'put' as const,
      path: `registry/client/${clientId}/address`,
      value: `Rua ${i}`,
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
    expect(block.sheet.nameplate.fabricante?.value).toBe('GOOD');
    h.db.close();
  });
});
