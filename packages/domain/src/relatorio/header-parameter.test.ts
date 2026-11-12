import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityKey } from '../ops/apply.ts';
import { blockPath, sheetTestPath } from '../ops/path.ts';
import type { InstrumentRow } from '../registry/instrument-row.ts';
import type { EquipmentBlockType } from '../schemas/block-config.ts';
import type { BlockRow, Cell, EntityRow, JsonValue } from '../schemas/entities.ts';
import { EMPTY_DEFINITION_CONTEXT, getDefinition } from '../seed/definitions.ts';
import { opFactory, TEST_PROJECT, TEST_RELATORIO } from '../test-support.ts';
import {
  headerParameterRestoredText,
  headerParameterView,
  headerWithParameter,
  headerWithRegistryParameter,
  parseHeaderParameter,
  readHeaderParameter,
} from './header-parameter.ts';
import { instrumentHeaderOf, suggestedInstrument, testParameterText, type InstrumentHeader } from './instrument-pick.ts';
import { rowTestVoltage } from './row-voltage.ts';
import { testVoltageCheck } from './test-voltage.ts';
import { newEquipmentBlock } from './tree.ts';

/*
 * 25.11-UNIT (Story 25.11, M06): the instrument header's test parameter as a field of the sheet.
 * The stored text's form, the changed sign, the way back, the fallback of a row and the Quadro's
 * notice, which read the stored header and so follow the field.
 */

const BLOCK = '019966b0-2511-7000-8000-000000000001';
const MEGGER = '019966b0-2511-7000-8000-0000000000a1';
const OTHER = '019966b0-2511-7000-8000-0000000000a2';
let opCounter = 0;
const cell = (value: unknown): Cell => ({ value: value as Cell['value'], source_suggestion_id: null, op_id: `019966b0-2511-7000-8000-${(1000 + ++opCounter).toString(16).padStart(12, '0')}` });

function instrument(over: Partial<InstrumentRow> = {}): InstrumentRow {
  return {
    id: MEGGER,
    kind: 'instrument',
    code: '2E',
    name: 'Megôhmetro',
    manufacturer: 'Instrum',
    model: 'DMG10Ki',
    serial: 'IN919021',
    cert_number: '37428/26',
    laboratory: null,
    calibrated_at: '2026-08-28',
    calibration_interval_months: 12,
    rbc_accredited: true,
    test_isolacao: { raw: '10', unit: 'kV' },
    test_resistencia_contato: { raw: '10', unit: 'A' },
    test_relacao_transformacao: null,
    certificate_file_id: null,
    removed_at: null,
    ...over,
  } as InstrumentRow;
}

function sheet(type: EquipmentBlockType, seedVersion: string, headers: Record<string, InstrumentHeader | null> = {}): BlockRow {
  const { block } = newEquipmentBlock({
    definitions: EMPTY_DEFINITION_CONTEXT,
    blockId: BLOCK,
    equipmentId: '019966b0-2511-7000-8000-000000000002',
    relatorioId: TEST_RELATORIO,
    projectId: TEST_PROJECT,
    locationId: '019966b0-2511-7000-8000-000000000003',
    type,
    tag: 'PR-1',
    seedVersion,
    orderKey: 'a0',
  });
  for (const [key, header] of Object.entries(headers)) {
    block.sheet.test[key] = { ...(block.sheet.test[key] ?? { cells: {} }), instrument: header === null ? undefined : cell(header) } as BlockRow['sheet']['test'][string];
  }
  return block;
}

const picked = (row: InstrumentRow, testKey: 'isolacao' | 'resistencia_contato' = 'isolacao') => instrumentHeaderOf(row, testKey);
const withParameter = (header: InstrumentHeader, text: string | null): InstrumentHeader => ({ ...header, test_parameter: text });

