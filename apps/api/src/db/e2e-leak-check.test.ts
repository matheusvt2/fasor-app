import { describe, expect, it } from 'vitest';
import { inOwnPair } from './e2e-leak-check.ts';
import { workerSeed } from './e2e-worker-seed.ts';
import { TEST_SEED } from './test-seed.ts';

/*
 * Story 10.1: the leak rule for the colleague of Empresa A (`SeedAccount.colleague`), the
 * second author of the two-device specs. It belongs to its worker's pair like A's first user.
 */

describe('inOwnPair', () => {
  const mine = workerSeed(3);
  const theirs = workerSeed(4);
  const colleague = mine.companies[0].colleague!;

  it('accepts the colleague in its own pair, company A or B', () => {
    expect(inOwnPair(mine.companies[0].companyId, colleague.userId)).toBe(true);
    expect(inOwnPair(mine.companies[1].companyId, colleague.userId)).toBe(true);
  });

  it('refuses the colleague in another worker pair or a TEST_SEED company', () => {
    expect(inOwnPair(theirs.companies[0].companyId, colleague.userId)).toBe(false);
    expect(inOwnPair(theirs.companies[1].companyId, colleague.userId)).toBe(false);
    expect(inOwnPair(TEST_SEED.companies[0].companyId, colleague.userId)).toBe(false);
  });

  it('keeps the rule for the first users of the pair', () => {
    expect(inOwnPair(mine.companies[1].companyId, mine.companies[0].userId)).toBe(true);
    expect(inOwnPair(theirs.companies[0].companyId, mine.companies[1].userId)).toBe(false);
  });
});
