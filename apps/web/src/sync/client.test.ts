import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, contractExamples, GENERATE_ROUTES, SYNC_ROUTES, type Op } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { createSyncClient, revisionDocxUrl, SyncRequestError, type FetchLike, type SyncFailure } from './client.ts';

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
    expect(await failureOf(barrier.generate('r', body))).toEqual({ kind: 'http', status: 409, code: 'not_caught_up' });

    expect(revisionDocxUrl('019966c1-0000-7000-8000-0000000000a1')).toBe('/api/revisions/019966c1-0000-7000-8000-0000000000a1/docx');
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
