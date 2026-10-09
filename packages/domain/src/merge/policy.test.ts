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

  it('contract 16: a composed text over an edited one is a contradiction, before same value and filled over empty; over a text already in conflict it is protected; any other text stays latest text', () => {
    const { eduardo, f } = world();
    const text = `sheet/${BLOCK}/conclusion/text`;
    const composed = (value: string, prev: string | null = null) => f.op({ path: text, value, prev_op_id: prev, actor_id: ANA, device_id: A_DEVICE, meta: { composed: true } });
    const edited = c('edited');
    expect(mergePolicy({ path: at(text), current: c('meu texto'), op: composed('texto composto'), textStatus: edited })).toEqual({ kind: 'contradiction' });
    // c16-2: checked before same value and filled over empty (an Editar left as composed, an emptied edit).
    expect(mergePolicy({ path: at(text), current: c('meu texto'), op: composed('meu texto'), textStatus: edited })).toEqual({ kind: 'contradiction' });
    expect(mergePolicy({ path: at(text), current: c(''), op: composed('texto composto'), textStatus: edited })).toEqual({ kind: 'contradiction' });
    const inConflict: Cell = { ...c('texto composto'), conflict: { op_id: '019966b0-0010-7000-8000-0000000000cc', value: 'meu texto', source_suggestion_id: null } };
    expect(mergePolicy({ path: at(text), current: inConflict, op: composed('texto composto'), textStatus: c('confirmed') })).toEqual({ kind: 'protect' });
    expect(mergePolicy({ path: at(text), current: inConflict, op: composed('outro composto'), textStatus: c('confirmed') })).toEqual({ kind: 'protect' });
    // An unflagged put over a text in conflict folds as before.
    expect(mergePolicy({ path: at(text), current: inConflict, op: eduardo(text, 'texto composto') })).toEqual({ kind: 'apply', rule: 'same_value' });
    // An unflagged text (an edit) over an edited one, and a composed one over a confirmed one: latest text.
    expect(mergePolicy({ path: at(text), current: c('meu texto'), op: eduardo(text, 'outro texto'), textStatus: edited })).toEqual({ kind: 'apply', rule: 'latest_text' });
    expect(mergePolicy({ path: at(text), current: c('a'), op: composed('b'), textStatus: c('confirmed') })).toEqual({ kind: 'apply', rule: 'latest_text' });
    expect(mergePolicy({ path: at(text), current: c('a'), op: eduardo(text, 'b') })).toEqual({ kind: 'apply', rule: 'latest_text' });
    const head = c('meu texto');
    expect(mergePolicy({ path: at(text), current: head, op: composed('b', head.op_id), textStatus: edited })).toEqual({ kind: 'sequential' });
  });

  it('contract 16: a concurrent basis follows the text (sequential) unless the status is in contradiction', () => {
    const { eduardo } = world();
    const basis = `sheet/${BLOCK}/conclusion/text_basis`;
    expect(mergePolicy({ path: at(basis), current: c('aaaaaaaa'), op: eduardo(basis, 'bbbbbbbb'), textStatus: c('edited') })).toEqual({ kind: 'sequential' });
    expect(mergePolicy({ path: at(basis), current: c('aaaaaaaa'), op: eduardo(basis, 'bbbbbbbb') })).toEqual({ kind: 'sequential' });
    const contradicted: Cell = { ...c('confirmed'), conflict: { op_id: '019966b0-0010-7000-8000-0000000000bb', value: 'edited', source_suggestion_id: null } };
    expect(mergePolicy({ path: at(basis), current: c('aaaaaaaa'), op: eduardo(basis, 'bbbbbbbb'), textStatus: contradicted })).toEqual({ kind: 'contradiction' });
    expect(mergePolicy({ path: at(basis), current: c('aaaaaaaa'), op: eduardo(basis, 'aaaaaaaa'), textStatus: contradicted })).toEqual({ kind: 'apply', rule: 'same_value' });
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

  it('contract 16: an edited conclusion text and a concurrent conclude (composed): the edited text is never lost, in either seq order', () => {
    const { create, eduardo, ana, f } = world();
    const at = (field: string) => `sheet/${BLOCK}/conclusion/${field}`;
    const EDITED = 'Texto editado por Eduardo.';
    const COMPOSED = 'A seccionadora SEC-01 apresentou valores medidos dentro dos critérios de aceitação.';
    const pair = [ana(at('result'), 'aprovado'), ana(at('restriction'), 'sem_restricoes')];
    // Eduardo: "Editar" (text, edited, basis), then his typed text, chained on his own ops.
    const e1 = [eduardo(at('text'), COMPOSED), eduardo(at('text_status'), 'edited'), eduardo(at('text_basis'), 'aaaaaaaa')];
    const e2 = eduardo(at('text'), EDITED, e1[0]!.op_id);
    // Ana, not having pulled Eduardo's ops: the conclude batch, its text flagged composed.
    const conclude = [
      f.op({ path: at('text'), value: `${COMPOSED} Composto.`, actor_id: ANA, device_id: A_DEVICE, meta: { composed: true } }),
      ana(at('text_status'), 'confirmed'),
      ana(at('text_basis'), 'bbbbbbbb'),
      ana(`block/${BLOCK}/concluded_by`, { actor_id: ANA, at: '2026-10-09T12:00:00.000Z' }),
    ];
    const editFirst = fold([create, ...pair, ...e1, e2, ...conclude]);
    const concludeFirst = fold([create, ...pair, ...conclude, ...e1, e2]);
    for (const row of [editFirst, concludeFirst]) {
      const text = row.sheet.conclusion.text!;
      expect([text.value, text.conflict?.value]).toContain(EDITED);
    }
    // Edit first: the conclude's composed text stands, Eduardo's text is the durable conflict.
    expect(editFirst.sheet.conclusion.text?.value).toBe(conclude[0]!.value);
    expect(editFirst.sheet.conclusion.text?.conflict).toEqual({ op_id: e2.op_id, value: EDITED, source_suggestion_id: null });
    // Conclude first: Eduardo's edit lands on a confirmed text and stands (latest free text).
    expect(concludeFirst.sheet.conclusion.text?.value).toBe(EDITED);
    expect(concludeFirst.sheet.conclusion.text?.conflict).toBeUndefined();
    // The basis keeps its mark in both orders: the status is in contradiction when it lands.
    expect(editFirst.sheet.conclusion.text_basis?.conflict?.value).toBe('aaaaaaaa');
    expect(concludeFirst.sheet.conclusion.text_basis?.conflict?.value).toBe('bbbbbbbb');
  });

  it('contract 16: two concurrent edits of the conclusion text stay latest text, in either seq order', () => {
    const { create, eduardo, ana } = world();
    const at = (field: string) => `sheet/${BLOCK}/conclusion/${field}`;
    const e = [eduardo(at('text'), 'Texto de Eduardo.'), eduardo(at('text_status'), 'edited')];
    const a = [ana(at('text'), 'Texto de Ana.'), ana(at('text_status'), 'edited')];
    const eFirst = fold([create, ...e, ...a]).sheet.conclusion.text!;
    const aFirst = fold([create, ...a, ...e]).sheet.conclusion.text!;
    expect(eFirst).toMatchObject({ value: 'Texto de Ana.', merge: { rule: 'latest_text' } });
    expect(eFirst.conflict).toBeUndefined();
    expect(aFirst).toMatchObject({ value: 'Texto de Eduardo.', merge: { rule: 'latest_text' } });
    expect(aFirst.conflict).toBeUndefined();
  });

  it('contract 16: two concurrent edits or confirms on different bases leave no basis mark, in either seq order', () => {
    const { create, eduardo, ana } = world();
    const at = (field: string) => `sheet/${BLOCK}/conclusion/${field}`;
    for (const status of ['edited', 'confirmed']) {
      const e = [eduardo(at('text'), 'Texto de Eduardo.'), eduardo(at('text_status'), status), eduardo(at('text_basis'), 'aaaaaaaa')];
      const a = [ana(at('text'), 'Texto de Ana.'), ana(at('text_status'), status), ana(at('text_basis'), 'bbbbbbbb')];
      for (const [first, second] of [
        [e, a],
        [a, e],
      ] as const) {
        const conclusion = fold([create, ...first, ...second]).sheet.conclusion;
        expect(conclusion.text_basis).toEqual({ value: second[2]!.value, source_suggestion_id: null, op_id: second[2]!.op_id });
        expect(conclusion.text_status?.conflict).toBeUndefined();
        expect(conclusion.text?.conflict).toBeUndefined();
      }
    }
  });

  it('10.2 a contradiction shows the seq-later op and marks the cell with the side it displaced', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(result, 'C');
    const a = ana(result, 'NA');
    expect(fold([create, e, a]).sheet.checklist[ITEM]?.result).toEqual({
      value: 'NA',
      source_suggestion_id: null,
      op_id: a.op_id,
      conflict: { op_id: e.op_id, value: 'C', source_suggestion_id: null },
    });
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
