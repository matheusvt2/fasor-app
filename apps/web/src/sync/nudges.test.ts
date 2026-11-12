import 'fake-indexeddb/auto';
import { makeOp, type OpInput } from '@app/domain';
import { BLOCK_1_ID, COMPANY_ID, RELATORIO_ID, replaySmall, USER_ID } from '@app/domain/fixtures/replay-small';
import { describe, expect, it, vi } from 'vitest';
import { commitBatch, commitBatchIf, commitFileBatch, commitOps } from '../db/commit.ts';
import { openDatabase, type AppDatabase } from '../db/schema.ts';
import type { Timers } from '../input/field-commit.ts';
import { announceCommit, COMMIT_SYNC_WINDOW_MS, onCommit } from './commit-signal.ts';
import { followCommits, followVisible } from './nudges.ts';

/*
 * Story 25.3 (M03), "25.3-WEB": a local commit asks for a sync cycle through one place (`db/commit.ts`), coalesced in
 * a 2 s window; the app coming back to the front asks too. The engine's own `nudge` does nothing offline, paused or
 * stopped (`engine.test.ts`, E6-Q14).
 */

/** A clock the test moves by hand. */
function handClock(): { timers: Timers; advance(ms: number): void; pending(): number } {
  let now = 0;
  let seq = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  return {
    timers: {
      setTimeout(run, ms) {
        const id = ++seq;
        due.set(id, { at: now + ms, run });
        return id;
      },
      clearTimeout(handle) {
        due.delete(handle as number);
      },
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const next = [...due.entries()].filter(([, entry]) => entry.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (next === undefined) break;
        now = next[1].at;
        due.delete(next[0]);
        next[1].run();
      }
      now = target;
    },
    pending: () => due.size,
  };
}

describe('25.3-WEB the commit window', () => {
  it('ten commits within one second ask for one cycle, two seconds after the first; the window is not restarted', () => {
    const clock = handClock();
    const nudge = vi.fn();
    const stop = followCommits(nudge, clock.timers);
    for (let i = 0; i < 10; i++) {
      announceCommit();
      clock.advance(100);
    }
    expect(nudge).not.toHaveBeenCalled();
    clock.advance(COMMIT_SYNC_WINDOW_MS - 1_000);
    expect(nudge).toHaveBeenCalledTimes(1);
    // A commit after the window opens a new one.
    announceCommit();
    clock.advance(COMMIT_SYNC_WINDOW_MS);
    expect(nudge).toHaveBeenCalledTimes(2);
    stop();
  });

  it('continuous commits, one every 300 ms for 10 s, are never starved: one nudge per window', () => {
    const clock = handClock();
    const nudge = vi.fn();
    const stop = followCommits(nudge, clock.timers);
    for (let t = 0; t < 10_000; t += 300) {
      announceCommit();
      clock.advance(300);
    }
    expect(nudge.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(nudge.mock.calls.length).toBeLessThanOrEqual(5);
    stop();
  });

  it('the window is 2 s, and a stopped follower (no provider) leaves no timer and asks nothing', () => {
    expect(COMMIT_SYNC_WINDOW_MS).toBe(2_000);
    const clock = handClock();
    const nudge = vi.fn();
    const stop = followCommits(nudge, clock.timers);
    announceCommit();
    stop();
    expect(clock.pending()).toBe(0);
    clock.advance(10_000);
    expect(nudge).not.toHaveBeenCalled();
    // With no listener at all, an announcement is a no-op.
    expect(() => announceCommit()).not.toThrow();
  });

  it('a listener that throws never reaches the write', () => {
    const stop = onCommit(() => {
      throw new Error('boom');
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => announceCommit()).not.toThrow();
    error.mockRestore();
    stop();
  });
});

describe('25.3-WEB the app coming back to the front', () => {
  it('a visibilitychange to visible nudges once; to hidden it does not', () => {
    const nudge = vi.fn();
    let state: DocumentVisibilityState = 'hidden';
    const target = new EventTarget() as Document;
    Object.defineProperty(target, 'visibilityState', { get: () => state });
    const stop = followVisible(nudge, target);
    target.dispatchEvent(new Event('visibilitychange'));
    expect(nudge).not.toHaveBeenCalled();
    state = 'visible';
    target.dispatchEvent(new Event('visibilitychange'));
    expect(nudge).toHaveBeenCalledTimes(1);
    stop();
    target.dispatchEvent(new Event('visibilitychange'));
    expect(nudge).toHaveBeenCalledTimes(1);
  });
});

let userCounter = 0;
async function freshDb(): Promise<AppDatabase> {
  const user = `019966b0-0253-7000-8000-${(++userCounter).toString(16).padStart(12, '0')}`;
  const db = openDatabase(user);
  await db.delete();
  return openDatabase(user);
}

function ids(prefix = '019966b0-0254-7000-8000-') {
  let n = 0;
  return () => `${prefix}${(++n).toString(16).padStart(12, '0')}`;
}

const draft = (value: string): OpInput => ({
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
  device_id: 'ignored',
});

describe('25.3-WEB every committed transaction announces itself once, from db/commit.ts', () => {
  it('commitBatch, commitOps, a writing commitBatchIf and commitFileBatch announce once each; a commitBatchIf that wrote nothing is silent', async () => {
    const db = await freshDb();
    // The fixture up to its block creates, so the sheet puts have a target.
    const upTo = replaySmall.log.findIndex((op) => op.path === `block/${BLOCK_1_ID}` && op.kind === 'create');
    await commitOps(db, replaySmall.log.slice(0, upTo + 1));
    const heard = vi.fn();
    const stop = onCommit(heard);
    const newId = ids();
    const now = () => new Date('2026-11-11T12:00:00.000Z');
    await commitBatch(db, [draft('A'), draft('B')], { newId, now });
    expect(heard).toHaveBeenCalledTimes(1);
    const op = makeOp(draft('C'), { newId, now: now() });
    await commitOps(db, [op], { newId });
    expect(heard).toHaveBeenCalledTimes(2);
    expect(await commitBatchIf(db, async () => false, [draft('D')], { newId, now })).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    expect(await commitBatchIf(db, async () => true, [draft('E')], { newId, now })).not.toBeNull();
    expect(heard).toHaveBeenCalledTimes(3);
    const fileId = '019966b0-0000-7000-8000-0000000025f1';
    await commitFileBatch(
      db,
      {
        ops: [
          {
            kind: 'create',
            scope: 'company',
            company_id: COMPANY_ID,
            relatorio_id: null,
            project_id: null,
            prev_op_id: null,
            batch_id: null,
            meta: null,
            path: `file/${fileId}`,
            value: { id: fileId, company_id: COMPANY_ID, relatorio_id: null, kind: 'certificate', sha256: 'abc', mime: 'application/pdf', size: 4, uploaded_at: null, variants: null, removed_at: null },
            actor_id: USER_ID,
          },
        ],
        blob: new Blob(['abcd']),
        fileId,
      },
      { newId, now },
    );
    expect(heard).toHaveBeenCalledTimes(4);
    stop();
    db.close();
  });
});