describe('25.11-UNIT the stored text form', () => {
  it('the field commits in the pick\'s form: grouped thousands, decimal comma, the unit after a space', () => {
    expect(testParameterText('5', 'kV')).toBe('5 kV');
    expect(testParameterText('2.5', 'kV')).toBe('2,5 kV');
    expect(testParameterText('1000', 'V')).toBe('1.000 V');
    expect(testParameterText('10', null)).toBe('10');
    // The pick writes the same form (the registry's 10 kV).
    expect(picked(instrument()).test_parameter).toBe(testParameterText('10', 'kV'));
  });

  it('the typed text is a positive pt-BR number; empty clears; anything else is refused', () => {
    expect(parseHeaderParameter('5')).toEqual({ raw: '5' });
    expect(parseHeaderParameter(' 2,5 ')).toEqual({ raw: '2.5' });
    expect(parseHeaderParameter('1.000')).toEqual({ raw: '1000' });
    expect(parseHeaderParameter('')).toBeNull();
    for (const typed of ['0', '-5', '+5', 'alta', '5 kV', '0,0']) expect(parseHeaderParameter(typed), typed).toBe('invalid');
  });

  it('a stored text reads back as its number and unit', () => {
    expect(readHeaderParameter('5 kV')).toEqual({ raw: '5', unit: 'kV' });
    expect(readHeaderParameter('1.000 V')).toEqual({ raw: '1000', unit: 'V' });
    expect(readHeaderParameter('2,5 kV')).toEqual({ raw: '2.5', unit: 'kV' });
    expect(readHeaderParameter(null)).toBeNull();
    expect(readHeaderParameter('alta')).toBeNull();
  });

  it('the stored header keeps every other field, and the fold stores it as the pick\'s put (no contract)', () => {
    const header = picked(instrument());
    const block = sheet('para_raio', 'v14', { isolacao: header });
    const next = headerWithParameter(block, 'isolacao', '5', 'kV')!;
    expect(next).toEqual({ ...header, test_parameter: '5 kV' });
    expect(headerWithParameter(block, 'isolacao', null, 'kV')).toEqual({ ...header, test_parameter: null });
    expect(headerWithParameter(sheet('para_raio', 'v14'), 'isolacao', '5', 'kV')).toBeNull();

    const f = opFactory();
    const fresh = sheet('para_raio', 'v14');
    let state = applyOp(new Map<EntityKey, EntityRow>(), f.op({ kind: 'create', path: blockPath(BLOCK), value: fresh as unknown as JsonValue }));
    state = applyOp(state, f.op({ path: sheetTestPath(BLOCK, 'isolacao', 'instrument'), value: header as unknown as JsonValue }));
    state = applyOp(state, f.op({ path: sheetTestPath(BLOCK, 'isolacao', 'instrument'), value: next as unknown as JsonValue }));
    const stored = state.get(entityKey('block', BLOCK)) as BlockRow;
    expect(stored.sheet.test.isolacao?.instrument?.value).toEqual(next);
  });
});

describe('25.11-UNIT the changed sign and the way back', () => {
  const row = instrument();

  it('the registry\'s value shows unchanged; 5 over a registered 10 kV shows changed, naming the registry\'s value', () => {
    const header = picked(row);
    expect(headerParameterView(sheet('para_raio', 'v14', { isolacao: header }), 'isolacao', [row])).toEqual({
      label: 'Tensão de ensaio',
      value: { raw: '10', unit: 'kV' },
      text: '10',
      unit: 'kV',
      changed: false,
      changedText: null,
      registryText: '10 kV',
    });
    const view = headerParameterView(sheet('para_raio', 'v14', { isolacao: withParameter(header, '5 kV') }), 'isolacao', [row])!;
    expect(view).toMatchObject({ text: '5', unit: 'kV', changed: true, changedText: 'Alterada nesta ficha · cadastro: 10 kV', registryText: '10 kV' });
    expect(headerParameterRestoredText(view)).toBe('Tensão de ensaio voltou a 10 kV, a do instrumento');
  });

  it('the same value written another way is not a change (10.000 V is not 10 kV, but 10,0 kV is 10 kV)', () => {
    const header = picked(row);
    expect(headerParameterView(sheet('para_raio', 'v14', { isolacao: withParameter(header, '10,0 kV') }), 'isolacao', [row])!.changed).toBe(false);
    expect(headerParameterView(sheet('para_raio', 'v14', { isolacao: withParameter(header, '10.000 V') }), 'isolacao', [row])!.changed).toBe(true);
  });

  it('"Usar a do instrumento" stores the registry\'s default back, and the sign goes away', () => {
    const block = sheet('para_raio', 'v14', { isolacao: withParameter(picked(row), '5 kV') });
    const back = headerWithRegistryParameter(block, 'isolacao', [row])!;
    expect(back).toEqual(picked(row));
    expect(headerParameterView(sheet('para_raio', 'v14', { isolacao: back }), 'isolacao', [row])!.changed).toBe(false);
  });

  it('the contact test\'s CORRENTE is the same field in A', () => {
    const block = sheet('chave_seccionadora', 'v14', { resistencia_contato: withParameter(picked(row, 'resistencia_contato'), '20 A') });
    expect(headerParameterView(block, 'resistencia_contato', [row])).toMatchObject({ label: 'Corrente de ensaio', text: '20', unit: 'A', changed: true, changedText: 'Alterada nesta ficha · cadastro: 10 A' });
  });

  it('no field: no stored header (a suggestion is not one), a ratio test, no unit known anywhere', () => {
    expect(headerParameterView(sheet('para_raio', 'v14'), 'isolacao', [row])).toBeNull();
    expect(headerParameterView(sheet('tp', 'v14', { relacao_transformacao: picked(row) }), 'relacao_transformacao', [row])).toBeNull();
    const bare = instrument({ test_isolacao: null });
    expect(headerParameterView(sheet('para_raio', 'v14', { isolacao: picked(bare) }), 'isolacao', [bare])).toBeNull();
  });

  it('a registry row with no default: the typed value shows changed, the way back clears it', () => {
    const bare = instrument({ test_isolacao: null });
    const block = sheet('para_raio', 'v14', { isolacao: withParameter(picked(bare), '5 kV') });
    const view = headerParameterView(block, 'isolacao', [bare])!;
    expect(view).toMatchObject({ changed: true, changedText: 'Alterada nesta ficha · cadastro: —', registryText: null });
    expect(headerParameterRestoredText(view)).toBe('Tensão de ensaio voltou à do instrumento');
    expect(headerWithRegistryParameter(block, 'isolacao', [bare])!.test_parameter).toBeNull();
  });

  it('a pick no longer in the registry shows no sign and has no way back', () => {
    const block = sheet('para_raio', 'v14', { isolacao: withParameter(picked(row), '5 kV') });
    expect(headerParameterView(block, 'isolacao', [])).toMatchObject({ text: '5', unit: 'kV', changed: false, changedText: null });
    expect(headerWithRegistryParameter(block, 'isolacao', [])).toBeNull();
  });

  it('picking another instrument stores that one\'s default, and the next sheet\'s suggestion carries the registry\'s default', () => {
    const other = instrument({ id: OTHER, code: '3E', test_isolacao: { raw: '2.5', unit: 'kV' } });
    expect(picked(other).test_parameter).toBe('2,5 kV');
    // A typed 5 kV on one sheet: the next sheet of the kind suggests the instrument with its registry's 10 kV.
    const typed = sheet('para_raio', 'v14', { isolacao: withParameter(picked(row), '5 kV') });
    const next = { ...sheet('para_raio', 'v14'), id: '019966b0-2511-7000-8000-000000000009' };
    const suggestion = suggestedInstrument({ blocks: [typed, next], instruments: [row, other], equipment_types: [] }, next.id, 'isolacao');
    expect(suggestion?.test_parameter).toBe('10 kV');
    // The registry row is never written from the sheet.
    expect(row.test_isolacao).toEqual({ raw: '10', unit: 'kV' });
  });
});

