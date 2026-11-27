import { describe, expect, it } from 'vitest';
import { blockFieldPath, sheetChecklistPath, sheetNameplatePath, suggestionStatusPath } from '../ops/path.ts';
import type { SuggestionRow } from '../schemas/entities.ts';
import { idSequence, TEST_COMPANY, TEST_RELATORIO, TEST_USER } from '../test-support.ts';
import { aiWriteAnswers, audioAnswers, auditAnswers, auditFindingWatch, readingAnswers, type AnswerRun } from './build.ts';
import { aiAnswerSeverity, aiQualityReport, fieldReadError, guardRefusalKinds, wordChangeShare, type AiReportRow } from './rubric.ts';
import type { AiAnswerDraft, AiAnswerState } from './schema.ts';
import { refusedByDevice, settleAiAnswers, type SettleOp } from './settle.ts';
import { answerItemKey, answerText, sameAnswerValue } from './values.ts';

/*
 * Story 32.1: the kernel's AI answer records, built per AI use and settled by the ops that answer
 * them, on every outcome (kept, changed, refused, unanswered), with the offline order (an op settles
 * at its own time) and a closed record never moving; Story 32.2, the rubric's measures.
 */

const ids = idSequence('019966b0-0032-7000-8000-');
const BLOCK = ids();
const PHOTO = ids();
const AUDIO = ids();
const RUN = ids();
const OTHER_RELATORIO = ids();
const AT = '2026-11-27T12:00:00.000Z';

const run = (overrides: Partial<AnswerRun> = {}): AnswerRun => ({
  companyId: TEST_COMPANY,
  relatorioId: TEST_RELATORIO,
  runId: RUN,
  model: 'fake',
  promptVersion: 'fake-1',
  usd: 0,
  at: AT,
  newId: ids,
  ...overrides,
});

function suggestion(key: string, value: SuggestionRow['value'], trust: SuggestionRow['trust'] = 'suggested'): SuggestionRow {
  return {
    id: ids(),
    relatorio_id: TEST_RELATORIO,
    target_path: sheetNameplatePath(BLOCK, key),
    value,
    trust,
    mode: 'fill',
    source: { photo_id: PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: ['t1'], reading_run_id: RUN },
    status: 'pending',
    prompt_version: 'fake-1',
    hint: null,
  };
}

const state = (draft: AiAnswerDraft): AiAnswerState => ({ ...draft });

let minute = 0;
/** An op as the apply path hands it over, one minute after the previous one unless `at` says otherwise. */
function op(input: Partial<SettleOp> & Pick<SettleOp, 'path' | 'value'>): SettleOp {
  minute += 1;
  return {
    op_id: ids(),
    kind: 'put',
    batch_id: null,
    meta: null,
    actor_id: TEST_USER,
    client_ts: new Date(Date.parse(AT) + minute * 60_000).toISOString(),
    relatorio_id: TEST_RELATORIO,
    ...input,
  };
}

const emission = (relatorioId = TEST_RELATORIO) =>
  op({ kind: 'create', path: `revision/${ids()}`, value: { relatorio_id: relatorioId }, actor_id: 'system:generate', relatorio_id: relatorioId });

/** One plate field read and its open record. */
function plateField(key = 'fabricacao', value: SuggestionRow['value'] = 'WEG') {
  const row = suggestion(key, value);
  const [record] = readingAnswers({ ...run(), use: 'plate', photoId: PHOTO, rows: [row], dropped: [], output: { values: [{ key, value: typeof value === 'string' ? value.toUpperCase() : 'x', ocr_token_ids: ['t1'], confidence: 0.9 }] }, asked: null });
  return { row, record: record! };
}

