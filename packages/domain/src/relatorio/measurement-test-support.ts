import { applyOp, cellAt, entityKey, type EntityKey, type EntityState } from '../ops/apply.ts';
import { blockPath, parsePath, sheetChecklistPath, sheetNameplatePath, sheetTestCellPath, sheetTestValuePath } from '../ops/path.ts';
import { relatorioRowSchema, type BlockRow, type Cell, type EntityRow, type EquipmentRow, type JsonValue, type LocationRow, type RelatorioRow } from '../schemas/entities.ts';
import { getDefinition } from '../seed/definitions.ts';
import type { MeasurementTest } from '../seed/measurement.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO, type OpFactory } from '../test-support.ts';
import { blockConfigWithOption, choiceValue } from './measurement-evaluation.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * Story 14.5: what the kernel tests of the measurement table share. A Chave de transferência
 * automática sheet built the way a device builds it (`newEquipmentBlock`), filled through the
 * fold (`applyOp`) so every test reads rows the reducer wrote. Not part of the public kernel
 * surface (kept out of `index.ts`, like `test-support.ts`).
 */

export const CTA = 'chave_transferencia_automatica';
export const CTA_BLOCK = '019966b0-0145-7000-8000-000000000001';
export const CTA_EQUIPMENT = '019966b0-0145-7000-8000-000000000002';
export const CTA_LOCAL = '019966b0-0145-7000-8000-000000000003';
export const CTA_TAG = 'CTA-GER';

export const E1 = 'cta_resistencia_contato';
export const E2 = 'cta_isolamento_principal';
export const E3 = 'cta_isolamento_controle';
export const E4 = 'cta_ajustes_controlador';
export const E5 = 'cta_transferencia';
export const E6 = 'cta_termografia';

export const ctaDefinition = (): BlockDefinition => getDefinition('v5', 'cabine_primaria', CTA);
export const ctaTest = (key: string): MeasurementTest => ctaDefinition().measurement_tests!.find((test) => test.key === key)!;

/** The index of a row or a column of a test, by key: the op path's `row` and `col`. */
export const rowOf = (testKey: string, rowKey: string): number => {
  const at = ctaTest(testKey).rows.findIndex((row) => row.key === rowKey);
  if (at === -1) throw new Error(`${testKey} has no row "${rowKey}"`);
  return at;
};
export const colOf = (testKey: string, columnKey: string): number => {
  const at = ctaTest(testKey).columns.findIndex((column) => column.key === columnKey);
  if (at === -1) throw new Error(`${testKey} has no column "${columnKey}"`);
  return at;
};

/** A number as a cell stores it (AD-11). */
export const num = (raw: string, unit: string | null): JsonValue => ({ raw, unit, state: 'measured' });
export const choice = choiceValue;

export const ctaLocal = (name = 'Geradores'): LocationRow => ({
  id: CTA_LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name,
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: true,
  removed_at: null,
});

export const ctaRelatorio = (seedVersion = 'v5', status: RelatorioRow['status'] = 'rascunho'): RelatorioRow =>
  relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status,
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'por_local_e_tipo' },
    preview_file_id: null,
    removed_at: null,
  });

/** The equipment and the block rows of one new CTA, as the palette's tap creates them, with the given configuration. */
export function ctaRows(options: Record<string, string> = {}, ids: { blockId?: string; equipmentId?: string; tag?: string; orderKey?: string } = {}): { equipment: EquipmentRow; block: BlockRow } {
  let config = defaultBlockConfig('v5', CTA) as unknown as JsonValue;
  for (const [key, value] of Object.entries(options)) config = blockConfigWithOption(config, key, value);
  return newEquipmentBlock({
    blockId: ids.blockId ?? CTA_BLOCK,
    equipmentId: ids.equipmentId ?? CTA_EQUIPMENT,
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: CTA_LOCAL,
    type: CTA,
    tag: ids.tag ?? CTA_TAG,
    seedVersion: 'v5',
    orderKey: ids.orderKey ?? 'a0',
    config,
  });
}

/** One write of a sheet: a table cell (`row` and `col` by key), a test value, a checklist result or observation, or a nameplate field. */
export type SheetWrite =
  | { test: string; row: string; col: string; value: JsonValue }
  | { test: string; key: string; value: JsonValue }
  | { item: string; result?: string; observation?: string }
  | { field: string; value: JsonValue };

function pathsOf(blockId: string, write: SheetWrite): [string, JsonValue][] {
  if ('row' in write) return [[sheetTestCellPath(blockId, write.test, rowOf(write.test, write.row), colOf(write.test, write.col)), write.value]];
  if ('key' in write) return [[sheetTestValuePath(blockId, write.test, write.key), write.value]];
  if ('field' in write) return [[sheetNameplatePath(blockId, write.field), write.value]];
  const out: [string, JsonValue][] = [];
  if (write.result !== undefined) out.push([sheetChecklistPath(blockId, write.item, 'result'), write.result]);
  if (write.observation !== undefined) out.push([sheetChecklistPath(blockId, write.item, 'observation'), write.observation]);
  return out;
}

