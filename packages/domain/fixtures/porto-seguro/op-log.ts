import {
  emptySheet,
  getDefinition,
  isEquipmentBlockType,
  opSchema,
  standardTemplate,
  templateTotals,
  type EquipmentBlockType,
  type Op,
  type OpKind,
  type Scope,
  type SkeletonNode,
  type TemplateBlock,
} from '../../src/index.ts';
import type { BlockDefinition, TableDef } from '../../src/seed/schema.ts';
import golden from './snapshot.golden.json' with { type: 'json' };
import {
  CABINE_DATA,
  COBERTURA_A,
  COBERTURA_B,
  COVER,
  ENEL,
  GERADORES_DISJUNTORES,
  GERADORES_SECCIONADORAS,
  GERADORES_TCS,
  GERADORES_TPS,
  INSTRUMENTS,
  NA_ITEMS_BY_TYPE,
  NOT_TESTED_REASON,
  OXIGENIO,
  SECTION_7_PHOTOS,
  SECTION_8_NOT_TESTED_AT,
  SECTION_8_POINTS,
  SUBSOLO_CABLES,
  SUBSOLO_COLUMNS,
  SUBSOLO_TRANSFORMERS,
  notTestedText,
  type Instance,
} from './data.ts';

/*
 * Story 3.7: the Porto Seguro op log. Same harness as `replay-small/op-log.ts` (fixed
 * id/timestamp helpers, a `Step[]`, a final `.map` into `opSchema.parse`), a distinct hex
 * prefix (`019966c0` vs replay-small's `019966b0`) so both fixtures import side by side.
 *
 * Structure: `standardTemplate(...)` is called to get the *real* 94-block skeleton this
 * fixture reproduces (the standard template was itself modeled on this delivered job, per
 * `template.ts`'s own header comment); this generator never re-derives the skeleton or the
 * quantities by hand. `data.ts` supplies one real (or, for the two designated not-tested
 * seccionadoras and the one not-tested disjuntor, deliberately overridden) instance per
 * equipment slot, in exactly the order `standardTemplate`'s own `blocks` array declares
 * them, so the two are zipped 1:1 with a self-check (no lookup, no silent drift).
 */

const SEED_VERSION = 'v1';

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
/** Fixed entity ids: `019966c0-0000-7000-8000-0000000000NN`. */
export const fixedId = (n: number): string => `019966c0-0000-7000-8000-${hex(n, 12)}`;
/** Fixed op ids: `019966c0-0001-7000-8000-0000000000NN`. */
export const fixedOpId = (n: number): string => `019966c0-0001-7000-8000-${hex(n, 12)}`;
/**
 * Fixed timestamps: one minute per op after 2026-09-06T08:00:00.000Z (the job's first day).
 * A `Date` (not a manual hour/minute string) so the op log's thousands of ops -- far more
 * than `replay-small`'s ~90 -- roll cleanly across hours and days, still a pure function of
 * `n` and never a wall-clock read.
 */
const BASE_TS = Date.UTC(2026, 8, 6, 8, 0, 0);
export const fixedTs = (n: number): string => new Date(BASE_TS + n * 60_000).toISOString();

// --- identity ----------------------------------------------------------------------------

export const COMPANY_ID = fixedId(1);
export const USER_ID = fixedId(2);
export const DEVICE_ID = 'tablet-porto-seguro';
export const CLIENT_ID = fixedId(3);
export const EMPRESA_ID = fixedId(4);
export const INSTRUMENT_MEGOHMETRO_ID = fixedId(5);
export const INSTRUMENT_MICROHMETRO_ID = fixedId(6);
export const INSTRUMENT_RATIOMETRO_ID = fixedId(7);
export const PROJECT_ID = fixedId(8);
export const RELATORIO_ID = fixedId(9);

interface Step {
  kind: OpKind;
  scope: Scope;
  path: string;
  value: unknown;
  batch_id?: string;
  meta?: Op['meta'];
}

