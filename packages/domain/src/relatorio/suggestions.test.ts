import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { opSchema } from '../ops/op.ts';
import { suggestionPath } from '../ops/path.ts';
import { emptySheet, suggestionRowSchema, type BlockRow, type Cell, type EntityRow, type SuggestionRow } from '../schemas/entities.ts';
import type { FieldDef } from '../seed/schema.ts';
import { TEST_COMPANY, TEST_RELATORIO, TEST_USER, opFactory } from '../test-support.ts';
import { portoSeguro } from '../../fixtures/porto-seguro/op-log.ts';
import { replay } from '../ops/replay.ts';
import { buildSnapshot } from '../schemas/snapshot.ts';
import { firstSheetWithPendingSuggestions, sheetOrder } from './ficha.ts';
import { cabineSheetsProgress, locationProgress, progress } from './progress.ts';
import {
  blocksWithPendingSuggestions,
  compareSuggestion,
  confirmAllCandidates,
  confirmarTodosText,
  confirmedAllToastText,
  confirmedFieldToastText,
  confirmSuggestionOps,
  discardSuggestionOp,
  fichasComSugestoesText,
  fieldInputText,
  livePendingSuggestions,
  nameplateSuggestions,
  parseFieldInput,
  pendingByNameplateField,
  pendingSuggestions,
  replaceLineText,
  showsConfirmedGlyph,
  suggestionAnnouncement,
  suggestionBlockId,
  suggestionFieldDef,
  suggestionGroupCounts,
  suggestionGroupNoteText,
  suggestionRowsOf,
  suggestionValueText,
  suggestionView,
} from './suggestions.ts';

/*
 * 8.1-UNIT: the Suggestion rules of the kernel -- the I/O matrix of the story (fill,
 * verify, replace, auto-confirm, typing, confirmed, several on one target) and every kind
 * of compare and parse.
 */

const BLOCK = '019966b0-0081-7000-8000-000000000001';
const OTHER_BLOCK = '019966b0-0081-7000-8000-000000000002';
const LOC = '019966b0-0081-7000-8000-000000000003';
const PHOTO = '019966b0-0081-7000-8000-000000000004';
const RUN = '019966b0-0081-7000-8000-000000000005';
const OP = '019966b0-0081-7000-8000-000000000006';
const AUTHOR = { id: TEST_USER, companyId: TEST_COMPANY };

let seq = 0x100;
const sid = () => `019966b0-0081-7000-8000-${(++seq).toString(16).padStart(12, '0')}`;

function suggestion(field: string, value: unknown, extra: Partial<SuggestionRow> = {}): SuggestionRow {
  return suggestionRowSchema.parse({
    id: sid(),
    relatorio_id: TEST_RELATORIO,
    target_path: `sheet/${BLOCK}/nameplate/${field}`,
    value,
    trust: 'suggested',
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0.1, 0.2, 0.3, 0.4], ocr_token_ids: ['t0'], reading_run_id: RUN },
    status: 'pending',
    prompt_version: 'test-1',
    ...extra,
  });
}

const cell = (value: unknown, source: string | null = null): Cell => ({ value: value as Cell['value'], source_suggestion_id: source, op_id: OP });

function chave(nameplate: Record<string, Cell> = {}, id = BLOCK): BlockRow {
  return {
    id,
    relatorio_id: TEST_RELATORIO,
    location_id: LOC,
    equipment_id: null,
    block_type: 'chave_seccionadora',
    config: {},
    seed_version: 'v1',
    order_key: 'a0',
    feeds_block_id: null,
    not_tested: null,
    concluded_by: null,
    sheet: { ...emptySheet(), nameplate },
    created_by: null,
    first_edited_at: null,
    last_modified_by: null,
    last_modified_at: null,
    removed_at: null,
  };
}

const def = (kind: FieldDef['kind'], extra: Partial<FieldDef> = {}): FieldDef => ({ key: 'x', label: 'X', kind, ...extra }) as FieldDef;

