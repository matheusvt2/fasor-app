import { describe, expect, it } from 'vitest';
import { inOwnPair } from './e2e-leak-check.ts';
import { E2E_WORKER_USER_LIKE, E2E_WORKER_USER_REGEXP, WORKER_ROLES, workerIndexOfUser, workerRoleUser, workerSeed } from './e2e-worker-seed.ts';
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

describe('26.3-UNIT-001 the role users of a worker pair', () => {
  const like = new RegExp(`^${E2E_WORKER_USER_LIKE.replace(/_/g, '.').replace(/%/g, '.*')}$`);
  const regexp = new RegExp(`^${E2E_WORKER_USER_REGEXP}$`);

  it('one user per seeded role but Admin, in Empresa B, with deterministic ids and e-mails', () => {
    const pair = workerSeed(7);
    const users = WORKER_ROLES.map((role) => workerRoleUser(7, role));
    expect(users.map((user) => [user.role, user.userId, user.email])).toEqual([
      ['engenheiro_de_campo', 'e2e00000-00b2-7000-8000-000000000007', 'e2e-w7-campo@teste.local'],
      ['gestor_do_projeto', 'e2e00000-00b3-7000-8000-000000000007', 'e2e-w7-gestor@teste.local'],
      ['responsavel_tecnico', 'e2e00000-00b4-7000-8000-000000000007', 'e2e-w7-rt@teste.local'],
      ['consulta', 'e2e00000-00b5-7000-8000-000000000007', 'e2e-w7-consulta@teste.local'],
    ]);
    for (const user of users) {
      expect(user.companyId).toBe(pair.companies[1].companyId);
      expect(user.password).toBe(pair.password);
      expect(workerRoleUser(7, user.role)).toEqual(user);
    }
  });

  it('the leak check knows every role user as its worker\'s, inside its own pair only', () => {
    const mine = workerSeed(3);
    const theirs = workerSeed(4);
    for (const role of WORKER_ROLES) {
      const user = workerRoleUser(3, role);
      expect(workerIndexOfUser(user.userId), role).toBe(3);
      expect(like.test(user.userId), role).toBe(true);
      expect(regexp.test(user.userId), role).toBe(true);
      expect(inOwnPair(mine.companies[0].companyId, user.userId), role).toBe(true);
      expect(inOwnPair(mine.companies[1].companyId, user.userId), role).toBe(true);
      expect(inOwnPair(theirs.companies[1].companyId, user.userId), role).toBe(false);
      expect(inOwnPair(TEST_SEED.companies[1].companyId, user.userId), role).toBe(false);
    }
    // The first users keep their ids, and no id outside the scheme matches.
    expect(regexp.test(mine.companies[1].userId)).toBe(true);
    expect(regexp.test('e2e00000-00b6-7000-8000-000000000003')).toBe(false);
    expect(workerIndexOfUser('e2e00000-00b6-7000-8000-000000000003')).toBeNull();
  });
});
