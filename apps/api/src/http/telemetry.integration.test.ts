import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TELEMETRY_BATCH_MAX, TELEMETRY_ROUTE, type StampedUxEvent } from '@app/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuth } from '../auth/auth.ts';
import { parseTrustedOrigins } from '../auth/trusted-origins.ts';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { seedTestCompanies, TEST_SEED } from '../db/seed.ts';
import { createS3 } from '../storage/s3.ts';
import type { TelemetrySink } from '../telemetry/sink.ts';
import { createApp } from './app.ts';

/*
 * Epic 18, Story 18.2: `POST /api/telemetry`. The app runs in process with a recording sink
 * and a clock the test moves; the session cookie comes from the compose api (sessions live
 * in Postgres).
 */

const apiUrl = process.env.API_URL ?? 'http://api:3000';
const companyA = TEST_SEED.companies[0];
const config = loadConfig();
const { sql, db } = createDb(config.DATABASE_URL);
const s3 = createS3(config);
const auth = createAuth({
  db,
  secret: config.SESSION_SECRET,
  baseURL: config.AUTH_BASE_URL,
  trustedOrigins: parseTrustedOrigins(config.TRUSTED_ORIGINS),
});
const staticDir = mkdtempSync(join(tmpdir(), 'telemetry-'));
const up = async () => undefined;

const NOW = new Date('2026-10-29T12:00:00.000Z');
let limiterNow = NOW.getTime();
let written: StampedUxEvent[][] = [];
let sinkFails = false;
const sink: TelemetrySink = {
  write: async (events) => {
    if (sinkFails) throw new Error('sink down');
    written.push([...events]);
  },
};
const app = createApp({
  probes: { db: up, queue: up, storage: up, libreoffice: up },
  auth,
  db,
  s3,
  bucket: config.S3_BUCKET,
  staticDir,
  now: () => NOW,
  telemetry: { sink, limitNow: () => limiterNow },
});

let cookie = '';

