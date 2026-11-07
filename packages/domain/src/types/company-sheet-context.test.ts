import { describe, expect, it } from 'vitest';
import { BLOCK_1_ID, BLOCK_2_ID, COMPANY_ID, companyTypes, DEVICE_ID, RELATORIO_ID, TYPE_1_ID, USER_ID, VERSION_1_ID } from '../../fixtures/company-types/op-log.ts';
import { conflictValueText } from '../merge/conflicts.ts';
import { sheetChecklistPath, sheetTestCellPath, sheetTestValuePath } from '../ops/path.ts';
import { opSchema, type Op } from '../ops/op.ts';
import { replay } from '../ops/replay.ts';
import { nameplateMissingKeys, isNameplateFieldExcused } from '../relatorio/dry-insulation.ts';
import { checklistUnsetItems, repeatChecklistPattern } from '../relatorio/ficha.ts';
import { measurementSuggestions } from '../relatorio/measurement-suggestions.ts';
import { choice } from '../relatorio/measurement-test-support.ts';
import { oilCrossingPuts, oilRuleOf } from '../relatorio/oil-rule.ts';
import { checklistResultIsStored, checklistResultOf, sheetProgress } from '../relatorio/sheet-progress.ts';
import { confirmAllCandidates, nameplateSuggestions, suggestionGroupCounts } from '../relatorio/suggestion-group.ts';
import { livePendingSuggestions } from '../relatorio/suggestion-rows.ts';
import { companyBlockType } from '../schemas/block-config.ts';
import { emptySheet, suggestionRowSchema, type BlockRow, type Cell, type EquipmentTypeVersionRow, type SuggestionRow } from '../schemas/entities.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { definitionContext, EMPTY_DEFINITION_CONTEXT, getDefinition, snapshotDefinitionContext } from '../seed/definitions.ts';
import { quantityLabel } from '../templates/text.ts';
import { asBlockDefinition } from './block-definition.ts';
import { duplicateSeededType, newEquipmentTypeRow } from './duplicate.ts';

/*
 * Fix batch e22h B1: the kernel helpers a company sheet's screen calls take the definition context
 * as a required argument, and answer for a company block through it (they answered empty with
 * the old `EMPTY_DEFINITION_CONTEXT` default). Each case shows the company block's answer and,
 * beside it, what the empty context gives, which is what the screen showed before the fix.
 */

const state = replay(companyTypes.log);
const snapshot = buildSnapshot(state, RELATORIO_ID);
const ctx = snapshotDefinitionContext(snapshot);
const blockOf = (id: string): BlockRow => snapshot.blocks.find((row) => row.id === id)!;

let opCounter = 0;
function put(path: string, value: unknown): Op {
  opCounter += 1;
  return opSchema.parse({
    op_id: `019a5c00-0e22-7000-8000-${opCounter.toString(16).padStart(12, '0')}`,
    kind: 'put',
    scope: 'relatorio',
    company_id: COMPANY_ID,
    project_id: null,
    relatorio_id: RELATORIO_ID,
    path,
    value,
    prev_op_id: null,
    batch_id: null,
    meta: null,
    actor_id: USER_ID,
    device_id: DEVICE_ID,
    client_ts: `2026-11-07T15:${String(opCounter % 60).padStart(2, '0')}:00.000Z`,
  });
}

let suggestionCounter = 0;
function suggestion(targetPath: string, value: unknown): SuggestionRow {
  suggestionCounter += 1;
  return suggestionRowSchema.parse({
    id: `019a5c00-0e22-7000-8001-${suggestionCounter.toString(16).padStart(12, '0')}`,
    relatorio_id: RELATORIO_ID,
    target_path: targetPath,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: '019a5c00-0e22-7000-8002-000000000001', bbox: [0.1, 0.2, 0.3, 0.4], ocr_token_ids: ['t0'], reading_run_id: '019a5c00-0e22-7000-8002-000000000002' },
    status: 'pending',
    prompt_version: 'test-1',
  });
}

