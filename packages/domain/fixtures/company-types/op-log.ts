import { companySubBlocksOf, emptySheet, getDefinition, opSchema, type CompanyTypeDefinition, type Op, type OpKind, type Scope } from '../../src/index.ts';

/*
 * Story 14.6 (AD-3 note of 2026-11-06, "Replay"): the AD-3 log with company equipment types. One
 * company type published as v1 and renamed in v2, a second type published and then retired, and
 * one block of each version (both versions of the first type, the retired type's v1), each with
 * sheet writes; a draft left open after v2. Replayed in `seq` order through `replay()`, the Dexie
 * layer and the Drizzle layer it must yield byte-equal snapshots, with `equipment_types` naming
 * the three versions the blocks reference. Fixed uuidv7 ids and timestamps.
 */

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
/** Fixed entity ids: `019a5c00-0000-7000-8000-0000000000NN`. */
export const fixedId = (n: number): string => `019a5c00-0000-7000-8000-${hex(n, 12)}`;
/** Fixed op ids: `019a5c00-0001-7000-8000-0000000000NN`. */
export const fixedOpId = (n: number): string => `019a5c00-0001-7000-8000-${hex(n, 12)}`;
/** One minute per op after 2026-11-07T10:00:00Z. */
export const fixedTs = (n: number): string => {
  const minutes = String(n % 60).padStart(2, '0');
  const hours = String(10 + Math.floor(n / 60)).padStart(2, '0');
  return `2026-11-07T${hours}:${minutes}:00.000Z`;
};

export const COMPANY_ID = fixedId(1);
export const USER_ID = fixedId(2);
export const DEVICE_ID = 'tablet-a';
export const TYPE_1_ID = fixedId(3);
export const TYPE_2_ID = fixedId(4);
export const VERSION_1_ID = fixedId(5);
export const VERSION_2_ID = fixedId(6);
export const VERSION_3_ID = fixedId(7);
export const PROJECT_ID = fixedId(10);
export const RELATORIO_ID = fixedId(20);
export const CABINE_ID = fixedId(30);
export const EQUIPMENT_1_ID = fixedId(40);
export const EQUIPMENT_2_ID = fixedId(41);
export const EQUIPMENT_3_ID = fixedId(42);
export const BLOCK_1_ID = fixedId(50);
export const BLOCK_2_ID = fixedId(51);
export const BLOCK_3_ID = fixedId(52);

export const SEED_VERSION = 'v12';
export const TYPE_1 = `type:${TYPE_1_ID}` as const;
export const TYPE_2 = `type:${TYPE_2_ID}` as const;

const source = { name: 'Manual do fabricante', edition: 'rev. 3' };

/** The insulation test of the v12 para-raio: one seeded grammar a company type carries, judged by its own criterion. */
const insulation = structuredClone(getDefinition(SEED_VERSION, 'cabine_primaria', 'para_raio').tests[0]!);

