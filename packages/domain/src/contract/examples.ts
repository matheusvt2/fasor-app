/*
 * One valid and one invalid example per route, exported so the api and web tests
 * can reuse the exact shapes the contract test pins (ADR readiness 1.4). Fixed
 * uuidv7 ids and timestamps: nothing here reads a clock or mints an id.
 */

const COMPANY_ID = '019966b0-0003-7000-8000-000000000001';
const USER_ID = '019966b0-0003-7000-8000-000000000002';
const RELATORIO_ID = '019966b0-0003-7000-8000-000000000003';
const PROJECT_ID = '019966b0-0003-7000-8000-000000000004';
const CLIENT_ID = '019966b0-0003-7000-8000-000000000005';
const OP_1 = '019966b0-0004-7000-8000-000000000001';
const OP_2 = '019966b0-0004-7000-8000-000000000002';
const OP_3 = '019966b0-0004-7000-8000-000000000003';

const clientCreate = {
  op_id: OP_1,
  kind: 'create',
  scope: 'company',
  company_id: COMPANY_ID,
  project_id: null,
  relatorio_id: null,
  path: `registry/client/${CLIENT_ID}`,
  value: {
    id: CLIENT_ID,
    kind: 'client',
    name: 'Cliente Exemplo S.A.',
    cnpj: null,
    contact_name: null,
    contact_phone: null,
    sites: [],
    removed_at: null,
  },
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: USER_ID,
  device_id: 'tablet-example',
  client_ts: '2026-09-21T12:00:00.000Z',
};

const relatorioCreate = {
  op_id: OP_2,
  kind: 'create',
  scope: 'relatorio',
  company_id: COMPANY_ID,
  project_id: PROJECT_ID,
  relatorio_id: RELATORIO_ID,
  path: `relatorio/${RELATORIO_ID}`,
  value: {
    id: RELATORIO_ID,
    project_id: PROJECT_ID,
    template_id: null,
    template_version: null,
    seed_version: 'v1',
    status: 'rascunho',
    setup: {
      service_start: null,
      service_end: null,
      atividade: null,
      local: null,
      responsible_user_id: null,
      cover_photo_file_id: null,
      escopo: null,
      exclusions: null,
      additional_info: null,
      art_trt_number: null,
      instrument_ids: [],
      site_altitude_m: null,
      site_altitude_confirmed: false,
      next_intervention_date: null,
      next_intervention_justification: null,
    },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  },
  prev_op_id: null,
  batch_id: null,
  meta: null,
  actor_id: USER_ID,
  device_id: 'tablet-example',
  client_ts: '2026-09-21T12:01:00.000Z',
};

export const contractExamples = {
  pushRequest: {
    valid: { ops: [clientCreate, relatorioCreate] },
    /** `ops` is not an array. */
    invalid: { ops: clientCreate },
  },
  pushResponse: {
    valid: {
      applied: [
        { op_id: OP_1, seq: 41 },
        { op_id: OP_2, seq: 42 },
      ],
      rejected: [{ op_id: OP_3, code: 'op_server_only' }],
      superseded: [{ op_id: OP_2, over_op_id: OP_1 }],
    },
    /** A rejection code outside the enum. */
    invalid: { applied: [], rejected: [{ op_id: OP_3, code: 'duplicate_tag' }], superseded: [] },
  },
  pullResponse: {
    valid: {
      ops: [{ ...clientCreate, seq: 41 }],
      seq: 42,
      summary: {
        last_push_at: [{ user_id: USER_ID, device_id: 'tablet-example', at: '2026-09-21T12:05:00.000Z' }],
        relatorios: [
          {
            id: RELATORIO_ID,
            project_id: PROJECT_ID,
            status: 'rascunho',
            template_id: null,
            seed_version: 'v1',
            updated_seq: 42,
          },
        ],
      },
    },
    /** A fourth key: the pull answers `{ops, seq, summary?}` and nothing else. */
    invalid: { ops: [], seq: 42, cursor: 41 },
  },
  errorResponse: {
    valid: { code: 'contract_outdated', message: 'Update the app to keep receiving changes.' },
    /** A code outside the enum. */
    invalid: { code: 'something_else', message: 'x' },
  },
} as const;