describe('8.1-UNIT the suggestion row and its ops', () => {
  it('parses a row written before contract 5 with hint null, and one carrying the create hint', () => {
    const old: Partial<SuggestionRow> = { ...suggestion('fabricacao', 'Schneider') };
    delete old.hint;
    expect(suggestionRowSchema.parse(old).hint).toBeNull();
    const hinted = suggestion('fabricacao', 'Celtta', { hint: { create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } } });
    expect(hinted.hint).toEqual({ create_registry_entry: { kind: 'manufacturer', name: 'Celtta' } });
    expect(suggestionRowSchema.safeParse({ ...old, hint: { create_registry_entry: { kind: 'voltage_class', name: '15' } } }).success).toBe(false);
  });

  it('builds the suggestion create path, and a server create then a status put reduce through applyOp', () => {
    const row = suggestion('fabricacao', 'Schneider');
    expect(suggestionPath(row.id)).toBe(`suggestion/${row.id}`);
    const f = opFactory();
    const create = f.op({ kind: 'create', path: suggestionPath(row.id), value: row });
    const key = entityKey('suggestion', row.id);
    let state: EntityState = applyOp(new Map(), create);
    expect(state.get(key)).toEqual(row);
    const [status] = confirmSuggestionOps(AUTHOR, row);
    state = applyOp(state, f.op({ path: status!.path, value: status!.value }));
    expect((state.get(key) as SuggestionRow).status).toBe('confirmed');
  });

  it('Confirmar is the status put then the target put carrying source_suggestion_id; auto marks both', () => {
    const row = suggestion('tensao_de_placa', '15');
    const [status, value] = confirmSuggestionOps(AUTHOR, row);
    expect(status).toMatchObject({ kind: 'put', path: `suggestion/${row.id}/status`, value: 'confirmed', meta: null, relatorio_id: TEST_RELATORIO, actor_id: TEST_USER });
    expect(value).toMatchObject({ kind: 'put', path: row.target_path, value: '15', meta: { source_suggestion_id: row.id } });
    expect(value!.meta).not.toHaveProperty('auto');
    const auto = confirmSuggestionOps(AUTHOR, row, { auto: true });
    expect(auto[0]!.meta).toEqual({ auto: true });
    expect(auto[1]!.meta).toEqual({ source_suggestion_id: row.id, auto: true });
    // The auto path writes the engineer's own value back, never the reading's spelling.
    expect(confirmSuggestionOps(AUTHOR, row, { auto: true, value: '15 kV' })[1]!.value).toBe('15 kV');
    // Each draft is a valid op once stamped.
    for (const draft of [...auto, discardSuggestionOp(AUTHOR, row)]) {
      expect(opSchema.safeParse({ ...draft, op_id: sid(), device_id: 'd', client_ts: '2026-09-26T10:00:00.000Z' }).success).toBe(true);
    }
    expect(discardSuggestionOp(AUTHOR, row)).toMatchObject({ path: `suggestion/${row.id}/status`, value: 'discarded', meta: null });
  });

  it('a confirm batch applied on the block sets the cell provenance, and a later plain put nulls it', () => {
    const row = suggestion('fabricacao', 'Schneider');
    const f = opFactory();
    const key = entityKey('block', BLOCK);
    let state: EntityState = new Map<ReturnType<typeof entityKey>, EntityRow>([[key, chave()]]);
    const [, put] = confirmSuggestionOps(AUTHOR, row);
    state = applyOp(state, f.op({ path: put!.path, value: put!.value, meta: put!.meta }));
    const confirmed = (state.get(key) as BlockRow).sheet.nameplate.fabricacao!;
    expect(confirmed.source_suggestion_id).toBe(row.id);
    expect(showsConfirmedGlyph(confirmed, 'em_campo')).toBe(true);
    expect(showsConfirmedGlyph(confirmed, 'em_revisao')).toBe(true);
    expect(showsConfirmedGlyph(confirmed, 'emitido')).toBe(false);
    state = applyOp(state, f.op({ path: put!.path, value: 'ABB' }));
    expect(showsConfirmedGlyph((state.get(key) as BlockRow).sheet.nameplate.fabricacao, 'em_campo')).toBe(false);
    expect(showsConfirmedGlyph(undefined, 'em_campo')).toBe(false);
  });
});

