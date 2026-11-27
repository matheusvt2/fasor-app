import { buffer } from 'node:stream/consumers';
import {
  audioAnswers,
  audioContextText,
  audioFileRowSchema,
  audioPermissionPath,
  audioProseWrite,
  audioReadingSuggestion,
  audioTableReading,
  audioTooLong,
  audioWritingContext,
  audioWritingLevel,
  can,
  dictatedText,
  fileFieldPath,
  formatPath,
  objectKey,
  opValueIssue,
  permissionForPath,
  registryRowSchema,
  safeParsePath,
  suggestionPath,
  TEXT_CAPS,
  toIso,
  writtenTextGuard,
  type AudioFileRow,
  type AudioStatus,
  type AudioTarget,
  type Clock,
  type GuardReason,
  type JsonValue,
  type NewId,
  type RegistryRow,
  type SpeechProvider,
  type SpeechResult,
  type SuggestionRow,
  type WritingProvider,
  type WritingResult,
} from '@app/domain';
import type { S3Client } from '@aws-sdk/client-s3';
import { and, eq, sql } from 'drizzle-orm';
import { recordAiAnswers } from '../../ai/answers.ts';
import { AiFeaturesOffError, billedCallOf, isPermanentReadingError, PermanentReadingError } from '../../ai/errors.ts';
import type { Db } from '../../db/client.ts';
import { asCompanyId, type CompanyId } from '../../db/repositories/company-id.ts';
import { roleOfUser } from '../../db/roles.ts';
import { entities, ops, transcriptionRuns } from '../../db/schema.ts';
import { log, logError } from '../../log.ts';
import { getObject } from '../../storage/s3.ts';
import { applyServerBatch, ServerBatchRejectedError, type Tx } from '../../sync/apply.ts';
import { toSnapshot } from '../../sync/snapshot.ts';
import { entityRecord } from '../reading/kinds/shared.ts';
import type { TranscriptionPayload } from './payload.ts';
import { storedAudioStatus, transcriptionServerOp, writeAudioStatus } from './status.ts';

/*
 * Story 31.2 (AD-30): one attempt of a transcription job. It loads the audio and its relatório
 * (every lookup scoped by the payload's company, AD-10), reads the audio's bytes from the bucket,
 * hears them (`SpeechProvider`), and then, by the kernel's writing level of the target:
 *
 * - a prose field (`polish`, `report`): the writing step (`WritingProvider`) gets the text as heard,
 *   the level and the context the kernel assembled from the relatório's own snapshot; the kernel's
 *   guard (`writtenTextGuard`) judges its text. A failed guard, or a writing call that fails for good
 *   (permanently, or transiently on the last attempt), gives the field the text as heard and the run
 *   row says why. The field is written by the kernel's rule (`audioProseWrite`: added after its
 *   value, a still automatic caption replaced), each put naming the audio (`meta.source_audio_id`);
 * - a measurement table (`reading`): the kernel parses the text (`audioTableReading`); a reading is
 *   one pending Suggestion on its cell sourced by the audio, nothing written to the cell; speech that
 *   is no reading goes to the ficha's OBSERVAÇÕES as a `report` prose write, and the audio records
 *   `not_a_reading`.
 *
 * The writes, the transcripts, the run id and `audio_status = done` are one all-or-nothing server
 * batch under the company lock, committed with the run's `ok` row; it writes nothing when the audio
 * was dismissed or already transcribed meanwhile. Every attempt leaves one `transcription_runs` row.
 * A transient failure before the last attempt rethrows for pg-boss to retry; the last attempt and a
 * permanent failure write `failed` (from a runnable status) and return.
 *
 * e31f (review of Epic 31): the field's puts are built inside that batch's transaction from a fresh
 * read of the field (`compose`), never from the snapshot read before the model call. The text as
 * heard is stored as soon as it is heard, and an attempt that finds it stored does not call the
 * speech provider again. An audio past the server's cap (`audioTooLong`, by its quality's duration
 * before speech and by the provider's own duration after) fails with a `too_long` reason.
 *
 * Permissions (AD-29): the push route refuses an audio create whose actor lacks the key of the field
 * it targets (`permissionForPath` of the `file` create). The job writes as `system:transcription`
 * but does not bypass that: it reads the role of the audio's creator again and fails the audio
 * permanently when the role no longer holds the key (the reading job checks nothing at run time;
 * this one does, since it writes into a field and not only a suggestion).
 */