const steps: Step[] = [];
const push = (step: Step): void => {
  steps.push(step);
};

/** A running, deterministic id counter: the whole log is built once, top to bottom. */
let idSeq = 100;
const newId = (): string => fixedId(idSeq++);

const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const notMeasured = (unit: string | null) => ({ raw: '', unit, state: 'not_measured' as const });

// --- company scope: empresa, client, template-less project, instruments ------------------

push({
  kind: 'create',
  scope: 'company',
  path: `registry/empresa/${EMPRESA_ID}`,
  value: {
    id: EMPRESA_ID,
    kind: 'empresa',
    name: COVER.empresaExecutora,
    cnpj: null,
    address: null,
    phone: null,
    email: null,
    form_title: 'Relatório Técnico de Cabine Primária',
    form_code: 'FO.SERV-03',
    form_revision: 'Revisão 00',
    logo_file_id: null,
    watermark_file_id: null,
    cover_background_file_id: null,
    removed_at: null,
  },
});

push({
  kind: 'create',
  scope: 'company',
  path: `registry/client/${CLIENT_ID}`,
  value: {
    id: CLIENT_ID,
    kind: 'client',
    name: COVER.cliente,
    // No CNPJ is printed anywhere in the delivered document (data.ts header note).
    cnpj: COVER.cnpj,
    contact_name: null,
    contact_phone: null,
    sites: [],
    removed_at: null,
  },
});

function instrumentRow(id: string, inst: (typeof INSTRUMENTS)[keyof typeof INSTRUMENTS], testKey: 'test_isolacao' | 'test_resistencia_contato' | 'test_relacao_transformacao') {
  const defaultCell = inst.defaultRaw === null ? null : { raw: inst.defaultRaw, unit: inst.defaultUnit };
  return {
    id,
    kind: 'instrument' as const,
    code: inst.code,
    name: inst.name,
    manufacturer: inst.manufacturer,
    model: inst.model,
    serial: inst.serial,
    cert_number: inst.certNumber,
    // Not printed anywhere on the sheets (only the cert number and the acceptance value
    // are) -- left null rather than invented; see deferred-work.md.
    laboratory: null,
    calibrated_at: null,
    calibration_interval_months: null,
    rbc_accredited: true,
    test_isolacao: testKey === 'test_isolacao' ? defaultCell : null,
    test_resistencia_contato: testKey === 'test_resistencia_contato' ? defaultCell : null,
    test_relacao_transformacao: testKey === 'test_relacao_transformacao' ? defaultCell : null,
    certificate_file_id: null,
    removed_at: null,
  };
}

push({ kind: 'create', scope: 'company', path: `registry/instrument/${INSTRUMENT_MEGOHMETRO_ID}`, value: instrumentRow(INSTRUMENT_MEGOHMETRO_ID, INSTRUMENTS.megohmetro, 'test_isolacao') });
push({ kind: 'create', scope: 'company', path: `registry/instrument/${INSTRUMENT_MICROHMETRO_ID}`, value: instrumentRow(INSTRUMENT_MICROHMETRO_ID, INSTRUMENTS.microhmetro, 'test_resistencia_contato') });
push({ kind: 'create', scope: 'company', path: `registry/instrument/${INSTRUMENT_RATIOMETRO_ID}`, value: instrumentRow(INSTRUMENT_RATIOMETRO_ID, INSTRUMENTS.ratiometro, 'test_relacao_transformacao') });

push({
  kind: 'create',
  scope: 'company',
  path: `project/${PROJECT_ID}`,
  value: { id: PROJECT_ID, client_id: CLIENT_ID, name: 'Cabines Primárias - Manutenção Preventiva 2026', site: COVER.obra, removed_at: null },
});

// --- relatorio ------------------------------------------------------------------------

