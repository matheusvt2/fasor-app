import { COMPANY_ID, RELATORIO_ID, USER_ID, BLOCK_1_ID } from '@app/domain/fixtures/replay-small';
import type { Op, SyncPushResponse } from '@app/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PhotoCaptureInput } from '../db/file-commit.ts';
import { createCaptureRescue, isQuotaError, reserveDirectSeq, sendPhotoDirect, type RescueDeps } from './capture-rescue.ts';

/*
 * 6.2-UNIT: the browser-refusal path of FR-57. Online, a refused shot goes straight to the
 * server; offline, it is held in memory and tried again once per trigger.
 */

const quota = () => Object.assign(new Error('quota'), { name: 'AbortError', inner: Object.assign(new Error('full'), { name: 'QuotaExceededError' }) });

function input(fileId: string): PhotoCaptureInput {
  return {
    companyId: COMPANY_ID,
    relatorioId: RELATORIO_ID,
    actorId: USER_ID,
    fileId,
    blockId: BLOCK_1_ID,
    itemKey: null,
    caption: null,
    capturedAt: '2026-09-25T11:00:00.000Z',
    tzOffset: -180,
    coords: null,
    original: new Blob(['o']),
    thumb: new Blob(['t']),
    sha256: 'ab',
  };
}

function deps(overrides: Partial<RescueDeps> = {}): RescueDeps & { committed: string[]; sent: string[] } {
  const committed: string[] = [];
  const sent: string[] = [];
  return {
    committed,
    sent,
    isOnline: () => false,
    commit: async (shot) => {
      committed.push(shot.fileId);
    },
    sendDirect: async (shot) => {
      sent.push(shot.fileId);
    },
    ...overrides,
  };
}

