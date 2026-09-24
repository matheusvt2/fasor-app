import { emptySheet, opSchema, type Op, type OpKind, type Scope } from '../../src/index.ts';
import golden from './snapshot.golden.json' with { type: 'json' };

/*
 * Replay fixture "small" (1.4-INT-001): one relatorio, one cabine, three
 * blocks, fixed uuidv7 ids and timestamps, every op kind, a batch, a
 * tombstone plus restore, a provenance put with `meta`, a photo file with
 * `block_id`, server-only ops and one dead op. Replayed in `seq` order through
 * `replay()`, the Dexie layer and the Drizzle layer it must yield the golden.
 * The Porto Seguro log (Story 3.7) is the second input of the same harness.
 */

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
/** Fixed entity ids: `019966b0-0000-7000-8000-0000000000NN`. */
export const fixedId = (n: number): string => `019966b0-0000-7000-8000-${hex(n, 12)}`;
/** Fixed op ids: `019966b0-0001-7000-8000-0000000000NN`. */
export const fixedOpId = (n: number): string => `019966b0-0001-7000-8000-${hex(n, 12)}`;
/** Fixed timestamps: one minute per op after 2026-09-20T10:00:00Z. */
export const fixedTs = (n: number): string => {
  const minutes = String(n % 60).padStart(2, '0');
  const hours = String(10 + Math.floor(n / 60)).padStart(2, '0');
  return `2026-09-20T${hours}:${minutes}:00.000Z`;
};
const ts = fixedTs;

export const COMPANY_ID = fixedId(1);
export const USER_ID = fixedId(2);
export const DEVICE_ID = 'tablet-a';
export const CLIENT_ID = fixedId(3);
export const CLIENT_SITE_ID = fixedId(9);
export const EMPRESA_ID = fixedId(4);
export const INSTRUMENT_ID = fixedId(5);
export const TEMPLATE_ID = fixedId(6);
export const PROJECT_ID = fixedId(10);
export const RELATORIO_ID = fixedId(20);
export const CABINE_ID = fixedId(30);
export const EQUIPMENT_1_ID = fixedId(40);
export const EQUIPMENT_2_ID = fixedId(41);
export const BLOCK_1_ID = fixedId(50);
export const BLOCK_2_ID = fixedId(51);
export const BLOCK_3_ID = fixedId(52);
export const PHOTO_ID = fixedId(60);
export const PREVIEW_FILE_ID = fixedId(61);
export const DOCX_FILE_ID = fixedId(62);
export const PDF_FILE_ID = fixedId(63);
export const POINT_ID = fixedId(70);
export const SUGGESTION_1_ID = fixedId(80);
export const SUGGESTION_2_ID = fixedId(81);
export const READING_RUN_ID = fixedId(82);
export const GENERATION_JOB_ID = fixedId(90);
export const REVISION_ID = fixedId(91);
export const BATCH_1_ID = fixedId(100);
export const BATCH_2_ID = fixedId(101);

interface Step {
  kind: OpKind;
  scope: Scope;
  path: string;
  value: unknown;
  batch_id?: string;
  meta?: Op['meta'];
  prev_op_id?: string;
  server?: boolean;
  actor?: string;
}

const SEED_VERSION = 'v1';
const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

const blockRow = (id: string, block_type: string, equipment_id: string | null, order_key: string) => ({
  id,
  relatorio_id: RELATORIO_ID,
  location_id: CABINE_ID,
  equipment_id,
  block_type,
  config: { block_type, sub_blocks: {}, na_defaults: [] },
  seed_version: SEED_VERSION,
  order_key,
  feeds_block_id: null,
  not_tested: null,
  concluded_by: null,
  sheet: emptySheet(),
  created_by: null,
  first_edited_at: null,
  last_modified_by: null,
  last_modified_at: null,
  removed_at: null,
});

