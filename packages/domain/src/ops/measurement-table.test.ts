import { describe, expect, it } from 'vitest';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replaySmall } from '../../fixtures/replay-small/op-log.ts';
import { conflictOpIds, holdsConflictMarks, openDecisions } from '../merge/conflicts.ts';
import { stampSeen } from '../merge/stamp.ts';
import {
  blockOf,
  choice,
  colOf,
  CTA,
  CTA_BLOCK,
  CTA_EQUIPMENT,
  CTA_LOCAL,
  ctaLocal,
  ctaRelatorio,
  ctaRows,
  ctaState,
  E1,
  E2,
  E3,
  E4,
  E5,
  E6,
  num,
  rowOf,
  writeSheet,
} from '../relatorio/measurement-test-support.ts';
import { advanceOnEdit } from '../relatorio/status-advance.ts';
import { blockConfigWithOption, blockConfigWithSubBlock } from '../relatorio/measurement-evaluation.ts';
import { blockRowSchema, type BlockRow, type EntityRow, type JsonValue } from '../schemas/entities.ts';
import { buildSnapshot, relatorioSnapshotSchema, serializeSnapshot } from '../schemas/snapshot.ts';
import { countsAsEdit, countsAsFieldContent } from '../status/edited-since.ts';
import { opFactory, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { applyOp, cellAt, entityKey, isCellFamily, readPath, SeedPathError, sheetCellAt, targetsOf, type EntityKey, type EntityState } from './apply.ts';
import { opSchema, type Op } from './op.ts';
import { invertBatch } from './outbox.ts';
import {
  blockFieldPath,
  blockPath,
  FAMILIES,
  formatPath,
  isCreateFamily,
  isServerOnly,
  opPathSchema,
  parsePath,
  pathField,
  PathError,
  relatorioStatusPath,
  sheetTestCellPath,
  sheetTestPath,
  sheetTestValuePath,
  targetOf,
} from './path.ts';
import { replay } from './replay.ts';

/*
 * Story 14.5 (contract 19): the fold of the measurement table, one test per row of the spec's
 * I/O matrix that the kernel fold answers: the new value family, the type on an old seed, the
 * geometry and the fixed cells, an undeclared value, the status flow, the undo pairs and the
 * replay of a log written before seed v5.
 */

const metodo = sheetTestValuePath(CTA_BLOCK, E5, 'metodo');
const poloA = sheetTestCellPath(CTA_BLOCK, E1, 0, 0);

describe('contract 19: sheet/{block_id}/test/{test_key}/value/{value_key}', () => {
  it('parses, round-trips, targets the block row and is the forty-fifth family', () => {
    const parsed = parsePath(metodo);
    expect(parsed).toEqual({ family: 'sheet/test/value', block_id: CTA_BLOCK, test_key: E5, value_key: 'metodo' });
    expect(formatPath(parsed)).toBe(metodo);
    expect(metodo).toBe(`sheet/${CTA_BLOCK}/test/cta_transferencia/value/metodo`);
    expect(targetOf(parsed)).toEqual({ entity: 'block', id: CTA_BLOCK });
    expect(pathField(parsed)).toBeNull();
    expect(isCreateFamily(parsed)).toBe(false);
    expect(isServerOnly(parsed)).toBe(false);
    expect(isCellFamily(parsed.family)).toBe(true);
    expect(FAMILIES).toHaveLength(45);
    expect(FAMILIES[44]!.family).toBe('sheet/test/value');
  });

  it('is told apart from the two older test families by its segments alone', () => {
    expect(parsePath(sheetTestPath(CTA_BLOCK, E1, 'instrument')).family).toBe('sheet/test');
    expect(parsePath(poloA).family).toBe('sheet/test/cell');
    expect(parsePath(`sheet/${CTA_BLOCK}/test/${E5}/value/carga`).family).toBe('sheet/test/value');
    for (const path of [`sheet/${CTA_BLOCK}/test/${E5}/value`, `sheet/${CTA_BLOCK}/test/${E5}/value/carga/x`, `sheet/${CTA_BLOCK}/test/${E5}/values/carga`, `sheet/${CTA_BLOCK}/test/${E5}/value/Carga`]) {
      expect(() => parsePath(path), path).toThrow(PathError);
    }
    expect(opPathSchema.safeParse({ family: 'sheet/test/value', block_id: CTA_BLOCK, test_key: E5, value_key: 'Método' }).success).toBe(false);
  });

  it('is put only at the push boundary, in relatório scope', () => {
    const f = opFactory();
    const put = f.op({ path: metodo, value: choice('falta_real') });
    expect(opSchema.safeParse(put).success).toBe(true);
    expect(opSchema.safeParse({ ...put, value: null }).success).toBe(true);
    expect(opSchema.safeParse({ ...put, kind: 'remove', value: null }).success).toBe(false);
    expect(opSchema.safeParse({ ...put, kind: 'create' }).success).toBe(false);
    expect(opSchema.safeParse({ ...put, relatorio_id: null }).success).toBe(false);
  });
});

describe('matrix "CTA on an old seed": the type exists on v5 only', () => {
  const create = (block: BlockRow, f = opFactory()): Op => f.op({ kind: 'create', path: blockPath(block.id), value: block as unknown as JsonValue });
  const base = (seedVersion: string): EntityState =>
    new Map<EntityKey, EntityRow>([
      [entityKey('relatorio', TEST_RELATORIO), ctaRelatorio(seedVersion)],
      [entityKey('location', CTA_LOCAL), ctaLocal()],
    ]);

  it('a block create of the type folds on a v5 relatório', () => {
    const { block } = ctaRows();
    const state = applyOp(base('v5'), create(block));
    expect(blockOf(state)).toMatchObject({ block_type: CTA, seed_version: 'v5', created_by: TEST_USER });
    expect(blockRowSchema.parse(blockOf(state))).toEqual(blockOf(state));
  });

  it.each(['v1', 'v2', 'v3', 'v4'])('a block create of the type carrying seed_version %s is refused, whatever the state holds', (version) => {
    const block = { ...ctaRows().block, seed_version: version };
    for (const state of [base(version), base('v5'), new Map() as EntityState]) {
      expect(() => applyOp(state, create(block))).toThrow(SeedPathError);
      expect(() => applyOp(state, create(block))).toThrow(new RegExp(`block_type "${CTA}" is not in seed_version "${version}"`));
    }
  });

  it.each(['v1', 'v2', 'v3', 'v4'])('a block create of the type born on v5 is refused on a %s relatório, the row targetsOf names for it', (version) => {
    const op = create(ctaRows().block);
    expect(targetsOf(op).map((ref) => ref.key)).toEqual([entityKey('block', CTA_BLOCK), entityKey('location', CTA_LOCAL), entityKey('relatorio', TEST_RELATORIO)]);
    expect(() => applyOp(base(version), op)).toThrow(SeedPathError);
    expect(() => applyOp(base(version), op)).toThrow(new RegExp(`is not in the relatório's seed_version "${version}"`));
    // Replay safety: a relatório row that is not in the state is not checked.
    expect(blockOf(applyOp(new Map([[entityKey('location', CTA_LOCAL), ctaLocal()]]), op)).block_type).toBe(CTA);
  });

  it('a create of one of the eight names no relatório row and is never judged, on any seed version', () => {
    const f = opFactory();
    for (const version of ['v1', 'v4', 'v5', 'v99']) {
      const block = { ...ctaRows().block, block_type: 'tp', seed_version: version, config: { block_type: 'tp', sub_blocks: {}, na_defaults: [] } };
      const op = create(block as BlockRow, f);
      expect(targetsOf(op).map((ref) => ref.entity), version).toEqual(['block', 'location']);
      expect(blockOf(applyOp(base('v1'), op)).block_type).toBe('tp');
    }
  });

  it('a sheet op on a block of the type whose seed version is v1 to v4 is refused: no definition there', () => {
    const f = opFactory();
    for (const version of ['v1', 'v2', 'v3', 'v4']) {
      // A row a contract-18 server could not have written; held here to prove the fold refuses to fill it.
      const block = { ...ctaRows().block, seed_version: version };
      const state: EntityState = new Map([[entityKey('block', CTA_BLOCK), block]]);
      for (const [path, value] of [
        [poloA, num('38', 'µΩ')],
        [metodo, choice('falta_real')],
        [`sheet/${CTA_BLOCK}/nameplate/fabricante`, 'Fabricante X'],
        [`sheet/${CTA_BLOCK}/checklist/placa_confere_com_o_projeto/result`, 'C'],
      ] as const) {
        expect(() => applyOp(state, f.op({ path, value })), `${version} ${path}`).toThrow(/has no equipment definition/);
      }
    }
  });
});

describe('matrix: a table cell and a test value fold into the sheet', () => {
  it('a cell lands at sheet.test[key].cells[row][col] and a value at sheet.test[key].values[key], both attributed', () => {
    const { state, f } = ctaState();
    const next = writeSheet(state, f, [
      { test: E1, row: 'polo_c', col: 'lado_emergencia', value: num('63', 'µΩ') },
      { test: E4, row: 'falta_de_fase', col: 'deixado', value: choice('ligado') },
      { test: E5, key: 'metodo', value: choice('botao_teste') },
      { test: E5, key: 'carga_percentual', value: num('62', '%') },
    ]);
    const block = blockOf(next);
    expect(block.sheet.test[E1]).toEqual({ cells: { '2': { '1': { value: { raw: '63', unit: 'µΩ', state: 'measured' }, source_suggestion_id: null, op_id: expect.any(String) } } } });
    expect(block.sheet.test[E4]!.cells[String(rowOf(E4, 'falta_de_fase'))]![String(colOf(E4, 'deixado'))]!.value).toEqual({ raw: 'ligado', unit: null, state: 'measured' });
    expect(Object.keys(block.sheet.test[E5]!)).toEqual(['cells', 'values']);
    expect(block.sheet.test[E5]!.cells).toEqual({});
    expect(Object.keys(block.sheet.test[E5]!.values!)).toEqual(['metodo', 'carga_percentual']);
    expect(block.sheet.test[E5]!.values!.metodo!.value).toEqual({ raw: 'botao_teste', unit: null, state: 'measured' });
    expect(block.first_edited_at).not.toBeNull();
    expect(block.last_modified_by).toBe(TEST_USER);
    // The row the fold wrote is the row the schema parses to, key order included.
    expect(JSON.stringify(blockRowSchema.parse(block))).toBe(JSON.stringify(block));
    expect(readPath(next, f.op({ path: metodo, value: null }))).toEqual({ raw: 'botao_teste', unit: null, state: 'measured' });
    expect(cellAt(next, parsePath(metodo))?.value).toEqual({ raw: 'botao_teste', unit: null, state: 'measured' });
    expect(sheetCellAt(block.sheet, parsePath(sheetTestValuePath(CTA_BLOCK, E5, 'carga')))).toBeUndefined();
  });

  it('a value written after an instrument keeps the test entry in its schema order', () => {
    const { state, f } = ctaState();
    let next = applyOp(state, f.op({ path: sheetTestValuePath(CTA_BLOCK, E6, 'temperatura_ambiente'), value: num('27', '°C') }));
    next = applyOp(next, f.op({ path: sheetTestCellPath(CTA_BLOCK, E6, 0, 0), value: num('41.2', '°C') }));
    expect(Object.keys(blockOf(next).sheet.test[E6]!)).toEqual(['cells', 'values']);
    let e1 = applyOp(state, f.op({ path: poloA, value: num('38', 'µΩ') }));
    e1 = applyOp(e1, f.op({ path: sheetTestPath(CTA_BLOCK, E1, 'instrument'), value: { instrument_id: CTA_EQUIPMENT, code: '3M' } }));
    expect(Object.keys(blockOf(e1).sheet.test[E1]!)).toEqual(['instrument', 'cells']);
    expect(JSON.stringify(blockRowSchema.parse(blockOf(e1)))).toBe(JSON.stringify(blockOf(e1)));
  });

  it('matrix "Fixed cells": a put to a fixed cell is refused, and so is an address outside the table', () => {
    const { state, f } = ctaState();
    const refused = (path: string, detail: RegExp) => {
      expect(() => applyOp(state, f.op({ path, value: num('1', 'MΩ') })), path).toThrow(SeedPathError);
      expect(() => applyOp(state, f.op({ path, value: num('1', 'MΩ') })), path).toThrow(detail);
    };
    const linha = rowOf(E2, 'linha_carga');
    refused(sheetTestCellPath(CTA_BLOCK, E2, linha, colOf(E2, 'normal_fechada')), /is fixed, never written/);
    refused(sheetTestCellPath(CTA_BLOCK, E2, linha, colOf(E2, 'emergencia_fechada')), /is fixed, never written/);
    refused(sheetTestCellPath(CTA_BLOCK, E5, rowOf(E5, 'ate_carga_na_emergencia'), colOf(E5, 'ajuste')), /is fixed, never written/);
    refused(sheetTestCellPath(CTA_BLOCK, E5, rowOf(E5, 'falha_da_emergencia'), colOf(E5, 'ajuste')), /is fixed, never written/);
    refused(sheetTestCellPath(CTA_BLOCK, E1, 4, 0), /row 4 is outside/);
    refused(sheetTestCellPath(CTA_BLOCK, E1, 0, 2), /column 2 is outside/);
    refused(sheetTestCellPath(CTA_BLOCK, E3, 1, 0), /row 1 is outside/);
    refused(sheetTestCellPath(CTA_BLOCK, 'isolacao', 0, 1), /"isolacao" is not a test of/);
    // The typed neighbours of a fixed cell fold.
    const open = applyOp(state, f.op({ path: sheetTestCellPath(CTA_BLOCK, E2, linha, colOf(E2, 'aberta')), value: num('18.6', 'GΩ') }));
    expect(blockOf(open).sheet.test[E2]!.cells[String(linha)]).toHaveProperty(String(colOf(E2, 'aberta')));
    const medido = applyOp(state, f.op({ path: sheetTestCellPath(CTA_BLOCK, E5, rowOf(E5, 'ate_carga_na_emergencia'), colOf(E5, 'medido')), value: num('8.4', 's') }));
    expect(blockOf(medido).sheet.test[E5]!.cells['1']).toHaveProperty('1');
  });

  it('matrix "Config rows": a row the configuration hides keeps its index and stays writable; its stored cell stays when the row is hidden again', () => {
    // Two poles: Polo C (row 2) and Polo N (row 3) are hidden, and Polo A and B are still rows 0 and 1.
    const { state, f } = ctaState({ polos: '2' });
    const hidden = applyOp(state, f.op({ path: sheetTestCellPath(CTA_BLOCK, E1, rowOf(E1, 'polo_n'), 0), value: num('52', 'µΩ') }));
    expect(blockOf(hidden).sheet.test[E1]!.cells['3']!['0']!.value).toEqual({ raw: '52', unit: 'µΩ', state: 'measured' });
    expect(rowOf(E1, 'polo_a')).toBe(0);
    expect(rowOf(E1, 'polo_n')).toBe(3);
    // The configuration is the whole config put, and it leaves the sheet as it was.
    const four = applyOp(hidden, f.op({ path: blockFieldPath(CTA_BLOCK, 'config'), value: blockConfigWithOption(blockOf(hidden).config, 'polos', '4') }));
    expect((blockOf(four).config as { options: Record<string, string> }).options).toEqual({ polos: '4' });
    expect(blockOf(four).sheet).toEqual(blockOf(hidden).sheet);
    const two = applyOp(four, f.op({ path: blockFieldPath(CTA_BLOCK, 'config'), value: blockConfigWithOption(blockOf(four).config, 'polos', '2') }));
    expect(blockOf(two).sheet.test[E1]!.cells['3']!['0']!.value).toEqual({ raw: '52', unit: 'µΩ', state: 'measured' });
  });

  it('matrix "E5 options": a value key the test does not declare is refused; a seeded test declares none', () => {
    const { state, f } = ctaState();
    for (const path of [sheetTestValuePath(CTA_BLOCK, E5, 'duracao'), sheetTestValuePath(CTA_BLOCK, E1, 'metodo'), sheetTestValuePath(CTA_BLOCK, E6, 'metodo')]) {
      expect(() => applyOp(state, f.op({ path, value: choice('falta_real') })), path).toThrow(SeedPathError);
      expect(() => applyOp(state, f.op({ path, value: choice('falta_real') })), path).toThrow(/declares no value/);
    }
    expect(() => applyOp(state, f.op({ path: sheetTestValuePath(CTA_BLOCK, 'cta_nenhum', 'metodo'), value: null }))).toThrow(/is not a test of/);
    // The seven E5 values and E6's ambient temperature fold.
    let next = state;
    for (const key of ['metodo', 'carga', 'carga_percentual', 'fonte_tempos', 'tensao', 'frequencia', 'corrente']) {
      next = applyOp(next, f.op({ path: sheetTestValuePath(CTA_BLOCK, E5, key), value: num('1', null) }));
    }
    next = applyOp(next, f.op({ path: sheetTestValuePath(CTA_BLOCK, E6, 'temperatura_ambiente'), value: num('27', '°C') }));
    expect(Object.keys(blockOf(next).sheet.test[E5]!.values!)).toHaveLength(7);
    // A seeded test (a seccionadora's isolação) has no value family at all.
    const sec = { ...ctaRows().block, block_type: 'chave_seccionadora', config: { block_type: 'chave_seccionadora', sub_blocks: {}, na_defaults: [] } };
    const seeded: EntityState = new Map([[entityKey('block', CTA_BLOCK), sec as BlockRow]]);
    expect(() => applyOp(seeded, f.op({ path: sheetTestValuePath(CTA_BLOCK, 'isolacao', 'metodo'), value: null }))).toThrow(/declares no value "metodo"/);
  });

  it('a measurement test holds an instrument only where it offers a picker, and never a criterion override', () => {
    const { state, f } = ctaState();
    const header = { instrument_id: CTA_EQUIPMENT, code: '2E' };
    for (const key of [E1, E2, E3]) {
      const next = applyOp(state, f.op({ path: sheetTestPath(CTA_BLOCK, key, 'instrument'), value: header }));
      expect(blockOf(next).sheet.test[key]!.instrument!.value, key).toEqual(header);
    }
    for (const key of [E4, E5, E6]) {
      expect(() => applyOp(state, f.op({ path: sheetTestPath(CTA_BLOCK, key, 'instrument'), value: header })), key).toThrow(/holds no instrument/);
    }
    for (const key of [E1, E2, E3, E4, E5, E6]) {
      expect(() => applyOp(state, f.op({ path: sheetTestPath(CTA_BLOCK, key, 'criterion_override'), value: { raw: '20', unit: 's' } })), key).toThrow(/holds no criterion_override/);
    }
  });

  it('matrix "Test switched off": the switch is the config put, and the cells already typed stay', () => {
    const { state, f } = ctaState();
    const typed = writeSheet(state, f, [{ test: E6, row: 'normal_a', col: 'temperatura', value: num('41.2', '°C') }]);
    const off = applyOp(typed, f.op({ path: blockFieldPath(CTA_BLOCK, 'config'), value: blockConfigWithSubBlock(blockOf(typed).config, E6, false) }));
    expect((blockOf(off).config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks[E6]).toEqual({ enabled: false });
    expect((blockOf(off).config as { sub_blocks: Record<string, { enabled: boolean }> }).sub_blocks[E1]).toEqual({ enabled: true });
    expect(blockOf(off).sheet).toEqual(blockOf(typed).sheet);
    // A put to a switched-off test still folds: the switch may change under it on another device.
    const late = writeSheet(off, f, [{ test: E6, row: 'normal_b', col: 'temperatura', value: num('40.8', '°C') }]);
    expect(Object.keys(blockOf(late).sheet.test[E6]!.cells)).toEqual(['0', '1']);
  });
});

describe('matrix "Status flow" and the undo pairs', () => {
  const draft = (path: string, value: unknown, kind: 'put' | 'create' = 'put') => ({ path, value, kind, actor_id: TEST_USER });

  it('a cell, a choice and a test value are an edit and field content; the configuration and a test switch are structure', () => {
    for (const path of [poloA, sheetTestCellPath(CTA_BLOCK, E4, 8, 3), metodo, sheetTestValuePath(CTA_BLOCK, E5, 'carga_percentual')]) {
      expect(countsAsEdit(draft(path, choice('x'))), path).toBe(true);
      expect(countsAsFieldContent(draft(path, choice('x'))), path).toBe(true);
    }
    const config = draft(blockFieldPath(CTA_BLOCK, 'config'), { block_type: CTA });
    expect(countsAsEdit(config)).toBe(true);
    expect(countsAsFieldContent(config)).toBe(false);
    // A system op never counts.
    expect(countsAsEdit({ ...draft(metodo, choice('x')), actor_id: 'system:reading' })).toBe(false);
  });

  it('the first cell or test value on Rascunho carries Em campo; on Emitido it reopens as Em revisão; the configuration keeps Rascunho', () => {
    for (const path of [poloA, metodo]) {
      expect(advanceOnEdit('rascunho', [draft(path, num('38', 'µΩ'))]), path).toBe('em_campo');
      expect(advanceOnEdit('emitido', [draft(path, num('38', 'µΩ'))]), path).toBe('em_revisao');
      expect(advanceOnEdit('em_campo', [draft(path, num('38', 'µΩ'))]), path).toBeNull();
      expect(advanceOnEdit('em_revisao', [draft(path, num('38', 'µΩ'))]), path).toBeNull();
    }
    const config = draft(blockFieldPath(CTA_BLOCK, 'config'), { block_type: CTA });
    expect(advanceOnEdit('rascunho', [config])).toBeNull();
    expect(advanceOnEdit('emitido', [config])).toBe('em_revisao');
  });

  /** One batch as `buildBatch` commits it: the value put and, since it is field content on Rascunho, the status op. */
  function commit(state: EntityState, f: ReturnType<typeof opFactory>, path: string, value: JsonValue, batch: string): { ops: Op[]; before: Map<string, unknown>; state: EntityState } {
    const status = (state.get(entityKey('relatorio', TEST_RELATORIO)) as { status: 'rascunho' | 'em_campo' | 'emitido' | 'em_revisao' }).status;
    const standing = cellAt(state, parsePath(path));
    const put = stampSeen(f.op({ path, value, batch_id: batch, prev_op_id: standing?.op_id ?? null }), state);
    const to = advanceOnEdit(status, [put]);
    const ops = to === null ? [put] : [put, f.op({ path: relatorioStatusPath(), value: to, batch_id: batch })];
    const before = new Map<string, unknown>();
    let next = state;
    for (const op of ops) {
      before.set(op.op_id, readPath(next, op));
      next = applyOp(next, op);
    }
    return { ops, before, state: next };
  }

  it.each([
    ['a table cell', poloA, num('38', 'µΩ'), num('41', 'µΩ')],
    ['a choice cell', sheetTestCellPath(CTA_BLOCK, E4, 8, 3), choice('ligado'), choice('desligado')],
    ['a test value', metodo, choice('falta_real'), choice('botao_teste')],
  ] as const)('undo pair of %s: a put / a put of the earlier value, the status op inverted with it', (_name, path, first, second) => {
    const { state, f } = ctaState();
    // The first value on a Rascunho relatório: the batch carries the Em campo status op.
    const one = commit(state, f, path, first, f.newId());
    expect(one.ops.map((op) => op.path)).toEqual([path, 'relatorio/status']);
    expect(one.ops[1]!.value).toBe('em_campo');
    expect((one.state.get(entityKey('relatorio', TEST_RELATORIO)) as { status: string }).status).toBe('em_campo');
    expect(cellAt(one.state, parsePath(path))?.value).toEqual(first);
    // Its undo: the status back first, then the value back to unanswered (null), in a new batch.
    const undoOne = invertBatch(one.ops, one.before, { newId: f.newId, now: new Date('2026-09-21T13:00:00.000Z') });
    expect(undoOne.map((op) => [op.kind, op.path, op.value])).toEqual([
      ['put', 'relatorio/status', 'rascunho'],
      ['put', path, null],
    ]);
    expect(new Set(undoOne.map((op) => op.batch_id)).size).toBe(1);
    expect(undoOne[0]!.batch_id).not.toBe(one.ops[0]!.batch_id);
    let undone = one.state;
    for (const op of undoOne) undone = applyOp(undone, stampSeen(op, undone));
    expect((undone.get(entityKey('relatorio', TEST_RELATORIO)) as { status: string }).status).toBe('rascunho');
    expect(cellAt(undone, parsePath(path))?.value).toBeNull();
    expect(cellAt(undone, parsePath(path))?.conflict).toBeUndefined();
    // A second value on the relatório now Em campo: no status op, and its undo puts the first value back.
    const two = commit(one.state, f, path, second, f.newId());
    expect(two.ops.map((op) => op.path)).toEqual([path]);
    const undoTwo = invertBatch(two.ops, two.before, { newId: f.newId, now: new Date('2026-09-21T13:05:00.000Z') });
    expect(undoTwo.map((op) => [op.path, op.value])).toEqual([[path, first]]);
    let back = two.state;
    for (const op of undoTwo) back = applyOp(back, stampSeen(op, back));
    expect(cellAt(back, parsePath(path))?.value).toEqual(first);
    expect(cellAt(back, parsePath(path))?.conflict).toBeUndefined();
  });

  it('on an Emitido relatório the first value reopens it as Em revisão, and the undo puts Emitido back', () => {
    const { state: draftState, f } = ctaState();
    const state = new Map(draftState).set(entityKey('relatorio', TEST_RELATORIO), ctaRelatorio('v5', 'emitido'));
    const one = commit(state, f, metodo, choice('falta_real'), f.newId());
    expect(one.ops[1]).toMatchObject({ path: 'relatorio/status', value: 'em_revisao' });
    const undo = invertBatch(one.ops, one.before, { newId: f.newId, now: new Date('2026-09-21T13:00:00.000Z') });
    expect(undo.map((op) => [op.path, op.value])).toEqual([
      ['relatorio/status', 'emitido'],
      [metodo, null],
    ]);
  });
});

describe('two devices on one cell or value', () => {
  it('a value put is stamped with what the device saw, like every sheet put', () => {
    const { state, f } = ctaState();
    const first = f.op({ path: metodo, value: choice('falta_real') });
    expect(stampSeen(first, state).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    const next = applyOp(state, first);
    expect(stampSeen(f.op({ path: metodo, value: choice('botao_teste'), prev_op_id: first.op_id }), next).meta).toEqual({ standing_op_id: first.op_id, seen_conflict_op_id: null });
  });

  it('two different values written concurrently are a contradiction the Conflict view names; the same value merges', () => {
    const { state, f } = ctaState();
    const eduardo = (path: string, value: JsonValue) => f.op({ path, value, device_id: 'tablet-eduardo' });
    const ana = (path: string, value: JsonValue) => f.op({ path, value, device_id: 'tablet-ana' });
    const deixado = sheetTestCellPath(CTA_BLOCK, E4, rowOf(E4, 'td_3a'), colOf(E4, 'deixado'));
    let next = state;
    const log: Op[] = [eduardo(metodo, choice('falta_real')), ana(metodo, choice('botao_teste')), eduardo(deixado, num('5', 'min')), ana(deixado, num('30', 'min')), eduardo(poloA, num('38', 'µΩ')), ana(poloA, num('38', 'µΩ'))];
    for (const op of log) next = applyOp(next, op);
    const block = blockOf(next);
    expect(block.sheet.test[E5]!.values!.metodo).toMatchObject({ value: { raw: 'botao_teste' }, conflict: { value: { raw: 'falta_real' } } });
    expect(block.sheet.test[E4]!.cells[String(rowOf(E4, 'td_3a'))]![String(colOf(E4, 'deixado'))]).toMatchObject({ value: { raw: '30' }, conflict: { value: { raw: '5' } } });
    // The same value from both: one plain cell, nothing to decide.
    expect(block.sheet.test[E1]!.cells['0']!['0']).toEqual({ value: { raw: '38', unit: 'µΩ', state: 'measured' }, source_suggestion_id: null, op_id: log[5]!.op_id });
    const decisions = openDecisions({
      relatorioId: TEST_RELATORIO,
      blocks: [block],
      locations: [ctaLocal()],
      equipment: [ctaRows().equipment],
      opOf: (opId) => {
        const op = log.find((candidate) => candidate.op_id === opId);
        return op === undefined ? undefined : { actor_id: op.actor_id, device_id: op.device_id, client_ts: op.client_ts };
      },
      createOpOf: () => undefined,
    });
    expect(decisions).toHaveLength(1);
    // A value's mark alone makes the block one that holds a conflict mark.
    const onlyValue: BlockRow = { ...block, sheet: { ...block.sheet, test: { [E5]: block.sheet.test[E5]! } } };
    expect(holdsConflictMarks(onlyValue)).toBe(true);
    expect(conflictOpIds([onlyValue])).toEqual([log[1]!.op_id, log[0]!.op_id]);
    expect(holdsConflictMarks({ ...block, sheet: { ...block.sheet, test: { [E1]: block.sheet.test[E1]! } } })).toBe(false);
    const cells = decisions[0]!.kind === 'cell' ? decisions[0]!.cells : [];
    expect(cells.map((cell) => [cell.path, cell.section, cell.label])).toEqual([
      [deixado, 'E4 · Ajustes do controlador', 'TD 3A · retransferência · Deixado'],
      [metodo, 'E5 · Transferência', 'Método'],
    ]);
  });
});

describe('replay of a log written before seed v5', () => {
  it('the Porto Seguro log (seed v1) and the small replay fixture still fold to their golden snapshots, byte for byte', () => {
    const porto = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    expect(serializeSnapshot(porto)).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(portoSeguro.golden)));
    const small = buildSnapshot(replay(replaySmall.log, { deadOpIds: replaySmall.deadOpIds }), replaySmall.relatorioId);
    expect(serializeSnapshot(small)).toBe(serializeSnapshot(relatorioSnapshotSchema.parse(replaySmall.golden)));
    // Nothing of contract 19 was parsed into a row an older log wrote.
    for (const snapshot of [porto, small]) {
      expect(snapshot.relatorio.seed_version).not.toBe('v5');
      for (const block of snapshot.blocks) {
        expect('options' in (block.config as object), block.id).toBe(false);
        for (const test of Object.values(block.sheet.test)) expect('values' in test, block.id).toBe(false);
      }
    }
  });

  it('a log with the type replays to the same rows in any array order, and twice', () => {
    const { equipment, block } = ctaRows({ polos: '4' });
    const g = opFactory();
    const ops: Op[] = [
      g.op({ kind: 'create', path: `relatorio/${TEST_RELATORIO}`, value: ctaRelatorio('v5') as unknown as JsonValue }),
      g.op({ kind: 'create', path: `location/${CTA_LOCAL}`, value: ctaLocal() as unknown as JsonValue }),
      g.op({ kind: 'create', scope: 'project', path: `equipment/${CTA_EQUIPMENT}`, value: equipment as unknown as JsonValue }),
      g.op({ kind: 'create', path: blockPath(CTA_BLOCK), value: block as unknown as JsonValue }),
      g.op({ path: poloA, value: num('38', 'µΩ') }),
      g.op({ path: metodo, value: choice('falta_real') }),
      g.op({ path: sheetTestValuePath(CTA_BLOCK, E5, 'carga'), value: choice('com_carga') }),
      g.op({ path: sheetTestCellPath(CTA_BLOCK, E4, 8, 3), value: choice('ligado') }),
    ].map((op, index) => ({ ...op, seq: index + 1 }));
    const a = replay(ops);
    const b = replay([...ops].reverse());
    expect(JSON.stringify(blockOf(a))).toBe(JSON.stringify(blockOf(b)));
    expect(JSON.stringify(blockOf(replay(ops)))).toBe(JSON.stringify(blockOf(a)));
    expect(blockOf(a).sheet.test[E5]!.values).toMatchObject({ metodo: { value: { raw: 'falta_real' } }, carga: { value: { raw: 'com_carga' } } });
  });
});
