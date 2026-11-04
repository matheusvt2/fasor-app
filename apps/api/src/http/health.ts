import type { HealthResponse } from '@app/domain';
import { Hono } from 'hono';

export type Probe = () => Promise<unknown>;

export interface HealthProbes {
  db: Probe;
  queue: Probe;
  storage: Probe;
  libreoffice: Probe;
}

const PROBE_TIMEOUT_MS = 3000;

/** Story 20.13: how long a costly probe's outcome is reused (LibreOffice starts a process). */
export const CACHED_PROBE_TTL_MS = 60_000;

/**
 * Story 20.13 (security pass S8): a probe run at most once per `ttlMs`, its outcome (up or down)
 * reused meanwhile, so a public `GET /api/health` called in a loop never starts LibreOffice on
 * every call. Calls while a run is in flight share it. `now` is the clock (tests move it).
 */
export function cachedProbe(probe: Probe, ttlMs: number = CACHED_PROBE_TTL_MS, now: () => number = Date.now): Probe {
  let last: { at: number; outcome: Promise<unknown> } | null = null;
  return () => {
    const at = now();
    if (last === null || at - last.at >= ttlMs) {
      const outcome = probe();
      // Never an unhandled rejection: the caller awaits it, this copy only keeps it.
      outcome.catch(() => undefined);
      last = { at, outcome };
    }
    return last.outcome;
  };
}

async function check(probe: Probe): Promise<'up' | 'down'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS);
      }),
    ]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth(probes: HealthProbes): Promise<HealthResponse> {
  const [db, queue, storage, libreoffice] = await Promise.all([
    check(probes.db),
    check(probes.queue),
    check(probes.storage),
    check(probes.libreoffice),
  ]);
  const allUp = [db, queue, storage, libreoffice].every((value) => value === 'up');
  return { status: allUp ? 'up' : 'degraded', db, queue, storage, libreoffice };
}

/** Public route: no session, no tenant. */
export function createHealthRoutes(probes: HealthProbes): Hono {
  const routes = new Hono();
  routes.get('/api/health', async (c) => {
    const health = await getHealth(probes);
    return c.json(health, health.status === 'up' ? 200 : 503);
  });
  return routes;
}