describe('e22h B1: a company sheet through its definition context', () => {
  it('"Marcar os restantes como Conforme" lists the unanswered items and writes every one of them', () => {
    // Block 2 (no-break v2): "Limpeza e fixação" answered C, "Bornes" unanswered.
    const block = blockOf(BLOCK_2_ID);
    expect(checklistUnsetItems(block, ctx)).toEqual(['bornes']);
    expect(checklistUnsetItems(block, EMPTY_DEFINITION_CONTEXT)).toEqual([]);
    const marked = replay([...companyTypes.log, ...checklistUnsetItems(block, ctx).map((key) => put(sheetChecklistPath(block.id, key, 'result'), 'C'))]);
    const after = buildSnapshot(marked, RELATORIO_ID).blocks.find((row) => row.id === BLOCK_2_ID)!;
    expect(checklistUnsetItems(after, ctx)).toEqual([]);
    expect(['limpeza_e_fixacao', 'bornes'].map((key) => [checklistResultOf(after, key, ctx), checklistResultIsStored(after, key, ctx)])).toEqual([
      ['C', true],
      ['C', true],
    ]);
  });

  it('"Repetir da ficha anterior" copies the source\'s pattern onto the unanswered items of the same type', () => {
    // Block 1 (no-break v1): C and NC; block 2 answers only the first.
    expect(repeatChecklistPattern(blockOf(BLOCK_1_ID), blockOf(BLOCK_2_ID), ctx)).toEqual([{ itemKey: 'bornes', value: 'NC' }]);
    expect(repeatChecklistPattern(blockOf(BLOCK_1_ID), blockOf(BLOCK_2_ID), EMPTY_DEFINITION_CONTEXT)).toEqual([]);
  });

  it('a plate photo\'s suggestions list, count and confirm on a company plate', () => {
    const block = blockOf(BLOCK_2_ID);
    const pending = [suggestion(`sheet/${BLOCK_2_ID}/nameplate/modelo`, 'NB-3000'), suggestion(`sheet/${BLOCK_2_ID}/nameplate/fabricante`, 'Acme')];
    const listed = nameplateSuggestions(block, pending, ctx);
    expect(listed.map((entry) => [entry.field.key, entry.view])).toEqual([
      ['fabricante', 'fill'],
      ['modelo', 'fill'],
    ]);
    expect(nameplateSuggestions(block, pending, EMPTY_DEFINITION_CONTEXT)).toEqual([]);
    expect(suggestionGroupCounts(block, pending, [], ctx)).toMatchObject({ shown: 2, fills: 2, confirmable: 2 });
    expect(suggestionGroupCounts(block, pending, [], EMPTY_DEFINITION_CONTEXT).shown).toBe(0);
    expect(confirmAllCandidates(block, pending, [], ctx).map((row) => row.target_path).sort()).toEqual(pending.map((row) => row.target_path).sort());
    expect(livePendingSuggestions([block], pending, [], ctx)).toEqual(pending);
  });

  it('a display reading\'s suggestions list on a company measurement test', () => {
    const block = blockOf(BLOCK_2_ID);
    const pending = [suggestion(sheetTestCellPath(BLOCK_2_ID, 'tensoes_medidas', 0, 0), { raw: '126', unit: 'Vcc', state: 'measured' })];
    expect(measurementSuggestions(block, pending, ctx).map((entry) => [entry.address, entry.view])).toEqual([[{ testKey: 'tensoes_medidas', row: 0, col: 0 }, 'fill']]);
  });

  it('a contradicting value of a company measurement test reads as its sheet shows it (conflictValueText with the context)', () => {
    const draft = duplicateSeededType('v12', 'chave_transferencia_automatica').draft;
    const row: EquipmentTypeVersionRow = { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: draft, published_by: USER_ID, published_at: '2026-11-07T12:00:00.000Z' };
    const copy = definitionContext([row], [{ ...newEquipmentTypeRow(TYPE_1_ID, { derived_from: { seed_version: 'v12', block_type: 'chave_transferencia_automatica' }, draft }), draft: null, latest_version: 1 }]);
    const block = { seed_version: 'v12', block_type: companyBlockType(TYPE_1_ID), config: { block_type: companyBlockType(TYPE_1_ID), sub_blocks: {}, na_defaults: [], type_version: 1, type_version_id: VERSION_1_ID } };
    const cell = { path: sheetTestValuePath(BLOCK_2_ID, 'cta_transferencia', 'metodo') };
    const seeded = { seed_version: 'v12', block_type: 'chave_transferencia_automatica' };
    const expected = conflictValueText(cell, choice('botao_teste'), seeded, EMPTY_DEFINITION_CONTEXT);
    expect(expected).toBe('Botão de teste do controlador');
    expect(conflictValueText(cell, choice('botao_teste'), block, copy)).toBe(expected);
    expect(conflictValueText(cell, choice('botao_teste'), block, EMPTY_DEFINITION_CONTEXT)).not.toBe(expected);
  });

  it('N13: a copy\'s composer stepper is named by its label, never its source\'s noun', () => {
    const draft = { ...duplicateSeededType('v12', 'quadro_eletrico').draft, label: 'QGBT da empresa' };
    const row: EquipmentTypeVersionRow = { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: draft, published_by: USER_ID, published_at: '2026-11-07T12:00:00.000Z' };
    const copy = definitionContext([row], [{ ...newEquipmentTypeRow(TYPE_1_ID, { derived_from: { seed_version: 'v12', block_type: 'quadro_eletrico' }, draft }), draft: null, latest_version: 1 }]);
    expect(quantityLabel(companyBlockType(TYPE_1_ID), 0, copy)).toBe('QGBT da empresa, 0');
    expect(quantityLabel('quadro_eletrico', 0, copy)).toBe('Quadros elétricos, 0');
  });
});

