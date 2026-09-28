import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';

/*
 * Story 8.4: `POST /api/photos/{id}/reread` reads an uploaded plate photo again (the
 * device's "Tentar novamente", wired by batch P). The server enqueues one reading job and
 * answers `202` with the photo's new status; the device learns the outcome by pulling
 * `file/{id}/reading_status` and the suggestion creates. Another company's photo answers
 * exactly as an unknown id (`404 not_found`); a photo that is not a plate reading answers
 * `400 invalid_request`; one whose bytes the server does not hold yet `409 not_caught_up`.
 */

/** The route as the server mounts it. */
export const READING_REREAD_PATH = '/api/photos/:id/reread';

/** The route of one photo, as the device calls it. */
export function readingRereadPath(photoId: string): string {
  return READING_REREAD_PATH.replace(':id', photoId);
}

export const readingRereadResponseSchema = z.object({
  photo_id: uuidV7Schema,
  reading_status: z.literal('running'),
});
export type ReadingRereadResponse = z.infer<typeof readingRereadResponseSchema>;
