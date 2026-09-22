import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  SYNC_ROUTES,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type Op,
  type SyncPullResponse,
  type SyncPushResponse,
  type SyncRoute,
} from '@app/domain';

/** The part of a zod schema the client uses; apps/web does not depend on zod itself. */
interface ResponseSchema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false };
}

/*
 * AD-13: the one client of the three sync routes. Requests are built from the
 * contract's route table and carry `CONTRACT_VERSION`; every answer is
 * validated with the contract schemas; every failure is a `SyncFailure` the
 * policy can classify.
 */

/**
 * `network`: the request never completed. `http`: the server answered, with the envelope
 * code when it sent one. `apply`: a pulled page could not be applied on the device (a row
 * the schema refuses, a closed database); raised by the engine, never by this client.
 */
export type SyncFailure =
  | { kind: 'network' }
  | { kind: 'http'; status: number; code?: string }
  | { kind: 'apply' };

function describe(failure: SyncFailure): string {
  switch (failure.kind) {
    case 'network':
      return 'network failure';
    case 'http':
      return `http ${failure.status} ${failure.code ?? ''}`.trim();
    case 'apply':
      return 'pulled page could not be applied';
  }
}

export class SyncRequestError extends Error {
  readonly failure: SyncFailure;
  constructor(failure: SyncFailure) {
    super(describe(failure));
    this.name = 'SyncRequestError';
    this.failure = failure;
  }
}

export interface SyncClient {
  pushOps(ops: readonly Op[]): Promise<SyncPushResponse>;
  pullCompany(since: number): Promise<SyncPullResponse>;
  pullRelatorio(id: string, since: number): Promise<SyncPullResponse>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** The client over the browser's `fetch`; built here because only `src/sync` may call the network (AD-1). */
export function createBrowserSyncClient(): SyncClient {
  return createSyncClient({ fetch: (input, init) => fetch(input, init) });
}

export function createSyncClient(deps: { fetch: FetchLike }): SyncClient {
  async function request<T>(route: SyncRoute, schema: ResponseSchema<T>, query?: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await deps.fetch(query ? `${route.path}?${query}` : route.path, {
        method: route.method,
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new SyncRequestError({ kind: 'network' });
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = undefined;
    }
    if (!response.ok) {
      const envelope = errorResponseSchema.safeParse(json);
      throw new SyncRequestError({
        kind: 'http',
        status: response.status,
        ...(envelope.success ? { code: envelope.data.code } : {}),
      });
    }
    const parsed = schema.safeParse(json);
    // A 2xx whose body is not the contract shape is a server fault worth no retry.
    if (!parsed.success) throw new SyncRequestError({ kind: 'http', status: response.status, code: 'invalid_response' });
    return parsed.data;
  }

  return {
    pushOps: (ops) => request(SYNC_ROUTES.pushOps, syncPushResponseSchema, undefined, { ops }),
    pullCompany: (since) => request(SYNC_ROUTES.pullCompany, syncPullResponseSchema, `since=${since}`),
    pullRelatorio: (id, since) => request(SYNC_ROUTES.pullRelatorio(id), syncPullResponseSchema, `since=${since}`),
  };
}
