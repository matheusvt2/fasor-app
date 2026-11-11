import { describe, expect, it } from 'vitest';
import { layoutLockSnapshot } from '../../fixtures/layout-lock/op-log.ts';
import { applyOp, cellAt, entityKey, type EntityKey, type EntityState } from '../ops/apply.ts';
import { blockPath, fileFieldPath, parsePath, sheetChecklistPath, sheetNameplatePath, sheetTestValuePath } from '../ops/path.ts';
import { TEXT_CAPS, textCapOf } from '../ops/value-limits.ts';
import { CAPTION_EQUIPMENT_WORDS } from '../photos/caption.ts';
import { totalsText } from '../templates/text.ts';
import { section9Layout, type PrintSheet, type PrintTable, type SheetPart } from '../print/section-9.ts';
import type { EquipmentBlockType, Subtype } from '../schemas/block-config.ts';
import { equipmentTypeRowSchema, equipmentTypeVersionRowSchema, relatorioRowSchema, type BlockRow, type Cell, type EntityRow, type FileRow, type JsonValue, type LocationRow } from '../schemas/entities.ts';
import type { RelatorioSnapshot } from '../schemas/snapshot.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import type { BlockDefinition } from '../seed/schema.ts';
import { defaultBlockConfig } from '../seed/template.ts';
import { opFactory, TEST_COMPANY, TEST_PROJECT, TEST_RELATORIO, TEST_USER, type OpFactory } from '../test-support.ts';
import { asBlockDefinition } from '../types/block-definition.ts';
import { companyTypeDefinitionSchema, type CompanyTypeDraft } from '../types/definition.ts';
import { removeDraftEntry } from '../types/draft-edit.ts';
import { duplicateSeededType } from '../types/duplicate.ts';
import { validateTypeDraft } from '../types/validate.ts';
import { testApplicability } from './applicability.ts';
import { composeConclusion, conclusionFloor } from './conclusion.ts';
import { repeatChecklistPattern } from './ficha.ts';
import { choiceValue, evaluateSheetMeasurements, measurementCounts } from './measurement-evaluation.ts';
import { lastNameplateCopy, nameplateCopyFields } from './nameplate-copy.ts';
import { dryFieldExcusedReason, isMediumItem, isOilFieldExcused, oilCrossingClearedCount, oilCrossingPuts, oilCrossingToastText, oilDerivedNaKeys, oilFieldExcusedReason } from './oil-rule.ts';
import { checklistResultIsStored, checklistResultOf, sheetProgress } from './sheet-progress.ts';
import { nameplatePhotoOffered, nameplateTitleOf } from './nameplate-block.ts';
import { LEGACY_TAG_PREFIX, suggestTag, TAG_PREFIX } from './tag.ts';
import { newEquipmentBlock, paletteTypeGroups } from './tree.ts';

/*
 * Batch e24s (Stories 24.10 to 24.12, seed v14; Bruno's questions 18, 19 and 22 of 2026-11-10): the
 * TP and the TC with their own lists, the transformer's oil and dry items (and, on every seed with
 * an oil rule, an oil field of a non-oil unit read-only with its reason), the Inspeção de QGBT's
 * retightening, function test and thermography. Each on a v14 sheet and, beside it, on v13 (or v12
 * and v6 for the oil fields), where every function answers as before. Every value is invented.
 */

const id = (n: number) => `019966b0-0e25-7000-8000-${n.toString(16).padStart(12, '0')}`;
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: id(90_000 + ++opCounter) });
const measured = (raw: string, unit: string | null) => ({ raw, unit, state: 'measured' as const });
const ctx = EMPTY_DEFINITION_CONTEXT;

// --- one sheet, built directly ------------------------------------------------------------------

function sheet(type: EquipmentBlockType, seedVersion: string, subtype?: Subtype): BlockRow {
  return newEquipmentBlock({
    definitions: ctx,
    blockId: id(1),
    equipmentId: id(2),
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: id(4),
    type,
    tag: 'T1',
    seedVersion,
    orderKey: 'a0',
    ...(subtype === undefined ? {} : { config: defaultBlockConfig(seedVersion, type, { subtype }) as unknown as JsonValue }),
  }).block;
}

const definitionOf = (block: Pick<BlockRow, 'seed_version' | 'block_type'>): BlockDefinition => getDefinition(block.seed_version, 'cabine_primaria', block.block_type);

function plate(block: BlockRow, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  for (const [key, value] of Object.entries(values)) next.sheet.nameplate[key] = cell(value);
  return next;
}

/** Every checklist row Conforme, then the given rows (by key) with their result and observation. */
function checklist(block: BlockRow, rows: Record<string, { result: string; observation?: string }> = {}): BlockRow {
  const next = structuredClone(block);
  for (const item of definitionOf(block).checklist!) {
    const row = rows[item.key] ?? { result: 'C' };
    next.sheet.checklist[item.key] = { result: cell(row.result), ...(row.observation === undefined ? {} : { observation: cell(row.observation) }) };
  }
  return next;
}

function testCells(block: BlockRow, testKey: string, values: Record<string, unknown>): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  for (const [address, value] of Object.entries(values)) {
    const [row, col] = address.split('/') as [string, string];
    test.cells[row] = { ...test.cells[row], [col]: cell(value) };
  }
  next.sheet.test[testKey] = test;
  return next;
}

function testValue(block: BlockRow, testKey: string, key: string, stored: unknown): BlockRow {
  const next = structuredClone(block);
  const test = next.sheet.test[testKey] ?? { cells: {} };
  next.sheet.test[testKey] = { ...test, values: { ...test.values, [key]: cell(stored) } };
  return next;
}

