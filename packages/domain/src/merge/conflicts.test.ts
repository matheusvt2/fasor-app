import { describe, expect, it } from 'vitest';
import { SERVER_DEVICE_ID } from '../ids.ts';
import { applyOp, entityKey, readPath, type EntityKey, type EntityState } from '../ops/apply.ts';
import { invertBatch } from '../ops/outbox.ts';
import { materializeEntity } from '../ops/materialize.ts';
import type { Op } from '../ops/op.ts';
import { emptySheet, type BlockRow, type EquipmentRow, type JsonValue } from '../schemas/entities.ts';
import { getDefinition, SEED_VERSION } from '../seed/definitions.ts';
import { syncBadgeState, syncCounts } from '../sync/counts.ts';
import { composeConclusion } from '../relatorio/conclusion.ts';
import { opFactory, TEST_COMPANY, TEST_RELATORIO } from '../test-support.ts';
import {
  applyPickOps,
  conflictOpIds,
  conflictSideView,
  conflictValueText,
  conflictViewTitle,
  decisionCount,
  decisionSplit,
  decisionText,
  decisionTotal,
  holdsConflictMarks,
  keepBothTag,
  keptBothText,
  openDecisions,
  removalColumnTitles,
  removalKeptText,
  removalRemovedText,
  syncDecisionRows,
  uniqueHeldDecisions,
  type CellDecision,
  type DecisionTextContext,
  type OpFacts,
} from './conflicts.ts';
import { mergeInfoText, pulledAdditions } from './info.ts';
import { isConcurrent } from './policy.ts';
import { clearedMarks } from './restore.ts';
import { stampSeen } from './stamp.ts';

/*
 * Stories 10.2 and 10.3: the fold's conflict marks (a contradicting cell, a block removed on
 * one device and edited on the other), the standing stamp that closes 10.1's known limits,
 * the kernel listing of open decisions with its words, and the "block added elsewhere" entry.
 */

const BLOCK = '019966b0-0012-7000-8000-000000000001';
const LOC = '019966b0-0012-7000-8000-000000000002';
const EDUARDO = '019966b0-0012-7000-8000-000000000003';
const ANA = '019966b0-0012-7000-8000-000000000004';
const EQUIPMENT = '019966b0-0012-7000-8000-000000000005';
const PROJECT = '019966b0-0012-7000-8000-000000000006';
const EQUIPMENT_2 = '019966b0-0012-7000-8000-000000000007';
const BLOCK_2 = '019966b0-0012-7000-8000-000000000008';
const E_DEVICE = 'tablet-eduardo';
const A_DEVICE = 'tablet-ana';

const definition = getDefinition(SEED_VERSION, 'cabine_primaria', 'chave_seccionadora');
const ITEM = definition.checklist![9]!.key;
const OTHER_ITEM = definition.checklist![0]!.key;
const TEST = definition.tests[0]!.key;

