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
