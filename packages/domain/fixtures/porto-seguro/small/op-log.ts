import { emptySheet, getDefinition, opSchema, type Op, type OpKind, type Scope } from '../../../src/index.ts';
import { NA_ITEMS_BY_TYPE } from '../data.ts';
import golden from './snapshot.golden.json' with { type: 'json' };
import { CABINE_NAME, CHAVE_DATA, DISJUNTOR_DATA, TRANSFORMADOR_DATA } from './data.ts';

/*
 * Story 3.7 TC-8: the small Porto Seguro-shaped fixture, same harness, a distinct hex prefix
 * (`019966c1`) so it, `replay-small` (`019966b0`) and the full Porto Seguro fixture
 * (`019966c0`) can all be imported in the same test file without id collisions.
 */

const SEED_VERSION = 'v1';

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
export const fixedId = (n: number): string => `019966c1-0000-7000-8000-${hex(n, 12)}`;
export const fixedOpId = (n: number): string => `019966c1-0001-7000-8000-${hex(n, 12)}`;
const BASE_TS = Date.UTC(2026, 8, 6, 8, 0, 0);
export const fixedTs = (n: number): string => new Date(BASE_TS + n * 60_000).toISOString();

export const COMPANY_ID = fixedId(1);
export const USER_ID = fixedId(2);
export const DEVICE_ID = 'tablet-porto-seguro-small';
export const CLIENT_ID = fixedId(3);
export const INSTRUMENT_MEGOHMETRO_ID = fixedId(4);
export const INSTRUMENT_MICROHMETRO_ID = fixedId(5);
export const INSTRUMENT_RATIOMETRO_ID = fixedId(15);
export const PROJECT_ID = fixedId(6);
export const RELATORIO_ID = fixedId(7);
export const CABINE_ID = fixedId(8);
export const EQUIPMENT_CHAVE_ID = fixedId(9);
export const EQUIPMENT_DISJUNTOR_ID = fixedId(10);
export const EQUIPMENT_TRANSFORMADOR_ID = fixedId(11);
export const BLOCK_CHAVE_ID = fixedId(12);
export const BLOCK_DISJUNTOR_ID = fixedId(13);
export const BLOCK_TRANSFORMADOR_ID = fixedId(14);

interface Step {
  kind: OpKind;
  scope: Scope;
  path: string;
  value: unknown;
}

const steps: Step[] = [];
const push = (step: Step): void => {
  steps.push(step);
};

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });

function blockRow(id: string, blockType: string, equipmentId: string, config: unknown, orderKey: string) {
  return {
    id,
    relatorio_id: RELATORIO_ID,
    location_id: CABINE_ID,
    equipment_id: equipmentId,
    block_type: blockType,
    config,
    seed_version: SEED_VERSION,
    order_key: orderKey,
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: emptySheet(),
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

function checklistSteps(blockId: string, blockType: 'chave_seccionadora' | 'disjuntor_mt' | 'transformador_forca'): void {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', blockType);
  const na = new Set(NA_ITEMS_BY_TYPE[blockType] ?? []);
  for (const item of definition.checklist ?? []) {
    push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/checklist/${item.key}/result`, value: na.has(item.key) ? 'NA' : 'C' });
  }
}

function nameplateSteps(blockId: string, blockType: 'chave_seccionadora' | 'disjuntor_mt' | 'transformador_forca', np: Record<string, string>): void {
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', blockType);
  for (const [key, raw] of Object.entries(np)) {
    const field = definition.nameplate.find((f) => f.key === key)!;
    push({
      kind: 'put',
      scope: 'relatorio',
      path: `sheet/${blockId}/nameplate/${key}`,
      value: field.kind === 'number' || field.kind === 'voltage_class' ? measured(raw, field.unit ?? null) : raw,
    });
  }
}

// --- company + project + relatorio + location ---------------------------------------------

push({
  kind: 'create',
  scope: 'company',
  path: `registry/client/${CLIENT_ID}`,
  value: { id: CLIENT_ID, kind: 'client', name: 'Cliente de Testes Ltda', cnpj: null, contact_name: null, contact_phone: null, sites: [], removed_at: null },
});
push({
  kind: 'create',
  scope: 'company',
  path: `registry/instrument/${INSTRUMENT_MEGOHMETRO_ID}`,
  value: {
    id: INSTRUMENT_MEGOHMETRO_ID,
    kind: 'instrument',
    code: '2E',
    name: 'Megôhmetro Digital',
    manufacturer: 'Instrument',
    model: 'DMG10Ki',
    serial: 'TEST-MEG-01',
    cert_number: '00000/26',
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: true,
    test_isolacao: { raw: '10', unit: 'kV' },
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
  },
});
push({
  kind: 'create',
  scope: 'company',
  path: `registry/instrument/${INSTRUMENT_MICROHMETRO_ID}`,
  value: {
    id: INSTRUMENT_MICROHMETRO_ID,
    kind: 'instrument',
    code: '3M',
    name: 'Micro-Ohmmeter',
    manufacturer: 'Hi-Tech',
    model: 'HTMO-10',
    serial: 'TEST-MIC-01',
    cert_number: '00001/26',
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: true,
    test_isolacao: null,
    test_resistencia_contato: { raw: '10', unit: 'A' },
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
  },
});
push({
  kind: 'create',
  scope: 'company',
  path: `registry/instrument/${INSTRUMENT_RATIOMETRO_ID}`,
  value: {
    id: INSTRUMENT_RATIOMETRO_ID,
    kind: 'instrument',
    code: '1T',
    name: 'Transformer Ratiometer',
    manufacturer: 'Hi-Tech',
    model: 'HTRT-8K',
    serial: 'TEST-RAT-01',
    cert_number: '00002/26',
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: true,
    test_isolacao: null,
    test_resistencia_contato: null,
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
  },
});
push({ kind: 'create', scope: 'company', path: `project/${PROJECT_ID}`, value: { id: PROJECT_ID, client_id: CLIENT_ID, name: 'Projeto de Testes', site: 'Local de Testes', removed_at: null } });
push({
  kind: 'create',
  scope: 'relatorio',
  path: `relatorio/${RELATORIO_ID}`,
  value: {
    id: RELATORIO_ID,
    project_id: PROJECT_ID,
    template_id: null,
    template_version: null,
    seed_version: SEED_VERSION,
    status: 'em_campo',
    setup: { service_start: '2026-09-06', service_end: null, atividade: null, local: null, responsible_user_id: USER_ID, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  },
});
push({
  kind: 'create',
  scope: 'relatorio',
  path: `location/${CABINE_ID}`,
  value: {
    id: CABINE_ID,
    relatorio_id: RELATORIO_ID,
    parent_id: null,
    kind: 'cabine',
    name: CABINE_NAME,
    order_key: 'a0',
    se: { type: 'ALVENARIA - CONVENCIONAL', primary_kv: measured('13.8', 'kV'), secondary_kv: measured('380/220', 'V'), installed_kva: measured('300', 'kVA') },
    env: { altitude_m: measured('<1000', 'm'), temperature_c: measured('20', '°C'), humidity_pct: measured('60', '%') },
    agrupar_por_tipo: false,
    removed_at: null,
  },
});

// --- chave_seccionadora ---------------------------------------------------------------------

push({ kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_CHAVE_ID}`, value: { id: EQUIPMENT_CHAVE_ID, project_id: PROJECT_ID, tag: CHAVE_DATA.tag, type: 'chave_seccionadora', last_nameplate: null, removed_at: null } });
push({
  kind: 'create',
  scope: 'relatorio',
  path: `block/${BLOCK_CHAVE_ID}`,
  value: blockRow(BLOCK_CHAVE_ID, 'chave_seccionadora', EQUIPMENT_CHAVE_ID, { block_type: 'chave_seccionadora', subtype: 'manual', sub_blocks: {}, na_defaults: ['motor', 'fusiveis'] }, 'a0'),
});
nameplateSteps(BLOCK_CHAVE_ID, 'chave_seccionadora', CHAVE_DATA.np);
checklistSteps(BLOCK_CHAVE_ID, 'chave_seccionadora');
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/test/isolacao/instrument`, value: { instrument_id: INSTRUMENT_MEGOHMETRO_ID, code: '2E', manufacturer: 'Instrument', model: 'DMG10Ki', serial: 'TEST-MEG-01', cert_number: '00000/26', calibrated_at: null, valid_until: null, test_parameter: 'Resistência de isolação' } });
CHAVE_DATA.contact.forEach((v, r) => push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/test/isolacao/cell/${r}/0`, value: measured(v, 'GΩ') }));
CHAVE_DATA.contact.forEach((v, r) => push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/test/isolacao/cell/${r + 3}/0`, value: measured(v, 'GΩ') }));
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/test/resistencia_contato/instrument`, value: { instrument_id: INSTRUMENT_MICROHMETRO_ID, code: '3M', manufacturer: 'Hi-Tech', model: 'HTMO-10', serial: 'TEST-MIC-01', cert_number: '00001/26', calibrated_at: null, valid_until: null, test_parameter: 'Resistência ôhmica de contato' } });
CHAVE_DATA.rc.forEach((v, r) => push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/test/resistencia_contato/cell/${r}/0`, value: measured(v, 'µΩ') }));
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/conclusion/result`, value: 'aprovado' });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_CHAVE_ID}/conclusion/restriction`, value: 'sem_restricoes' });

// --- disjuntor_mt: designated not_tested, per the full fixture's own pattern (TC-8 parity) --

push({ kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_DISJUNTOR_ID}`, value: { id: EQUIPMENT_DISJUNTOR_ID, project_id: PROJECT_ID, tag: DISJUNTOR_DATA.tag, type: 'disjuntor_mt', last_nameplate: null, removed_at: null } });
push({
  kind: 'create',
  scope: 'relatorio',
  path: `block/${BLOCK_DISJUNTOR_ID}`,
  value: blockRow(BLOCK_DISJUNTOR_ID, 'disjuntor_mt', EQUIPMENT_DISJUNTOR_ID, { block_type: 'disjuntor_mt', sub_blocks: {}, na_defaults: [] }, 'a1'),
});
nameplateSteps(BLOCK_DISJUNTOR_ID, 'disjuntor_mt', DISJUNTOR_DATA.np);
push({ kind: 'put', scope: 'relatorio', path: `block/${BLOCK_DISJUNTOR_ID}/not_tested`, value: { reason: 'Solicitação do cliente', text: 'Ensaio não realizado nesta fixture reduzida (dado sintético).', at: fixedTs(30), by: USER_ID } });