const blockRow = (id = BLOCK, equipmentId: string | null = EQUIPMENT): BlockRow => ({
  id,
  relatorio_id: TEST_RELATORIO,
  location_id: LOC,
  equipment_id: equipmentId,
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
const otherResult = `sheet/${BLOCK}/checklist/${OTHER_ITEM}/result`;
const reading = `sheet/${BLOCK}/test/${TEST}/cell/0/0`;
const removedAt = `block/${BLOCK}/removed_at`;
const measured = (raw: string): JsonValue => ({ raw, unit: 'MΩ', state: 'measured' });

function world() {
  const f = opFactory();
  const create = f.op({ kind: 'create', path: `block/${BLOCK}`, value: blockRow() as unknown as JsonValue, device_id: 'office' });
  const by =
    (actor: string, device: string) =>
    (path: string, value: JsonValue, prev: string | null = null, meta: Op['meta'] = null, kind: Op['kind'] = 'put') =>
      f.op({ kind, path, value, prev_op_id: prev, actor_id: actor, device_id: device, meta });
  return { f, create, eduardo: by(EDUARDO, E_DEVICE), ana: by(ANA, A_DEVICE) };
}

/** The server fold: the log in `seq` order (the order given). */
function fold(log: readonly Op[], local: readonly Op[] = []): BlockRow {
  const ordered = log.map((op, i) => ({ ...op, seq: i + 1 }));
  return materializeEntity({ entity: 'block', id: BLOCK }, ordered, local) as BlockRow;
}

describe('10.2 isConcurrent: the standing stamp', () => {
  it('a stamp that is not the cell op makes a put that chains on the head concurrent; a matching or absent stamp does not', () => {
    const { ana, eduardo } = world();
    const e = eduardo(result, 'NC');
    const a = ana(result, 'C');
    // The cell after the NC/C merge: NC stands (Eduardo's op), the head is Ana's merged-away C.
    const merged = { value: 'NC', source_suggestion_id: null, op_id: e.op_id, merge: { head_op_id: a.op_id, device_id: A_DEVICE, kept: true, rule: 'nc_over_c' as const } };
    expect(isConcurrent(ana(result, 'C', a.op_id), merged)).toBe(false);
    expect(isConcurrent(ana(result, 'C', a.op_id, { standing_op_id: e.op_id }), merged)).toBe(false);
    expect(isConcurrent(ana(result, 'C', a.op_id, { standing_op_id: a.op_id }), merged)).toBe(true);
    expect(isConcurrent(ana(result, 'C', a.op_id, { standing_op_id: null }), merged)).toBe(true);
  });
});

describe('10.2 the contradiction mark', () => {
  it('two readings: the seq-later value shows and the cell holds the other side, whichever pushes first; the device fold is the server row', () => {
    const { create, eduardo, ana } = world();
    const x = ana(reading, measured('1'));
    const e = eduardo(reading, measured('330'), x.op_id, { standing_op_id: x.op_id });
    const a = ana(reading, measured('3300'), x.op_id, { standing_op_id: x.op_id });
    const eFirst = fold([create, x, e, a]);
    expect(eFirst.sheet.test[TEST]?.cells['0']?.['0']).toEqual({
      value: measured('3300'),
      source_suggestion_id: null,
      op_id: a.op_id,
      conflict: { op_id: e.op_id, value: measured('330'), source_suggestion_id: null },
    });
    const aFirst = fold([create, x, a, e]);
    expect(aFirst.sheet.test[TEST]?.cells['0']?.['0']).toMatchObject({ value: measured('330'), op_id: e.op_id, conflict: { op_id: a.op_id, value: measured('3300') } });
    // Ana's device before her push: the pulled log (x, e) and her pending op on top.
    expect(fold([create, x, e], [a])).toEqual(eFirst);
  });

  it('C vs NA on a checklist item is a contradiction too; NC vs C on another item of the same sheet merges and is not a decision', () => {
    const { create, eduardo, ana } = world();
    const e1 = eduardo(result, 'C');
    const e2 = eduardo(otherResult, 'NC');
    const a1 = ana(result, 'NA');
    const a2 = ana(otherResult, 'C');
    const row = fold([create, e1, e2, a1, a2]);
    expect(row.sheet.checklist[ITEM]?.result?.conflict).toEqual({ op_id: e1.op_id, value: 'C', source_suggestion_id: null });
    expect(row.sheet.checklist[OTHER_ITEM]?.result).toMatchObject({ value: 'NC', op_id: e2.op_id, merge: { rule: 'nc_over_c' } });
    expect(row.sheet.checklist[OTHER_ITEM]?.result?.conflict).toBeUndefined();
    const decisions = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [row], locations: [], equipment: [], opOf: () => undefined, createOpOf: () => undefined });
    expect(decisions).toHaveLength(1);
    expect((decisions[0] as CellDecision).cells.map((cell) => cell.path)).toEqual([result]);
  });

  it('"Aplicar" is a sequential put that clears the mark and leaves the NC merge of the sheet as it is', () => {
    const { create, eduardo, ana } = world();
    const e1 = eduardo(reading, measured('330'));
    const e2 = eduardo(otherResult, 'NC');
    const a1 = ana(reading, measured('3300'));
    const a2 = ana(otherResult, 'C');
    const before = fold([create, e1, e2, a1, a2]);
    const decision = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [before], locations: [], equipment: [], opOf: () => undefined, createOpOf: () => undefined })[0] as CellDecision;
    expect(applyPickOps({ id: ANA, companyId: TEST_COMPANY }, decision, {})).toBeNull();
    const [draft] = applyPickOps({ id: ANA, companyId: TEST_COMPANY }, decision, { [reading]: 'displaced' })!;
    expect(draft).toMatchObject({ kind: 'put', path: reading, value: measured('330'), meta: null, relatorio_id: TEST_RELATORIO });
    // The device stamps prev_op_id (the latest op on the path) and standing_op_id (the cell op).
    const pick = ana(reading, measured('330'), a1.op_id, { standing_op_id: a1.op_id });
    const after = fold([create, e1, e2, a1, a2, pick]);
    expect(after.sheet.test[TEST]?.cells['0']?.['0']).toEqual({ value: measured('330'), source_suggestion_id: null, op_id: pick.op_id });
    expect(after.sheet.checklist[OTHER_ITEM]?.result).toEqual(before.sheet.checklist[OTHER_ITEM]?.result);
  });

  it('a rule merge that keeps the standing cell keeps its mark; a second contradiction replaces it with the side it displaced', () => {
    const { create, eduardo, ana, f } = world();
    const e = eduardo(reading, measured('330'));
    const a = ana(reading, measured('3300'));
    const cleared = f.op({ path: reading, value: null, prev_op_id: null, actor_id: EDUARDO, device_id: 'phone-eduardo' });
    const kept = fold([create, e, a, cleared]);
    expect(kept.sheet.test[TEST]?.cells['0']?.['0']).toMatchObject({ op_id: a.op_id, conflict: { op_id: e.op_id }, merge: { rule: 'filled_over_empty', kept: true } });
    const third = f.op({ path: reading, value: measured('33'), prev_op_id: null, actor_id: EDUARDO, device_id: 'phone-eduardo' });
    const replaced = fold([create, e, a, third]);
    expect(replaced.sheet.test[TEST]?.cells['0']?.['0']).toMatchObject({ op_id: third.op_id, conflict: { op_id: a.op_id, value: measured('3300') } });
  });

  it('a sequential rewrite by the device whose value shows, before it pulled the mark, keeps the conflict; "Aplicar" (which saw it) clears it', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(reading, measured('330'));
    const a = ana(reading, measured('3300'));
    // Ana's device had not pulled Eduardo's op: her cell showed her own value, no conflict.
    const rewrite = ana(reading, measured('3400'), a.op_id, { standing_op_id: a.op_id, seen_conflict_op_id: null });
    const kept = fold([create, e, a, rewrite]);
    expect(kept.sheet.test[TEST]?.cells['0']?.['0']).toEqual({
      value: measured('3400'),
      source_suggestion_id: null,
      op_id: rewrite.op_id,
      conflict: { op_id: e.op_id, value: measured('330'), source_suggestion_id: null },
    });
    const apply = ana(reading, measured('330'), rewrite.op_id, { standing_op_id: rewrite.op_id, seen_conflict_op_id: e.op_id });
    expect(fold([create, e, a, rewrite, apply]).sheet.test[TEST]?.cells['0']?.['0']).toEqual({ value: measured('330'), source_suggestion_id: null, op_id: apply.op_id });
    // An op without the stamp (fixtures, older logs) clears it as before.
    const unstamped = ana(reading, measured('33'), a.op_id);
    expect(fold([create, e, a, unstamped]).sheet.test[TEST]?.cells['0']?.['0']?.conflict).toBeUndefined();
  });

  it('ledger: the losing device writes C again before its pull (standing mismatch): concurrent, NC stays; after the pull a deliberate C applies', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(result, 'NC');
    const a = ana(result, 'C');
    // Ana's device still shows her C (standing a), chains on her own head (prev a).
    const again = ana(result, 'C', a.op_id, { standing_op_id: a.op_id });
    const row = fold([create, e, a, again]);
    expect(row.sheet.checklist[ITEM]?.result).toMatchObject({ value: 'NC', op_id: e.op_id, merge: { head_op_id: again.op_id, kept: true, rule: 'nc_over_c' } });
    // The undo of her merged-away C before the pull (the inverse put of the empty value): concurrent, NC stays.
    const undo = ana(result, null, a.op_id, { standing_op_id: a.op_id });
    expect(fold([create, e, a, undo]).sheet.checklist[ITEM]?.result).toMatchObject({ value: 'NC', op_id: e.op_id });
    // Having pulled NC (standing e), the deliberate C applies.
    const deliberate = ana(result, 'C', again.op_id, { standing_op_id: e.op_id });
    expect(fold([create, e, a, again, deliberate]).sheet.checklist[ITEM]?.result).toEqual({ value: 'C', source_suggestion_id: null, op_id: deliberate.op_id });
  });
});

