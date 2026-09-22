import { Hono } from 'hono';
import { getHealth, type HealthProbes } from './health.ts';

export function createApp(probes: HealthProbes): Hono {
  const app = new Hono();
  app.get('/api/health', async (c) => {
    const health = await getHealth(probes);
    return c.json(health, health.status === 'up' ? 200 : 503);
  });
  return app;
}
