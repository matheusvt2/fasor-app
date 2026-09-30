import { getConnInfo } from '@hono/node-server/conninfo';
import type { ErrorResponse } from '@app/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from './session.ts';

/*
 * Security review 2026-09-30 (E11-A5): fixed-window request limits, in memory. The api runs
 * as one process per deployment (one ECS task, `infra/production/ecs.tf`), so an in-process
 * counter is the whole picture; a second instance would need a shared store. Two limits:
 * sign-in attempts per client address and per e-mail (a password guess from many
 * addresses still meets the e-mail's limit), and pushes per signed-in user.
 */

export interface RateLimitRule {
  /** Requests allowed in one window. */
  max: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the window of the key resets; 0 when allowed. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

/** Past this many live keys the expired ones are dropped before a new key is added. */
const PRUNE_THRESHOLD = 10_000;

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts one request of `key` and says whether it is within the rule. */
  consume(key: string): RateLimitDecision {
    const now = this.now();
    let window = this.windows.get(key);
    if (window === undefined || now >= window.resetAt) {
      if (window === undefined && this.windows.size >= PRUNE_THRESHOLD) this.prune(now);
      window = { count: 0, resetAt: now + this.rule.windowMs };
      this.windows.set(key, window);
    }
    window.count += 1;
    if (window.count <= this.rule.max) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1000)) };
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (now >= window.resetAt) this.windows.delete(key);
  }
}

const rateLimited: ErrorResponse = {
  code: 'rate_limited',
  message: 'Too many requests; try again later.',
};

function tooMany(c: Context, retryAfterSeconds: number): Response {
  return c.json(rateLimited, 429, { 'retry-after': String(retryAfterSeconds) });
}

/**
 * The address a request came from. Behind one reverse proxy (Caddy, locally and in
 * production) the socket is the proxy's, and the client is the last entry of
 * `X-Forwarded-For`: Caddy replaces whatever the client sent there with the address it
 * saw, so the last entry is never the client's own claim. Without a trusted proxy the
 * header is ignored and the socket address is used.
 */
export function clientAddress(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('x-forwarded-for');
    const last = forwarded?.split(',').map((part) => part.trim()).filter((part) => part !== '').at(-1);
    if (last !== undefined) return last;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    // `app.request()` in tests has no socket.
    return 'unknown';
  }
}

/** The e-mail a sign-in body names, lower-cased; null when the body names none. */
async function signInEmail(c: Context): Promise<string | null> {
  try {
    const body: unknown = await c.req.raw.clone().json();
    const email = (body as { email?: unknown } | null)?.email;
    return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export interface SignInLimitOptions {
  rule: RateLimitRule;
  trustProxy: boolean;
  now?: () => number;
}

/**
 * Limits `POST /api/auth/sign-in/*`: every attempt counts against the client address and
 * against the e-mail it names, and either one over the rule answers `429 rate_limited`
 * before better-auth checks the password.
 */
export function signInRateLimit(options: SignInLimitOptions): MiddlewareHandler {
  const byAddress = new FixedWindowLimiter(options.rule, options.now);
  const byEmail = new FixedWindowLimiter(options.rule, options.now);
  return async (c, next) => {
    if (c.req.method !== 'POST') return next();
    const address = byAddress.consume(clientAddress(c, options.trustProxy));
    const email = await signInEmail(c);
    const account = email === null ? null : byEmail.consume(email);
    const refused = [address, account].filter((d): d is RateLimitDecision => d !== null && !d.allowed);
    if (refused.length > 0) return tooMany(c, Math.max(...refused.map((d) => d.retryAfterSeconds)));
    return next();
  };
}

export interface PushLimitOptions {
  rule: RateLimitRule;
  now?: () => number;
}

/**
 * Limits `POST /api/sync/ops` per signed-in user. Runs after the session middleware; a
 * request with no session passes through to the route, which answers 401.
 */
export function pushRateLimit(options: PushLimitOptions): MiddlewareHandler<AppEnv> {
  const byUser = new FixedWindowLimiter(options.rule, options.now);
  return async (c, next) => {
    if (c.req.method !== 'POST') return next();
    const session = c.get('session');
    if (session === null || session === undefined) return next();
    const decision = byUser.consume(session.userId);
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);
    return next();
  };
}