describe('10.3 the removal conflict mark', () => {
  it('removed on one device (seen t0), edited on the other: in either push order the row is removed, the edit kept, the mark set; rows equal', () => {
    const { create, eduardo, ana } = world();
    const edit = ana(result, 'C');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const editFirst = fold([create, edit, removal]);
    const removalFirst = fold([create, removal, edit]);
    expect(editFirst).toEqual(removalFirst);
    expect(editFirst.removed_at).toBe(removal.client_ts);
    expect(editFirst.removed_by).toBe(EDUARDO);
    expect(editFirst.sheet.checklist[ITEM]?.result?.value).toBe('C');
    expect(editFirst.removal_conflict).toEqual({ removed_by: EDUARDO, removed_at: removal.client_ts, edited_by: ANA, edited_at: edit.client_ts });
    // Ana's device before her push: the pulled removal, her pending edit on top.
    expect(fold([create, removal], [edit])).toEqual(removalFirst);
  });

  it('a removal that saw the latest edit is plain; an unstamped removal (fixtures) folds as before', () => {
    const { create, eduardo, ana } = world();
    const edit = ana(result, 'C');
    const seen = eduardo(removedAt, null, null, { seen_modified_at: edit.client_ts }, 'remove');
    expect(fold([create, edit, seen]).removal_conflict).toBeUndefined();
    const unstamped = eduardo(removedAt, null, null, null, 'remove');
    expect(fold([create, edit, unstamped]).removal_conflict).toBeUndefined();
  });

  it('"Manter" (a restore) and "Remover" (a removal stamped with the current row) each clear the mark', () => {
    const { create, eduardo, ana } = world();
    const edit = ana(result, 'C');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const marked = fold([create, edit, removal]);
    const keep = ana(removedAt, null, removal.op_id, { seen_modified_at: marked.last_modified_at });
    const kept = fold([create, edit, removal, keep]);
    expect(kept.removed_at).toBeNull();
    expect(kept.removal_conflict).toBeUndefined();
    expect(kept.removed_by).toBeUndefined();
    const again = ana(removedAt, null, removal.op_id, { seen_modified_at: marked.last_modified_at }, 'remove');
    const removed = fold([create, edit, removal, again]);
    expect(removed.removed_at).toBe(again.client_ts);
    expect(removed.removed_by).toBe(ANA);
    expect(removed.removal_conflict).toBeUndefined();
  });

  it('a server op on the tombstone never marks; a photo carrying the block from a device does', () => {
    const { create, eduardo, f } = world();
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const server = f.op({ path: `block/${BLOCK}/not_tested`, value: null, actor_id: 'system:test', device_id: SERVER_DEVICE_ID });
    expect(fold([create, removal, server]).removal_conflict).toBeUndefined();
    const photoId = '019966b0-0012-7000-8000-0000000000f1';
    const photo = f.op({
      kind: 'create',
      path: `file/${photoId}`,
      actor_id: ANA,
      device_id: A_DEVICE,
      value: {
        id: photoId,
        company_id: TEST_COMPANY,
        relatorio_id: TEST_RELATORIO,
        kind: 'photo',
        sha256: 'a'.repeat(64),
        mime: 'image/jpeg',
        size: 1,
        uploaded_at: null,
        variants: null,
        removed_at: null,
        captured_at: '2026-09-21T12:00:00.000Z',
        tz_offset: -180,
        coords: null,
        local_seq: 1,
        block_id: BLOCK,
        item_key: ITEM,
        caption: null,
        reading_kind: null,
        reading_target: null,
        reading_status: 'none',
        people_in_photo: false,
      },
    });
    expect(fold([create, removal, photo]).removal_conflict).toMatchObject({ removed_by: EDUARDO, edited_by: ANA, edited_at: photo.client_ts });
  });
});