/** A state holding the relatório, the local and one created CTA (on v5 unless told otherwise). */
export function ctaState(options: Record<string, string> = {}, f: OpFactory = opFactory(), seedVersion = 'v5'): { state: EntityState; f: OpFactory } {
  const { equipment, block } = ctaRows(options);
  let state: EntityState = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', TEST_RELATORIO), ctaRelatorio(seedVersion)],
    [entityKey('location', CTA_LOCAL), ctaLocal()],
    [entityKey('equipment', CTA_EQUIPMENT), equipment],
  ]);
  state = applyOp(state, f.op({ kind: 'create', path: blockPath(CTA_BLOCK), value: block as unknown as JsonValue }));
  return { state, f };
}

/** `writes` folded into `state`, one put each, chained on the cell they land on (sequential, as one device writes). */
export function writeSheet(state: EntityState, f: OpFactory, writes: readonly SheetWrite[], blockId = CTA_BLOCK): EntityState {
  let next = state;
  for (const write of writes) {
    for (const [path, value] of pathsOf(blockId, write)) {
      const current = cellAt(next, parsePath(path));
      next = applyOp(next, f.op({ path, value, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null }));
    }
  }
  return next;
}

export const blockOf = (state: EntityState, blockId = CTA_BLOCK): BlockRow => state.get(entityKey('block', blockId)) as BlockRow;

/** A CTA block with `writes` folded in. */
export function ctaBlock(options: Record<string, string> = {}, writes: readonly SheetWrite[] = []): BlockRow {
  const { state, f } = ctaState(options);
  return blockOf(writeSheet(state, f, writes));
}

/** Every write that fills one whole column of a test's rows with the same value (hidden and fixed rows left out by the caller's keys). */
export function column(test: string, col: string, values: Record<string, JsonValue>): SheetWrite[] {
  return Object.entries(values).map(([row, value]) => ({ test, row, col, value }));
}

/** A stored cell built by hand, for a reader test that needs a shape the fold would not write. */
export const rawCell = (value: JsonValue, opId = '019966b0-0145-7000-8000-0000000000ff'): Cell => ({ value, source_suggestion_id: null, op_id: opId });

/** Every write of a CTA sheet filled on site at four poles, with one item NC, one pole out and one setting left different. */
export function ctaFilledWrites(): SheetWrite[] {
  const writes: SheetWrite[] = [];
  for (const field of ctaDefinition().nameplate) {
    writes.push({ field: field.key, value: field.kind === 'number' ? num('400', field.unit ?? null) : field.key === 'tag' ? CTA_TAG : `valor ${field.key}` });
  }
  ctaDefinition().checklist!.forEach((item, index) => {
    if (index === 2) writes.push({ item: item.key, result: 'NC', observation: 'Aviso de transferência manual ausente na tampa frontal' });
    else writes.push({ item: item.key, result: 'C' });
  });
  const micro = (raw: string) => num(raw, 'µΩ');
  // Lado Normal all within; on Lado Emergência the 63 of Polo C is 62 % above the 39 of Polo B.
  writes.push(...column(E1, 'lado_normal', { polo_a: micro('38'), polo_b: micro('41'), polo_c: micro('36'), polo_n: micro('52') }));
  writes.push(...column(E1, 'lado_emergencia', { polo_a: micro('40'), polo_b: micro('39'), polo_c: micro('63'), polo_n: micro('42') }));
  for (const row of ctaTest(E2).rows) {
    for (const col of ctaTest(E2).columns) if (row.fixed?.[col.key] === undefined) writes.push({ test: E2, row: row.key, col: col.key, value: num('12.4', 'GΩ') });
  }
  writes.push({ test: E3, row: 'fiacao_terra', col: 'valor', value: num('850', 'MΩ') });
  for (const row of ctaTest(E4).rows) {
    const value = row.kind === 'choice' ? choice(row.options![0]!.key) : num('5', row.unit ?? null);
    for (const col of ['projeto', 'encontrado', 'deixado']) writes.push({ test: E4, row: row.key, col, value });
  }
  // TD 3A found and left at the factory's 30 min, against the project's 5.
  writes.push({ test: E4, row: 'td_3a', col: 'encontrado', value: num('30', 'min') }, { test: E4, row: 'td_3a', col: 'deixado', value: num('30', 'min') });
  writes.push(
    { test: E5, key: 'metodo', value: choice('falta_real') },
    { test: E5, key: 'carga', value: choice('com_carga') },
    { test: E5, key: 'carga_percentual', value: num('62', '%') },
    { test: E5, key: 'fonte_tempos', value: choice('instrumento') },
  );
  const medidos: Record<string, JsonValue> = {
    falha_da_normal_ate_partida: num('3.2', 's'),
    ate_carga_na_emergencia: num('8.4', 's'),
    retransferencia: num('5.0', 'min'),
    resfriamento: num('5.0', 'min'),
    falha_da_emergencia: num('0.9', 's'),
  };
  writes.push(...column(E5, 'medido', medidos));
  for (const row of ctaTest(E6).rows) {
    writes.push({ test: E6, row: row.key, col: 'temperatura', value: num('41.2', '°C') }, { test: E6, row: row.key, col: 'classe', value: choice('normal') });
  }
  writes.push({ test: E6, key: 'temperatura_ambiente', value: num('27', '°C') });
  return writes;
}