/** Version 1 of the first type: a no-break de comando (invented example data, never Bruno's). */
export const DEFINITION_1: CompanyTypeDefinition = {
  label: 'No-break de comando',
  tag_prefix: 'NB',
  noun: { singular: 'no-break', plural: 'no-breaks', gender: 'm' },
  nameplate: [
    { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
    { key: 'modelo', label: 'MODELO', kind: 'text' },
    { key: 'tensao_de_saida', label: 'TENSÃO DE SAÍDA', kind: 'number', unit: 'Vcc' },
  ],
  checklist: [
    { key: 'limpeza_e_fixacao', label: 'Limpeza e fixação do gabinete', nc_phrases: ['Gabinete sujo', 'Fixação solta', 'Corrosão aparente'] },
    { key: 'bornes', label: 'Bornes e conexões das baterias', nc_phrases: ['Bornes oxidados', 'Conexão frouxa', 'Vazamento de eletrólito'] },
  ],
  tests: [insulation],
  measurement_tests: [
    {
      key: 'tensoes_medidas',
      label: 'Tensões medidas',
      row_header: 'Medição',
      columns: [{ key: 'valor', label: 'Valor medido', kind: 'number', unit: 'Vcc' }],
      rows: [
        { key: 'saida', label: 'Tensão de saída' },
        { key: 'flutuacao', label: 'Tensão de flutuação do banco' },
      ],
      criteria: [
        { type: 'absolute', seeded: 'tensao_saida', rows: ['saida'], source },
        { type: 'absolute', seeded: 'flutuacao', rows: ['flutuacao'], source },
      ],
    },
  ],
  criteria: [
    { key: 'isolacao', label: 'Isolamento mínimo', operator: '>', value: 100, unit: 'MΩ', type: 'absolute_min', source },
    { key: 'tensao_saida', label: 'Tensão de saída', operator: 'between', value: 118, value_max: 132, unit: 'Vcc', type: 'deviation_between', source },
    { key: 'flutuacao', label: 'Flutuação do banco', operator: '>=', value: 132, unit: 'Vcc', type: 'absolute_min', source: { name: 'ABNT NBR 5410', edition: '2004' } },
  ],
};

/** Version 2: renamed, with a print title, the flutuação criterion raised. */
export const DEFINITION_2: CompanyTypeDefinition = {
  ...structuredClone(DEFINITION_1),
  label: 'No-break de comando 125 Vcc',
  print_title: 'No-break de comando',
  criteria: DEFINITION_1.criteria.map((criterion) => (criterion.key === 'flutuacao' ? { ...criterion, value: 133 } : criterion)),
};

/** The second type's only version: a fonte auxiliar with a checklist alone. */
export const DEFINITION_3: CompanyTypeDefinition = {
  label: 'Fonte auxiliar',
  tag_prefix: 'FA',
  noun: { singular: 'fonte auxiliar', plural: 'fontes auxiliares', gender: 'f' },
  nameplate: [{ key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' }],
  checklist: [{ key: 'estado_geral', label: 'Estado geral', nc_phrases: ['Danificada', 'Suja', 'Sem identificação'] }],
  tests: [],
  criteria: [],
};

/** The draft left open after v2 (the next version's). */
export const OPEN_DRAFT = { ...structuredClone(DEFINITION_2), label: 'No-break de comando 125 Vcc (revisado)' };

interface Step {
  kind: OpKind;
  scope: Scope;
  path: string;
  value: unknown;
}

const measured = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });

// e22h S2: a company block names its version row by id beside the number (`type_version_id`).
const blockRow = (id: string, block_type: string, type_version: number, type_version_id: string, equipment_id: string, order_key: string, sub_blocks: Record<string, { enabled: boolean }>) => ({
  id,
  relatorio_id: RELATORIO_ID,
  location_id: CABINE_ID,
  equipment_id,
  block_type,
  config: { block_type, sub_blocks, na_defaults: [], type_version, type_version_id },
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

/** Every sub-block of a definition on, but the IA/IP display columns (`defaultBlockConfigIn`'s rule). */
const subBlocksOf = (definition: CompanyTypeDefinition) => Object.fromEntries(companySubBlocksOf(definition).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
const NOBREAK_SUB_BLOCKS = subBlocksOf(DEFINITION_1);
const FONTE_SUB_BLOCKS = subBlocksOf(DEFINITION_3);

const typeRow = (id: string, draft: unknown) => ({
  id,
  derived_from: { seed_version: SEED_VERSION, block_type: 'chave_transferencia_automatica' },
  draft,
  retired_at: null,
  removed_at: null,
  latest_version: 0,
});
const versionRow = (id: string, typeId: string, version: number, definition: CompanyTypeDefinition, at: number) => ({
  id,
  type_id: typeId,
  version,
  definition,
  published_by: USER_ID,
  published_at: fixedTs(at),
});

const steps: Step[] = [
  // The first type: a draft, published as v1 (the draft cleared), renamed and published as v2, then a draft left open.
  { kind: 'create', scope: 'company', path: `equipment_type/${TYPE_1_ID}`, value: typeRow(TYPE_1_ID, { label: 'No-break' }) },
  { kind: 'put', scope: 'company', path: `equipment_type/${TYPE_1_ID}/draft`, value: DEFINITION_1 },
  { kind: 'create', scope: 'company', path: `equipment_type_version/${VERSION_1_ID}`, value: versionRow(VERSION_1_ID, TYPE_1_ID, 1, DEFINITION_1, 3) },
  { kind: 'put', scope: 'company', path: `equipment_type/${TYPE_1_ID}/draft`, value: DEFINITION_2 },
  { kind: 'create', scope: 'company', path: `equipment_type_version/${VERSION_2_ID}`, value: versionRow(VERSION_2_ID, TYPE_1_ID, 2, DEFINITION_2, 5) },
  { kind: 'put', scope: 'company', path: `equipment_type/${TYPE_1_ID}/draft`, value: OPEN_DRAFT },
  // The second type: published, then retired.
  { kind: 'create', scope: 'company', path: `equipment_type/${TYPE_2_ID}`, value: typeRow(TYPE_2_ID, DEFINITION_3) },
  { kind: 'create', scope: 'company', path: `equipment_type_version/${VERSION_3_ID}`, value: versionRow(VERSION_3_ID, TYPE_2_ID, 1, DEFINITION_3, 8) },
  { kind: 'put', scope: 'company', path: `equipment_type/${TYPE_2_ID}/retired_at`, value: fixedTs(9) },
  // The relatório.
  { kind: 'create', scope: 'company', path: `project/${PROJECT_ID}`, value: { id: PROJECT_ID, client_id: null, name: 'Unidade Sul', site: null, removed_at: null } },
  {
    kind: 'create',
    scope: 'relatorio',
    path: `relatorio/${RELATORIO_ID}`,
    value: {
      id: RELATORIO_ID,
      project_id: PROJECT_ID,
      template_id: null,
      template_version: null,
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
      agrupar_por_tipo: true,
      removed_at: null,
    },
  },
  { kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_1_ID}`, value: { id: EQUIPMENT_1_ID, project_id: PROJECT_ID, tag: 'NB-01', type: TYPE_1, last_nameplate: null, removed_at: null } },
  { kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_2_ID}`, value: { id: EQUIPMENT_2_ID, project_id: PROJECT_ID, tag: 'NB-02', type: TYPE_1, last_nameplate: null, removed_at: null } },
  { kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_3_ID}`, value: { id: EQUIPMENT_3_ID, project_id: PROJECT_ID, tag: 'FA-01', type: TYPE_2, last_nameplate: null, removed_at: null } },
  // A block of each version.
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_1_ID}`, value: blockRow(BLOCK_1_ID, TYPE_1, 1, VERSION_1_ID, EQUIPMENT_1_ID, 'a0', NOBREAK_SUB_BLOCKS) },
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_2_ID}`, value: blockRow(BLOCK_2_ID, TYPE_1, 2, VERSION_2_ID, EQUIPMENT_2_ID, 'a1', NOBREAK_SUB_BLOCKS) },
  { kind: 'create', scope: 'relatorio', path: `block/${BLOCK_3_ID}`, value: blockRow(BLOCK_3_ID, TYPE_2, 1, VERSION_3_ID, EQUIPMENT_3_ID, 'a2', FONTE_SUB_BLOCKS) },
  // Sheet writes through the resolved definitions.
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/nameplate/modelo`, value: 'NB-3000' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/checklist/limpeza_e_fixacao/result`, value: 'C' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/checklist/bornes/result`, value: 'NC' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/checklist/bornes/observation`, value: 'Bornes oxidados' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/test/tensoes_medidas/cell/0/0`, value: measured('125', 'Vcc') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_1_ID}/test/tensoes_medidas/cell/1/0`, value: measured('131', 'Vcc') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_2_ID}/nameplate/tensao_de_saida`, value: measured('125', 'Vcc') },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_2_ID}/checklist/limpeza_e_fixacao/result`, value: 'C' },
  { kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_3_ID}/checklist/estado_geral/result`, value: 'C' },
];

/** The op log in `seq` order (`seq` = position, starting at 1). */
export const companyTypesLog: Op[] = steps.map((step, index) => {
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
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: fixedTs(n),
    seq: n,
  });
});

export const companyTypes = {
  companyId: COMPANY_ID,
  relatorioId: RELATORIO_ID,
  userId: USER_ID,
  log: companyTypesLog,
} as const;