describe('stampSeen', () => {
  it('stamps the standing cell on a sheet put and the seen edit on a removed_at write; a set value wins; other ops unchanged', () => {
    const { create, ana } = world();
    const x = ana(result, 'C');
    const row = fold([create, x]);
    const state = new Map([[entityKey('block', BLOCK), row]]);
    expect(stampSeen(ana(result, 'NC', x.op_id), state).meta).toEqual({ standing_op_id: x.op_id, seen_conflict_op_id: null });
    expect(stampSeen(ana(otherResult, 'NC'), state).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    expect(stampSeen(ana(result, 'NC', x.op_id, { standing_op_id: null }), state).meta).toEqual({ standing_op_id: null, seen_conflict_op_id: null });
    // A cell holding a contradiction: the conflict the device saw is stamped too.
    const e = ana(result, 'NA');
    const marked = fold([create, x, { ...e, device_id: E_DEVICE }]);
    const markedState = new Map([[entityKey('block', BLOCK), marked]]);
    expect(stampSeen(ana(result, 'C', e.op_id), markedState).meta).toEqual({ standing_op_id: e.op_id, seen_conflict_op_id: x.op_id });
    expect(stampSeen(ana(removedAt, null, null, null, 'remove'), state).meta).toEqual({ seen_modified_at: x.client_ts });
    const order = ana(`block/${BLOCK}/order_key`, 'b0');
    expect(stampSeen(order, state)).toBe(order);
  });
});

describe('contract 16: the conclusion text, its status and its basis are one decision', () => {
  const at = (field: string) => `sheet/${BLOCK}/conclusion/${field}`;
  const TAG = 'SEC-01';
  const equipment: EquipmentRow[] = [{ id: EQUIPMENT, project_id: PROJECT, tag: TAG, type: 'chave_seccionadora', last_nameplate: null, removed_at: null }];
  const EDITED = 'Texto editado por Eduardo.';
  const author = { id: ANA, companyId: TEST_COMPANY };
  const decisionOf = (row: BlockRow) =>
    openDecisions({ relatorioId: TEST_RELATORIO, blocks: [row], locations: [], equipment, opOf: () => undefined, createOpOf: () => undefined })[0] as CellDecision;
  type Triple = { text: unknown; status: unknown; basis: unknown };
  const tripleOf = (drafts: readonly { path: string; value: unknown }[]): Triple => ({
    text: drafts.find((d) => d.path === at('text'))?.value,
    status: drafts.find((d) => d.path === at('text_status'))?.value,
    basis: drafts.find((d) => d.path === at('text_basis'))?.value,
  });

  /** Resolves `row` with `pick`: the drafts, then the fold of the stamped puts; no mark may remain. */
  function resolve(log: Op[], row: BlockRow, pick: 'standing' | 'displaced', ana: ReturnType<typeof world>['ana']) {
    const decision = decisionOf(row);
    expect(decision.cells.map((cell) => cell.label)).toEqual(['Texto da conclusão']);
    const drafts = applyPickOps(author, decision, { [at('text')]: pick })!;
    expect(drafts.map((d) => d.path)).toEqual([at('text'), at('text_status'), at('text_basis')]);
    const stamped = drafts.map((draft) => {
      const field = draft.path.split('/').at(-1) as 'text' | 'text_status' | 'text_basis';
      const cell = row.sheet.conclusion[field]!;
      return ana(draft.path, draft.value, cell.merge?.head_op_id ?? cell.op_id, { ...(draft.meta ?? {}), standing_op_id: cell.op_id, seen_conflict_op_id: cell.conflict?.op_id ?? null });
    });
    const after = fold([...log, ...stamped]);
    for (const field of ['text', 'text_status', 'text_basis'] as const) expect(after.sheet.conclusion[field]?.conflict).toBeUndefined();
    expect({ text: after.sheet.conclusion.text?.value, status: after.sheet.conclusion.text_status?.value, basis: after.sheet.conclusion.text_basis?.value }).toEqual(tripleOf(drafts));
    return { triple: tripleOf(drafts), drafts };
  }

  /** No pick leaves an edited text marked confirmed or a composed text marked edited. */
  function expectCoherent(triple: Triple, composedTexts: readonly unknown[]): void {
    if (triple.status === 'edited') expect(composedTexts).not.toContain(triple.text);
    else expect(composedTexts).toContain(triple.text);
  }

  function editAndConclude() {
    const { create, eduardo, ana, f } = world();
    const COMPOSED_A = 'A seccionadora SEC-01 apresentou o texto composto de Ana.';
    const e = [eduardo(at('text'), 'Texto composto visto por Eduardo.'), eduardo(at('text_status'), 'edited'), eduardo(at('text_basis'), 'aaaaaaaa')];
    const e2 = eduardo(at('text'), EDITED, e[0]!.op_id);
    const a = [
      f.op({ path: at('text'), value: COMPOSED_A, actor_id: ANA, device_id: A_DEVICE, meta: { composed: true } }),
      ana(at('text_status'), 'confirmed'),
      ana(at('text_basis'), 'bbbbbbbb'),
    ];
    return { create, ana, e: [...e, e2], a, COMPOSED_A };
  }

  it('edit first, then the conclude: one row; Ana keeps her confirmed composed text, Eduardo his edited one, each with its own status and basis', () => {
    const { create, ana, e, a, COMPOSED_A } = editAndConclude();
    const log = [create, ...e, ...a];
    const row = fold(log);
    expect(row.sheet.conclusion.text?.conflict?.value).toBe(EDITED);
    const standing = resolve(log, row, 'standing', ana).triple;
    expect(standing).toEqual({ text: COMPOSED_A, status: 'confirmed', basis: 'bbbbbbbb' });
    const displaced = resolve(log, row, 'displaced', ana);
    expect(displaced.triple).toEqual({ text: EDITED, status: 'edited', basis: 'aaaaaaaa' });
    for (const triple of [standing, displaced.triple]) expectCoherent(triple, [COMPOSED_A]);
    // Only the confirmed side's text put is flagged composed.
    expect(resolve(log, row, 'standing', ana).drafts[0]!.meta).toEqual({ composed: true });
    expect(displaced.drafts[0]!.meta).toBeNull();
  });

  it('the conclude first, then the edit: the edited text stood as latest text; the confirmed side is the text the app composes now, with its basis', () => {
    const { create, ana, e, a } = editAndConclude();
    const log = [create, ...a, ...e];
    const row = fold(log);
    expect(row.sheet.conclusion.text?.value).toBe(EDITED);
    expect(row.sheet.conclusion.text?.conflict).toBeUndefined();
    expect(row.sheet.conclusion.text_status?.conflict?.value).toBe('confirmed');
    const now = composeConclusion(row, definition, TAG);
    const standing = resolve(log, row, 'standing', ana).triple;
    expect(standing).toEqual({ text: EDITED, status: 'edited', basis: 'aaaaaaaa' });
    const displaced = resolve(log, row, 'displaced', ana).triple;
    expect(displaced).toEqual({ text: now.text, status: 'confirmed', basis: now.basis });
    for (const triple of [standing, displaced]) expectCoherent(triple, [now.text]);
  });

  it('two edits with only a basis conflict: one row, both sides edited', () => {
    const { create, eduardo, ana } = world();
    const log = [
      create,
      eduardo(at('text'), 'Texto de Eduardo.'),
      eduardo(at('text_status'), 'edited'),
      eduardo(at('text_basis'), 'aaaaaaaa'),
      ana(at('text'), 'Texto de Ana.'),
      ana(at('text_status'), 'edited'),
      ana(at('text_basis'), 'bbbbbbbb'),
    ];
    const row = fold(log);
    expect(row.sheet.conclusion.text?.conflict).toBeUndefined();
    expect(row.sheet.conclusion.text_basis?.conflict?.value).toBe('aaaaaaaa');
    expect(resolve(log, row, 'standing', ana).triple).toEqual({ text: 'Texto de Ana.', status: 'edited', basis: 'bbbbbbbb' });
    expect(resolve(log, row, 'displaced', ana).triple).toEqual({ text: 'Texto de Ana.', status: 'edited', basis: 'aaaaaaaa' });
  });

  it('two confirms with only a basis conflict: one row, both sides confirmed with a composed text', () => {
    const { create, eduardo, ana, f } = world();
    const composed = (actor: string, device: string, value: string) => f.op({ path: at('text'), value, actor_id: actor, device_id: device, meta: { composed: true } });
    const log = [
      create,
      composed(EDUARDO, E_DEVICE, 'Texto composto de Eduardo.'),
      eduardo(at('text_status'), 'confirmed'),
      eduardo(at('text_basis'), 'aaaaaaaa'),
      composed(ANA, A_DEVICE, 'Texto composto de Ana.'),
      ana(at('text_status'), 'confirmed'),
      ana(at('text_basis'), 'bbbbbbbb'),
    ];
    const row = fold(log);
    expect(row.sheet.conclusion.text?.conflict).toBeUndefined();
    const now = composeConclusion(row, definition, TAG);
    const standing = resolve(log, row, 'standing', ana).triple;
    const displaced = resolve(log, row, 'displaced', ana).triple;
    expect(standing).toEqual({ text: 'Texto composto de Ana.', status: 'confirmed', basis: 'bbbbbbbb' });
    expect(displaced).toEqual({ text: now.text, status: 'confirmed', basis: now.basis });
    for (const triple of [standing, displaced]) expectCoherent(triple, ['Texto composto de Ana.', now.text]);
  });

  it('each side of the row says its status in the view', () => {
    const { create, e, a } = editAndConclude();
    const decision = decisionOf(fold([create, ...e, ...a]));
    const cell = decision.cells[0]!;
    const context = { blocks: [], equipment, locations: [], users: [], viewerActorId: ANA, viewerDeviceId: A_DEVICE };
    expect(conflictSideView(cell, cell.standing, context).meta).toContain('Confirmado');
    expect(conflictSideView(cell, cell.displaced, context).meta).toContain('Editado');
  });
});

describe('conflictValueText: the conclusion words', () => {
  it('words the pair and the conclusion text status (r8conc-consistency-2); the text itself stays as written', () => {
    const at = (field: string) => ({ path: `sheet/019966b0-0012-7000-8000-000000000001/conclusion/${field}` });
    expect(conflictValueText(at('result'), 'aprovado')).toBe('Aprovado');
    expect(conflictValueText(at('text_status'), 'confirmed')).toBe('Confirmado');
    expect(conflictValueText(at('text_status'), 'edited')).toBe('Editado');
    expect(conflictValueText(at('text'), 'Texto editado.')).toBe('Texto editado.');
  });
});

describe('openDecisions and its words', () => {
  const users = [
    { id: EDUARDO, name: 'Eduardo Esteves' },
    { id: ANA, name: 'Ana Alves' },
  ];
  const equipmentRow = (id: string, tag: string): EquipmentRow => ({ id, project_id: PROJECT, tag, type: 'chave_seccionadora', last_nameplate: null, removed_at: null });
  const context = (blocks: BlockRow[], equipment: EquipmentRow[]): DecisionTextContext => ({
    blocks,
    equipment,
    locations: [{ id: LOC, name: 'Coluna 12' }],
    users,
    viewerActorId: ANA,
    viewerDeviceId: A_DEVICE,
  });

  it('lists cells, then removals, then TAGs; counts one per cell; words each case', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(reading, measured('330'));
    const a = ana(reading, measured('3300'), null, { source_suggestion_id: '019966b0-0012-7000-8000-0000000000aa' });
    const edit = ana(result, 'C');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const conflicted = fold([create, e, a]);
    const removed = fold([create, edit, removal]);
    const equipment = [equipmentRow(EQUIPMENT, 'SEC-C12')];
    const facts = new Map<string, OpFacts>([
      [e.op_id, { actor_id: EDUARDO, device_id: E_DEVICE, client_ts: e.client_ts, seq: 2 }],
      [a.op_id, { actor_id: ANA, device_id: A_DEVICE, client_ts: a.client_ts, seq: 3 }],
    ]);
    expect(conflictOpIds([conflicted]).sort()).toEqual([a.op_id, e.op_id].sort());
    expect(holdsConflictMarks(conflicted)).toBe(true);
    expect(holdsConflictMarks(removed)).toBe(true);
    expect(holdsConflictMarks(blockRow())).toBe(false);

    const cellOnly = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [conflicted], locations: [], equipment, opOf: (id) => facts.get(id), createOpOf: () => undefined });
    const decision = cellOnly[0] as CellDecision;
    expect(decisionCount(cellOnly)).toBe(1);
    const words = context([conflicted], equipment);
    expect(decisionText(decision, words)).toBe('SEC-C12: 1 célula em contradição');
    expect(conflictViewTitle(BLOCK, words)).toBe('SEC-C12 · Chave seccionadora · Coluna 12');
    const cell = decision.cells[0]!;
    expect(cell.standing).toMatchObject({ op_id: a.op_id, actor_id: ANA, device_id: A_DEVICE });
    expect(conflictSideView(cell, cell.standing, words)).toMatchObject({ who: 'A minha', initial: 'A', value: '3.300 MΩ' });
    expect(conflictSideView(cell, cell.standing, words).meta).toMatch(/^Ler visor · \d\d\/\d\d \d\d:\d\d · este aparelho$/);
    expect(conflictSideView(cell, cell.displaced, words)).toMatchObject({ who: 'A de Eduardo', initial: 'E', value: '330 MΩ' });
    expect(conflictSideView(cell, cell.displaced, words).meta).toMatch(/^Digitado · \d\d\/\d\d \d\d:\d\d$/);

    const removalOnly = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [removed], locations: [], equipment, opOf: () => undefined, createOpOf: () => undefined });
    expect(removalOnly).toEqual([
      { kind: 'block_removal', relatorio_id: TEST_RELATORIO, block_id: BLOCK, equipment_id: EQUIPMENT, removed_by: EDUARDO, removed_at: removal.client_ts, edited_by: ANA, edited_at: edit.client_ts },
    ]);
    const removalDecision = removalOnly[0]!;
    if (removalDecision.kind !== 'block_removal') throw new Error('expected a removal');
    const removedWords = context([removed], equipment);
    expect(decisionText(removalDecision, removedWords)).toBe('SEC-C12: removido por Eduardo, alterado por você');
    expect(removalColumnTitles(removalDecision, removedWords).removed).toMatch(/^Removido por Eduardo · \d\d\/\d\d \d\d:\d\d$/);
    expect(removalColumnTitles(removalDecision, removedWords).edited).toMatch(/^Alterado por você · /);
    expect(removalKeptText(removalDecision, { ...removedWords, viewerActorId: EDUARDO })).toBe('SEC-C12 mantido na Coluna 12 com as alterações de Ana');
    expect(removalRemovedText(removalDecision, { ...removedWords, viewerActorId: EDUARDO })).toBe('SEC-C12 removido — a edição de Ana fica recuperável');
  });

  it('a removed block\'s contradicting cells are no decision (its removal decision comes first)', () => {
    const { create, eduardo, ana } = world();
    const e = eduardo(result, 'C');
    const a = ana(result, 'NA');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const row = fold([create, e, a, removal]);
    expect(row.sheet.checklist[ITEM]?.result?.conflict).toBeDefined();
    const decisions = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [row], locations: [], equipment: [], opOf: () => undefined, createOpOf: () => undefined });
    expect(decisions.map((decision) => decision.kind)).toEqual(['block_removal']);
  });

  it('a duplicate TAG held by two relatórios of one project is counted and listed once', () => {
    const tag = { kind: 'duplicate_tag' as const, relatorio_id: TEST_RELATORIO, tag: 'SEC-C09', earlier_equipment_id: EQUIPMENT, later_equipment_id: EQUIPMENT_2, later_block_id: null, earlier: { actor_id: ANA, device_id: A_DEVICE, client_ts: '2026-09-21T11:40:00.000Z' }, later: { actor_id: EDUARDO, device_id: E_DEVICE, client_ts: '2026-09-21T11:55:00.000Z' } };
    const cell: CellDecision = { kind: 'cell', relatorio_id: TEST_RELATORIO, block_id: BLOCK, cells: [] };
    const entries = [
      { projectId: PROJECT, relatorioId: 'r1', decisions: [tag] },
      { projectId: PROJECT, relatorioId: 'r2', decisions: [cell, { ...tag, relatorio_id: 'r2' }] },
      { projectId: 'another-project', relatorioId: 'r3', decisions: [tag] },
    ];
    expect(uniqueHeldDecisions(entries).map((entry) => entry.decisions.length)).toEqual([1, 1, 1]);
    expect(uniqueHeldDecisions(entries)[1]!.relatorioId).toBe('r2');
    expect(decisionTotal(entries)).toBe(2);
  });

  it('a TAG created on two devices is a decision (later = higher seq, an unpushed create is later); on one device it is not', () => {
    const blocks = [blockRow(BLOCK, EQUIPMENT), blockRow(BLOCK_2, EQUIPMENT_2)];
    const equipment = [equipmentRow(EQUIPMENT, 'SEC-C09'), equipmentRow(EQUIPMENT_2, 'sec-c09 ')];
    const creates = (first: OpFacts, second: OpFacts) => (key: EntityKey) =>
      key === entityKey('equipment', EQUIPMENT) ? first : key === entityKey('equipment', EQUIPMENT_2) ? second : undefined;
    const pushedE = { actor_id: EDUARDO, device_id: E_DEVICE, client_ts: '2026-09-21T11:55:00.000Z', seq: 9 };
    const pushedA = { actor_id: ANA, device_id: A_DEVICE, client_ts: '2026-09-21T11:40:00.000Z', seq: 4 };
    const [decision] = openDecisions({ relatorioId: TEST_RELATORIO, blocks, locations: [], equipment, opOf: () => undefined, createOpOf: creates(pushedE, pushedA) });
    expect(decision).toMatchObject({ kind: 'duplicate_tag', tag: 'sec-c09', earlier_equipment_id: EQUIPMENT_2, later_equipment_id: EQUIPMENT, later_block_id: BLOCK });
    const unpushedA = { actor_id: ANA, device_id: A_DEVICE, client_ts: '2026-09-21T11:40:00.000Z' };
    const [unpushed] = openDecisions({ relatorioId: TEST_RELATORIO, blocks, locations: [], equipment, opOf: () => undefined, createOpOf: creates(pushedE, unpushedA) });
    expect(unpushed).toMatchObject({ earlier_equipment_id: EQUIPMENT, later_equipment_id: EQUIPMENT_2 });
    const sameDevice = { ...pushedE, seq: 10 };
    expect(openDecisions({ relatorioId: TEST_RELATORIO, blocks, locations: [], equipment, opOf: () => undefined, createOpOf: creates(pushedE, sameDevice) })).toEqual([]);

    const words = context(blocks, [equipmentRow(EQUIPMENT, 'SEC-C09'), equipmentRow(EQUIPMENT_2, 'SEC-C09')]);
    const [named] = openDecisions({ relatorioId: TEST_RELATORIO, blocks, locations: [], equipment: [equipmentRow(EQUIPMENT, 'SEC-C09'), equipmentRow(EQUIPMENT_2, 'SEC-C09')], opOf: () => undefined, createOpOf: creates(pushedA, pushedE) });
    if (named?.kind !== 'duplicate_tag') throw new Error('expected a TAG decision');
    expect(decisionText(named, words)).toBe('SEC-C09 foi criada em dois aparelhos');
    const taken = [equipmentRow(EQUIPMENT, 'SEC-C09'), equipmentRow(EQUIPMENT_2, 'SEC-C09'), equipmentRow('019966b0-0012-7000-8000-0000000000e1', 'SEC-C09-2')];
    expect(keepBothTag(named, words.equipment.map((row) => ({ ...row, removed_at: null })))).toBe('SEC-C09-2');
    expect(keepBothTag(named, taken)).toBe('SEC-C09-3');
    expect(keptBothText(named, 'SEC-C09-2', words)).toBe('A ficha de Eduardo passou a SEC-C09-2');
    expect(decisionCount([named])).toBe(1);
  });
});

