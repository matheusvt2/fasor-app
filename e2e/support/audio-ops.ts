import { audioReadingSuggestion, fileFieldPath, formatPath, makeOp, SERVER_DEVICE_ID, suggestionPath, type AudioStatus, type AudioTarget, type JsonValue } from '@app/domain';
import { loadConfig } from '../../apps/api/src/config.ts';
import { createDb } from '../../apps/api/src/db/client.ts';
import { asCompanyId } from '../../apps/api/src/db/repositories/company-id.ts';
import { newId } from '../../apps/api/src/ids.ts';
import { applyOps } from '../../apps/api/src/sync/apply.ts';

/*
 * Stories 31.5 and 31.6 (batch e31c): the transcription job's own outcomes, written the way the job writes them
 * (`system:transcription` ops applied as the server, the pattern of `reading-ops.ts`), for the states the fake providers cannot reach from a
 * recording: a spoken reading (the fake hears the same default text in every audio, which is no reading) and a
 * transcription that failed three times. The device pulls them on its next sync. Test-only; every other audio of
 * the specs is recorded and transcribed for real.
 */

const GOOD = { level: 0.2, clipped_share: 0, noise_ratio: 0.1, duration_ms: 4000, speech_ms: 3000, verdict: 'good', reasons: [] };

async function applyBatch(companyId: string, relatorioId: string, ops: { kind: 'create' | 'put'; path: string; value: unknown }[]): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDb(config.DATABASE_URL);
  try {
    const at = new Date();
    const batchId = newId();
    const built = ops.map((op) =>
      makeOp(
        {
          kind: op.kind,
          scope: 'relatorio',
          company_id: companyId,
          project_id: null,
          relatorio_id: relatorioId,
          path: op.path,
          value: op.value as JsonValue,
          prev_op_id: null,
          batch_id: batchId,
          meta: null,
          actor_id: 'system:transcription',
          device_id: SERVER_DEVICE_ID,
        },
        { newId, now: at },
      ),
    );
    const result = await applyOps(db, asCompanyId(companyId), built, { origin: 'server', now: () => at });
    if (result.rejected.length > 0) throw new Error(`audio ops rejected: ${JSON.stringify(result.rejected)}`);
  } finally {
    await sql.end();
  }
}

/** The audio row as a device records it, with a status and, for a server that holds its bytes, an upload time. */
function audioRow(companyId: string, relatorioId: string, id: string, target: AudioTarget, status: AudioStatus, heard: string | null, uploaded: boolean): Record<string, JsonValue> {
  return {
    id,
    company_id: companyId,
    relatorio_id: relatorioId,
    kind: 'audio',
    sha256: 'e'.repeat(64),
    mime: 'audio/webm',
    size: 2048,
    uploaded_at: uploaded ? new Date().toISOString() : null,
    variants: null,
    removed_at: null,
    audio_target: target as unknown as JsonValue,
    audio_status: status,
    quality: GOOD,
    transcript_heard: heard,
    transcript_written: null,
    transcription_run_id: null,
  };
}

/**
 * A reading spoken into a measurement table, transcribed: the audio `done` with the text as heard, and one pending
 * Suggestion per cell it names, sourced by the audio (`audioReadingSuggestion`). Returns the audio's and the
 * suggestions' ids.
 */
export async function pushSpokenReadings(
  companyId: string,
  relatorioId: string,
  target: Extract<AudioTarget, { type: 'table' }>,
  readings: readonly { cellPath: string; raw: string; unit: string }[],
): Promise<{ audioId: string; suggestionIds: string[] }> {
  const audioId = newId();
  const suggestions = readings.map((reading) =>
    audioReadingSuggestion({ id: newId(), relatorioId, audioId, reading: { target_path: reading.cellPath, value: { raw: reading.raw, unit: reading.unit, state: 'measured' } } }),
  );
  await applyBatch(companyId, relatorioId, [
    { kind: 'create', path: `file/${audioId}`, value: audioRow(companyId, relatorioId, audioId, target, 'transcribing', null, true) },
    ...suggestions.map((row) => ({ kind: 'create' as const, path: suggestionPath(row.id), value: row })),
    { kind: 'put', path: formatPath({ family: 'file/server', id: audioId, field: 'transcript_heard' }), value: readings.map((reading) => `${reading.raw} ${reading.unit}`).join(', ') },
    { kind: 'put', path: fileFieldPath(audioId, 'audio_status'), value: 'done' },
  ]);
  return { audioId, suggestionIds: suggestions.map((row) => row.id) };
}

/**
 * An audio whose transcription failed three times, its bytes held by the server (so "Tentar de novo" is accepted);
 * or (`queued`) one recorded on another device whose bytes never reached the server, so no job runs and it stays on
 * its way until `pushAudioStatus` moves it.
 */
export async function pushHeldAudio(companyId: string, relatorioId: string, target: AudioTarget, status: 'queued' | 'failed'): Promise<string> {
  const audioId = newId();
  await applyBatch(companyId, relatorioId, [
    { kind: 'create', path: `file/${audioId}`, value: audioRow(companyId, relatorioId, audioId, target, status === 'failed' ? 'transcribing' : 'queued', null, status === 'failed') },
    ...(status === 'failed' ? [{ kind: 'put' as const, path: fileFieldPath(audioId, 'audio_status'), value: 'failed' }] : []),
  ]);
  return audioId;
}

/** The job moving an audio's status, as `system:transcription`. */
export async function pushAudioStatus(companyId: string, relatorioId: string, audioId: string, status: AudioStatus): Promise<void> {
  await applyBatch(companyId, relatorioId, [{ kind: 'put', path: fileFieldPath(audioId, 'audio_status'), value: status }]);
}
