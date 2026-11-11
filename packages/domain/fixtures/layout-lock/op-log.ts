import {
  buildSnapshot,
  defaultBlockConfig,
  EMPTY_DEFINITION_CONTEXT,
  equipmentTypesOf,
  getDefinition,
  instantiateTemplate,
  makeOp,
  replay,
  SECTION_BLOCK_TYPES,
  sheetChecklistPath,
  sheetNameplatePath,
  sheetObservationsPath,
  sheetTestCellPath,
  sheetTestPath,
  type BlockDefinition,
  type FieldDef,
  type JsonValue,
  type Op,
  type OpDraft,
  type RelatorioSnapshot,
  type TableDef,
  type TemplateBlock,
  type TemplateRow,
} from '../../src/index.ts';

/*
 * Story 23.2 (Epic 23 layout lock, taken on main a3b0ec0e after fix batch e23f): one synthetic
 * relatório per locked seed version (v5, v11, v12), each with one cabine holding one sheet of every
 * equipment type the version offers, its nameplate, checklist, instruments and readings filled by
 * rule from the definition. Bruno likes the current relatório, so the DOCX and the PDF text these
 * print are pinned (`apps/api/src/jobs/generate/golden/layout-lock-*`) and every later Epic 23 PR
 * keeps them byte-equal: only a v13 relatório may print something new.
 *
 * Every value is invented by rule (no client material, R-023 does not apply). Ids, op ids and
 * timestamps are fixed per version, so the three relatórios can sit in one company side by side.
 */

/** The seed versions whose printed layout is locked. */
export const LAYOUT_LOCK_VERSIONS = ['v5', 'v11', 'v12'] as const;
export type LayoutLockVersion = (typeof LAYOUT_LOCK_VERSIONS)[number];

/** The issue instant the DOCX golden renders with. */
export const LAYOUT_LOCK_ISSUED_AT = '2026-11-08T12:00:00.000Z';

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
const versionNumber = (version: string) => Number(version.slice(1));