describe('10.3 a block added elsewhere', () => {
  it('is one information entry of another device\'s pulled create, worded "Eduardo adicionou TP-C09 em Coluna 9"', () => {
    const { eduardo, ana } = world();
    const created = { ...eduardo(`block/${BLOCK}`, blockRow() as unknown as JsonValue, null, null, 'create'), seq: 12 };
    const mine = { ...ana(`block/${BLOCK_2}`, blockRow(BLOCK_2) as unknown as JsonValue, null, null, 'create'), seq: 13 };
    const entries = pulledAdditions([], [created, mine], A_DEVICE);
    expect(entries).toEqual([
      expect.objectContaining({ op_id: created.op_id, over_op_id: null, block_id: BLOCK, rule: 'block_added', relatorio_id: TEST_RELATORIO }),
    ]);
    expect(pulledAdditions([created], [created], A_DEVICE)).toEqual([]);
    const text = mergeInfoText(entries[0]!, {
      blocks: [blockRow()],
      equipment: [{ id: EQUIPMENT, tag: 'TP-C09' }],
      users: [{ id: EDUARDO, name: 'Eduardo Esteves' }],
      files: [],
      locations: [{ id: LOC, name: 'Coluna 9' }],
    });
    expect(text).toBe('Eduardo adicionou TP-C09 em Coluna 9');
    expect(syncCounts([], {}, entries).merged).toBe(1);
  });
});