describe('8.1-UNIT reading the rows', () => {
  it('lists one relatório suggestion rows, pending by the stored status only', () => {
    const a = suggestion('fabricacao', 'Schneider');
    const b = suggestion('n_serie', 'SU1', { status: 'confirmed' });
    const c = suggestion('tipo', 'X', { relatorio_id: '019966b0-0081-7000-8000-0000000000ff' });
    const state: EntityState = new Map<ReturnType<typeof entityKey>, EntityRow>([
      [entityKey('suggestion', c.id), c],
      [entityKey('suggestion', b.id), b],
      [entityKey('suggestion', a.id), a],
      [entityKey('block', BLOCK), chave()],
    ]);
    const rows = suggestionRowsOf(state, TEST_RELATORIO);
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(pendingSuggestions(rows).map((r) => r.id)).toEqual([a.id]);
  });

  it('names the block of any sheet target and none for another target', () => {
    expect(suggestionBlockId(suggestion('fabricacao', 'x'))).toBe(BLOCK);
    expect(suggestionBlockId({ target_path: `sheet/${OTHER_BLOCK}/checklist/limpeza/observation` })).toBe(OTHER_BLOCK);
    expect(suggestionBlockId({ target_path: `location/${LOC}/env/temperature_c` })).toBeNull();
    expect(suggestionBlockId({ target_path: 'not a path' })).toBeNull();
    const pending = [suggestion('fabricacao', 'x'), suggestion('n_serie', 'y', { target_path: `sheet/${OTHER_BLOCK}/nameplate/n_serie` }), suggestion('tipo', 'z', { status: 'discarded' })];
    expect(blocksWithPendingSuggestions(pending)).toEqual(new Set([BLOCK, OTHER_BLOCK]));
  });

  it('with several pending on one field, the newest id is the one shown', () => {
    const older = suggestion('tensao_de_placa', '13,8');
    const newer = suggestion('tensao_de_placa', '15');
    const map = pendingByNameplateField([newer, older, suggestion('fabricacao', 'ABB', { status: 'confirmed' })], BLOCK);
    expect([...map.keys()]).toEqual(['tensao_de_placa']);
    expect(map.get('tensao_de_placa')!.id).toBe(newer.id);
    expect(pendingByNameplateField([newer], OTHER_BLOCK).size).toBe(0);
  });

  it('resolves the field definition of a nameplate target', () => {
    const block = chave();
    expect(suggestionFieldDef(block, suggestion('corrente_nominal', null))).toMatchObject({ kind: 'number', unit: 'A' });
    expect(suggestionFieldDef(block, suggestion('nao_existe', null))).toBeNull();
    expect(suggestionFieldDef(chave({}, OTHER_BLOCK), suggestion('fabricacao', null))).toBeNull();
  });
});

describe('8.1-UNIT compareSuggestion, every kind', () => {
  it('text and select: trimmed, inner whitespace collapsed, then exact', () => {
    expect(compareSuggestion('  SU 1240998 ', 'SU  1240998', def('text'))).toBe('equal');
    expect(compareSuggestion('su1240998', 'SU1240998', def('text'))).toBe('different');
    expect(compareSuggestion('AR', ' AR', def('select'))).toBe('equal');
    expect(compareSuggestion('AR', 'SF6', def('select'))).toBe('different');
  });

  it('manufacturer: the normalized registry name', () => {
    expect(compareSuggestion('Schneider', 'SCHNEIDER ', def('manufacturer'))).toBe('equal');
    expect(compareSuggestion('Blütrafos', 'Blutrafos', def('manufacturer'))).toBe('equal');
    expect(compareSuggestion('Schneider', 'ABB', def('manufacturer'))).toBe('different');
  });

  it('voltage class: the same kV number', () => {
    expect(compareSuggestion('15', '15 kV', def('voltage_class'))).toBe('equal');
    expect(compareSuggestion('17,5', '17.5', def('voltage_class'))).toBe('equal');
    expect(compareSuggestion('15', '15,0', def('voltage_class'))).toBe('equal');
    expect(compareSuggestion('13,8', '15', def('voltage_class'))).toBe('different');
  });

  it('number: the canonical raw, the unit and the state', () => {
    expect(compareSuggestion({ raw: '630.0', unit: 'A', state: 'measured' }, { raw: '630', unit: 'A', state: 'measured' }, def('number'))).toBe('equal');
    expect(compareSuggestion({ raw: '630', unit: 'A', state: 'measured' }, { raw: '630', unit: 'kA', state: 'measured' }, def('number'))).toBe('different');
    expect(compareSuggestion({ raw: '630', unit: 'A', state: 'measured' }, { raw: '630', unit: 'A', state: 'not_measured' }, def('number'))).toBe('different');
    expect(compareSuggestion({ raw: '630', unit: 'A', state: 'measured' }, { raw: '631', unit: 'A', state: 'measured' }, def('number'))).toBe('different');
  });

  it('date: the stored string', () => {
    expect(compareSuggestion('2012-03', '2012-03', def('date'))).toBe('equal');
    expect(compareSuggestion('2012-03', '2012-03-01', def('date'))).toBe('different');
  });

  it('no definition: JSON deep equality', () => {
    expect(compareSuggestion({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }, null)).toBe('equal');
    expect(compareSuggestion({ a: 1 }, { a: 2 }, null)).toBe('different');
    expect(compareSuggestion('x', 'x', null)).toBe('equal');
  });
});

