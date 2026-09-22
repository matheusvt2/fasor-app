import { describe, expect, it } from 'vitest';
import { PRODUTO, healthResponseSchema } from './index.ts';

describe('domain kernel smoke', () => {
  it('exposes the product name constant', () => {
    expect(PRODUTO).toBe('PRODUTO');
  });

  it('validates a health payload', () => {
    const ok = { status: 'up', db: 'up', queue: 'up', storage: 'up', libreoffice: 'up' };
    expect(healthResponseSchema.parse(ok)).toEqual(ok);
    expect(() => healthResponseSchema.parse({ ...ok, db: 'maybe' })).toThrow();
  });
});
