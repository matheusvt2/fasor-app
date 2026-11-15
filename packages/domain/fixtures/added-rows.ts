import {
  companyBlockType,
  companySubBlocksOf,
  emptySheet,
  entityKey,
  opSchema,
  type BlockRow,
  type CompanyTypeDefinition,
  type EntityRow,
  type EntityState,
  type EquipmentTypeRow,
  type EquipmentTypeVersionRow,
  type JsonValue,
  type Op,
  type OpKind,
  type Sheet,
} from '../src/index.ts';

/*
 * Story 25.14 ("25.14-UNIT", "25.14-API-001"): the test definition of the capability. On a seed only the v16 ground
 * grid's continuity test carries `added_rows` (Story 25.16, "Adicionar ponto" alone), so the tests of the whole key
 * take it through a company type, the one way a definition reaches the fold without a seed (`findDefinitionIn`). Three measurement
 * tests, invented data: the continuity points ("Adicionar ponto", no stem, the default maximum), the batteries'
 * float voltage ("Adicionar bateria", the stem "Bateria", counted from the plate's BATERIAS: QUANTIDADE, at most 12)
 * with a choice column, and a test whose definition lacks the key. Fixed uuidv7 ids and timestamps.
 */

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
/** Fixed entity ids: `019a5c00-2514-7000-8000-0000000000NN`. */
export const addedRowsId = (n: number): string => `019a5c00-2514-7000-8000-${hex(n, 12)}`;
/** Fixed op ids: `019a5c00-2515-7000-8000-0000000000NN`. */
export const addedRowsOpId = (n: number): string => `019a5c00-2515-7000-8000-${hex(n, 12)}`;
/** Fixed row ids, in the order they were created: `019a5c00-2516-7000-8000-0000000000NN`. */
export const addedRowId = (n: number): string => `019a5c00-2516-7000-8000-${hex(n, 12)}`;
/** One minute per op after 2026-11-15T10:00:00Z. */
export const addedRowsTs = (n: number): string => {
  const minutes = String(n % 60).padStart(2, '0');
  const hours = String(10 + Math.floor(n / 60)).padStart(2, '0');
  return `2026-11-15T${hours}:${minutes}:00.000Z`;
};

export const ADDED_ROWS_COMPANY_ID = addedRowsId(1);
export const ADDED_ROWS_USER_ID = addedRowsId(2);
export const ADDED_ROWS_TYPE_ID = addedRowsId(3);
export const ADDED_ROWS_VERSION_ID = addedRowsId(4);
export const ADDED_ROWS_RELATORIO_ID = addedRowsId(5);
export const ADDED_ROWS_BLOCK_ID = addedRowsId(6);
export const ADDED_ROWS_LOCATION_ID = addedRowsId(7);
export const ADDED_ROWS_EQUIPMENT_ID = addedRowsId(8);

/** The three tests' keys. */
export const POINTS_TEST = 'continuidade';
export const BATTERIES_TEST = 'flutuacao';
export const NO_KEY_TEST = 'sem_linhas';

const source = { name: 'Manual do fabricante', edition: null };

/** The type: a plate with the batteries' count, the three tests (only the first two take added rows). */
export const ADDED_ROWS_DEFINITION: CompanyTypeDefinition = {
  label: 'Banco de teste',
  tag_prefix: 'BT',
  noun: { singular: 'banco de teste', plural: 'bancos de teste', gender: 'm' },
  nameplate: [
    { key: 'fabricante', label: 'FABRICANTE', kind: 'manufacturer' },
    { key: 'baterias_quantidade', label: 'BATERIAS: QUANTIDADE', kind: 'number' },
  ],
  checklist: null,
  tests: [],
  measurement_tests: [
    {
      key: POINTS_TEST,
      label: 'Continuidade',
      row_header: 'Ponto',
      columns: [{ key: 'resistencia', label: 'Resistência', kind: 'number', unit: 'Ω' }],
      rows: [
        { key: 'carcacas', label: 'Carcaças', optional: true },
        { key: 'portas', label: 'Portas', optional: true },
      ],
      criteria: [{ type: 'absolute', operator: '<=', value: 0.5, unit: 'Ω', text: '≤ 0,5 Ω entre pontos', source }],
      added_rows: { label: 'Adicionar ponto' },
    },
    {
      key: BATTERIES_TEST,
      label: 'Tensão de flutuação',
      row_header: 'Medição',
      columns: [
        { key: 'tensao', label: 'Tensão', kind: 'number', unit: 'V' },
        { key: 'estado', label: 'Estado', kind: 'choice', options: [{ key: 'ok', label: 'OK' }, { key: 'falhou', label: 'FALHOU' }] },
      ],
      rows: [{ key: 'banco', label: 'Banco' }],
      criteria: [
        { type: 'absolute', operator: '>=', value: 12, unit: 'V', text: '≥ 12 V', columns: ['tensao'], source },
        { type: 'choice_pass', column: 'estado', pass: ['ok'], text: 'OK', source },
      ],
      added_rows: { label: 'Adicionar bateria', stem: { singular: 'Bateria', plural: 'baterias', gender: 'f' }, plate_field: 'baterias_quantidade', max: 12 },
    },
    {
      key: NO_KEY_TEST,
      label: 'Sem linhas acrescentadas',
      row_header: 'Ponto',
      columns: [{ key: 'valor', label: 'Valor', kind: 'number', unit: 'Ω' }],
      rows: [{ key: 'unico', label: 'Único' }],
      criteria: [{ type: 'absolute', operator: '<=', value: 1, unit: 'Ω', text: '≤ 1 Ω', source }],
    },
  ],
  criteria: [],
};

