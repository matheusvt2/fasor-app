import { describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, accountResponseSchema } from './index.ts';
import { contractExamples } from './examples.ts';
import { errorCodeSchema, errorResponseSchema, OP_REJECT_CODES } from './errors.ts';
import {
  sinceQuerySchema,
  SYNC_PUSH_MAX_OPS,
  SYNC_ROUTES,
  syncPullResponseSchema,
  syncPushBodySchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
} from './sync.ts';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, MIN_CONTRACT_VERSION } from './version.ts';

describe('contract examples (ADR readiness 1.4)', () => {
  const routes = [
    ['pushRequest', syncPushRequestSchema, contractExamples.pushRequest],
    ['pushResponse', syncPushResponseSchema, contractExamples.pushResponse],
    ['pullResponse', syncPullResponseSchema, contractExamples.pullResponse],
    ['errorResponse', errorResponseSchema, contractExamples.errorResponse],
  ] as const;

  for (const [name, schema, example] of routes) {
    it(`${name}: the valid example parses and the invalid one fails`, () => {
      expect(schema.safeParse(example.valid).success).toBe(true);
      expect(schema.safeParse(example.invalid).success).toBe(false);
    });
  }

  it('the push envelope accepts a malformed op (rejected per op) but not a batch over the limit', () => {
    expect(syncPushBodySchema.safeParse({ ops: [{ nonsense: true }] }).success).toBe(true);
    expect(syncPushBodySchema.safeParse({ ops: new Array(SYNC_PUSH_MAX_OPS + 1).fill({}) }).success).toBe(false);
    expect(syncPushBodySchema.safeParse({ ops: 'x' }).success).toBe(false);
    expect(syncPushRequestSchema.safeParse({ ops: [{ nonsense: true }] }).success).toBe(false);
  });
});

describe('contract constants', () => {
  it('speaks version 2 and accepts only version 2 (the user row and family changed)', () => {
    expect(CONTRACT_VERSION).toBe(2);
    expect(MIN_CONTRACT_VERSION).toBe(2);
    expect(CONTRACT_VERSION_HEADER).toBe('x-contract-version');
  });

  it('names the three sync routes', () => {
    expect(SYNC_ROUTES.pushOps).toEqual({ method: 'POST', path: '/api/sync/ops' });
    expect(SYNC_ROUTES.pullCompany).toEqual({ method: 'GET', path: '/api/sync/company' });
    expect(SYNC_ROUTES.pullRelatorio('abc')).toEqual({ method: 'GET', path: '/api/sync/relatorios/abc' });
  });

  it('names the account read, the only account route, and types its answer', () => {
    expect(ACCOUNT_ROUTES).toEqual({ read: { method: 'GET', path: '/api/account' } });
    const user = {
      id: '019966b0-0003-7000-8000-000000000002',
      name: 'Ana Alves',
      email: 'a@teste.local',
      companyId: '019966b0-0003-7000-8000-000000000001',
      companyName: 'Empresa A de Teste',
      council: 'crea',
      registrationNumber: 'SP 1',
      title: 'Eng. Eletricista',
    };
    expect(accountResponseSchema.safeParse({ user }).success).toBe(true);
    // Identity user ids are uuidv7 like every other kernel id (AD-4): a slug is refused.
    expect(accountResponseSchema.safeParse({ user: { ...user, id: 'seed-user-a-teste-local' } }).success).toBe(false);
  });

  it('enumerates the per-op rejection codes inside the error codes', () => {
    expect([...OP_REJECT_CODES]).toEqual(['op_invalid', 'op_path_unknown', 'op_server_only', 'op_tenant_mismatch', 'op_forbidden']);
    for (const code of OP_REJECT_CODES) expect(errorCodeSchema.safeParse(code).success).toBe(true);
    expect(errorCodeSchema.safeParse('contract_outdated').success).toBe(true);
    expect(errorCodeSchema.safeParse('duplicate_tag').success).toBe(false);
  });

  it('parses `since` as a non-negative integer defaulting to 0', () => {
    expect(sinceQuerySchema.parse(undefined)).toBe(0);
    expect(sinceQuerySchema.parse('17')).toBe(17);
    expect(sinceQuerySchema.safeParse('-1').success).toBe(false);
    expect(sinceQuerySchema.safeParse('1.5').success).toBe(false);
    expect(sinceQuerySchema.safeParse('abc').success).toBe(false);
  });
});
