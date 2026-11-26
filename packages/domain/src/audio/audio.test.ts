import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyOp, entityKey, type EntityState } from '../ops/apply.ts';
import { permissionForPath } from '../permissions/map.ts';
import { relatorioSnapshotSchema, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { entityRowSchemas, fileRowSchema, isPhotoSuggestionSource, suggestionRowSchema, type AudioFileRow, type AudioTarget, type FileRow, type JsonValue } from '../schemas/entities.ts';
import { evaluateTest } from '../relatorio/readings.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import { opFactory, TEST_COMPANY, TEST_RELATORIO } from '../test-support.ts';
import {
  AUDIO_QUALITY_THRESHOLDS,
  appendAudioText,
  audioAutomaticCaptions,
  audioContextText,
  audioPermissionPath,
  audioProseWrite,
  audioQualityVerdict,
  audioReadingSuggestion,
  audioStatusLabel,
  audioTableReading,
  audioWritingContext,
  audioWritingLevel,
  failedAudios,
  failedAudiosText,
  pendingAudios,
  pendingAudiosText,
  writtenTextGuard,
} from './index.ts';

/*
 * Story 31.1 (AD-30): the audio file, its target, status and measures, the Suggestion's audio
 * source, the writing level of a field, the counts, the quality verdict, the guard of a written
 * text and the write of a prose field. Written red first (batch e31a).
 */

const AUDIO = '019966b0-0031-7000-8000-000000000001';
const AUDIO_2 = '019966b0-0031-7000-8000-000000000002';
const BLOCK = '019966b0-0031-7000-8000-000000000003';
const PHOTO = '019966b0-0031-7000-8000-000000000004';
const POINT = '019966b0-0031-7000-8000-000000000005';
const RUN = '019966b0-0031-7000-8000-000000000006';
const SUGGESTION = '019966b0-0031-7000-8000-000000000007';

const GOOD_QUALITY = { level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000, verdict: 'good' as const, reasons: [] };

function audioRow(overrides: Partial<AudioFileRow> = {}): AudioFileRow {
  return {
    id: AUDIO,
    company_id: TEST_COMPANY,
    relatorio_id: TEST_RELATORIO,
    kind: 'audio',
    sha256: 'a'.repeat(64),
    mime: 'audio/webm',
    size: 1024,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    audio_target: { type: 'item', block_id: BLOCK, item_key: 'contatos' },
    audio_status: 'queued',
    quality: GOOD_QUALITY,
    transcript_heard: null,
    transcript_written: null,
    transcription_run_id: null,
    ...overrides,
  };
}

function photoRow(): Record<string, JsonValue> {
  return {
    id: PHOTO,
    company_id: TEST_COMPANY,
    relatorio_id: TEST_RELATORIO,
    kind: 'photo',
    sha256: 'b'.repeat(64),
    mime: 'image/jpeg',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    captured_at: '2026-09-27T10:00:00.000Z',
    tz_offset: -180,
    coords: null,
    local_seq: 1,
    block_id: null,
    item_key: null,
    caption: null,
    reading_kind: null,
    reading_target: null,
    reading_status: 'none',
  };
}

const small = (): RelatorioSnapshot =>
  relatorioSnapshotSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/porto-seguro/small/snapshot.golden.json', import.meta.url)), 'utf8')));

const SECCIONADORA = '019966c1-0000-7000-8000-00000000000c';
const DISJUNTOR = '019966c1-0000-7000-8000-00000000000d';
const TRAFO = '019966c1-0000-7000-8000-00000000000e';

describe('31.1-UNIT-001 an audio file carries its target, status and measures', () => {
  it('parses an audio row of every target type', () => {
    const targets: AudioTarget[] = [
      { type: 'item', block_id: BLOCK, item_key: 'contatos' },
      { type: 'sheet_field', block_id: BLOCK, field: 'observations' },
      { type: 'sheet_field', block_id: BLOCK, field: 'conclusion_text' },
      { type: 'sheet_field', block_id: BLOCK, field: 'not_tested_text' },
      { type: 'test_value', block_id: BLOCK, test_key: 'isolacao', value_key: 'motivo' },
      { type: 'photo_caption', file_id: PHOTO },
      { type: 'point', point_id: POINT, field: 'text' },
      { type: 'setup', field: 'parecer_text' },
      { type: 'setup', field: 'additional_info' },
      { type: 'section', block_id: BLOCK },
      { type: 'table', block_id: BLOCK, test_key: 'isolacao', table_key: 'isolacao' },
    ];
    for (const target of targets) expect(fileRowSchema.parse(audioRow({ audio_target: target })), target.type).toMatchObject({ kind: 'audio', audio_target: target });
  });

  it('refuses an unknown target, status, measure or field, and a target type outside the closed union', () => {
    expect(fileRowSchema.safeParse({ ...audioRow(), audio_target: { type: 'nameplate', block_id: BLOCK, field_key: 'tag' } }).success).toBe(false);
    expect(fileRowSchema.safeParse({ ...audioRow(), audio_target: { type: 'item', block_id: BLOCK, item_key: 'contatos', extra: 1 } }).success).toBe(false);
    expect(fileRowSchema.safeParse({ ...audioRow(), audio_status: 'running' }).success).toBe(false);
    expect(fileRowSchema.safeParse({ ...audioRow(), quality: { ...GOOD_QUALITY, verdict: 'ok' } }).success).toBe(false);
    expect(fileRowSchema.safeParse({ ...audioRow(), quality: { ...GOOD_QUALITY, reasons: ['muffled'] } }).success).toBe(false);
    expect(fileRowSchema.safeParse({ ...audioRow(), reading_status: 'none' }).success).toBe(false);
  });

  it('holds the server transcripts and the run once written', () => {
    const done = audioRow({ audio_status: 'done', transcript_heard: 'contato oxidado', transcript_written: 'Contato oxidado.', transcription_run_id: RUN });
    expect(fileRowSchema.parse(done)).toEqual(done);
  });

  it('a photo or a brand file refuses the audio fields', () => {
    expect(fileRowSchema.safeParse(photoRow()).success).toBe(true);
    for (const [key, value] of Object.entries({ audio_target: { type: 'point', point_id: POINT, field: 'text' }, audio_status: 'queued', quality: GOOD_QUALITY, transcript_heard: 'x', transcript_written: 'x', transcription_run_id: RUN })) {
      expect(fileRowSchema.safeParse({ ...photoRow(), [key]: value }).success, `photo ${key}`).toBe(false);
      expect(fileRowSchema.safeParse({ ...photoRow(), kind: 'logo', [key]: value }).success, `logo ${key}`).toBe(false);
    }
  });
});

describe('31.1-UNIT-002 a Suggestion sourced by an audio', () => {
  const base = { id: SUGGESTION, relatorio_id: TEST_RELATORIO, target_path: `sheet/${BLOCK}/test/isolacao/cell/0/1`, value: { raw: '147', unit: 'GΩ', state: 'measured' }, trust: 'suggested', mode: 'fill', status: 'pending', prompt_version: 'transcription-1', hint: null };

  it('names the audio in place of a photo, with no bbox and no tokens', () => {
    const row = suggestionRowSchema.parse({ ...base, source: { audio_id: AUDIO } });
    expect(row.source).toEqual({ audio_id: AUDIO });
    expect(isPhotoSuggestionSource(row.source)).toBe(false);
    expect(suggestionRowSchema.safeParse({ ...base, source: { audio_id: AUDIO, bbox: [0, 0, 1, 1] } }).success).toBe(false);
    expect(suggestionRowSchema.safeParse({ ...base, source: { audio_id: AUDIO, ocr_token_ids: [] } }).success).toBe(false);
  });

  it('every existing photo-sourced Suggestion still parses to the same bytes', () => {
    const old = { ...base, source: { photo_id: PHOTO, bbox: [0.1, 0.2, 0.3, 0.4], ocr_token_ids: ['t1'], reading_run_id: RUN } };
    const parsed = suggestionRowSchema.parse(old);
    expect(parsed).toEqual(old);
    expect(isPhotoSuggestionSource(parsed.source)).toBe(true);
    // A row written before contract 5 (no `hint`) still parses, defaulted.
    const withoutHint: Record<string, unknown> = { ...old };
    delete withoutHint.hint;
    expect(suggestionRowSchema.parse(withoutHint).hint).toBeNull();
  });
});

describe('31.1-UNIT-003 the writing level of a field', () => {
  it.each<[AudioTarget, 'polish' | 'report' | 'reading']>([
    [{ type: 'photo_caption', file_id: PHOTO }, 'polish'],
    [{ type: 'item', block_id: BLOCK, item_key: 'contatos' }, 'polish'],
    [{ type: 'test_value', block_id: BLOCK, test_key: 'isolacao', value_key: 'motivo' }, 'polish'],
    [{ type: 'sheet_field', block_id: BLOCK, field: 'not_tested_text' }, 'polish'],
    [{ type: 'point', point_id: POINT, field: 'text' }, 'polish'],
    [{ type: 'point', point_id: POINT, field: 'action' }, 'polish'],
    [{ type: 'setup', field: 'additional_info' }, 'polish'],
    [{ type: 'setup', field: 'next_intervention_justification' }, 'polish'],
    [{ type: 'sheet_field', block_id: BLOCK, field: 'observations' }, 'report'],
    [{ type: 'sheet_field', block_id: BLOCK, field: 'conclusion_text' }, 'report'],
    [{ type: 'setup', field: 'parecer_text' }, 'report'],
    [{ type: 'section', block_id: BLOCK }, 'report'],
    [{ type: 'table', block_id: BLOCK, test_key: 'isolacao', table_key: 'isolacao' }, 'reading'],
  ])('%j is %s', (target, level) => {
    expect(audioWritingLevel(target)).toBe(level);
  });
});

describe('31.1-UNIT-004 the pending and failed counts, and their sentences', () => {
  const files: FileRow[] = [
    audioRow({ id: AUDIO, audio_status: 'queued' }),
    audioRow({ id: AUDIO_2, audio_status: 'transcribing', audio_target: { type: 'sheet_field', block_id: TRAFO, field: 'observations' } }),
    audioRow({ id: '019966b0-0031-7000-8000-000000000010', audio_status: 'failed' }),
    audioRow({ id: '019966b0-0031-7000-8000-000000000011', audio_status: 'done' }),
    audioRow({ id: '019966b0-0031-7000-8000-000000000012', audio_status: 'dismissed' }),
    audioRow({ id: '019966b0-0031-7000-8000-000000000013', audio_status: 'queued', removed_at: '2026-09-27T10:00:00.000Z' }),
    fileRowSchema.parse(photoRow()),
  ];

  it('counts queued and transcribing as pending, failed apart, done and dismissed in neither', () => {
    expect(pendingAudios(files)).toBe(2);
    expect(failedAudios(files)).toBe(1);
    expect(pendingAudios([])).toBe(0);
  });

  it('counts one ficha by the block its target names', () => {
    expect(pendingAudios(files, { blockId: BLOCK })).toBe(1);
    expect(pendingAudios(files, { blockId: TRAFO })).toBe(1);
    expect(failedAudios(files, { blockId: TRAFO })).toBe(0);
  });

  it('says the counts with the plural the kernel picks', () => {
    expect(pendingAudiosText(1)).toBe('1 áudio aguardando transcrição');
    expect(pendingAudiosText(2)).toBe('2 áudios aguardando transcrição');
    expect(failedAudiosText(1)).toBe('1 áudio não transcrito');
    expect(failedAudiosText(3)).toBe('3 áudios não transcritos');
  });

  it('names every status', () => {
    expect(['queued', 'transcribing', 'done', 'failed', 'dismissed'].map((s) => audioStatusLabel(s as never))).toEqual([
      'Aguardando envio',
      'Transcrevendo',
      'Transcrito',
      'Falhou',
      'Dispensado',
    ]);
  });
});

describe('31.1-UNIT-005 the quality verdict', () => {
  const T = AUDIO_QUALITY_THRESHOLDS;
  const measures = { level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000 };

  it('is good inside every threshold, and on each boundary', () => {
    expect(audioQualityVerdict(measures)).toEqual({ verdict: 'good' });
    expect(audioQualityVerdict({ level: T.min_level, clipped_share: T.max_clipped_share, noise_ratio: T.max_noise_ratio, duration_ms: T.min_duration_ms, speech_ms: T.min_speech_ms })).toEqual({ verdict: 'good' });
  });

  it.each([
    ['low_level', { level: T.min_level - 0.001 }],
    ['clipping', { clipped_share: T.max_clipped_share + 0.001 }],
    ['noisy', { noise_ratio: T.max_noise_ratio + 0.001 }],
    ['too_short', { duration_ms: T.min_duration_ms - 1 }],
    ['no_speech', { speech_ms: T.min_speech_ms - 1 }],
  ])('is poor for %s just past its threshold', (reason, change) => {
    expect(audioQualityVerdict({ ...measures, ...change })).toEqual({ verdict: 'poor', reasons: [reason] });
  });

  it('lists every reason in one fixed order', () => {
    expect(audioQualityVerdict({ level: 0, clipped_share: 0.5, noise_ratio: 5, duration_ms: 100, speech_ms: 0 })).toEqual({
      verdict: 'poor',
      reasons: ['low_level', 'clipping', 'noisy', 'too_short', 'no_speech'],
    });
  });
});

describe('31.1-UNIT-006 the guard of a written text', () => {
  const context = 'Equipamento: Transformador de força\nTAG: TR-01';

  it('passes a text that keeps every number, unit and TAG and adds none', () => {
    expect(writtenTextGuard('isolação de 147 giga no TR-01', context, 'Isolação de 147 GΩ no TR-01.')).toEqual({ ok: true });
    expect(writtenTextGuard('tensao de 13,8 kV', '', 'Tensão de 13,8 kV.')).toEqual({ ok: true });
    expect(writtenTextGuard('corrente de cento e vinte amperes', '', 'Corrente de 120 A.')).toEqual({ ok: true });
    expect(writtenTextGuard('potencia de 1.500 kVA', '', 'Potência de 1500 kVA.')).toEqual({ ok: true });
    expect(writtenTextGuard('equipamento sem avarias', context, 'Equipamento TR-01 sem avarias.')).toEqual({ ok: true });
    expect(writtenTextGuard('um contato oxidado', '', 'Contato oxidado.')).toEqual({ ok: true });
  });

  it('fails on a number neither source holds', () => {
    expect(writtenTextGuard('isolacao boa', context, 'Isolação de 200 MΩ.')).toEqual({
      ok: false,
      reasons: [
        { kind: 'number', value: '200', problem: 'added' },
        { kind: 'unit', value: 'MΩ', problem: 'added' },
      ],
    });
  });

  it('fails on a number the heard text held and the written text dropped', () => {
    expect(writtenTextGuard('temperatura de 23,4 graus', '', 'Temperatura ambiente adequada.')).toEqual({
      ok: false,
      reasons: [
        { kind: 'number', value: '23.4', problem: 'dropped' },
        { kind: 'unit', value: '°C', problem: 'dropped' },
      ],
    });
  });

  it('fails on a changed number, unit or TAG', () => {
    expect(writtenTextGuard('147 giga', '', '147 MΩ')).toEqual({
      ok: false,
      reasons: [
        { kind: 'unit', value: 'MΩ', problem: 'added' },
        { kind: 'unit', value: 'GΩ', problem: 'dropped' },
      ],
    });
    expect(writtenTextGuard('no TR-02', context, 'No TR-03.')).toEqual({
      ok: false,
      reasons: [
        { kind: 'tag', value: 'TR03', problem: 'added' },
        { kind: 'tag', value: 'TR02', problem: 'dropped' },
      ],
    });
  });

  it('reads pt-BR decimals and thousands as one number', () => {
    expect(writtenTextGuard('3.300 volts', '', '3300 V')).toEqual({ ok: true });
    expect(writtenTextGuard('0,5 por cento', '', '0,5 %')).toEqual({ ok: true });
  });
});

describe('31.1-UNIT-007 the write of a prose field: added after the text already there', () => {
  it('appends a plain text after the value, as a new paragraph, and fills an empty one', () => {
    expect(appendAudioText(null, 'Contato oxidado.')).toBe('Contato oxidado.');
    expect(appendAudioText('   ', 'Contato oxidado.')).toBe('Contato oxidado.');
    expect(appendAudioText('Pintura gasta.', 'Contato oxidado.')).toBe('Pintura gasta.\n\nContato oxidado.');
  });

  it('appends a rich-text paragraph to a section text', () => {
    expect(appendAudioText('Texto do **item**.\n- um\n- dois', 'Nova frase *com* asterisco.', { rich: true })).toBe('Texto do **item**.\n- um\n- dois\n\nNova frase \\*com\\* asterisco.');
  });

  it('writes the put the target takes, naming the audio', () => {
    const snapshot = small();
    const write = audioProseWrite(snapshot, { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' }, 'Contato oxidado.', { now: new Date('2026-09-27T12:00:00Z'), registry: [] });
    expect(write).toEqual({ puts: [{ path: `sheet/${SECCIONADORA}/checklist/contatos/observation`, value: 'Contato oxidado.' }] });
  });

  it('adds to the composed conclusion text when none was confirmed, marking it edited', () => {
    const snapshot = small();
    const write = audioProseWrite(snapshot, { type: 'sheet_field', block_id: SECCIONADORA, field: 'conclusion_text' }, 'Sem anomalias.', { now: new Date('2026-09-27T12:00:00Z'), registry: [] });
    expect(write).not.toBeNull();
    const [text, status, basis] = write!.puts;
    expect(text!.path).toBe(`sheet/${SECCIONADORA}/conclusion/text`);
    expect(String(text!.value)).toMatch(/\n\nSem anomalias\.$/);
    expect(String(text!.value).length).toBeGreaterThan('\n\nSem anomalias.'.length);
    expect(status).toEqual({ path: `sheet/${SECCIONADORA}/conclusion/text_status`, value: 'edited' });
    expect(basis!.path).toBe(`sheet/${SECCIONADORA}/conclusion/text_basis`);
  });

  it('replaces a photo caption still equal to its automatic caption, and appends to a typed one', () => {
    const snapshot = small();
    const opts = { now: new Date('2026-09-27T12:00:00Z'), registry: [] };
    const photo = { ...photoRow(), block_id: SECCIONADORA, caption: null } as Record<string, unknown>;
    delete photo.company_id;
    const auto = audioProseWrite({ ...snapshot, files: [photo as never] }, { type: 'photo_caption', file_id: PHOTO }, 'Detalhe do contato.', opts);
    expect(auto).toEqual({ puts: [{ path: `file/${PHOTO}/caption`, value: 'Detalhe do contato.' }] });
    // The automatic caption the kernel composes for the photo of the seccionadora, at any step.
    const composed = audioAutomaticCaptions({ ...snapshot, files: [photo as never] }, PHOTO, []);
    expect(composed.length).toBeGreaterThan(0);
    const replaced = audioProseWrite({ ...snapshot, files: [{ ...photo, caption: composed[0] } as never] }, { type: 'photo_caption', file_id: PHOTO }, 'Detalhe do contato.', opts);
    expect(replaced).toEqual({ puts: [{ path: `file/${PHOTO}/caption`, value: 'Detalhe do contato.' }] });
    const typed = audioProseWrite({ ...snapshot, files: [{ ...photo, caption: 'Vista geral' } as never] }, { type: 'photo_caption', file_id: PHOTO }, 'Detalhe do contato.', opts);
    expect(typed).toEqual({ puts: [{ path: `file/${PHOTO}/caption`, value: 'Vista geral\n\nDetalhe do contato.' }] });
  });

  it('answers null when the target is gone', () => {
    const snapshot = small();
    const opts = { now: new Date('2026-09-27T12:00:00Z'), registry: [] };
    expect(audioProseWrite(snapshot, { type: 'item', block_id: BLOCK, item_key: 'contatos' }, 'x', opts)).toBeNull();
    expect(audioProseWrite(snapshot, { type: 'point', point_id: POINT, field: 'text' }, 'x', opts)).toBeNull();
    // The parecer summary needs a verdict tapped first.
    expect(audioProseWrite(snapshot, { type: 'setup', field: 'parecer_text' }, 'x', opts)).toBeNull();
    // A sheet not marked Não ensaiado has no note to add to.
    expect(audioProseWrite(snapshot, { type: 'sheet_field', block_id: SECCIONADORA, field: 'not_tested_text' }, 'x', opts)).toBeNull();
  });
});

describe('31.1-UNIT-008 the prompt context the kernel assembles from the snapshot', () => {
  it('names the field, the equipment type and its TAG, and for a checklist item the item and its answer', () => {
    const context = audioWritingContext(small(), { type: 'item', block_id: SECCIONADORA, item_key: 'contatos' })!;
    expect(context).toMatchObject({ field: 'Observação do item', equipment_type: 'Chave seccionadora', tag: 'SEC-TEST', item: { label: expect.any(String), answer: 'C' } });
    const text = audioContextText(context);
    expect(text).toContain('SEC-TEST');
    expect(text).toContain('Chave seccionadora');
  });

  it('for a ficha conclusion, the picked result, the NC items and the readings outside their criterion', () => {
    const context = audioWritingContext(small(), { type: 'sheet_field', block_id: SECCIONADORA, field: 'conclusion_text' })!;
    expect(context.conclusion).toMatchObject({ result: 'aprovado', restriction: 'sem_restricoes', nc_items: [], readings_out: expect.any(Array) });
  });

  it('for the parecer, the relatório counts and restrictions', () => {
    const context = audioWritingContext(small(), { type: 'setup', field: 'parecer_text' })!;
    expect(context.parecer).toMatchObject({ total: 3, not_tested: 1 });
    expect(context.equipment_type).toBeNull();
  });

  it('is null for a target the relatório does not hold', () => {
    expect(audioWritingContext(small(), { type: 'item', block_id: BLOCK, item_key: 'contatos' })).toBeNull();
    expect(audioWritingContext(small(), { type: 'sheet_field', block_id: DISJUNTOR, field: 'observations' })).not.toBeNull();
  });
});

describe('31.1-UNIT-009 the fold of an audio, and the key its create needs', () => {
  const f = opFactory();
  const create = () => f.op({ kind: 'create', path: `file/${AUDIO}`, value: audioRow() });

  it('creates the row and takes a dismiss put; a photo ignores an audio_status put', () => {
    let state: EntityState = applyOp(new Map(), create());
    state = applyOp(state, f.op({ path: `file/${AUDIO}/audio_status`, value: 'dismissed' }));
    expect((state.get(entityKey('file', AUDIO)) as AudioFileRow).audio_status).toBe('dismissed');
    const photoState = applyOp(new Map(), f.op({ kind: 'create', path: `file/${PHOTO}`, value: photoRow() }));
    const after = applyOp(photoState, f.op({ path: `file/${PHOTO}/audio_status`, value: 'dismissed' }));
    expect(after.get(entityKey('file', PHOTO))).toBe(photoState.get(entityKey('file', PHOTO)));
  });

  it('the server writes the transcripts and the run on the audio row', () => {
    let state: EntityState = applyOp(new Map(), create());
    for (const [field, value] of [
      ['audio_status', 'done'],
      ['transcript_heard', 'contato oxidado'],
      ['transcript_written', 'Contato oxidado.'],
      ['transcription_run_id', RUN],
      ['not_a_reading', true],
    ] as const) {
      state = applyOp(state, f.op({ path: `file/${AUDIO}/${field}`, value, actor_id: 'system:transcription', device_id: 'server' }));
    }
    expect(entityRowSchemas.file.parse(state.get(entityKey('file', AUDIO)))).toMatchObject({ audio_status: 'done', transcript_written: 'Contato oxidado.', transcription_run_id: RUN, not_a_reading: true });
  });

  it('an audio create needs the key of the field it targets', () => {
    expect(permissionForPath(`file/${AUDIO}`, { kind: 'create', value: audioRow() })).toBe('relatorio.fill');
    expect(permissionForPath(`file/${AUDIO}`, { kind: 'create', value: audioRow({ audio_target: { type: 'setup', field: 'additional_info' } }) })).toBe('relatorio.create');
    expect(permissionForPath(`file/${PHOTO}`, { kind: 'create', value: photoRow() })).toBe('relatorio.fill');
    expect(audioPermissionPath({ type: 'table', block_id: BLOCK, test_key: 'isolacao', table_key: 'isolacao' })).toBe(`sheet/${BLOCK}/test/isolacao/cell/0/0`);
  });
});

describe('31.1-UNIT-011 a reading spoken into a measurement table', () => {
  /** The small fixture with the seccionadora's readings cleared, so every capture cell is empty. */
  const cleared = (): RelatorioSnapshot => {
    const snapshot = small();
    return { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === SECCIONADORA ? { ...block, sheet: { ...block.sheet, test: {} } } : block)) };
  };

  it('parses a reading naming its row into the cell it fills, and a suggestion sourced by the audio', () => {
    const snapshot = cleared();
    const block = snapshot.blocks.find((row) => row.id === SECCIONADORA)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
    const test = definition.tests.find((one) => one.key === 'isolacao')!;
    const table = evaluateTest(block, definition, test).tables[0]!;
    const row = table.rows.find((one) => table.rows.filter((other) => other.label === one.label).length === 1)!;
    const target = { type: 'table' as const, block_id: SECCIONADORA, test_key: 'isolacao', table_key: table.key };
    const reading = audioTableReading(snapshot, target, `${row.label}, 147 giga`);
    expect(reading).not.toBeNull();
    expect(reading!.target_path).toMatch(new RegExp(`^sheet/${SECCIONADORA}/test/isolacao/cell/\\d+/\\d+$`));
    expect(reading!.value).toEqual({ raw: '147', unit: 'GΩ', state: 'measured' });
    const suggestion = audioReadingSuggestion({ id: SUGGESTION, relatorioId: TEST_RELATORIO, audioId: AUDIO, reading: reading! });
    expect(suggestion).toMatchObject({ status: 'pending', trust: 'suggested', mode: 'fill', source: { audio_id: AUDIO }, target_path: reading!.target_path });
  });

  it('is null for speech that is no reading, an unknown table or a sheet the relatório lacks', () => {
    const snapshot = cleared();
    const target = { type: 'table' as const, block_id: SECCIONADORA, test_key: 'isolacao', table_key: 'nenhuma' };
    expect(audioTableReading(snapshot, target, 'Fase A, 147 giga')).toBeNull();
    const block = snapshot.blocks.find((row) => row.id === SECCIONADORA)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(snapshot), block)!;
    const table = evaluateTest(block, definition, definition.tests.find((one) => one.key === 'isolacao')!).tables[0]!;
    expect(audioTableReading(snapshot, { ...target, table_key: table.key }, 'o isolador estava sujo')).toBeNull();
    expect(audioTableReading(snapshot, { ...target, block_id: BLOCK, table_key: table.key }, 'Fase A, 147 giga')).toBeNull();
  });
});

describe('31.1-UNIT-010 an op from a bundle at contract 61 still folds', () => {
  it('a photo create and a photo-sourced suggestion fold as before', () => {
    const f = opFactory();
    let state: EntityState = applyOp(new Map(), f.op({ kind: 'create', path: `file/${PHOTO}`, value: photoRow() }));
    state = applyOp(state, f.op({ path: `file/${PHOTO}/caption`, value: 'Vista geral' }));
    state = applyOp(
      state,
      f.op({
        kind: 'create',
        path: `suggestion/${SUGGESTION}`,
        value: { id: SUGGESTION, relatorio_id: TEST_RELATORIO, target_path: `file/${PHOTO}/caption`, value: 'x', trust: 'suggested', mode: 'fill', source: { photo_id: PHOTO, bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: RUN }, status: 'pending', prompt_version: 'p', hint: null },
        actor_id: 'system:reading',
        device_id: 'server',
      }),
    );
    expect(state.get(entityKey('file', PHOTO))).toMatchObject({ caption: 'Vista geral' });
    expect(state.get(entityKey('suggestion', SUGGESTION))).toMatchObject({ source: { photo_id: PHOTO } });
  });
});