// --- transformador_forca ---------------------------------------------------------------------

push({ kind: 'create', scope: 'project', path: `equipment/${EQUIPMENT_TRANSFORMADOR_ID}`, value: { id: EQUIPMENT_TRANSFORMADOR_ID, project_id: PROJECT_ID, tag: TRANSFORMADOR_DATA.tag, type: 'transformador_forca', last_nameplate: null, removed_at: null } });
push({
  kind: 'create',
  scope: 'relatorio',
  path: `block/${BLOCK_TRANSFORMADOR_ID}`,
  value: blockRow(BLOCK_TRANSFORMADOR_ID, 'transformador_forca', EQUIPMENT_TRANSFORMADOR_ID, { block_type: 'transformador_forca', subtype: 'a_seco', sub_blocks: {}, na_defaults: NA_ITEMS_BY_TYPE.transformador_forca ?? [] }, 'a2'),
});
nameplateSteps(BLOCK_TRANSFORMADOR_ID, 'transformador_forca', TRANSFORMADOR_DATA.np);
checklistSteps(BLOCK_TRANSFORMADOR_ID, 'transformador_forca');
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/instrument`, value: { instrument_id: INSTRUMENT_MEGOHMETRO_ID, code: '2E', manufacturer: 'Instrument', model: 'DMG10Ki', serial: 'TEST-MEG-01', cert_number: '00000/26', calibrated_at: null, valid_until: null, test_parameter: 'Resistência de isolação' } });
TRANSFORMADOR_DATA.isoRows.forEach((v, r) => {
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/cell/${r}/0`, value: { raw: '', unit: 'GΩ', state: 'not_measured' } });
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/cell/${r}/1`, value: measured(v, 'GΩ') });
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/cell/${r}/2`, value: { raw: '', unit: 'GΩ', state: 'not_measured' } });
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/cell/${r}/3`, value: { raw: '', unit: null, state: 'not_measured' } });
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/isolacao/cell/${r}/4`, value: { raw: '', unit: null, state: 'not_measured' } });
});
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/instrument`, value: { instrument_id: INSTRUMENT_RATIOMETRO_ID, code: '1T', manufacturer: 'Hi-Tech', model: 'HTRT-8K', serial: 'TEST-RAT-01', cert_number: '00002/26', calibrated_at: null, valid_until: null, test_parameter: 'Relação de transformação' } });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/cell/0/0`, value: measured(TRANSFORMADOR_DATA.ratio.p, 'kV') });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/cell/0/1`, value: measured(TRANSFORMADOR_DATA.ratio.s, 'V') });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/cell/0/3`, value: measured(TRANSFORMADOR_DATA.ratio.cap[0], null) });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/cell/0/4`, value: measured(TRANSFORMADOR_DATA.ratio.cap[1], null) });
push({ kind: 'put', scope: 'relatorio', path: `sheet/${BLOCK_TRANSFORMADOR_ID}/test/relacao_transformacao/cell/0/5`, value: measured(TRANSFORMADOR_DATA.ratio.cap[2], null) });
// The 8 transformador_forca sheets in the full fixture are cropped (no OBSERVAÇÕES/CONCLUSÃO);
// this synthetic block mirrors that, for TC-8 parity.

// --- assemble --------------------------------------------------------------------------------

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
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: fixedTs(n),
    seq: n,
  });
});

export const deadOpIds: readonly string[] = [];
export const goldenSnapshot: unknown = golden;

export const portoSeguroSmall = {
  companyId: COMPANY_ID,
  relatorioId: RELATORIO_ID,
  projectId: PROJECT_ID,
  userId: USER_ID,
  deviceId: DEVICE_ID,
  log: opLog,
  deadOpIds,
  golden: goldenSnapshot,
} as const;