describe('8.1-UNIT the I/O matrix', () => {
  it('fill (suggested and verify), replace and none', () => {
    const volt = def('voltage_class');
    expect(suggestionView(undefined, suggestion('tensao_de_placa', '15'), volt)).toBe('fill');
    expect(suggestionView(cell(null), suggestion('tensao_de_placa', '15'), volt)).toBe('fill');
    expect(suggestionView(cell('  '), suggestion('tensao_de_placa', '15'), volt)).toBe('fill');
    expect(suggestionView(cell('13,8'), suggestion('tensao_de_placa', '15'), volt)).toBe('replace');
    expect(suggestionView(cell('15'), suggestion('tensao_de_placa', '15 kV'), volt)).toBe('none');
  });

  it('Confirmar todos takes every suggested fill on an empty field, skipping verify and replace ones', () => {
    const block = chave({ tensao_de_placa: cell('13,8'), identificacao: cell('Entrada') });
    const fab = suggestion('fabricacao', 'Schneider');
    const serie = suggestion('n_serie', 'SU1240998');
    const tipo = suggestion('tipo', 'Manual');
    const meio = suggestion('meio_de_extincao', 'AR');
    const corrente = suggestion('corrente_nominal', { raw: '630', unit: 'A', state: 'measured' });
    const acion = suggestion('acionamento', 'MANUAL/PUNHO');
    const data = suggestion('data_de_fabricacao', '2012-03');
    const tag = suggestion('tag', 'SEC-ENT');
    const verify = suggestion('identificacao', 'x', { trust: 'verify' });
    const replace = suggestion('tensao_de_placa', '15');
    const icc = suggestion('corrente_nominal', { raw: '16', unit: 'A', state: 'measured' }, { trust: 'verify' });
    const pending = [fab, serie, tipo, meio, corrente, acion, data, tag, verify, replace];
    const picked = confirmAllCandidates(block, pending);
    expect(picked.map((s) => s.id)).toEqual([fab.id, serie.id, tag.id, tipo.id, meio.id, corrente.id, acion.id, data.id]);
    // A verify guess on an empty field is never picked; the newest on the field wins.
    const withVerify = confirmAllCandidates(block, [...pending, icc]);
    expect(withVerify.map((s) => s.id)).not.toContain(icc.id);
    expect(withVerify.map((s) => s.id)).not.toContain(corrente.id);
    expect(suggestionGroupCounts(block, [...pending, icc])).toEqual({ shown: 10, fills: 8, confirmable: 7, verify: 1, create: 0 });
    // `identificacao` is filled with a different value: a replace, not a verify fill.
    expect(nameplateSuggestions(block, pending).find((e) => e.field.key === 'identificacao')!.view).toBe('replace');
  });

  it('a filled field receiving an equal suggestion shows nothing (the device auto-confirms it)', () => {
    const block = chave({ fabricacao: cell('Schneider') });
    const equal = suggestion('fabricacao', 'SCHNEIDER');
    expect(nameplateSuggestions(block, [equal])[0]!.view).toBe('none');
    expect(suggestionGroupCounts(block, [equal])).toEqual({ shown: 0, fills: 0, confirmable: 0, verify: 0, create: 0 });
    expect(confirmAllCandidates(block, [equal])).toEqual([]);
  });
});

