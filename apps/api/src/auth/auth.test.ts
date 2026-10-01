import { PRODUTO } from '@app/domain';
import { describe, expect, it } from 'vitest';
import type { Db } from '../db/client.ts';
import { createAuth } from './auth.ts';

/*
 * Review 2026-09-30, A-26: the auth library's app name is the product name constant
 * (`packages/domain/src/product.ts`), never a literal of its own.
 */
describe('A-26 the auth app name', () => {
  it('is PRODUTO, from the one constant', () => {
    const auth = createAuth({ db: {} as Db, secret: 'x'.repeat(32), trustedOrigins: ['http://localhost:5173'] });
    expect(auth.options.appName).toBe(PRODUTO);
  });
});
