import { describe, expect, it } from 'vitest';
import { readSmokeSeedEnv, SmokeSeedRefused } from './smoke-seed.ts';

/*
 * Story 14.10 part 6: the smoke seed's input, checked before any database is opened (the
 * matrix row "Bad id"). The company-scoped reset itself is `smoke-seed.integration.test.ts`.
 */

const VALID = {
  SMOKE_COMPANY_ID: '01a14081-aa50-7697-855b-72450e7ed851',
  SMOKE_COMPANY_NAME: 'Empresa de teste automatizado',
  SMOKE_USER_EMAIL: ' Smoke-Producao@Teste.Local ',
  SMOKE_USER_NAME: 'Teste automatizado',
  SMOKE_USER_PASSWORD: 'not-a-real-password-0001',
};

describe('readSmokeSeedEnv', () => {
  it('reads the five variables, the e-mail trimmed and lower-cased', () => {
    expect(readSmokeSeedEnv(VALID)).toEqual({
      companyId: '01a14081-aa50-7697-855b-72450e7ed851',
      companyName: 'Empresa de teste automatizado',
      email: 'smoke-producao@teste.local',
      name: 'Teste automatizado',
      password: 'not-a-real-password-0001',
    });
  });

  it('names every missing or blank variable, and never the password', () => {
    const run = () => readSmokeSeedEnv({ ...VALID, SMOKE_COMPANY_ID: undefined, SMOKE_USER_NAME: '  ', SMOKE_USER_PASSWORD: '' });
    expect(run).toThrow(SmokeSeedRefused);
    expect(run).toThrow('missing SMOKE_COMPANY_ID, SMOKE_USER_NAME, SMOKE_USER_PASSWORD');
    expect(() => readSmokeSeedEnv({})).toThrow('missing SMOKE_COMPANY_ID, SMOKE_COMPANY_NAME, SMOKE_USER_EMAIL, SMOKE_USER_NAME, SMOKE_USER_PASSWORD');
  });

  it('refuses a company id that is not a uuidv7, naming it', () => {
    for (const id of ['01a14081-aa50-4697-855b-72450e7ed851', 'fasor', '01a14081aa507697855b72450e7ed851']) {
      expect(() => readSmokeSeedEnv({ ...VALID, SMOKE_COMPANY_ID: id }), id).toThrow(`SMOKE_COMPANY_ID must be a uuidv7, got "${id}"`);
    }
  });

  it('keeps the message free of the password whatever is refused', () => {
    try {
      readSmokeSeedEnv({ ...VALID, SMOKE_COMPANY_ID: 'bad' });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(VALID.SMOKE_USER_PASSWORD);
    }
  });
});
