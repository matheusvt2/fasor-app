import { describe, expect, it } from 'vitest';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { entityKey } from '../ops/apply.ts';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { parsePath } from '../ops/path.ts';
import { emptySheet, type BlockRow, type Cell, type JsonValue } from '../schemas/entities.ts';
import { getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { opFactory, TEST_RELATORIO } from '../test-support.ts';
import { isConcurrent, mergeCell, mergePolicy } from './policy.ts';

/*
 * Story 10.1: the merge of one sheet cell written by two devices, through the fold the device
 * (`materializeEntity`) and the server (`applyOp` in `seq` order) share.
 */

const BLOCK = '019966b0-0010-7000-8000-000000000001';
const LOC = '019966b0-0010-7000-8000-000000000002';
const EDUARDO = '019966b0-0010-7000-8000-000000000003';
const ANA = '019966b0-0010-7000-8000-000000000004';
const E_DEVICE = 'tablet-eduardo';
const A_DEVICE = 'tablet-ana';

const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const ITEM = definition.checklist![9]!.key;
const TEST = definition.tests[0]!.key;

const blockRow = (): BlockRow => ({
  id: BLOCK,
  relatorio_id: TEST_RELATORIO,
  location_id: LOC,
  equipment_id: null,
  block_type: 'chave_seccionadora',
  config: {},
  seed_version: SEED_VERSION,
  order_key: 'a0',
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

const result = `sheet/${BLOCK}/checklist/${ITEM}/result`;
const observation = `sheet/${BLOCK}/checklist/${ITEM}/observation`;
const cell = `sheet/${BLOCK}/test/${TEST}/cell/0/0`;

function world() {
  const f = opFactory();
  const create = f.op({ kind: 'create', path: `block/${BLOCK}`, value: blockRow(), device_id: 'office' });
  const eduardo = (path: string, value: JsonValue, prev: string | null = null) =>
    f.op({ path, value, prev_op_id: prev, actor_id: EDUARDO, device_id: E_DEVICE });
  const ana = (path: string, value: JsonValue, prev: string | null = null) => f.op({ path, value, prev_op_id: prev, actor_id: ANA, device_id: A_DEVICE });
  return { f, create, eduardo, ana };
}

/** The server fold: the log in `seq` order (the order given), as `applyOneIn` applies it. */
function fold(log: readonly Op[]): BlockRow {
  const ordered = log.map((op, i) => ({ ...op, seq: i + 1 }));
  return materializeEntity({ entity: 'block', id: BLOCK }, ordered, []) as BlockRow;
}

const standing = (c: Cell | undefined) => (c === undefined ? undefined : { value: c.value, op_id: c.op_id });

describe('isConcurrent', () => {
  it('is false on an empty slot, for a server op, off the sheet, and when prev is the head', () => {
    const { eduardo } = world();
    const x = eduardo(result, 'C');
    const cellX: Cell = { value: 'C', source_suggestion_id: null, op_id: x.op_id };
    expect(isConcurrent(eduardo(result, 'NC'), undefined)).toBe(false);
    expect(isConcurrent({ ...eduardo(result, 'NC'), device_id: SERVER_DEVICE_ID }, cellX)).toBe(false);
    expect(isConcurrent(eduardo(result, 'NC', x.op_id), cellX)).toBe(false);
    expect(isConcurrent(eduardo(result, 'NC'), cellX)).toBe(true);
    const merged: Cell = { ...cellX, merge: { head_op_id: '019966b0-0010-7000-8000-0000000000ff', device_id: A_DEVICE, kept: true, rule: 'nc_over_c' } };
    expect(isConcurrent(eduardo(result, 'C', x.op_id), merged)).toBe(true);
    expect(isConcurrent(eduardo(result, 'C', '019966b0-0010-7000-8000-0000000000ff'), merged)).toBe(false);
  });
});

describe('mergePolicy', () => {
  const at = (path: string) => parsePath(path);
  const c = (value: JsonValue, op_id = '019966b0-0010-7000-8000-0000000000aa'): Cell => ({ value, source_suggestion_id: null, op_id });

  it('decides each rule in the story order and names a contradiction in one place', () => {
    const { eduardo } = world();
    expect(mergePolicy({ path: at(result), current: c('C'), op: eduardo(result, 'C') })).toEqual({ kind: 'apply', rule: 'same_value' });
    expect(mergePolicy({ path: at(cell), current: c({ raw: '12.5', unit: 'MΩ', state: 'measured' }), op: eduardo(cell, null) })).toEqual({
      kind: 'keep',
      rule: 'filled_over_empty',
    });
    expect(mergePolicy({ path: at(cell), current: c(null), op: eduardo(cell, { raw: '1', unit: null, state: 'measured' }) })).toEqual({
      kind: 'apply',
      rule: 'filled_over_empty',
    });
    expect(mergePolicy({ path: at(result), current: c('NC'), op: eduardo(result, 'C') })).toEqual({ kind: 'keep', rule: 'nc_over_c' });
    expect(mergePolicy({ path: at(result), current: c('C'), op: eduardo(result, 'NC') })).toEqual({ kind: 'apply', rule: 'nc_over_c' });
    expect(mergePolicy({ path: at(observation), current: c('a'), op: eduardo(observation, 'b') })).toEqual({ kind: 'apply', rule: 'latest_text' });
    expect(mergePolicy({ path: at(`sheet/${BLOCK}/observations`), current: c('a'), op: eduardo(`sheet/${BLOCK}/observations`, 'b') })).toEqual({
      kind: 'apply',
      rule: 'latest_text',
    });
    expect(mergePolicy({ path: at(`sheet/${BLOCK}/conclusion/text`), current: c('a'), op: eduardo(`sheet/${BLOCK}/conclusion/text`, 'b') })).toEqual({
      kind: 'apply',
      rule: 'latest_text',
    });
    expect(mergePolicy({ path: at(result), current: c('C'), op: eduardo(result, 'NA') })).toEqual({ kind: 'contradiction' });
    expect(mergePolicy({ path: at(result), current: c('NC'), op: eduardo(result, 'NA') })).toEqual({ kind: 'contradiction' });
    expect(mergePolicy({ path: at(cell), current: c({ raw: '1', unit: null, state: 'measured' }), op: eduardo(cell, { raw: '2', unit: null, state: 'measured' }) })).toEqual({
      kind: 'contradiction',
    });
    expect(mergePolicy({ path: at(`sheet/${BLOCK}/conclusion/result`), current: c('aprovado'), op: eduardo(`sheet/${BLOCK}/conclusion/result`, 'reprovado') })).toEqual({
      kind: 'contradiction',
    });
  });

  it('keeps the NC device observation: the record says which device was NC', () => {
    const { eduardo, ana } = world();
    const ncKeptAway: Cell = { ...c('NC'), merge: { head_op_id: c('x').op_id, device_id: A_DEVICE, kept: true, rule: 'nc_over_c' } };
    const ncApplied: Cell = { ...c('NC'), merge: { head_op_id: c('x').op_id, device_id: E_DEVICE, kept: false, rule: 'nc_over_c' } };
    expect(mergePolicy({ path: at(observation), current: c('a'), op: ana(observation, 'b'), result: ncKeptAway })).toEqual({ kind: 'keep', rule: 'nc_observation' });
    expect(mergePolicy({ path: at(observation), current: c('b'), op: eduardo(observation, 'a'), result: ncKeptAway })).toEqual({ kind: 'apply', rule: 'nc_observation' });
    expect(mergePolicy({ path: at(observation), current: c('b'), op: eduardo(observation, 'a'), result: ncApplied })).toEqual({ kind: 'apply', rule: 'nc_observation' });
    expect(mergePolicy({ path: at(observation), current: c('a'), op: ana(observation, 'b'), result: ncApplied })).toEqual({ kind: 'keep', rule: 'nc_observation' });
    // An NC result that merged nothing: the observation is plain free text.
    expect(mergePolicy({ path: at(observation), current: c('a'), op: ana(observation, 'b'), result: c('NC') })).toEqual({ kind: 'apply', rule: 'latest_text' });
  });

  it('is sequential when the op saw the head', () => {
    const { eduardo } = world();
    const current = c('NC');
    expect(mergePolicy({ path: at(result), current, op: eduardo(result, 'C', current.op_id) })).toEqual({ kind: 'sequential' });
  });
});

describe('the fold of two devices on one sheet', () => {
  it('NC vs C: NC first or C first, the result is NC (Eduardo) with his observation', () => {
    const { create, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const eObs = eduardo(observation, 'a');
    const aResult = ana(result, 'C');
    const aObs = ana(observation, 'b');

    const ncFirst = fold([create, eResult, eObs, aResult, aObs]);
    const cFirst = fold([create, aResult, aObs, eResult, eObs]);
    for (const row of [ncFirst, cFirst]) {
      expect(standing(row.sheet.checklist[ITEM]?.result)).toEqual({ value: 'NC', op_id: eResult.op_id });
      expect(standing(row.sheet.checklist[ITEM]?.observation)).toEqual({ value: 'a', op_id: eObs.op_id });
    }
    expect(ncFirst.sheet.checklist[ITEM]?.result?.merge).toEqual({ head_op_id: aResult.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_over_c' });
    expect(ncFirst.sheet.checklist[ITEM]?.observation?.merge).toEqual({ head_op_id: aObs.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_observation' });
    expect(cFirst.sheet.checklist[ITEM]?.result?.merge).toEqual({ head_op_id: eResult.op_id, device_id: E_DEVICE, kept: false, rule: 'nc_over_c' });
    expect(cFirst.sheet.checklist[ITEM]?.observation?.merge).toEqual({ head_op_id: eObs.op_id, device_id: E_DEVICE, kept: false, rule: 'nc_observation' });
  });

  it('the same from a common value X both devices saw', () => {
    const { create, eduardo, ana } = world();
    const x = ana(result, 'C');
    const eResult = eduardo(result, 'NC', x.op_id);
    const aResult = ana(result, 'C', x.op_id);
    const row = fold([create, x, eResult, aResult]);
    expect(standing(row.sheet.checklist[ITEM]?.result)).toEqual({ value: 'NC', op_id: eResult.op_id });
  });

  it('a deliberate C after seeing the merge applies and drops the record (no repeated merge)', () => {
    const { create, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const aResult = ana(result, 'C');
    const again = ana(result, 'C', aResult.op_id);
    const row = fold([create, eResult, aResult, again]);
    expect(row.sheet.checklist[ITEM]?.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: again.op_id });
  });

  it('filled over empty: the reading stands whichever arrives later', () => {
    const { create, eduardo, ana } = world();
    const x = ana(cell, { raw: '1', unit: null, state: 'measured' });
    const filled = eduardo(cell, { raw: '12.5', unit: 'MΩ', state: 'measured' }, x.op_id);
    const cleared = ana(cell, null, x.op_id);
    for (const log of [
      [create, x, filled, cleared],
      [create, x, cleared, filled],
    ]) {
      const row = fold(log);
      expect(standing(row.sheet.test[TEST]?.cells['0']?.['0'])).toEqual({ value: { raw: '12.5', unit: 'MΩ', state: 'measured' }, op_id: filled.op_id });
      expect(row.sheet.test[TEST]?.cells['0']?.['0']?.merge?.rule).toBe('filled_over_empty');
    }
  });

  it('free text: the seq-later text stands', () => {
    const { create, eduardo, ana } = world();
    const path = `sheet/${BLOCK}/observations`;
    const e = eduardo(path, 'texto de Eduardo');
    const a = ana(path, 'texto de Ana');
    expect(standing(fold([create, e, a]).sheet.observations ?? undefined)).toEqual({ value: 'texto de Ana', op_id: a.op_id });
    expect(standing(fold([create, a, e]).sheet.observations ?? undefined)).toEqual({ value: 'texto de Eduardo', op_id: e.op_id });
  });

  it('a contradiction applies the seq-later op with no record (Story 10.2 owns it)', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(result, 'C');
    const a = ana(result, 'NA');
    expect(fold([create, e, a]).sheet.checklist[ITEM]?.result).toEqual({ value: 'NA', source_suggestion_id: null, op_id: a.op_id });
  });

  it('a server op is never merged', () => {
    const { create, eduardo, f } = world();
    const e = eduardo(result, 'NC');
    const server = f.op({ path: result, value: 'C', actor_id: 'system:test', device_id: SERVER_DEVICE_ID });
    expect(fold([create, e, server]).sheet.checklist[ITEM]?.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: server.op_id });
  });

  it('a same value applies the later op with no record', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(result, 'NC');
    const a = ana(result, 'NC');
    expect(fold([create, e, a]).sheet.checklist[ITEM]?.result).toEqual({ value: 'NC', source_suggestion_id: null, op_id: a.op_id });
  });

  it('the device fold (remote then its own pending op) equals the server fold of the same log', () => {
    const { create, eduardo, ana } = world();
    const eResult = eduardo(result, 'NC');
    const aResult = ana(result, 'C');
    const device = materializeEntity({ entity: 'block', id: BLOCK }, [create, eResult].map((op, i) => ({ ...op, seq: i + 1 })), [aResult]);
    expect(device).toEqual(fold([create, eResult, aResult]));
    expect(entityKey('block', BLOCK)).toBe(`block:${BLOCK}`);
  });
});

describe('mergeCell', () => {
  it('writes the op cell when nothing is there', () => {
    const { eduardo } = world();
    const op = eduardo(result, 'NC');
    expect(mergeCell(undefined, op, { path: parsePath(result) })).toEqual({ value: 'NC', source_suggestion_id: null, op_id: op.op_id });
  });
});
