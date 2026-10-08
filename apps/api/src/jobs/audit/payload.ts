import { uuidV7Schema } from '@app/domain';
import { z } from 'zod';

/*
 * Story 13.8: the one job an audit tap sends to the `audit` queue. The run row exists before
 * the job is sent (the route creates it `queued`); the job only fills it.
 */

/** The actor of every op the audit writes (the run's create and its field puts). */
export const AUDIT_ACTOR = 'system:audit';

export const auditPayloadSchema = z.object({
  run_id: uuidV7Schema,
  company_id: uuidV7Schema,
  relatorio_id: uuidV7Schema,
  /** The user who tapped "Conferir antes de emitir"; logged, never written. */
  actor_id: z.string().min(1),
});
export type AuditPayload = z.infer<typeof auditPayloadSchema>;
