import type { AddressInfo } from 'node:net';
import { request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import type { S3Client } from '@aws-sdk/client-s3';
import { serve } from '@hono/node-server';
import { SYNC_PUSH_MAX_BYTES } from '@app/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Auth } from '../auth/auth.ts';
import type { Db } from '../db/client.ts';
import { createApp } from './app.ts';

/*
 * E20-A1 (R-11, 2026-11-04): the push body cap on the wire, through the real `@hono/node-server`
 * on an ephemeral port, with the cross-site write guard on and a trusted origin. It pins what the
 * node server answers: a declared length one byte over `SYNC_PUSH_MAX_BYTES` with a slow body is
 * the JSON 413 `body_too_large`, answered before the body arrives, with no socket error while the
 * client keeps writing; a body of exactly `SYNC_PUSH_MAX_BYTES` is not refused 413. The auth and
 * the database are stubbed: no route reached here reads either.
 *
 * It does not guard e20e's header check in `app.ts` `bodyTooLarge`: with that check removed the
 * node server still answers the same way here (Hono's `bodyLimit` also answers from the declared
 * length). The 502 Caddy relayed in e20e needs Caddy in front, and stays on the VGR-1 ledger row
 * (`.scratch-e20e/caddy/check413-session.mjs`, outside the repository).
 */

const TRUSTED = 'https://conforme.test';
const up = async () => undefined;
const auth = {
  handler: async () => new Response(null, { status: 404 }),
  api: { getSession: async () => null },
} as unknown as Auth;

let server: Server;
let port = 0;

beforeAll(async () => {
  const app = createApp({ probes: { db: up, queue: up, storage: up, libreoffice: up }, auth, db: {} as Db, s3: {} as S3Client, bucket: 'test', originGuard: { trustedOrigins: [TRUSTED] } });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve()) as Server;
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface WireResult {
  status: number;
  contentType: string | undefined;
  body: string;
  /** The socket error the client saw while it wrote or read (a reset), or null. */
  socketError: string | null;
  /** Bytes written before the answer arrived. */
  writtenBeforeAnswer: number;
}

/**
 * A push that declares `declared` bytes and writes them `chunk` bytes at a time with `pauseMs`
 * between writes, as a slow uplink does. With `stopAfterAnswer`, it writes `extraChunks` more
 * after the answer has been read (a proxy still writing), then gives up on the rest.
 */
function slowPush(declared: number, options: { chunk: number; pauseMs: number; stopAfterAnswer: boolean; extraChunks?: number }): Promise<WireResult> {
  return new Promise((resolve, reject) => {
    let socketError: string | null = null;
    let written = 0;
    let answered = false;
    let writtenBeforeAnswer = 0;
    const req = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/api/sync/ops',
      headers: { origin: TRUSTED, 'content-type': 'application/json', 'content-length': String(declared) },
    });
    req.on('error', (error: NodeJS.ErrnoException) => {
      socketError = error.code ?? error.message;
      // Review loop 1: a socket error before the answer fails the test at once, never a hang.
      if (!answered) reject(new Error(`socket error before the answer: ${socketError}`));
    });
    const writeChunk = (size: number) =>
      new Promise<void>((done) => {
        if (req.destroyed) return done();
        req.write(Buffer.alloc(size, 0x20), () => done());
        written += size;
      });
    req.on('response', (res: IncomingMessage) => {
      answered = true;
      writtenBeforeAnswer = written;
      const chunks: Buffer[] = [];
      res.on('data', (data: Buffer) => chunks.push(data));
      res.on('error', (error: NodeJS.ErrnoException) => {
        socketError = error.code ?? error.message;
      });
      res.on('end', () => {
        void (async () => {
          if (options.stopAfterAnswer) {
            for (let i = 0; i < (options.extraChunks ?? 0) && written < declared; i++) {
              await writeChunk(Math.min(options.chunk, declared - written));
              await sleep(options.pauseMs);
            }
            await sleep(100);
          }
          const seen = socketError;
          req.destroy();
          resolve({ status: res.statusCode ?? 0, contentType: res.headers['content-type'], body: Buffer.concat(chunks).toString('utf8'), socketError: seen, writtenBeforeAnswer });
        })().catch(reject);
      });
    });
    void (async () => {
      while (written < declared && !answered && !req.destroyed) {
        await writeChunk(Math.min(options.chunk, declared - written));
        if (options.pauseMs > 0) await sleep(options.pauseMs);
      }
      if (!options.stopAfterAnswer && written >= declared) req.end();
    })().catch(reject);
  });
}

describe('E20-A1 (R-11) the push body cap through @hono/node-server', () => {
  it('a declared length one byte over SYNC_PUSH_MAX_BYTES with a slow body answers the JSON 413 body_too_large, and the socket is not reset while the client keeps writing', async () => {
    // After the answer the client writes for about 150 ms more, as a proxy still forwarding the
    // body does; the server drains what arrives and ends the socket cleanly later (a FIN, never a reset).
    const result = await slowPush(SYNC_PUSH_MAX_BYTES + 1, { chunk: 16 * 1024, pauseMs: 25, stopAfterAnswer: true, extraChunks: 6 });
    expect(result.status).toBe(413);
    expect(result.contentType).toMatch(/^application\/json/);
    expect(JSON.parse(result.body)).toMatchObject({ code: 'body_too_large' });
    // Answered from the header, long before the body could have arrived.
    expect(result.writtenBeforeAnswer).toBeLessThan(SYNC_PUSH_MAX_BYTES / 4);
    expect(result.socketError).toBeNull();
  }, 30_000);

  it('a body of exactly SYNC_PUSH_MAX_BYTES is not refused 413 (it reaches the route, which asks for a session)', async () => {
    const result = await slowPush(SYNC_PUSH_MAX_BYTES, { chunk: 256 * 1024, pauseMs: 0, stopAfterAnswer: false });
    expect(result.status).not.toBe(413);
    expect(result.status).toBe(401);
    expect(result.socketError).toBeNull();
  }, 30_000);
});
