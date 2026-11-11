import { describe, expect, it } from 'vitest';
import { ACCOUNT_ROUTES, accountResponseSchema } from './index.ts';
import { contractExamples } from './examples.ts';
import { errorCodeSchema, errorResponseSchema, OP_REJECT_CODES } from './errors.ts';
import {
  relatorioSummarySchema,
  sinceQuerySchema,
  SYNC_PUSH_MAX_BYTES,
  SYNC_PUSH_MAX_OPS,
  SYNC_ROUTES,
  syncPullResponseSchema,
  syncPushBodySchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
} from './sync.ts';
import { CONTRACT_VERSION, CONTRACT_VERSION_HEADER, MARK_AWARE_CONTRACT_VERSION, MIN_CONTRACT_VERSION } from './version.ts';
import { DOCX_MIME, GENERATE_MAX_EXPECTED_FILES, GENERATE_ROUTES, generateRequestSchema, generateResponseSchema, notCaughtUpDetailsSchema } from './generate.ts';

describe('generate contract (Story 4.8)', () => {
  const id = '019966c1-0000-7000-8000-000000000007';

  it('names the generate barrier and the DOCX download', () => {
    expect(GENERATE_ROUTES.generate(id)).toEqual({ method: 'POST', path: `/api/relatorios/${id}/generate` });
    expect(GENERATE_ROUTES.revisionDocx(id)).toEqual({ method: 'GET', path: `/api/revisions/${id}/docx` });
    expect(GENERATE_ROUTES.revisionPdf(id)).toEqual({ method: 'GET', path: `/api/revisions/${id}/pdf` });
    expect(DOCX_MIME).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('types the request: a nullable op id and the expected file ids', () => {
    expect(generateRequestSchema.safeParse({ last_op_id: null, file_ids_expected: [] }).success).toBe(true);
    expect(generateRequestSchema.safeParse({ last_op_id: id, file_ids_expected: [id] }).success).toBe(true);
    expect(generateRequestSchema.safeParse({ last_op_id: 'x', file_ids_expected: [] }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ file_ids_expected: [] }).success).toBe(false);
    // A runaway list is a 400, never one query past Postgres's parameter limit.
    expect(generateRequestSchema.safeParse({ last_op_id: null, file_ids_expected: Array(GENERATE_MAX_EXPECTED_FILES).fill(id) }).success).toBe(true);
    expect(generateRequestSchema.safeParse({ last_op_id: null, file_ids_expected: Array(GENERATE_MAX_EXPECTED_FILES + 1).fill(id) }).success).toBe(false);
  });

  it('types the three outcomes and the 409 details', () => {
    expect(generateResponseSchema.safeParse({ outcome: 'queued', job_id: id, revision_number: 1 }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ outcome: 'running', job_id: id, revision_number: 2 }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ outcome: 'unchanged', revision_id: id, revision_number: 1 }).success).toBe(true);
    expect(generateResponseSchema.safeParse({ outcome: 'queued', revision_id: id, revision_number: 1 }).success).toBe(false);
    expect(generateResponseSchema.safeParse({ outcome: 'done' }).success).toBe(false);
    expect(notCaughtUpDetailsSchema.safeParse({ missing_op: true, missing_files: [id] }).success).toBe(true);
    expect(errorCodeSchema.safeParse('not_caught_up').success).toBe(true);
    expect(errorCodeSchema.safeParse('invalid_request').success).toBe(true);
  });
});

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

  it('contract 18 (Story 14.3): the valid push and pull examples carry a site checklist put', () => {
    const site = (ops: readonly { path: string }[]) => ops.filter((op) => /^location\/[^/]+\/checklist\//.test(op.path));
    expect(site(contractExamples.pushRequest.valid.ops)).toHaveLength(1);
    expect(site(contractExamples.pullResponse.valid.ops)).toHaveLength(1);
  });

  it('contract 19 (Story 14.5): the valid push and pull examples carry a measurement test value put', () => {
    const values = (ops: readonly { path: string }[]) => ops.filter((op) => /^sheet\/[^/]+\/test\/[^/]+\/value\/[^/]+$/.test(op.path));
    expect(values(contractExamples.pushRequest.valid.ops)).toHaveLength(1);
    expect(values(contractExamples.pullResponse.valid.ops)).toHaveLength(1);
    expect(contractExamples.pullResponse.valid.seq).toBe(46);
  });

  it('the push envelope accepts a malformed op (rejected per op) but not a batch over the limit', () => {
    expect(syncPushBodySchema.safeParse({ ops: [{ nonsense: true }] }).success).toBe(true);
    expect(syncPushBodySchema.safeParse({ ops: new Array(SYNC_PUSH_MAX_OPS + 1).fill({}) }).success).toBe(false);
    expect(syncPushBodySchema.safeParse({ ops: 'x' }).success).toBe(false);
    expect(syncPushRequestSchema.safeParse({ ops: [{ nonsense: true }] }).success).toBe(false);
  });
});

describe('relatório summary progress (Story 10.4)', () => {
  const entry = { id: 'r', project_id: 'p', status: 'em_campo', template_id: null, seed_version: '2026.1', updated_seq: 3 };

  it('parses an entry without progress (an older server) and one with it', () => {
    expect(relatorioSummarySchema.parse(entry).progress).toBeUndefined();
    expect(relatorioSummarySchema.parse({ ...entry, progress: { sheets: 30, photos: 20 } }).progress).toEqual({ sheets: 30, photos: 20 });
  });

  it('refuses a negative or fractional total', () => {
    expect(relatorioSummarySchema.safeParse({ ...entry, progress: { sheets: -1, photos: 0 } }).success).toBe(false);
    expect(relatorioSummarySchema.safeParse({ ...entry, progress: { sheets: 1.5, photos: 0 } }).success).toBe(false);
  });
});