function switchedOff(block: BlockRow, subBlock: string): BlockRow {
  const next = structuredClone(block);
  (next.config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks[subBlock] = { enabled: false };
  return next;
}

const results = (block: BlockRow, keys: readonly string[]) => keys.map((key) => checklistResultOf(block, key, ctx));
const missingItems = (block: BlockRow) => sheetProgress({ blocks: [block] }, block.id).steps.verificacoes.missing;

// --- a relatório with one sheet of every type (the layout-lock fixture by rule) --------------------

/** The v13 or v14 synthetic relatório by rule, each sheet of a type in `blocks` replaced by that sheet. */
function snapshotOf(version: string, blocks: readonly BlockRow[]): RelatorioSnapshot {
  const snapshot = structuredClone(layoutLockSnapshot(version, { epic24: false }));
  snapshot.blocks = snapshot.blocks.map((block) => {
    const mine = blocks.find((one) => one.block_type === block.block_type);
    return mine === undefined ? block : { ...block, config: structuredClone(mine.config), sheet: structuredClone(mine.sheet) };
  });
  return snapshot;
}

const printedSheet = (snapshot: RelatorioSnapshot, type: string): PrintSheet => {
  const blockId = snapshot.blocks.find((block) => block.block_type === type)!.id;
  return section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!.subsections.flatMap((s) => s.sheets).find((s) => s.blockId === blockId)!;
};
const tables = (printed: PrintSheet): PrintTable[] => printed.parts.flatMap((part: SheetPart) => (part.kind === 'table' ? [part.table] : []));
const texts = (table: PrintTable): string[][] => table.rows.map((row) => row.cells.map((c) => c.text));
/** The item rows of the VERIFICAÇÕES GERAIS table: "N. LABEL" and its mark columns C, NC, NA. */
function checklistRows(printed: PrintSheet): string[][] {
  const table = tables(printed).find((one) => one.rows[0]!.cells[0]!.text === 'VERIFICAÇÕES GERAIS')!;
  return texts(table).slice(2);
}

// ===================================================================================================
// Story 24.10
// ===================================================================================================

describe('24.10-UNIT the v14 TP and TC print and conclude by their own lists; v13 as before', () => {
  it('section 9: the v14 TP prints seven rows with FUSÍVEIS (no hint), the v14 TC six; v13 seven on both', () => {
    for (const version of ['v13', 'v14']) {
      const snapshot = snapshotOf(version, [checklist(sheet('tp', version)), checklist(sheet('tc', version))]);
      const tp = checklistRows(printedSheet(snapshot, 'tp')).map((row) => row[0]);
      const tc = checklistRows(printedSheet(snapshot, 'tc')).map((row) => row[0]);
      expect(tp, version).toEqual(['1. LIMPEZA, PINTURA E CORROSÃO', '2. VASAMENTO', '3. FUSÍVEIS', '4. ATERRAMENTO', '5. CONEXÕES', '6. FIAÇÃO SECUNDÁRIA', '7. BUCHAS']);
      expect(tc, version).toEqual(
        version === 'v14'
          ? ['1. LIMPEZA, PINTURA E CORROSÃO', '2. VASAMENTO', '3. ATERRAMENTO', '4. CONEXÕES', '5. FIAÇÃO SECUNDÁRIA', '6. BUCHAS']
          : ['1. LIMPEZA, PINTURA E CORROSÃO', '2. VASAMENTO', '3. FUSÍVEIS', '4. ATERRAMENTO', '5. CONEXÕES', '6. FIAÇÃO SECUNDÁRIA', '7. BUCHAS'],
      );
      // The hint is on the sheet only.
      expect(JSON.stringify(printedSheet(snapshot, 'tp'))).not.toContain('ÍNTEGROS E COM ESPECIFICAÇÃO CORRETA');
    }
  });

  it('the conclusion\'s "item N" follows each list: ATERRAMENTO NC is item 3 on a v14 TC, item 4 on v13 and on the v14 TP', () => {
    const nc = { aterramento: { result: 'NC', observation: 'aterramento desconectado' } };
    const text = (type: EquipmentBlockType, version: string) => {
      const block = checklist(sheet(type, version), nc);
      return composeConclusion(block, definitionOf(block), 'TC-01').text;
    };
    expect(text('tc', 'v14')).toContain('aterramento desconectado (item 3, NC)');
    expect(text('tc', 'v13')).toContain('aterramento desconectado (item 4, NC)');
    expect(text('tp', 'v14')).toContain('aterramento desconectado (item 4, NC)');
    // The printed sheet carries the same text once concluded; its checklist marks NC on row 3.
    const block = checklist(sheet('tc', 'v14'), nc);
    const rows = checklistRows(printedSheet(snapshotOf('v14', [block]), 'tc'));
    expect(rows[2]).toEqual(['3. ATERRAMENTO', '', 'X', '', 'aterramento desconectado']);
  });

  it('a v14 TC asks six items, its dry subtype still NA on VASAMENTO only; a v14 TC filled counts no FUSÍVEIS', () => {
    expect(missingItems(sheet('tc', 'v14'))).toBe(6);
    expect(missingItems(sheet('tc', 'v13'))).toBe(7);
    const dry = sheet('tc', 'v14', 'epoxi');
    expect(results(dry, ['vasamento'])).toEqual(['NA']);
    expect(missingItems(dry)).toBe(5);
    expect(missingItems(checklist(sheet('tc', 'v14')))).toBe(0);
  });

  it('"Igual à" and "Copiar da última visita" from a v13 TC copy the plate onto a v14 TC as today, and nothing of the checklist', () => {
    const v14 = definitionOf(sheet('tc', 'v14'));
    const source = checklist(plate(sheet('tc', 'v13'), { fabricacao: 'Fabricante Sintético', tensao_nominal_at: measured('13.8', 'kV') }), { fusiveis: { result: 'NC', observation: 'fusível queimado' } });
    const same = nameplateCopyFields(source, v14);
    expect(same.map((entry) => entry.fieldKey).sort()).toEqual(['fabricacao', 'tensao_nominal_at']);
    const last = lastNameplateCopy(
      {
        last_nameplate: {
          relatorio_id: id(70),
          revision_number: 1,
          issued_at: '2026-10-01T12:00:00.000Z',
          seed_version: 'v13',
          block_type: 'tc',
          fields: { fabricacao: 'Fabricante Sintético', tensao_nominal_at: measured('13.8', 'kV') },
        },
      },
      v14,
    );
    expect(last.map((entry) => entry.fieldKey).sort()).toEqual(['fabricacao', 'tensao_nominal_at']);
    // A checklist answer is never a copy's: the v14 TC has no FUSÍVEIS to receive one, and the pattern copy skips it.
    expect(repeatChecklistPattern(source, sheet('tc', 'v14'), ctx).map((entry) => entry.itemKey)).not.toContain('fusiveis');
  });
});

// ===================================================================================================
// Story 24.11
// ===================================================================================================

const OIL_V14 = ['valvula_de_alivio', 'elemento_secante', 'juntas_vedacoes_e_vazamentos', 'registros_radiadores', 'rele_de_gas_funcionamento', 'termometro', 'oleo_isolante_indicador_de_nivel', 'tanque_e_aletas'];
const DRY_V14 = ['ventiladores', 'limpeza_das_bobinas', 'trincas_na_resina'];
const OLEO = 'ÓLEO ISOLANTE';
const transformer = (version = 'v14', subtype?: Subtype) => sheet('transformador_forca', version, subtype);

describe('24.11-UNIT the v14 transformer: the oil items NA on a dry unit, the dry items NA on an oil unit', () => {
  it('an oil unit asks 17 items: the three dry items NA by the rule (derived, never a cell), not missing', () => {
    const block = plate(transformer(), { tipo_de_isolacao: OLEO });
    expect(results(block, DRY_V14)).toEqual(['NA', 'NA', 'NA']);
    expect(DRY_V14.every((key) => !checklistResultIsStored(block, key, ctx))).toBe(true);
    expect(results(block, OIL_V14)).toEqual(OIL_V14.map(() => null));
    expect([...oilDerivedNaKeys(block, ctx)]).toEqual(DRY_V14);
    expect(missingItems(block)).toBe(17 - 3);
    // The oil sampling applies.
    expect(testApplicability(block, definitionOf(block), 'coleta_oleo').state).toBe('met');
  });

  it('a dry unit (Á SECO, EPÓXI, or the dry subtype with TIPO empty) shows the eight oil items NA, asks the three dry items, and the oil sampling does not apply', () => {
    for (const block of [plate(transformer(), { tipo_de_isolacao: 'Á SECO' }), plate(transformer(), { tipo_de_isolacao: 'EPÓXI' }), transformer('v14', 'a_seco')]) {
      expect(results(block, OIL_V14)).toEqual(OIL_V14.map(() => 'NA'));
      expect(results(block, DRY_V14)).toEqual([null, null, null]);
      expect(missingItems(block)).toBe(17 - 8);
      // The sampling reads TIPO DE ISOLAÇÃO itself (v13's `applies_when`): not applicable once a dry value is typed.
      if (block.sheet.nameplate.tipo_de_isolacao !== undefined) expect(testApplicability(block, definitionOf(block), 'coleta_oleo').state).not.toBe('met');
    }
  });

  it('with TIPO DE ISOLAÇÃO empty all 17 items are asked', () => {
    const block = transformer();
    expect(results(block, [...OIL_V14, ...DRY_V14]).every((result) => result === null)).toBe(true);
    expect(oilDerivedNaKeys(block, ctx).size).toBe(0);
    expect(missingItems(block)).toBe(17);
  });

  it('a stored answer wins over the derived NA: NC on VENTILAÇÃO FORÇADA of an oil unit', () => {
    const block = checklist(plate(transformer(), { tipo_de_isolacao: OLEO }), { ventiladores: { result: 'NC', observation: 'ventilador inoperante' } });
    expect(checklistResultOf(block, 'ventiladores', ctx)).toBe('NC');
    expect(checklistResultIsStored(block, 'ventiladores', ctx)).toBe(true);
    // An NC row floors Com restrições and names its item, as any NC row (item 5).
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(composeConclusion(block, definitionOf(block), 'TR-01').text).toContain('ventilador inoperante (item 5, NC)');
  });

  it('a v13 transformer asks VENTILADORES on both kinds of unit; only its seven oil items are the rule\'s', () => {
    const oil = plate(transformer('v13'), { tipo_de_isolacao: OLEO });
    const dry = plate(transformer('v13'), { tipo_de_isolacao: 'EPÓXI' });
    expect(results(oil, ['ventiladores'])).toEqual([null]);
    expect(results(dry, ['ventiladores'])).toEqual([null]);
    expect(oilDerivedNaKeys(oil, ctx).size).toBe(0);
    expect(missingItems(oil)).toBe(14);
    expect(missingItems(dry)).toBe(14 - 7);
    expect(isMediumItem(oil, 'ventiladores', ctx)).toBe(false);
    expect(isMediumItem(plate(transformer(), { tipo_de_isolacao: OLEO }), 'ventiladores', ctx)).toBe(true);
  });

  it('the pattern copy never copies a dry item\'s derived NA', () => {
    const oil = plate(transformer(), { tipo_de_isolacao: OLEO });
    const target = transformer();
    expect(repeatChecklistPattern(oil, target, ctx).map((entry) => entry.itemKey)).toEqual([]);
  });
});

// --- the crossing, through the fold -----------------------------------------------------------------

const BLOCK = '019966b0-0e25-7100-8000-000000000001';
const EQUIPMENT = '019966b0-0e25-7100-8000-000000000002';
const LOCAL = '019966b0-0e25-7100-8000-000000000003';
const PHOTO = '019966b0-0e25-7100-8000-000000000004';

const local = (): LocationRow => ({
  id: LOCAL,
  relatorio_id: TEST_RELATORIO,
  parent_id: null,
  kind: 'cabine',
  name: 'Subestação',
  order_key: 'a0',
  se: { type: null, primary_kv: null, secondary_kv: null, installed_kva: null },
  env: { altitude_m: null, temperature_c: null, humidity_pct: null },
  agrupar_por_tipo: false,
  removed_at: null,
});

function photo(itemKey: string): FileRow {
  return {
    id: PHOTO,
    company_id: TEST_COMPANY,
    relatorio_id: TEST_RELATORIO,
    kind: 'photo',
    sha256: 'ab',
    mime: 'image/jpeg',
    size: 1,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-11-11T12:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: BLOCK,
    item_key: itemKey,
    caption: null,
    reading_kind: null,
    reading_target: { item_key: itemKey } as JsonValue,
    reading_status: 'none',
    people_in_photo: false,
  } as FileRow;
}

function folded(seedVersion: string, photos: FileRow[] = [], f: OpFactory = opFactory()): { state: EntityState; f: OpFactory } {
  const config = defaultBlockConfig(seedVersion, 'transformador_forca') as unknown as JsonValue;
  const { equipment, block } = newEquipmentBlock({ definitions: ctx, blockId: BLOCK, equipmentId: EQUIPMENT, relatorioId: TEST_RELATORIO, projectId: TEST_PROJECT, locationId: LOCAL, type: 'transformador_forca', tag: 'TR-1', seedVersion, orderKey: 'a0', config });
  const relatorio = relatorioRowSchema.parse({
    id: TEST_RELATORIO,
    project_id: TEST_PROJECT,
    template_id: null,
    template_version: null,
    seed_version: seedVersion,
    status: 'em_campo',
    setup: { service_start: null, service_end: null, atividade: null, local: null, responsible_user_id: null, cover_photo_file_id: null },
    export: { scheme: 'ordem_de_campo' },
    preview_file_id: null,
    removed_at: null,
  });
  const rows = new Map<EntityKey, EntityRow>([
    [entityKey('relatorio', TEST_RELATORIO), relatorio],
    [entityKey('location', LOCAL), local()],
    [entityKey('equipment', EQUIPMENT), equipment],
  ]);
  for (const row of photos) rows.set(entityKey('file', row.id), row);
  return { state: applyOp(rows, f.op({ kind: 'create', path: blockPath(BLOCK), value: block as unknown as JsonValue })), f };
}

function putAll(state: EntityState, f: OpFactory, writes: readonly [string, unknown][]): EntityState {
  let next = state;
  for (const [path, value] of writes) {
    const current = parsePath(path).family === 'file/field' ? null : cellAt(next, parsePath(path));
    next = applyOp(next, f.op({ path, value: value as JsonValue, prev_op_id: current?.merge?.head_op_id ?? current?.op_id ?? null }));
  }
  return next;
}

const blockOf = (state: EntityState): BlockRow => state.get(entityKey('block', BLOCK)) as BlockRow;
const snapshotFor = (state: EntityState) => ({
  blocks: [blockOf(state)],
  files: [...state.values()].filter((row): row is FileRow => (row as { kind?: string }).kind === 'photo'),
  equipment_types: [],
});
const nameplate = (key: string) => sheetNameplatePath(BLOCK, key);
const item = (key: string, field: 'result' | 'observation' = 'result') => sheetChecklistPath(BLOCK, key, field);

describe('24.11-UNIT the crossing between dry and oil clears the dry items on its way to oil, in the same batch', () => {
  it('dry to oil: the three answered dry items (results, an observation, a photo tie) are cleared; they read NA after', () => {
    const { state, f } = folded('v14', [photo('trincas_na_resina')]);
    const dry = putAll(state, f, [
      [nameplate('tipo_de_isolacao'), 'EPÓXI'],
      [item('ventiladores'), 'C'],
      [item('limpeza_das_bobinas'), 'C'],
      [item('trincas_na_resina'), 'NC'],
      [item('trincas_na_resina', 'observation'), 'trinca na resina da bobina'],
    ]);
    const snapshot = snapshotFor(dry);
    const puts = oilCrossingPuts(snapshot, BLOCK, 'tipo_de_isolacao', OLEO);
    expect(puts.map((put) => put.path).sort()).toEqual(
      [item('ventiladores'), item('limpeza_das_bobinas'), item('trincas_na_resina'), item('trincas_na_resina', 'observation'), fileFieldPath(PHOTO, 'item_key')].sort(),
    );
    expect(oilCrossingClearedCount(puts, snapshot)).toBe(3);
    // authored (e24s): the toast names the dry items apart.
    expect(oilCrossingToastText(puts, snapshot)).toBe('3 itens de unidade a seco apagados');
    const oil = putAll(dry, f, [[nameplate('tipo_de_isolacao'), OLEO], ...puts.map((put): [string, unknown] => [put.path, put.value])]);
    expect(results(blockOf(oil), DRY_V14)).toEqual(['NA', 'NA', 'NA']);
  });

  it('with oil items and dry fields answered too, the toast names each part', () => {
    const { state, f } = folded('v14');
    const dry = putAll(state, f, [
      [nameplate('tipo_de_isolacao'), 'Á SECO'],
      [nameplate('classe_termica'), 'F (155)'],
      [item('tanque_e_aletas'), 'C'],
      [item('limpeza_das_bobinas'), 'C'],
    ]);
    const snapshot = snapshotFor(dry);
    const puts = oilCrossingPuts(snapshot, BLOCK, 'tipo_de_isolacao', OLEO);
    expect(oilCrossingToastText(puts, snapshot)).toBe('1 item de óleo apagado, 1 item de unidade a seco apagado e 1 campo de unidade a seco apagado');
  });

  it('oil to dry leaves the dry items (a dry unit asks them) and clears the oil items as before; unknown to oil clears nothing', () => {
    const { state, f } = folded('v14');
    const oil = putAll(state, f, [
      [nameplate('tipo_de_isolacao'), OLEO],
      [item('ventiladores'), 'NC'],
      [item('tanque_e_aletas'), 'C'],
    ]);
    const toDry = oilCrossingPuts(snapshotFor(oil), BLOCK, 'tipo_de_isolacao', 'EPÓXI').map((put) => put.path);
    expect(toDry).toContain(item('tanque_e_aletas'));
    expect(toDry).not.toContain(item('ventiladores'));
    const unknown = putAll(state, f, [[item('limpeza_das_bobinas'), 'C']]);
    expect(oilCrossingPuts(snapshotFor(unknown), BLOCK, 'tipo_de_isolacao', OLEO)).toEqual([]);
  });

  it('v13 has no dry items: a crossing to oil clears VENTILADORES never', () => {
    const { state, f } = folded('v13');
    const dry = putAll(state, f, [
      [nameplate('tipo_de_isolacao'), 'EPÓXI'],
      [item('ventiladores'), 'C'],
    ]);
    expect(oilCrossingPuts(snapshotFor(dry), BLOCK, 'tipo_de_isolacao', OLEO).map((put) => put.path)).not.toContain(item('ventiladores'));
  });
});

describe('24.11-UNIT an oil field of a non-oil unit reads "Não se aplica" on every seed with an oil rule', () => {
  it('v6, v12 and v14 TP, TC and transformer: VOL. ÓLEO of a dry unit carries the reason, stays excused; oil and unknown units none', () => {
    for (const version of ['v6', 'v12', 'v14']) {
      for (const type of ['tp', 'tc', 'transformador_forca'] as const) {
        const rule = definitionOf(sheet(type, version)).oil_rule!;
        const dryValue = 'EPÓXI';
        const block = plate(sheet(type, version), { tipo_de_isolacao: dryValue, vol_oleo: measured('120', 'L') });
        for (const key of rule.fields) {
          expect(oilFieldExcusedReason(block, key, ctx), `${version} ${type} ${key}`).toBe(`Não se aplica: TIPO DE ISOLAÇÃO é ${dryValue}.`);
          expect(isOilFieldExcused(block, key, ctx), `${version} ${type} ${key}`).toBe(true);
        }
        // The stored value is kept, never cleared by reading.
        expect(block.sheet.nameplate.vol_oleo?.value).toEqual(measured('120', 'L'));
        const oil = plate(sheet(type, version), { tipo_de_isolacao: rule.oil_values[0]! });
        expect(oilFieldExcusedReason(oil, 'vol_oleo', ctx), `${version} ${type}`).toBeNull();
        expect(oilFieldExcusedReason(sheet(type, version), 'vol_oleo', ctx), `${version} ${type}`).toBeNull();
        // Never on a field that is not an oil field.
        expect(oilFieldExcusedReason(block, 'tipo_de_isolacao', ctx)).toBeNull();
      }
    }
  });

  it('a dry subtype with TIPO empty names the subtype; the disjuntor reads its medium; "Outro" (read as oil) has no reason', () => {
    expect(oilFieldExcusedReason(sheet('tp', 'v12', 'a_seco'), 'vol_oleo', ctx)).toBe('Não se aplica: TIPO DE ISOLAÇÃO é Á SECO.');
    const disjuntor = (value: string) => plate(sheet('disjuntor_mt', 'v12'), { meio_de_extincao: value });
    expect(oilFieldExcusedReason(disjuntor('AR'), 'vol_oleo', ctx)).toBe('Não se aplica: MEIO DE EXTINÇÃO é AR.');
    expect(oilFieldExcusedReason(disjuntor('Outro'), 'vol_oleo', ctx)).toBeNull();
    // The two reasons never meet: a dry field of an oil unit keeps its own.
    const oilTransformer = plate(transformer(), { tipo_de_isolacao: OLEO });
    expect(dryFieldExcusedReason(oilTransformer, 'classe_termica', ctx)).toBe(`Não se aplica: TIPO DE ISOLAÇÃO é ${OLEO}.`);
    expect(oilFieldExcusedReason(oilTransformer, 'classe_termica', ctx)).toBeNull();
  });

  it('the print is unchanged: VOL. ÓLEO of a dry unit prints "-" with a value stored', () => {
    for (const version of ['v13', 'v14']) {
      const block = plate(sheet('tp', version), { tipo_de_isolacao: 'EPÓXI', vol_oleo: measured('120', 'L') });
      const rows = texts(tables(printedSheet(snapshotOf(version, [block]), 'tp'))[0]!);
      const at = rows.flatMap((row) => row.map((text, c) => [text, row[c + 1]] as const)).find(([text]) => text === 'VOL. ÓLEO');
      expect(at?.[1], version).toBe('-');
    }
  });
});

describe('24.11-UNIT a company type duplicated from the v14 transformer carries `dry_items` and behaves as the library type', () => {
  it('the copy publishes with the 17 items and the rule; its sheet derives the same NA; v13\'s copy carries none', () => {
    const draft = duplicateSeededType('v14', 'transformador_forca').draft;
    expect(draft.checklist).toHaveLength(17);
    expect(draft.oil_rule?.dry_items).toEqual(DRY_V14);
    expect(validateTypeDraft(draft)).toEqual([]);
    const definition = companyTypeDefinitionSchema.parse(draft);
    expect(definition.oil_rule?.dry_items).toEqual(DRY_V14);
    const adapted = asBlockDefinition({ id: id(80), type_id: id(81), version: 1, definition });
    expect(adapted.oil_rule?.dry_items).toEqual(DRY_V14);
    expect(Object.hasOwn(duplicateSeededType('v13', 'transformador_forca').draft.oil_rule!, 'dry_items')).toBe(false);
    // The schema refuses a dry item that is also an oil item, or off the checklist.
    expect(companyTypeDefinitionSchema.safeParse({ ...definition, oil_rule: { ...definition.oil_rule!, dry_items: ['termometro'] } }).success).toBe(false);
    expect(companyTypeDefinitionSchema.safeParse({ ...definition, oil_rule: { ...definition.oil_rule!, dry_items: ['nao_existe'] } }).success).toBe(false);
  });

  it('removing a dry item from the copy\'s list removes it from the rule; removing all three drops the key', () => {
    const draft: CompanyTypeDraft = duplicateSeededType('v14', 'transformador_forca').draft;
    const at = (next: CompanyTypeDraft, key: string) => next.checklist!.findIndex((entry) => entry!.key === key);
    const one = removeDraftEntry(draft, 'checklist', at(draft, 'trincas_na_resina'));
    expect(one.oil_rule?.dry_items).toEqual(['ventiladores', 'limpeza_das_bobinas']);
    expect(validateTypeDraft(one)).toEqual([]);
    const two = removeDraftEntry(one, 'checklist', at(one, 'limpeza_das_bobinas'));
    const none = removeDraftEntry(two, 'checklist', at(two, 'ventiladores'));
    expect(Object.hasOwn(none.oil_rule!, 'dry_items')).toBe(false);
    expect(validateTypeDraft(none)).toEqual([]);
  });
});

// ===================================================================================================
// Story 24.12
// ===================================================================================================

const inspection = (version = 'v14') => checklist(sheet('inspecao_qgbt', version));
const inLoad = (block: BlockRow, answer: 'sim' | 'nao') => testValue(block, 'termografia', 'em_carga', choiceValue(answer));
const thermo = (block: BlockRow) => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === 'termografia');
const printsThermography = (block: BlockRow) => JSON.stringify(printedSheet(snapshotOf(block.seed_version, [block]), 'inspecao_qgbt')).includes('ΔT');