const steps: Step[] = [
  {
    kind: 'create',
    scope: 'company',
    path: `registry/empresa/${EMPRESA_ID}`,
    value: {
      id: EMPRESA_ID,
      kind: 'empresa',
      name: 'Empresa de Ensaios Ltda',
      cnpj: '00.000.000/0001-00',
      address: null,
      phone: null,
      email: null,
      form_title: 'Relatório Técnico de Cabine Primária',
      form_code: 'FO.SERV-03',
      form_revision: 'Revisão 01',
      logo_file_id: null,
      watermark_file_id: null,
      cover_background_file_id: null,
      removed_at: null,
    },
  },
  {
    kind: 'create',
    scope: 'company',
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
  },
  {
    kind: 'put',
    scope: 'company',
    path: `registry/client/${CLIENT_ID}/sites`,
    value: [{ id: CLIENT_SITE_ID, address: 'Rua Um, 100' }],
  },
  {
    kind: 'create',
    scope: 'company',
    path: `registry/instrument/${INSTRUMENT_ID}`,
    value: {
      id: INSTRUMENT_ID,
      kind: 'instrument',
      code: 'MEG-01',
      name: 'Megômetro digital',
      manufacturer: 'Megabras',
      model: 'MI-5500',
      serial: '12345',
      cert_number: 'CAL-2026-001',
      laboratory: 'Laboratorio Exemplo',
      calibrated_at: '2026-01-15',
      calibration_interval_months: 12,
      rbc_accredited: true,
      test_isolacao: { raw: '2500', unit: 'V' },
      test_resistencia_contato: null,
      test_relacao_transformacao: null,
      certificate_file_id: null,
      removed_at: null,
    },
  },
  {
    kind: 'create',
    scope: 'company',
    path: `template/${TEMPLATE_ID}`,
    value: { id: TEMPLATE_ID, name: 'Cabine primaria', version: 1, seed_version: SEED_VERSION, blocks: [], skeleton: [], removed_at: null },
  },
  { kind: 'put', scope: 'company', path: `template/${TEMPLATE_ID}/name`, value: 'Cabine primaria padrao' },
  {
    kind: 'create',
    scope: 'company',
    path: `project/${PROJECT_ID}`,
    value: { id: PROJECT_ID, client_id: CLIENT_ID, name: 'Unidade Norte', site: null, removed_at: null },
  },
  { kind: 'put', scope: 'company', path: `project/${PROJECT_ID}/site`, value: 'Galpao 3' },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `relatorio/${RELATORIO_ID}`,
    value: {
      id: RELATORIO_ID,
      project_id: PROJECT_ID,
      template_id: TEMPLATE_ID,
      template_version: 1,
      seed_version: SEED_VERSION,
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
  },
  { kind: 'put', scope: 'relatorio', path: 'relatorio/setup/service_start', value: '2026-09-20' },
  { kind: 'put', scope: 'relatorio', path: 'relatorio/setup/responsible_user_id', value: USER_ID },
  { kind: 'put', scope: 'relatorio', path: 'relatorio/status', value: 'em_campo' },
  { kind: 'put', scope: 'relatorio', path: 'relatorio/export/scheme', value: 'ordem_de_campo' },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `location/${CABINE_ID}`,
    value: {
      id: CABINE_ID,
      relatorio_id: RELATORIO_ID,
      parent_id: null,
      kind: 'cabine',
      name: 'Cabine principal',
      order_key: 'a0',
      se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
      env: { altitude_m: null, temperature_c: null, humidity_pct: null },
      agrupar_por_tipo: false,
      removed_at: null,
    },
  },
  { kind: 'put', scope: 'relatorio', path: `location/${CABINE_ID}/se/type`, value: 'abrigada' },
  { kind: 'put', scope: 'relatorio', path: `location/${CABINE_ID}/se/primary_kv`, value: measured('13.8', 'kV') },
  { kind: 'put', scope: 'relatorio', path: `location/${CABINE_ID}/env/temperature_c`, value: measured('27', 'C') },
  { kind: 'put', scope: 'relatorio', path: `location/${CABINE_ID}/agrupar_por_tipo`, value: true },
  {
    kind: 'create',
    scope: 'project',
    path: `equipment/${EQUIPMENT_1_ID}`,
    value: { id: EQUIPMENT_1_ID, project_id: PROJECT_ID, tag: 'TR-01', type: 'transformador_forca', last_nameplate: null, removed_at: null },
  },
  {
    kind: 'create',
    scope: 'project',
    path: `equipment/${EQUIPMENT_2_ID}`,
    value: { id: EQUIPMENT_2_ID, project_id: PROJECT_ID, tag: 'DJ-01', type: 'disjuntor_mt', last_nameplate: null, removed_at: null },
  },
  { kind: 'put', scope: 'project', path: `equipment/${EQUIPMENT_2_ID}/tag`, value: 'DJ-01A' },
  // One batch: three blocks born together (instantiateTemplate shape).
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_1_ID}`, value: blockRow(BLOCK_1_ID, 'transformador_forca', EQUIPMENT_1_ID, 'a0'), batch_id: BATCH_1_ID },
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_2_ID}`, value: blockRow(BLOCK_2_ID, 'disjuntor_mt', EQUIPMENT_2_ID, 'a1'), batch_id: BATCH_1_ID },
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_3_ID}`, value: blockRow(BLOCK_3_ID, 'cabos_saida', null, 'a2'), batch_id: BATCH_1_ID },
  // A second create on an existing id is a no-op.
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_1_ID}`, value: blockRow(BLOCK_1_ID, 'transformador_forca', EQUIPMENT_1_ID, 'zz') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/fabricacao`, value: 'WEG' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/fabricacao`, value: 'WEG S.A.' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/checklist/limpeza/result`, value: 'C' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/checklist/limpeza/observation`, value: 'Sem observacoes' },
  {
    kind: 'put',
    scope: 'relatorio',
    path: `sheet/${BLOCK_1_ID}/test/isolacao/instrument`,
    value: {
      instrument_id: INSTRUMENT_ID,
      code: 'MEG-01',
      manufacturer: 'Megabras',
      model: 'MI-5500',
      serial: '12345',
      cert_number: 'CAL-2026-001',
      calibrated_at: '2026-01-15',
      valid_until: '2027-01-15',
      test_parameter: 'Resistencia de isolamento',
    },
  },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/test/isolacao/cell/0/1`, value: measured('2500', 'MΩ') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/test/isolacao/cell/1/1`, value: measured('3100', 'MΩ') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/test/isolacao/cell/2/2`, value: { raw: '', unit: 'MΩ', state: 'not_measured' } },
  {
    kind: 'put',
    scope: 'relatorio',
    path: `sheet/${BLOCK_1_ID}/test/isolacao/criterion_override`,
    value: { operator: '>=', value: '1000', unit: 'MΩ', source: 'aceitavel na ficha' },
  },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/conclusion/result`, value: 'aprovado' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/observations`, value: 'Equipamento em bom estado.' },
  {
    kind: 'put',
    scope: 'relatorio',
    path: `block/${BLOCK_2_ID}/not_tested`,
    value: { reason: 'impossibilidade_desligamento', text: null, at: ts(35), by: USER_ID },
  },
  // Tombstone, restore, then edit the restored block.
  { kind: 'remove', scope: 'relatorio', path: `block/${BLOCK_3_ID}/removed_at`, value: null },
  { kind: 'put', scope: 'relatorio', path: `block/${BLOCK_3_ID}/removed_at`, value: null },
  { kind: 'put', scope: 'relatorio', path: `block/${BLOCK_3_ID}/feeds_block_id`, value: BLOCK_1_ID },
  { kind: 'put', scope: 'relatorio', path: `block/${BLOCK_3_ID}/order_key`, value: 'a1V' },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `point/${POINT_ID}`,
    value: { id: POINT_ID, relatorio_id: RELATORIO_ID, text: 'Aterramento a verificar', equipment_id: null, origin: 'manual', order_key: 'a0', removed_at: null },
  },
  { kind: 'put', scope: 'relatorio', path: `point/${POINT_ID}/text`, value: `Aterramento a verificar [[foto:${PHOTO_ID}]]` },
  // Photo captured against block 2: attribution on the block through block_id.
  {
    kind: 'create',
    scope: 'relatorio',
    path: `file/${PHOTO_ID}`,
    value: {
      id: PHOTO_ID,
      company_id: COMPANY_ID,
      relatorio_id: RELATORIO_ID,
      kind: 'photo',
      sha256: 'a'.repeat(64),
      mime: 'image/jpeg',
      size: 245811,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: ts(42),
      tz_offset: -180,
      coords: { lat: -23.5505, lng: -46.6333, accuracy_m: 8.5, source: 'geolocation' },
      local_seq: 1,
      block_id: BLOCK_2_ID,
      item_key: null,
      caption: null,
      reading_kind: 'plate',
      reading_target: { block_id: BLOCK_2_ID, block_type: 'disjuntor_mt' },
      reading_status: 'none',
    },
  },
  { kind: 'put', scope: 'relatorio', path: `file/${PHOTO_ID}/caption`, value: 'Placa do disjuntor' },
  // Server-only ops emitted by the files and reading jobs.
  { kind: 'put', scope: 'relatorio', path: `file/${PHOTO_ID}/uploaded_at`, value: ts(45), server: true, actor: 'system:files' },
  { kind: 'put', scope: 'relatorio', path: `file/${PHOTO_ID}/variants`, value: { thumb: `company/${COMPANY_ID}/relatorio/${RELATORIO_ID}/photo/${PHOTO_ID}/thumb`, print: `company/${COMPANY_ID}/relatorio/${RELATORIO_ID}/photo/${PHOTO_ID}/print` }, server: true, actor: 'system:files' },
  { kind: 'put', scope: 'relatorio', path: `file/${PHOTO_ID}/reading_status`, value: 'done', server: true, actor: 'system:reading' },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `suggestion/${SUGGESTION_1_ID}`,
    value: {
      id: SUGGESTION_1_ID,
      relatorio_id: RELATORIO_ID,
      target_path: `sheet/${BLOCK_1_ID}/nameplate/tensao_nominal_at`,
      value: '13800',
      trust: 'suggested',
      mode: 'fill',
      source: { photo_id: PHOTO_ID, bbox: [0.1, 0.2, 0.4, 0.25], ocr_token_ids: ['t3'], reading_run_id: READING_RUN_ID },
      status: 'pending',
      prompt_version: 'p1',
    },
    server: true,
    actor: 'system:reading',
  },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `suggestion/${SUGGESTION_2_ID}`,
    value: {
      id: SUGGESTION_2_ID,
      relatorio_id: RELATORIO_ID,
      target_path: `sheet/${BLOCK_1_ID}/nameplate/potencia_nominal`,
      value: '750',
      trust: 'verify',
      mode: 'fill',
      source: { photo_id: PHOTO_ID, bbox: [0.1, 0.3, 0.4, 0.35], ocr_token_ids: ['t7', 't8'], reading_run_id: READING_RUN_ID },
      status: 'pending',
      prompt_version: 'p1',
    },
    server: true,
    actor: 'system:reading',
  },
  // "Confirmar": one batch of two ops, the cell carries provenance.
  { kind: 'put', scope: 'relatorio', path: `suggestion/${SUGGESTION_1_ID}/status`, value: 'confirmed', batch_id: BATCH_2_ID },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/tensao_nominal_at`, value: '13800', meta: { source_suggestion_id: SUGGESTION_1_ID }, batch_id: BATCH_2_ID },
  // Confirmed, then overwritten by a plain put: provenance cleared, suggestion 2 leaves the snapshot.
  { kind: 'put', scope: 'relatorio', path: `suggestion/${SUGGESTION_2_ID}/status`, value: 'confirmed' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/potencia_nominal`, value: '750', meta: { source_suggestion_id: SUGGESTION_2_ID } },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/potencia_nominal`, value: '1000' },
  // Dead op (rejected by the server): excluded from state on every side.
  { kind: 'put', scope: 'relatorio', path: `location/${CABINE_ID}/name`, value: 'MUST NOT APPEAR' },
  { kind: 'put', scope: 'relatorio', path: `block/${BLOCK_1_ID}/concluded_by`, value: { actor_id: USER_ID, at: ts(57) } },
  // Generation: server-only job, preview file and pointer, revision, last_nameplate projection.
  {
    kind: 'create',
    scope: 'relatorio',
    path: `generation_job/${GENERATION_JOB_ID}`,
    value: { id: GENERATION_JOB_ID, relatorio_id: RELATORIO_ID, kind: 'preview', status: 'queued', error: null, result_file_id: null, created_at: ts(58) },
    server: true,
    actor: 'system:generate',
  },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `file/${PREVIEW_FILE_ID}`,
    value: { id: PREVIEW_FILE_ID, company_id: COMPANY_ID, relatorio_id: RELATORIO_ID, kind: 'preview', sha256: 'b'.repeat(64), mime: 'application/pdf', size: 88213, uploaded_at: ts(59), variants: null, removed_at: null },
    server: true,
    actor: 'system:generate',
  },
  { kind: 'put', scope: 'relatorio', path: 'relatorio/preview_file_id', value: PREVIEW_FILE_ID, server: true, actor: 'system:generate' },
  { kind: 'put', scope: 'relatorio', path: `generation_job/${GENERATION_JOB_ID}/status`, value: 'done', server: true, actor: 'system:generate' },
  { kind: 'put', scope: 'relatorio', path: `generation_job/${GENERATION_JOB_ID}/result_file_id`, value: PREVIEW_FILE_ID, server: true, actor: 'system:generate' },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `revision/${REVISION_ID}`,
    value: { id: REVISION_ID, relatorio_id: RELATORIO_ID, number: 1, snapshot_seq: 62, created_by: USER_ID, docx_file_id: DOCX_FILE_ID, pdf_file_id: PDF_FILE_ID, created_at: ts(63) },
    server: true,
    actor: 'system:generate',
  },
  {
    kind: 'put',
    scope: 'project',
    path: `equipment/${EQUIPMENT_1_ID}/last_nameplate`,
    value: { relatorio_id: RELATORIO_ID, revision_number: 1, issued_at: ts(63), seed_version: SEED_VERSION, block_type: 'transformador_forca', fields: { fabricacao: 'WEG S.A.', tensao_nominal_at: '13800', potencia_nominal: '1000' } },
    server: true,
    actor: 'system:generate',
  },
  // A user field edit (company scope). The user row is born by the provisioning projection
  // (`user/{id}` create, `system:identity`), which this log leaves out, so the put is a no-op here.
  { kind: 'put', scope: 'company', path: `user/${USER_ID}/registration_number`, value: 'SP 000000' },
];

