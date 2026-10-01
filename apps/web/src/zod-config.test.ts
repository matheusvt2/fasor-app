import { afterEach, describe, expect, it, vi } from 'vitest';

describe('zod-config (review fixes 2026-09-30, security L11)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('turns zod jitless before the kernel builds its schemas, so a parse never calls Function', async () => {
    // The order main.tsx has: the config first, then the kernel.
    await import('./zod-config.ts');
    const { isZodJitless } = await import('@app/domain/zod-jitless');
    const { lastPushAtSchema } = await import('@app/domain');
    expect(isZodJitless()).toBe(true);
    const probe = vi.spyOn(globalThis, 'Function');
    const row = { user_id: 'u', device_id: 'd', at: '2026-09-30T12:00:00.000Z' };
    expect(lastPushAtSchema.parse(row)).toEqual(row);
    expect(probe).not.toHaveBeenCalled();
  });

  it('is the first import of the entry point', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const main = readFileSync(resolve(__dirname, 'main.tsx'), 'utf8');
    expect(main.split('\n')[0]).toBe("import './zod-config.ts';");
  });
});
