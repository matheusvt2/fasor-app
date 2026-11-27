import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { blockingRows, issueBlockedReason, preIssue, serverBlockedRows } from '../relatorio/pre-issue.ts';
import { audioMismatchText } from '../relatorio/measurement-suggestions.ts';
import { evaluateTest } from '../relatorio/readings.ts';
import { relatorioSnapshotSchema, type RelatorioSnapshot } from '../schemas/snapshot.ts';
import { suggestionAudioId, type AudioFileRow, type AudioStatus, type AudioTarget } from '../schemas/entities.ts';
import { blockDefinitionIn, snapshotDefinitionContext } from '../seed/definitions.ts';
import { TEST_RELATORIO } from '../test-support.ts';
import {
  audioForTarget,
  audioMovedStatus,
  audioPlaceText,
  audioSheetStep,
  audioSyncCounts,
  audioSyncLines,
  audioRetryAllowed,
  audioTableReading,
  audioTextInField,
  audioTooLong,
  audioWrittenTarget,
  heldAudioActions,
  heldAudios,
  heldAudiosText,
  isHoldingAudioStatus,
  isTranscribedAudio,
} from './index.ts';

/*
 * Stories 31.5 and 31.6 (AD-30): a spoken reading's parse from a transcriber's written-out numbers, the field a
 * table's speech that was no reading went to, and what a pending or failed audio holds (the ficha, the emission,
 * Sync status's counts). Written red first (batch e31c).
 */

const SECCIONADORA = '019966c1-0000-7000-8000-00000000000c';
const TRAFO = '019966c1-0000-7000-8000-00000000000e';
const GOOD = { level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000, verdict: 'good' as const, reasons: [] };

const small = (): RelatorioSnapshot =>
  relatorioSnapshotSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/porto-seguro/small/snapshot.golden.json', import.meta.url)), 'utf8')));

const id = (n: number) => `019966b0-0031-7000-8000-0000000000${String(n).padStart(2, '0')}`;

function audio(n: number, status: AudioStatus, target: AudioTarget, extra: Partial<AudioFileRow> = {}): Omit<AudioFileRow, 'company_id'> {
  return {
    id: id(n),
    relatorio_id: TEST_RELATORIO,
    kind: 'audio',
    sha256: 'a'.repeat(64),
    mime: 'audio/webm',
    size: 10,
    uploaded_at: null,
    variants: null,
    removed_at: null,
    audio_target: target,
    audio_status: status,
    quality: GOOD,
    transcript_heard: null,
    transcript_written: null,
    transcription_run_id: null,
    ...extra,
  };
}

const OBS: AudioTarget = { type: 'sheet_field', block_id: SECCIONADORA, field: 'observations' };
const ITEM: AudioTarget = { type: 'item', block_id: TRAFO, item_key: 'contatos' };

describe('31.5-UNIT-001 a spoken reading in the words a transcriber writes', () => {
  it('"Fase A, cento e quarenta e sete giga" fills its row with 147 GΩ', () => {
    const snapshot = small();
    const cleared = { ...snapshot, blocks: snapshot.blocks.map((block) => (block.id === SECCIONADORA ? { ...block, sheet: { ...block.sheet, test: {} } } : block)) };
    const block = cleared.blocks.find((row) => row.id === SECCIONADORA)!;
    const definition = blockDefinitionIn(snapshotDefinitionContext(cleared), block)!;
    const table = evaluateTest(block, definition, definition.tests.find((one) => one.key === 'isolacao')!).tables[0]!;
    const row = table.rows.find((one) => table.rows.filter((other) => other.label === one.label).length === 1)!;
    const target = { type: 'table' as const, block_id: SECCIONADORA, test_key: 'isolacao', table_key: table.key };
    expect(audioTableReading(cleared, target, `${row.label}, cento e quarenta e sete giga`)?.value).toEqual({ raw: '147', unit: 'GΩ', state: 'measured' });
    expect(audioTableReading(cleared, target, `${row.label}, mil e duzentos mega`)?.value).toEqual({ raw: '1200', unit: 'MΩ', state: 'measured' });
  });

  it('names its audio and reads "Sugerido: 147 GΩ" beside a typed value', () => {
    expect(suggestionAudioId({ source: { audio_id: id(1) } })).toBe(id(1));
    expect(suggestionAudioId({ source: { photo_id: id(2), bbox: [0, 0, 1, 1], ocr_token_ids: [], reading_run_id: id(3) } })).toBeNull();
    expect(audioMismatchText({ value: { raw: '147', unit: 'GΩ', state: 'measured' } })).toBe('Sugerido: 147 GΩ');
  });
});