describe('10.2 the badge and the Decisões rows (the X/S seam)', () => {
  it('reads conflict first while any decision waits (the count is decisionTotal)', () => {
    const counts = syncCounts([{ path: result, status: 'dead' }]);
    expect(syncBadgeState(counts, { online: false, conflicts: 2 })).toBe('conflict');
    expect(syncBadgeState(counts, { online: true })).toBe('error');
  });

  it('maps the held decisions to one SyncDecisionRow each, a duplicate TAG once, worded by decisionText', () => {
    const { create, eduardo, ana } = world();
    const conflicted = fold([create, eduardo(result, 'C'), ana(result, 'NA'), eduardo(reading, measured('1')), ana(reading, measured('2'))]);
    const equipment: EquipmentRow[] = [{ id: EQUIPMENT, project_id: PROJECT, tag: 'SEC-C12', type: 'chave_seccionadora', last_nameplate: null, removed_at: null }];
    const cells = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [conflicted], locations: [], equipment, opOf: () => undefined, createOpOf: () => undefined });
    const tag = { kind: 'duplicate_tag' as const, relatorio_id: TEST_RELATORIO, tag: 'SEC-C09', earlier_equipment_id: EQUIPMENT, later_equipment_id: EQUIPMENT_2, later_block_id: null, earlier: { actor_id: ANA, device_id: A_DEVICE, client_ts: '2026-09-21T11:40:00.000Z' }, later: { actor_id: EDUARDO, device_id: E_DEVICE, client_ts: '2026-09-21T11:55:00.000Z' } };
    const entries = [
      { relatorioId: 'r1', projectId: PROJECT, decisions: [...cells, tag], blocks: [conflicted], equipment, locations: [] },
      { relatorioId: 'r2', projectId: PROJECT, decisions: [{ ...tag, relatorio_id: 'r2' }], blocks: [], equipment, locations: [] },
    ];
    const rows = syncDecisionRows(entries, { users: [], viewerActorId: ANA, viewerDeviceId: A_DEVICE });
    expect(rows).toEqual([
      { key: `r1:cell:${BLOCK}`, kind: 'cell', text: 'SEC-C12: 2 células em contradição' },
      { key: `r1:tag:${EQUIPMENT}:${EQUIPMENT_2}`, kind: 'duplicate_tag', text: 'SEC-C09 foi criada em dois aparelhos' },
    ]);
    // Two cells and one TAG: the badge count 3; E10-Q4 words them apart.
    expect(decisionTotal(entries)).toBe(3);
    expect(decisionSplit(entries)).toEqual({ contradictions: 2, decisions: 1 });
  });
});