describe('32.1-UNIT-001 the records each AI use writes', () => {
  it('a plate reading: one row per field read (key, value as given, value shown and why, confidence), per value dropped (withheld) and per field left empty', () => {
    const fabricante = suggestion('fabricacao', 'Weg');
    const tensao = suggestion('tensao_de_placa', { raw: '15', unit: 'kV', state: 'measured' }, 'verify');
    const drafts = readingAnswers({
      ...run(),
      use: 'plate',
      photoId: PHOTO,
      rows: [fabricante, tensao],
      dropped: [{ key: 'numero_de_serie', reason: 'unknown_token' }],
      output: {
        values: [
          { key: 'fabricacao', value: 'WEG', ocr_token_ids: ['t1'], confidence: 0.9 },
          { key: 'tensao_de_placa', value: { raw: '15', unit: 'kV', state: 'measured' }, ocr_token_ids: ['t2'], confidence: 0.6 },
          { key: 'numero_de_serie', value: '123', ocr_token_ids: ['t9'], confidence: 0.4 },
        ],
      },
      asked: ['fabricacao', 'tensao_de_placa', 'numero_de_serie', 'ano_de_fabricacao'].map((key) => ({ key, target_path: sheetNameplatePath(BLOCK, key) })),
    });
    expect(drafts.map((draft) => [draft.item_key, draft.answer, draft.shown, draft.shown_reason, draft.confidence, draft.outcome, draft.action])).toEqual([
      ['fabricacao', 'WEG', 'Weg', 'normalized', 0.9, null, null],
      ['tensao_de_placa', { raw: '15', unit: 'kV', state: 'measured' }, { raw: '15', unit: 'kV', state: 'measured' }, null, 0.6, null, null],
      ['numero_de_serie', '123', null, 'dropped: unknown_token', 0.4, 'refused', 'withheld'],
      ['ano_de_fabricacao', null, null, 'empty', null, null, null],
    ]);
    expect(drafts.every((draft) => draft.use === 'plate' && draft.run_table === 'reading_runs' && draft.run_id === RUN && draft.input_file_id === PHOTO && draft.input_text === null)).toBe(true);
    expect(drafts[0]).toMatchObject({ suggestion_id: fabricante.id, target_path: fabricante.target_path, target: { photo_id: PHOTO, trust: 'suggested', mode: 'fill' }, model: 'fake', prompt_version: 'fake-1', company_id: TEST_COMPANY, relatorio_id: TEST_RELATORIO, created_at: AT });
    expect(drafts[2]).toMatchObject({ closed_at: AT, settled_at: AT, settled_by: null, target_path: sheetNameplatePath(BLOCK, 'numero_de_serie') });
    expect(drafts[3]).toMatchObject({ closed_at: null, target_path: sheetNameplatePath(BLOCK, 'ano_de_fabricacao') });
  });

  it('a display reading with no structuring step: the value shown is the answer, no confidence, no field left empty', () => {
    const row = suggestion('fabricacao', 'X');
    const [draft, ...rest] = readingAnswers({ ...run({ model: null, promptVersion: null }), use: 'display', photoId: PHOTO, rows: [row], dropped: [], output: null, asked: null });
    expect(rest).toEqual([]);
    expect(draft).toMatchObject({ use: 'display', answer: 'X', shown: 'X', shown_reason: null, confidence: null, model: null });
  });

  it('an audio into a prose field: the text as heard and as written as the answer, the field text shown, the guard reasons when it fell back; only the audio id as input', () => {
    const target = { type: 'item' as const, block_id: BLOCK, item_key: 'contatos' };
    const path = sheetChecklistPath(BLOCK, 'contatos', 'observation');
    const [passed] = audioAnswers({ ...run(), audioId: AUDIO, target, heard: 'contato oxidado', written: 'Contato oxidado.', puts: [{ path, value: 'Contato oxidado.' }], fallback: null, notAReading: false, suggestion: null });
    expect(passed).toMatchObject({ use: 'audio_text', run_table: 'transcription_runs', input_file_id: AUDIO, input_text: null, answer: { heard: 'contato oxidado', written: 'Contato oxidado.' }, shown: 'Contato oxidado.', shown_reason: null, target_path: path, outcome: null });
    const [fellBack] = audioAnswers({ ...run(), audioId: AUDIO, target, heard: 'fase b 3 a', written: 'Fase B com 30 A.', puts: [{ path, value: 'fase b 3 a' }], fallback: 'guard: added number 30', notAReading: false, suggestion: null });
    expect(fellBack).toMatchObject({ answer: { heard: 'fase b 3 a', written: 'Fase B com 30 A.' }, shown: 'fase b 3 a', shown_reason: 'guard: added number 30', outcome: null });
    const [silent, ...none] = audioAnswers({ ...run(), audioId: AUDIO, target, heard: '', written: null, puts: [], fallback: 'no_speech', notAReading: false, suggestion: null });
    expect(none).toEqual([]);
    expect(silent).toMatchObject({ shown: null, shown_reason: 'no_speech', outcome: 'refused', action: 'withheld', closed_at: AT });
  });

  it('an audio into a measurement table: one record per spoken reading, the text as heard as the answer and the reading shown', () => {
    const reading = { ...suggestion('fabricacao', { raw: '12', unit: 'GΩ', state: 'measured' }), source: { audio_id: AUDIO } };
    const drafts = audioAnswers({ ...run(), audioId: AUDIO, target: { type: 'table', block_id: BLOCK, test_key: 'isolacao', table_key: 'isolacao' }, heard: 'doze giga', written: null, puts: [], fallback: null, notAReading: false, suggestion: reading });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ use: 'audio_reading', suggestion_id: reading.id, answer: 'doze giga', shown: { raw: '12', unit: 'GΩ', state: 'measured' }, shown_reason: 'parsed from the text as heard' });
  });

  it('the AI control: a proposal is open with the field text as input; a guard refusal is withheld with the model text and the reasons; a failed call has no record', () => {
    const target = { type: 'item' as const, block_id: BLOCK, item_key: 'contatos' };
    const [proposal] = aiWriteAnswers({ ...run(), target, source: 'contato oxidado', answer: { outcome: 'written', text: 'Contato oxidado.' }, modelText: 'Contato oxidado.', guard: null });
    expect(proposal).toMatchObject({ use: 'ai_write', input_text: 'contato oxidado', answer: 'Contato oxidado.', shown: 'Contato oxidado.', target_path: sheetChecklistPath(BLOCK, 'contatos', 'observation'), target, outcome: null });
    const [refused] = aiWriteAnswers({ ...run(), target, source: 'folga', answer: { outcome: 'refused', reason: 'guard' }, modelText: 'Folga de 3 mm.', guard: 'guard: added number 3' });
    expect(refused).toMatchObject({ answer: 'Folga de 3 mm.', shown: null, shown_reason: 'guard: added number 3', outcome: 'refused', action: 'withheld', closed_at: AT });
    expect(aiWriteAnswers({ ...run(), target, source: 'folga', answer: { outcome: 'refused', reason: 'failed' }, modelText: null, guard: 'writing_failed: Error' })).toEqual([]);
  });

  it('Conferência por IA: one record per finding kept (with the paths it watches) and per finding dropped (withheld)', () => {
    const sectionBlock = { id: ids(), block_type: 'section_10', removed_at: null } as never;
    const raw = [
      { kind: 'conclusion_vs_nc', ref: `sheet:${BLOCK}`, text: '  A conclusão   contradiz o item 3. ' },
      { kind: 'nope', ref: 'x', text: 'y' },
      { kind: 'caption_equipment', ref: `photo:${PHOTO}`, text: 'Legenda cita TR-02.' },
    ];
    const kept = [
      { kind: 'conclusion_vs_nc' as const, text: 'A conclusão contradiz o item 3.', ref: `sheet:${BLOCK}`, label: 'Ficha', target: { kind: 'sheet' as const, blockId: BLOCK } },
      { kind: 'caption_equipment' as const, text: 'Legenda cita TR-02.', ref: `photo:${PHOTO}`, label: 'Foto 1', target: { kind: 'photos' as const } },
    ];
    const drafts = auditAnswers({ ...run(), inputText: '[sheet:x] ...', raw, kept, dropped: [{ index: 1, reason: 'unknown_kind' }], snapshot: { blocks: [sectionBlock] } });
    expect(drafts.map((draft) => [draft.item_key, draft.shown, draft.shown_reason, draft.watch_paths, draft.outcome])).toEqual([
      ['conclusion_vs_nc', 'A conclusão contradiz o item 3.', 'normalized', [`sheet/${BLOCK}/`, `block/${BLOCK}/`], null],
      ['caption_equipment', 'Legenda cita TR-02.', null, [`file/${PHOTO}/caption`], null],
      ['nope', null, 'dropped: unknown_kind', null, 'refused'],
    ]);
    expect(drafts.every((draft) => draft.run_table === 'audit_run' && draft.input_text === '[sheet:x] ...')).toBe(true);
  });

  it('the paths a section finding watches: section 10 the setup and the points, another section its block, the cover the setup', () => {
    const s5 = ids();
    const blocks = [{ id: s5, block_type: 'section_5', removed_at: null }] as never;
    expect(auditFindingWatch({ blocks }, { ref: 'section:10', target: { kind: 'section', rowKey: 'section_10' } })).toEqual(['relatorio/setup/', 'point/']);
    expect(auditFindingWatch({ blocks }, { ref: 'section:5', target: { kind: 'section', rowKey: 'section_5' } })).toEqual([`block/${s5}/`]);
    expect(auditFindingWatch({ blocks }, { ref: 'section:6', target: { kind: 'section', rowKey: 'section_6' } })).toEqual(['relatorio/setup/']);
    expect(auditFindingWatch({ blocks }, { ref: 'section:1', target: { kind: 'section', rowKey: 'capa' } })).toEqual(['relatorio/setup/']);
    expect(auditFindingWatch({ blocks }, { ref: `row:${BLOCK}:t:1`, target: { kind: 'sheet', blockId: BLOCK } })).toEqual([`sheet/${BLOCK}/`, `block/${BLOCK}/`]);
  });
});