describe('31.5-UNIT-002 speech on a table that was no reading', () => {
  const table: AudioTarget = { type: 'table', block_id: SECCIONADORA, test_key: 'isolacao', table_key: 'k' };

  it('was written into its ficha OBSERVAÇÕES, which shows its mark; the table shows the moved line', () => {
    const moved = audio(1, 'done', table, { not_a_reading: true });
    expect(audioWrittenTarget(moved)).toEqual(OBS);
    expect(audioWrittenTarget(audio(2, 'done', table))).toEqual(table);
    expect(audioForTarget([moved], OBS).done?.id).toBe(id(1));
    expect(audioForTarget([moved], table)).toMatchObject({ done: null, moved: { id: id(1) } });
    expect(audioMovedStatus()).toEqual({ step: 'moved', text: 'Não reconheci uma leitura. O texto foi para Observações.' });
  });

  it('a newer spoken reading on the table takes the moved line away', () => {
    expect(audioForTarget([audio(1, 'done', table, { not_a_reading: true }), audio(2, 'done', table)], table).moved).toBeNull();
  });

  it('a field shows its newest failed and dismissed audios apart', () => {
    const shown = audioForTarget([audio(1, 'failed', OBS), audio(3, 'failed', OBS), audio(2, 'dismissed', OBS), audio(4, 'queued', ITEM)], OBS);
    expect([shown.failed?.id, shown.dismissed?.id, shown.pending]).toEqual([id(3), id(2), null]);
  });
});

describe('31.6-UNIT-001 the audios that hold, and their sentence', () => {
  const files = [
    audio(1, 'queued', OBS),
    audio(2, 'transcribing', ITEM),
    audio(3, 'failed', OBS),
    audio(4, 'done', OBS),
    audio(5, 'dismissed', OBS),
    audio(6, 'queued', OBS, { removed_at: '2026-11-26T10:00:00.000Z' }),
    audio(7, 'queued', { type: 'setup', field: 'parecer_text' }),
  ];

  it('queued, transcribing and failed hold; done, dismissed and a removed one do not', () => {
    expect((['queued', 'transcribing', 'failed', 'done', 'dismissed'] as const).map(isHoldingAudioStatus)).toEqual([true, true, true, false, false]);
    expect(heldAudios(files).map((row) => row.id)).toEqual([id(1), id(2), id(3), id(7)]);
    expect(heldAudios(files, { blockId: SECCIONADORA }).map((row) => [row.id, row.status])).toEqual([
      [id(1), 'queued'],
      [id(3), 'failed'],
    ]);
    expect(heldAudios(files)[3]!.blockId).toBeNull();
  });

  it('says the counts, both kinds joined, null when nothing holds', () => {
    expect(heldAudiosText(heldAudios(files, { blockId: SECCIONADORA }))).toBe('1 áudio aguardando transcrição e 1 áudio não transcrito');
    expect(heldAudiosText(heldAudios(files, { blockId: TRAFO }))).toBe('1 áudio aguardando transcrição');
    expect(heldAudiosText([])).toBeNull();
  });

  it('leads to the step its field is on', () => {
    expect(audioSheetStep(ITEM)).toBe('verificacoes');
    expect(audioSheetStep(OBS)).toBe('conclusao');
    expect(audioSheetStep({ type: 'table', block_id: SECCIONADORA, test_key: 'isolacao', table_key: 'k' })).toBe('ensaios');
    expect(audioSheetStep({ type: 'photo_caption', file_id: id(9) })).toBeNull();
  });
});