describe('24.12-UNIT the v14 Inspeção de QGBT: twelve items and the optional thermography', () => {
  it('asks twelve items; REAPERTO GERAL and TESTE DE FUNCIONAMENTO print as rows 11 and 12; v13 asks ten', () => {
    expect(missingItems(sheet('inspecao_qgbt', 'v14'))).toBe(12);
    expect(missingItems(sheet('inspecao_qgbt', 'v13'))).toBe(10);
    const rows = checklistRows(printedSheet(snapshotOf('v14', [inspection()]), 'inspecao_qgbt')).map((row) => row[0]);
    expect(rows.slice(10)).toEqual(['11. REAPERTO GERAL', '12. TESTE DE FUNCIONAMENTO']);
    expect(checklistRows(printedSheet(snapshotOf('v13', [inspection('v13')]), 'inspecao_qgbt'))).toHaveLength(10);
  });

  it('thermography unanswered: not missing, the conclusion Aprovado · Sem restrições, no thermography table printed', () => {
    const block = inspection();
    expect(thermo(block)?.enabled).toBe(true);
    expect(measurementCounts([thermo(block)!]).missing).toBe(0);
    expect(sheetProgress({ blocks: [block] }, block.id).steps.ensaios.missing).toBe(0);
    expect(sheetProgress({ blocks: [switchedOff(block, 'termografia')] }, block.id).steps.ensaios.missing).toBe(0);
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    expect(printsThermography(block)).toBe(false);
  });

  it('the conclusion wording: off, not applicable (fora de carga) and unanswered read alike; measured within says "dentro dos critérios"', () => {
    const text = (block: BlockRow) => composeConclusion(block, definitionOf(block), 'QG-01').text;
    const unanswered = text(inspection());
    const off = text(switchedOff(inspection(), 'termografia'));
    const na = text(inLoad(inspection(), 'nao'));
    expect(off).toBe(unanswered);
    expect(na).toBe(unanswered);
    expect(unanswered).toContain('todos os itens verificados conformes');
    expect(unanswered).not.toContain('dentro dos critérios');
    const within = inLoad(testCells(inspection(), 'termografia', { '0/0': measured('2', '°C') }), 'sim');
    expect(text(within)).toContain('valores medidos dentro dos critérios de aceitação e todos os itens verificados conformes');
    // v13 (no test at all) never says no value was recorded (e22g N5).
    expect(text(inspection('v13'))).not.toContain('sem valores medidos');
  });

  it('in load with a ΔT in the band that calls for action: judged by the bands of the eight, printed', () => {
    const restricted = inLoad(testCells(inspection(), 'termografia', { '0/0': measured('10', '°C') }), 'sim');
    expect(thermo(restricted)!.rows[0]!.cells[0]!.verdict).toBe('restricted');
    expect(conclusionFloor(restricted)?.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    expect(printsThermography(restricted)).toBe(true);
    const out = inLoad(testCells(inspection(), 'termografia', { '0/0': measured('20', '°C') }), 'sim');
    expect(thermo(out)!.rows[0]!.cells[0]!.verdict).toBe('out');
    // Seed v14 (Story 24.3): out of its criterion floors Reprovado and nothing else.
    expect(conclusionFloor(out)?.pair).toEqual({ result: 'reprovado', restriction: null });
    // The same reading on the TP's thermography is judged alike.
    const tp = inLoad(testCells(sheet('tp', 'v14'), 'termografia', { '0/0': measured('10', '°C') }), 'sim');
    expect(thermo(tp)!.rows[0]!.cells[0]!.verdict).toBe('restricted');
  });
});

// ===================================================================================================
// Story 24.13
// ===================================================================================================

describe('24.13-UNIT the No-break de comando: palette, TAG, composer, caption, conclusion and print', () => {
  const noBreak = () => checklist(sheet('no_break_comando', 'v14'));

  it('is offered under "Outros equipamentos" of a v14 palette only, its TAG NB-NN, its composer and caption words', () => {
    const library = paletteTypeGroups('v14', ctx).find((group) => group.key === 'library')!;
    expect(library.types).toContain('no_break_comando');
    expect(paletteTypeGroups('v13', ctx).flatMap((group) => group.types)).not.toContain('no_break_comando');
    expect(suggestTag('no_break_comando', [])).toBe('NB-01');
    expect(TAG_PREFIX.no_break_comando).toBe('NB');
    expect(LEGACY_TAG_PREFIX.no_break_comando).toBe('NB');
    expect(totalsText({ no_break_comando: 2 }, ctx)).toBe('2 no-breaks de comando');
    expect(CAPTION_EQUIPMENT_WORDS.no_break_comando).toEqual({ name: 'no-break de comando', gender: 'm', number: 'singular' });
    expect(duplicateSeededType('v14', 'no_break_comando').draft).toMatchObject({ tag_prefix: 'NB', noun: { singular: 'no-break de comando', gender: 'm' }, base_block_type: 'no_break_comando' });
  });

  it('item 4 NC with a chip and the rest Conforme: Aprovado · Com restrições; the conclusion names item 4 and nothing measured', () => {
    const block = checklist(sheet('no_break_comando', 'v14'), { baterias: { result: 'NC', observation: 'bateria estufada' } });
    expect(conclusionFloor(block)?.pair).toEqual({ result: 'aprovado', restriction: 'com_restricoes' });
    const text = composeConclusion(block, definitionOf(block), 'NB-01').text;
    expect(text).toContain('O no-break de comando');
    expect(text).toContain('bateria estufada (item 4, NC)');
    expect(text).not.toContain('valores medidos');
    expect(composeConclusion(noBreak(), definitionOf(noBreak()), 'NB-01').text).not.toContain('valores medidos');
  });

  it('prints under "Outros equipamentos" after the other library types and before the Malha, with its plate, six rows and its print title', () => {
    // Grouped by type, the cabine prints "Outros equipamentos" with the Malha last (Story 23.21's rule).
    const grouped = snapshotOf('v14', [plate(noBreak(), { modelo: 'NBC-3000' })]);
    const snapshot = { ...grouped, locations: grouped.locations.map((location) => (location.kind === 'cabine' ? { ...location, agrupar_por_tipo: true } : location)) };
    const printed = printedSheet(snapshot, 'no_break_comando');
    expect(printed.title.startsWith('NO-BREAK DE COMANDO')).toBe(true);
    expect(checklistRows(printed).map((row) => row[0])).toEqual(definitionOf(noBreak()).checklist!.map((item, n) => `${n + 1}. ${item.label}`));
    expect(JSON.stringify(tables(printed)[0])).toContain('NBC-3000');
    const order = section9Layout(snapshot, 9, 'RELATÓRIOS DOS ENSAIOS')!
      .subsections.flatMap((s) => s.sheets)
      .map((one) => snapshot.blocks.find((block) => block.id === one.blockId)!.block_type);
    expect(order.indexOf('no_break_comando')).toBeLessThan(order.indexOf('malha_aterramento'));
    expect(order.indexOf('no_break_comando')).toBeGreaterThan(order.indexOf('inspecao_qgbt'));
  });
});

// ===================================================================================================
// Story 24.14
// ===================================================================================================

const sampling = (block: BlockRow) => evaluateSheetMeasurements(block, definitionOf(block)).find((test) => test.testKey === 'coleta_oleo')!;
const textValue = (block: BlockRow) => sampling(block).values.find((value) => value.key === 'motivo_texto');
/** An oil transformer of `version` whose sampling reads "Não coletado" with `reason` (and `text`, when given). */
function notCollected(version: string, reason: string | null, text?: unknown): BlockRow {
  let block = testCells(plate(transformer(version), { tipo_de_isolacao: OLEO }), 'coleta_oleo', { '0/0': choiceValue('nao_coletado') });
  if (reason !== null) block = testValue(block, 'coleta_oleo', 'motivo', choiceValue(reason));
  if (text !== undefined) block = testValue(block, 'coleta_oleo', 'motivo_texto', text);
  return block;
}

describe('24.14-UNIT the oil sampling\'s "Outro" text', () => {
  it('shows only under "Outro", counts missing while empty, and leaves (kept, not counted) when the reason or the result changes', () => {
    expect(textValue(notCollected('v14', 'outro'))).toMatchObject({ kind: 'text', shown: true, missing: true });
    expect(measurementCounts([sampling(notCollected('v14', 'outro'))]).missing).toBe(1);
    expect(textValue(notCollected('v14', 'outro', 'tampa de coleta travada'))).toMatchObject({ shown: true, missing: false, raw: 'tampa de coleta travada', displayText: 'tampa de coleta travada' });
    const changed = notCollected('v14', 'sem_ponto_de_coleta', 'tampa de coleta travada');
    expect(textValue(changed)).toMatchObject({ shown: false, missing: false });
    expect(changed.sheet.test.coleta_oleo!.values!.motivo_texto!.value).toBe('tampa de coleta travada');
    // The chain is followed: "Coletado" hides Motivo, so the text under it hides too, whatever Motivo still stores.
    const collected = testCells(notCollected('v14', 'outro', 'tampa de coleta travada'), 'coleta_oleo', { '0/0': choiceValue('coletado') });
    expect(sampling(collected).values.map((value) => [value.key, value.shown])).toEqual([
      ['motivo', false],
      ['motivo_texto', false],
    ]);
    expect(measurementCounts([sampling(collected)]).missing).toBe(0);
    // v13 has no text value.
    expect(textValue(notCollected('v13', 'outro'))).toBeUndefined();
  });

  it('the values line and section 9 say the text after the word as typed; v13 prints the word alone', () => {
    const typed = notCollected('v14', 'outro', 'Tampa de coleta travada');
    expect(sampling(typed).valuesLine?.text).toBe('Motivo: Outro, Tampa de coleta travada');
    const line = (block: BlockRow) => {
      const printed = printedSheet(snapshotOf(block.seed_version, [block]), 'transformador_forca');
      const table = tables(printed).find((one) => one.rows[0]!.cells[0]!.text === 'COLETA DE ÓLEO')!;
      return texts(table)
        .flat()
        .find((text) => text.startsWith('MOTIVO:'));
    };
    expect(line(typed)).toBe('MOTIVO: OUTRO, Tampa de coleta travada');
    expect(line(notCollected('v14', 'sem_ponto_de_coleta', 'Tampa de coleta travada'))).toBe('MOTIVO: SEM PONTO DE COLETA');
    expect(line(notCollected('v13', 'outro'))).toBe('MOTIVO: OUTRO');
  });
});

describe('24.14-UNIT the fold takes a text value up to the medium cap, and nothing else', () => {
  const textPath = sheetTestValuePath(BLOCK, 'coleta_oleo', 'motivo_texto');
  it('a string up to 1000 characters folds; longer, or not a string, is refused; a choice value keeps its short cap', () => {
    const { state, f } = folded('v14');
    const ok = putAll(state, f, [[textPath, 'x'.repeat(TEXT_CAPS.medium)]]);
    expect(blockOf(ok).sheet.test.coleta_oleo!.values!.motivo_texto!.value).toHaveLength(TEXT_CAPS.medium);
    expect(() => putAll(state, f, [[textPath, 'x'.repeat(TEXT_CAPS.medium + 1)]])).toThrow();
    expect(() => putAll(state, f, [[textPath, { raw: 'x', unit: null, state: 'measured' }]])).toThrow();
    expect(() => putAll(state, f, [[sheetTestValuePath(BLOCK, 'coleta_oleo', 'motivo'), { raw: 'x'.repeat(TEXT_CAPS.short + 1), unit: null, state: 'measured' }]])).toThrow();
    const cleared = putAll(ok, f, [[textPath, null]]);
    expect(blockOf(cleared).sheet.test.coleta_oleo!.values!.motivo_texto!.value).toBeNull();
    expect(textCapOf(textPath)).toBe(TEXT_CAPS.medium);
    // v13 declares no such value.
    const old = folded('v13');
    expect(() => putAll(old.state, old.f, [[textPath, 'x']])).toThrow();
  });
});

describe('24.14-UNIT the Malha\'s plate block: its title and no plate photo, read from the definition', () => {
  it('v14 "Dados da malha" and no photo; v13 and every other type the surface\'s title and a photo; a company copy carries both', () => {
    const v14 = getDefinition('v14', 'cabine_primaria', 'malha_aterramento');
    expect([nameplateTitleOf(v14), nameplatePhotoOffered(v14)]).toEqual(['Dados da malha', false]);
    const v13 = getDefinition('v13', 'cabine_primaria', 'malha_aterramento');
    expect([nameplateTitleOf(v13), nameplatePhotoOffered(v13)]).toEqual([null, true]);
    expect(nameplatePhotoOffered(getDefinition('v14', 'cabine_primaria', 'no_break_comando'))).toBe(true);
    const draft = duplicateSeededType('v14', 'malha_aterramento').draft;
    expect([draft.nameplate_title, draft.nameplate_photo]).toEqual(['Dados da malha', false]);
    const definition = companyTypeDefinitionSchema.parse(draft);
    const adapted = asBlockDefinition({ id: id(82), type_id: id(83), version: 1, definition });
    expect([nameplateTitleOf(adapted), nameplatePhotoOffered(adapted)]).toEqual(['Dados da malha', false]);
  });

  it('a published Malha copy keeps both keys through the row schemas the store reads it with (its version row and its draft row)', () => {
    const { derived_from, draft } = duplicateSeededType('v14', 'malha_aterramento');
    const version = equipmentTypeVersionRowSchema.parse({ id: id(84), type_id: id(85), version: 1, definition: draft, published_by: TEST_USER, published_at: '2026-11-11T12:00:00.000Z' });
    expect([version.definition.nameplate_title, version.definition.nameplate_photo]).toEqual(['Dados da malha', false]);
    const type = equipmentTypeRowSchema.parse({ id: id(85), derived_from, draft, retired_at: null, removed_at: null, latest_version: 1 });
    expect([type.draft?.nameplate_title, type.draft?.nameplate_photo]).toEqual(['Dados da malha', false]);
    // Read back through `asBlockDefinition`, the stored version still titles its block and offers no photo.
    const adapted = asBlockDefinition(version);
    expect([nameplateTitleOf(adapted), nameplatePhotoOffered(adapted)]).toEqual(['Dados da malha', false]);
  });

  it('the grid still fails above VALOR DE PROJETO, and its tables print as v13\'s with the same values', () => {
    const grid = (version: string) =>
      testCells(plate(sheet('malha_aterramento', version), { valor_projeto_ohm: measured('2', 'Ω'), metodo_medicao: 'ALICATE TERRÔMETRO', condicao_solo: 'SECO' }), 'resistencia_malha', { '0/0': measured('3', 'Ω') });
    for (const version of ['v13', 'v14']) expect(conclusionFloor(grid(version))?.pair.result, version).toBe('reprovado');
    const printedOf = (version: string) => tables(printedSheet(snapshotOf(version, [grid(version)]), 'malha_aterramento')).map(texts);
    expect(printedOf('v14')).toEqual(printedOf('v13'));
  });
});

// ===================================================================================================
// Fix batch e24x (E1 and the post-merge check)
// ===================================================================================================

describe('e24x-UNIT E1 the v14 Inspeção de QGBT with its thermography not live reads as v13 (e22g N5)', () => {
  const text = (block: BlockRow) => composeConclusion(block, definitionOf(block), 'QG-01').text;

  it('off, not applicable (fora de carga) and unanswered: no ", sem valores medidos registrados"; the v13 sentence unmoved and pinned', () => {
    const v13 = text(inspection('v13'));
    expect(v13).toMatch(/ apresentou todos os itens verificados conformes\.$/);
    expect(v13).not.toContain('sem valores medidos');
    for (const [name, block] of [
      ['unanswered', inspection()],
      ['off', switchedOff(inspection(), 'termografia')],
      ['fora de carga', inLoad(inspection(), 'nao')],
    ] as const) {
      expect(text(block), name).not.toContain('sem valores medidos registrados');
      expect(text(block), name).toBe(v13);
    }
  });

  it('in load with nothing measured: the reading is still asked for (", sem valores medidos registrados")', () => {
    expect(text(inLoad(inspection(), 'sim'))).toMatch(/ apresentou todos os itens verificados conformes, sem valores medidos registrados\.$/);
  });
});

describe('e24x-UNIT post-merge check: the No-break de comando (no test) under this batch\'s rules', () => {
  const noBreak = (rows: Record<string, { result: string; observation?: string }> = {}) => checklist(sheet('no_break_comando', 'v14'), rows);

  it('all Conforme: Aprovado · Sem restrições, the sentence names no reading; an NC observation typed in lines joins on one line, a colon line with a space', () => {
    const clean = noBreak();
    expect(conclusionFloor(clean)?.pair).toEqual({ result: 'aprovado', restriction: 'sem_restricoes' });
    const sentence = composeConclusion(clean, definitionOf(clean), 'NB-01').text;
    expect(sentence).toMatch(/ apresentou todos os itens verificados conformes\.$/);
    expect(sentence).not.toContain('valores medidos');
    const first = definitionOf(clean).checklist![0]!.key;
    const nc = noBreak({ [first]: { result: 'NC', observation: 'Observado:\n- bateria estufada' } });
    expect(composeConclusion(nc, definitionOf(nc), 'NB-01').text).toContain('Observado: - bateria estufada (item 1, NC)');
  });
});