describe('32.1-UNIT-002 a Suggestion settles by its confirm, its discard or its undo', () => {
  it('kept: confirmed as suggested, by whom and at the op time', () => {
    const { row, record } = plateField();
    const batch = ids();
    const confirm = [op({ path: suggestionStatusPath(row.id), value: 'confirmed', batch_id: batch }), op({ path: row.target_path, value: 'WEG', batch_id: batch, meta: { source_suggestion_id: row.id } })];
    const settled = settleAiAnswers([state({ ...record, shown: 'WEG' })], confirm).get(record.id);
    expect(settled).toEqual({ outcome: 'kept', action: 'confirm', final_value: 'WEG', settled_by: TEST_USER, settled_at: confirm[1]!.client_ts, closed_at: null });
  });

  it('changed: edited before confirming (the confirm carries another value)', () => {
    const { row, record } = plateField();
    const settled = settleAiAnswers([state(record)], [op({ path: row.target_path, value: 'Siemens', meta: { source_suggestion_id: row.id } })]).get(record.id);
    expect(settled).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'Siemens' });
  });

  it('changed: a value typed over the suggestion, then the suggestion discarded (in one batch, or the discard later)', () => {
    const one = plateField();
    const batch = ids();
    expect(settleAiAnswers([state(one.record)], [op({ path: one.row.target_path, value: 'ABB', batch_id: batch }), op({ path: suggestionStatusPath(one.row.id), value: 'discarded', batch_id: batch })]).get(one.record.id)).toMatchObject({
      outcome: 'changed',
      action: 'edit',
      final_value: 'ABB',
    });
    const two = plateField();
    const typed = settleAiAnswers([state(two.record)], [op({ path: two.row.target_path, value: 'ABB' })]).get(two.record.id)!;
    expect(typed).toMatchObject({ outcome: null, final_value: 'ABB' });
    const later = settleAiAnswers([{ ...state(two.record), ...typed }], [op({ path: suggestionStatusPath(two.row.id), value: 'discarded' })]).get(two.record.id);
    expect(later).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'ABB' });
  });

  it('refused: "Descartar" with no value of the user\'s', () => {
    const { row, record } = plateField();
    expect(settleAiAnswers([state(record)], [op({ path: suggestionStatusPath(row.id), value: 'discarded' })]).get(record.id)).toMatchObject({ outcome: 'refused', action: 'discard', final_value: null, settled_by: TEST_USER });
  });

  it('refused: the undo of a confirm puts the status back to pending', () => {
    const { row, record } = plateField();
    const kept = { ...state(record), outcome: 'kept' as const, action: 'confirm' as const, final_value: 'Weg', settled_by: TEST_USER, settled_at: AT };
    expect(settleAiAnswers([kept], [op({ path: suggestionStatusPath(row.id), value: 'pending' })]).get(record.id)).toMatchObject({ outcome: 'refused', action: 'undo', final_value: null });
  });

  it('a later edit of the confirmed field moves the final value until the emission, which closes it', () => {
    const { row, record } = plateField();
    const kept = { ...state(record), outcome: 'kept' as const, action: 'confirm' as const, final_value: 'Weg', settled_by: TEST_USER, settled_at: AT };
    const edit = op({ path: row.target_path, value: 'WEG Motores' });
    const issued = emission();
    const settled = settleAiAnswers([kept], [edit, issued]).get(record.id);
    expect(settled).toEqual({ outcome: 'changed', action: 'edit', final_value: 'WEG Motores', settled_by: TEST_USER, settled_at: edit.client_ts, closed_at: issued.client_ts });
  });

  it('unanswered: a newer reading discards it (superseded), or the emission finds it pending', () => {
    const one = plateField();
    const superseded = op({ path: suggestionStatusPath(one.row.id), value: 'discarded', actor_id: 'system:reading' });
    expect(settleAiAnswers([state(one.record)], [superseded]).get(one.record.id)).toEqual({ outcome: 'unanswered', action: 'superseded', final_value: null, settled_by: null, settled_at: superseded.client_ts, closed_at: superseded.client_ts });
    const two = plateField();
    const issued = emission();
    expect(settleAiAnswers([state(two.record)], [issued]).get(two.record.id)).toEqual({ outcome: 'unanswered', action: null, final_value: null, settled_by: null, settled_at: issued.client_ts, closed_at: issued.client_ts });
  });

  it('a field the model left empty: the user filling it is the change; never filled, it closes unanswered', () => {
    const asked = readingAnswers({ ...run(), use: 'plate', photoId: PHOTO, rows: [], dropped: [], output: { values: [] }, asked: [{ key: 'ano_de_fabricacao', target_path: sheetNameplatePath(BLOCK, 'ano_de_fabricacao') }] });
    const record = state(asked[0]!);
    expect(settleAiAnswers([record], [op({ path: record.target_path!, value: '2019' })]).get(record.id)).toMatchObject({ outcome: 'changed', action: 'edit', final_value: '2019' });
    expect(settleAiAnswers([record], [emission()]).get(record.id)).toMatchObject({ outcome: 'unanswered' });
  });
});

