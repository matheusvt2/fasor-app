import {
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  errorResponseSchema,
  FILE_ROUTES,
  FILE_SHA256_HEADER,
  filePutResponseSchema,
  SYNC_ROUTES,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type FilePutResponse,
  type FileVariantName,
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
  /** AD-7: the uploader's only write; idempotent on `(id, sha256)` server-side. */
  uploadFile(id: string, blob: Blob, sha256: string): Promise<FilePutResponse>;
  /** AD-7: the only read, asked for by a surface — never by the cycle (AC 2.2-3). */
  fetchFile(id: string, variant: FileVariantName): Promise<Blob>;
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

  /** The binary sibling of `request`: no JSON body, the same `SyncFailure` on every path. */
  async function send(path: string, method: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await deps.fetch(path, {
        ...init,
        method,
        credentials: 'same-origin',
        headers: { [CONTRACT_VERSION_HEADER]: String(CONTRACT_VERSION), ...(init.headers as Record<string, string>) },
      });
    } catch {
      throw new SyncRequestError({ kind: 'network' });
    }
    if (!response.ok) {
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
      const envelope = errorResponseSchema.safeParse(json);
      throw new SyncRequestError({
        kind: 'http',
        status: response.status,
        ...(envelope.success ? { code: envelope.data.code } : {}),
      });
    }
    return response;
  }

  return {
    pushOps: (ops) => request(SYNC_ROUTES.pushOps, syncPushResponseSchema, undefined, { ops }),
    pullCompany: (since) => request(SYNC_ROUTES.pullCompany, syncPullResponseSchema, `since=${since}`),
    pullRelatorio: (id, since) => request(SYNC_ROUTES.pullRelatorio(id), syncPullResponseSchema, `since=${since}`),
    async uploadFile(id, blob, sha256) {
      const route = FILE_ROUTES.put(id);
      const response = await send(route.path, route.method, {
        body: blob,
        headers: {
          accept: 'application/json',
          'content-type': blob.type === '' ? 'application/octet-stream' : blob.type,
          [FILE_SHA256_HEADER]: sha256,
        },
      });
      let json: unknown;
      try {
        json = await response.json();
      } catch {
        json = undefined;
      }
      const parsed = filePutResponseSchema.safeParse(json);
      if (!parsed.success) throw new SyncRequestError({ kind: 'http', status: response.status, code: 'invalid_response' });
      return parsed.data;
    },
    async fetchFile(id, variant) {
      const route = FILE_ROUTES.get(id, variant);
      const response = await send(route.path, route.method, { headers: { accept: '*/*' } });
      return response.blob();
    },
  };
}
