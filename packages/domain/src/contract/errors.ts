import { z } from 'zod';

/*
 * AD-13: every failure body of /api/* is `{code, message, details?}` with a code
 * from this enum. The web maps `code` to its own pt-BR string; `message` is
 * English and for logs.
 */

/**
 * Per-op rejection codes of `POST /api/sync/ops` (AD-24), append-only: shape, path, origin,
 * tenant, and `op_forbidden` for a write to a row only its owner may write (another user's
 * `user/{id}/{field}`).
 *
 * Contract 29 (2026-11-03, Stories 20.7 to 20.10, security pass S1 and S3 to S5): a refusal is
 * no longer only one of shape. The server also refuses a client op that breaks a business rule
 * the kernel holds, checked against what the server holds when the op applies, and each such
 * refusal refuses that op alone (the rest of its client batch applies):
 * - `op_status_transition`: a `relatorio/status` move AD-22's table does not allow from the
 *   server's status (`statusMoveVerdict`), or a `relatorio/{id}` create not born Rascunho;
 * - `op_attribution`: a value naming another actor than the op's, or an instant past the
 *   server's clock or before the relatório's creation, beyond the skew (`attributionIssue`);
 * - `op_value_invalid`: a value outside its field's type, length cap or range
 *   (`opValueIssue`), or a `responsible_user_id` that is no user of the company;
 * - `op_target_missing`: a put or remove whose row does not exist, or exists in another
 *   relatório or obra than the op names, and a create naming a relatório the company lacks;
 * - `op_forbidden` also refuses, alone, the removal of an Emitido relatório.
 */
export const opRejectCodeSchema = z.enum([
  'op_invalid',
  'op_path_unknown',
  'op_server_only',
  'op_tenant_mismatch',
  'op_forbidden',
  // Contract 29 (2026-11-03, Story 20.7): appended, never reordered.
  'op_status_transition',
  'op_attribution',
  'op_value_invalid',
  'op_target_missing',
]);
export type OpRejectCode = z.infer<typeof opRejectCodeSchema>;
export const OP_REJECT_CODES = opRejectCodeSchema.options;

export const errorCodeSchema = z.enum([
  'unauthenticated',
  'internal_error',
  'not_found',
  'registration_invalid',
  'user_not_found',
  'sync_batch_invalid',
  'contract_outdated',
  'relatorio_not_found',
  // AD-7 file routes: the create op has not been applied yet (retryable), the body's
  // hash is not the row's, the body is over the 25 MB limit, or the row's kind/mime pair
  // is not one this route stores.
  'file_row_missing',
  'file_sha_mismatch',
  'file_too_large',
  'file_kind_invalid',
  // Story 4.8 generate route: the body is not `{last_op_id, file_ids_expected}`, or the
  // server has not applied the op or stored a file the device says it should hold yet
  // (retryable after a sync, AD-15's flush barrier).
  'invalid_request',
  'not_caught_up',
  // Story 7.5: the issue route refuses while a pre-issue row is `blocking` ("Parecer não
  // preenchido"); `details.rows` names the blocking rows' kinds. Never retryable by a sync.
  'pre_issue_blocked',
  // E78-Q5: the reread route refuses while the photo's reading is `running` (one run at a time).
  'reading_running',
  // Story 11.8 follow-up: the server's AI_FEATURES flag is off and the photo's kind needs the LLM step.
  'ai_features_off',
  // Security review 2026-09-30 (E11-A5): a request body over the route's limit, and a
  // client over a request limit (sign-in attempts, pushes); `retry-after` says when to retry.
  'body_too_large',
  'rate_limited',
  ...opRejectCodeSchema.options,
  // Story 13.8 (contract 15): the audit route refuses while a run of the relatório is still
  // active (`details.audit_run_id` names it); one tap is at most one run.
  'audit_running',
  // Epic 18 (AD-28): `POST /api/telemetry` refuses the whole batch when the body is not an
  // array, holds more than `TELEMETRY_BATCH_MAX` events, or any event fails `uxEventSchema`.
  'telemetry_invalid',
  // Contract 29 (2026-11-03): reserved here for Story 20.12 (batch e20e implements it): a
  // company over its daily quota of paid readings, rereads or audits.
  'quota_exceeded',
  // Contract 29 (2026-11-03): reserved here for Story 20.13 (batch e20e implements it): a
  // mutating `/api` request from an origin the server does not trust.
  'forbidden_origin',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Error envelope of every /api route (AD-13). */
export const errorResponseSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
