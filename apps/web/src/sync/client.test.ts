// @vitest-environment node
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, contractExamples, GENERATE_ROUTES, SYNC_PUSH_MAX_BYTES, SYNC_ROUTES, type Op } from '@app/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSyncClient, fileBodyTimeoutMs, requestHeadersTimeoutMs, revisionDocxUrl, revisionPdfUrl, SYNC_REQUEST_BODY_SHARE_MAX_MS, SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S, SYNC_REQUEST_TIMEOUT_MS, SyncRequestError, type FetchLike, type SyncFailure } from './client.ts';

/*
 * The real client over a captured `fetch`: request building from the contract's route
 * table and failure mapping. The contract examples are the fixtures (ADR readiness 1.4).
 */

interface Captured {
  input: string;
  init: RequestInit;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function capturing(respond: () => Response | Promise<Response>): { calls: Captured[]; fetch: FetchLike } {
  const calls: Captured[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ input, init });
      return respond();
    },
  };
}

async function failureOf(promise: Promise<unknown>): Promise<SyncFailure> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SyncRequestError);
    return (error as SyncRequestError).failure;
  }
  throw new Error('expected the call to fail');
}

const ops = contractExamples.pushRequest.valid.ops as unknown as Op[];

describe('sync client requests', () => {
  it('pushes through POST /api/sync/ops with the contract header, same-origin credentials and a JSON {ops} body', async () => {
    const { calls, fetch } = capturing(() => json(contractExamples.pushResponse.valid));
    const client = createSyncClient({ fetch });
    const response = await client.pushOps(ops);
    expect(response).toEqual(contractExamples.pushResponse.valid);
    expect(calls).toHaveLength(1);
    const { input, init } = calls[0]!;
    expect(input).toBe(SYNC_ROUTES.pushOps.path);
    expect(init.method).toBe(SYNC_ROUTES.pushOps.method);
    expect(init.credentials).toBe('same-origin');
    const headers = init.headers as Record<string, string>;
    expect(headers[CONTRACT_VERSION_HEADER]).toBe(String(CONTRACT_VERSION));
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ ops });
  });

  it('pulls the company and relatorio streams through GET with ?since= and no body', async () => {
    const { calls, fetch } = capturing(() => json(contractExamples.pullResponse.valid));
    const client = createSyncClient({ fetch });
    expect(await client.pullCompany(41)).toEqual(contractExamples.pullResponse.valid);
    expect(await client.pullRelatorio('abc', 7)).toEqual(contractExamples.pullResponse.valid);
    expect(await client.pullProject('def', 3)).toEqual(contractExamples.pullResponse.valid);
    expect(calls.map((c) => c.input)).toEqual([
      `${SYNC_ROUTES.pullCompany.path}?since=41`,
      `${SYNC_ROUTES.pullRelatorio('abc').path}?since=7`,
      `${SYNC_ROUTES.pullProject('def').path}?since=3`,
    ]);
    for (const { init } of calls) {
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('same-origin');
      expect((init.headers as Record<string, string>)[CONTRACT_VERSION_HEADER]).toBe(String(CONTRACT_VERSION));
      expect(init.body).toBeUndefined();
    }
  });
});

