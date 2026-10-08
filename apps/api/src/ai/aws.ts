import { PermanentReadingError, ProviderError, ProviderRefusedError, ProviderTimeoutError } from './errors.ts';

/*
 * Review 2026-10-08 (C4, AIR-17/API-1): the one classification of a failed AWS SDK call and the
 * one call timeout, shared by the Bedrock adapter (reading and audit) and the Textract OCR
 * provider. Before it each provider kept its own copy and they had drifted: Textract failed a
 * plate reading for good on a credential hiccup that Bedrock retried.
 *
 * - Refused (permanent, `ProviderRefusedError`): the caller's rights, the signature, the model
 *   id or the request shape are wrong, and any other client fault the SDK does not mark
 *   retryable. No retry fixes them; support looks at IAM and configuration.
 * - Transient (`ProviderError`): a credential fetch or refresh that failed (the ECS task role's
 *   endpoint, an expiring session the SDK renews), throttles and quotas, any server fault, a
 *   dropped connection, anything unknown. pg-boss tries again.
 * - A provider adds its own names through `rules`: input faults that are permanent but not a
 *   refusal (Textract's bad document) and client faults that are transient (Bedrock's model
 *   not ready).
 */

/** Refusals no retry fixes. */
const REFUSED_ERRORS: ReadonlySet<string> = new Set([
  'AccessDeniedException',
  'UnrecognizedClientException',
  'InvalidSignatureException',
  'ValidationException',
  'ResourceNotFoundException',
]);

/** Client-side names that pass on a later attempt: credentials being fetched or renewed, throttles and quotas. */
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set([
  'CredentialsProviderError',
  'ExpiredTokenException',
  'ExpiredToken',
  'ThrottlingException',
  'TooManyRequestsException',
  'ServiceQuotaExceededException',
  'ProvisionedThroughputExceededException',
  'LimitExceededException',
]);

export interface AwsErrorRules {
  /** Names that are permanent input faults of this service (not a refusal). */
  permanent?: ReadonlySet<string>;
  /** Names that are transient client faults of this service. */
  transient?: ReadonlySet<string>;
}

/** The error a failed AWS SDK call of `service` ("bedrock", "textract") becomes; the original is its `cause`. */
export function classifyAwsError(service: string, error: unknown, rules: AwsErrorRules = {}): Error {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  const text = `${service}: ${name}: ${message}`;
  const fault = (error as { $fault?: unknown } | null)?.$fault;
  const retryable = (error as { $retryable?: unknown } | null)?.$retryable;
  if (TRANSIENT_ERRORS.has(name) || rules.transient?.has(name)) return new ProviderError(text, { cause: error });
  if (rules.permanent?.has(name)) return new PermanentReadingError(text, { cause: error });
  if (REFUSED_ERRORS.has(name)) return new ProviderRefusedError(text, { cause: error });
  // Any other client fault (a signature mismatch, a new validation error) is a refusal too, unless the SDK marks it retryable.
  if (fault === 'client' && !retryable) return new ProviderRefusedError(text, { cause: error });
  return new ProviderError(text, { cause: error });
}

/**
 * Runs `call` with an abort signal that fires after `timeoutMs`: an aborted call fails with
 * `ProviderTimeoutError` ("<label>: no answer within <ms> ms", transient), any other failure
 * goes through `classify`. The timer is always cleared.
 */
export async function callWithTimeout<T>(label: string, timeoutMs: number, call: (signal: AbortSignal) => Promise<T>, classify: (error: unknown) => Error): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await call(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderTimeoutError(`${label}: no answer within ${timeoutMs} ms`);
    throw classify(error);
  } finally {
    clearTimeout(timer);
  }
}