export const addedRowsTypeRow = (): EquipmentTypeRow => ({ id: ADDED_ROWS_TYPE_ID, derived_from: null, draft: null, retired_at: null, removed_at: null, latest_version: 1 });

export const addedRowsVersionRow = (definition: CompanyTypeDefinition = ADDED_ROWS_DEFINITION): EquipmentTypeVersionRow =>
  ({ id: ADDED_ROWS_VERSION_ID, type_id: ADDED_ROWS_TYPE_ID, version: 1, definition, published_by: ADDED_ROWS_USER_ID, published_at: addedRowsTs(0) }) as EquipmentTypeVersionRow;

export const ADDED_ROWS_BLOCK_TYPE = companyBlockType(ADDED_ROWS_TYPE_ID);

/** A block of the type (seed `seedVersion`, every sub-block on), its sheet as given. */
export function addedRowsBlock(sheet: Sheet = emptySheet(), seedVersion = 'v16', definition: CompanyTypeDefinition = ADDED_ROWS_DEFINITION): BlockRow {
  const subBlocks = Object.fromEntries(companySubBlocksOf(definition).map((key) => [key, { enabled: key !== 'ia_ip_display' }]));
  return {
    id: ADDED_ROWS_BLOCK_ID,
    relatorio_id: ADDED_ROWS_RELATORIO_ID,
    location_id: ADDED_ROWS_LOCATION_ID,
    equipment_id: ADDED_ROWS_EQUIPMENT_ID,
    block_type: ADDED_ROWS_BLOCK_TYPE,
    config: { block_type: ADDED_ROWS_BLOCK_TYPE, sub_blocks: subBlocks, na_defaults: [], type_version: 1, type_version_id: ADDED_ROWS_VERSION_ID },
    seed_version: seedVersion,
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet,
    created_by: ADDED_ROWS_USER_ID,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

/** The fold's state for the type's block: the block, its type and its published version. */
export function addedRowsState(block: BlockRow = addedRowsBlock(), definition: CompanyTypeDefinition = ADDED_ROWS_DEFINITION): EntityState {
  return new Map<ReturnType<typeof entityKey>, EntityRow>([
    [entityKey('block', block.id), block],
    [entityKey('equipment_type', ADDED_ROWS_TYPE_ID), addedRowsTypeRow()],
    [entityKey('equipment_type_version', ADDED_ROWS_VERSION_ID), addedRowsVersionRow(definition)],
  ]);
}

let opCounter = 0;

/** A relatório-scope op of the fixture's user on `deviceId` (a fresh fixed op id each call). */
export function addedRowsOp(kind: OpKind, path: string, value: unknown, options: { deviceId?: string; prevOpId?: string | null; clientTs?: string; meta?: Op['meta'] } = {}): Op {
  opCounter += 1;
  return opSchema.parse({
    op_id: addedRowsOpId(opCounter),
    kind,
    scope: 'relatorio',
    company_id: ADDED_ROWS_COMPANY_ID,
    project_id: null,
    relatorio_id: ADDED_ROWS_RELATORIO_ID,
    path,
    value: (value ?? null) as JsonValue,
    prev_op_id: options.prevOpId ?? null,
    batch_id: null,
    meta: options.meta ?? null,
    actor_id: ADDED_ROWS_USER_ID,
    device_id: options.deviceId ?? 'tablet-a',
    client_ts: options.clientTs ?? addedRowsTs(opCounter % 600),
  });
}

/** A number reading as a cell stores it. */
export const reading = (raw: string, unit: string) => ({ raw, unit, state: 'measured' as const });