describe('e22h: the oil rule of a company type, through the context', () => {
  const draft = duplicateSeededType('v12', 'transformador_forca').draft;
  const row: EquipmentTypeVersionRow = { id: VERSION_1_ID, type_id: TYPE_1_ID, version: 1, definition: draft, published_by: USER_ID, published_at: '2026-11-07T12:00:00.000Z' };
  const definition = asBlockDefinition(row);
  const rule = definition.oil_rule!;
  const company = companyBlockType(TYPE_1_ID);
  const options = getDefinition('v12', 'cabine_primaria', 'transformador_forca').nameplate.find((field) => field.key === rule.field)!.options!;
  const dry = options.find((option) => !rule.oil_values.includes(option) && !(rule.full_values ?? []).includes(option))!;
  const oil = rule.oil_values[0]!;
  const oilItem = rule.items[0]!;
  const oilField = rule.fields[0]!;
  const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: '019a5c00-0e22-7000-8003-000000000001' });
  const unit = (insulation: string, checklist: Record<string, unknown> = {}): BlockRow => {
    const sheet = emptySheet();
    sheet.nameplate[rule.field] = cell(insulation);
    for (const [key, value] of Object.entries(checklist)) sheet.checklist[key] = { result: cell(value) };
    return {
      ...blockOf(BLOCK_1_ID),
      block_type: company,
      config: { block_type: company, sub_blocks: { nameplate: { enabled: true }, checklist: { enabled: true } }, na_defaults: [], type_version: 1, type_version_id: VERSION_1_ID },
      sheet,
    } as BlockRow;
  };
  const types = { equipment_types: [row] };
  const typesCtx = snapshotDefinitionContext(types);

  it('a dry company unit shows its oil items NA and excuses its oil fields, as its seeded source does', () => {
    expect(oilRuleOf(unit(dry), typesCtx)).toEqual(rule);
    expect(oilRuleOf(unit(dry), EMPTY_DEFINITION_CONTEXT)).toBeNull();
    expect(checklistResultOf(unit(dry), oilItem, typesCtx)).toBe('NA');
    expect(checklistResultIsStored(unit(dry), oilItem, typesCtx)).toBe(false);
    expect(checklistResultOf(unit(dry), oilItem, EMPTY_DEFINITION_CONTEXT)).toBeNull();
    expect(checklistResultOf(unit(oil), oilItem, typesCtx)).toBeNull();
    expect(isNameplateFieldExcused(unit(dry), oilField, typesCtx)).toBe(true);
    expect(isNameplateFieldExcused(unit(oil), oilField, typesCtx)).toBe(false);
    expect(nameplateMissingKeys({ blocks: [unit(dry)], ...types }, unit(dry).id).has(oilField)).toBe(false);
    expect(nameplateMissingKeys({ blocks: [unit(oil)], ...types }, unit(oil).id).has(oilField)).toBe(true);
    // "Repetir" never copies a NA the rule only derives.
    expect(repeatChecklistPattern(unit(dry), unit(dry), typesCtx).some((entry) => entry.itemKey === oilItem)).toBe(false);
    // The sheet's progress counts the derived NA as answered.
    const missing = (block: BlockRow) => sheetProgress({ blocks: [block], ...types }, block.id).steps.verificacoes.missing;
    expect(missing(unit(dry))).toBeLessThan(missing(unit(oil)));
  });

  it('a write that crosses from oil to dry clears the oil item it held, only through the snapshot\'s type versions', () => {
    const block = unit(oil, { [oilItem]: 'C' });
    const puts = oilCrossingPuts({ blocks: [block], files: [], ...types }, block.id, rule.field, dry);
    expect(puts).toContainEqual({ path: sheetChecklistPath(block.id, oilItem, 'result'), value: null });
    expect(oilCrossingPuts({ blocks: [block], files: [], equipment_types: undefined }, block.id, rule.field, dry)).toEqual([]);
  });
});