/** Fixed entity ids per version: `019a6100-00VV-7000-8000-NNNNNNNNNNNN`. */
export const layoutLockId = (version: string, n: number): string => `019a6100-00${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;
/** Fixed op ids per version: `019a6100-01VV-7000-8000-NNNNNNNNNNNN`. */
const opId = (version: string, n: number): string => `019a6100-01${hex(versionNumber(version), 2)}-7000-8000-${hex(n, 12)}`;

export interface LayoutLockActor {
  companyId: string;
  actorId: string;
  deviceId: string;
}

const DEFAULT_ACTOR: LayoutLockActor = {
  companyId: '019a6100-0000-7000-8000-000000000001',
  actorId: '019a6100-0000-7000-8000-000000000002',
  deviceId: 'tablet-layout-lock',
};

const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });

/** The synthetic reading of a typed column: insulation in MΩ, contact in µΩ, the ratio's volts and readings. */
function readingOf(testKey: string, table: TableDef, col: number, row: number): string {
  const column = table.value_columns[col]!;
  if (testKey === 'isolacao') return String(2500 + row * 100);
  if (testKey === 'resistencia_contato') return String(40 + row * 3);
  if (column.role === 'input') return column.label.includes('PRIM') ? '13800' : '380';
  return '36';
}

/** The synthetic nameplate value of a field, by kind; a select takes its last option. */
function nameplateValueOf(field: FieldDef, n: number): JsonValue {
  switch (field.kind) {
    case 'text':
      return `SINT-${n + 1}`;
    case 'manufacturer':
      return 'Fabricante Sintético';
    case 'number':
      return num(String(100 + n * 10), field.unit ?? null);
    case 'date':
      return '2020-03-15';
    case 'voltage_class':
      return '15';
    case 'select':
      return field.options!.at(-1)!;
  }
}

function instrumentOf(version: string, testKey: string, n: number): JsonValue {
  return {
    instrument_id: layoutLockId(version, 900 + n),
    code: `IN-${n + 1}`,
    manufacturer: 'Instrumentos Sintéticos',
    model: testKey === 'isolacao' ? 'MEG-5' : testKey === 'resistencia_contato' ? 'MIC-1' : 'TTR-3',
    serial: `SN-${1000 + n}`,
    cert_number: `C-${200 + n}/26`,
    calibrated_at: '2026-06-01',
    // Far ahead, so no golden reads "vencido" on the day it renders.
    valid_until: '2099-12-31',
    test_parameter: testKey === 'isolacao' ? '5.000 V' : testKey === 'resistencia_contato' ? '100 A' : '80 V',
  };
}

/** The sheet writes of one equipment block, by rule from its definition. */
function sheetWrites(version: string, blockId: string, definition: BlockDefinition, sheetIndex: number): [string, JsonValue][] {
  const writes: [string, JsonValue][] = [];
  definition.nameplate.forEach((field, n) => writes.push([sheetNameplatePath(blockId, field.key), nameplateValueOf(field, n)]));
  (definition.checklist ?? []).forEach((item, n) => {
    // Every item C, the second NC with its first phrase, the third NA: the three marks print.
    const result = n === 1 ? 'NC' : n === 2 ? 'NA' : 'C';
    writes.push([sheetChecklistPath(blockId, item.key, 'result'), result]);
    if (result === 'NC') writes.push([sheetChecklistPath(blockId, item.key, 'observation'), item.nc_phrases[0]!]);
  });
  definition.tests.forEach((test, t) => {
    writes.push([sheetTestPath(blockId, test.key, 'instrument'), instrumentOf(version, test.key, sheetIndex * 4 + t)]);
    let offset = 0;
    for (const table of test.tables) {
      table.rows.forEach((_, r) => {
        table.value_columns.forEach((column, col) => {
          if (column.role !== 'capture' && column.role !== 'input') return;
          // The disjuntor's first insulation row reads below every criterion: an out row, its point and NC conclusion print.
          const out = definition.block_type === 'disjuntor_mt' && test.key === 'isolacao' && offset + r === 0;
          writes.push([sheetTestCellPath(blockId, test.key, offset + r, col), num(out ? '150' : readingOf(test.key, table, col, r), column.unit)]);
        });
      });
      offset += table.rows.length;
    }
  });
  if (sheetIndex % 3 === 0) writes.push([sheetObservationsPath(blockId), `Observação sintética da ficha ${sheetIndex + 1}.`]);
  return writes;
}

function templateOf(version: string): TemplateRow {
  const ref = 'cabine-sintetica';
  const blocks: TemplateBlock[] = [
    ...SECTION_BLOCK_TYPES.map((type) => ({ ...defaultBlockConfig(version, type), quantity: 1, skeleton_location_ref: null, section_text: null })),
    ...equipmentTypesOf(version).map((type) => ({ ...defaultBlockConfig(version, type), quantity: 1, skeleton_location_ref: ref, section_text: null })),
  ];
  return {
    id: layoutLockId(version, 3),
    name: 'Trava de layout',
    version: 1,
    seed_version: version,
    blocks,
    skeleton: [{ ref, kind: 'cabine', parent_ref: null, name: 'Subestação Sintética', agrupar_por_tipo: false }],
    archived_at: null,
    removed_at: null,
  };
}

export interface LayoutLockFixture {
  version: string;
  relatorioId: string;
  projectId: string;
  log: Op[];
}

/** The op log of the synthetic relatório of `version`: the project, the instantiated template, then every sheet write. */
export function layoutLockFixture(version: string, actor: LayoutLockActor = DEFAULT_ACTOR): LayoutLockFixture {
  let ids = 10;
  const newId = () => layoutLockId(version, ids++);
  let ops = 0;
  const base = Date.parse('2026-11-08T09:00:00.000Z');
  const opOf = (draft: OpDraft): Op =>
    makeOp({ ...draft, device_id: actor.deviceId }, { newId: () => opId(version, ++ops), now: new Date(base + ops * 1000) });

  const projectId = layoutLockId(version, 4);
  const project: OpDraft = {
    kind: 'create',
    scope: 'company',
    company_id: actor.companyId,
    project_id: null,
    relatorio_id: null,
    path: `project/${projectId}`,
    value: { id: projectId, client_id: null, name: `Obra sintética ${version}`, site: 'Rua Sintética, 100', removed_at: null },
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: actor.actorId,
  };
  const { relatorioId, drafts } = instantiateTemplate(
    templateOf(version),
    { id: projectId },
    { service_start: '2026-11-03', service_end: '2026-11-04', existingEquipment: [], responsible_user_id: null, definitions: EMPTY_DEFINITION_CONTEXT, tagRule: 'legacy' },
    { newId, actorId: actor.actorId, companyId: actor.companyId },
  );
  const log = [project, ...drafts].map(opOf);

  const sheets = drafts
    .filter((draft) => draft.kind === 'create' && draft.path.startsWith('block/'))
    .map((draft) => draft.value as { id: string; block_type: string; equipment_id: string | null })
    .filter((block) => block.equipment_id !== null);
  sheets.forEach((block, n) => {
    const definition = getDefinition(version, 'cabine_primaria', block.block_type);
    for (const [path, value] of sheetWrites(version, block.id, definition, n)) {
      log.push(
        opOf({ kind: 'put', scope: 'relatorio', company_id: actor.companyId, project_id: null, relatorio_id: relatorioId, path, value, prev_op_id: null, batch_id: null, meta: null, actor_id: actor.actorId }),
      );
    }
  });
  return { version, relatorioId, projectId, log };
}

/** The snapshot the renderer reads for the synthetic relatório of `version`. */
export function layoutLockSnapshot(version: string): RelatorioSnapshot {
  const fixture = layoutLockFixture(version);
  return buildSnapshot(replay(fixture.log), fixture.relatorioId);
}
