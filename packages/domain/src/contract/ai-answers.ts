import { z } from 'zod';
import { AI_WRITE_REFUSAL_ACTIONS } from '../ai-answers/schema.ts';
import { uuidV7Schema } from '../ids.ts';

/*
 * Story 32.1 (Matheus, 2026-11-27): `POST /api/relatorios/{id}/write-outcome`, the device's report of
 * an AI proposal it did not write (Story 31.10: "Manter o meu texto", or the field's text changed
 * while the AI wrote). Such a proposal writes no op, so the server learns the user's answer only from
 * this report; it settles the proposal's record `refused` with that action. `run_id` is the
 * `transcription_runs` row of the tap (the `run_id` of the AI control's answer).
 *
 * Answers: `204` once recorded (also when the record was already settled, which a report never
 * undoes); an unknown or another company's relatório, or a run that is no proposal of it,
 * `404 not_found`; a body that is not this shape `400 invalid_request`; a role without the key of the
 * field's own path `403 forbidden` (as the AI control's route); over the per-user limit
 * `429 rate_limited`. Additive: no contract version change.
 */
export const AI_WRITE_OUTCOME_PATH = '/api/relatorios/:id/write-outcome';

/** The report route of one relatório, as the device calls it. */
export function aiWriteOutcomePath(relatorioId: string): string {
  return AI_WRITE_OUTCOME_PATH.replace(':id', relatorioId);
}

export const aiWriteOutcomeRequestSchema = z.object({
  run_id: uuidV7Schema,
  outcome: z.literal('refused'),
  action: z.enum(AI_WRITE_REFUSAL_ACTIONS),
});
export type AiWriteOutcomeRequest = z.infer<typeof aiWriteOutcomeRequestSchema>;