describe('32.1-UNIT-003 a text from audio and the AI control', () => {
  const target = { type: 'item' as const, block_id: BLOCK, item_key: 'contatos' };
  const path = sheetChecklistPath(BLOCK, 'contatos', 'observation');

  it('a text from audio left untouched is kept at the emission; edited, it is changed to the text left; the server writing another audio is no edit', () => {
    const [draft] = audioAnswers({ ...run(), audioId: AUDIO, target, heard: 'contato oxidado', written: 'Contato oxidado.', puts: [{ path, value: 'Contato oxidado.' }], fallback: null, notAReading: false, suggestion: null });
    const record = state(draft!);
    const issued = emission();
    expect(settleAiAnswers([record], [op({ path, value: 'Contato oxidado. Outro.', actor_id: 'system:transcription', meta: { source_audio_id: ids() } }), issued]).get(record.id)).toEqual({
      outcome: 'kept',
      action: 'untouched',
      final_value: 'Contato oxidado.',
      settled_by: null,
      settled_at: issued.client_ts,
      closed_at: issued.client_ts,
    });
    expect(settleAiAnswers([record], [op({ path, value: 'Contato da fase B oxidado.' })]).get(record.id)).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'Contato da fase B oxidado.' });
  });

  it('"Usar o texto da IA" keeps the proposal (matched by meta.ai_run_id); "Desfazer" puts the user\'s text back and refuses it; another text changes it', () => {
    const [draft] = aiWriteAnswers({ ...run(), target, source: 'contato oxidado', answer: { outcome: 'written', text: 'Contato oxidado.' }, modelText: 'Contato oxidado.', guard: null });
    const record = state(draft!);
    const use = op({ path, value: 'Contato oxidado.', meta: { ai_written: true, ai_run_id: RUN } });
    const kept = settleAiAnswers([record], [use]).get(record.id)!;
    expect(kept).toEqual({ outcome: 'kept', action: 'confirm', final_value: 'Contato oxidado.', settled_by: TEST_USER, settled_at: use.client_ts, closed_at: null });
    const after = { ...record, ...kept };
    expect(settleAiAnswers([after], [op({ path, value: 'contato oxidado' })]).get(record.id)).toMatchObject({ outcome: 'refused', action: 'undo', final_value: 'contato oxidado' });
    expect(settleAiAnswers([after], [op({ path, value: 'Contato muito oxidado.' })]).get(record.id)).toMatchObject({ outcome: 'changed', action: 'edit', final_value: 'Contato muito oxidado.' });
  });

  it('an older device (no ai_run_id): the put settles the latest open proposal of that field; a put of another run settles nothing of this one', () => {
    const [older] = aiWriteAnswers({ ...run({ runId: ids() }), target, source: 'a', answer: { outcome: 'written', text: 'A.' }, modelText: 'A.', guard: null });
    const [latest] = aiWriteAnswers({ ...run({ runId: ids() }), target, source: 'a', answer: { outcome: 'written', text: 'A!' }, modelText: 'A!', guard: null });
    const settled = settleAiAnswers([state(older!), state(latest!)], [op({ path, value: 'A!', meta: { ai_written: true } })]);
    expect([...settled.keys()]).toEqual([latest!.id]);
    expect(settled.get(latest!.id)).toMatchObject({ outcome: 'kept' });
    expect(settleAiAnswers([state(older!)], [op({ path, value: 'A.', meta: { ai_written: true, ai_run_id: ids() } })]).size).toBe(0);
  });

  it('"Manter o meu texto" and the text changed meanwhile are the device\'s report; never over a proposal already settled', () => {
    const [draft] = aiWriteAnswers({ ...run(), target, source: 'a', answer: { outcome: 'written', text: 'A.' }, modelText: 'A.', guard: null });
    expect(refusedByDevice(state(draft!), 'keep_mine', { userId: TEST_USER, at: AT })).toEqual({ outcome: 'refused', action: 'keep_mine', final_value: null, settled_by: TEST_USER, settled_at: AT, closed_at: null });
    expect(refusedByDevice(state(draft!), 'text_changed', { userId: TEST_USER, at: AT })).toMatchObject({ action: 'text_changed' });
    expect(refusedByDevice({ ...state(draft!), outcome: 'kept' }, 'keep_mine', { userId: TEST_USER, at: AT })).toBeNull();
  });

  it('a proposal nobody answered closes unanswered at the emission; a user put before "Usar" settles nothing', () => {
    const [draft] = aiWriteAnswers({ ...run(), target, source: 'a', answer: { outcome: 'written', text: 'A.' }, modelText: 'A.', guard: null });
    expect(settleAiAnswers([state(draft!)], [op({ path, value: 'b' })]).size).toBe(0);
    expect(settleAiAnswers([state(draft!)], [emission()]).get(draft!.id)).toMatchObject({ outcome: 'unanswered', action: null });
  });
});

