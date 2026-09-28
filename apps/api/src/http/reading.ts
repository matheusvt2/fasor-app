import {
  fileRowSchema,
  READING_REREAD_PATH,
  uuidV7Schema,
  type Clock,
  type ErrorCode,
  type ErrorResponse,
  type NewId,
  type ReadingRereadResponse,
} from '@app/domain';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/client.ts';
import { entities } from '../db/schema.ts';
import { readingKindHandler } from '../jobs/reading/kinds/index.ts';
import type { ReadingPayload } from '../jobs/reading/payload.ts';
import { startReading } from '../jobs/reading/status.ts';
import { type AppEnv, requireSession } from './session.ts';

/*
 * Story 8.4: `POST /api/photos/{id}/reread` reads an uploaded reading photo again (Story 9.1:
 * any kind the job has a handler for, the plate and the display): one new
 * reading job and `reading_status = running` (from `done` or `failed`; E78-Q5: a photo still
 * `running` answers 409 `reading_running`, no job sent, no run); the job
 * then discards the photo's previous pending suggestions and emits the new run's. The company
 * comes from the session and scopes the lookup (AD-10), so another company's photo, an
 * unknown id, a malformed id and a row that is not a photo all answer the same `404`.
 */

export interface ReadingRoutesDeps {
  now: Clock;
  newId: NewId;
  /** Sends the job; absent when the app runs without a queue (the route then answers 500). */
  enqueueReading?: (payload: ReadingPayload) => Promise<void>;
}

function fail(code: ErrorCode, message: string): ErrorResponse {
  return { code, message };
}

const notFound = fail('not_found', 'No such photo.');

export function createReadingRoutes(db: Db, deps: ReadingRoutesDeps): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post(READING_REREAD_PATH, async (c) => {
    const session = requireSession(c);
    const id = c.req.param('id');
    if (!uuidV7Schema.safeParse(id).success) return c.json(notFound, 404);
    const [record] = await db
      .select({ row: entities.row, relatorio_id: entities.relatorio_id, removed_at: entities.removed_at })
      .from(entities)
      .where(and(eq(entities.company_id, session.companyId), eq(entities.entity, 'file'), eq(entities.id, id)))
      .limit(1);
    const parsed = record === undefined ? null : fileRowSchema.safeParse(record.row);
    if (record === undefined || parsed === null || !parsed.success || parsed.data.id !== id || parsed.data.kind !== 'photo') {
      return c.json(notFound, 404);
    }
    const photo = parsed.data;
    if (record.removed_at !== null || photo.removed_at !== null) return c.json(notFound, 404);
    // Only a kind the job reads is read again; another stays as the device queued it.
    const kind = photo.reading_kind;
    if (kind === null || readingKindHandler(kind) === undefined) return c.json(fail('invalid_request', 'This photo is not a reading the job reads.'), 400);
    if (photo.uploaded_at === null) return c.json(fail('not_caught_up', 'The photo has not been uploaded yet.'), 409);
    // E78-Q5: a reading already running is not started again (every further tap was one more run).
    if (photo.reading_status === 'running') return c.json(fail('reading_running', 'This photo is being read.'), 409);
    const enqueue = deps.enqueueReading;
    if (enqueue === undefined) throw new Error('reread: no reading queue is wired');

    await startReading(
      { db, now: deps.now, newId: deps.newId, enqueue },
      session.companyId,
      { id, relatorioId: record.relatorio_id },
      { company_id: session.companyId, photo_id: id, reading_kind: kind },
    );
    const answer: ReadingRereadResponse = { photo_id: id, reading_status: 'running' };
    return c.json(answer, 202);
  });

  return routes;
}
