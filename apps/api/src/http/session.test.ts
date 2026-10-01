import { errorResponseSchema } from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { createApp } from './app.ts';

/*
 * Review 2026-09-30, A-13: a session lookup that throws (the auth database down) is not an
 * anonymous request. A protected route answers a retriable 503 in the error envelope, logged
 * once for the request, while `/api/health` still answers; no cookie at all stays 401.
 */

const up = async () => undefined;
const probes = { db: up, queue: up, storage: up, libreoffice: up };
const db = {} as Db;
const s3 = {} as S3Client;

function appWith(getSession: () => Promise<unknown>) {
  const auth = { handler: async () => new Response(null, { status: 404 }), api: { getSession } } as unknown as Auth;
  return createApp({ probes, auth, db, s3, bucket: 'test', staticDir: '/nonexistent' });
}

afterEach(() => vi.restoreAllMocks());

describe('A-13 the session lookup failing', () => {
  it('answers a protected route 503 with the error envelope and logs the failure once', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = appWith(async () => {
      throw new Error('connect ECONNREFUSED postgres:5432');
    });
    const res = await app.request('/api/account');
    expect(res.status).toBe(503);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('internal_error');
    const lines = errors.mock.calls.map((args) => JSON.parse(String(args[0])) as { msg: string; error?: string });
    expect(lines.filter((line) => line.msg === 'session lookup failed')).toHaveLength(1);
    expect(lines.find((line) => line.msg === 'session lookup failed')?.error).toContain('ECONNREFUSED');
    expect(lines.some((line) => line.msg === 'unhandled route error')).toBe(false);
  });

  it('still answers /api/health', async () => {
    const app = appWith(async () => {
      throw new Error('connect ECONNREFUSED postgres:5432');
    });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
  });

  it('answers 401 when there is simply no session', async () => {
    const app = appWith(async () => null);
    const res = await app.request('/api/account');
    expect(res.status).toBe(401);
    expect(errorResponseSchema.parse(await res.json()).code).toBe('unauthenticated');
  });
});