describe('32.1-UNIT-004 a finding, the offline order and closed records', () => {
  function finding() {
    const [draft] = auditAnswers({ ...run(), inputText: 'x', raw: [{ kind: 'conclusion_vs_nc', ref: `sheet:${BLOCK}`, text: 'T.' }], kept: [{ kind: 'conclusion_vs_nc', text: 'T.', ref: `sheet:${BLOCK}`, label: 'Ficha', target: { kind: 'sheet', blockId: BLOCK } }], dropped: [], snapshot: { blocks: [] } });
    return state(draft!);
  }

  it('acted on when the field it names changes before the emission; otherwise unanswered', () => {
    const record = finding();
    const edit = op({ path: blockFieldPath(BLOCK, 'not_tested'), value: null });
    const issued = emission();
    expect(settleAiAnswers([record], [edit, issued]).get(record.id)).toEqual({ outcome: 'changed', action: 'field_changed', final_value: null, settled_by: TEST_USER, settled_at: edit.client_ts, closed_at: issued.client_ts });
    expect(settleAiAnswers([record], [op({ path: blockFieldPath(ids(), 'not_tested'), value: null }), issued]).get(record.id)).toMatchObject({ outcome: 'unanswered' });
  });

  it('an offline device: its ops, older than the server\'s, settle when they arrive, at their own time', () => {
    const { row, record } = plateField();
    const offline = op({ path: row.target_path, value: 'Weg', meta: { source_suggestion_id: row.id }, client_ts: '2026-11-20T08:00:00.000Z' });
    expect(settleAiAnswers([state(record)], [offline]).get(record.id)).toMatchObject({ outcome: 'kept', settled_at: '2026-11-20T08:00:00.000Z' });
  });

  it('a closed record never moves; another relatório\'s ops settle nothing of it', () => {
    const { row, record } = plateField();
    const closed = { ...state(record), outcome: 'unanswered' as const, settled_at: AT, closed_at: AT };
    expect(settleAiAnswers([closed], [op({ path: row.target_path, value: 'X', meta: { source_suggestion_id: row.id } })]).size).toBe(0);
    expect(settleAiAnswers([state(record)], [op({ path: row.target_path, value: 'X', meta: { source_suggestion_id: row.id }, relatorio_id: OTHER_RELATORIO }), emission(OTHER_RELATORIO)]).size).toBe(0);
  });
});

