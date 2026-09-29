// @vitest-environment node
import { opLog } from '@app/domain/fixtures/replay-small';
import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  batches,
  classifyFailure,
  classifyUploadFailure,
  isUnreachableFailure,
  MAX_ATTEMPTS,
  parsePulled,
  unreachableCause,
} from './policy.ts';

describe('1.5-UNIT-002 retry classification', () => {
  it('retries network and 5xx with backoff and jitter', () => {
    expect(classifyFailure({ kind: 'network' })).toBe('retry');
    expect(classifyFailure({ kind: 'http', status: 500, code: 'internal_error' })).toBe('retry');
    expect(classifyFailure({ kind: 'http', status: 503 })).toBe('retry');
    expect(MAX_ATTEMPTS).toBe(3);
    expect(backoffMs(1, () => 0)).toBe(1000);
    expect(backoffMs(2, () => 0)).toBe(2000);
    expect(backoffMs(3, () => 0)).toBe(4000);
    expect(backoffMs(1, () => 1)).toBe(1250);
    expect(backoffMs(3, () => 0.5)).toBe(4500);
  });

  it('calls the server unreachable only for a transport failure or a 5xx (retro U5)', () => {
    expect(isUnreachableFailure({ kind: 'network' })).toBe(true);
    expect(isUnreachableFailure({ kind: 'http', status: 502 })).toBe(true);
    expect(isUnreachableFailure({ kind: 'http', status: 503 })).toBe(true);
    expect(isUnreachableFailure({ kind: 'http', status: 404, code: 'relatorio_not_found' })).toBe(false);
    expect(isUnreachableFailure({ kind: 'http', status: 426 })).toBe(false);
    expect(isUnreachableFailure({ kind: 'apply' })).toBe(false);
  });

  it('names the cause the badge and Sync status report: session first, then the server', () => {
    expect(unreachableCause({ reAuthRequired: false, lastFailure: null })).toBeNull();
    expect(unreachableCause({ reAuthRequired: false, lastFailure: { kind: 'network' } })).toBe('server');
    expect(unreachableCause({ reAuthRequired: false, lastFailure: { kind: 'http', status: 503 } })).toBe('server');
    expect(unreachableCause({ reAuthRequired: false, lastFailure: { kind: 'http', status: 404 } })).toBeNull();
    expect(unreachableCause({ reAuthRequired: true, lastFailure: null })).toBe('session');
    expect(unreachableCause({ reAuthRequired: true, lastFailure: { kind: 'network' } })).toBe('session');
  });

  it('never retries a 4xx, except 401 (re-auth) and 426 (outdated)', () => {
    expect(classifyFailure({ kind: 'http', status: 400, code: 'sync_batch_invalid' })).toBe('stop');
    expect(classifyFailure({ kind: 'http', status: 403 })).toBe('stop');
    expect(classifyFailure({ kind: 'http', status: 404, code: 'relatorio_not_found' })).toBe('stop');
    expect(classifyFailure({ kind: 'http', status: 401, code: 'unauthenticated' })).toBe('reauth');
    expect(classifyFailure({ kind: 'http', status: 426, code: 'contract_outdated' })).toBe('outdated');
    expect(classifyFailure({ kind: 'http', status: 200, code: 'invalid_response' })).toBe('stop');
  });

  it('stops on a page the device could not apply (no retry against the same page)', () => {
    expect(classifyFailure({ kind: 'apply' })).toBe('stop');
  });
});

describe('1.5-UNIT-003 push batching', () => {
  it('splits 501 ops into two requests in apply order', () => {
    const ops = Array.from({ length: 501 }, (_, i) => ({ i, batch_id: null }));
    const split = batches(ops, 500);
    expect(split.map((b) => b.length)).toEqual([500, 1]);
    expect(split[0]![0]!.i).toBe(0);
    expect(split[0]![499]!.i).toBe(499);
    expect(split[1]![0]!.i).toBe(500);
    expect(batches([], 500)).toEqual([]);
  });

  it('ledger 1161: never splits a client batch across pushes, unless the batch alone is over the limit', () => {
    const single = (i: number) => ({ i, batch_id: null as string | null });
    const inBatch = (i: number, batch: string) => ({ i, batch_id: batch });
    // 3 singles, then a batch of 3 that would straddle a 4-op limit.
    const queue = [single(0), single(1), single(2), inBatch(3, 'b'), inBatch(4, 'b'), inBatch(5, 'b')];
    expect(batches(queue, 4).map((b) => b.map((x) => x.i))).toEqual([[0, 1, 2], [3, 4, 5]]);
    // A batch's ops travel together at the position of its first op, even when interleaved.
    const interleaved = [inBatch(0, 'b'), single(1), inBatch(2, 'b')];
    expect(batches(interleaved, 500).map((b) => b.map((x) => x.i))).toEqual([[0, 2, 1]]);
    // A batch over the limit is cut in limit-sized chunks.
    const big = Array.from({ length: 5 }, (_, i) => inBatch(i, 'big'));
    expect(batches([single(9), ...big], 2).map((b) => b.map((x) => x.i))).toEqual([[9], [0, 1], [2, 3], [4]]);
  });
});

describe('1.5-UNIT-004 pull parsing', () => {
  it('stops before the first op it cannot parse and keeps the ones before it', () => {
    const [ok1, ok2, ok3] = opLog;
    const bad = { ...ok3!, path: 'nonsense/family' };
    const parsed = parsePulled([ok1, ok2, bad, ok3]);
    expect(parsed.ops.map((o) => o.op_id)).toEqual([ok1!.op_id, ok2!.op_id]);
    expect(parsed.stoppedAt).toBe(2);
  });

  it('treats an op without seq as unparseable and parses a clean page whole', () => {
    const [ok1, ok2] = opLog;
    expect(parsePulled([{ ...ok1!, seq: undefined }])).toEqual({ ops: [], stoppedAt: 0 });
    const clean = parsePulled([ok1, ok2]);
    expect(clean.stoppedAt).toBeUndefined();
    expect(clean.ops).toHaveLength(2);
  });
});

describe('2.2-UNIT-004 upload retry classification', () => {
  it('defers 409 file_row_missing to the next cycle instead of killing the file', () => {
    expect(classifyUploadFailure({ kind: 'http', status: 409, code: 'file_row_missing' })).toBe('defer');
  });

  it('never retries a verdict no retry can change', () => {
    expect(classifyUploadFailure({ kind: 'http', status: 409, code: 'file_sha_mismatch' })).toBe('permanent');
    expect(classifyUploadFailure({ kind: 'http', status: 413, code: 'file_too_large' })).toBe('permanent');
    expect(classifyUploadFailure({ kind: 'http', status: 400, code: 'file_kind_invalid' })).toBe('permanent');
  });

  it('retries a 200 whose body is not the contract shape', () => {
    // A mangled proxy response is not a verdict on the file.
    expect(classifyUploadFailure({ kind: 'http', status: 200, code: 'invalid_response' })).toBe('retry');
  });

  it('follows the sync table everywhere else', () => {
    expect(classifyUploadFailure({ kind: 'network' })).toBe('retry');
    expect(classifyUploadFailure({ kind: 'http', status: 503 })).toBe('retry');
    expect(classifyUploadFailure({ kind: 'http', status: 401 })).toBe('reauth');
    expect(classifyUploadFailure({ kind: 'http', status: 426 })).toBe('outdated');
  });
});
