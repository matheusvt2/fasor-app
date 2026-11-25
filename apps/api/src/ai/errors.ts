/*
 * Story 8.4: how a reading attempt fails. A permanent error ends the job at once (one
 * attempt, `reading_status = failed`); anything else is transient and pg-boss retries it
 * until the last attempt, which ends `failed` too. Since the review of 2026-10-08 (C4, API-3)
 * these classes are the AI provider base's, shared by the reading providers and the audit.
 */

/** A failure no retry can fix: the job records it and emits `failed` without retrying. */
export class PermanentReadingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentReadingError';
  }
}

/**
 * API-V2 (review 2026-10-08): a permanent failure because the provider refused the call: the
 * caller's rights, the credentials' signature, the model id or the request shape are wrong
 * (`AccessDeniedException`, `ValidationException`, ...). Support looks at IAM and configuration,
 * not at the prompt or the answer.
 */
export class ProviderRefusedError extends PermanentReadingError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderRefusedError';
  }
}

/** Story 30.2 B: one model call the provider billed: its model, its prompt version (null where the caller has none) and its usage. */
export interface BilledCall {
  model: string;
  prompt_version: string | null;
  usage: { input_tokens: number; output_tokens: number; usd: number };
}

/**
 * Story 30.2 B (L1284, L1290, L1310): a permanent failure after the provider answered and billed the call (an
 * answer without the tool call, a tool input the schema refuses). The call rides on the error, so the run row
 * still counts it. A throttle or a denial bills nothing and never throws this.
 */
export class BilledCallError extends PermanentReadingError {
  readonly billed: BilledCall;
  constructor(message: string, billed: BilledCall, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentReadingError';
    this.billed = billed;
  }
}

/** The billed call an error carries, or null. */
export function billedCallOf(error: unknown): BilledCall | null {
  return error instanceof BilledCallError ? error.billed : null;
}

/** `error` with `promptVersion` on the call it carries when that call has none; any other error as it is. */
export function withPromptVersion(error: unknown, promptVersion: string): unknown {
  if (!(error instanceof BilledCallError) || error.billed.prompt_version !== null) return error;
  return new BilledCallError(error.message, { ...error.billed, prompt_version: promptVersion }, { cause: error.cause });
}

/** Story 11.8 follow-up: the LLM step of a reading while the server's `AI_FEATURES` is `off`. */
export class AiFeaturesOffError extends PermanentReadingError {
  constructor() {
    super('the LLM step is disabled on this server (AI_FEATURES=off)');
    this.name = 'AiFeaturesOffError';
  }
}

/** A provider call that failed in a way a later attempt may not (a 5xx, a dropped connection, a fake `error`). */
export class ProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

/** A provider call that did not answer in time; transient. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}

export function isPermanentReadingError(error: unknown): boolean {
  return error instanceof PermanentReadingError;
}