describe('8.1-UNIT the editable guess', () => {
  const number = def('number', { unit: 'A' });
  const select = def('select', { options: ['EPÓXI', 'Á SECO'] });

  it('shows each kind as the engineer would type it', () => {
    expect(fieldInputText(number, { raw: '3300', unit: 'A', state: 'measured' })).toBe('3.300');
    expect(fieldInputText(def('date'), '2012-03')).toBe('03/2012');
    expect(fieldInputText(def('date'), '2012-03-05')).toBe('05/03/2012');
    expect(fieldInputText(def('voltage_class'), '15')).toBe('15 kV');
    expect(fieldInputText(def('voltage_class'), '17,5')).toBe('17,5 kV');
    expect(fieldInputText(def('text'), 'SU1240998')).toBe('SU1240998');
    expect(fieldInputText(def('manufacturer'), 'Schneider')).toBe('Schneider');
    expect(fieldInputText(def('text'), null)).toBe('');
  });

  it('parses each kind, and refuses what is not one', () => {
    expect(parseFieldInput(number, '3.300')).toEqual({ ok: true, value: { raw: '3300', unit: 'A', state: 'measured' } });
    expect(parseFieldInput(number, '13,8')).toEqual({ ok: true, value: { raw: '13.8', unit: 'A', state: 'measured' } });
    expect(parseFieldInput(def('number'), '5')).toEqual({ ok: true, value: { raw: '5', unit: null, state: 'measured' } });
    expect(parseFieldInput(number, 'abc')).toEqual({ ok: false });
    expect(parseFieldInput(def('date'), '05/03/2012')).toEqual({ ok: true, value: '2012-03-05' });
    expect(parseFieldInput(def('date'), '3/2012')).toEqual({ ok: true, value: '2012-03' });
    expect(parseFieldInput(def('date'), '2012-03-05')).toEqual({ ok: true, value: '2012-03-05' });
    expect(parseFieldInput(def('date'), '2012-03')).toEqual({ ok: true, value: '2012-03' });
    expect(parseFieldInput(def('date'), '31/02/2012')).toEqual({ ok: false });
    expect(parseFieldInput(def('date'), '13/2012')).toEqual({ ok: false });
    expect(parseFieldInput(def('date'), 'ontem')).toEqual({ ok: false });
    expect(parseFieldInput(select, 'epoxi')).toEqual({ ok: true, value: 'EPÓXI' });
    expect(parseFieldInput(select, 'a seco')).toEqual({ ok: true, value: 'Á SECO' });
    expect(parseFieldInput(select, 'vidro')).toEqual({ ok: false });
    expect(parseFieldInput(def('voltage_class'), '15 kV')).toEqual({ ok: true, value: '15' });
    expect(parseFieldInput(def('voltage_class'), '17.5')).toEqual({ ok: true, value: '17,5' });
    expect(parseFieldInput(def('voltage_class'), 'alta')).toEqual({ ok: false });
    expect(parseFieldInput(def('text'), '  SU  12 ')).toEqual({ ok: true, value: 'SU 12' });
    expect(parseFieldInput(def('manufacturer'), 'ABB')).toEqual({ ok: true, value: 'ABB' });
    expect(parseFieldInput(def('text'), '   ')).toEqual({ ok: true, value: null });
  });
});

describe('8.1-UNIT the texts', () => {
  it('names a suggested value with its unit', () => {
    expect(suggestionValueText(def('number', { unit: 'A' }), { raw: '630', unit: 'A', state: 'measured' })).toBe('630 A');
    expect(suggestionValueText(def('number', { unit: 'kA' }), { raw: '16', unit: null, state: 'measured' })).toBe('16 kA');
    expect(suggestionValueText(def('voltage_class'), '15')).toBe('15 kV');
    expect(suggestionValueText(def('date'), '2012-03')).toBe('03/2012');
    expect(suggestionValueText(def('manufacturer'), 'Schneider')).toBe('Schneider');
    expect(suggestionValueText(null, 'x')).toBe('x');
  });

  it('writes the button, the toasts, the note, the announcement, the replace line and the pre-issue row', () => {
    expect(confirmarTodosText(7)).toBe('Confirmar todos (7)');
    expect(confirmedAllToastText(7, 1)).toBe('7 campos confirmados — 1 campo pede verificação');
    expect(confirmedAllToastText(7, 2)).toBe('7 campos confirmados — 2 campos pedem verificação');
    expect(confirmedAllToastText(1, 0)).toBe('1 campo confirmado');
    expect(confirmedFieldToastText('Fabricante', 'Schneider')).toBe('Fabricante: Schneider — confirmado');
    expect(suggestionGroupNoteText(9, 1)).toBe('9 sugestões lidas. Nada foi gravado: confirme um a um ou todos — o campo “Verificar” pede o seu toque.');
    expect(suggestionGroupNoteText(9, 2)).toBe('9 sugestões lidas. Nada foi gravado: confirme um a um ou todos — os campos “Verificar” pedem o seu toque.');
    expect(suggestionGroupNoteText(3, 0)).toBe('3 sugestões lidas. Nada foi gravado: confirme um a um ou todos.');
    expect(suggestionGroupNoteText(1, 0)).toBe('1 sugestão lida. Nada foi gravado até você confirmar.');
    expect(suggestionAnnouncement('suggested', '15 kV')).toBe('Sugerido, 15 kV, confirmar');
    expect(suggestionAnnouncement('verify', '16 kA')).toBe('Verificar, 16 kA, confirmar');
    expect(replaceLineText('15 kV')).toBe('Sugerido: 15 kV');
    expect(fichasComSugestoesText(3)).toBe('3 fichas com sugestões por confirmar');
    expect(fichasComSugestoesText(1)).toBe('1 ficha com sugestões por confirmar');
  });
});