const DEAD_STEP_INDEX = steps.findIndex((s) => s.value === 'MUST NOT APPEAR');

/** The op log in `seq` order (`seq` = position, starting at 1). */
export const opLog: Op[] = steps.map((step, index) => {
  const n = index + 1;
  return opSchema.parse({
    op_id: fixedOpId(n),
    kind: step.kind,
    scope: step.scope,
    company_id: COMPANY_ID,
    project_id: step.scope === 'project' ? PROJECT_ID : null,
    relatorio_id: step.scope === 'relatorio' ? RELATORIO_ID : null,
    path: step.path,
    value: step.value,
    prev_op_id: step.prev_op_id ?? null,
    batch_id: step.batch_id ?? null,
    meta: step.meta ?? null,
    actor_id: step.actor ?? USER_ID,
    device_id: step.server ? 'server' : DEVICE_ID,
    client_ts: ts(n),
    seq: n,
  });
});

/** Op ids the server rejected: excluded from state on every side (AD-24). */
export const deadOpIds: readonly string[] = [fixedOpId(DEAD_STEP_INDEX + 1)];

/** Ids of the two batches in the log. */
export const batchIds = { blocks: BATCH_1_ID, confirm: BATCH_2_ID } as const;

/** The golden `RelatorioSnapshot`, committed as canonical JSON. */
export const goldenSnapshot: unknown = golden;

export const replaySmall = {
  companyId: COMPANY_ID,
  relatorioId: RELATORIO_ID,
  userId: USER_ID,
  deviceId: DEVICE_ID,
  log: opLog,
  deadOpIds,
  golden: goldenSnapshot,
} as const;