describe('E10-Q2 the undo of a resolution brings the decision back (contract 13)', () => {
  const key = entityKey('block', BLOCK);
  const facts = (log: readonly Op[]) => (id: string): OpFacts | undefined => {
    const op = log.find((row) => row.op_id === id);
    return op === undefined ? undefined : { actor_id: op.actor_id, device_id: op.device_id, client_ts: op.client_ts };
  };

  /** "Desfazer" on the device: the kernel inverse with the value and marks the op replaced, stamped from the rows after it. */
  function undoOf(f: ReturnType<typeof world>['f'], log: readonly Op[], op: Op): Op {
    const state: EntityState = new Map([[key, fold(log)]]);
    const next = applyOp(state, op);
    const marks = clearedMarks(state, op, next);
    const [inverse] = invertBatch(
      [op],
      new Map([[op.op_id, readPath(state, op)]]),
      { newId: f.newId, now: new Date('2026-09-21T15:00:00.000Z') },
      marks === undefined ? new Map() : new Map([[op.op_id, marks]]),
    );
    return stampSeen(inverse!, next);
  }

  it('clearedMarks names the conflict an "Aplicar" clears, and nothing for a plain write', () => {
    const { create, eduardo, ana } = world();
    const a = ana(reading, measured('3300'));
    const e = eduardo(reading, measured('330'));
    const marked = new Map([[key, fold([create, a, e])]]) as EntityState;
    const pick = ana(reading, measured('3300'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: a.op_id });
    expect(clearedMarks(marked, pick)).toEqual({ conflict: { op_id: a.op_id, value: measured('3300'), source_suggestion_id: null }, shown_op_id: e.op_id });
    // A rewrite that did not see the mark keeps it: nothing cleared.
    expect(clearedMarks(marked, ana(reading, measured('1'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: null }))).toBeUndefined();
    expect(clearedMarks(marked, ana(result, 'C'))).toBeUndefined();
  });

  it('"Aplicar" then "Desfazer": the value, the conflict and the displayed side\'s author come back; device and server fold alike; "Aplicar" again clears it', () => {
    const { create, eduardo, ana, f } = world();
    const a = ana(reading, measured('3300'));
    const e = eduardo(reading, measured('330'));
    const before = fold([create, a, e]);
    const pick = ana(reading, measured('3300'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: a.op_id });
    expect(fold([create, a, e, pick]).sheet.test[TEST]?.cells['0']?.['0']?.conflict).toBeUndefined();
    const undo = undoOf(f, [create, a, e], pick);
    expect(undo.meta?.restore).toEqual({ conflict: { op_id: a.op_id, value: measured('3300'), source_suggestion_id: null }, shown_op_id: e.op_id });
    const log = [create, a, e, pick, undo];
    const row = fold(log);
    expect(row.sheet.test[TEST]?.cells['0']?.['0']).toEqual({
      value: measured('330'),
      source_suggestion_id: null,
      op_id: undo.op_id,
      shown_op_id: e.op_id,
      conflict: { op_id: a.op_id, value: measured('3300'), source_suggestion_id: null },
    });
    expect(fold([create, a, e, pick], [undo])).toEqual(row);
    expect(holdsConflictMarks(row)).toBe(true);
    expect(conflictOpIds([row]).sort()).toEqual([a.op_id, e.op_id].sort());

    // The Conflict view names each side's original author, as before "Aplicar".
    const [decision] = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [row], locations: [], equipment: [], opOf: facts(log), createOpOf: () => undefined }) as CellDecision[];
    const [beforeDecision] = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [before], locations: [], equipment: [], opOf: facts(log), createOpOf: () => undefined }) as CellDecision[];
    expect(decision!.cells[0]!.standing).toEqual(beforeDecision!.cells[0]!.standing);
    expect(decision!.cells[0]!.displaced).toEqual(beforeDecision!.cells[0]!.displaced);
    expect(decision!.cells[0]!.standing.actor_id).toBe(EDUARDO);

    // "Aplicar" again (stamped from the restored row) clears it; its own undo would restore the same side.
    const again = stampSeen(ana(reading, measured('3300'), undo.op_id), new Map([[key, row]]));
    expect(clearedMarks(new Map([[key, row]]), again)).toEqual({ conflict: row.sheet.test[TEST]!.cells['0']!['0']!.conflict, shown_op_id: e.op_id });
    expect(fold([...log, again]).sheet.test[TEST]?.cells['0']?.['0']).toEqual({ value: measured('3300'), source_suggestion_id: null, op_id: again.op_id });
  });

  it('a restored cell (`shown_op_id`) then a contradicting write from a third device: the displaced side is the shown op, named by its author', () => {
    const { create, eduardo, ana, f } = world();
    const a = ana(reading, measured('3300'));
    const e = eduardo(reading, measured('330'));
    const pick = ana(reading, measured('3300'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: a.op_id });
    const undo = undoOf(f, [create, a, e], pick);
    const third = f.op({ path: reading, value: measured('33'), prev_op_id: null, actor_id: ANA, device_id: 'phone-ana', meta: { standing_op_id: null, seen_conflict_op_id: null } });
    const log = [create, a, e, pick, undo, third];
    const row = fold(log);
    const cell = row.sheet.test[TEST]?.cells['0']?.['0'];
    expect(cell).toMatchObject({ value: measured('33'), op_id: third.op_id, conflict: { op_id: e.op_id, value: measured('330') } });
    expect(cell?.shown_op_id).toBeUndefined();
    const [decision] = openDecisions({ relatorioId: TEST_RELATORIO, blocks: [row], locations: [], equipment: [], opOf: facts(log), createOpOf: () => undefined }) as CellDecision[];
    expect(decision!.cells[0]!.displaced).toMatchObject({ op_id: e.op_id, actor_id: EDUARDO, device_id: E_DEVICE });
    expect(decision!.cells[0]!.standing).toMatchObject({ op_id: third.op_id, actor_id: ANA, device_id: 'phone-ana' });
  });

  it('a restored cell then a rule merge that keeps it (filled over empty): `shown_op_id` and the conflict stay', () => {
    const { create, eduardo, ana, f } = world();
    const a = ana(reading, measured('3300'));
    const e = eduardo(reading, measured('330'));
    const pick = ana(reading, measured('3300'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: a.op_id });
    const undo = undoOf(f, [create, a, e], pick);
    const cleared = f.op({ path: reading, value: null, prev_op_id: null, actor_id: EDUARDO, device_id: 'phone-eduardo', meta: { standing_op_id: null, seen_conflict_op_id: null } });
    const cell = fold([create, a, e, pick, undo, cleared]).sheet.test[TEST]?.cells['0']?.['0'];
    expect(cell).toMatchObject({
      value: measured('330'),
      op_id: undo.op_id,
      shown_op_id: e.op_id,
      conflict: { op_id: a.op_id, value: measured('3300') },
      merge: { head_op_id: cleared.op_id, kept: true, rule: 'filled_over_empty' },
    });
  });

  it('an undo that lands after another device wrote the cell is concurrent: it merges as any write and restores nothing', () => {
    const { create, eduardo, ana, f } = world();
    const a = ana(reading, measured('3300'));
    const e = eduardo(reading, measured('330'));
    const pick = ana(reading, measured('3300'), e.op_id, { standing_op_id: e.op_id, seen_conflict_op_id: a.op_id });
    const undo = undoOf(f, [create, a, e], pick);
    const between = eduardo(reading, measured('331'), pick.op_id, { standing_op_id: pick.op_id, seen_conflict_op_id: null });
    const cell = fold([create, a, e, pick, between, undo]).sheet.test[TEST]?.cells['0']?.['0'];
    expect(cell).toMatchObject({ value: measured('330'), op_id: undo.op_id, conflict: { op_id: between.op_id, value: measured('331') } });
    expect(cell?.shown_op_id).toBeUndefined();
  });

  it('"Manter" or "Remover", then "Desfazer": removed_at, removed_by and removal_conflict as before the decision; device and server alike', () => {
    const { create, eduardo, ana, f } = world();
    const edit = ana(result, 'C');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const marked = fold([create, edit, removal]);
    expect(marked.removal_conflict).toBeDefined();
    const keep = ana(removedAt, null, removal.op_id, { seen_modified_at: marked.last_modified_at });
    const again = ana(removedAt, null, removal.op_id, { seen_modified_at: marked.last_modified_at }, 'remove');
    for (const decision of [keep, again]) {
      const undo = undoOf(f, [create, edit, removal], decision);
      expect(undo.meta?.restore).toEqual({ removed_by: EDUARDO, removal_conflict: marked.removal_conflict });
      const row = fold([create, edit, removal, decision, undo]);
      expect(row.removed_at).toBe(removal.client_ts);
      expect(row.removed_by).toBe(EDUARDO);
      expect(row.removal_conflict).toEqual(marked.removal_conflict);
      expect(holdsConflictMarks(row)).toBe(true);
      expect(fold([create, edit, removal, decision], [undo])).toEqual(row);
    }
  });

  it('the undo of "Manter" after an edit it did not see marks as a fresh removal would, not with the old mark', () => {
    const { create, eduardo, ana, f } = world();
    const edit = ana(result, 'C');
    const removal = eduardo(removedAt, null, null, { seen_modified_at: null }, 'remove');
    const marked = fold([create, edit, removal]);
    const keep = ana(removedAt, null, removal.op_id, { seen_modified_at: marked.last_modified_at });
    const undo = undoOf(f, [create, edit, removal], keep);
    const later = eduardo(otherResult, 'NC', null, { standing_op_id: null, seen_conflict_op_id: null });
    const row = fold([create, edit, removal, keep, later, undo]);
    expect(row.removed_by).toBe(ANA);
    expect(row.removal_conflict).toEqual({ removed_by: ANA, removed_at: removal.client_ts, edited_by: EDUARDO, edited_at: later.client_ts });
  });
});