push({
  kind: 'create',
  scope: 'relatorio',
  path: `relatorio/${RELATORIO_ID}`,
  value: {
    id: RELATORIO_ID,
    project_id: PROJECT_ID,
    // No template flow: this fixture hand-builds the ops directly (Story 3.7 boundary --
    // `instantiateTemplate` is Epic 4). `standardTemplate` is used only to derive the
    // structure, never persisted as a row here.
    template_id: null,
    template_version: null,
    seed_version: SEED_VERSION,
    status: 'em_revisao',
    setup: {
      service_start: '2026-09-06',
      service_end: '2026-09-08',
      atividade: 'Manutenção preventiva',
      local: COVER.obra,
      responsible_user_id: USER_ID,
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
});

// --- location skeleton: the real `standardTemplate()` skeleton, real per-cabine data -----

const template = standardTemplate({ id: fixedId(10), seedVersion: SEED_VERSION });

const locationIdOf = new Map<string, string>();
for (const node of template.skeleton) locationIdOf.set(node.ref, newId());

/** A sibling-ordered key: `a0`, `a1`, ... `a9`, `aa`, ... (base 36), sorting as the index does. */
const siblingOrderKey = (n: number): string => `a${n.toString(36)}`;

/**
 * Each node's `order_key` among its siblings, in `standardTemplate()`'s skeleton order, which
 * is the delivered document's: Cubículo Enel, 1° Subsolo (Coluna 1 to 17), Oxigênio,
 * Cobertura A, Cobertura B, Geradores.
 */
const locationOrderKeyOf = new Map<string, string>();
{
  const siblingCount = new Map<string | null, number>();
  for (const node of template.skeleton) {
    const n = siblingCount.get(node.parent_ref) ?? 0;
    siblingCount.set(node.parent_ref, n + 1);
    locationOrderKeyOf.set(node.ref, siblingOrderKey(n));
  }
}

function locationRow(node: SkeletonNode) {
  const id = locationIdOf.get(node.ref)!;
  const parent_id = node.parent_ref ? locationIdOf.get(node.parent_ref)! : null;
  if (node.kind === 'coluna') {
    return { id, relatorio_id: RELATORIO_ID, parent_id, kind: 'coluna' as const, name: node.name, order_key: locationOrderKeyOf.get(node.ref)!, removed_at: null };
  }
  const cabine = CABINE_DATA[node.ref];
  return {
    id,
    relatorio_id: RELATORIO_ID,
    parent_id,
    kind: 'cabine' as const,
    name: node.name,
    order_key: locationOrderKeyOf.get(node.ref)!,
    se: {
      type: cabine?.type ?? null,
      primary_kv: cabine ? measured(cabine.primaryKv, 'kV') : null,
      secondary_kv: cabine?.secondaryKv ? measured(cabine.secondaryKv, 'V') : null,
      installed_kva: cabine ? measured(cabine.installedKva, 'kVA') : null,
    },
    env: {
      altitude_m: cabine ? measured(cabine.altitude, 'm') : null,
      temperature_c: cabine ? measured(cabine.temperature, '°C') : null,
      humidity_pct: cabine ? measured(cabine.humidity, '%') : null,
    },
    agrupar_por_tipo: node.agrupar_por_tipo,
    removed_at: null,
  };
}

for (const node of template.skeleton) {
  push({ kind: 'create', scope: 'relatorio', path: `location/${locationIdOf.get(node.ref)}`, value: locationRow(node) });
}

// --- equipment + block data, zipped against `standardTemplate()`'s own equipment blocks ---

const SUBSOLO_COLUMN_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 16, 17];

const dataQueue: Instance[] = [
  ...ENEL,
  ...SUBSOLO_TRANSFORMERS,
  ...SUBSOLO_CABLES,
  ...SUBSOLO_COLUMN_ORDER.flatMap((n) => SUBSOLO_COLUMNS[n] ?? []),
  ...OXIGENIO,
  ...COBERTURA_A,
  ...COBERTURA_B,
  ...GERADORES_SECCIONADORAS,
  ...GERADORES_DISJUNTORES,
  ...GERADORES_TPS,
  ...GERADORES_TCS,
];

const equipmentTemplateBlocks: TemplateBlock[] = template.blocks.filter((b) => isEquipmentBlockType(b.block_type));
const totalPlanned = equipmentTemplateBlocks.reduce((sum, b) => sum + b.quantity, 0);
if (totalPlanned !== dataQueue.length) {
  throw new Error(`porto-seguro fixture: template plans ${totalPlanned} equipment instances but data.ts supplies ${dataQueue.length}`);
}
const totals = templateTotals(template);
if (Object.values(totals).reduce((a, b) => a + b, 0) !== 94) {
  throw new Error('porto-seguro fixture: standardTemplate() no longer totals 94 equipment blocks');
}

/** `sheet/nameplate/{field_key}` value, wrapped per the field's AD-11 kind. */
function nameplateValue(definition: BlockDefinition, key: string, raw: string): unknown {
  const field = definition.nameplate.find((f) => f.key === key);
  if (!field) throw new Error(`porto-seguro fixture: unknown nameplate field "${key}" for ${definition.block_type}`);
  return field.kind === 'number' || field.kind === 'voltage_class' ? measured(raw, field.unit ?? null) : raw;
}

function nameplateSteps(blockId: string, definition: BlockDefinition, np: Record<string, string> | undefined): void {
  if (!np) return;
  for (const [key, raw] of Object.entries(np)) {
    push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/nameplate/${key}`, value: nameplateValue(definition, key, raw) });
  }
}

function checklistSteps(blockId: string, definition: BlockDefinition, blockType: EquipmentBlockType): void {
  const na = new Set(NA_ITEMS_BY_TYPE[blockType] ?? []);
  for (const item of definition.checklist ?? []) {
    const mark = na.has(item.key) ? 'NA' : 'C';
    push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/checklist/${item.key}/result`, value: mark });
  }
}