export interface TranscriptionJobDeps {
  db: Db;
  s3: S3Client;
  bucket: string;
  now: Clock;
  newId: NewId;
  speech: SpeechProvider;
  writing: WritingProvider;
  /** The writing provider's name for the run row (`fake`, `bedrock`, `off`); absent, `fake`. */
  writingName?: string;
  /** `false` when `AI_FEATURES=off`: a queued job fails permanently before any provider. Absent reads as on. */
  aiFeatures?: boolean;
}

export interface TranscriptionAttempt {
  /** The pg-boss job id. */
  jobId: string;
  /** 1-based. */
  attempt: number;
  /** True on the attempt after which pg-boss retries no more. */
  lastAttempt: boolean;
}

/** The statuses a job writes its outcome from: a job picked up before `transcribing` landed sees `queued` (or `failed` on a retranscribe). */
const RUNNABLE: readonly AudioStatus[] = ['queued', 'transcribing', 'failed'];

/** The audio was dismissed, transcribed already or removed meanwhile: the run ends writing nothing. */
class SkippedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SkippedError';
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function guardText(reasons: readonly GuardReason[]): string {
  return reasons.map((reason) => `${reason.problem} ${reason.kind} ${reason.value}`).join('; ');
}

/** What one attempt learned, for its run row whatever the outcome. */
interface RunFacts {
  relatorioId: string | null;
  audioFound: boolean;
  level: string | null;
  speech: SpeechResult | null;
  writing: WritingResult | null;
  /** A writing call billed before it failed (its usage still counts). */
  billed: { model: string; prompt_version: string | null; usage: { input_tokens: number; output_tokens: number; usd: number } } | null;
  guard: 'passed' | 'failed' | null;
  fallback: string | null;
  notAReading: boolean;
  committed: boolean;
  /** e31f: the text as heard came from an earlier attempt (`transcript_heard` stored), so no speech was paid. */
  speechReused: boolean;
}

/**
 * e31f: stores the text as heard as soon as it is heard (`system:transcription`, while the audio is
 * still runnable), so a later attempt after a transient failure of the writing step reuses it
 * instead of paying for speech again. A failure here is logged and the attempt goes on.
 */
async function storeHeard(deps: TranscriptionJobDeps, companyId: CompanyId, audio: { id: string; relatorioId: string }, heard: string): Promise<void> {
  const op = transcriptionServerOp({
    companyId,
    relatorioId: audio.relatorioId,
    kind: 'put',
    path: formatPath({ family: 'file/server', id: audio.id, field: 'transcript_heard' }),
    value: heard,
    batchId: null,
    now: deps.now,
    newId: deps.newId,
  });
  try {
    await applyServerBatch(deps.db, companyId, [op], {
      now: deps.now,
      before: async (tx) => {
        const status = await storedAudioStatus(tx, companyId, audio.id);
        if (status === null || !RUNNABLE.includes(status)) throw new SkippedError(`the audio became ${status ?? 'absent'}`);
      },
    });
  } catch (error) {
    if (error instanceof SkippedError) throw error;
    logError('transcript heard not stored ahead', { company_id: companyId, audio_id: audio.id, error: errorText(error) });
  }
}

