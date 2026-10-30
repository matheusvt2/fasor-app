import {
  TELEMETRY_BATCH_MAX,
  TELEMETRY_ROUTE,
  TELEMETRY_SERVER_KEYS,
  telemetryBatchSchema,
  type Clock,
  type ErrorResponse,
  type StampedUxEvent,
} from '@app/domain';
import { Hono } from 'hono';
import { logError } from '../log.ts';
import type { TelemetrySink } from '../telemetry/sink.ts';
import { FixedWindowLimiter, tooMany, type RateLimitRule } from './rate-limit.ts';
import { type AppEnv, requireSession } from './session.ts';

/*
 * Epic 18, Story 18.2 (AD-28): `POST /api/telemetry`, the one route usage events travel on.
 * Behind the session: the body is a batch of at most `TELEMETRY_BATCH_MAX` device events,
 * each parsed strictly by the kernel schema; one failure refuses the whole batch. The server
 * stamps `received_at`, `user_id` and `company_id` (a value of those in the body is dropped
 * before parsing, never trusted), hands the batch to the sink and answers 204. The request
 * log line stays the shared one (method, path, status, duration, company): no event content.
 */

/** A device spends one per event; 1 000 a minute per user and device (Story 18.2). */
export const TELEMETRY_RATE_LIMIT: RateLimitRule = { max: 1000, windowMs: 60_000 };

const invalid: ErrorResponse = {
  code: 'telemetry_invalid',
  message: `The body is not an array of at most ${TELEMETRY_BATCH_MAX} valid usage events.`,
};

/** The item without the keys only the server stamps; anything that is not an object is kept as it is. */
function withoutServerKeys(item: unknown): unknown {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
  const copy: Record<string, unknown> = { ...(item as Record<string, unknown>) };
  for (const key of TELEMETRY_SERVER_KEYS) delete copy[key];
  return copy;
}

export interface TelemetryRouteOptions {
  sink: TelemetrySink;
  now: Clock;
  limit?: RateLimitRule;
  /** The limiter's clock (tests move it); defaults to `Date.now`. */
  limitNow?: () => number;
}

export function createTelemetryRoutes(options: TelemetryRouteOptions): Hono<AppEnv> {
  const limiter = new FixedWindowLimiter(options.limit ?? TELEMETRY_RATE_LIMIT, options.limitNow);
  const routes = new Hono<AppEnv>();

  routes.post(TELEMETRY_ROUTE.path, async (c) => {
    const session = requireSession(c);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(invalid, 400);
    }
    if (!Array.isArray(body) || body.length > TELEMETRY_BATCH_MAX) return c.json(invalid, 400);
    const parsed = telemetryBatchSchema.safeParse(body.map(withoutServerKeys));
    if (!parsed.success) return c.json(invalid, 400);
    const events = parsed.data;
    if (events.length === 0) return c.body(null, 204);

    const perDevice = new Map<string, number>();
    for (const event of events) perDevice.set(event.device_id, (perDevice.get(event.device_id) ?? 0) + 1);
    for (const [device, count] of perDevice) {
      const decision = limiter.consume(`${session.userId}:${device}`, count);
      if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);
    }

    const receivedAt = options.now().toISOString();
    const stamped: StampedUxEvent[] = events.map((event) => ({
      ...event,
      received_at: receivedAt,
      user_id: session.userId,
      company_id: session.companyId,
    }));
    try {
      await options.sink.write(stamped);
    } catch {
      logError('ux_event_sink_failed', { count: stamped.length });
    }
    return c.body(null, 204);
  });

  return routes;
}
