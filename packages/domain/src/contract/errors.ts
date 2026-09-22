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
