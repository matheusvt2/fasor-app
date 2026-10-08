import { z } from 'zod';
import { uuidV7Schema } from '../ids.ts';
import { generateRequestSchema } from './generate.ts';

/*
 * Story 13.8 (AI-3): `POST /api/relatorios/{id}/audit`, the one optional AI pass before
 * "Emitir". It sits behind the preview's flush barrier (the same body, the same
 * `409 not_caught_up`), creates one `audit_run` row and sends one job to the `audit` queue,
 * and answers `202 {audit_run_id}`. The device learns the outcome by pulling the relatório
 * stream (the run's `status` and `findings` puts). While a run of the relatório is still
 * active it answers `409 audit_running` with that run's id and sends nothing; with the
 * server's AI features off, `409 ai_features_off`; an unknown relatório, `404 not_found`.
 */

/** The route as the server mounts it. */
export const AUDIT_ROUTE_PATH = '/api/relatorios/:id/audit';

/** The route of one relatório, as the device calls it. */
export function auditRoute(relatorioId: string): { method: 'POST'; path: string } {
  return { method: 'POST', path: AUDIT_ROUTE_PATH.replace(':id', relatorioId) };
}

/** The request body: the preview's barrier fields (the device's newest op and the files it expects stored). */
export const auditRequestSchema = generateRequestSchema;
export type AuditRequest = z.infer<typeof auditRequestSchema>;

export const auditResponseSchema = z.object({ audit_run_id: uuidV7Schema });
export type AuditResponse = z.infer<typeof auditResponseSchema>;

/** `details` of a `409 audit_running`: the run still active. */
export const auditRunningDetailsSchema = z.object({ audit_run_id: uuidV7Schema });
export type AuditRunningDetails = z.infer<typeof auditRunningDetailsSchema>;
