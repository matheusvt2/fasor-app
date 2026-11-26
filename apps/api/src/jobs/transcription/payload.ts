import { uuidV7Schema } from '@app/domain';
import { z } from 'zod';

/*
 * Story 31.2: the payload of one `transcription` job. It names its company under `company_id`, the
 * key `scripts/test-reset.ts` (`db/reset-company-jobs.ts`) clears a company's jobs by.
 */

export const transcriptionPayloadSchema = z.object({
  company_id: uuidV7Schema,
  audio_id: uuidV7Schema,
});
export type TranscriptionPayload = z.infer<typeof transcriptionPayloadSchema>;
