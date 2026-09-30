import { createHash } from 'node:crypto';
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
/**
 * The most keys one limiter holds. Past it, even after the expired ones are dropped, the
 * oldest key goes: a flood of distinct keys inside one window costs bounded memory (and
 * frees an old key early, which only ever errs towards letting a request through).
 */
export const MAX_LIMITER_KEYS = 50_000;

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly rule: RateLimitRule,
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = MAX_LIMITER_KEYS,
  ) {}

  /** Live keys held (for tests). */
  get size(): number {
    return this.windows.size;
  }

  /** Counts one request of `key` and says whether it is within the rule. */
  consume(key: string): RateLimitDecision {
    const now = this.now();
    let window = this.windows.get(key);
    if (window === undefined || now >= window.resetAt) {
      if (window === undefined && this.windows.size >= Math.min(PRUNE_THRESHOLD, this.maxKeys)) this.prune(now);
      if (window === undefined && this.windows.size >= this.maxKeys) {
        const oldest = this.windows.keys().next().value;
        if (oldest !== undefined) this.windows.delete(oldest);
      }
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

/**
 * The limiter key of the e-mail a sign-in body names: the sha256 of the trimmed, lower-cased
 * address, so a key is 64 characters whatever was posted; null when the body names none.
 */
async function signInEmailKey(c: Context): Promise<string | null> {
  try {
    const body: unknown = await c.req.raw.clone().json();
    const email = (body as { email?: unknown } | null)?.email;
    if (typeof email !== 'string' || email.trim() === '') return null;
    return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  } catch {
    return null;
  }
}

const notJson: ErrorResponse = {
  code: 'invalid_request',
  message: 'Sign-in takes an application/json body.',
};

function isJson(c: Context): boolean {
  const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  return type === 'application/json';
}

export interface SignInLimitOptions {
  rule: RateLimitRule;
  trustProxy: boolean;
  now?: () => number;
}

/**
 * Limits `POST /api/auth/sign-in/*`: every attempt counts against the client address and
 * against the e-mail it names, and either one over the rule answers `429 rate_limited`
 * before better-auth checks the password. A body that is not JSON answers `415`: the app
 * signs in with JSON only, and a form-encoded body would carry an e-mail this limiter
 * cannot key. An attempt the address limit already refused is not counted against the
 * e-mail, so one address cannot fill the e-mail limiter with keys.
 */
export function signInRateLimit(options: SignInLimitOptions): MiddlewareHandler {
  const byAddress = new FixedWindowLimiter(options.rule, options.now);
  const byEmail = new FixedWindowLimiter(options.rule, options.now);
  return async (c, next) => {
    if (c.req.method !== 'POST') return next();
    if (!isJson(c)) return c.json(notJson, 415);
    const address = byAddress.consume(clientAddress(c, options.trustProxy));
    if (!address.allowed) return tooMany(c, address.retryAfterSeconds);
    const email = await signInEmailKey(c);
    const account = email === null ? null : byEmail.consume(email);
    if (account !== null && !account.allowed) return tooMany(c, account.retryAfterSeconds);
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