describe('8.1-UNIT progress over the device pending rows', () => {
  const concluded = (id: string, location = LOC): BlockRow => ({ ...chave({ fabricacao: cell('ABB') }, id), location_id: location, concluded_by: { actor_id: TEST_USER, at: '2026-09-26T10:00:00.000Z' } });
  const cabine = { id: LOC, parent_id: null } as never;

  it('counts the pending rows given and never counts a block holding one as concluded', () => {
    const blocks = [concluded(BLOCK), concluded(OTHER_BLOCK)];
    const pending = [suggestion('n_serie', 'SU1'), suggestion('tipo', 'X')];
    expect(progress({ blocks, suggestions: [] }, pending)).toMatchObject({ sheets_concluded: 1, sheets_total: 2, suggestions_pending: 2 });
    expect(progress({ blocks, suggestions: [] })).toMatchObject({ sheets_concluded: 2, suggestions_pending: 0 });
    expect(progress({ blocks, suggestions: [] }, [])).toMatchObject({ sheets_concluded: 2, suggestions_pending: 0 });
    expect(cabineSheetsProgress({ blocks, locations: [cabine], suggestions: [] }, LOC, pending)).toMatchObject({ sheets_concluded: 1, suggestions_pending: 2 });
    expect(locationProgress({ blocks, locations: [cabine] }, LOC, pending)).toMatchObject({ sheets_concluded: 1, suggestions_pending: 2 });
    // A pending row on a removed block, or on a block the snapshot does not hold, counts nothing and holds nothing.
    const removed = { ...concluded(OTHER_BLOCK), removed_at: '2026-09-26T11:00:00.000Z' };
    const stale = [suggestion('tipo', 'X', { target_path: `sheet/${OTHER_BLOCK}/nameplate/tipo` }), suggestion('tipo', 'Y', { target_path: `sheet/019966b0-0081-7000-8000-0000000000ef/nameplate/tipo` })];
    expect(progress({ blocks: [concluded(BLOCK), removed], suggestions: [] }, stale)).toMatchObject({ sheets_concluded: 1, suggestions_pending: 0 });
    expect(livePendingSuggestions([concluded(BLOCK), removed], [...stale, pending[0]!]).map((row) => row.id)).toEqual([pending[0]!.id]);
    // A pending row of a block outside the location is not its own.
    const elsewhere = [suggestion('n_serie', 'SU1', { target_path: `sheet/019966b0-0081-7000-8000-0000000000ee/nameplate/n_serie` })];
    expect(locationProgress({ blocks, locations: [cabine] }, LOC, elsewhere)).toMatchObject({ sheets_concluded: 2, suggestions_pending: 0 });
  });
});

describe('8.1-UNIT the Sumário count leads to the first sheet holding a pending suggestion', () => {
  it('picks the first in tree order, and none without a pending row', () => {
    const snapshot = buildSnapshot(replay(portoSeguro.log, { deadOpIds: portoSeguro.deadOpIds }), portoSeguro.relatorioId);
    const order = sheetOrder(snapshot).map((node) => node.blockId);
    const at = (i: number, status: SuggestionRow['status'] = 'pending') => suggestion('fabricacao', 'x', { target_path: `sheet/${order[i]}/nameplate/fabricacao`, status });
    expect(firstSheetWithPendingSuggestions(snapshot, [at(10), at(3)])).toBe(order[3]);
    expect(firstSheetWithPendingSuggestions(snapshot, [at(3, 'confirmed'), at(10)])).toBe(order[10]);
    expect(firstSheetWithPendingSuggestions(snapshot, [])).toBeNull();
    // A pending row on a block the snapshot does not hold never leads anywhere.
    const gone = suggestion('fabricacao', 'x', { target_path: `sheet/019966b0-0081-7000-8000-0000000000ee/nameplate/fabricacao` });
    expect(firstSheetWithPendingSuggestions(snapshot, [gone])).toBeNull();
  });
});