describe('25.11-UNIT the readers follow the stored header', () => {
  const row = instrument();

  it('an insulation row with no voltage of its own follows the header (arrester with no MCOV, v14), and its notice too', () => {
    const block = sheet('para_raio', 'v14', { isolacao: withParameter(picked(row), '5 kV') });
    const test = getDefinition('v14', 'cabine_primaria', 'para_raio').tests.find((one) => one.key === 'isolacao')!;
    expect(rowTestVoltage(block, test, 0)).toMatchObject({ kv: '5', text: '5', source: 'default' });
    const back = sheet('para_raio', 'v14', { isolacao: headerWithRegistryParameter(block, 'isolacao', [row]) });
    expect(rowTestVoltage(back, test, 0)).toMatchObject({ kv: '10', text: '10' });
  });

  it('on seed v11 (no voltage per row) the field works the same and nothing else moves', () => {
    const block = sheet('para_raio', 'v11', { isolacao: withParameter(picked(row), '5 kV') });
    const test = getDefinition('v11', 'cabine_primaria', 'para_raio').tests.find((one) => one.key === 'isolacao')!;
    expect(rowTestVoltage(block, test, 0)).toBeNull();
    expect(headerParameterView(block, 'isolacao', [row])).toMatchObject({ text: '5', changed: true });
  });

  it('the Quadro\'s test-voltage notice reads the changed header', () => {
    const board = sheet('quadro_eletrico', 'v7', { isolacao: picked(row) });
    board.sheet.nameplate.tensao_nominal = cell({ raw: '380', unit: 'V', state: 'measured' });
    const test = getDefinition('v7', 'cabine_primaria', 'quadro_eletrico').tests[0]!;
    expect(testVoltageCheck({ block: board, files: [] }, test)).toMatchObject({ given: '10.000 V' });
    const changed = { ...board, sheet: { ...board.sheet, test: { ...board.sheet.test, isolacao: { ...board.sheet.test.isolacao!, instrument: cell(headerWithParameter(board, 'isolacao', '0.5', 'kV')) } } } };
    expect(testVoltageCheck({ block: changed, files: [] }, test)).toMatchObject({ given: '500 V', expected: '500 V' });
  });
});
