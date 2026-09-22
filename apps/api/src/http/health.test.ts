import { healthResponseSchema } from '@app/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';

const up = async () => undefined;
const down = async () => {
  throw new Error('down');
};

describe('GET /api/health', () => {
  afterEach(() => vi.useRealTimers());

  it('reports every component up with 200', async () => {
    const app = createApp({ db: up, queue: up, storage: up, libreoffice: up });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json())).toEqual({
      status: 'up',
      db: 'up',
      queue: 'up',
      storage: 'up',
      libreoffice: 'up',
    });
  });

  it('reports a failing component down with 503', async () => {
    const app = createApp({ db: down, queue: up, storage: up, libreoffice: up });
    const res = await app.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'down', queue: 'up' });
  });

  it('reports a probe that never resolves as down with 503', async () => {
    vi.useFakeTimers();
    try {
      const hang = () => new Promise<never>(() => {});
      const app = createApp({ db: up, queue: up, storage: hang, libreoffice: up });
      const pending = app.request('/api/health');
      await vi.advanceTimersByTimeAsync(3000);
      const res = await pending;
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ status: 'degraded', storage: 'down', db: 'up' });
    } finally {
      vi.useRealTimers();
    }
  });
});