beforeAll(async () => {
  await seedTestCompanies(db, auth);
  const res = await fetch(`${apiUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin: apiUrl, 'content-type': 'application/json' },
    body: JSON.stringify({ email: companyA.email, password: TEST_SEED.password }),
  });
  expect(res.status, await res.text()).toBe(200);
  cookie = res.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}, 60_000);

afterAll(async () => {
  rmSync(staticDir, { recursive: true, force: true });
  await sql.end();
});

beforeEach(() => {
  written = [];
  sinkFails = false;
  limiterNow += 120_000;
});

let deviceSeq = 0;
/** A fresh device id per test, so one test's events never count against another's limit. */
function newDevice(): string {
  deviceSeq += 1;
  return `019966c1-0000-7000-8000-${deviceSeq.toString(16).padStart(12, '0')}`;
}

const event = (device: string, extra: Record<string, unknown> = {}) => ({
  v: 1,
  ts: '2026-10-29T11:59:00.000Z',
  session_id: '019966c1-0000-7000-8000-0000000000aa',
  device_id: device,
  app_version: 'dev',
  name: 'action',
  screen: 'home',
  target: 'home.card_open',
  ...extra,
});

const post = (body: unknown, withCookie = true) =>
  app.request(TELEMETRY_ROUTE.path, {
    method: TELEMETRY_ROUTE.method,
    headers: { ...(withCookie ? { cookie } : {}), 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** The JSON lines `console.log` printed while `run` answered. */
async function stdout(run: () => Response | Promise<Response>): Promise<{ response: Response; lines: Record<string, unknown>[] }> {
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const response = await run();
    const lines = spy.mock.calls.flatMap(([first]) => {
      try {
        return [JSON.parse(String(first)) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
    return { response, lines };
  } finally {
    spy.mockRestore();
  }
}

describe('POST /api/telemetry (Story 18.2)', () => {
  it('answers 204 to a valid batch and hands the sink each event stamped from the session and the server clock', async () => {
    const device = newDevice();
    const batch = [event(device), event(device, { name: 'wait', kind: 'sync', outcome: 'ok', duration_ms: 420 })];
    const res = await post(batch);
    expect(res.status).toBe(204);
    expect(written).toHaveLength(1);
    expect(written[0]).toEqual(
      batch.map((e) => ({ ...e, received_at: NOW.toISOString(), user_id: companyA.userId, company_id: companyA.companyId })),
    );
  });

  it('ignores a user_id, company_id or received_at in the body: the server stamps its own', async () => {
    const device = newDevice();
    const forged = event(device, { user_id: 'someone-else', company_id: TEST_SEED.companies[1].companyId, received_at: '2020-01-01T00:00:00.000Z' });
    const res = await post([forged]);
    expect(res.status).toBe(204);
    expect(written[0]![0]).toMatchObject({ received_at: NOW.toISOString(), user_id: companyA.userId, company_id: companyA.companyId });
  });

  it('answers 204 to an empty batch without calling the sink', async () => {
    expect((await post([])).status).toBe(204);
    expect(written).toEqual([]);
  });

  it('refuses the whole batch with 400 telemetry_invalid when one event fails, and the sink sees nothing', async () => {
    const device = newDevice();
    const bad: Record<string, unknown>[] = [
      { extra: 1 },
      { name: 'click' },
      { screen: 'report' },
      { name: 'wait', kind: 'download' },
      { outcome: 'done' },
      { target: 'Transformador 1' },
      { name: 'wait', kind: 'sync', duration_ms: -1 },
      { name: 'wait', kind: 'sync', duration_ms: 1.5 },
      { relatorio_id: 'TR-01 cabine' },
    ];
    for (const extra of bad) {
      const res = await post([event(device), event(device, extra)]);
      expect([extra, res.status]).toEqual([extra, 400]);
      expect(await res.json()).toMatchObject({ code: 'telemetry_invalid' });
    }
    expect(written).toEqual([]);
  });

  it('refuses more than 200 events, a body that is not an array, and an empty or broken body', async () => {
    const device = newDevice();
    for (const body of [Array(TELEMETRY_BATCH_MAX + 1).fill(event(device)), {}, { events: [event(device)] }, '', '[{', 'null', '[null]']) {
      const res = await post(body);
      expect([body === '' ? 'empty' : JSON.stringify(body).slice(0, 40), res.status]).toEqual([body === '' ? 'empty' : JSON.stringify(body).slice(0, 40), 400]);
      expect(await res.json()).toMatchObject({ code: 'telemetry_invalid' });
    }
    expect(written).toEqual([]);
  });

  it('answers 401 without a session', async () => {
    const res = await post([event(newDevice())], false);
    expect(res.status).toBe(401);
    expect(written).toEqual([]);
  });

  it('limits a device to 1000 events a minute with 429 rate_limited and retry-after, then accepts the next window', async () => {
    const device = newDevice();
    const full = Array(TELEMETRY_BATCH_MAX).fill(event(device));
    for (let i = 0; i < 5; i += 1) expect((await post(full)).status).toBe(204);
    const over = await post([event(device)]);
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/);
    expect(await over.json()).toMatchObject({ code: 'rate_limited' });
    expect(written).toHaveLength(5);
    // Another device of the same user has its own window.
    expect((await post([event(newDevice())])).status).toBe(204);
    limiterNow += 60_000;
    expect((await post([event(device)])).status).toBe(204);
  });

  it('still answers 204 when the sink fails, logging the failure once with the batch size', async () => {
    sinkFails = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const device = newDevice();
      const res = await post([event(device), event(device)]);
      expect(res.status).toBe(204);
      const lines = spy.mock.calls.map(([first]) => JSON.parse(String(first)) as Record<string, unknown>);
      expect(lines.filter((line) => line.msg === 'ux_event_sink_failed')).toEqual([expect.objectContaining({ count: 2 })]);
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps event content out of the request log line', async () => {
    const device = newDevice();
    const { response, lines } = await stdout(() => post([event(device, { name: 'reading_result', kind: 'plate', outcome: 'ok' })]));
    expect(response.status).toBe(204);
    const request = lines.filter((line) => line.msg === 'http_request');
    expect(request).toHaveLength(1);
    expect(Object.keys(request[0]!).sort()).toEqual(['company_id', 'duration_ms', 'job_id', 'level', 'method', 'msg', 'path', 'relatorio_id', 'status', 'ts']);
    expect(request[0]).toMatchObject({ method: 'POST', path: TELEMETRY_ROUTE.path, status: 204, company_id: companyA.companyId });
    expect(JSON.stringify(request[0])).not.toContain(device);
  });

  it('writes one ux_event line per event through the default stdout sink', async () => {
    const plain = createApp({ probes: { db: up, queue: up, storage: up, libreoffice: up }, auth, db, s3, bucket: config.S3_BUCKET, staticDir, now: () => NOW });
    const device = newDevice();
    const { response, lines } = await stdout(() =>
      plain.request(TELEMETRY_ROUTE.path, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify([event(device), event(device, { name: 'screen_view', target: undefined })]),
      }),
    );
    expect(response.status).toBe(204);
    const events = lines.filter((line) => line.msg === 'ux_event');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ device_id: device, name: 'action', received_at: NOW.toISOString(), user_id: companyA.userId, company_id: companyA.companyId });
    expect(events[1]).toMatchObject({ name: 'screen_view' });
  });
});