describe('31.6-UNIT-002 the pre-issue check refuses the issue while an audio holds', () => {
  const withAudios = (rows: ReturnType<typeof audio>[]): RelatorioSnapshot => {
    const snapshot = small();
    return { ...snapshot, files: [...snapshot.files, ...rows] };
  };

  it('a relatório with no audio raises no audio row (the seeds before Epic 31 compute as before)', () => {
    const snapshot = small();
    expect(preIssue(snapshot).filter((row) => row.kind.startsWith('audios_'))).toEqual([]);
    expect(preIssue(withAudios([audio(4, 'done', OBS), audio(5, 'dismissed', OBS)]))).toEqual(preIssue(snapshot));
  });

  it('names the audios on their way and the failed ones, each with its place, both blocking', () => {
    const rows = preIssue(withAudios([audio(1, 'queued', OBS), audio(2, 'transcribing', { type: 'setup', field: 'parecer_text' }), audio(3, 'failed', OBS)]));
    const audioRows = blockingRows(rows).filter((row) => row.kind.startsWith('audios_'));
    expect(audioRows.map((row) => [row.kind, row.text, row.row])).toEqual([
      ['audios_pending', '2 áudios aguardando transcrição', 'section_9'],
      ['audios_failed', '1 áudio não transcrito', 'section_9'],
    ]);
    expect(audioRows[0]!.audios!.map((entry) => [entry.audioId, entry.blockId])).toEqual([
      [id(1), SECCIONADORA],
      [id(2), null],
    ]);
    expect(audioRows[0]!.audios![1]!.place).toBe('Resumo do parecer');
    expect(audioRows[0]!.audios![0]!.place).toMatch(/ · Observações da ficha$/);
  });

  it('the blocked reason asks to wait, or to retry or dismiss', () => {
    const rows = blockingRows(preIssue(withAudios([audio(1, 'queued', OBS), audio(3, 'failed', OBS), audio(8, 'failed', ITEM)]))).filter((row) => row.kind.startsWith('audios_'));
    expect(issueBlockedReason(rows.slice(0, 1), 2, 10)).toBe('Aguarde a transcrição do áudio para emitir a revisão 2. O rascunho pode ser visto antes.');
    expect(issueBlockedReason(rows, 2, 10)).toBe('Aguarde a transcrição do áudio e tente de novo ou dispense os 2 áudios não transcritos para emitir a revisão 2. O rascunho pode ser visto antes.');
  });

  it('a server row this device cannot name still has its text', () => {
    expect(serverBlockedRows(['audios_pending', 'audios_failed'], []).map((row) => row.text)).toEqual(['Áudio aguardando transcrição', 'Áudio não transcrito']);
  });

  it('places a field the relatório no longer holds', () => {
    expect(audioPlaceText(small(), { type: 'point', point_id: id(9), field: 'text' })).toBe('Campo removido');
  });
});

describe('31.6-UNIT-003 Sync status counts the audios', () => {
  it('to send, transcribing (uploaded and queued, or transcribing) and failed, with their sentences', () => {
    const files = [
      audio(1, 'queued', OBS),
      audio(2, 'queued', OBS, { uploaded_at: '2026-11-26T10:00:00.000Z' }),
      audio(3, 'transcribing', OBS),
      audio(4, 'failed', OBS),
      audio(5, 'done', OBS),
      audio(6, 'dismissed', OBS),
    ];
    const counts = audioSyncCounts(files);
    expect(counts).toEqual({ to_upload: 1, transcribing: 2, failed: 1 });
    expect(audioSyncLines(counts).map((line) => line.text)).toEqual(['1 áudio aguardando envio', '2 áudios aguardando transcrição', '1 áudio não transcrito']);
    expect(audioSyncLines(audioSyncCounts([]))).toEqual([]);
  });
});

describe('e31f-UNIT-008 what a not-done audio offers, and the server cap', () => {
  const at = '2026-11-26T12:00:00.000Z';
  it('"Dispensar" on every audio that holds; "Tentar de novo" on a failed one and on a queued one the server holds', () => {
    expect(heldAudioActions({ audio_status: 'queued', uploaded_at: null })).toEqual({ retry: false, dismiss: true });
    expect(heldAudioActions({ audio_status: 'queued', uploaded_at: at })).toEqual({ retry: true, dismiss: true });
    expect(heldAudioActions({ audio_status: 'transcribing', uploaded_at: at })).toEqual({ retry: false, dismiss: true });
    expect(heldAudioActions({ audio_status: 'failed', uploaded_at: at })).toEqual({ retry: true, dismiss: true });
    expect(heldAudioActions({ audio_status: 'done', uploaded_at: at })).toEqual({ retry: false, dismiss: false });
    expect(heldAudioActions({ audio_status: 'dismissed', uploaded_at: at })).toEqual({ retry: false, dismiss: false });
    expect(audioRetryAllowed({ audio_status: 'failed', uploaded_at: null })).toBe(false);
  });

  it('the arrival rule and the server cap are the kernel own', () => {
    expect(isTranscribedAudio({ audio_status: 'done', removed_at: null })).toBe(true);
    expect(isTranscribedAudio({ audio_status: 'done', removed_at: at })).toBe(false);
    expect(isTranscribedAudio({ audio_status: 'failed', removed_at: null })).toBe(false);
    expect(audioTextInField({ audio_target: { type: 'table', block_id: TEST_RELATORIO, test_key: 'x', table_key: 'y' } })).toBe(false);
    expect(audioTextInField({ audio_target: { type: 'table', block_id: TEST_RELATORIO, test_key: 'x', table_key: 'y' }, not_a_reading: true })).toBe(true);
    expect(audioTooLong(190_000)).toBe(false);
    expect(audioTooLong(190_001)).toBe(true);
  });
});