describe('6.2-UNIT-008 isQuotaError', () => {
  it('finds the quota refusal however Dexie wrapped it', () => {
    expect(isQuotaError(quota())).toBe(true);
    expect(isQuotaError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(true);
    expect(isQuotaError(Object.assign(new Error('x'), { cause: { name: 'QuotaExceededError' } }))).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe('6.2-UNIT-009 the capture rescue', () => {
  it('saves normally when the device takes the shot', async () => {
    const rescue = createCaptureRescue();
    const d = deps();
    expect(await rescue.save(input('a'), d)).toBe('saved');
    expect(d.committed).toEqual(['a']);
    expect(rescue.heldCount()).toBe(0);
  });

  it('online, a refused shot goes straight to the server', async () => {
    const rescue = createCaptureRescue();
    const d = deps({ isOnline: () => true, commit: async () => Promise.reject(quota()) });
    expect(await rescue.save(input('a'), d)).toBe('sent');
    expect(d.sent).toEqual(['a']);
    expect(rescue.heldCount()).toBe(0);
  });

  it('offline, a refused shot is held and tried again once per trigger until it lands', async () => {
    const rescue = createCaptureRescue();
    let refuse = true;
    const committed: string[] = [];
    const d = deps({
      commit: async (shot) => {
        if (refuse) throw quota();
        committed.push(shot.fileId);
      },
    });
    expect(await rescue.save(input('a'), d)).toBe('held');
    expect(rescue.heldCount()).toBe(1);
    expect(await rescue.retryHeld(d)).toBe(1);
    refuse = false;
    expect(await rescue.retryHeld(d)).toBe(0);
    expect(committed).toEqual(['a']);
  });

  it('keeps holding when the direct send fails too, and never swallows another error', async () => {
    const rescue = createCaptureRescue();
    const failing = deps({ isOnline: () => true, commit: async () => Promise.reject(quota()), sendDirect: async () => Promise.reject(new Error('503')) });
    expect(await rescue.save(input('a'), failing)).toBe('held');
    const broken = deps({ commit: async () => Promise.reject(new Error('bug')) });
    await expect(rescue.save(input('b'), broken)).rejects.toThrow('bug');
  });
});

describe('6.2-UNIT-010 sendPhotoDirect', () => {
  it('pushes the photo create and PUTs the bytes, in that order', async () => {
    const calls: string[] = [];
    let pushed: Op | undefined;
    const client = {
      pushOps: vi.fn(async (ops: readonly Op[]): Promise<SyncPushResponse> => {
        calls.push('push');
        pushed = ops[0];
        return { applied: ops.map((op, i) => ({ op_id: op.op_id, seq: i + 1 })), rejected: [], superseded: [] };
      }),
      uploadFile: vi.fn(async (id: string) => {
        calls.push(`put:${id}`);
        return { id, uploaded_at: '2026-09-25T12:00:00.000Z', variants: null };
      }),
    };
    let n = 0;
    await sendPhotoDirect(input('019966b0-0000-7000-8000-0000000006a1'), {
      client,
      deviceId: 'tablet-a',
      localSeq: 7,
      newId: () => `019966b0-0077-7000-8000-${String(++n).padStart(12, '0')}`,
      now: new Date('2026-09-25T12:00:00.000Z'),
    });
    expect(calls).toEqual(['push', 'put:019966b0-0000-7000-8000-0000000006a1']);
    expect(pushed).toMatchObject({ kind: 'create', scope: 'relatorio', path: 'file/019966b0-0000-7000-8000-0000000006a1', device_id: 'tablet-a' });
    expect((pushed!.value as { local_seq: number; kind: string }).local_seq).toBe(7);
  });

  it('throws when the server refused the create, and uploads nothing', async () => {
    const client = {
      pushOps: vi.fn(async (ops: readonly Op[]): Promise<SyncPushResponse> => ({ applied: [], rejected: [{ op_id: ops[0]!.op_id, code: 'op_invalid' }], superseded: [] })),
      uploadFile: vi.fn(),
    };
    let n = 0;
    await expect(
      sendPhotoDirect(input('019966b0-0000-7000-8000-0000000006a2'), {
        client,
        deviceId: 'tablet-a',
        localSeq: 1,
        newId: () => `019966b0-0078-7000-8000-${String(++n).padStart(12, '0')}`,
        now: new Date('2026-09-25T12:00:00.000Z'),
      }),
    ).rejects.toThrow();
    expect(client.uploadFile).not.toHaveBeenCalled();
  });
});

describe('6.2-UNIT-011 a direct send retried after its PUT failed', () => {
  it('pushes the create once and only re-PUTs the bytes on the retry', async () => {
    const pushes: string[] = [];
    let failPut = true;
    const client = {
      pushOps: vi.fn(async (ops: readonly Op[]): Promise<SyncPushResponse> => {
        pushes.push(ops[0]!.path);
        return { applied: ops.map((op, i) => ({ op_id: op.op_id, seq: i + 1 })), rejected: [], superseded: [] };
      }),
      uploadFile: vi.fn(async (id: string) => {
        if (failPut) throw new Error('network');
        return { id, uploaded_at: '2026-09-25T12:00:00.000Z', variants: null };
      }),
    };
    const applied = new Set<string>();
    let n = 0;
    const deps = { client, deviceId: 'tablet-a', localSeq: 3, newId: () => `019966b0-0079-7000-8000-${String(++n).padStart(12, '0')}`, now: new Date('2026-09-25T12:00:00.000Z'), applied };
    const shot = input('019966b0-0000-7000-8000-0000000006a3');
    await expect(sendPhotoDirect(shot, deps)).rejects.toThrow('network');
    failPut = false;
    await sendPhotoDirect(shot, deps);
    expect(pushes).toEqual(['file/019966b0-0000-7000-8000-0000000006a3']);
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
  });

  it('reserves a local_seq once per shot, never below one already issued', () => {
    const a = reserveDirectSeq('seq-a', 4);
    expect(a).toBe(5);
    expect(reserveDirectSeq('seq-a', 9)).toBe(5);
    // The store still says 4 (its write was refused): the next number is not 5 again.
    expect(reserveDirectSeq('seq-b', 4)).toBe(6);
  });
});

