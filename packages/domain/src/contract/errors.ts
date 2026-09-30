import { z } from 'zod';

/*
 * AD-13: every failure body of /api/* is `{code, message, details?}` with a code
 * from this enum. The web maps `code` to its own pt-BR string; `message` is
 * English and for logs.
 */

/**
 * Per-op rejection codes of `POST /api/sync/ops` (AD-24): shape, path, origin, tenant, and
 * `op_forbidden` for a write to a row only its owner may write (another user's
 * `user/{id}/{field}`). Never a domain rule. Append-only.
 */
export const opRejectCodeSchema = z.enum([
  'op_invalid',
  'op_path_unknown',
  'op_server_only',
  'op_tenant_mismatch',
  'op_forbidden',
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
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Error envelope of every /api route (AD-13). */
export const errorResponseSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