function instrumentPut(blockId: string, testKey: string, instrumentId: string, inst: (typeof INSTRUMENTS)[keyof typeof INSTRUMENTS]): void {
  push({
    kind: 'put',
    scope: 'relatorio',
    path: `sheet/${blockId}/test/${testKey}/instrument`,
    value: {
      instrument_id: instrumentId,
      code: inst.code,
      manufacturer: inst.manufacturer,
      model: inst.model,
      serial: inst.serial,
      cert_number: inst.certNumber,
      calibrated_at: null,
      valid_until: null,
      test_parameter: inst.testParameter,
    },
  });
}

function cellPut(blockId: string, testKey: string, row: number, col: number, value: unknown): void {
  push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/test/${testKey}/cell/${row}/${col}`, value });
}

/** Single-table insulation (cabos, para-raio, TP, TC, transformador): source-deltas -- only
 *  `1 MINUTO` (the capture column) is ever measured; every other value column prints "-". */
function singleInsulationSteps(blockId: string, definition: BlockDefinition, isoRows: readonly (string | null)[]): void {
  const test = definition.tests.find((t) => t.key === 'isolacao')!;
  const table = test.tables[0]!;
  const captureCol = table.value_columns.findIndex((c) => c.role === 'capture');
  instrumentPut(blockId, test.key, INSTRUMENT_MEGOHMETRO_ID, INSTRUMENTS.megohmetro);
  table.rows.forEach((_row, r) => {
    const raw = isoRows[r] ?? null;
    table.value_columns.forEach((col, c) => {
      cellPut(blockId, test.key, r, c, c === captureCol ? (raw === null ? notMeasured(col.unit) : measured(raw, col.unit)) : notMeasured(col.unit));
    });
  });
}

/** Chave/disjuntor: two tables (contato aberto, then fechado) under the same `isolacao` test
 *  key, concatenated row-wise (aberto = rows 0..n-1, fechado = rows n..2n-1) -- the printed
 *  triple is identical on both tables in every one of the 94 real sheets read. */
function contactInsulationSteps(blockId: string, definition: BlockDefinition, triple: readonly [string, string, string]): void {
  const test = definition.tests.find((t) => t.key === 'isolacao')!;
  instrumentPut(blockId, test.key, INSTRUMENT_MEGOHMETRO_ID, INSTRUMENTS.megohmetro);
  let rowOffset = 0;
  for (const table of test.tables) {
    const unit = table.value_columns[0]!.unit;
    table.rows.forEach((_row, r) => cellPut(blockId, test.key, rowOffset + r, 0, measured(triple[r]!, unit)));
    rowOffset += table.rows.length;
  }
}

function resistenciaContatoSteps(blockId: string, definition: BlockDefinition, triple: readonly [string, string, string]): void {
  const test = definition.tests.find((t) => t.key === 'resistencia_contato');
  if (!test) throw new Error(`porto-seguro fixture: ${definition.block_type} has no resistencia_contato test but an instance set .rc`);
  const table = test.tables[0]!;
  instrumentPut(blockId, test.key, INSTRUMENT_MICROHMETRO_ID, INSTRUMENTS.microhmetro);
  table.rows.forEach((_row, r) => cellPut(blockId, test.key, r, 0, measured(triple[r]!, table.value_columns[0]!.unit)));
}

function inputCols(table: TableDef): number[] {
  return table.value_columns.reduce<number[]>((idx, c, i) => (c.role === 'input' ? [...idx, i] : idx), []);
}
function captureCols(table: TableDef): number[] {
  return table.value_columns.reduce<number[]>((idx, c, i) => (c.role === 'capture' ? [...idx, i] : idx), []);
}

/** TP/TC ratio: 3 rows (FASE R/S/T), one constant primário/secundário pair, one capture
 *  column whose value differs per row. */
function tpTcRatioSteps(blockId: string, definition: BlockDefinition, ratio: { p: string; s: string; cap: readonly string[] }): void {
  const test = definition.tests.find((t) => t.key === 'relacao_transformacao');
  if (!test) throw new Error(`porto-seguro fixture: ${definition.block_type} has no relacao_transformacao test but an instance set .ratio`);
  const table = test.tables[0]!;
  const [pCol, sCol] = inputCols(table);
  const [capCol] = captureCols(table);
  instrumentPut(blockId, test.key, INSTRUMENT_RATIOMETRO_ID, INSTRUMENTS.ratiometro);
  table.rows.forEach((_row, r) => {
    cellPut(blockId, test.key, r, pCol!, measured(ratio.p, table.value_columns[pCol!]!.unit));
    cellPut(blockId, test.key, r, sCol!, measured(ratio.s, table.value_columns[sCol!]!.unit));
    cellPut(blockId, test.key, r, capCol!, measured(ratio.cap[r]!, table.value_columns[capCol!]!.unit));
  });
}

/** Transformador ratio: 1 row (one TAP), 3 capture columns (H1-H3, H2-H1, H3-H2). */
function transformadorRatioSteps(blockId: string, definition: BlockDefinition, ratio: { p: string; s: string; cap: readonly string[] }): void {
  const test = definition.tests.find((t) => t.key === 'relacao_transformacao');
  if (!test) throw new Error(`porto-seguro fixture: ${definition.block_type} has no relacao_transformacao test but an instance set .ratio`);
  const table = test.tables[0]!;
  const [pCol, sCol] = inputCols(table);
  const caps = captureCols(table);
  instrumentPut(blockId, test.key, INSTRUMENT_RATIOMETRO_ID, INSTRUMENTS.ratiometro);
  cellPut(blockId, test.key, 0, pCol!, measured(ratio.p, table.value_columns[pCol!]!.unit));
  cellPut(blockId, test.key, 0, sCol!, measured(ratio.s, table.value_columns[sCol!]!.unit));
  caps.forEach((c, k) => cellPut(blockId, test.key, 0, c, measured(ratio.cap[k]!, table.value_columns[c]!.unit)));
}

export interface NotTestedInfo {
  blockId: string;
  equipmentId: string;
  blockType: EquipmentBlockType;
}
const notTested: NotTestedInfo[] = [];

const locationCounter = new Map<string, number>();
function nextOrderKey(locationId: string): string {
  const n = locationCounter.get(locationId) ?? 0;
  locationCounter.set(locationId, n + 1);
  return siblingOrderKey(n);
}

let equipmentInstanceIndex = 0;

for (const templateBlock of equipmentTemplateBlocks) {
  const blockType = templateBlock.block_type as EquipmentBlockType;
  const locationId = locationIdOf.get(templateBlock.skeleton_location_ref!)!;
  const definition = getDefinition(SEED_VERSION, 'cabine_primaria', blockType);
  for (let i = 0; i < templateBlock.quantity; i++) {
    const instance = dataQueue[equipmentInstanceIndex++]!;
    const equipmentId = newId();
    const blockId = newId();
    const orderKey = nextOrderKey(locationId);
    const tag = instance.tag ?? `${blockType}-${orderKey}`;

    push({ kind: 'create', scope: 'project', path: `equipment/${equipmentId}`, value: { id: equipmentId, project_id: PROJECT_ID, tag, type: blockType, last_nameplate: null, removed_at: null } });

    push({
      kind: 'create',
      scope: 'relatorio',
      path: `block/${blockId}`,
      value: {
        id: blockId,
        relatorio_id: RELATORIO_ID,
        location_id: locationId,
        equipment_id: equipmentId,
        block_type: blockType,
        config: {
          block_type: templateBlock.block_type,
          ...(templateBlock.subtype === undefined ? {} : { subtype: templateBlock.subtype }),
          ...(templateBlock.role === undefined ? {} : { role: templateBlock.role }),
          sub_blocks: templateBlock.sub_blocks,
          na_defaults: templateBlock.na_defaults,
        },
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
      },
    });

    nameplateSteps(blockId, definition, instance.np);

    if (instance.notTested) {
      if (instance.rc || instance.contact || instance.isoRows || instance.ratio) {
        throw new Error(`porto-seguro fixture: ${blockType} instance (order ${orderKey}) is notTested but also carries measured test data`);
      }
      notTested.push({ blockId, equipmentId, blockType });
      push({
        kind: 'put',
        scope: 'relatorio',
        path: `block/${blockId}/not_tested`,
        // `steps` does not yet hold this very put, so its own eventual position (and thus its
        // `client_ts` once mapped into `opLog`, `n = index + 1`) is `steps.length + 1`.
        value: { reason: NOT_TESTED_REASON, text: notTestedText(blockType === 'disjuntor_mt' ? 'este disjuntor (TIE)' : 'esta seccionadora'), at: fixedTs(steps.length + 1), by: USER_ID },
      });
      continue; // no checklist, no test cells, no observations/conclusion (I/O matrix).
    }

    checklistSteps(blockId, definition, blockType);

    if (instance.isoRows) singleInsulationSteps(blockId, definition, instance.isoRows);
    if (instance.contact) contactInsulationSteps(blockId, definition, instance.contact);
    if (instance.rc) resistenciaContatoSteps(blockId, definition, instance.rc);
    if (instance.ratio) {
      if (blockType === 'transformador_forca') transformadorRatioSteps(blockId, definition, instance.ratio);
      else tpTcRatioSteps(blockId, definition, instance.ratio);
    }

    if (!instance.noConcl) {
      if (instance.obs) push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/observations`, value: instance.obs });
      push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/conclusion/result`, value: 'aprovado' });
      push({ kind: 'put', scope: 'relatorio', path: `sheet/${blockId}/conclusion/restriction`, value: instance.restr ?? 'sem_restricoes' });
    }
  }
}

if (equipmentInstanceIndex !== 94) throw new Error(`porto-seguro fixture: zipped ${equipmentInstanceIndex} instances, expected 94`);
if (notTested.length !== 3) throw new Error(`porto-seguro fixture: ${notTested.length} not-tested blocks, expected 3`);

export const NOT_TESTED_SECCIONADORA_1_BLOCK_ID = notTested[0]!.blockId;
export const NOT_TESTED_SECCIONADORA_2_BLOCK_ID = notTested[2]!.blockId;
export const NOT_TESTED_DISJUNTOR_BLOCK_ID = notTested[1]!.blockId;
export const NOT_TESTED_BLOCK_IDS: readonly string[] = notTested.map((n) => n.blockId);

// --- section 8: general points, plus one `origin: 'not_tested'` point per not-tested block --
// In the delivered document's order: manual bullets 1 to 3, then the not-tested points where
// bullet 4 stands, then bullet 5. `order_key` is the point's position among all of them.

SECTION_8_POINTS.forEach((text, i) => {
  const id = fixedId(50 + i);
  const position = i < SECTION_8_NOT_TESTED_AT ? i : i + notTested.length;
  push({ kind: 'create', scope: 'relatorio', path: `point/${id}`, value: { id, relatorio_id: RELATORIO_ID, text, equipment_id: null, origin: 'manual', order_key: siblingOrderKey(position), removed_at: null } });
});

notTested.forEach((entry, i) => {
  const id = fixedId(60 + i);
  const subject = entry.blockType === 'disjuntor_mt' ? 'este disjuntor (TIE)' : 'esta seccionadora';
  push({
    kind: 'create',
    scope: 'relatorio',
    path: `point/${id}`,
    value: { id, relatorio_id: RELATORIO_ID, text: notTestedText(subject), equipment_id: entry.equipmentId, origin: 'not_tested', order_key: siblingOrderKey(SECTION_8_NOT_TESTED_AT + i), removed_at: null },
  });
});

// --- section 7: 82 placeholder photos, metadata only, reproducing the 75/76-x4 defect ----
// `caption` holds the caption text only; the printed "Imagem NN" number belongs to the
// renderer. The source's own numbers, defect included, are kept apart in
// `SECTION_7_PHOTO_NUMBERS` (same order as the file rows) for the numbering-defect test.

/** The source's "Imagem NN" numbers, one per photo in `local_seq` order: 1 to 74, then 75, 76 four times. */
export const SECTION_7_PHOTO_NUMBERS: readonly number[] = SECTION_7_PHOTOS.map((photo) => photo.number);

SECTION_7_PHOTOS.forEach((photo, i) => {
  const id = fixedId(10000 + i);
  push({
    kind: 'create',
    scope: 'relatorio',
    path: `file/${id}`,
    value: {
      id,
      company_id: COMPANY_ID,
      relatorio_id: RELATORIO_ID,
      kind: 'photo',
      sha256: i.toString(16).padStart(2, '0').repeat(32).slice(0, 64),
      mime: 'image/jpeg',
      size: 200000 + i,
      uploaded_at: null,
      variants: null,
      removed_at: null,
      captured_at: fixedTs(6000 + i),
      tz_offset: -180,
      coords: null,
      local_seq: i + 1,
      block_id: null,
      item_key: null,
      caption: photo.caption,
      reading_kind: null,
      reading_target: null,
      reading_status: 'none',
    },
  });
});

// --- assemble the op log ------------------------------------------------------------------

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
    prev_op_id: null,
    batch_id: step.batch_id ?? null,
    meta: step.meta ?? null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: fixedTs(n),
    seq: n,
  });
});

export const deadOpIds: readonly string[] = [];

/** The golden `RelatorioSnapshot`, committed as canonical JSON. */
export const goldenSnapshot: unknown = golden;

export const portoSeguro = {
  companyId: COMPANY_ID,
  relatorioId: RELATORIO_ID,
  projectId: PROJECT_ID,
  userId: USER_ID,
  deviceId: DEVICE_ID,
  log: opLog,
  deadOpIds,
  golden: goldenSnapshot,
  notTestedBlockIds: NOT_TESTED_BLOCK_IDS,
} as const;
