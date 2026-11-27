import { uuidV7Schema } from '@app/domain';
import { describe, expect, it } from 'vitest';
import { isE2eWorkerCompany } from './e2e-worker-seed.ts';
import { BASE_TEST_SEED, currentTestPair, LEGACY_TEST_COMPANY_IDS, TEST_PAIR_ENV, TEST_SEED, testSeedPair } from './test-seed.ts';

/*
 * Chore T4 (2026-11-26): each worker of the api suite's parallel lane seeds its own test pair.
 * These pin the pair scheme: pair 1 is the fixed pair, every other pair is the same shape with ids
 * and e-mails of its own, and the variable is read as the setup file writes it.
 */

describe('the api suite test pairs (chore T4)', () => {
  it('pair 1 is the fixed pair, and no variable means pair 1', () => {
    expect(testSeedPair(1)).toBe(BASE_TEST_SEED);
    expect(currentTestPair({})).toBe(1);
    expect(currentTestPair({ [TEST_PAIR_ENV]: '' })).toBe(1);
    expect(BASE_TEST_SEED.companies.map((c) => c.email)).toEqual(['a@teste.local', 'b@teste.local']);
    expect(BASE_TEST_SEED.companies.map((c) => c.companyId)).toEqual(['0a000000-0000-7000-8000-00000000000a', '0b000000-0000-7000-8000-00000000000b']);
  });

  it('reads the pair from API_TEST_PAIR, and refuses a value that is not an integer from 1 to 255', () => {
    expect(TEST_PAIR_ENV).toBe('API_TEST_PAIR');
    expect(currentTestPair({ API_TEST_PAIR: '4' })).toBe(4);
    expect(() => currentTestPair({ API_TEST_PAIR: 'x' })).toThrow(/integer/);
    for (const bad of [0, 256, 1.5]) expect(() => testSeedPair(bad)).toThrow(/from 1 to 255/);
  });

  it('this file sees the pair its worker was given', () => {
    expect(TEST_SEED).toEqual(testSeedPair(currentTestPair()));
  });

  it('gives every pair the fixed pair\'s shape under ids and e-mails no other pair, legacy, e2e or minted id carries', () => {
    const seen = new Set<string>([...LEGACY_TEST_COMPANY_IDS]);
    for (let pair = 1; pair <= 255; pair += 1) {
      const seed = testSeedPair(pair);
      expect(seed).toEqual(testSeedPair(pair));
      expect(seed.password).toBe(BASE_TEST_SEED.password);
      seed.companies.forEach((company, n) => {
        const base = BASE_TEST_SEED.companies[n];
        expect({ ...company, companyId: '', userId: '', email: '' }).toEqual({ ...base, companyId: '', userId: '', email: '' });
        for (const id of [company.companyId, company.userId]) {
          expect(uuidV7Schema.safeParse(id).success, id).toBe(true);
          expect(isE2eWorkerCompany(id)).toBe(false);
          expect(seen.has(id), id).toBe(false);
          seen.add(id);
        }
        expect(seen.has(company.email), company.email).toBe(false);
        seen.add(company.email);
      });
    }
    // A minted uuidv7 starts with the current time in milliseconds; these start with 0a/0b000000.
    expect([...seen].filter((id) => /^[0-9a-f]{8}-/.test(id)).every((id) => id.startsWith('0a000000') || id.startsWith('0b000000'))).toBe(true);
  });
});