describe('32.1-UNIT-005 values and keys', () => {
  it('compares JSON whatever the key order, reads a prose value\'s text, files a field read under its key', () => {
    expect(sameAnswerValue({ raw: '15', unit: 'kV' }, { unit: 'kV', raw: '15' })).toBe(true);
    expect(sameAnswerValue({ raw: '15', unit: 'kV' }, { raw: '15', unit: 'V' })).toBe(false);
    expect(answerText({ verdict: 'apto', text: 'Apto.' })).toBe('Apto.');
    expect(answerText(null)).toBe('');
    expect(answerItemKey(sheetNameplatePath(BLOCK, 'fabricacao'))).toBe('fabricacao');
    expect(answerItemKey(`sheet/${BLOCK}/test/isolacao/cell/0/1`)).toBe('isolacao:0:1');
    expect(answerItemKey(null)).toBeNull();
  });
});

describe('32.2-UNIT-001 the rubric measures', () => {
  it('a field read: kept is no error; the kinds of error of one changed or discarded', () => {
    expect(fieldReadError({ outcome: 'kept', action: 'confirm', shown: 'WEG', final_value: 'WEG' })).toBeNull();
    expect(fieldReadError({ outcome: 'changed', action: 'edit', shown: null, final_value: '2019' })).toBe('left_empty');
    expect(fieldReadError({ outcome: 'changed', action: 'edit', shown: 'WEG', final_value: '' })).toBe('invented');
    expect(fieldReadError({ outcome: 'refused', action: 'discard', shown: 'WEG', final_value: null })).toBe('invented');
    expect(fieldReadError({ outcome: 'changed', action: 'edit', shown: { raw: '15', unit: 'kV', state: 'measured' }, final_value: { raw: '15', unit: 'V', state: 'measured' } })).toBe('wrong_unit');
    expect(fieldReadError({ outcome: 'changed', action: 'edit', shown: { raw: '15', unit: 'kV', state: 'measured' }, final_value: { raw: '13', unit: 'kV', state: 'measured' } })).toBe('wrong_digit');
    expect(fieldReadError({ outcome: 'changed', action: 'edit', shown: 'WEG', final_value: 'Siemens' })).toBe('other');
    expect(fieldReadError({ outcome: 'unanswered', action: null, shown: 'WEG', final_value: null })).toBeNull();
  });

  it('a text: the share of words changed; the guard refusals by kind', () => {
    expect(wordChangeShare('Contato oxidado.', 'contato oxidado')).toBe(0);
    expect(wordChangeShare('Contato da fase B oxidado.', 'Contato da fase C oxidado.')).toBeCloseTo(1 / 5);
    expect(wordChangeShare('', '')).toBe(0);
    expect(wordChangeShare('a b', '')).toBe(1);
    expect(guardRefusalKinds('guard: added number 3; dropped unit kV')).toEqual(['number', 'unit']);
    expect(guardRefusalKinds('guard: empty text')).toEqual(['empty']);
    expect(guardRefusalKinds('writing_failed: Error')).toEqual([]);
    expect(guardRefusalKinds(null)).toEqual([]);
  });

  it('the report: one line per use, model and prompt version, counts and shares only, each run costed once', () => {
    const row = (over: Partial<AiReportRow>): AiReportRow => ({ use: 'plate', model: 'fake', prompt_version: 'fake-1', run_id: 'r1', run_usd: 0.01, outcome: 'kept', action: 'confirm', shown: 'WEG', final_value: 'WEG', shown_reason: null, ...over });
    const lines = aiQualityReport([
      row({}),
      row({ outcome: 'changed', action: 'edit', shown: { raw: '15', unit: 'kV', state: 'measured' }, final_value: { raw: '13', unit: 'kV', state: 'measured' } }),
      row({ outcome: 'refused', action: 'discard', final_value: null, run_id: 'r2', run_usd: 0.03 }),
      row({ outcome: 'refused', action: 'withheld', shown: null, final_value: null, shown_reason: 'dropped: unknown_token' }),
      row({ outcome: null, action: null, final_value: null }),
      row({ use: 'ai_write', model: 'm', prompt_version: 'p', outcome: 'changed', action: 'edit', shown: 'a b c d', final_value: 'a b c e', run_id: 'w1', run_usd: 0.002 }),
      row({ use: 'ai_write', model: 'm', prompt_version: 'p', outcome: 'refused', action: 'withheld', shown: null, final_value: null, shown_reason: 'guard: added number 3', run_id: 'w2', run_usd: 0.002 }),
    ]);
    expect(lines.map((line) => [line.use, line.answers])).toEqual([
      ['plate', 5],
      ['ai_write', 2],
    ]);
    const plate = lines[0]!;
    expect(plate).toMatchObject({ kept: 1, changed: 1, refused: 1, withheld: 1, unanswered: 0, open: 1, share_kept: 0.2, share_changed: 0.2, refused_by: { discard: 1 }, runs: 2, usd: 0.04, usd_per_kept: 0.04 });
    expect(plate.errors).toEqual({ left_empty: 0, invented: 1, wrong_unit: 0, wrong_digit: 1, other: 0 });
    const write = lines[1]!;
    expect(write).toMatchObject({ changed: 1, withheld: 1, words_changed_mean: 0.25, usd: 0.004, usd_per_kept: null });
    expect(write.guard_refusals).toMatchObject({ number: 1 });
    expect(JSON.stringify(lines)).not.toContain('WEG');
    expect(aiAnswerSeverity(row({ outcome: 'changed', action: 'edit', final_value: '' }))).toBeGreaterThan(aiAnswerSeverity(row({ outcome: 'refused', action: 'discard' })));
    expect(aiAnswerSeverity(row({}))).toBe(0);
  });
});
