import {
  AUDIO_RETRANSCRIBE_PATH,
  audioPermissionPath,
  can,
  permissionForPath,
  type AudioRetranscribeResponse,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type NewId,
} from '@app/domain';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import { findFileRow } from '../db/repositories/files.ts';
import type { TranscriptionPayload } from '../jobs/transcription/payload.ts';
import { startTranscription } from '../jobs/transcription/status.ts';
import { type AppEnv, ForbiddenError, requireSession } from './session.ts';

/*
 * Story 31.2 (AD-30): `POST /api/audios/{id}/retranscribe` ("Tentar de novo") queues a `failed`
 * audio's transcription again: one new job and `audio_status = transcribing`. The company comes
 * from the session and scopes the lookup (AD-10), so another company's audio, an unknown id, a
 * malformed id and a row that is not an audio all answer the same `404`. It needs the key of the
 * audio's field (AD-29: the mic follows the field's own write permission), `403` otherwise. Only a
 * `failed` audio is queued again (`409 invalid_request` for any other status); one whose bytes the
 * server does not hold answers `409 not_caught_up`; with AI_FEATURES off, `409 ai_features_off`.
 */

export interface AudioRoutesDeps {
  now: Clock;
  newId: NewId;
  /** Sends the job; absent when the app runs without a queue (the route then answers 500). */
  enqueueTranscription?: (payload: TranscriptionPayload) => Promise<void>;
  /** `false` when `AI_FEATURES=off`. Absent reads as on. */
  aiFeatures?: boolean;
}

function fail(code: ErrorCode, message: string): ErrorResponse {
  return { code, message };
}

const notFound = fail('not_found', 'No such audio.');

export function createAudioRoutes(db: Db, deps: AudioRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post(AUDIO_RETRANSCRIBE_PATH, async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    const record = await findFileRow(db, session.companyId, id);
    if (record === null || record.row.kind !== 'audio') return c.json(notFound, 404);
    const audio = record.row;
    if (record.removedAt !== null || audio.removed_at !== null) return c.json(notFound, 404);
    const need = permissionForPath(audioPermissionPath(audio.audio_target), { kind: 'put', value: null });
    if (need !== 'none' && !can(session.role, need)) throw new ForbiddenError();
    if (audio.audio_status !== 'failed') return c.json(fail('invalid_request', 'Only an audio whose transcription failed is transcribed again.'), 409);
    if (audio.uploaded_at === null) return c.json(fail('not_caught_up', 'The audio has not been uploaded yet.'), 409);
    if (deps.aiFeatures === false) return c.json(fail('ai_features_off', 'AI features are off on this server.'), 409);
    const enqueue = deps.enqueueTranscription;
    if (enqueue === undefined) throw new Error('retranscribe: no transcription queue is wired');

    const outcome = await startTranscription({ db, now: deps.now, newId: deps.newId, enqueue }, session.companyId, { id, relatorioId: record.relatorioId }, ['failed']);
    if (outcome === 'send_failed') throw new Error('retranscribe: the transcription job was not sent');
    // `moved`: the job was sent and wrote its own status first (a fast run); the audio is on its way all the same.
    const answer: AudioRetranscribeResponse = { audio_id: id, audio_status: 'transcribing' };
    return c.json(answer, 202);
  });

  return routes;
}