describe('contract constants', () => {
  // e23b (Stories 23.7 to 23.9, 2026-11-08): 35, after e23a's 34; MIN follows.
  // e23v (Stories 23.5, 23.6 and 23.14, 2026-11-09): 36, after e23b's 35; MIN follows.
  // e23h (Stories 23.10 and 23.11, 2026-11-09): 37, after e23v's 36; MIN follows.
  // e23t (Stories 23.15 to 23.17 and 23.19, 2026-11-09): 38, after e23h's 37; MIN follows.
  // e23e (Stories 23.13, 23.18, 23.20 and 23.21, 2026-11-09): 39, after e23t's 38; MIN follows.
  // e23z (the final Epic 23 fixes, 2026-11-10): 40, after e23e's 39; MIN follows.
  // e24h (points on click, 2026-11-10): 41, after e23z's 40; MIN follows.
  // e24f (the Epic 23 retrospective's fixes, 2026-11-10): 42, after e24h's 41; MIN follows.
  // e24b (Stories 24.8 and 24.21, 2026-11-11): 43, after e24f's 42; MIN follows.
  // e24a (Stories 24.2 to 24.4, seed v14 and its rule flags, 2026-11-11): 44, after e24b's 43; MIN follows.
  // e24s (Stories 24.10 to 24.14, seed v14's sheets, 2026-11-11): 45, after e24a's 44; MIN follows.
  it('speaks version 45 and refuses version 44 (batch e24s: a version-44 bundle lacks the v14 item keys and strips `dry_items`)', () => {
    expect(CONTRACT_VERSION).toBe(45);
    expect(MIN_CONTRACT_VERSION).toBe(45);
    // E10-Q6: the push refuses an older client only where it would settle a mark.
    expect(MARK_AWARE_CONTRACT_VERSION).toBe(12);
    expect(CONTRACT_VERSION_HEADER).toBe('x-contract-version');
  });

  it('names the three sync routes', () => {
    expect(SYNC_ROUTES.pushOps).toEqual({ method: 'POST', path: '/api/sync/ops' });
    expect(SYNC_ROUTES.pullCompany).toEqual({ method: 'GET', path: '/api/sync/company' });
    expect(SYNC_ROUTES.pullRelatorio('abc')).toEqual({ method: 'GET', path: '/api/sync/relatorios/abc' });
    // E4 retro item 17: a project's own stream.
    expect(SYNC_ROUTES.pullProject('abc')).toEqual({ method: 'GET', path: '/api/sync/projects/abc' });
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
    const features = { ai: true };
    expect(accountResponseSchema.safeParse({ user, features }).success).toBe(true);
    // Story 11.8 follow-up: an api from before the flag (no `features`) had AI on.
    expect(accountResponseSchema.parse({ user }).features).toEqual({ ai: true });
    expect(accountResponseSchema.parse({ user, features: { ai: false } }).features).toEqual({ ai: false });
    expect(accountResponseSchema.safeParse({ user, features: {} }).success).toBe(false);
    expect(errorCodeSchema.safeParse('ai_features_off').success).toBe(true);
    // Identity user ids are uuidv7 like every other kernel id (AD-4): a slug is refused.
    expect(accountResponseSchema.safeParse({ user: { ...user, id: 'seed-user-a-teste-local' }, features }).success).toBe(false);
  });

  it('enumerates the per-op rejection codes inside the error codes', () => {
    expect([...OP_REJECT_CODES]).toEqual([
      'op_invalid',
      'op_path_unknown',
      'op_server_only',
      'op_tenant_mismatch',
      'op_forbidden',
      // Contract 29 (Stories 20.7 to 20.10): appended after the five of contract 2, never reordered.
      'op_status_transition',
      'op_attribution',
      'op_value_invalid',
      'op_target_missing',
    ]);
    for (const code of OP_REJECT_CODES) expect(errorCodeSchema.safeParse(code).success).toBe(true);
    expect(errorCodeSchema.safeParse('contract_outdated').success).toBe(true);
    expect(errorCodeSchema.safeParse('duplicate_tag').success).toBe(false);
  });

  it('contract 29: a push answer may carry each new refusal code, and the two codes of batch e20e are reserved after telemetry_invalid', () => {
    for (const code of ['op_status_transition', 'op_attribution', 'op_value_invalid', 'op_target_missing'] as const) {
      expect(syncPushResponseSchema.safeParse({ applied: [], rejected: [{ op_id: 'x', code }], superseded: [] }).success, code).toBe(true);
    }
    const codes = errorCodeSchema.options;
    expect(codes.slice(codes.indexOf('telemetry_invalid'))).toEqual(['telemetry_invalid', 'quota_exceeded', 'forbidden_origin']);
  });

  it('contract 29 (Story 20.9): the push body is capped at 4 MiB', () => {
    expect(SYNC_PUSH_MAX_BYTES).toBe(4 * 1024 * 1024);
  });

  it('parses `since` as a non-negative integer defaulting to 0', () => {
    expect(sinceQuerySchema.parse(undefined)).toBe(0);
    expect(sinceQuerySchema.parse('17')).toBe(17);
    expect(sinceQuerySchema.safeParse('-1').success).toBe(false);
    expect(sinceQuerySchema.safeParse('1.5').success).toBe(false);
    expect(sinceQuerySchema.safeParse('abc').success).toBe(false);
  });
});