describe('sync client failures', () => {
  it('maps an HTTP error carrying the envelope to {kind: http, status, code}', async () => {
    const cases = [
      [401, 'unauthenticated'],
      [426, 'contract_outdated'],
      [503, 'internal_error'],
    ] as const;
    for (const [status, code] of cases) {
      const client = createSyncClient({ fetch: async () => json({ code, message: 'x' }, status) });
      expect(await failureOf(client.pullCompany(0))).toEqual({ kind: 'http', status, code });
    }
  });

  it('Story 20.12: a file upload refused 413 for the pixel limit carries the server\'s details', async () => {
    const details = { limit: 'pixels', max_pixels: 120_000_000 };
    const client = createSyncClient({ fetch: async () => json({ code: 'file_too_large', message: 'x', details }, 413) });
    expect(await failureOf(client.uploadFile('019966b0-0000-7000-8000-000000000001', new Blob(['x'], { type: 'image/jpeg' }), 'ab'.repeat(32)))).toEqual({
      kind: 'http',
      status: 413,
      code: 'file_too_large',
      details,
    });
  });

  it('maps an HTTP error without a parseable envelope to {kind: http, status} and a rejected fetch to network', async () => {
    const bare = createSyncClient({ fetch: async () => new Response('gateway', { status: 502 }) });
    expect(await failureOf(bare.pushOps(ops))).toEqual({ kind: 'http', status: 502 });
    const invalidEnvelope = createSyncClient({ fetch: async () => json(contractExamples.errorResponse.invalid, 400) });
    expect(await failureOf(invalidEnvelope.pushOps(ops))).toEqual({ kind: 'http', status: 400 });
    const offline = createSyncClient({
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(await failureOf(offline.pullRelatorio('r', 0))).toEqual({ kind: 'network' });
  });

  it('generates through POST /api/relatorios/:id/generate: 202 queued and 200 unchanged parsed, a 409 rejected as not_caught_up (Story 4.8)', async () => {
    const body = { last_op_id: null, file_ids_expected: ['019966c1-0000-7000-8000-0000000000f1'] };
    const queued = { outcome: 'queued', job_id: '019966c1-0000-7000-8000-0000000000e1', revision_number: 1 };
    const { calls, fetch } = capturing(() => json(queued, 202));
    const client = createSyncClient({ fetch });
    expect(await client.generate('019966c1-0000-7000-8000-000000000007', body)).toEqual(queued);
    expect(calls[0]!.input).toBe(GENERATE_ROUTES.generate('019966c1-0000-7000-8000-000000000007').path);
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(body);
    expect((calls[0]!.init.headers as Record<string, string>)[CONTRACT_VERSION_HEADER]).toBe(String(CONTRACT_VERSION));

    const unchanged = { outcome: 'unchanged', revision_id: '019966c1-0000-7000-8000-0000000000a1', revision_number: 1 };
    expect(await createSyncClient({ fetch: async () => json(unchanged) }).generate('r', body)).toEqual(unchanged);

    const barrier = createSyncClient({ fetch: async () => json({ code: 'not_caught_up', message: 'x', details: { missing_op: true, missing_files: [] } }, 409) });
    expect(await failureOf(barrier.generate('r', body))).toEqual({
      kind: 'http',
      status: 409,
      code: 'not_caught_up',
      details: { missing_op: true, missing_files: [] },
    });

    expect(revisionDocxUrl('019966c1-0000-7000-8000-0000000000a1')).toBe('/api/revisions/019966c1-0000-7000-8000-0000000000a1/docx');
    expect(revisionPdfUrl('019966c1-0000-7000-8000-0000000000a1')).toBe('/api/revisions/019966c1-0000-7000-8000-0000000000a1/pdf');
  });

  it('treats a 2xx whose body is not the contract shape as invalid_response, never a retry', async () => {
    const push = createSyncClient({ fetch: async () => json(contractExamples.pushResponse.invalid) });
    expect(await failureOf(push.pushOps(ops))).toEqual({ kind: 'http', status: 200, code: 'invalid_response' });
    const pull = createSyncClient({ fetch: async () => json(contractExamples.pullResponse.invalid) });
    expect(await failureOf(pull.pullCompany(0))).toEqual({ kind: 'http', status: 200, code: 'invalid_response' });
    const empty = createSyncClient({ fetch: async () => new Response(null, { status: 204 }) });
    expect(await failureOf(empty.pullCompany(0))).toEqual({ kind: 'http', status: 204, code: 'invalid_response' });
  });
});

describe('e24f-UNIT a JSON request whose answer never comes (E23-A4, 4.8-E2E-005)', () => {
  /** A fetch whose answer never comes; it rejects only once its signal aborts, as the browser's does. */
  const hanging = (calls: RequestInit[]): FetchLike => async (_input, init) => {
    calls.push(init);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the wait for the headers ends in network after SYNC_REQUEST_TIMEOUT_MS, plus the body at the floor uplink rate, and not before', async () => {
    vi.useFakeTimers();
    const calls: RequestInit[] = [];
    const client = createSyncClient({ fetch: hanging(calls) });
    const generateBody = { last_op_id: null, file_ids_expected: [] };
    const cases: [() => Promise<unknown>, number][] = [
      [() => client.pullRelatorio('r', 0), SYNC_REQUEST_TIMEOUT_MS],
      [() => client.pushOps(ops), requestHeadersTimeoutMs(bytes({ ops }))],
      [() => client.generate('r', generateBody), requestHeadersTimeoutMs(bytes(generateBody))],
    ];
    for (const [call, bound] of cases) {
      let settled: SyncFailure | null = null;
      const failure = failureOf(call()).then((one) => (settled = one));
      await vi.advanceTimersByTimeAsync(bound - 1);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(await failure).toEqual({ kind: 'network' });
    }
    expect(calls.every((init) => init.signal instanceof AbortSignal)).toBe(true);
  });

  it('fix batch e24x (B1): the body at the 1 KB/s floor; a body-less request 60 s', () => {
    expect(SYNC_REQUEST_FLOOR_UPLINK_BYTES_PER_S).toBe(1024);
    // ~~4 MiB at 1 KB/s is 4 156 s, about 69 min~~ (review of e24x: the body's share stops at 300 s, the test above).
    expect(requestHeadersTimeoutMs(200 * 1024)).toBe(SYNC_REQUEST_TIMEOUT_MS + 200_000);
    expect(requestHeadersTimeoutMs(0)).toBe(SYNC_REQUEST_TIMEOUT_MS);
    expect(SYNC_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it('review of e24x: the body\'s share of the bound stops at 300 s, the server\'s whole-request limit; one attempt at most 360 s', () => {
    expect(SYNC_REQUEST_BODY_SHARE_MAX_MS).toBe(300_000);
    expect(requestHeadersTimeoutMs(300 * 1024)).toBe(360_000);
    expect(requestHeadersTimeoutMs(301 * 1024)).toBe(360_000);
    expect(requestHeadersTimeoutMs(SYNC_PUSH_MAX_BYTES)).toBe(360_000);
    expect(requestHeadersTimeoutMs(100 * 1024)).toBe(SYNC_REQUEST_TIMEOUT_MS + 100_000);
  });

  it('fix batch e24x (B1): a 300 KB push on a 2 KB/s uplink is never aborted before its upload (about 150 s) and the server\'s time', async () => {
    const body = 300 * 1024;
    const upload = (body / (2 * 1024)) * 1000;
    expect(upload).toBe(150_000);
    // The bound covers the upload with the 60 s for the server on top: 360 s.
    expect(requestHeadersTimeoutMs(body)).toBe(360_000);
    expect(requestHeadersTimeoutMs(body)).toBeGreaterThanOrEqual(upload + SYNC_REQUEST_TIMEOUT_MS);
    // Through the client: a push of that size whose answer is late (200 s) is not aborted.
    vi.useFakeTimers();
    const calls: RequestInit[] = [];
    const client = createSyncClient({ fetch: hanging(calls) });
    const big = [{ ...ops[0]!, value: 'x'.repeat(body) }] as unknown as typeof ops;
    let settled: SyncFailure | null = null;
    const failure = failureOf(client.pushOps(big)).then((one) => (settled = one));
    await vi.advanceTimersByTimeAsync(200_000);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(requestHeadersTimeoutMs(bytes({ ops: big })) - 200_000);
    expect(await failure).toEqual({ kind: 'network' });
  });

  it('once the headers came, a slow body is never cut and the timer is gone', async () => {
    vi.useFakeTimers();
    let finish: (value: unknown) => void = () => undefined;
    const slow = createSyncClient({
      fetch: async () =>
        ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: () => new Promise((resolve) => (finish = resolve)),
        }) as unknown as Response,
    });
    const answer = slow.pullCompany(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10 * SYNC_REQUEST_TIMEOUT_MS);
    finish(contractExamples.pullResponse.valid);
    await expect(answer).resolves.toEqual(contractExamples.pullResponse.valid);
  });
});

describe('the server clock (e20f)', () => {
  const DATE = 'Wed, 04 Nov 2026 07:49:09 GMT';
  function clocked(respond: () => Response) {
    let t = 1_000;
    const heard: Array<[string | null, number, number]> = [];
    const client = createSyncClient({
      fetch: async () => {
        t += 250;
        return respond();
      },
      rawNowMs: () => t,
      onServerDate: (date, sent, received) => heard.push([date, sent, received]),
    });
    return { client, heard };
  }

  it('reports the Date header of every answer, 2xx or not, with the raw send and receive instants', async () => {
    const ok = clocked(() => new Response(JSON.stringify(contractExamples.pushResponse.valid), { status: 200, headers: { date: DATE } }));
    await ok.client.pushOps(ops);
    expect(ok.heard).toEqual([[DATE, 1_000, 1_250]]);

    const refused = clocked(() => new Response(JSON.stringify({ code: 'not_caught_up', message: 'x' }), { status: 409, headers: { date: DATE } }));
    await failureOf(refused.client.generate('r', { kind: 'issue' } as never));
    expect(refused.heard).toEqual([[DATE, 1_000, 1_250]]);

    const upload = clocked(() => new Response('{}', { status: 413, headers: { date: DATE } }));
    await failureOf(upload.client.uploadFile('f', new Blob(['x']), 'a'.repeat(64)));
    expect(upload.heard).toEqual([[DATE, 1_000, 1_250]]);

    const bare = clocked(() => new Response(JSON.stringify(contractExamples.pullResponse.valid), { status: 200 }));
    await bare.client.pullCompany(0);
    expect(bare.heard).toEqual([[null, 1_000, 1_250]]);
  });

  it('a network failure reports nothing, and a listener that throws never fails the request', async () => {
    const heard: unknown[] = [];
    const offline = createSyncClient({
      fetch: async () => {
        throw new TypeError('offline');
      },
      rawNowMs: () => 0,
      onServerDate: (...args) => heard.push(args),
    });
    expect(await failureOf(offline.pullCompany(0))).toEqual({ kind: 'network' });
    expect(heard).toEqual([]);
    const throwing = createSyncClient({
      fetch: async () => json(contractExamples.pullResponse.valid),
      rawNowMs: () => 0,
      onServerDate: () => {
        throw new Error('boom');
      },
    });
    await expect(throwing.pullCompany(0)).resolves.toBeDefined();
  });
});

describe('25.3-WEB a file transfer whose answer never comes', () => {
  /** A fetch whose answer never comes; it rejects only once its signal aborts, as the browser's does. */
  const hanging = (calls: RequestInit[]): FetchLike => async (_input, init) => {
    calls.push(init);
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Advances to one millisecond before `bound`, checks nothing settled, then to the bound: a `network` failure. */
  async function endsAt(call: Promise<unknown>, bound: number): Promise<void> {
    let settled: SyncFailure | null = null;
    const failure = failureOf(call).then((one) => (settled = one));
    await vi.advanceTimersByTimeAsync(bound - 1);
    expect(settled).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toEqual({ kind: 'network' });
  }

  it('an upload is aborted at the JSON requests\' bound over the file\'s size, and not before', async () => {
    vi.useFakeTimers();
    const calls: RequestInit[] = [];
    const client = createSyncClient({ fetch: hanging(calls) });
    const blob = new Blob([new Uint8Array(200 * 1024)]);
    await endsAt(client.uploadFile('f', blob, 'a'.repeat(64)), requestHeadersTimeoutMs(blob.size));
    expect(requestHeadersTimeoutMs(blob.size)).toBe(SYNC_REQUEST_TIMEOUT_MS + 200_000);
    expect(calls[0]!.signal).toBeInstanceOf(AbortSignal);
  });

  it('a 4 MiB photo waits at most 60 + 300 s', async () => {
    vi.useFakeTimers();
    const client = createSyncClient({ fetch: hanging([]) });
    await endsAt(client.uploadFile('f', new Blob([new Uint8Array(4 * 1024 * 1024)]), 'a'.repeat(64)), SYNC_REQUEST_TIMEOUT_MS + SYNC_REQUEST_BODY_SHARE_MAX_MS);
  });

  it('a download whose headers never come is aborted after SYNC_REQUEST_TIMEOUT_MS; so is a reading\'s retry', async () => {
    vi.useFakeTimers();
    const client = createSyncClient({ fetch: hanging([]) });
    await endsAt(client.fetchFile('f', 'thumb'), SYNC_REQUEST_TIMEOUT_MS);
    await endsAt(client.rereadPhoto('p'), SYNC_REQUEST_TIMEOUT_MS);
  });

  it('a download whose body stalls is aborted at the bound of its Content-Length, or at 60 + 300 s when none is given', async () => {
    vi.useFakeTimers();
    const stalled = (length: string | null): FetchLike => async (_input, init) =>
      ({
        ok: true,
        status: 200,
        headers: new Headers(length === null ? {} : { 'content-length': length }),
        blob: () =>
          new Promise<Blob>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      }) as unknown as Response;
    expect(fileBodyTimeoutMs('102400')).toBe(SYNC_REQUEST_TIMEOUT_MS + 100_000);
    expect(fileBodyTimeoutMs(null)).toBe(SYNC_REQUEST_TIMEOUT_MS + SYNC_REQUEST_BODY_SHARE_MAX_MS);
    await endsAt(createSyncClient({ fetch: stalled('102400') }).fetchFile('f', 'original'), fileBodyTimeoutMs('102400'));
    await endsAt(createSyncClient({ fetch: stalled(null) }).fetchFile('f', 'original'), fileBodyTimeoutMs(null));
  });

  it('a transfer that answers in time keeps its answer and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const client = createSyncClient({ fetch: async () => new Response('bytes', { status: 200, headers: { 'content-length': '5' } }) });
    const blob = await client.fetchFile('f', 'thumb');
    expect(await blob.text()).toBe('bytes');
    expect(vi.getTimerCount()).toBe(0);
  });
});