/** The company's `local` and `atividade` registry rows: the words an automatic caption agrees with. */
async function captionWords(db: Db, companyId: CompanyId): Promise<RegistryRow[]> {
  const records = await db
    .select({ row: entities.row })
    .from(entities)
    .where(and(eq(entities.company_id, companyId), eq(entities.entity, 'registry'), sql`${entities.row}->>'kind' in ('local', 'atividade')`));
  const rows: RegistryRow[] = [];
  for (const record of records) {
    const parsed = registryRowSchema.safeParse(record.row);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

/** The actor of the audio's create op, read from the company's log. */
async function creatorOf(db: Db, companyId: CompanyId, audioId: string): Promise<string | null> {
  const [created] = await db
    .select({ actor_id: ops.actor_id })
    .from(ops)
    .where(and(eq(ops.company_id, companyId), eq(ops.path, `file/${audioId}`), eq(ops.kind, 'create')))
    .limit(1);
  return created?.actor_id ?? null;
}

/** Fails permanently when the audio's creator no longer holds the key of the field it targets. */
async function assertCreatorMayWrite(db: Db, companyId: CompanyId, audio: AudioFileRow): Promise<void> {
  const need = permissionForPath(audioPermissionPath(audio.audio_target), { kind: 'put', value: null });
  if (need === 'none') return;
  const actor = await creatorOf(db, companyId, audio.id);
  if (actor === null) throw new PermanentReadingError('the audio has no create op');
  const { role } = await roleOfUser(db, companyId, actor);
  if (!can(role, need)) throw new PermanentReadingError(`the audio's creator no longer holds ${need}`);
}

export async function runTranscriptionJob(deps: TranscriptionJobDeps, payload: TranscriptionPayload, attempt: TranscriptionAttempt): Promise<void> {
  const companyId = asCompanyId(payload.company_id);
  const startedAt = deps.now().getTime();
  const runId = deps.newId();
  const facts: RunFacts = { relatorioId: null, audioFound: false, level: null, speech: null, writing: null, billed: null, guard: null, fallback: null, notAReading: false, committed: false, speechReused: false };
  const logFields = () => ({ company_id: payload.company_id, relatorio_id: facts.relatorioId, job_id: attempt.jobId, audio_id: payload.audio_id, run_id: runId, attempt: attempt.attempt });

  async function recordRun(outcome: 'ok' | 'error', error: string | null, executor: Db | Tx = deps.db): Promise<void> {
    const usage = facts.writing?.usage ?? facts.billed?.usage ?? null;
    const speechUsd = facts.speech?.usd ?? 0;
    await executor.insert(transcriptionRuns).values({
      id: runId,
      company_id: companyId,
      audio_id: payload.audio_id,
      relatorio_id: facts.relatorioId,
      job_id: attempt.jobId,
      attempt: attempt.attempt,
      outcome,
      error,
      level: facts.level,
      speech_provider: deps.speech.name,
      speech_model: facts.speech?.model ?? null,
      writing_provider: facts.writing !== null || facts.billed !== null || facts.fallback !== null ? (deps.writingName ?? 'fake') : null,
      model: facts.writing?.model ?? facts.billed?.model ?? null,
      prompt_version: facts.writing?.prompt_version ?? facts.billed?.prompt_version ?? null,
      audio_seconds: facts.speech?.audio_seconds ?? null,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      usd: facts.speech === null && usage === null ? null : Math.round((speechUsd + (usage?.usd ?? 0)) * 1e6) / 1e6,
      duration_ms: Math.max(0, deps.now().getTime() - startedAt),
      guard_outcome: facts.guard,
      fallback_reason: facts.fallback,
      not_a_reading: facts.notAReading,
      created_at: toIso(deps.now()),
    });
  }

  try {
    const record = await entityRecord(deps.db, companyId, 'file', payload.audio_id);
    if (record === null) throw new PermanentReadingError('the audio does not exist');
    const parsed = audioFileRowSchema.safeParse(record.row);
    if (!parsed.success || parsed.data.id !== payload.audio_id) throw new PermanentReadingError('the file is not an audio row');
    const audio = parsed.data;
    facts.relatorioId = record.relatorio_id;
    facts.audioFound = true;
    if (record.removed_at !== null || audio.removed_at !== null) throw new SkippedError('the audio was removed');
    if (!RUNNABLE.includes(audio.audio_status)) throw new SkippedError(`the audio is ${audio.audio_status}`);
    if (deps.aiFeatures === false) throw new AiFeaturesOffError();
    const relatorioId = record.relatorio_id;
    if (relatorioId === null) throw new PermanentReadingError('the audio has no relatorio');
    const relatorio = await entityRecord(deps.db, companyId, 'relatorio', relatorioId);
    if (relatorio === null || relatorio.removed_at !== null) throw new PermanentReadingError('the relatorio is missing or removed');
    await assertCreatorMayWrite(deps.db, companyId, audio);
    facts.level = audioWritingLevel(audio.audio_target);
    if (audio.uploaded_at === null) throw new PermanentReadingError('the audio has not been uploaded');

    let heard: string;
    if (audio.transcript_heard !== null) {
      // e31f: an earlier attempt heard it already (and stored the text as heard); speech is not paid twice.
      heard = audio.transcript_heard.trim();
      facts.speechReused = true;
    } else {
      // e31f: the server's own length cap; a longer audio is never sent to the speech provider.
      if (audioTooLong(audio.quality.duration_ms)) throw new PermanentReadingError(`too_long: the audio lasts ${audio.quality.duration_ms} ms`);
      const key = objectKey(companyId, 'audio', audio.id, 'original', relatorioId);
      const stored = await getObject(deps.s3, deps.bucket, key);
      if (stored === null) throw new PermanentReadingError('the audio object is missing');
      const bytes = new Uint8Array(await buffer(stored.body));
      const speech = await deps.speech.transcribe({ bytes, mime: audio.mime, sha256: audio.sha256, key });
      facts.speech = speech;
      // The provider's own duration, where it reports one: a longer audio is not written.
      if (audioTooLong(speech.audio_seconds * 1000)) throw new PermanentReadingError(`too_long: the provider heard ${speech.audio_seconds} s`);
      heard = speech.text.trim();
      // Security pass 2026-11-26 (A3): a server op skips the push route's value caps, so the job holds its own text to them.
      if (heard.length > TEXT_CAPS.long) throw new PermanentReadingError(`text_too_long: the text as heard has ${heard.length} characters`);
      await storeHeard(deps, companyId, { id: audio.id, relatorioId }, heard);
    }

    // Only the audio's own company and relatório are read for the prompt (AD-30).
    const snapshot = await toSnapshot(deps.db, companyId, relatorioId);
    const registry = await captionWords(deps.db, companyId);
    const options = { now: deps.now(), registry };

    let target: AudioTarget = audio.audio_target;
    let suggestion: SuggestionRow | null = null;
    if (target.type === 'table') {
      const reading = audioTableReading(snapshot, target, heard);
      if (reading !== null) suggestion = audioReadingSuggestion({ id: deps.newId(), relatorioId, audioId: audio.id, reading });
      else {
        // No reading on that table: the speech is prose for the ficha's OBSERVAÇÕES.
        facts.notAReading = true;
        target = { type: 'sheet_field', block_id: target.block_id, field: 'observations' };
      }
    }

    // The text the field receives (written, or as heard), its target and level; null when nothing is written.
    let fieldText: string | null = null;
    let written: string | null = null;
    if (suggestion === null && heard !== '') {
      const level = audioWritingLevel(target);
      if (level === 'reading') throw new PermanentReadingError('a table target reached the writing step');
      const context = audioWritingContext(snapshot, target);
      if (context === null) throw new PermanentReadingError('the target field is no longer in the relatorio');
      let text = dictatedText(heard);
      try {
        const result = await deps.writing.write({ text: heard, level, context });
        facts.writing = result;
        const verdict = writtenTextGuard(heard, audioContextText(context), result.text);
        if (verdict.ok && result.text.trim() !== '') {
          facts.guard = 'passed';
          text = result.text.trim();
          written = text;
        } else {
          facts.guard = 'failed';
          facts.fallback = verdict.ok ? 'guard: empty text' : `guard: ${guardText(verdict.reasons)}`;
        }
      } catch (error) {
        // A transient failure before the last attempt is retried whole; anything else gives the field the text as heard.
        if (!isPermanentReadingError(error) && !attempt.lastAttempt) throw error;
        facts.billed = billedCallOf(error);
        facts.fallback = `writing_failed: ${errorText(error)}`;
      }
      // The field must still be there; its write is built again under the lock below.
      if (audioProseWrite(snapshot, target, text, options) === null) throw new PermanentReadingError('the target field is no longer in the relatorio');
      fieldText = text;
    }
    if (heard === '') facts.fallback = 'no_speech';

    const batchId = deps.newId();
    const op = (kind: 'create' | 'put', path: string, value: unknown, meta?: { source_audio_id: string }) =>
      transcriptionServerOp({ companyId, relatorioId, kind, path, value, batchId, now: deps.now, newId: deps.newId, ...(meta === undefined ? {} : { meta }) });
    let puts = 0;
    try {
      await applyServerBatch(deps.db, companyId, [], {
        now: deps.now,
        before: async (tx) => {
          const status = await storedAudioStatus(tx, companyId, audio.id);
          if (status === null || !RUNNABLE.includes(status)) throw new SkippedError(`the audio became ${status ?? 'absent'}`);
          await recordRun('ok', null, tx);
        },
        // e31f: the field's write is rebuilt from the field as it is now, under the company lock, so
        // a text typed while the audio was "Transcrevendo" is kept, and a parecer verdict, a Não
        // ensaiado mark or a section's config changed meanwhile is never reverted (`audioProseWrite`
        // spreads the current object and changes only its text).
        compose: async (tx) => {
          let fieldPuts: { path: string; value: JsonValue }[] = [];
          if (fieldText !== null) {
            const write = audioProseWrite(await toSnapshot(tx, companyId, relatorioId), target, fieldText, options);
            if (write === null) throw new PermanentReadingError('the target field is no longer in the relatorio');
            fieldPuts = write.puts;
            // Security pass 2026-11-26 (A3): the field's own cap, as the push route holds a typed text to it
            // (`opValueIssue`, Story 20.9). A text that does not fit is not written and the audio fails;
            // nothing is cut. The text as heard stays stored on the audio.
            for (const put of fieldPuts) {
              const path = safeParsePath(put.path);
              const issue = path === null ? null : opValueIssue(op('put', put.path, put.value), path);
              if (issue !== null) throw new PermanentReadingError(`text_too_long: ${issue}`);
            }
          }
          puts = fieldPuts.length;
          // Story 32.1: the reading spoken and the text written, recorded with the run row (`before` above).
          const usage = facts.writing?.usage ?? facts.billed?.usage ?? null;
          await recordAiAnswers(
            tx,
            audioAnswers({
              companyId,
              relatorioId,
              runId,
              audioId: audio.id,
              target,
              heard,
              written: facts.writing?.text ?? null,
              puts: fieldPuts,
              fallback: facts.fallback,
              notAReading: facts.notAReading,
              suggestion,
              model: facts.writing?.model ?? facts.billed?.model ?? facts.speech?.model ?? null,
              promptVersion: facts.writing?.prompt_version ?? facts.billed?.prompt_version ?? null,
              usd: facts.speech === null && usage === null ? null : Math.round(((facts.speech?.usd ?? 0) + (usage?.usd ?? 0)) * 1e6) / 1e6,
              at: toIso(deps.now()),
              newId: deps.newId,
            }),
          );
          return [
            ...(suggestion === null ? [] : [op('create', suggestionPath(suggestion.id), suggestion)]),
            ...fieldPuts.map((put) => op('put', put.path, put.value, { source_audio_id: audio.id })),
            op('put', formatPath({ family: 'file/server', id: audio.id, field: 'transcript_heard' }), heard),
            op('put', formatPath({ family: 'file/server', id: audio.id, field: 'transcript_written' }), written),
            op('put', formatPath({ family: 'file/server', id: audio.id, field: 'transcription_run_id' }), runId),
            ...(facts.notAReading ? [op('put', formatPath({ family: 'file/server', id: audio.id, field: 'not_a_reading' }), true)] : []),
            op('put', fileFieldPath(audio.id, 'audio_status'), 'done' satisfies AudioStatus),
          ];
        },
      });
    } catch (error) {
      if (error instanceof ServerBatchRejectedError) throw new PermanentReadingError(`the transcription batch was refused: ${error.message}`, { cause: error });
      throw error;
    }
    facts.committed = true;
    log('transcription done', { ...logFields(), writing_level: facts.level, suggestion: suggestion !== null, puts, guard: facts.guard, fallback: facts.fallback, not_a_reading: facts.notAReading, speech_reused: facts.speechReused });
  } catch (error) {
    if (facts.committed) {
      logError('transcription done, logging failed', { ...logFields(), error: errorText(error) });
      return;
    }
    if (error instanceof SkippedError) {
      try {
        await recordRun('error', `skipped: ${error.message}`);
      } catch (recordError) {
        logError('transcription run row not written', { ...logFields(), error: errorText(recordError) });
      }
      log('transcription skipped', { ...logFields(), reason: error.message });
      return;
    }
    const permanent = isPermanentReadingError(error);
    try {
      await recordRun('error', errorText(error));
    } catch (recordError) {
      logError('transcription run row not written', { ...logFields(), error: errorText(recordError) });
    }
    logError('transcription attempt failed', { ...logFields(), permanent, last_attempt: attempt.lastAttempt, error: errorText(error) });
    if (!permanent && !attempt.lastAttempt) throw error;
    if (facts.audioFound) {
      try {
        await writeAudioStatus(deps, companyId, { id: payload.audio_id, relatorioId: facts.relatorioId }, RUNNABLE, 'failed');
      } catch (writeError) {
        logError('audio failed status not written', { ...logFields(), error: errorText(writeError) });
      }
    }
    log('transcription failed', { ...logFields(), permanent });
  }
}
