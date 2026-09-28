import { uuidV7Schema } from '@app/domain';
import { z } from 'zod';

/*
 * Story 8.4: the payload of one `reading` job. It names its company under `company_id`, the
 * key `scripts/test-reset.ts` (`db/reset-company-jobs.ts`) clears a company's jobs by.
 */

export const readingKindSchema = z.enum(['plate', 'display', 'caption', 'panel', 'nc_obs']);
export type ReadingKind = z.infer<typeof readingKindSchema>;

export const readingPayloadSchema = z.object({
  company_id: uuidV7Schema,
  photo_id: uuidV7Schema,
  reading_kind: readingKindSchema,
});
export type ReadingPayload = z.infer<typeof readingPayloadSchema>;
